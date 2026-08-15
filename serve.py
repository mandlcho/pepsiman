#!/usr/bin/env python3
"""Small zero-dependency development server for the browser port."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".bin": "application/octet-stream",
        ".cue": "application/octet-stream",
        ".wasm": "application/wasm",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    address = ("127.0.0.1", 8080)
    print(f"Pepsiman is ready at http://{address[0]}:{address[1]}")
    ThreadingHTTPServer(address, GameHandler).serve_forever()
