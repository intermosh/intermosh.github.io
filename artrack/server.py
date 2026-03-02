from flask import Flask, send_from_directory, jsonify
import os
from datetime import datetime

app = Flask(__name__)

PORT = 5500

MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
}

# COOP/COEP headers for SharedArrayBuffer support
ISOLATION_HEADERS = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
}

@app.after_request
def add_headers(response):
    for key, value in ISOLATION_HEADERS.items():
        response.headers[key] = value
    return response

@app.route('/test-headers')
def test_headers():
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] GET /test-headers")
    return jsonify({
        'message': 'Headers are being sent!',
        'headers': ISOLATION_HEADERS
    })

@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def serve_file(path):
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] GET /{path}")
    
    # Remove query strings
    path = path.split('?')[0]
    
    file_path = os.path.join(os.getcwd(), path)
    
    if not os.path.exists(file_path):
        print(f"  → 404 Not Found: {file_path}")
        return "File not found", 404
    
    ext = os.path.splitext(path)[1]
    content_type = MIME_TYPES.get(ext, 'application/octet-stream')
    
    print(f"  → 200 OK ({content_type})")
    print(f"  → COOP: {ISOLATION_HEADERS['Cross-Origin-Opener-Policy']}")
    print(f"  → COEP: {ISOLATION_HEADERS['Cross-Origin-Embedder-Policy']}")
    
    return send_from_directory(os.getcwd(), path, mimetype=content_type)

if __name__ == '__main__':
    print("""
╔═══════════════════════════════════════════════════════════════╗
║         GESTURE SYNTHESIZER SERVER                            ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Server running at: http://127.0.0.1:{PORT}                    ║
║                                                               ║
║  Headers being sent:                                          ║
║  ✓ Cross-Origin-Opener-Policy: same-origin                    ║
║  ✓ Cross-Origin-Embedder-Policy: credentialless               ║
║                                                               ║
║  IMPORTANT:                                                   ║
║  1. Use http://127.0.0.1:{PORT} (not localhost)                ║
║  2. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)        ║
║  3. Or try incognito/private browsing mode                    ║
║                                                               ║
║  Test headers: http://127.0.0.1:{PORT}/test-headers            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    """.format(PORT=PORT))
    app.run(host='127.0.0.1', port=PORT, debug=False)