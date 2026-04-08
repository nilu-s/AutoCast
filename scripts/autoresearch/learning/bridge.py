#!/usr/bin/env python3
"""
HTTP/API Bridge for Python Learning Engine
Provides Flask-based REST API for Node.js integration
"""

import json
import sys
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from learning_db import LearningDB, Run, MethodRun, Method
from analytics import MethodAnalytics

# Default DB path
DB_PATH = os.environ.get('LEARNING_DB_PATH', 'method_results/learning.db')

class LearningAPIHandler(BaseHTTPRequestHandler):
    db = None
    analytics = None
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass
    
    def _init_db(self):
        """Lazy initialize DB connection"""
        if self.db is None:
            self.db = LearningDB(DB_PATH)
            self.analytics = MethodAnalytics(self.db)
    
    def _send_json(self, data, status=200):
        """Send JSON response"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def _send_error(self, message, status=400):
        """Send error response"""
        self._send_json({"error": message}, status)
    
    def do_GET(self):
        """Handle GET requests"""
        self._init_db()
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        
        try:
            if path == '/health':
                self._send_json({"status": "ok", "db_path": DB_PATH})
            
            elif path == '/methods/top':
                limit = int(params.get('limit', ['10'])[0])
                result = self.db.get_top_methods(limit)
                self._send_json({"methods": result})
            
            elif path == '/methods/success_rate':
                method_id = params.get('method_id', [''])[0]
                time_window = int(params.get('time_window', ['30'])[0])
                if not method_id:
                    self._send_error("method_id required")
                    return
                result = self.db.get_success_rate(method_id, time_window)
                self._send_json({"method_id": method_id, "success_rate": result})
            
            elif path == '/methods/predict':
                method_id = params.get('method_id', [''])[0]
                if not method_id:
                    self._send_error("method_id required")
                    return
                success_rate, category = self.analytics.predict_success(method_id)
                self._send_json({
                    "method_id": method_id,
                    "predicted_success_rate": success_rate,
                    "category": category
                })
            
            elif path == '/methods/clusters':
                n_clusters = int(params.get('n_clusters', ['5'])[0])
                result = self.analytics.cluster_methods(n_clusters)
                self._send_json({"clusters": result})
            
            elif path == '/methods/similar':
                method_id = params.get('method_id', [''])[0]
                n = int(params.get('n', ['5'])[0])
                if not method_id:
                    self._send_error("method_id required")
                    return
                result = self.db.get_similar_methods(method_id, n)
                self._send_json({"method_id": method_id, "similar": result})
            
            else:
                self._send_error("Not found", 404)
        
        except Exception as e:
            self._send_error(str(e), 500)
    
    def do_POST(self):
        """Handle POST requests"""
        self._init_db()
        parsed = urlparse(self.path)
        path = parsed.path
        
        # Read body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode() if content_length else '{}'
        
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._send_error("Invalid JSON")
            return
        
        try:
            if path == '/runs':
                run = Run(
                    run_id=data['run_id'],
                    timestamp=data['timestamp'],
                    baseline_score=data.get('baseline_score'),
                    final_score=data.get('final_score'),
                    status=data['status']
                )
                self.db.record_run(run)
                self._send_json({"status": "ok", "run_id": run.run_id})
            
            elif path == '/method_runs':
                method_run = MethodRun(
                    method_id=data['method_id'],
                    run_id=data['run_id'],
                    decision=data.get('decision'),
                    improvement=data.get('improvement'),
                    duration_ms=data.get('duration_ms')
                )
                self.db.record_method_run(method_run)
                self._send_json({"status": "ok"})
            
            elif path == '/methods/add':
                method = Method(
                    method_id=data['method_id'],
                    name=data['name'],
                    description=data.get('description', ''),
                    tags=data.get('tags', [])
                )
                self.db.add_method(method)
                self._send_json({"status": "ok", "method_id": method.method_id})
            
            else:
                self._send_error("Not found", 404)
        
        except KeyError as e:
            self._send_error(f"Missing field: {e}", 400)
        except Exception as e:
            self._send_error(str(e), 500)
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


def run_server(port=8765):
    """Start the HTTP server"""
    server = HTTPServer(('localhost', port), LearningAPIHandler)
    print(f"Learning Engine API running on http://localhost:{port}")
    server.serve_forever()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    run_server(port)
