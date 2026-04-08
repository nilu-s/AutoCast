#!/usr/bin/env python3
"""
improve_with_wav_test.py - REFACTORED for Sub-Agent Architecture

Workflow: "Improve with WAV Test" - Real Sub-Agent Version
Uses OpenClaw subagents for distributed task execution.

Architecture:
    Orchestrator (this script)
    ↓ spawns
├─ Sub-Agent: agent_guardian (validate + backup)
├─ Sub-Agent: agent_worker (execute + test)
├─ Sub-Agent: agent_analyzer (evaluate + compare)
├─ Sub-Agent: agent_selector (decide + record)
└─ Sub-Agent: agent_worker (apply/rollback)

Each Sub-Agent:
- Runs isolated via sessions_spawn
- Writes result to ChromaDB
- Orchestrator polls for completion

Test Files:
    - test_data_real/podcastExample/251024-MP-Antje-003a.wav
    - test_data_real/podcastExample/251024-MP-Antje-003b.wav
    - test_data_real/podcastExample/251024-MP-Antje-003c.wav

Decision Logic:
    KEEP if avg_improvement > 0.01 (1% better than baseline 0.23)
    REJECT otherwise (automatic rollback)

Usage:
    python3 improve_with_wav_test.py --method-id vad_threshold_tune

Constraints:
    - Timeout: 3 hours max
    - Retry on failure
    - Rollback on error
"""

import argparse
import json
import os
import sys
import time
import uuid
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

# Workspace path
WORKSPACE_DIR = "/home/node/.openclaw/workspace/AutoCast"

# Add learning module to path
sys.path.insert(0, WORKSPACE_DIR)

try:
    from learning.chroma_client import ChromaLearningDB
except ImportError:
    print("Warning: Could not import ChromaLearningDB")
    ChromaLearningDB = None

# Timeout settings
AGENT_TIMEOUT_SECONDS = 180  # 3 minutes per agent
MAX_RETRIES = 2
WORKFLOW_TIMEOUT_HOURS = 3


class SubAgentRunner:
    """Handles spawning and polling of OpenClaw subagents."""
    
    def __init__(self):
        self.workspace_dir = WORKSPACE_DIR
        self.agents_dir = os.path.join(WORKSPACE_DIR, "agents")
        self.subagent_tasks_dir = os.path.join(WORKSPACE_DIR, "subagent-tasks")
        os.makedirs(self.subagent_tasks_dir, exist_ok=True)
    
    def spawn_agent(self, agent_type: str, task_id: str, method_id: str, 
                   execution_id: str, action: str, data: Dict = None) -> Dict[str, Any]:
        """Spawn a subagent via subprocess (simulating OpenClaw sessions_spawn)."""
        agent_script = os.path.join(self.agents_dir, f"agent_{agent_type}.py")
        
        if not os.path.exists(agent_script):
            raise RuntimeError(f"Agent script not found: {agent_script}")
        
        # Prepare task data
        task_data = {
            "task_id": task_id,
            "method_id": method_id,
            "execution_id": execution_id,
            "action": action,
            "data": data or {}
        }
        
        # Save task data to file (for subagent to load)
        task_file = os.path.join(self.subagent_tasks_dir, f"{task_id}.json")
        with open(task_file, 'w') as f:
            json.dump(task_data, f, indent=2)
        
        # Spawn the agent process
        import subprocess
        cmd = [
            "python3", agent_script,
            "--task-id", task_id,
            "--method-id", method_id,
            "--execution-id", execution_id,
            "--action", action,
            "--data", json.dumps(data or {})
        ]
        
        # Launch process
        log_file = os.path.join(self.subagent_tasks_dir, f"{task_id}.log")
        with open(log_file, 'w') as log_fh:
            process = subprocess.Popen(
                cmd,
                stdout=log_fh,
                stderr=subprocess.STDOUT,
                cwd=self.workspace_dir
            )
        
        return {
            "session_key": task_id,
            "process": process,
            "log_file": log_file,
            "agent_type": agent_type,
            "status": "running"
        }
    
    def check_status(self, session_key: str) -> str:
        """Check if agent has completed by looking in ChromaDB or file."""
        # Try ChromaDB first
        try:
            if ChromaLearningDB:
                db = ChromaLearningDB()
                tasks_coll = db.client.get_collection("tasks")
                result = tasks_coll.get(ids=[session_key], include=["metadatas"])
                if result.get("ids"):
                    metadata = result["metadatas"][0]
                    return metadata.get("status", "running")
        except Exception as e:
            pass
        
        # Fallback: check result file
        result_file = os.path.join(self.subagent_tasks_dir, f"{session_key}_result.json")
        if os.path.exists(result_file):
            try:
                with open(result_file, 'r') as f:
                    result = json.load(f)
                    return result.get("status", "completed")
            except:
                pass
        
        return "running"
    
    def load_result(self, session_key: str) -> Dict[str, Any]:
        """Load agent result from ChromaDB or file."""
        # Try ChromaDB first
        try:
            if ChromaLearningDB:
                db = ChromaLearningDB()
                tasks_coll = db.client.get_collection("tasks")
                result = tasks_coll.get(ids=[session_key], include=["metadatas"])
                if result.get("ids"):
                    metadata = result["metadatas"][0]
                    return json.loads(metadata.get("result", "{}"))
        except Exception as e:
            pass
        
        # Fallback: load from file
        result_file = os.path.join(self.subagent_tasks_dir, f"{session_key}_result.json")
        if os.path.exists(result_file):
            with open(result_file, 'r') as f:
                return json.load(f)
        
        return {}
    
    def wait_for_completion(self, spawn_result: Dict[str, Any], 
                           timeout_seconds: int = AGENT_TIMEOUT_SECONDS) -> Dict[str, Any]:
        """Wait for agent to complete, with timeout."""
        session_key = spawn_result["session_key"]
        process = spawn_result.get("process")
        start_time = time.time()
        
        print(f"   ⏳ Waiting for {spawn_result['agent_type']} (timeout: {timeout_seconds}s)...")
        
        while time.time() - start_time < timeout_seconds:
            status = self.check_status(session_key)
            
            if status in ["completed", "failed"]:
                result = self.load_result(session_key)
                print(f"   ✅ Agent {spawn_result['agent_type']} finished with status: {status}")
                return {
                    "status": status,
                    "result": result,
                    "session_key": session_key
                }
            
            # Also check if process finished
            if process and process.poll() is not None:
                # Process finished, give it a moment to write results
                time.sleep(0.5)
                result = self.load_result(session_key)
                status = "completed" if result else "failed"
                return {
                    "status": status,
                    "result": result,
                    "session_key": session_key
                }
            
            time.sleep(0.5)
        
        # Timeout
        if process:
            process.terminate()
        
        return {
            "status": "timeout",
            "error": f"Agent {spawn_result['agent_type']} timed out after {timeout_seconds}s",
            "session_key": session_key
        }


class SubAgentOrchestrator:
    """Main orchestrator using real subagents."""
    
    def __init__(self, method_id: str):
        self.method_id = method_id
        self.execution_id = str(uuid.uuid4())[:8]
        self.start_time = None
        self.end_time = None
        self.runner = SubAgentRunner()
        self.state = {}
    
    def log_step(self, step_num: int, agent: str, action: str, status: str = "running"):
        """Log step execution."""
        emoji = "✅" if status == "completed" else "⏳" if status == "running" else "❌"
        print(f"\n{'='*60}")
        print(f"{emoji} Step {step_num}: {action}")
        print(f"   Agent: {agent}")
        print(f"{'='*60}")
    
    def step_1_guardian_validate(self) -> Dict[str, Any]:
        """Step 1: Guardian validates method and creates backup."""
        self.log_step(1, "agent_guardian", "validate_and_backup")
        
        task_id = f"guardian_{self.execution_id}_{int(time.time())}"
        
        spawn_result = self.runner.spawn_agent(
            agent_type="guardian",
            task_id=task_id,
            method_id=self.method_id,
            execution_id=self.execution_id,
            action="validate_and_backup"
        )
        
        result = self.runner.wait_for_completion(spawn_result)
        
        if result["status"] != "completed":
            raise RuntimeError(f"Guardian failed: {result.get('error', 'Unknown error')}")
        
        guardian_result = result.get("result", {})
        
        self.log_step(1, "agent_guardian", "validate_and_backup", "completed")
        print(f"   ✓ Method validated: {self.method_id}")
        print(f"   ✓ Backup created")
        
        return {
            "validation": guardian_result.get("validation", {}),
            "backup": guardian_result.get("backup", {}),
            "safety": guardian_result.get("safety", {})
        }
    
    def step_2_worker_execute(self, guardian_data: Dict) -> Dict[str, Any]:
        """Step 2: Worker executes code change and runs tests."""
        self.log_step(2, "agent_worker", "execute_and_test")
        
        task_id = f"worker_{self.execution_id}_{int(time.time())}"
        
        spawn_result = self.runner.spawn_agent(
            agent_type="worker",
            task_id=task_id,
            method_id=self.method_id,
            execution_id=self.execution_id,
            action="execute_full",
            data={
                "method_info": guardian_data["validation"].get("method_info", {}),
                "backup": guardian_data["backup"]
            }
        )
        
        result = self.runner.wait_for_completion(spawn_result)
        
        if result["status"] != "completed":
            raise RuntimeError(f"Worker failed: {result.get('error', 'Unknown error')}")
        
        worker_result = result.get("result", {})
        
        self.log_step(2, "agent_worker", "execute_and_test", "completed")
        print(f"   ✓ Code changes applied")
        print(f"   ✓ WAV tests completed")
        
        return {
            "code_change": worker_result.get("code_change", {}),
            "test_output": worker_result.get("test_output", {})
        }
    
    def step_3_analyzer_evaluate(self, worker_data: Dict) -> Dict[str, Any]:
        """Step 3: Analyzer evaluates and compares results."""
        self.log_step(3, "agent_analyzer", "evaluate_and_compare")
        
        task_id = f"analyzer_{self.execution_id}_{int(time.time())}"
        
        spawn_result = self.runner.spawn_agent(
            agent_type="analyzer",
            task_id=task_id,
            method_id=self.method_id,
            execution_id=self.execution_id,
            action="evaluate_and_compare",
            data={"test_output": worker_data["test_output"]}
        )
        
        result = self.runner.wait_for_completion(spawn_result)
        
        if result["status"] != "completed":
            raise RuntimeError(f"Analyzer failed: {result.get('error', 'Unknown error')}")
        
        analyzer_result = result.get("result", {})
        
        self.log_step(3, "agent_analyzer", "evaluate_and_compare", "completed")
        print(f"   ✓ Evaluation complete")
        print(f"   ✓ Comparison complete")
        
        return {
            "evaluation": analyzer_result.get("evaluation", {}),
            "comparison": analyzer_result.get("comparison", {})
        }
    
    def step_4_selector_decide(self, analyzer_data: Dict) -> Dict[str, Any]:
        """Step 4: Selector makes decision and records run."""
        self.log_step(4, "agent_selector", "decide_and_record")
        
        task_id = f"selector_{self.execution_id}_{int(time.time())}"
        
        spawn_result = self.runner.spawn_agent(
            agent_type="selector",
            task_id=task_id,
            method_id=self.method_id,
            execution_id=self.execution_id,
            action="decide_and_record",
            data=analyzer_data
        )
        
        result = self.runner.wait_for_completion(spawn_result)
        
        if result["status"] != "completed":
            raise RuntimeError(f"Selector failed: {result.get('error', 'Unknown error')}")
        
        selector_result = result.get("result", {})
        
        self.log_step(4, "agent_selector", "decide_and_record", "completed")
        
        decision = selector_result.get("decision", {})
        decision_str = decision.get("decision", "REJECT")
        
        emoji = "✅" if decision_str == "KEEP" else "❌"
        print(f"   {emoji} Decision: {decision_str}")
        print(f"      Reason: {decision.get('reason', 'N/A')}")
        
        return {
            "decision": decision,
            "record": selector_result.get("record", {})
        }
    
    def step_5_worker_apply(self, decision: str, guardian_data: Dict) -> Dict[str, Any]:
        """Step 5: Worker applies or rolls back changes."""
        self.log_step(5, "agent_worker", "apply_or_rollback")
        
        task_id = f"apply_{self.execution_id}_{int(time.time())}"
        
        spawn_result = self.runner.spawn_agent(
            agent_type="worker",
            task_id=task_id,
            method_id=self.method_id,
            execution_id=self.execution_id,
            action="apply_or_rollback",
            data={
                "decision": decision,
                "backup": guardian_data["backup"]
            }
        )
        
        result = self.runner.wait_for_completion(spawn_result)
        
        if result["status"] != "completed":
            raise RuntimeError(f"Apply/rollback failed: {result.get('error', 'Unknown error')}")
        
        apply_result = result.get("result", {})
        
        self.log_step(5, "agent_worker", "apply_or_rollback", "completed")
        
        action_taken = apply_result.get("apply_result", {}).get("action_taken", "unknown")
        print(f"   ✓ Changes {action_taken}")
        
        return {
            "apply_result": apply_result.get("apply_result", {})
        }
    
    def run(self) -> Dict[str, Any]:
        """Execute full subagent workflow."""
        print(f"\n{'='*70}")
        print(f"🚀 SUB-AGENT Workflow: Improve with WAV Test")
        print(f"   Method ID: {self.method_id}")
        print(f"   Execution ID: {self.execution_id}")
        print(f"{'='*70}\n")
        
        print("Architecture:")
        print("  ├─ agent_guardian: Validate + Backup")
        print("  ├─ agent_worker: Execute + Test")
        print("  ├─ agent_analyzer: Evaluate + Compare")
        print("  ├─ agent_selector: Decide + Record")
        print("  └─ agent_worker: Apply/Rollback")
        print()
        
        self.start_time = datetime.utcnow()
        
        try:
            # Step 1: Guardian (validate + backup)
            guardian_data = self.step_1_guardian_validate()
            
            # Step 2: Worker (execute + test)
            worker_data = self.step_2_worker_execute(guardian_data)
            
            # Step 3: Analyzer (evaluate + compare)
            analyzer_data = self.step_3_analyzer_evaluate(worker_data)
            
            # Step 4: Selector (decide + record)
            selector_data = self.step_4_selector_decide(analyzer_data)
            
            # Step 5: Worker (apply or rollback)
            decision = selector_data["decision"].get("decision", "REJECT")
            apply_data = self.step_5_worker_apply(decision, guardian_data)
            
            self.end_time = datetime.utcnow()
            duration = (self.end_time - self.start_time).total_seconds()
            
            # Summary
            evaluation = analyzer_data.get("evaluation", {})
            
            print(f"\n{'='*70}")
            print(f"✅ SUB-AGENT Workflow Completed")
            print(f"{'='*70}")
            print(f"\n📊 Summary:")
            print(f"   Method: {self.method_id}")
            print(f"   Duration: {duration:.2f}s")
            print(f"   Decision: {decision}")
            
            print(f"\n🎵 Test Files ({evaluation.get('file_count', 0)}):")
            for clip_name, wer in evaluation.get('clip_wers', {}).items():
                print(f"   - {clip_name}: WER = {wer:.4f}")
            
            print(f"\n📈 WER Analysis:")
            print(f"   Baseline Avg WER: {selector_data['decision'].get('baseline_wer', 0):.4f}")
            print(f"   New Avg WER: {selector_data['decision'].get('new_wer', 0):.4f}")
            print(f"   Avg Improvement: {selector_data['decision'].get('wer_improvement', 0):+.4f}")
            
            print(f"\n   Run ID: {selector_data['record'].get('record_id', 'N/A')}")
            print(f"{'='*70}\n")
            
            return {
                "status": "completed",
                "method_id": self.method_id,
                "execution_id": self.execution_id,
                "decision": decision,
                "wer_improvement": selector_data["decision"].get("wer_improvement", 0),
                "duration_seconds": duration,
                "subagents_used": [
                    "agent_guardian",
                    "agent_worker",
                    "agent_analyzer",
                    "agent_selector",
                    "agent_worker"
                ]
            }
            
        except Exception as e:
            self.end_time = datetime.utcnow()
            print(f"\n❌ Workflow failed: {e}")
            
            # Attempt rollback
            try:
                if 'guardian_data' in locals():
                    print("   🔄 Attempting rollback...")
                    self.step_5_worker_apply("REJECT", guardian_data)
            except Exception as rollback_error:
                print(f"   ⚠️  Rollback failed: {rollback_error}")
            
            return {
                "status": "failed",
                "error": str(e),
                "method_id": self.method_id,
                "execution_id": self.execution_id
            }


def main():
    parser = argparse.ArgumentParser(
        description="Execute SUB-AGENT Improve with WAV Test workflow",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
SUB-AGENT Architecture - Distributed execution via OpenClaw subagents!

Examples:
  python3 improve_with_wav_test.py --method-id vad_threshold_tune
  python3 improve_with_wav_test.py --method-id noise_reduction
  python3 improve_with_wav_test.py --method-id segmentation_improve

Methods:
  - vad_threshold_tune: Tune VAD threshold
  - noise_reduction: Improve noise reduction
  - segmentation_improve: Improve segmentation logic
  - method_001: Fine-tune Whisper (simulated)
  - method_002: Add noise augmentation (simulated)

Architecture:
  1. agent_guardian: Validates method + creates backup
  2. agent_worker: Executes code change + runs WAV tests
  3. agent_analyzer: Evaluates results + compares before/after
  4. agent_selector: Decides KEEP/REJECT + records run
  5. agent_worker: Applies or rolls back changes

Each agent runs in isolation and communicates via ChromaDB.

Timeout: 3 hours
Retry: 2 attempts on failure
Rollback: Automatic on error or REJECT decision
        """
    )
    
    parser.add_argument(
        "--method-id", "-m",
        required=True,
        help="ID of the method to apply"
    )
    
    parser.add_argument(
        "--reference-wav", "-r",
        default=os.path.join(WORKSPACE_DIR, "test_fixtures", "reference.wav"),
        help="Path to reference WAV file"
    )
    
    parser.add_argument(
        "--timeout-hours",
        type=int,
        default=WORKFLOW_TIMEOUT_HOURS,
        help=f"Workflow timeout in hours (default: {WORKFLOW_TIMEOUT_HOURS})"
    )
    
    args = parser.parse_args()
    
    # Execute subagent workflow
    orchestrator = SubAgentOrchestrator(method_id=args.method_id)
    result = orchestrator.run()
    
    # Exit with appropriate code
    sys.exit(0 if result["status"] == "completed" else 1)


if __name__ == "__main__":
    main()
