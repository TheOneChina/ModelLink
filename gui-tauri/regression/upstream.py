#!/usr/bin/env python3
"""假上游：记录每个请求的 method/path/headers/body 到 JSONL，返回固定响应。"""
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = sys.argv[1]
PORT = int(sys.argv[2])

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        body = self.rfile.read(n)
        # 只记录代理侧决定的头（顺序无关，转 dict 排序）；剔除逐跳头
        hdrs = {k.lower(): v for k, v in self.headers.items()
                if k.lower() not in ("host", "content-length", "accept", "accept-encoding", "connection")}
        rec = {"method": "POST", "path": self.path, "headers": dict(sorted(hdrs.items())),
               "body": json.loads(body) if body else None}
        with open(OUT, "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")
        resp = json.dumps({"id": "msg_test", "type": "message", "content": [{"type": "text", "text": "ok"}]}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("x-upstream-echo", "1")
        self.send_header("content-length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)
    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", PORT), H).serve_forever()
