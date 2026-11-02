#!/usr/bin/env python3
"""Simple HTTP server with correct MIME types for JSON files."""

import http.server
import socketserver
import os

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Disable caching
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def guess_type(self, path):
        """Override to ensure .json files get correct MIME type."""
        mimetype = super().guess_type(path)
        if path.endswith('.json'):
            return 'application/json'
        return mimetype

os.chdir('dist')

with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print(f"✓ Server running at http://localhost:{PORT}")
    print(f"✓ Serving directory: {os.getcwd()}")
    print("✓ JSON files will be served with correct MIME type")
    print("\nPress Ctrl+C to stop\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n✓ Server stopped")
