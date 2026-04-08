#!/usr/bin/env python3
"""Submit Workflow - CLI tool for submitting workflows to the orchestrator.

Usage:
    python submit_workflow.py --workflow execute_run
    python submit_workflow.py --workflow generate_method --context '{"method_id": "test_001"}'
    python submit_workflow.py --workflow test_workflow --wait
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional

# Add workspace to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from orchestrator.orchestrator import Orchestrator
from orchestrator.queue_manager import QueueManager


def setup_logging(verbose: bool = False):
    """Setup logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )


def print_workflow_status(workflow_status: dict):
    """Pretty print workflow status."""
    workflow = workflow_status.get("workflow", {})
    summary = workflow_status.get("task_summary", {})
    tasks = workflow_status.get("tasks", [])
    
    print("\n" + "=" * 60)
    print(f"WORKFLOW: {workflow.get('name', 'Unknown')}")
    print(f"ID: {workflow.get('workflow_id', 'N/A')}")
    print(f"Status: {workflow.get('status', 'Unknown')}")
    print(f"Created: {workflow.get('created_at', 'N/A')}")
    print("=" * 60)
    
    print("\nTask Summary:")
    total = 0
    for status, count in summary.items():
        if count > 0:
            icon = {
                "pending": "⏳",
                "assigned": "👤",
                "running": "⚙️",
                "completed": "✅",
                "failed": "❌"
            }.get(status, "•")
            print(f"  {icon} {status.capitalize()}: {count}")
            total += count
    print(f"  Total: {total}")
    
    print("\nTasks:")
    for task in tasks:
        status_icon = {
            "pending": "⏳",
            "assigned": "👤",
            "running": "⚙️",
            "completed": "✅",
            "failed": "❌"
        }.get(task.get("status"), "•")
        
        print(f"  {status_icon} {task.get('task_type', 'Unknown')}")
        print(f"     ID: {task.get('task_id', 'N/A')[:8]}...")
        print(f"     Skills: {', '.join(task.get('required_skills', [])[:3])}")
        print(f"     Status: {task.get('status', 'Unknown')}")


def wait_for_completion(
    orchestrator: Orchestrator,
    workflow_id: str,
    timeout: int = 300,
    poll_interval: float = 2.0
) -> bool:
    """Wait for workflow to complete."""
    print(f"\n⏳ Waiting for workflow {workflow_id[:8]} to complete...")
    print(f"   Timeout: {timeout}s, Poll interval: {poll_interval}s")
    
    start_time = time.time()
    last_status = None
    
    while time.time() - start_time < timeout:
        status = orchestrator.get_workflow_status(workflow_id)
        
        if status:
            summary = status.get("task_summary", {})
            total = sum(summary.values())
            completed = summary.get("completed", 0) + summary.get("failed", 0)
            
            # Only print if status changed
            current_status_str = json.dumps(summary, sort_keys=True)
            if current_status_str != last_status:
                print(f"   Progress: {completed}/{total} tasks completed")
                last_status = current_status_str
            
            # Check if complete
            if completed == total and total > 0:
                print(f"\n✅ Workflow completed!")
                return True
        
        time.sleep(poll_interval)
    
    print(f"\n⚠️  Timeout reached after {timeout}s")
    return False


def main():
    parser = argparse.ArgumentParser(
        description="Submit workflows to the AutoCast Orchestrator"
    )
    
    # Workflow selection
    parser.add_argument(
        "--workflow", "-w",
        required=True,
        choices=["execute_run", "generate_method", "optimize_strategy", "test_workflow"],
        help="Workflow type to submit"
    )
    
    # Context data
    parser.add_argument(
        "--context", "-c",
        help="Workflow context as JSON string (e.g., '{\"key\": \"value\"}')"
    )
    parser.add_argument(
        "--context-file",
        help="Path to JSON file containing workflow context"
    )
    
    # Approval options
    parser.add_argument(
        "--approve", "-a",
        action="store_true",
        help="Mark workflow as pre-approved (skip user approval)"
    )
    
    # Wait options
    parser.add_argument(
        "--wait",
        action="store_true",
        help="Wait for workflow to complete"
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Timeout when waiting (seconds, default: 300)"
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=2.0,
        help="Status poll interval when waiting (seconds, default: 2.0)"
    )
    
    # Output options
    parser.add_argument(
        "--json", "-j",
        action="store_true",
        help="Output raw JSON"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose logging"
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(verbose=args.verbose)
    logger = logging.getLogger(__name__)
    
    # Parse context
    context = {}
    if args.context:
        try:
            context = json.loads(args.context)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in --context: {e}", file=sys.stderr)
            return 1
    elif args.context_file:
        try:
            with open(args.context_file) as f:
                context = json.load(f)
        except Exception as e:
            print(f"Error: Could not read context file: {e}", file=sys.stderr)
            return 1
    
    # Add defaults to context
    if "method_id" not in context:
        import uuid
        context["method_id"] = f"method_{uuid.uuid4().hex[:8]}"
    
    print(f"Submitting workflow: {args.workflow}")
    print(f"Context: {json.dumps(context, indent=2)}")
    
    try:
        # Create orchestrator (connects to existing queue)
        orchestrator = Orchestrator()
        
        # Submit workflow
        workflow_id = orchestrator.submit_workflow(
            workflow_name=args.workflow,
            context=context,
            user_approval=not args.approve
        )
        
        print(f"\n✅ Workflow submitted successfully!")
        print(f"   Workflow ID: {workflow_id}")
        
        # Wait if requested
        if args.wait:
            completed = wait_for_completion(
                orchestrator,
                workflow_id,
                timeout=args.timeout,
                poll_interval=args.poll_interval
            )
        else:
            completed = False
        
        # Get final status
        status = orchestrator.get_workflow_status(workflow_id)
        
        if args.json:
            print(json.dumps(status, indent=2, default=str))
        else:
            if status:
                print_workflow_status(status)
            else:
                print(f"\n⚠️  Could not retrieve workflow status")
        
        # Run a quick processing loop if not waiting (to trigger execution)
        if not args.wait:
            print("\n🔄 Triggering task processing...")
            orchestrator.run_next_tasks(batch_size=10)
            time.sleep(2)  # Give time for mock tasks to complete
            
            # Show updated status
            status = orchestrator.get_workflow_status(workflow_id)
            if status:
                print("\nUpdated status:")
                print_workflow_status(status)
        
        # Determine exit code based on status
        if status:
            summary = status.get("task_summary", {})
            failed = summary.get("failed", 0)
            if failed > 0:
                return 1
        
        return 0
        
    except Exception as e:
        logger.exception("Failed to submit workflow")
        print(f"\n❌ Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
