#!/usr/bin/env python3
"""Serve only the public prototype files, on loopback by default."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent
PUBLIC = {'/index.html': 'text/html; charset=utf-8', '/app.js': 'text/javascript; charset=utf-8',
          '/engine.js': 'text/javascript; charset=utf-8', '/save.js': 'text/javascript; charset=utf-8',
          '/style.css': 'text/css; charset=utf-8',
          '/standalone.html': 'text/html; charset=utf-8',
          '/casebook-standalone.html': 'text/html; charset=utf-8'}

def public_file(path):
    clean = unquote(urlsplit(path).path)
    if clean == '/': clean = '/index.html'
    if clean not in PUBLIC: return None
    return ROOT / clean[1:], PUBLIC[clean]

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        found = public_file(self.path)
        if not found:
            self.send_error(404); return
        path, mime = found
        try: body = path.read_bytes()
        except OSError:
            self.send_error(404); return
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        script_policy = "'self' 'unsafe-inline'" if path.name in {'index.html', 'standalone.html', 'casebook-standalone.html'} else "'self'"
        self.send_header('Content-Security-Policy', f"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src {script_policy}; connect-src 'none'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers(); self.wfile.write(body)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    with HTTPServer(('127.0.0.1',args.port),Handler) as server:
        print(f'Island preview: http://127.0.0.1:{server.server_port} (loopback only)',flush=True)
        server.serve_forever()

if __name__=='__main__': main()
