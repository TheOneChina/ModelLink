#!/usr/bin/env bash
# 对当前 5678 上的代理发一组固定请求，输出保存到 $1 目录
set -euo pipefail
OUT="$1"
mkdir -p "$OUT"
B="http://127.0.0.1:5678"

# 1) /v1/models
curl -s "$B/v1/models" | python3 -m json.tool --sort-keys > "$OUT/models.json"

# 2) 槽位0（te="", to_1m=auto）
curl -s -o "$OUT/r1.body" -w "%{http_code}" -X POST "$B/v1/messages" \
  -H "content-type: application/json" -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-opus-latest","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}' > "$OUT/r1.status"

# 3) 槽位0 的 [1m] 变体
curl -s -o /dev/null -X POST "$B/v1/messages" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-opus-latest[1m]","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}'

# 4) 槽位1（te=off，带 output_config 应被移除）
curl -s -o /dev/null -X POST "$B/v1/messages" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-latest","max_tokens":5,"output_config":{"effort":"low"},"messages":[{"role":"user","content":"hi"}]}'

# 5) 槽位2（te=high）
curl -s -o /dev/null -X POST "$B/v1/messages" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-sonnet-20240229","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}'

# 6) 槽位3（te=max）+ 头透传（beta/x-api-key/user-agent/自定义 anthropic-version）
curl -s -o /dev/null -X POST "$B/v1/messages" \
  -H "content-type: application/json" -H "anthropic-version: 2024-10-22" \
  -H "anthropic-beta: context-1m-2025" -H "x-api-key: caller-key" -A "ClaudeDesktop/9.9" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}'

# 7) 未匹配模型 → fallback 第一个（含 [1m]）
curl -s -o /dev/null -X POST "$B/v1/messages" \
  -H "content-type: application/json" \
  -d '{"model":"claude-nonexistent-9[1m]","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}'

# 8) 其他路径 POST 透传（路径拼接行为）
curl -s -o /dev/null -X POST "$B/v1/complete" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-opus-latest","prompt":"x"}'

# 9) 非 POST 非 models → 404
curl -s -o "$OUT/notfound.body" -w "%{http_code}" "$B/whatever" > "$OUT/notfound.status"

# 10) 无 model 字段 → 无 target → 502 话术
curl -s -o "$OUT/nomodel.body" -w "%{http_code}" -X POST "$B/v1/messages" \
  -H "content-type: application/json" -d '{"max_tokens":5}' > "$OUT/nomodel.status"

sleep 0.3
echo "driven: $OUT"
