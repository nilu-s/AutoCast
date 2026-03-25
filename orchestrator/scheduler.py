#!/usr/bin/env python3
"""Scheduler - Manages task scheduling and resource allocation."""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ResourceRequirements:
    """Resource requirements for a task."""
    cpu_cores: float = 1.0
    memory_mb: int = 512
    gpu_required: bool = False
    estimated_duration_minutes: int = 30
    max_parallel: int = 1  # How many of these can run in parallel


@dataclass
class ScheduledTask:
    """A task with scheduling information."""
    task_id: str
    task_type: str
    priority: str
    required_skills: List[str]
    resources: ResourceRequirements
    dependencies: List[str]
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    assigned_agent: Optional[str] = None


class Scheduler:
    """Task scheduler that determines what runs when.
    
    Key responsibilities:
    - Determine task execution order based on dependencies
    - Respect resource constraints
    - Balance load across agents
    - Handle priority scheduling
    """
    
    def __init__(self, queue_manager):
        self.queue = queue_manager
        self.agent_workloads: Dict[str, int] = {}
        self.resource_pools: Dict[str, Dict] = {}
        self.max_parallel_per_agent = 3  # Default max concurrent tasks per agent
        
        # Priority weights for scheduling
        self.priority_weights = {
            'critical': 100,
            'high': 50,
            'normal': 10,
            'low': 1
        }
        
        logger.info("Scheduler initialized")
    
    def get_ready_tasks(self, n: int = 5) -> List[Dict[str, Any]]:
        """Get tasks that are ready to execute.
        
        Returns tasks that:
        1. Have status 'pending'
        2. Have no unresolved dependencies
        3. Have resources available
        
        Sorted by priority and creation time.
        """
        # Get pending tasks with no unresolved dependencies
        candidates = self.queue.get_next_tasks(n=20, status='pending')
        
        if not candidates:
            return []
        
        # Score and rank tasks
        scored_tasks = []
        for task in candidates:
            score = self._calculate_task_score(task)
            scored_tasks.append((score, task))
        
        # Sort by score (higher is better)
        scored_tasks.sort(key=lambda x: x[0], reverse=True)
        
        # Filter by resource availability
        ready_tasks = []
        for _, task in scored_tasks:
            if self._check_resource_availability(task):
                ready_tasks.append(task)
                if len(ready_tasks) >= n:
                    break
        
        logger.debug(f"Found {len(ready_tasks)} ready tasks (requested {n})")
        return ready_tasks
    
    def _calculate_task_score(self, task: Dict[str, Any]) -> float:
        """Calculate scheduling score for a task.
        
        Higher score = higher priority for execution.
        """
        score = 0.0
        
        # Base priority score
        priority = task.get('priority', 'normal')
        score += self.priority_weights.get(priority, 0)
        
        # Age factor - older tasks get slight boost
        created_at = task.get('created_at', datetime.utcnow().isoformat())
        try:
            created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            age_hours = (datetime.utcnow() - created).total_seconds() / 3600
            score += min(age_hours * 0.5, 10)  # Cap at 10 points
        except:
            pass
        
        # Retry penalty (tasks that failed before)
        retry_count = task.get('retry_count', 0)
        score -= retry_count * 5
        
        return score
    
    def _check_resource_availability(self, task: Dict[str, Any]) -> bool:
        """Check if resources are available for this task."""
        # Parse required skills to estimate resource needs
        required_skills = task.get('required_skills', [])
        
        # Simple heuristic based on skill types
        if 'skill_method_execution' in required_skills:
            # Assume these need significant compute
            pass
        
        # Check if any agent has capacity
        for agent_id, workload in self.agent_workloads.items():
            if workload < self.max_parallel_per_agent:
                return True
        
        # If no agents tracked yet, assume capacity exists
        if not self.agent_workloads:
            return True
        
        return False
    
    def schedule_task(
        self,
        task_id: str,
        agent_id: str,
        estimated_duration: int = 30
    ) -> bool:
        """Schedule a task for execution on a specific agent."""
        task = self.queue.get_task(task_id)
        if not task:
            logger.error(f"Task {task_id} not found")
            return False
        
        # Update agent workload
        self.agent_workloads[agent_id] = self.agent_workloads.get(agent_id, 0) + 1
        
        # Mark task as assigned
        success = self.queue.update_task_status(
            task_id=task_id,
            status='assigned',
            assigned_to=agent_id
        )
        
        if success:
            logger.info(f"Scheduled task {task_id} on agent {agent_id}")
        
        return success
    
    def complete_task(self, task_id: str, agent_id: str) -> bool:
        """Mark task as completed and free resources."""
        # Reduce agent workload
        if agent_id in self.agent_workloads:
            self.agent_workloads[agent_id] = max(0, self.agent_workloads[agent_id] - 1)
        
        # Update task status
        return self.queue.update_task_status(
            task_id=task_id,
            status='completed'
        )
    
    def fail_task(self, task_id: str, agent_id: str, error_message: str) -> bool:
        """Mark task as failed and decide if it should be retried."""
        # Reduce agent workload
        if agent_id in self.agent_workloads:
            self.agent_workloads[agent_id] = max(0, self.agent_workloads[agent_id] - 1)
        
        task = self.queue.get_task(task_id)
        if not task:
            return False
        
        retry_count = task.get('retry_count', 0)
        max_retries = task.get('max_retries', 3)
        
        if retry_count < max_retries:
            # Retry the task
            new_retry_count = self.queue.increment_retry(task_id)
            logger.warning(
                f"Task {task_id} failed, retrying ({new_retry_count}/{max_retries}): {error_message}"
            )
            return True
        else:
            # Mark as permanently failed
            self.queue.update_task_status(
                task_id=task_id,
                status='failed',
                error_message=error_message
            )
            logger.error(f"Task {task_id} failed permanently after {max_retries} retries")
            return False
    
    def get_agent_load(self, agent_id: str) -> Dict[str, Any]:
        """Get current load information for an agent."""
        current_tasks = self.agent_workloads.get(agent_id, 0)
        
        # Get tasks from queue
        running_tasks = self.queue.get_tasks_by_status('running')
        assigned_to_agent = [t for t in running_tasks if t.get('assigned_to') == agent_id]
        
        return {
            'agent_id': agent_id,
            'current_tasks': len(assigned_to_agent),
            'max_parallel': self.max_parallel_per_agent,
            'utilization': len(assigned_to_agent) / self.max_parallel_per_agent,
            'available_slots': self.max_parallel_per_agent - len(assigned_to_agent)
        }
    
    def get_schedule_summary(self) -> Dict[str, Any]:
        """Get summary of current schedule state."""
        stats = self.queue.get_task_stats()
        
        return {
            'total_tasks': sum(stats.values()),
            'by_status': stats,
            'agent_workloads': dict(self.agent_workloads),
            'ready_for_execution': len(self.get_ready_tasks(n=100))
        }
    
    def optimize_schedule(self) -> List[Dict[str, Any]]:
        """Re-optimize current schedule based on priorities.
        
        Returns recommended changes.
        """
        # Get all pending tasks
        pending = self.queue.get_tasks_by_status('pending', limit=1000)
        
        # Re-score and suggest reassignments if beneficial
        recommendations = []
        
        for task in pending:
            current_score = self._calculate_task_score(task)
            
            # Check if should be promoted due to age
            if current_score > 50:  # High priority threshold
                recommendations.append({
                    'action': 'prioritize',
                    'task_id': task['task_id'],
                    'reason': f"High score ({current_score:.1f}), consider prioritizing"
                })
        
        return recommendations
    
    def check_dependencies(self, task_id: str) -> Tuple[bool, List[str]]:
        """Check if all dependencies for a task are satisfied.
        
        Returns (is_satisfied, list_of_unsatisfied_deps).
        """
        task = self.queue.get_task(task_id)
        if not task:
            return False, []
        
        dependencies = task.get('dependencies', [])
        if not dependencies:
            return True, []
        
        unsatisfied = []
        for dep_id in dependencies:
            dep_task = self.queue.get_task(dep_id)
            if not dep_task:
                unsatisfied.append(f"{dep_id} (not found)")
            elif dep_task.get('status') not in ['completed']:
                unsatisfied.append(f"{dep_id} (status: {dep_task.get('status')})")
        
        return len(unsatisfied) == 0, unsatisfied
