#!/usr/bin/env python3
"""
Claude Desktop 第三方模型代理（带可视化管理界面）

用法:
  python3 proxy.py
  浏览器打开 http://127.0.0.1:5678 进行配置
"""

import json, os, http.client, ssl
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = 5678
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "proxy_config.json")

DEFAULT_CONFIG = {
    "target_url": "https://api.kimi.com/coding/",
    "api_key": "",
    "model_map": [
        {"from": "claude-opus-4-7", "to": "kimi-k2.5", "label": "Opus -> kimi-k2.5"},
        {"from": "claude-sonnet-4-6", "to": "kimi-k2.5", "label": "Sonnet -> kimi-k2.5"},
        {"from": "claude-haiku-4-5", "to": "kimi-k2.5", "label": "Haiku -> kimi-k2.5"},
    ]
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return DEFAULT_CONFIG.copy()

def save_config(cfg):
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

config = load_config()

HTML_PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude Desktop Model Proxy</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
       background: #1a1a2e; color: #e0e0e0; min-height: 100vh; padding: 20px; }
.container { max-width: 700px; margin: 0 auto; }
h1 { font-size: 22px; margin-bottom: 6px; color: #fff; }
.subtitle { color: #888; font-size: 13px; margin-bottom: 24px; }
.card { background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 16px;
        border: 1px solid #0f3460; }
.card h2 { font-size: 15px; color: #a8b2d1; margin-bottom: 14px; }
label { display: block; font-size: 13px; color: #8892b0; margin-bottom: 4px; }
input[type=text], input[type=password] {
    width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #0f3460;
    background: #0a0a23; color: #e0e0e0; font-size: 14px; margin-bottom: 12px;
    outline: none; transition: border-color 0.2s; }
input:focus { border-color: #e94560; }
.row { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.row input { margin-bottom: 0; }
.arrow { color: #e94560; font-size: 18px; flex-shrink: 0; }
.btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
       font-size: 13px; transition: all 0.2s; }
.btn-primary { background: #e94560; color: #fff; }
.btn-primary:hover { background: #c73e54; }
.btn-add { background: #0f3460; color: #a8b2d1; width: 100%; padding: 10px; margin-top: 4px; }
.btn-add:hover { background: #1a4a7a; }
.btn-del { background: none; color: #e94560; font-size: 18px; padding: 4px 8px; }
.btn-del:hover { color: #ff6b81; }
.status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px;
          margin-left: 12px; }
.status-on { background: #0a3d2a; color: #4ecca3; }
.toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
         background: #4ecca3; color: #1a1a2e; padding: 10px 24px; border-radius: 8px;
         font-size: 14px; display: none; z-index: 100; }
.footer { text-align: center; color: #555; font-size: 12px; margin-top: 20px; }
.tip { background: #0a0a23; border-left: 3px solid #e94560; padding: 12px 16px;
       border-radius: 0 8px 8px 0; margin-bottom: 16px; font-size: 13px; color: #8892b0; }
.tip code { background: #16213e; padding: 2px 6px; border-radius: 4px; color: #e94560; font-size: 12px; }
</style>
</head>
<body>
<div class="container">
  <h1>Claude Desktop Model Proxy <span class="status status-on">Running</span></h1>
  <p class="subtitle">Claude Desktop Gateway URL: <code style="color:#e94560">http://127.0.0.1:""" + str(PORT) + """</code></p>

  <div class="tip">
    Claude Desktop 的 inferenceModels 里填左边的 Anthropic 模型名（通过校验），
    代理会自动替换为右边的真实模型名发给 API。
  </div>

  <div class="card">
    <h2>API Settings</h2>
    <label>API Base URL</label>
    <input type="text" id="target_url" placeholder="https://api.deepseek.com/anthropic">
    <label>API Key</label>
    <div style="position:relative">
      <input type="password" id="api_key" placeholder="sk-xxx">
      <span onclick="toggleKey()" style="position:absolute;right:12px;top:10px;cursor:pointer;color:#888;font-size:13px">show</span>
    </div>
  </div>

  <div class="card">
    <h2>Model Mapping</h2>
    <div id="mappings"></div>
    <button class="btn btn-add" onclick="addRow()">+ Add Mapping</button>
  </div>

  <button class="btn btn-primary" style="width:100%;padding:12px;font-size:15px" onclick="saveConfig()">
    Save
  </button>

  <div class="footer">Proxy Port: """ + str(PORT) + """ &middot; Config: proxy_config.json</div>
</div>

<div class="toast" id="toast">Saved!</div>

<script>
let cfg = {};

async function loadConfig() {
  const r = await fetch('/api/config');
  cfg = await r.json();
  document.getElementById('target_url').value = cfg.target_url || '';
  document.getElementById('api_key').value = cfg.api_key || '';
  renderMappings();
}

function renderMappings() {
  const el = document.getElementById('mappings');
  el.innerHTML = '';
  (cfg.model_map || []).forEach((m, i) => {
    el.innerHTML += `<div class="row">
      <input type="text" value="${m.from}" onchange="cfg.model_map[${i}].from=this.value" style="flex:1" placeholder="claude-sonnet-4-6">
      <span class="arrow">&rarr;</span>
      <input type="text" value="${m.to}" onchange="cfg.model_map[${i}].to=this.value" style="flex:1" placeholder="deepseek-v4-pro">
      <button class="btn btn-del" onclick="delRow(${i})">&times;</button>
    </div>`;
  });
}

function addRow() {
  cfg.model_map = cfg.model_map || [];
  cfg.model_map.push({from: '', to: ''});
  renderMappings();
}

function delRow(i) {
  cfg.model_map.splice(i, 1);
  renderMappings();
}

async function saveConfig() {
  cfg.target_url = document.getElementById('target_url').value;
  cfg.api_key = document.getElementById('api_key').value;
  const r = await fetch('/api/config', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(cfg)
  });
  if (r.ok) {
    const t = document.getElementById('toast');
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 2000);
  }
}

function toggleKey() {
  const el = document.getElementById('api_key');
  el.type = el.type === 'password' ? 'text' : 'password';
}

loadConfig();
</script>
</body>
</html>"""

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/config":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            safe = {**config, "api_key": config.get("api_key", "")}
            self.wfile.write(json.dumps(safe).encode())
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_PAGE.encode())

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))

        if self.path == "/api/config":
            global config
            config = json.loads(body)
            save_config(config)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            print(f"[config] saved: target={config['target_url']}, mappings={len(config.get('model_map',[]))}")
            return

        data = json.loads(body)
        old_model = data.get("model", "")
        for m in config.get("model_map", []):
            if m["from"] and m["from"] in old_model:
                data["model"] = old_model.replace(m["from"], m["to"])
                break
        print(f"  model: {old_model} -> {data['model']}")

        target = config.get("target_url", "")
        api_key = config.get("api_key", "")
        parsed = urlparse(target)
        path = parsed.path.rstrip("/") + self.path

        hdrs = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "anthropic-version": self.headers.get("anthropic-version", "2023-06-01"),
        }
        for h in ("anthropic-beta", "x-api-key"):
            if self.headers.get(h):
                hdrs[h] = self.headers[h]

        ctx = ssl.create_default_context()
        conn = http.client.HTTPSConnection(parsed.hostname, context=ctx)
        conn.request("POST", path, json.dumps(data).encode(), hdrs)
        resp = conn.getresponse()

        self.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() not in ("transfer-encoding", "connection"):
                self.send_header(k, v)
        self.end_headers()

        while True:
            try:
                chunk = resp.read(4096)
            except Exception:
                break
            if not chunk:
                break
            self.wfile.write(chunk)
            self.wfile.flush()
        conn.close()

    def log_message(self, fmt, *args):
        print(f"[proxy] {fmt % args}")

if __name__ == "__main__":
    save_config(config)
    print(f"proxy running: http://127.0.0.1:{PORT}")
    print(f"management UI: http://127.0.0.1:{PORT}")
    print(f"target: {config['target_url']}")
    print()
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
