#!/usr/bin/env python3
"""Queue Manager - SQLite-based task queue management."""

import sqlite3
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

logger = logging.getLogger(__name__)


class QueueManager:
    """Manages task queue using SQLite.
    
    Task lifecycle:
    pending -> assigned -> running -> completed/failed
    """
    
    def __init__(self, db_path: str = "orchestrator/queue.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """Initialize SQLite database with required tables."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Tasks table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    task_id TEXT PRIMARY KEY,
                    workflow_id TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    priority TEXT DEFAULT 'normal',
                    assigned_to TEXT,
                    required_skills TEXT,  -- JSON array
                    dependencies TEXT,     -- JSON array of task_ids
                    input_data TEXT,       -- JSON
                    output_data TEXT,      -- JSON
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    assigned_at TIMESTAMP,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    retry_count INTEGER DEFAULT 0,
                    max_retries INTEGER DEFAULT 3
                )
            """)
            
            # Workflows table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS workflows (
                    workflow_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    user_approval BOOLEAN DEFAULT 0,
                    approved_by TEXT,
                    approved_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    metadata TEXT  -- JSON
                )
            """)
            
            # Task dependencies table (for complex dependency tracking)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS task_dependencies (
                    task_id TEXT NOT NULL,
                    depends_on_task_id TEXT NOT NULL,
                    PRIMARY KEY (task_id, depends_on_task_id),
                    FOREIGN KEY (task_id) REFERENCES tasks(task_id),
                    FOREIGN KEY (depends_on_task_id) REFERENCES tasks(task_id)
                )
            """)
            
            # Indexes for performance
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_tasks_status 
                ON tasks(status)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_tasks_workflow 
                ON tasks(workflow_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_tasks_assigned 
                ON tasks(assigned_to, status)
            """)
            
            conn.commit()
            logger.info(f"Queue database initialized at {self.db_path}")
    
    def add_task(self, task: Dict[str, Any]) -> str:
        """Add a task to the queue.
        
        Args:
            task: Task dictionary with required fields
            
        Returns:
            task_id of the created task
        """
        task_id = task.get('task_id', str(uuid4()))
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO tasks (
                    task_id, workflow_id, task_type, status, priority,
                    assigned_to, required_skills, dependencies, input_data,
                    output_data, max_retries
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                task_id,
                task.get('workflow_id', ''),
                task.get('task_type', 'generic'),
                task.get('status', 'pending'),
                task.get('priority', 'normal'),
                task.get('assigned_to'),
                json.dumps(task.get('required_skills', [])),
                json.dumps(task.get('dependencies', [])),
                json.dumps(task.get('input_data', {})),
                json.dumps(task.get('output_data', {})),
                task.get('max_retries', 3)
            ))
            
            # Store dependencies in separate table
            dependencies = task.get('dependencies', [])
            for dep_id in dependencies:
                cursor.execute("""
                    INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id)
                    VALUES (?, ?)
                """, (task_id, dep_id))
            
            conn.commit()
        
        logger.debug(f"Added task {task_id} to queue")
        return task_id
    
    def add_tasks(self, tasks: List[Dict[str, Any]]) -> List[str]:
        """Add multiple tasks to the queue."""
        task_ids = []
        for task in tasks:
            task_ids.append(self.add_task(task))
        logger.info(f"Added {len(tasks)} tasks to queue")
        return task_ids
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a single task by ID."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,))
            row = cursor.fetchone()
            
            if row:
                return self._row_to_dict(row)
            return None
    
    def get_next_tasks(self, n: int = 1, status: str = 'pending') -> List[Dict[str, Any]]:
        """Get next n tasks without dependencies that are ready.
        
        Returns tasks ordered by priority and creation time.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get tasks with no unresolved dependencies
            cursor.execute("""
                SELECT t.* FROM tasks t
                WHERE t.status = ?
                AND t.task_id NOT IN (
                    SELECT td.task_id FROM task_dependencies td
                    JOIN tasks dep ON td.depends_on_task_id = dep.task_id
                    WHERE dep.status NOT IN ('completed', 'failed')
                )
                ORDER BY 
                    CASE t.priority
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'normal' THEN 3
                        WHEN 'low' THEN 4
                        ELSE 5
                    END,
                    t.created_at ASC
                LIMIT ?
            """, (status, n))
            
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
    
    def update_task_status(
        self,
        task_id: str,
        status: str,
        assigned_to: Optional[str] = None,
        output_data: Optional[Dict] = None,
        error_message: Optional[str] = None
    ) -> bool:
        """Update task status and related fields."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            updates = ["status = ?"]
            params = [status]
            
            if assigned_to is not None:
                updates.append("assigned_to = ?")
                params.append(assigned_to)
                if status == 'assigned':
                    updates.append("assigned_at = CURRENT_TIMESTAMP")
            
            if status == 'running':
                updates.append("started_at = CURRENT_TIMESTAMP")
            
            if status in ['completed', 'failed']:
                updates.append("completed_at = CURRENT_TIMESTAMP")
            
            if output_data is not None:
                updates.append("output_data = ?")
                params.append(json.dumps(output_data))
            
            if error_message is not None:
                updates.append("error_message = ?")
                params.append(error_message)
            
            params.append(task_id)
            
            cursor.execute(f"""
                UPDATE tasks 
                SET {', '.join(updates)}
                WHERE task_id = ?
            """, params)
            
            conn.commit()
            
            if cursor.rowcount > 0:
                logger.debug(f"Updated task {task_id} to status: {status}")
                return True
            return False
    
    def increment_retry(self, task_id: str) -> int:
        """Increment retry count and return new value."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE tasks 
                SET retry_count = retry_count + 1, status = 'pending'
                WHERE task_id = ?
            """, (task_id,))
            
            cursor.execute("SELECT retry_count FROM tasks WHERE task_id = ?", (task_id,))
            result = cursor.fetchone()
            conn.commit()
            
            return result[0] if result else 0
    
    def get_tasks_by_workflow(self, workflow_id: str) -> List[Dict[str, Any]]:
        """Get all tasks for a specific workflow."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM tasks WHERE workflow_id = ? ORDER BY created_at",
                (workflow_id,)
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]
    
    def get_tasks_by_status(self, status: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get tasks by status."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM tasks WHERE status = ? LIMIT ?",
                (status, limit)
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]
    
    def get_task_stats(self) -> Dict[str, int]:
        """Get statistics about tasks by status."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT status, COUNT(*) FROM tasks GROUP BY status")
            return {row[0]: row[1] for row in cursor.fetchall()}
    
    def create_workflow(
        self,
        name: str,
        user_approval: bool = False,
        metadata: Optional[Dict] = None
    ) -> str:
        """Create a new workflow entry."""
        workflow_id = str(uuid4())
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO workflows (workflow_id, name, user_approval, metadata)
                VALUES (?, ?, ?, ?)
            """, (workflow_id, name, user_approval, json.dumps(metadata or {})))
            conn.commit()
        
        logger.info(f"Created workflow {workflow_id}: {name}")
        return workflow_id
    
    def approve_workflow(self, workflow_id: str, approved_by: str) -> bool:
        """Approve a workflow for execution."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE workflows 
                SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
                WHERE workflow_id = ? AND user_approval = 1
            """, (approved_by, workflow_id))
            conn.commit()
            return cursor.rowcount > 0
    
    def get_workflow(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Get workflow details."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM workflows WHERE workflow_id = ?", (workflow_id,))
            row = cursor.fetchone()
            
            if row:
                return self._row_to_dict(row)
            return None
    
    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Convert SQLite row to dictionary with JSON parsing."""
        result = dict(row)
        
        # Parse JSON fields
        json_fields = ['required_skills', 'dependencies', 'input_data', 'output_data', 'metadata']
        for field in json_fields:
            if field in result and result[field]:
                try:
                    result[field] = json.loads(result[field])
                except (json.JSONDecodeError, TypeError):
                    result[field] = []
        
        # Parse boolean
        if 'user_approval' in result:
            result['user_approval'] = bool(result['user_approval'])
        
        return result
    
    def delete_completed_tasks(self, older_than_days: int = 30) -> int:
        """Clean up old completed tasks."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM tasks 
                WHERE status IN ('completed', 'failed')
                AND completed_at < datetime('now', '-{} days')
            """.format(older_than_days))
            conn.commit()
            deleted = cursor.rowcount
            logger.info(f"Deleted {deleted} old completed tasks")
            return deleted
