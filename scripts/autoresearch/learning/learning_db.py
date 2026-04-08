#!/usr/bin/env python3
"""
Learning Database Module - Python version matching TypeScript interface
"""

import sqlite3
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime

# Schema
SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  baseline_score REAL,
  final_score REAL,
  status TEXT CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS method_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  decision TEXT CHECK(decision IN ('KEEP', 'REJECT', 'FAILED')),
  improvement REAL,
  duration_ms INTEGER,
  FOREIGN KEY (run_id) REFERENCES runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_method_runs_run_id ON method_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_method_runs_method_id ON method_runs(method_id);

CREATE TABLE IF NOT EXISTS methods (
  method_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT,
  created_at TEXT NOT NULL
);
"""


@dataclass
class Run:
    run_id: str
    timestamp: str
    baseline_score: Optional[float] = None
    final_score: Optional[float] = None
    status: str = 'PENDING'


@dataclass
class MethodRun:
    method_id: str
    run_id: str
    decision: Optional[str] = None
    improvement: Optional[float] = None
    duration_ms: Optional[int] = None


@dataclass
class Method:
    method_id: str
    name: str
    description: str = ""
    tags: List[str] = None
    created_at: str = ""
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []
        if not self.created_at:
            self.created_at = datetime.now().isoformat()


class LearningDB:
    """SQLite-based learning database"""
    
    def __init__(self, db_path: str = 'method_results/learning.db'):
        self.db_path = db_path
        self._ensure_dir()
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()
    
    def _ensure_dir(self):
        """Ensure database directory exists"""
        import os
        dir_path = os.path.dirname(self.db_path)
        if dir_path and not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)
    
    def _init_schema(self):
        """Initialize database schema"""
        self.conn.executescript(SCHEMA)
        self.conn.commit()
    
    def record_run(self, run: Run):
        """Record a new run"""
        self.conn.execute("""
            INSERT INTO runs (run_id, timestamp, baseline_score, final_score, status)
            VALUES (?, ?, ?, ?, ?)
        """, (run.run_id, run.timestamp, run.baseline_score, run.final_score, run.status))
        self.conn.commit()
    
    def record_method_run(self, method_run: MethodRun):
        """Record a method run"""
        self.conn.execute("""
            INSERT INTO method_runs (method_id, run_id, decision, improvement, duration_ms)
            VALUES (?, ?, ?, ?, ?)
        """, (method_run.method_id, method_run.run_id, method_run.decision, 
              method_run.improvement, method_run.duration_ms))
        self.conn.commit()
    
    def add_method(self, method: Method):
        """Add a method to the catalog"""
        tags_str = ','.join(method.tags) if method.tags else ''
        self.conn.execute("""
            INSERT OR REPLACE INTO methods (method_id, name, description, tags, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (method.method_id, method.name, method.description, tags_str, method.created_at))
        self.conn.commit()
    
    def get_method(self, method_id: str) -> Optional[Dict[str, Any]]:
        """Get method by ID"""
        row = self.conn.execute(
            "SELECT * FROM methods WHERE method_id = ?", (method_id,)
        ).fetchone()
        if row:
            return dict(row)
        return None
    
    def get_top_methods(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get top methods by success rate"""
        rows = self.conn.execute("""
            SELECT 
                m.method_id,
                m.name,
                m.description,
                COUNT(CASE WHEN mr.decision = 'KEEP' THEN 1 END) as keep_count,
                COUNT(CASE WHEN mr.decision = 'REJECT' THEN 1 END) as reject_count,
                COUNT(CASE WHEN mr.decision = 'FAILED' THEN 1 END) as failed_count,
                AVG(mr.improvement) as avg_improvement,
                ROUND(
                    CAST(COUNT(CASE WHEN mr.decision = 'KEEP' THEN 1 END) AS REAL) / 
                    NULLIF(COUNT(mr.decision), 0), 2
                ) as success_rate
            FROM methods m
            LEFT JOIN method_runs mr ON m.method_id = mr.method_id
            GROUP BY m.method_id
            ORDER BY success_rate DESC, avg_improvement DESC
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict(row) for row in rows]
    
    def get_success_rate(self, method_id: str, time_window: int = 30) -> float:
        """Get success rate for a method"""
        row = self.conn.execute("""
            SELECT 
                ROUND(
                    CAST(COUNT(CASE WHEN mr.decision = 'KEEP' THEN 1 END) AS REAL) / 
                    NULLIF(COUNT(mr.decision), 0), 2
                ) as success_rate
            FROM method_runs mr
            JOIN runs r ON mr.run_id = r.run_id
            WHERE mr.method_id = ? 
              AND r.timestamp > datetime('now', '-' || ? || ' days')
        """, (method_id, time_window)).fetchone()
        return row['success_rate'] if row and row['success_rate'] else 0.0
    
    def get_similar_methods(self, method_id: str, n: int = 5) -> List[Dict[str, Any]]:
        """Get similar methods (simple tag-based similarity)"""
        method = self.get_method(method_id)
        if not method:
            return []
        
        # Get methods with similar tags
        rows = self.conn.execute("""
            SELECT 
                method_id,
                name,
                description,
                tags
            FROM methods
            WHERE method_id != ?
            LIMIT ?
        """, (method_id, n)).fetchall()
        
        return [dict(row) for row in rows]
    
    def close(self):
        """Close database connection"""
        self.conn.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
