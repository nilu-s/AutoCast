#!/usr/bin/env python3
"""HTTP API Bridge für ChromaDB Learning Engine Core Integration.

Bietet eine RESTful HTTP-Schnittstelle für die Learning Engine mit ChromaDB,
die externen Systemen ermöglicht, Methodenstatistiken, Success Rates abzufragen
und neue Runs aufzuzeichnen.

Der Server läuft standardmäßig auf Port 8765 und bietet Endpoints für
Analytics-Abfragen und Datenerfassung. Alle Antworten sind JSON-formatiert.

Example:
    >>> from learning.bridge import start_server
    >>> start_server(port=8765)

    Oder von der Kommandozeile:
    $ python learning/bridge.py

    Test mit curl:
    $ curl http://localhost:8765/health
    $ curl http://localhost:8765/success-rate?method_id=method_1
    $ curl http://localhost:8765/top-methods?limit=5
    $ curl http://localhost:8765/similar-methods?method_id=method_1&n=5
"""

import json
import logging
import os
import signal
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

# Import learning modules
from learning.chroma_client import ChromaLearningDB, Method, Run
from learning.similarity_analytics import SimilarityAnalytics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_PORT = int(os.environ.get('CHROMA_BRIDGE_PORT', 8765))
DEFAULT_DB_PATH = os.environ.get('CHROMA_DB_PATH', 'method_results/chroma_db')
DEFAULT_PERSIST_DIR = os.environ.get('CHROMA_PERSIST_DIR', 'method_results/chroma_db')

# Docker-ChromaDB Configuration
CHROMA_HOST = os.environ.get('CHROMA_HOST', 'localhost')
CHROMA_PORT = int(os.environ.get('CHROMA_PORT', 8000))
CHROMA_USE_HTTP = os.environ.get('CHROMA_USE_HTTP', 'false').lower() == 'true'
# Docker-style isolated storage (default: chroma_data/ in project root)
CHROMA_PERSIST_DIR = os.environ.get('CHROMA_PERSIST_DIR', 'chroma_data')

# Global server reference for graceful shutdown
_server: Optional[HTTPServer] = None
_shutdown_event = threading.Event()
_shutdown_lock = threading.Lock()


class ChromaBridgeHandler(BaseHTTPRequestHandler):
    """HTTP request handler für ChromaDB Learning Engine API.

    Handhabt GET und POST Requests für das Abfragen von Methodenstatistiken,
    Success Rates, Ähnlichkeitssuche und die Aufzeichnung neuer Runs.
    Alle Antworten sind JSON-formatiert.

    Attributes:
        db: ChromaLearningDB instance für Datenbankzugriff.
        analytics: SimilarityAnalytics instance für Analytics-Operationen.
    """

    db: Optional[ChromaLearningDB] = None
    analytics: Optional[SimilarityAnalytics] = None

    def log_message(self, format: str, *args: Any) -> None:
        """Custom logging method - verwendet Python logging statt stderr."""
        logger.info(f"{self.address_string()} - {format % args}")

    def _init_db(self) -> None:
        """Lazy initialize database und analytics connections."""
        if self.db is None:
            # Docker-ChromaDB: Use isolated storage with optional HTTP support
            self.db = ChromaLearningDB(
                persist_dir=CHROMA_PERSIST_DIR,
                use_http=CHROMA_USE_HTTP,
                host=CHROMA_HOST,
                port=CHROMA_PORT
            )
            self.analytics = SimilarityAnalytics(self.db)

    def _send_json(self, data: Dict[str, Any], status: int = 200) -> None:
        """Sendet eine JSON-Antwort.

        Args:
            data: Dictionary zum Serialisieren als JSON.
            status: HTTP Status Code (default: 200).
        """
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode('utf-8'))

    def _send_error(self, message: str, status: int = 400) -> None:
        """Sendet eine Fehlerantwort.

        Args:
            message: Fehlermeldung für die Antwort.
            status: HTTP Status Code (default: 400).
        """
        self._send_json({"error": message}, status)

    def _get_param(self, params: Dict[str, List[str]], name: str, default: Any = None) -> Any:
        """Extrahiert einen Query-Parameter-Wert.

        Args:
            params: Geparste Query-Parameter als Dictionary.
            name: Parameter-Name zum Extrahieren.
            default: Default-Wert wenn Parameter fehlt.

        Returns:
            Parameter-Wert oder Default.
        """
        values = params.get(name, [])
        return values[0] if values else default

    def do_GET(self) -> None:  # noqa: N802
        """Handle GET requests.

        Supported endpoints:
        - /health: Health check endpoint
        - /success-rate?method_id=xxx: Success Rate für eine Methode
        - /top-methods?limit=10&category=xxx: Top performing Methoden
        - /similar-methods?method_id=xxx&n=5: Ähnliche Methoden finden
        - /recommend-methods?run_id=xxx&n=5: Empfehlungen für einen Run
        """
        self._init_db()
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        try:
            if path == '/health':
                self._handle_health()
            elif path == '/success-rate':
                self._handle_success_rate(params)
            elif path == '/top-methods':
                self._handle_top_methods(params)
            elif path == '/similar-methods':
                self._handle_similar_methods(params)
            elif path == '/recommend-methods':
                self._handle_recommend_methods(params)
            else:
                self._send_error("Not found", 404)

        except Exception as e:
            logger.exception("Error handling GET request")
            self._send_error(str(e), 500)

    def do_POST(self) -> None:  # noqa: N802
        """Handle POST requests.

        Supported endpoints:
        - /add-method: Neue Methode hinzufügen
        - /record-run: Neuen Run aufzeichnen
        - /record-method-run: Method-Run Ergebnis aufzeichnen
        """
        self._init_db()
        parsed = urlparse(self.path)
        path = parsed.path

        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length else '{}'

        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError as e:
            self._send_error(f"Invalid JSON: {e}")
            return

        try:
            if path == '/add-method':
                self._handle_add_method(data)
            elif path == '/record-run':
                self._handle_record_run(data)
            elif path == '/record-method-run':
                self._handle_record_method_run(data)
            else:
                self._send_error("Not found", 404)

        except KeyError as e:
            self._send_error(f"Missing required field: {e}", 400)
        except Exception as e:
            logger.exception("Error handling POST request")
            self._send_error(str(e), 500)

    def do_OPTIONS(self) -> None:  # noqa: N802
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _handle_health(self) -> None:
        """Handle health check request.

        Response:
            {
                "status": "ok",
                "persist_dir": "method_results/chroma_db",
                "port": 8765
            }
        """
        self._send_json({
            "status": "ok",
            "persist_dir": DEFAULT_PERSIST_DIR,
            "port": DEFAULT_PORT
        })

    def _handle_success_rate(self, params: Dict[str, List[str]]) -> None:
        """Handle GET /success-rate request.

        Query parameters:
            method_id (required): Die Methoden-ID.

        Response:
            {
                "method_id": "xxx",
                "success_rate": 0.85,
                "attempts": 10,
                "found": true
            }
        """
        method_id = self._get_param(params, 'method_id')
        if not method_id:
            self._send_error("method_id parameter is required")
            return

        success_rate = self.db.get_success_rate(method_id)
        method = self.db.get_method(method_id)

        self._send_json({
            "method_id": method_id,
            "success_rate": success_rate,
            "attempts": method.get("attempts", 0) if method else 0,
            "found": method is not None
        })

    def _handle_top_methods(self, params: Dict[str, List[str]]) -> None:
        """Handle GET /top-methods request.

        Query parameters:
            limit (optional): Maximale Anzahl Ergebnisse (default: 10).
            category (optional): Filter nach Kategorie.

        Response:
            {
                "methods": [
                    {
                        "method_id": "xxx",
                        "category": "optimization",
                        "success_rate": 0.85,
                        "attempts": 10,
                        ...
                    }
                ]
            }
        """
        limit = int(self._get_param(params, 'limit', '10'))
        category = self._get_param(params, 'category')

        methods = self.db.get_top_methods(
            n_results=limit,
            min_attempts=0,
            category=category
        )
        self._send_json({"methods": methods})

    def _handle_similar_methods(self, params: Dict[str, List[str]]) -> None:
        """Handle GET /similar-methods request.

        Query parameters:
            method_id (required): Die Methoden-ID.
            n (optional): Anzahl ähnlicher Methoden (default: 5).

        Response:
            {
                "method_id": "xxx",
                "similar_methods": [
                    {
                        "method_id": "yyy",
                        "similarity": 0.95,
                        "distance": 0.05,
                        ...
                    }
                ]
            }
        """
        method_id = self._get_param(params, 'method_id')
        if not method_id:
            self._send_error("method_id parameter is required")
            return

        n_results = int(self._get_param(params, 'n', '5'))

        similar = self.db.find_similar_methods(method_id, n_results=n_results)

        self._send_json({
            "method_id": method_id,
            "similar_methods": similar
        })

    def _handle_recommend_methods(self, params: Dict[str, List[str]]) -> None:
        """Handle GET /recommend-methods request.

        Query parameters:
            run_id (required): Die Run-ID für Empfehlungen.
            n (optional): Anzahl Empfehlungen (default: 5).

        Response:
            {
                "run_id": "xxx",
                "recommendations": [
                    {
                        "method_id": "yyy",
                        "reason": "High success rate in similar runs",
                        "success_rate": 0.85,
                        ...
                    }
                ]
            }
        """
        run_id = self._get_param(params, 'run_id')
        if not run_id:
            self._send_error("run_id parameter is required")
            return

        n_results = int(self._get_param(params, 'n', '5'))

        recommendations = self.analytics.recommend_methods_for_run(run_id, n_results)

        self._send_json({
            "run_id": run_id,
            "recommendations": recommendations
        })

    def _handle_add_method(self, data: Dict[str, Any]) -> None:
        """Handle POST /add-method request.

        Request body:
            {
                "method_id": "xxx",
                "category": "optimization",
                "parameters": {"param1": 1.0, "param2": "value"}
            }

        Response:
            {"status": "created", "method_id": "xxx"}
            oder
            {"status": "exists", "method_id": "xxx"} (wenn bereits vorhanden)
        """
        required_fields = ['method_id', 'category', 'parameters']
        for field in required_fields:
            if field not in data:
                raise KeyError(field)

        try:
            self.db.add_method(
                method_id=data['method_id'],
                category=data['category'],
                parameters=data['parameters']
            )
            self._send_json({"status": "created", "method_id": data['method_id']}, 201)
        except ValueError as e:
            if "already exists" in str(e).lower():
                self._send_json({"status": "exists", "method_id": data['method_id']}, 200)
            else:
                raise

    def _handle_record_run(self, data: Dict[str, Any]) -> None:
        """Handle POST /record-run request.

        Request body:
            {
                "run_id": "xxx",
                "timestamp": "2026-03-25T10:00:00Z",
                "baseline_score": 0.267,
                "final_score": 0.310,
                "status": "COMPLETED",
                "methods_applied": ["method_1", "method_2"]
            }

        Response:
            {"status": "ok", "run_id": "xxx"}
        """
        required_fields = ['run_id', 'timestamp', 'status']
        for field in required_fields:
            if field not in data:
                raise KeyError(field)

        run = Run(
            run_id=data['run_id'],
            timestamp=data['timestamp'],
            baseline_score=data.get('baseline_score'),
            final_score=data.get('final_score'),
            status=data['status']
        )

        methods_applied = data.get('methods_applied', [])

        success = self.db.record_run(run, methods_applied)

        if success:
            self._send_json({"status": "ok", "run_id": run.run_id}, 201)
        else:
            self._send_error("Failed to record run", 500)

    def _handle_record_method_run(self, data: Dict[str, Any]) -> None:
        """Handle POST /record-method-run request.

        Request body:
            {
                "method_id": "xxx",
                "run_id": "xxx",
                "decision": "KEEP",
                "improvement": 0.05,
                "duration_ms": 120
            }

        Response:
            {"status": "ok"}
        """
        required_fields = ['method_id', 'run_id']
        for field in required_fields:
            if field not in data:
                raise KeyError(field)

        self.db.record_method_run(
            method_id=data['method_id'],
            run_id=data['run_id'],
            decision=data.get('decision'),
            improvement=data.get('improvement'),
            duration_ms=data.get('duration_ms')
        )

        self._send_json({"status": "ok"}, 201)


def start_server(port: int = DEFAULT_PORT, persist_dir: Optional[str] = None) -> None:
    """Startet den HTTP API Server.

    Startet den ChromaDB Learning Engine HTTP API Server auf dem angegebenen Port.
    Der Server unterstützt graceful shutdown via SIGTERM/SIGINT Signal.

    Args:
        port: Port-Nummer zum Lauschen (default: 8765).
        persist_dir: Verzeichnis für ChromaDB Persistence (overrides env variable).

    Example:
        >>> start_server(8765)
        ChromaDB Bridge API running on http://localhost:8765
    """
    global _server, DEFAULT_PERSIST_DIR, DEFAULT_PORT

    if persist_dir:
        DEFAULT_PERSIST_DIR = persist_dir

    server_address = ('', port)
    _server = HTTPServer(server_address, ChromaBridgeHandler)

    # Set up graceful shutdown (only in main thread)
    def signal_handler(signum: int, frame: Any) -> None:
        """Handle shutdown signals gracefully."""
        logger.info(f"Received signal {signum}, shutting down...")
        with _shutdown_lock:
            _shutdown_event.set()
        if _server:
            _server.shutdown()

    try:
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
    except ValueError:
        # Signals only work in main thread - ignore in threads
        pass

    logger.info(f"ChromaDB Bridge API running on http://localhost:{port}")
    logger.info(f"Persist directory: {DEFAULT_PERSIST_DIR}")
    logger.info("Press Ctrl+C to stop")

    try:
        _server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server stopped by keyboard interrupt")
    finally:
        if _server:
            _server.server_close()
        logger.info("Server shutdown complete")


def stop_server() -> None:
    """Stoppt den laufenden Server.

    Diese Funktion kann aufgerufen werden um einen Server graceful zu beenden,
    der mit start_server() gestartet wurde.
    """
    global _server
    if _server:
        logger.info("Stopping server...")
        _server.shutdown()
        _server = None


def main() -> None:
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description='ChromaDB Learning Engine HTTP Bridge'
    )
    parser.add_argument(
        '--port', '-p',
        type=int,
        default=DEFAULT_PORT,
        help=f'Port to listen on (default: {DEFAULT_PORT})'
    )
    parser.add_argument(
        '--persist-dir',
        type=str,
        default=DEFAULT_PERSIST_DIR,
        help=f'ChromaDB persist directory (default: {DEFAULT_PERSIST_DIR})'
    )

    args = parser.parse_args()

    start_server(port=args.port, persist_dir=args.persist_dir)


if __name__ == '__main__':
    main()
