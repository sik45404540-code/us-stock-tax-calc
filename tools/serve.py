#!/usr/bin/env python3
"""로컬 미리보기 서버 — Cloudflare Pages의 깔끔한 URL 동작을 흉내 낸다.

    /dividend  → dividend.html
    /          → index.html
    /assets/... → 그대로

사용법: python3 tools/serve.py [port]
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class PrettyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        local = super().translate_path(path)
        if not os.path.exists(local):
            clean = path.split("?", 1)[0].split("#", 1)[0]
            if not os.path.splitext(clean)[1]:
                candidate = local.rstrip("/") + ".html"
                if os.path.exists(candidate):
                    return candidate
        return local

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    print(f"TaxMoa preview: http://127.0.0.1:{port}/  (root={ROOT})")
    ThreadingHTTPServer(("127.0.0.1", port), PrettyHandler).serve_forever()
