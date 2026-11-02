#!/usr/bin/env python3
"""Simple Flask server to serve the frontend and jobs data"""
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
import json
import os

app = Flask(__name__, static_folder='dist', static_url_path='')
CORS(app)

# Load jobs data
with open('public/jobs.json', 'r', encoding='utf-8') as f:
    jobs_data = json.load(f)

@app.route('/')
def index():
    return send_from_directory('dist', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    # Serve any file from dist folder
    if os.path.exists(os.path.join('dist', path)):
        return send_from_directory('dist', path)
    # If not found, serve index.html (for SPA routing)
    return send_from_directory('dist', 'index.html')

@app.route('/jobs.json')
def jobs_json():
    return jsonify(jobs_data)

@app.route('/api/jobs')
def api_jobs():
    return jsonify(jobs_data)

@app.route('/api/tasks')
def api_tasks():
    # Return empty tasks for now
    return jsonify([])

@app.route('/api/members')
def api_members():
    # Return empty members for now
    return jsonify([])

if __name__ == '__main__':
    print(f"✓ Loaded {len(jobs_data)} jobs from Azure")
    print("🚀 Server starting on http://localhost:5173")
    app.run(host='localhost', port=5173, debug=False)
