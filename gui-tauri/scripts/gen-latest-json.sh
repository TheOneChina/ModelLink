#!/usr/bin/env bash
# 从构建产物生成 latest.json（tauri-plugin-updater 的更新清单，仅 aarch64）。
# 前置：先跑过 scripts/build-mac.sh，产出 ModelLink.app.tar.gz(+.sig)。
# 更新说明：优先取 gui-tauri/RELEASE_NOTES.md，否则环境变量 NOTES，否则空串。
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])")"
BUNDLE="src-tauri/target/release/bundle/macos"
SIG_FILE="$BUNDLE/ModelLink.app.tar.gz.sig"
OUT="src-tauri/target/release/bundle/latest.json"

if [ ! -f "$SIG_FILE" ]; then
  echo "✗ 找不到 $SIG_FILE" >&2
  echo "  请先跑 bash scripts/build-mac.sh（且更新签名私钥就绪：~/.modellink-updater/modellink.key）" >&2
  exit 1
fi

NOTES_CONTENT=""
if [ -f RELEASE_NOTES.md ]; then
  NOTES_CONTENT="$(cat RELEASE_NOTES.md)"
else
  NOTES_CONTENT="${NOTES:-}"
fi

SIG="$(cat "$SIG_FILE")"
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
URL="https://github.com/Win-Hao/ModelLink/releases/download/v${VERSION}/ModelLink.app.tar.gz"

VERSION="$VERSION" NOTES_CONTENT="$NOTES_CONTENT" PUB_DATE="$PUB_DATE" SIG="$SIG" URL="$URL" \
python3 - "$OUT" <<'PY'
import json, os, sys
out = sys.argv[1]
data = {
    "version": os.environ["VERSION"],
    "notes": os.environ["NOTES_CONTENT"],
    "pub_date": os.environ["PUB_DATE"],
    "platforms": {
        "darwin-aarch64": {
            "signature": os.environ["SIG"],
            "url": os.environ["URL"],
        }
    },
}
with open(out, "w") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"✓ 已生成 {out} (version {data['version']})")
PY
