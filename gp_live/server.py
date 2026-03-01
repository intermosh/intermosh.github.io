import http.server
import socketserver
import os

# Port to listen on
PORT = 8000

class VJServerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        """
        Add the headers required to enable SharedArrayBuffer (COOP/COEP).
        These allow the browser to isolate the execution environment safely.
        """
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        
        # Also helpful for development/testing
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        
        super().end_headers()

def run_server():
    # Ensure we are serving from the directory where the script is located
    # os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), VJServerHandler) as httpd:
        print(f"--- VJ LIVE TERMINAL SERVER ---")
        print(f"Location: http://localhost:{PORT}")
        print(f"Status: COOP/COEP Headers Active (SharedArrayBuffer Enabled)")
        print(f"Action: Open index.html in your browser via this URL.")
        print(f"Press CTRL+C to stop.")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            httpd.server_close()

if __name__ == "__main__":
    run_server()