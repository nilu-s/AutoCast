#!/usr/bin/env python3
"""Tests for ChromaDB Bridge HTTP API Server.

Provides comprehensive tests for all bridge endpoints including
health checks, success rates, similar methods, and record operations.

Example:
    $ python -m pytest learning/tests/test_bridge.py -v
    $ python learning/tests/test_bridge.py
"""

import json
import threading
import time
import unittest
from http.client import HTTPConnection
from typing import Any, Dict, List, Optional

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from learning.bridge import start_server, DEFAULT_PORT


class TestChromaBridge(unittest.TestCase):
    """Test suite for ChromaDB Bridge HTTP API."""

    @classmethod
    def setUpClass(cls) -> None:
        """Start the bridge server before all tests."""
        cls.server_thread = None
        cls.server_started = False
        
        # Use a test port
        cls.test_port = DEFAULT_PORT + 1
        
        # Start server in background thread
        cls.server_thread = threading.Thread(
            target=start_server,
            args=(cls.test_port,),
            daemon=True
        )
        cls.server_thread.start()
        
        # Wait for server to start
        time.sleep(1)
        cls.server_started = True

    def setUp(self) -> None:
        """Set up test client."""
        self.conn = HTTPConnection('localhost', self.test_port, timeout=10)

    def tearDown(self) -> None:
        """Clean up test client."""
        self.conn.close()

    def _request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None
    ) -> tuple:
        """Make an HTTP request and return response.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: Request path
            data: Optional JSON data for POST requests

        Returns:
            Tuple of (status_code, response_data)
        """
        headers = {'Content-Type': 'application/json'}
        
        if data:
            body = json.dumps(data).encode('utf-8')
            self.conn.request(method, path, body, headers)
        else:
            self.conn.request(method, path)
        
        response = self.conn.getresponse()
        body = response.read().decode('utf-8')
        
        try:
            response_data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            response_data = {'raw': body}
        
        return response.status, response_data

    def test_health_endpoint(self) -> None:
        """Test GET /health endpoint."""
        status, data = self._request('GET', '/health')
        
        self.assertEqual(status, 200)
        self.assertEqual(data.get('status'), 'ok')
        self.assertIn('persist_dir', data)
        self.assertIn('port', data)

    def test_success_rate_missing_method_id(self) -> None:
        """Test GET /success-rate without method_id."""
        status, data = self._request('GET', '/success-rate')
        
        self.assertEqual(status, 400)
        self.assertIn('error', data)
        self.assertIn('method_id', data.get('error', '').lower())

    def test_success_rate_with_method_id(self) -> None:
        """Test GET /success-rate with method_id."""
        status, data = self._request('GET', '/success-rate?method_id=test_method')
        
        self.assertEqual(status, 200)
        self.assertEqual(data.get('method_id'), 'test_method')
        self.assertIn('success_rate', data)
        self.assertIn('attempts', data)
        self.assertIn('found', data)

    def test_top_methods_default(self) -> None:
        """Test GET /top-methods with default parameters."""
        status, data = self._request('GET', '/top-methods')
        
        self.assertEqual(status, 200)
        self.assertIn('methods', data)
        self.assertIsInstance(data['methods'], list)

    def test_top_methods_with_limit(self) -> None:
        """Test GET /top-methods with limit parameter."""
        status, data = self._request('GET', '/top-methods?limit=5')
        
        self.assertEqual(status, 200)
        self.assertIn('methods', data)
        self.assertIsInstance(data['methods'], list)

    def test_top_methods_with_category(self) -> None:
        """Test GET /top-methods with category filter."""
        status, data = self._request('GET', '/top-methods?category=vad')
        
        self.assertEqual(status, 200)
        self.assertIn('methods', data)

    def test_similar_methods_missing_method_id(self) -> None:
        """Test GET /similar-methods without method_id."""
        status, data = self._request('GET', '/similar-methods')
        
        self.assertEqual(status, 400)
        self.assertIn('error', data)

    def test_similar_methods_with_method_id(self) -> None:
        """Test GET /similar-methods with method_id."""
        status, data = self._request('GET', '/similar-methods?method_id=test_method&n=3')
        
        self.assertEqual(status, 200)
        self.assertEqual(data.get('method_id'), 'test_method')
        self.assertIn('similar_methods', data)

    def test_recommend_methods_missing_run_id(self) -> None:
        """Test GET /recommend-methods without run_id."""
        status, data = self._request('GET', '/recommend-methods')
        
        self.assertEqual(status, 400)
        self.assertIn('error', data)

    def test_recommend_methods_with_run_id(self) -> None:
        """Test GET /recommend-methods with run_id."""
        status, data = self._request('GET', '/recommend-methods?run_id=test_run&n=5')
        
        self.assertEqual(status, 200)
        self.assertEqual(data.get('run_id'), 'test_run')
        self.assertIn('recommendations', data)
        self.assertIsInstance(data['recommendations'], list)

    def test_add_method_success(self) -> None:
        """Test POST /add-method with valid data."""
        method_data = {
            'method_id': f'test_method_{int(time.time())}',
            'category': 'test',
            'parameters': {'param1': 1.0, 'param2': 'value'}
        }
        
        status, data = self._request('POST', '/add-method', method_data)
        
        self.assertIn(status, [200, 201])
        self.assertIn('status', data)
        self.assertIn('method_id', data)

    def test_add_method_missing_fields(self) -> None:
        """Test POST /add-method with missing required fields."""
        incomplete_data = {
            'method_id': 'test_method'
            # Missing category and parameters
        }
        
        status, data = self._request('POST', '/add-method', incomplete_data)
        
        self.assertEqual(status, 400)
        self.assertIn('error', data)

    def test_record_run_success(self) -> None:
        """Test POST /record-run with valid data."""
        run_data = {
            'run_id': f'test_run_{int(time.time())}',
            'timestamp': '2026-03-25T10:00:00Z',
            'baseline_score': 0.267,
            'final_score': 0.310,
            'status': 'COMPLETED',
            'methods_applied': ['method_1', 'method_2']
        }
        
        status, data = self._request('POST', '/record-run', run_data)
        
        self.assertIn(status, [200, 201])
        self.assertIn('status', data)

    def test_record_run_missing_fields(self) -> None:
        """Test POST /record-run with missing required fields."""
        incomplete_data = {
            'run_id': 'test_run'
            # Missing timestamp and status
        }
        
        status, data = self._request('POST', '/record-run', incomplete_data)
        
        self.assertEqual(status, 400)
        self.assertIn('error', data)

    def test_record_method_run_success(self) -> None:
        """Test POST /record-method-run with valid data."""
        method_run_data = {
            'method_id': 'test_method',
            'run_id': 'test_run',
            'decision': 'KEEP',
            'improvement': 0.05,
            'duration_ms': 120
        }
        
        status, data = self._request('POST', '/record-method-run', method_run_data)
        
        self.assertIn(status, [200, 201])
        self.assertIn('status', data)

    def test_record_method_run_missing_fields(self) -> None:
        """Test POST /record-method-run with missing required fields."""
        incomplete_data = {
            'method_id': 'test_method'
            # Missing run_id
        }
        
        status, data = self._request('POST', '/record-method-run', incomplete_data)
        
        self.assertEqual(status, 400)
        self.assertIn('error', data)

    def test_cors_headers(self) -> None:
        """Test CORS headers are present."""
        self.conn.request('OPTIONS', '/health')
        response = self.conn.getresponse()
        
        self.assertEqual(response.status, 200)
        
        headers = dict(response.getheaders())
        # Note: header names are lowercased in Python's HTTPResponse
        self.assertIn('access-control-allow-origin', [h.lower() for h in headers.keys()])

    def test_404_not_found(self) -> None:
        """Test 404 for unknown endpoints."""
        status, data = self._request('GET', '/unknown-endpoint')
        
        self.assertEqual(status, 404)
        self.assertIn('error', data)

    def test_invalid_json_post(self) -> None:
        """Test POST with invalid JSON."""
        headers = {'Content-Type': 'application/json'}
        invalid_json = 'not valid json'
        self.conn.request('POST', '/add-method', invalid_json.encode('utf-8'), headers)
        
        response = self.conn.getresponse()
        status = response.status
        
        self.assertEqual(status, 400)


class TestBridgeIntegration(unittest.TestCase):
    """Integration tests for the bridge workflow."""

    @classmethod
    def setUpClass(cls) -> None:
        """Start the bridge server before all tests."""
        cls.test_port = DEFAULT_PORT + 2
        cls.server_thread = threading.Thread(
            target=start_server,
            args=(cls.test_port,),
            daemon=True
        )
        cls.server_thread.start()
        time.sleep(1)

    def setUp(self) -> None:
        """Set up test client."""
        self.conn = HTTPConnection('localhost', self.test_port, timeout=10)

    def tearDown(self) -> None:
        """Clean up test client."""
        self.conn.close()

    def _request(
        self,
        method: str,
        path: str,
        data: Optional[Dict[str, Any]] = None
    ) -> tuple:
        """Make an HTTP request."""
        headers = {'Content-Type': 'application/json'}
        
        if data:
            body = json.dumps(data).encode('utf-8')
            self.conn.request(method, path, body, headers)
        else:
            self.conn.request(method, path)
        
        response = self.conn.getresponse()
        body = response.read().decode('utf-8')
        
        try:
            response_data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            response_data = {'raw': body}
        
        return response.status, response_data

    def test_full_workflow(self) -> None:
        """Test complete workflow: add method, record run, record method run."""
        timestamp = int(time.time())
        
        # Step 1: Add a method
        method_id = f'integration_test_method_{timestamp}'
        method_data = {
            'method_id': method_id,
            'category': 'test',
            'parameters': {'test_param': 1.0}
        }
        
        status, data = self._request('POST', '/add-method', method_data)
        self.assertIn(status, [200, 201])
        
        # Step 2: Record a run
        run_id = f'integration_test_run_{timestamp}'
        run_data = {
            'run_id': run_id,
            'timestamp': '2026-03-25T10:00:00Z',
            'status': 'COMPLETED',
            'methods_applied': [method_id]
        }
        
        status, data = self._request('POST', '/record-run', run_data)
        self.assertIn(status, [200, 201])
        
        # Step 3: Record a method run
        method_run_data = {
            'method_id': method_id,
            'run_id': run_id,
            'decision': 'KEEP',
            'improvement': 0.05,
            'duration_ms': 100
        }
        
        status, data = self._request('POST', '/record-method-run', method_run_data)
        self.assertIn(status, [200, 201])
        
        # Step 4: Check success rate
        status, data = self._request('GET', f'/success-rate?method_id={method_id}')
        self.assertEqual(status, 200)
        self.assertIn('success_rate', data)
        
        # Step 5: Get recommendations
        status, data = self._request('GET', f'/recommend-methods?run_id={run_id}')
        self.assertEqual(status, 200)
        self.assertIn('recommendations', data)


def run_tests():
    """Run all tests manually."""
    print("=" * 60)
    print("ChromaDB Bridge Test Suite")
    print("=" * 60)
    print()
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestChromaBridge))
    suite.addTests(loader.loadTestsFromTestCase(TestBridgeIntegration))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Return exit code
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    import sys
    sys.exit(run_tests())
