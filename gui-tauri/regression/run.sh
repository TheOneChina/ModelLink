#!/usr/bin/env bash
# 新旧代理逐字节等价回归（docs/gui-rebuild-tauri.md §9/§10 的抓包对比项）。
#
# 原理：temp HOME 隔离真实配置 → 假上游（upstream.py）捕获代理转发的
# method/path/headers/body → 对新旧两个二进制发同一组请求（drive.sh）→ 逐项 diff。
# 覆盖：/v1/models 格式、4 种 thinking 态注入、[1m] 变体、fallback、头透传、
# 路径拼接、404/502 话术、Claude-3p 网关写入、LaunchAgent 迁移。
#
# 用法：OLD_BIN=<v1 可执行> NEW_BIN=<v2 可执行> bash regression/run.sh
#   v1 二进制取自仓库根 ModelLink-macOS.zip（或 GitHub v1.2.0 release）：
#     unzip -o ModelLink-macOS.zip -d /tmp/mlv1 && xattr -cr /tmp/mlv1
#     OLD_BIN=/tmp/mlv1/ModelLink.app/Contents/MacOS/modellink
#   （带 com.apple.quarantine 的裸二进制会被 Gatekeeper 静默击杀，xattr -c 必做）
set -euo pipefail
EQ="$(mktemp -d /tmp/modellink-equiv.XXXXXX)"
HERE="$(cd "$(dirname "$0")" && pwd)"
OLD_BIN="${OLD_BIN:?set OLD_BIN to the v1 binary}"
NEW_BIN="${NEW_BIN:?set NEW_BIN to the v2 binary}"

mk_home() {
  rm -rf "$1"; mkdir -p "$1/.claude-model-proxy" "$1/Library/LaunchAgents"
  cat > "$1/.claude-model-proxy/config.json" <<'EOF'
{
  "providers": [
    {"target_url": "http://127.0.0.1:9999", "api_key": "test-key", "models": [{"name": "real-a", "to_1m": "auto"}], "thinking_effort": ""},
    {"target_url": "http://127.0.0.1:9999/sub", "api_key": "test-key-2", "models": [{"name": "real-b", "to_1m": ""}], "thinking_effort": "off"},
    {"target_url": "http://127.0.0.1:9999", "api_key": "test-key-3", "models": [{"name": "real-c", "to_1m": ""}], "thinking_effort": "high"},
    {"target_url": "http://127.0.0.1:9999", "api_key": "test-key-4", "models": [{"name": "real-d", "to_1m": "auto"}], "thinking_effort": "max"}
  ]
}
EOF
}

wait_port() {
  for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:5678/v1/models" && return 0; sleep 0.25; done
  echo "proxy not ready" >&2; return 1
}

run_one() { # $1=label $2=binary $3=home
  local label="$1" bin="$2" home="$3"
  rm -f "$EQ/cap-$label.jsonl"
  python3 "$HERE/upstream.py" "$EQ/cap-$label.jsonl" 9999 & local up=$!
  sleep 0.5
  HOME="$home" "$bin" >/dev/null 2>"$EQ/app-$label.log" & local app=$!
  wait_port
  bash "$HERE/drive.sh" "$EQ/out-$label" >/dev/null
  kill "$app" 2>/dev/null; wait "$app" 2>/dev/null || true
  kill "$up" 2>/dev/null; wait "$up" 2>/dev/null || true
  sleep 0.5
}

# 防呆：5678/9999 必须空闲（正在跑的 ModelLink 会让 wait_port 等到错误对象）
for p in 5678 9999; do
  if lsof -nP -i ":$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "✗ 端口 $p 被占用（先退出正在运行的 ModelLink / 其他占用者再跑）" >&2
    exit 1
  fi
done

mk_home "$EQ/home-old"
mk_home "$EQ/home-new"
# 在新版 home 里种一个旧 LaunchAgent，验证迁移（红线 #5）
printf 'fake-v1-plist' > "$EQ/home-new/Library/LaunchAgents/com.modellink.plist"

echo "=== run OLD ($OLD_BIN) ==="
run_one old "$OLD_BIN" "$EQ/home-old"
echo "=== run NEW ($NEW_BIN) ==="
run_one new "$NEW_BIN" "$EQ/home-new"

fail=0
echo
echo "=== DIFF 上游捕获（转发字节等价核心） ==="
[ -s "$EQ/cap-old.jsonl" ] || { echo "✗ 老版捕获为空"; fail=1; }
if diff "$EQ/cap-old.jsonl" "$EQ/cap-new.jsonl"; then echo "✓ 上游捕获逐字节一致 ($(wc -l < "$EQ/cap-old.jsonl") 条)"; else fail=1; fi
echo "=== DIFF /v1/models ==="
if diff "$EQ/out-old/models.json" "$EQ/out-new/models.json"; then echo "✓ /v1/models 一致"; else fail=1; fi
echo "=== DIFF 响应（状态码/透传体/404/502 话术） ==="
for f in r1.status r1.body notfound.status notfound.body nomodel.status nomodel.body; do
  if diff "$EQ/out-old/$f" "$EQ/out-new/$f" >/dev/null; then echo "✓ $f"; else echo "✗ $f"; fail=1; fi
done
echo "=== 网关写入对比（Claude-3p，红线 #3；labelOverride 为 2026-07-14 拍板例外） ==="
if python3 - "$EQ" <<'PY'
import json, sys, pathlib
eq = pathlib.Path(sys.argv[1])
base = "Library/Application Support/Claude-3p"
fails = 0
cases = [
    ("configLibrary/a0a0a0a0-b1b1-4c2c-9d3d-e4e4e4e4e4e4.json", True),
    ("configLibrary/_meta.json", False),
    ("claude_desktop_config.json", False),
]
for rel, allow_label in cases:
    o = json.load(open(eq / "home-old" / base / rel))
    n = json.load(open(eq / "home-new" / base / rel))
    if allow_label:
        for m in n.get("inferenceModels", []):
            if m.pop("labelOverride", None) is None:
                print(f"✗ {rel}: 新版条目缺 labelOverride"); fails += 1
    if o == n:
        print(f"✓ {rel}" + ("（剔除 labelOverride 后与 v1 一致）" if allow_label else ""))
    else:
        print(f"✗ {rel} 结构不一致"); fails += 1
sys.exit(1 if fails else 0)
PY
then :; else fail=1; fi
echo "=== LaunchAgent 迁移（红线 #5） ==="
if [ -f "$EQ/home-new/Library/LaunchAgents/com.modellink.plist" ]; then echo "✗ 旧 plist 未删除"; fail=1; else echo "✓ 旧 com.modellink.plist 已删除"; fi
ls "$EQ/home-new/Library/LaunchAgents/" 2>/dev/null | sed 's/^/  新注册: /'

echo
[ "$fail" -eq 0 ] && echo "ALL GREEN ✓ ($EQ)" || { echo "FAILURES ✗ ($EQ)"; exit 1; }
