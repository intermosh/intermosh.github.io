#!/usr/bin/env python3
"""
SYNTH VISUAL TERMINAL — Development Server
Serves files with COOP/COEP headers required for SharedArrayBuffer.

Usage:
    python server.py [port]
    Default port: 8080
    
Open http://localhost:8080 in your browser after starting.
"""

import http.server
import sys
import os

class COEPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that injects Cross-Origin isolation headers."""

    def end_headers(self):
        # Required for SharedArrayBuffer
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # Prevent caching during development
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        msg = format % args
        status = args[1] if len(args) > 1 else ""
        color = "\033[32m" if "200" in str(status) else "\033[33m"
        print(f"  {color}▸\033[0m {self.log_date_time_string()} — {msg}")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    directory = os.path.dirname(os.path.abspath(__file__)) or "."
    os.chdir(directory)

    server = http.server.HTTPServer(("", port), COEPRequestHandler)

    print(f"""
\033[90m╔════════════════════════════════════════════════════╗
║\033[0m  \033[1m◉ SYNTH VISUAL TERMINAL\033[0m — Dev Server              \033[90m║
╠════════════════════════════════════════════════════╣
║\033[0m  URL  : \033[4mhttp://localhost:{port}\033[0m{' ' * (33 - len(str(port)))}\033[90m║
║\033[0m  Dir  : {directory[:40]:<40s}  \033[90m║
╠════════════════════════════════════════════════════╣
║\033[0m  \033[32m■\033[0m Cross-Origin-Opener-Policy  : same-origin      \033[90m║
║\033[0m  \033[32m■\033[0m Cross-Origin-Embedder-Policy: require-corp     \033[90m║
║\033[0m  \033[32m■\033[0m SharedArrayBuffer           : ENABLED          \033[90m║
╠════════════════════════════════════════════════════╣
║\033[0m  Press Ctrl+C to stop                               \033[90m║
╚════════════════════════════════════════════════════╝\033[0m
""")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\033[90m  Server stopped.\033[0m")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
