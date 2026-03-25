#!/usr/bin/env python3
"""Main Orchestrator - Workflow management and task coordination."""

import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

# Setup workspace path
workspace = Path(__file__).parent.parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB
from orchestrator.queue_manager import QueueManager
from orchestrator.scheduler import Scheduler
from orchestrator.agent_dispatcher import AgentDispatcher
from orchestrator.constraint_checker import ConstraintChecker

logger = logging.getLogger(__name__)


class Orchestrator:
    """Main orchestrator for workflow management.
    
    Coordinates:
    - Workflow submission and decomposition
    - Task scheduling and dispatch
    - Agent selection and assignment
    - Constraint checking
    - Result tracking
    """
    
    # Workflow decomposition templates
    WORKFLOW_TEMPLATES = {
        "execute_run": [
            {
                "task_type": "validate_method",
                "required_skills": ["skill_validation_check"],
                "priority": "high",
                "description": "Validate method before execution"
            },
            {
                "task_type": "execute_method",
                "required_skills": ["skill_method_execution", "skill_logging"],
                "priority": "critical",
                "description": "Execute the method",
                "dependencies": []  # Will be filled with previous task ID
            },
            {
                "task_type": "analyze_results",
                "required_skills": ["skill_success_analysis", "skill_context_parsing"],
                "priority": "normal",
                "description": "Analyze execution results",
                "dependencies": []
            },
            {
                "task_type": "store_results",
                "required_skills": ["skill_chromadb_store", "skill_logging"],
                "priority": "normal",
                "description": "Store results in database",
                "dependencies": []
            }
        ],
        "generate_method": [
            {
                "task_type": "analyze_patterns",
                "required_skills": ["skill_pattern_recognition", "skill_similarity_search"],
                "priority": "normal",
                "description": "Analyze successful patterns"
            },
            {
                "task_type": "generate_hypothesis",
                "required_skills": ["skill_hypothesis_synthesis"],
                "priority": "normal",
                "description": "Generate new hypothesis",
                "dependencies": []
            },
            {
                "task_type": "create_variant",
                "required_skills": ["skill_method_variant", "skill_embedding_mutation"],
                "priority": "high",
                "description": "Create method variant",
                "dependencies": []
            },
            {
                "task_type": "validate_method",
                "required_skills": ["skill_validation_check"],
                "priority": "high",
                "description": "Validate new method",
                "dependencies": []
            }
        ],
        "optimize_strategy": [
            {
                "task_type": "analyze_performance",
                "required_skills": ["skill_success_analysis", "skill_pattern_recognition"],
                "priority": "normal",
                "description": "Analyze current performance"
            },
            {
                "task_type": "evaluate_strategy",
                "required_skills": ["skill_strategy_evaluation", "skill_ab_testing"],
                "priority": "normal",
                "description": "Evaluate strategies",
                "dependencies": []
            },
            {
                "task_type": "tune_hyperparameters",
                "required_skills": ["skill_hyperparameter_tuning"],
                "priority": "high",
                "description": "Tune hyperparameters",
                "dependencies": []
            }
        ],
        "test_workflow": [
            {
                "task_type": "test_task_1",
                "required_skills": ["skill_validation_check"],
                "priority": "normal",
                "description": "First test task"
            },
            {
                "task_type": "test_task_2",
                "required_skills": ["skill_logging"],
                "priority": "normal",
                "description": "Second test task",
                "dependencies": []
            }
        ]
    }
    
    def __init__(
        self,
        persist_dir: Optional[str] = None,
        queue_db_path: str = "orchestrator/queue.db",
        dispatch_method: str = "mock"
    ):
        """Initialize orchestrator.
        
        Args:
            persist_dir: ChromaDB persistence directory
            queue_db_path: Path to SQLite queue database
            dispatch_method: 'subprocess', 'openclaw', or 'mock'
        """
        if persist_dir is None:
            persist_dir = str(workspace / "chroma_data")
        
        self.persist_dir = persist_dir
        self.dispatch_method = dispatch_method
        
        # Initialize components
        logger.info("Initializing ChromaLearningDB...")
        self.db = ChromaLearningDB(persist_dir=persist_dir)
        
        logger.info("Initializing QueueManager...")
        self.queue = QueueManager(db_path=queue_db_path)
        
        logger.info("Initializing Scheduler...")
        self.scheduler = Scheduler(self.queue)
        
        logger.info("Initializing AgentDispatcher...")
        self.dispatcher = AgentDispatcher(workspace_root=str(workspace))
        
        logger.info("Initializing ConstraintChecker...")
        self.constraint_checker = ConstraintChecker()
        
        # Load agents from ChromaDB
        self.agents: List[Dict[str, Any]] = []
        self._load_agents()
        
        # Running state
        self.running = False
        self.processed_count = 0
        self.failed_count = 0
        
        logger.info("Orchestrator initialized successfully")
    
    def _load_agents(self):
        """Load active agents from ChromaDB."""
        if self.db.client is None:
            logger.warning("ChromaDB not available, using empty agent list")
            return
        
        try:
            agents_coll = self.db.client.get_collection("agents")
            results = agents_coll.get(where={"status": "active"})
            
            for i, agent_id in enumerate(results.get("ids", [])):
                meta = results["metadatas"][i]
                self.agents.append({
                    "agent_id": agent_id,
                    "name": meta.get("name", "Unknown"),
                    "skills": json.loads(meta.get("skills_json", "[]")),
                    "capabilities": json.loads(meta.get("capabilities_json", "[]")),
                    "priority": meta.get("priority", "normal"),
                    "agent_type": meta.get("agent_type", "worker"),
                    "is_orchestrator": meta.get("is_orchestrator", "False") == "True"
                })
            
            logger.info(f"Loaded {len(self.agents)} active agents")
        except Exception as e:
            logger.error(f"Failed to load agents: {e}")
    
    def _find_best_agent(self, required_skills: List[str]) -> Optional[str]:
        """Find the best agent for given skills."""
        if not self.agents:
            logger.warning("No agents available")
            return None
        
        candidates = []
        
        for agent in self.agents:
            # Skip orchestrator agents for regular tasks
            if agent.get("is_orchestrator", False):
                continue
            
            # Calculate skill overlap
            agent_skills = set(agent.get("skills", []))
            required = set(required_skills)
            
            if not required.issubset(agent_skills):
                continue
            
            # Calculate score
            priority_score = {"critical": 1.0, "high": 0.8, "normal": 0.5, "low": 0.3}.get(
                agent.get("priority", "normal"), 0.5
            )
            skill_match = len(required) / len(agent_skills) if agent_skills else 0
            
            score = (skill_match * 0.7) + (priority_score * 0.3)
            candidates.append({"agent_id": agent["agent_id"], "score": score})
        
        if not candidates:
            logger.warning(f"No agent found with skills: {required_skills}")
            return None
        
        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates[0]["agent_id"]
    
    def submit_workflow(
        self,
        workflow_name: str,
        context: Optional[Dict] = None,
        user_approval: bool = False
    ) -> str:
        """Submit a workflow for execution.
        
        Args:
            workflow_name: Name of the workflow template
            context: Additional context data
            user_approval: Whether user approval is required
            
        Returns:
            workflow_id
        """
        context = context or {}
        
        # Create workflow entry
        workflow_id = self.queue.create_workflow(
            name=workflow_name,
            user_approval=user_approval,
            metadata=context
        )
        
        # Decompose into tasks
        tasks = self._decompose_workflow(workflow_name, context)
        
        if not tasks:
            logger.error(f"No tasks generated for workflow: {workflow_name}")
            return workflow_id
        
        # Add tasks to queue with dependencies
        previous_task_id = None
        for task_template in tasks:
            task = {
                "task_id": str(uuid4()),
                "workflow_id": workflow_id,
                "task_type": task_template["task_type"],
                "priority": task_template.get("priority", "normal"),
                "required_skills": task_template["required_skills"],
                "input_data": {
                    "description": task_template.get("description", ""),
                    **context
                },
                "dependencies": []
            }
            
            # Set dependency on previous task
            if previous_task_id and task_template.get("dependencies") is not None:
                task["dependencies"] = [previous_task_id]
            
            self.queue.add_task(task)
            previous_task_id = task["task_id"]
        
        logger.info(f"Submitted workflow {workflow_id} with {len(tasks)} tasks")
        return workflow_id
    
    def _decompose_workflow(
        self,
        workflow_name: str,
        context: Dict
    ) -> List[Dict[str, Any]]:
        """Decompose a workflow into tasks."""
        template = self.WORKFLOW_TEMPLATES.get(workflow_name)
        
        if not template:
            logger.warning(f"No template for '{workflow_name}', using generic fallback")
            return [{
                "task_type": "generic_execution",
                "required_skills": ["skill_method_execution"],
                "priority": "normal",
                "description": f"Generic execution for {workflow_name}",
                "dependencies": []
            }]
        
        return template
    
    def run_next_tasks(self, batch_size: int = 5) -> int:
        """Process next batch of ready tasks.
        
        Args:
            batch_size: Maximum tasks to process
            
        Returns:
            Number of tasks dispatched
        """
        # Get ready tasks from scheduler
        ready_tasks = self.scheduler.get_ready_tasks(n=batch_size)
        
        if not ready_tasks:
            return 0
        
        dispatched = 0
        
        for task in ready_tasks:
            # Check constraints
            constraint_result = self.constraint_checker.check_task(task, {
                "completed_tasks": self._get_completed_task_ids(task.get("workflow_id", ""))
            })
            
            if not constraint_result:
                logger.warning(f"Task {task['task_id']} failed constraints: {constraint_result.reason}")
                self.queue.update_task_status(
                    task["task_id"],
                    "failed",
                    error_message=f"Constraint check failed: {constraint_result.reason}"
                )
                continue
            
            # Find best agent
            agent_id = self._find_best_agent(task.get("required_skills", []))
            
            if not agent_id:
                logger.warning(f"No agent available for task {task['task_id']}")
                continue
            
            # Schedule task
            if self.scheduler.schedule_task(task["task_id"], agent_id):
                # Dispatch to agent
                dispatch = self.dispatcher.dispatch(
                    task=task,
                    agent_id=agent_id,
                    method=self.dispatch_method
                )
                
                # Update task status
                self.queue.update_task_status(
                    task["task_id"],
                    "running"
                )
                
                dispatched += 1
                logger.info(f"Dispatched task {task['task_id']} to {agent_id}")
        
        return dispatched
    
    def _get_completed_task_ids(self, workflow_id: str) -> set:
        """Get IDs of completed tasks for a workflow."""
        if not workflow_id:
            return set()
        
        tasks = self.queue.get_tasks_by_workflow(workflow_id)
        return {
            t["task_id"] for t in tasks
            if t.get("status") == "completed"
        }
    
    def update_task_status(self, task_id: str) -> bool:
        """Update status of a running task by checking dispatcher."""
        dispatch = self.dispatcher.check_status(task_id)
        
        if not dispatch:
            return False
        
        if dispatch.status == "completed":
            self.scheduler.complete_task(task_id, dispatch.agent_id)
            self.constraint_checker.record_execution(task_id, "unknown", True)
            self.processed_count += 1
            return True
        
        elif dispatch.status == "failed":
            self.scheduler.fail_task(
                task_id,
                dispatch.agent_id,
                dispatch.error_message or "Unknown error"
            )
            self.constraint_checker.record_execution(task_id, "unknown", False)
            self.failed_count += 1
            return True
        
        return False
    
    def run(self, interval_seconds: float = 5.0, max_iterations: Optional[int] = None):
        """Main orchestrator loop - runs continuously.
        
        Args:
            interval_seconds: Sleep between iterations
            max_iterations: Optional limit on iterations
        """
        logger.info(f"Starting orchestrator loop (interval: {interval_seconds}s)")
        self.running = True
        iteration = 0
        
        try:
            while self.running:
                iteration += 1
                
                # Process ready tasks
                dispatched = self.run_next_tasks(batch_size=5)
                
                # Check on running tasks
                running_tasks = self.queue.get_tasks_by_status("running")
                for task in running_tasks:
                    self.update_task_status(task["task_id"])
                
                # Cleanup old dispatches
                self.dispatcher.cleanup_completed(max_age_hours=1)
                
                # Log status periodically
                if iteration % 10 == 0:
                    stats = self.get_status()
                    logger.info(f"Orchestrator stats: {stats}")
                
                # Check termination conditions
                if max_iterations and iteration >= max_iterations:
                    logger.info(f"Reached max iterations ({max_iterations})")
                    break
                
                # Sleep
                time.sleep(interval_seconds)
                
        except KeyboardInterrupt:
            logger.info("Orchestrator stopped by user")
        except Exception as e:
            logger.error(f"Orchestrator error: {e}")
            raise
        finally:
            self.running = False
    
    def stop(self):
        """Stop the orchestrator loop."""
        logger.info("Stopping orchestrator...")
        self.running = False
    
    def get_status(self) -> Dict[str, Any]:
        """Get current orchestrator status."""
        queue_stats = self.queue.get_task_stats()
        dispatch_stats = self.dispatcher.get_statistics()
        constraint_summary = self.constraint_checker.get_constraint_summary()
        
        return {
            "running": self.running,
            "agents": len(self.agents),
            "workflows": list(self.WORKFLOW_TEMPLATES.keys()),
            "tasks": queue_stats,
            "dispatches": dispatch_stats,
            "processed_count": self.processed_count,
            "failed_count": self.failed_count,
            "rate_limits": constraint_summary.get("rate_limit_windows", {})
        }
    
    def get_workflow_status(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed status of a workflow."""
        workflow = self.queue.get_workflow(workflow_id)
        if not workflow:
            return None
        
        tasks = self.queue.get_tasks_by_workflow(workflow_id)
        
        return {
            "workflow": workflow,
            "tasks": tasks,
            "task_summary": {
                status: len([t for t in tasks if t.get("status") == status])
                for status in ["pending", "assigned", "running", "completed", "failed"]
            }
        }


def main():
    """CLI for orchestrator."""
    import argparse
    
    parser = argparse.ArgumentParser(description="AutoCast Orchestrator")
    parser.add_argument("--run", action="store_true", help="Start continuous execution")
    parser.add_argument("--interval", type=float, default=5.0, help="Poll interval (seconds)")
    parser.add_argument("--dispatch-method", default="mock", choices=["mock", "subprocess", "openclaw"])
    parser.add_argument("--status", action="store_true", help="Show status and exit")
    parser.add_argument("--submit", help="Submit a workflow by name")
    parser.add_argument("--context", help="Workflow context as JSON string")
    parser.add_argument("--max-iterations", type=int, help="Max iterations before stopping")
    
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # Create orchestrator
    orch = Orchestrator(dispatch_method=args.dispatch_method)
    
    if args.status:
        status = orch.get_status()
        print(json.dumps(status, indent=2))
        return 0
    
    if args.submit:
        context = {}
        if args.context:
            context = json.loads(args.context)
        
        workflow_id = orch.submit_workflow(args.submit, context)
        print(f"Submitted workflow: {workflow_id}")
        
        if args.run:
            # Run loop to process the workflow
            orch.run(interval_seconds=args.interval, max_iterations=args.max_iterations or 10)
        
        return 0
    
    if args.run:
        orch.run(interval_seconds=args.interval, max_iterations=args.max_iterations)
        return 0
    
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
