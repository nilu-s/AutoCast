#!/usr/bin/env python3
"""Constraint Checker - Validates task execution constraints."""

import json
import logging
from datetime import datetime, time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


class ConstraintCheckResult:
    """Result of constraint checking."""
    
    def __init__(self, passed: bool, reason: Optional[str] = None, details: Optional[Dict] = None):
        self.passed = passed
        self.reason = reason
        self.details = details or {}
    
    def __bool__(self):
        return self.passed
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'passed': self.passed,
            'reason': self.reason,
            'details': self.details
        }


class ConstraintChecker:
    """Checks various constraints before task execution.
    
    Constraint types:
    - Time constraints: When tasks can run
    - Resource constraints: CPU, memory, GPU availability
    - File constraints: Required files exist, output directories writable
    - Dependency constraints: Prerequisites completed
    - Rate limiting: Max executions per time window
    - User approval: Explicit approval required
    """
    
    def __init__(self, config_path: Optional[str] = None):
        self.config = self._load_default_config()
        
        if config_path:
            self._load_config(config_path)
        
        # Runtime state tracking
        self.execution_history: List[Dict[str, Any]] = []
        self.rate_limit_windows: Dict[str, List[datetime]] = {}
        
        logger.info("ConstraintChecker initialized")
    
    def _load_default_config(self) -> Dict[str, Any]:
        """Load default constraint configuration."""
        return {
            'time_constraints': {
                'allowed_hours': {'start': '00:00', 'end': '23:59'},
                'blocked_hours': [],  # e.g., [{'start': '02:00', 'end': '04:00'}]
                'timezone': 'UTC'
            },
            'resource_constraints': {
                'max_cpu_percent': 90,
                'min_free_memory_mb': 512,
                'max_gpu_memory_percent': 95
            },
            'rate_limits': {
                'default': {'max_per_minute': 10, 'max_per_hour': 100},
                'critical_task': {'max_per_minute': 20, 'max_per_hour': 200}
            },
            'file_constraints': {
                'required_paths': [],
                'writable_paths': []
            },
            'user_approval_required': {
                'task_types': ['destructive', 'external_api', 'costly'],
                'agents': []
            }
        }
    
    def _load_config(self, config_path: str):
        """Load configuration from file."""
        try:
            with open(config_path) as f:
                user_config = json.load(f)
                self.config.update(user_config)
            logger.info(f"Loaded constraint config from {config_path}")
        except Exception as e:
            logger.warning(f"Failed to load config from {config_path}: {e}")
    
    def check_task(
        self,
        task: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> ConstraintCheckResult:
        """Check all applicable constraints for a task.
        
        Returns True if all constraints pass, False otherwise.
        Includes reason for failure if any constraint fails.
        """
        context = context or {}
        failed_constraints = []
        details = {}
        
        # 1. Time constraints
        time_result = self._check_time_constraints(task)
        details['time'] = time_result.to_dict()
        if not time_result:
            failed_constraints.append(f"time: {time_result.reason}")
        
        # 2. Resource constraints
        resource_result = self._check_resource_constraints(task, context)
        details['resources'] = resource_result.to_dict()
        if not resource_result:
            failed_constraints.append(f"resources: {resource_result.reason}")
        
        # 3. File constraints
        file_result = self._check_file_constraints(task)
        details['files'] = file_result.to_dict()
        if not file_result:
            failed_constraints.append(f"files: {file_result.reason}")
        
        # 4. Dependency constraints
        dep_result = self._check_dependency_constraints(task, context)
        details['dependencies'] = dep_result.to_dict()
        if not dep_result:
            failed_constraints.append(f"dependencies: {dep_result.reason}")
        
        # 5. Rate limit constraints
        rate_result = self._check_rate_limits(task)
        details['rate_limit'] = rate_result.to_dict()
        if not rate_result:
            failed_constraints.append(f"rate_limit: {rate_result.reason}")
        
        # 6. User approval constraints
        approval_result = self._check_user_approval(task, context)
        details['user_approval'] = approval_result.to_dict()
        if not approval_result:
            failed_constraints.append(f"user_approval: {approval_result.reason}")
        
        # Return result
        if failed_constraints:
            return ConstraintCheckResult(
                passed=False,
                reason=f"Failed constraints: {'; '.join(failed_constraints)}",
                details=details
            )
        
        return ConstraintCheckResult(
            passed=True,
            reason="All constraints satisfied",
            details=details
        )
    
    def _check_time_constraints(self, task: Dict[str, Any]) -> ConstraintCheckResult:
        """Check if current time allows task execution."""
        now = datetime.utcnow().time()
        
        config = self.config.get('time_constraints', {})
        
        # Check allowed hours
        allowed_start = config.get('allowed_hours', {}).get('start', '00:00')
        allowed_end = config.get('allowed_hours', {}).get('end', '23:59')
        
        start_time = datetime.strptime(allowed_start, '%H:%M').time()
        end_time = datetime.strptime(allowed_end, '%H:%M').time()
        
        if not (start_time <= now <= end_time):
            return ConstraintCheckResult(
                passed=False,
                reason=f"Current time {now} outside allowed window {allowed_start}-{allowed_end}"
            )
        
        # Check blocked hours
        for blocked in config.get('blocked_hours', []):
            block_start = datetime.strptime(blocked['start'], '%H:%M').time()
            block_end = datetime.strptime(blocked['end'], '%H:%M').time()
            
            if block_start <= now <= block_end:
                return ConstraintCheckResult(
                    passed=False,
                    reason=f"Current time {now} in blocked window {blocked['start']}-{blocked['end']}"
                )
        
        return ConstraintCheckResult(passed=True)
    
    def _check_resource_constraints(
        self,
        task: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ConstraintCheckResult:
        """Check if sufficient resources are available."""
        try:
            import psutil
            
            config = self.config.get('resource_constraints', {})
            
            # Check CPU
            cpu_percent = psutil.cpu_percent(interval=0.1)
            max_cpu = config.get('max_cpu_percent', 90)
            if cpu_percent > max_cpu:
                return ConstraintCheckResult(
                    passed=False,
                    reason=f"CPU usage {cpu_percent}% exceeds limit {max_cpu}%"
                )
            
            # Check memory
            memory = psutil.virtual_memory()
            min_free_mb = config.get('min_free_memory_mb', 512)
            free_mb = memory.available / (1024 * 1024)
            if free_mb < min_free_mb:
                return ConstraintCheckResult(
                    passed=False,
                    reason=f"Free memory {free_mb:.0f}MB below minimum {min_free_mb}MB"
                )
            
            # Check task-specific resource requirements
            task_resources = task.get('required_resources', {})
            if task_resources.get('gpu_required', False):
                # Would check GPU availability here
                pass
            
            return ConstraintCheckResult(
                passed=True,
                details={'cpu_percent': cpu_percent, 'free_memory_mb': free_mb}
            )
            
        except ImportError:
            # psutil not available, skip resource check
            return ConstraintCheckResult(
                passed=True,
                reason="psutil not available, skipping resource check"
            )
    
    def _check_file_constraints(self, task: Dict[str, Any]) -> ConstraintCheckResult:
        """Check file system constraints."""
        config = self.config.get('file_constraints', {})
        
        # Check required paths exist
        for path_str in config.get('required_paths', []):
            path = Path(path_str)
            if not path.exists():
                return ConstraintCheckResult(
                    passed=False,
                    reason=f"Required path does not exist: {path}"
                )
        
        # Check paths are writable
        for path_str in config.get('writable_paths', []):
            path = Path(path_str)
            if path.exists() and not os.access(path, os.W_OK):
                return ConstraintCheckResult(
                    passed=False,
                    reason=f"Path not writable: {path}"
                )
            elif not path.exists():
                # Try to create parent
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                except Exception as e:
                    return ConstraintCheckResult(
                        passed=False,
                        reason=f"Cannot create path {path}: {e}"
                    )
        
        # Check task-specific file requirements
        input_files = task.get('input_files', [])
        for file_path in input_files:
            if not Path(file_path).exists():
                return ConstraintCheckResult(
                    passed=False,
                    reason=f"Required input file not found: {file_path}"
                )
        
        return ConstraintCheckResult(passed=True)
    
    def _check_dependency_constraints(
        self,
        task: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ConstraintCheckResult:
        """Check if all dependencies are satisfied."""
        dependencies = task.get('dependencies', [])
        
        if not dependencies:
            return ConstraintCheckResult(passed=True)
        
        # Get completed tasks from context or queue
        completed_tasks = context.get('completed_tasks', set())
        
        missing = []
        for dep_id in dependencies:
            if dep_id not in completed_tasks:
                missing.append(dep_id)
        
        if missing:
            return ConstraintCheckResult(
                passed=False,
                reason=f"Dependencies not satisfied: {missing}"
            )
        
        return ConstraintCheckResult(passed=True)
    
    def _check_rate_limits(self, task: Dict[str, Any]) -> ConstraintCheckResult:
        """Check if task execution is within rate limits."""
        task_type = task.get('task_type', 'default')
        task_priority = task.get('priority', 'normal')
        
        # Get applicable limits
        limits_config = self.config.get('rate_limits', {})
        
        if task_priority == 'critical':
            limits = limits_config.get('critical_task', limits_config.get('default', {}))
        else:
            limits = limits_config.get(task_type, limits_config.get('default', {}))
        
        max_per_minute = limits.get('max_per_minute', 10)
        max_per_hour = limits.get('max_per_hour', 100)
        
        now = datetime.utcnow()
        
        # Track executions for this task type
        if task_type not in self.rate_limit_windows:
            self.rate_limit_windows[task_type] = []
        
        # Clean old entries
        window = self.rate_limit_windows[task_type]
        window = [t for t in window if (now - t).total_seconds() < 3600]
        self.rate_limit_windows[task_type] = window
        
        # Check minute limit
        recent_minute = [t for t in window if (now - t).total_seconds() < 60]
        if len(recent_minute) >= max_per_minute:
            return ConstraintCheckResult(
                passed=False,
                reason=f"Rate limit exceeded: {len(recent_minute)}/{max_per_minute} per minute"
            )
        
        # Check hour limit
        if len(window) >= max_per_hour:
            return ConstraintCheckResult(
                passed=False,
                reason=f"Rate limit exceeded: {len(window)}/{max_per_hour} per hour"
            )
        
        # Record this execution attempt
        window.append(now)
        
        return ConstraintCheckResult(
            passed=True,
            details={'recent_executions': len(recent_minute), 'hour_executions': len(window)}
        )
    
    def _check_user_approval(
        self,
        task: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ConstraintCheckResult:
        """Check if user approval is required and obtained."""
        config = self.config.get('user_approval_required', {})
        
        task_type = task.get('task_type', '')
        agent_id = task.get('assigned_to', '')
        
        # Check if task type requires approval
        requires_approval = task_type in config.get('task_types', [])
        
        # Check if agent requires approval
        if not requires_approval and agent_id in config.get('agents', []):
            requires_approval = True
        
        # Check task-level flag
        if task.get('requires_approval', False):
            requires_approval = True
        
        if not requires_approval:
            return ConstraintCheckResult(passed=True)
        
        # Check if approved
        if context.get('user_approved', False):
            return ConstraintCheckResult(
                passed=True,
                reason="User approval granted"
            )
        
        # Check workflow approval
        workflow_approved = context.get('workflow_approved', False)
        if workflow_approved:
            return ConstraintCheckResult(
                passed=True,
                reason="Workflow pre-approved"
            )
        
        return ConstraintCheckResult(
            passed=False,
            reason="User approval required but not granted"
        )
    
    def record_execution(self, task_id: str, task_type: str, success: bool):
        """Record task execution for history/rate tracking."""
        self.execution_history.append({
            'task_id': task_id,
            'task_type': task_type,
            'timestamp': datetime.utcnow().isoformat(),
            'success': success
        })
        
        # Trim history if too large
        if len(self.execution_history) > 10000:
            self.execution_history = self.execution_history[-5000:]
    
    def get_constraint_summary(self) -> Dict[str, Any]:
        """Get summary of current constraint state."""
        return {
            'config': self.config,
            'rate_limit_windows': {
                k: len(v) for k, v in self.rate_limit_windows.items()
            },
            'execution_history_size': len(self.execution_history),
            'recent_executions': len([
                e for e in self.execution_history
                if (datetime.utcnow() - datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00'))).total_seconds() < 3600
            ]) if self.execution_history else 0
        }
