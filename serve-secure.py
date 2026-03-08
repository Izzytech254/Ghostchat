"""
serve-secure.py – HTTPS static server for Whispro live updates.

Serves web-client/dist/ over HTTPS on port 8082 using the self-signed dev cert.
HTTPS gives the Android WebView a secure context so WebCrypto (crypto.subtle)
works correctly.

Usage:
    python3 serve-secure.py
"""

import http.server
import ssl
import os

PORT = 8082
DIST_DIR = os.path.join(os.path.dirname(__file__), "web-client", "dist")
CERT = os.path.join(os.path.dirname(__file__), "dev.crt")
KEY = os.path.join(os.path.dirname(__file__), "dev.key")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def log_message(self, fmt, *args):
        print(f"[HTTPS:{PORT}] {fmt % args}")


httpd = http.server.HTTPServer(("0.0.0.0", PORT), Handler)

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(certfile=CERT, keyfile=KEY)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

print(f"HTTPS live-update server → https://192.168.1.170:{PORT}")
print(f"Serving: {DIST_DIR}")
httpd.serve_forever()
