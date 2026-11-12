"""Local development server.

Run:   python serve.py
Open:  http://localhost:8765

Differs from "python -m http.server" in two ways:
- tells the browser never to cache, so every reload runs your latest code
- only answers on this computer (127.0.0.1), not to others on the network
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8765


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


# Serve the folder this file is in, no matter where the command is run from
handler = partial(NoCacheHandler, directory=Path(__file__).parent)

print(f"Serving on http://localhost:{PORT}  (Ctrl+C to stop)")
ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
