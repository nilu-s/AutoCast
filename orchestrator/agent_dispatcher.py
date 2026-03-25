#!/usr/bin/env python3
"""Agent Dispatcher - Handles launching and communication with sub-agents."""

import subprocess
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4
import threading

logger = logging.getLogger(__name__)


class AgentDispatch:
    """Represents a dispatched agent process."""
    
    def __init__(
        self,
        task_id: str,
        agent_id: str,
        process: Optional[subprocess.Popen] = None,
        dispatch_type: str = "subprocess"
    ):
        self.dispatch_id = str(uuid4())
        self.task_id = task_id
        self.agent_id = agent_id
        self.process = process
        self.dispatch_type = dispatch_type
        self.status = "pending"  # pending, running, completed, failed
        self.started_at: Optional[str] = None
        self.completed_at: Optional[str] = None
        self.result: Optional[Dict[str, Any]] = None
        self.error_message: Optional[str] = None
        self.log_file: Optional[Path] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'dispatch_id': self.dispatch_id,
            'task_id': self.task_id,
            'agent_id': self.agent_id,
            'status': self.status,
            'dispatch_type': self.dispatch_type,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'result': self.result,
            'error_message': self.error_message
        }


class AgentDispatcher:
    """Dispatches tasks to sub-agents via different mechanisms.
    
    Supports:
    - Subprocess execution (local Python scripts)
    - OpenClaw subagent spawning (via openclaw command)
    - Mock execution (for testing)
    """
    
    def __init__(self, workspace_root: Optional[str] = None):
        if workspace_root is None:
            workspace_root = str(Path(__file__).parent.parent)
        
        self.workspace_root = Path(workspace_root)
        self.active_dispatches: Dict[str, AgentDispatch] = {}
        self.dispatch_history: List[Dict[str, Any]] = []
        self.logs_dir = self.workspace_root / "logs" / "dispatches"
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        
        # Dispatch method configuration
        self.dispatch_methods = {
            'subprocess': self._dispatch_subprocess,
            'openclaw': self._dispatch_openclaw,
            'mock': self._dispatch_mock
        }
        
        logger.info(f"AgentDispatcher initialized (workspace: {workspace_root})")
    
    def dispatch(
        self,
        task: Dict[str, Any],
        agent_id: str,
        method: str = "subprocess",
        wait: bool = False
    ) -> AgentDispatch:
        """Dispatch a task to an agent.
        
        Args:
            task: Task dictionary with all required info
            agent_id: ID of the agent to dispatch
            method: 'subprocess', 'openclaw', or 'mock'
            wait: If True, wait for completion before returning
            
        Returns:
            AgentDispatch object tracking the dispatch
        """
        task_id = task.get('task_id', str(uuid4()))
        
        dispatch = AgentDispatch(
            task_id=task_id,
            agent_id=agent_id,
            dispatch_type=method
        )
        
        # Create log file
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        dispatch.log_file = self.logs_dir / f"{task_id}_{timestamp}.log"
        
        logger.info(f"Dispatching task {task_id} to agent {agent_id} via {method}")
        
        # Use appropriate dispatch method
        if method in self.dispatch_methods:
            self.dispatch_methods[method](dispatch, task)
        else:
            dispatch.status = "failed"
            dispatch.error_message = f"Unknown dispatch method: {method}"
        
        # Track the dispatch
        self.active_dispatches[task_id] = dispatch
        
        if wait and dispatch.process:
            self._wait_for_completion(dispatch)
        
        return dispatch
    
    def _dispatch_subprocess(self, dispatch: AgentDispatch, task: Dict[str, Any]):
        """Dispatch via subprocess (local Python execution)."""
        try:
            # Prepare task data
            task_data = json.dumps(task)
            
            # Create a simple runner script
            runner_script = self.workspace_root / "orchestrator" / "agent_runner.py"
            
            if not runner_script.exists():
                self._create_agent_runner(runner_script)
            
            # Launch subprocess
            with open(dispatch.log_file, 'w') as log_fh:
                process = subprocess.Popen(
                    [
                        'python3', str(runner_script),
                        '--task', task_data,
                        '--agent-id', dispatch.agent_id
                    ],
                    stdout=log_fh,
                    stderr=subprocess.STDOUT,
                    cwd=str(self.workspace_root),
                    env={**os.environ, 'AGENT_TASK_ID': dispatch.task_id}
                )
            
            dispatch.process = process
            dispatch.status = "running"
            dispatch.started_at = datetime.utcnow().isoformat()
            
            logger.debug(f"Subprocess launched (PID: {process.pid}) for task {dispatch.task_id}")
            
        except Exception as e:
            dispatch.status = "failed"
            dispatch.error_message = str(e)
            logger.error(f"Failed to dispatch subprocess: {e}")
    
    def _dispatch_openclaw(self, dispatch: AgentDispatch, task: Dict[str, Any]):
        """Dispatch via OpenClaw subagent system."""
        try:
            # Prepare task context
            task_file = self.workspace_root / "subagent-tasks" / f"{dispatch.task_id}.json"
            task_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(task_file, 'w') as f:
                json.dump(task, f, indent=2)
            
            # Build OpenClaw command
            # This would integrate with actual OpenClaw CLI
            cmd = [
                'openclaw', 'spawn',
                '--task', str(task_file),
                '--agent', dispatch.agent_id,
                '--label', f"task-{dispatch.task_id[:8]}"
            ]
            
            with open(dispatch.log_file, 'w') as log_fh:
                process = subprocess.Popen(
                    cmd,
                    stdout=log_fh,
                    stderr=subprocess.STDOUT,
                    cwd=str(self.workspace_root)
                )
            
            dispatch.process = process
            dispatch.status = "running"
            dispatch.started_at = datetime.utcnow().isoformat()
            
            logger.info(f"OpenClaw subagent spawned for task {dispatch.task_id}")
            
        except Exception as e:
            dispatch.status = "failed"
            dispatch.error_message = str(e)
            logger.error(f"Failed to dispatch OpenClaw agent: {e}")
    
    def _dispatch_mock(self, dispatch: AgentDispatch, task: Dict[str, Any]):
        """Mock dispatch for testing (no actual execution)."""
        dispatch.status = "running"
        dispatch.started_at = datetime.utcnow().isoformat()
        
        # Simulate immediate completion
        threading.Thread(
            target=self._mock_complete,
            args=(dispatch,),
            daemon=True
        ).start()
        
        logger.info(f"Mock dispatch for task {dispatch.task_id}")
    
    def _mock_complete(self, dispatch: AgentDispatch):
        """Simulate task completion for mock mode."""
        time.sleep(1)  # Simulate work
        dispatch.status = "completed"
        dispatch.completed_at = datetime.utcnow().isoformat()
        dispatch.result = {
            'status': 'success',
            'mock': True,
            'agent_id': dispatch.agent_id,
            'task_type': 'mock_execution'
        }
    
    def _create_agent_runner(self, path: Path):
        """Create the agent runner script for subprocess execution."""
        runner_code = '''#!/usr/bin/env python3
"""Agent runner - executes a task in a subprocess."""

import argparse
import json
import sys
from pathlib import Path

# Add workspace to path
workspace = Path(__file__).parent.parent
sys.path.insert(0, str(workspace))

def run_task(task_data: dict, agent_id: str) -> dict:
    """Execute the task."""
    task_type = task_data.get('task_type', 'generic')
    input_data = task_data.get('input_data', {})
    
    print(f"Agent {agent_id} executing task: {task_data.get('task_id')}")
    print(f"Task type: {task_type}")
    
    # Simulate execution based on task type
    if task_type == 'validate_method':
        result = {'validation': 'passed', 'checks_performed': 5}
    elif task_type == 'execute_method':
        result = {'execution': 'completed', 'duration_seconds': 10}
    elif task_type == 'analyze_results':
        result = {'analysis': 'complete', 'success_rate': 0.95}
    elif task_type == 'store_results':
        result = {'storage': 'success', 'records_saved': 1}
    else:
        result = {'status': 'completed', 'task_type': task_type}
    
    return {
        'status': 'success',
        'result': result,
        'agent_id': agent_id,
        'task_id': task_data.get('task_id')
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--task', required=True, help='Task data as JSON')
    parser.add_argument('--agent-id', required=True, help='Agent ID')
    args = parser.parse_args()
    
    task_data = json.loads(args.task)
    result = run_task(task_data, args.agent_id)
    
    print(json.dumps(result, indent=2))
    sys.exit(0 if result['status'] == 'success' else 1)
'''
        path.write_text(runner_code)
        path.chmod(0o755)
        logger.info(f"Created agent runner script at {path}")
    
    def _wait_for_completion(self, dispatch: AgentDispatch, timeout: int = 300):
        """Wait for a dispatch to complete."""
        if not dispatch.process:
            return
        
        try:
            dispatch.process.wait(timeout=timeout)
            dispatch.status = "completed" if dispatch.process.returncode == 0 else "failed"
            dispatch.completed_at = datetime.utcnow().isoformat()
            
            # Try to read result from log
            if dispatch.log_file and dispatch.log_file.exists():
                log_content = dispatch.log_file.read_text()
                # Look for JSON result in the log
                for line in log_content.split('\\n'):
                    line = line.strip()
                    if line.startswith('{') and line.endswith('}'):
                        try:
                            result = json.loads(line)
                            dispatch.result = result
                            break
                        except:
                            pass
            
        except subprocess.TimeoutExpired:
            dispatch.status = "failed"
            dispatch.error_message = f"Timeout after {timeout}s"
            dispatch.process.terminate()
    
    def check_status(self, task_id: str) -> Optional[AgentDispatch]:
        """Check the status of a dispatched task."""
        dispatch = self.active_dispatches.get(task_id)
        if not dispatch:
            return None
        
        # Update status if process has completed
        if dispatch.process and dispatch.status == "running":
            returncode = dispatch.process.poll()
            if returncode is not None:
                dispatch.status = "completed" if returncode == 0 else "failed"
                dispatch.completed_at = datetime.utcnow().isoformat()
                
                # Parse result from log
                if dispatch.log_file and dispatch.log_file.exists():
                    log_content = dispatch.log_file.read_text()
                    for line in reversed(log_content.split('\\n')):
                        line = line.strip()
                        if line.startswith('{') and line.endswith('}'):
                            try:
                                dispatch.result = json.loads(line)
                                break
                            except:
                                pass
        
        return dispatch
    
    def get_active_dispatches(self) -> List[AgentDispatch]:
        """Get all currently active dispatches."""
        return [
            d for d in self.active_dispatches.values()
            if d.status == "running"
        ]
    
    def cancel_dispatch(self, task_id: str) -> bool:
        """Cancel a running dispatch."""
        dispatch = self.active_dispatches.get(task_id)
        if not dispatch or dispatch.status != "running":
            return False
        
        if dispatch.process:
            dispatch.process.terminate()
            try:
                dispatch.process.wait(timeout=5)
            except:
                dispatch.process.kill()
        
        dispatch.status = "cancelled"
        dispatch.completed_at = datetime.utcnow().isoformat()
        
        logger.info(f"Cancelled dispatch for task {task_id}")
        return True
    
    def cleanup_completed(self, max_age_hours: int = 24) -> int:
        """Clean up completed dispatches from memory."""
        to_remove = []
        cutoff = datetime.utcnow().timestamp() - (max_age_hours * 3600)
        
        for task_id, dispatch in self.active_dispatches.items():
            if dispatch.status in ['completed', 'failed', 'cancelled']:
                if dispatch.completed_at:
                    try:
                        completed_ts = datetime.fromisoformat(
                            dispatch.completed_at.replace('Z', '+00:00')
                        ).timestamp()
                        if completed_ts < cutoff:
                            to_remove.append(task_id)
                    except:
                        to_remove.append(task_id)
        
        for task_id in to_remove:
            dispatch = self.active_dispatches.pop(task_id)
            self.dispatch_history.append(dispatch.to_dict())
        
        logger.info(f"Cleaned up {len(to_remove)} completed dispatches")
        return len(to_remove)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get dispatch statistics."""
        active = self.get_active_dispatches()
        
        return {
            'active_dispatches': len(active),
            'total_tracked': len(self.active_dispatches),
            'history_size': len(self.dispatch_history),
            'by_status': {
                'pending': len([d for d in self.active_dispatches.values() if d.status == 'pending']),
                'running': len([d for d in self.active_dispatches.values() if d.status == 'running']),
                'completed': len([d for d in self.active_dispatches.values() if d.status == 'completed']),
                'failed': len([d for d in self.active_dispatches.values() if d.status == 'failed'])
            }
        }
