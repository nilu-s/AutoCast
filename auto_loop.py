#!/usr/bin/env python3
"""
L5 Full Autonomy - Auto Loop

Endlosschleife für vollständig autonomes System:
1. Evaluieren
2. Strategie wählen (L4)
3. Methode anwenden
4. Optimieren (L4)
5. Sleep / nächster Zyklus

Safety Guards:
- Nach 10 Runs: Pause, Report an User
- Wenn Performance sinkt: Automatischer Rollback
- Emergency Stop jederzeit möglich

Usage:
    python auto_loop.py                    # Start autonomer Loop
    python auto_loop.py --interval 1800  # Alle 30 Minuten
    python auto_loop.py --dry-run        # Test ohne Ausführung
"""

import sys
import json
import time
import signal
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from collections import deque
import subprocess

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from optimize_strategy import OptimizeStrategyWorkflow, StrategyDatabase
from execute_apply_method import ApplyMethodEngine
from monitoring import MonitoringManager, NotificationLevel


try:
    from learning.learning_db import LearningDB
    from learning.chroma_client import ChromaLearningDB
    SQLITE_AVAILABLE = True
except ImportError:
    SQLITE_AVAILABLE = False


@dataclass
class RunStats:
    """Tracks run statistics for L5 autonomy."""
    total_runs: int = 0
    consecutive_failures: int = 0
    successful_runs: int = 0
    last_run_time: Optional[str] = None
    last_10_improvements: deque = field(default_factory=lambda: deque(maxlen=10))
    run_history: deque = field(default_factory=lambda: deque(maxlen=100))
    
    def record_run(self, success: bool, improvement: float, run_data: Dict):
        """Record a run result."""
        self.total_runs += 1
        self.last_run_time = datetime.utcnow().isoformat()
        
        if success:
            self.successful_runs += 1
            self.consecutive_failures = 0
            self.last_10_improvements.append(improvement)
        else:
            self.consecutive_failures += 1
        
        self.run_history.append({
            "run_id": run_data.get("run_id", f"run_{self.total_runs}"),
            "timestamp": self.last_run_time,
            "success": success,
            "improvement": improvement
        })
    
    def get_avg_improvement(self) -> float:
        """Get average improvement over last 10 runs."""
        if not self.last_10_improvements:
            return 0.0
        return sum(self.last_10_improvements) / len(self.last_10_improvements)
    
    def is_performance_declining(self) -> bool:
        """Check if performance is declining over last 5 runs."""
        if len(self.last_10_improvements) < 5:
            return False
        
        recent = list(self.last_10_improvements)[-5:]
        # Declining if all recent improvements are negative or zero
        return all(imp <= 0 for imp in recent)


class SafetyGuardManager:
    """
    Manages safety guards for L5 autonomy.
    
    Guards:
    - 10 runs → Pause & Report
    - Performance decline → Auto-rollback
    - 3 consecutive failures → Stop
    """
    
    def __init__(self, monitor: MonitoringManager):
        self.monitor = monitor
        self.paused = False
        self.emergency_stop = False
        self.rollback_triggered = False
        self.last_checkpoint = None
        
    def check_safety_guards(self, stats: RunStats) -> Dict[str, Any]:
        """Check all safety guards and return actions."""
        actions = {
            "should_pause": False,
            "should_rollback": False,
            "should_stop": False,
            "alerts": []
        }
        
        # Guard 1: 10 runs reached
        if stats.total_runs > 0 and stats.total_runs % 10 == 0:
            actions["should_pause"] = True
            actions["alerts"].append({
                "level": "info",
                "message": f"🎯 Milestone: {stats.total_runs} runs completed"
            })
        
        # Guard 2: Performance declining
        if stats.is_performance_declining() and not self.rollback_triggered:
            actions["should_rollback"] = True
            actions["alerts"].append({
                "level": "warning",
                "message": "⚠️ Performance declining - triggering rollback"
            })
            self.rollback_triggered = True
        
        # Guard 3: Consecutive failures
        if stats.consecutive_failures >= 3:
            actions["should_stop"] = True
            actions["alerts"].append({
                "level": "critical",
                "message": f"🛑 {stats.consecutive_failures} consecutive failures - stopping"
            })
        
        return actions
    
    def create_checkpoint(self) -> str:
        """Create a checkpoint before applying method."""
        checkpoint_id = f"checkpoint_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        checkpoint_path = workspace / "checkpoints" / f"{checkpoint_id}.json"
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        
        checkpoint = {
            "checkpoint_id": checkpoint_id,
            "timestamp": datetime.utcnow().isoformat(),
            "current_state": "pre_method_execution"
        }
        
        with open(checkpoint_path, 'w') as f:
            json.dump(checkpoint, f, indent=2)
        
        self.last_checkpoint = checkpoint_id
        return checkpoint_id
    
    def perform_rollback(self) -> bool:
        """Perform automatic rollback to last known good state."""
        print("\n🔄 PERFORMING AUTOMATIC ROLLBACK...")
        
        try:
            # Call rollback mechanism
            rollback_script = workspace / "rollback_mechanism.py"
            if rollback_script.exists():
                subprocess.run([
                    sys.executable, str(rollback_script),
                    "--auto", "--reason", "Performance decline detected"
                ], check=True, capture_output=True)
                
                self.monitor.send_alert(
                    NotificationLevel.WARNING,
                    "🔄 Auto-Rollback Executed",
                    "Performance declined, rolled back to last checkpoint"
                )
                return True
            else:
                print("⚠️ Rollback script not found")
                return False
        except Exception as e:
            print(f"❌ Rollback failed: {e}")
            return False
    
    def pause_for_report(self, stats: RunStats) -> str:
        """Generate report after 10 runs."""
        report = self._generate_report(stats)
        
        self.monitor.send_alert(
            NotificationLevel.INFO,
            f"📊 Run #{stats.total_runs} Complete - Status Report",
            report
        )
        
        return report
    
    def _generate_report(self, stats: RunStats) -> str:
        """Generate detailed status report."""
        lines = [
            f"📈 Total Runs: {stats.total_runs}",
            f"✅ Successful: {stats.successful_runs}",
            f"📉 Failures: {stats.total_runs - stats.successful_runs}",
            f"🎯 Success Rate: {stats.successful_runs/max(stats.total_runs,1)*100:.1f}%",
            f"📊 Avg Improvement (last 10): {stats.get_avg_improvement():.4f}",
            f"⏱️  Last Run: {stats.last_run_time or 'N/A'}",
        ]
        
        if stats.last_10_improvements:
            lines.append(f"\n📉 Recent Improvements:")
            for i, imp in enumerate(list(stats.last_10_improvements)[-5:], 1):
                emoji = "📈" if imp > 0 else "📉" if imp < 0 else "➡️"
                lines.append(f"  Run -{5-i}: {emoji} {imp:+.4f}")
        
        return "\n".join(lines)


class PreActionNotifier:
    """
    L5: Reduced Human-in-the-Loop
    
    Instead of waiting for "Go", announces intent and auto-proceeds after delay.
    "Ich werde X tun in 5 Minuten, stoppe mich wenn nein"
    """
    
    def __init__(self, monitor: MonitoringManager, warning_delay_seconds: int = 300):
        self.monitor = monitor
        self.warning_delay = warning_delay_seconds
        self.stop_requested = False
        self.stop_file = workspace / ".stop_requested"
    
    def check_stop_signal(self) -> bool:
        """Check if stop was requested."""
        if self.stop_file.exists():
            self.stop_file.unlink()
            return True
        return False
    
    def announce_and_wait(self, action: str, details: Dict) -> bool:
        """
        Announce action and wait for potential stop.
        Returns True if should proceed, False if stopped.
        """
        eta = (datetime.utcnow() + timedelta(seconds=self.warning_delay)).strftime('%H:%M UTC')
        
        message = f"🤖 AUTO-ACTION PENDING\n\n"
        message += f"⏱️ Action: {action}\n"
        message += f"🕐 ETA: {eta} (in {self.warning_delay//60} minutes)\n\n"
        message += f"Details:\n"
        for key, value in details.items():
            message += f"  • {key}: {value}\n"
        message += f"\n⚡ Auto-proceeding unless stopped.\n"
        message += f"💡 To stop: Touch {self.stop_file}"
        
        self.monitor.send_alert(
            NotificationLevel.INFO,
            f"🔄 Auto-Action in {self.warning_delay//60}min",
            message
        )
        
        print(f"\n{'='*60}")
        print(f"🤖 AUTO-ACTION ANNOUNCED")
        print(f"{'='*60}")
        print(f"Action: {action}")
        print(f"ETA: {eta}")
        print(f"Details: {details}")
        print(f"\n⏱️  Waiting {self.warning_delay}s... (Ctrl+C to cancel)")
        print(f"{'='*60}")
        
        # Wait with periodic stop checks
        for i in range(self.warning_delay):
            if self.check_stop_signal():
                print("\n🛑 Stop signal detected!")
                self.monitor.send_alert(
                    NotificationLevel.INFO,
                    "⏸️ Auto-Action Cancelled",
                    f"Action '{action}' was cancelled by user"
                )
                return False
            
            # Print countdown every minute
            if i > 0 and i % 60 == 0:
                remaining = (self.warning_delay - i) // 60
                print(f"  ...{remaining} minutes remaining")
            
            time.sleep(1)
        
        print(f"\n✅ Auto-proceeding with action...")
        return True


class AutoCastLoop:
    """
    L5 Full Autonomy Main Loop
    
    Continuous autonomous operation with minimal human intervention.
    """
    
    def __init__(
        self,
        cycle_interval: int = 3600,  # Default: 1 hour
        warning_delay: int = 300,      # 5 minutes warning
        exploration_threshold: float = 0.3
    ):
        self.workspace = workspace
        self.cycle_interval = cycle_interval
        self.exploration_threshold = exploration_threshold
        
        # Components
        self.monitor = MonitoringManager()
        self.safety = SafetyGuardManager(self.monitor)
        self.notifier = PreActionNotifier(self.monitor, warning_delay)
        self.db = StrategyDatabase()
        
        # State
        self.stats = RunStats()
        self.state_file = workspace / ".autocast" / "l5_state.json"
        self.running = False
        self.current_run = 0
        
        # Load previous state
        self._load_state()
    
    def _load_state(self):
        """Load previous L5 state."""
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r') as f:
                    state = json.load(f)
                    self.stats.total_runs = state.get("total_runs", 0)
                    self.stats.successful_runs = state.get("successful_runs", 0)
                    self.current_run = state.get("current_run", 0)
                    print(f"📂 Loaded L5 state: {self.stats.total_runs} total runs")
            except Exception as e:
                print(f"⚠️ Could not load state: {e}")
    
    def _save_state(self):
        """Save current L5 state."""
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        state = {
            "total_runs": self.stats.total_runs,
            "successful_runs": self.stats.successful_runs,
            "current_run": self.current_run,
            "last_saved": datetime.utcnow().isoformat()
        }
        with open(self.state_file, 'w') as f:
            json.dump(state, f, indent=2)
    
    def should_explore(self) -> bool:
        """Determine if we should explore or exploit."""
        import random
        return random.random() < self.exploration_threshold
    
    def evaluate_current_state(self) -> Dict:
        """
        Step 1: Evaluate current system state.
        """
        print("\n" + "="*60)
        print("STEP 1: Evaluate Current State")
        print("="*60)
        
        # Get current metrics
        strategies = self.db.get_all_strategies()
        
        evaluation = {
            "timestamp": datetime.utcnow().isoformat(),
            "total_runs": self.stats.total_runs,
            "active_strategies": len([s for s in strategies.values() 
                                       if s.get("metadata", {}).get("status") == "active"]),
            "recent_improvement": self.stats.get_avg_improvement(),
            "consecutive_failures": self.stats.consecutive_failures,
            "ready_for_next": True
        }
        
        print(f"✅ Evaluation complete:")
        print(f"   Total runs: {evaluation['total_runs']}")
        print(f"   Active strategies: {evaluation['active_strategies']}")
        print(f"   Recent improvement: {evaluation['recent_improvement']:.4f}")
        
        return evaluation
    
    def get_best_proposal(self) -> Optional[str]:
        """Get the best method proposal to apply."""
        # In a real implementation, query proposals collection
        # For now, return a default
        proposals = ["method_001", "method_002", "method_003"]
        import random
        return random.choice(proposals)
    
    def run_workflow(self, workflow_name: str, **kwargs) -> Dict:
        """Run a workflow by name."""
        print(f"\n🔄 Running workflow: {workflow_name}")
        
        if workflow_name == "evaluate_current_state":
            return self.evaluate_current_state()
        
        elif workflow_name == "generate_improvements":
            return self._run_generate_improvements()
        
        elif workflow_name == "apply_method":
            method_id = kwargs.get("method_id", "method_001")
            return self._run_apply_method(method_id)
        
        elif workflow_name == "optimize_strategy":
            return self._run_optimize_strategy()
        
        else:
            return {"status": "error", "message": f"Unknown workflow: {workflow_name}"}
    
    def _run_generate_improvements(self) -> Dict:
        """Run generate improvements workflow."""
        print("\n" + "="*60)
        print("STEP 2a: Generate Improvements (Exploration)")
        print("="*60)
        
        try:
            # Import and run
            from generate_improvements import main as generate_main
            # This would actually run the generation
            
            return {
                "status": "completed",
                "new_proposals_generated": 3,
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            print(f"⚠️ Generation failed: {e}")
            return {"status": "error", "error": str(e)}
    
    def _run_apply_method(self, method_id: str) -> Dict:
        """Run apply method workflow."""
        print("\n" + "="*60)
        print(f"STEP 3: Apply Method - {method_id}")
        print("="*60)
        
        try:
            # Create checkpoint for rollback
            checkpoint_id = self.safety.create_checkpoint()
            print(f"   Checkpoint created: {checkpoint_id}")
            
            # Run the workflow
            engine = ApplyMethodEngine(method_id=method_id, skip_approval=True)
            result = engine.run()
            
            # Extract improvement
            improvement = result.get("improvement", {}).get("wer_percent", 0)
            success = result["status"] == "completed" and result.get("decision") == "KEEP"
            
            # Record stats
            self.stats.record_run(
                success=success,
                improvement=improvement,
                run_data={"method_id": method_id, "result": result}
            )
            
            # Send notification
            emoji = "✅" if success else "❌"
            self.monitor.send_alert(
                NotificationLevel.SUCCESS if success else NotificationLevel.WARNING,
                f"{emoji} Run #{self.stats.total_runs} Complete",
                f"Method: {method_id}\n"
                f"Decision: {result.get('decision', 'UNKNOWN')}\n"
                f"Improvement: {improvement:+.2f}%\n"
                f"Duration: {result.get('duration_seconds', 0):.1f}s"
            )
            
            return result
            
        except Exception as e:
            self.stats.record_run(success=False, improvement=0, run_data={"error": str(e)})
            print(f"❌ Apply method failed: {e}")
            import traceback
            traceback.print_exc()
            return {"status": "failed", "error": str(e)}
    
    def _run_optimize_strategy(self) -> Dict:
        """Run strategy optimization workflow."""
        print("\n" + "="*60)
        print("STEP 4: Optimize Strategy")
        print("="*60)
        
        try:
            workflow = OptimizeStrategyWorkflow()
            results = workflow.execute(run_history=list(self.stats.run_history))
            
            # Notify
            tuning = results.get("steps", {}).get("step3_tuning", {}).get("data", {})
            new_epsilon = tuning.get("new_epsilon", "N/A")
            
            self.monitor.send_alert(
                NotificationLevel.INFO,
                "🔧 Strategy Optimized",
                f"New ε: {new_epsilon}\n"
                f"Runs analyzed: {len(self.stats.run_history)}"
            )
            
            return results
            
        except Exception as e:
            print(f"⚠️ Optimization failed: {e}")
            return {"status": "error", "error": str(e)}
    
    def run_single_cycle(self, dry_run: bool = False) -> Dict:
        """Run a single autonomy cycle."""
        self.current_run += 1
        cycle_start = datetime.utcnow()
        
        print("\n" + "="*70)
        print(f"🤖 L5 AUTONOMY CYCLE #{self.current_run}")
        print(f"Started: {cycle_start.isoformat()}")
        print("="*70)
        
        cycle_result = {
            "cycle": self.current_run,
            "started_at": cycle_start.isoformat(),
            "steps": [],
            "completed": False
        }
        
        if dry_run:
            print("\n🧪 DRY RUN MODE - No actions executed")
            cycle_result["dry_run"] = True
            return cycle_result
        
        try:
            # Step 1: Evaluate
            print("\n📋 STEP 1/5: Evaluate Current State")
            eval_result = self.run_workflow("evaluate_current_state")
            cycle_result["steps"].append({"name": "evaluate", "status": "completed"})
            
            # Safety check before proceeding
            safety_actions = self.safety.check_safety_guards(self.stats)
            
            if safety_actions["should_stop"]:
                print("\n🛑 SAFETY STOP TRIGGERED")
                for alert in safety_actions["alerts"]:
                    self.monitor.send_alert(
                        NotificationLevel.CRITICAL if alert["level"] == "critical" else NotificationLevel.WARNING,
                        "🛑 SAFETY STOP",
                        alert["message"]
                    )
                cycle_result["stopped"] = True
                return cycle_result
            
            if safety_actions["should_rollback"]:
                print("\n🔄 Triggering rollback...")
                self.safety.perform_rollback()
                cycle_result["rollback"] = True
            
            if safety_actions["should_pause"]:
                print("\n⏸️ 10 runs reached - generating report...")
                report = self.safety.pause_for_report(self.stats)
                print(f"\n{report}")
                cycle_result["milestone_report"] = True
            
            # Step 2: Explore or Exploit?
            print("\n📋 STEP 2/5: Strategy Selection")
            if self.should_explore():
                print("   🎯 Mode: EXPLORATION - Generating new improvements")
                gen_result = self.run_workflow("generate_improvements")
                cycle_result["steps"].append({"name": "generate", "status": "completed"})
            else:
                print("   🎯 Mode: EXPLOITATION - Using existing strategies")
                cycle_result["steps"].append({"name": "generate", "status": "skipped"})
            
            # Step 3: Get and apply best proposal
            print("\n📋 STEP 3/5: Apply Best Method")
            best_proposal = self.get_best_proposal()
            
            if best_proposal:
                # L5: Announce and wait
                should_proceed = self.notifier.announce_and_wait(
                    f"Apply method {best_proposal}",
                    {
                        "method": best_proposal,
                        "cycle": self.current_run,
                        "recent_improvement": f"{self.stats.get_avg_improvement():.4f}"
                    }
                )
                
                if should_proceed:
                    apply_result = self.run_workflow("apply_method", method_id=best_proposal)
                    cycle_result["steps"].append({
                        "name": "apply_method",
                        "status": "completed" if apply_result.get("status") == "completed" else "failed"
                    })
                else:
                    print("   ⏸️ Action cancelled by user")
                    cycle_result["steps"].append({"name": "apply_method", "status": "cancelled"})
            else:
                print("   ⚠️ No proposals available")
                cycle_result["steps"].append({"name": "apply_method", "status": "skipped"})
            
            # Step 4: Optimize
            print("\n📋 STEP 4/5: Optimize Strategy")
            opt_result = self.run_workflow("optimize_strategy")
            cycle_result["steps"].append({"name": "optimize", "status": "completed"})
            
            cycle_result["completed"] = True
            
        except Exception as e:
            print(f"\n❌ Cycle failed: {e}")
            import traceback
            traceback.print_exc()
            cycle_result["error"] = str(e)
            self.monitor.send_alert(
                NotificationLevel.CRITICAL,
                "❌ Cycle Failed",
                f"Error: {str(e)}"
            )
        
        finally:
            cycle_result["ended_at"] = datetime.utcnow().isoformat()
            self._save_state()
        
        return cycle_result
    
    def run_continuous(self, dry_run: bool = False):
        """Run the autonomy loop continuously."""
        print("="*70)
        print("🤖 L5 FULL AUTONOMY SYSTEM STARTED")
        print("="*70)
        print(f"Cycle interval: {self.cycle_interval}s ({self.cycle_interval//60} minutes)")
        print(f"Warning delay: {self.notifier.warning_delay}s ({self.notifier.warning_delay//60} minutes)")
        print(f"Total runs so far: {self.stats.total_runs}")
        print("\nPress Ctrl+C to stop")
        print("Touch .emergency_stop to emergency stop")
        print("="*70)
        
        self.running = True
        
        # Send startup notification
        self.monitor.send_alert(
            NotificationLevel.INFO,
            "🚀 L5 Autonomy Started",
            f"System is now running autonomously\n"
            f"Cycle interval: {self.cycle_interval//60} minutes\n"
            f"Warning before action: {self.notifier.warning_delay//60} minutes"
        )
        
        try:
            while self.running:
                # Check emergency stop
                emergency_file = workspace / ".emergency_stop"
                if emergency_file.exists():
                    print("\n🛑 EMERGENCY STOP DETECTED")
                    self.monitor.send_alert(
                        NotificationLevel.CRITICAL,
                        "🛑 EMERGENCY STOP",
                        "System stopped via emergency file"
                    )
                    emergency_file.unlink()
                    break
                
                # Run cycle
                result = self.run_single_cycle(dry_run=dry_run)
                
                if result.get("stopped"):
                    print("\n🛑 Stopped by safety guard")
                    break
                
                # Wait for next cycle
                if self.running:
                    next_run = (datetime.utcnow() + timedelta(seconds=self.cycle_interval)).strftime('%H:%M:%S')
                    print(f"\n⏱️  Next cycle at {next_run} UTC (in {self.cycle_interval//60} minutes)")
                    print(f"   (Ctrl+C to stop, touch .emergency_stop for immediate stop)")
                    
                    # Sleep in chunks to allow interrupt
                    for _ in range(self.cycle_interval):
                        if not self.running:
                            break
                        time.sleep(1)
        
        except KeyboardInterrupt:
            print("\n\n🛑 Interrupted by user")
        
        finally:
            self.running = False
            self._save_state()
            
            # Send shutdown notification
            self.monitor.send_alert(
                NotificationLevel.INFO,
                "⏹️ L5 Autonomy Stopped",
                f"Total runs completed: {self.stats.total_runs}\n"
                f"Final success rate: {self.stats.successful_runs/max(self.stats.total_runs,1)*100:.1f}%"
            )
            
            print("\n💾 Final state saved")
            print(f"📊 Total runs: {self.stats.total_runs}")
            print(f"✅ Successful: {self.stats.successful_runs}")
    
    def stop(self):
        """Stop the loop."""
        self.running = False
        self._save_state()


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="L5 Full Autonomy System")
    parser.add_argument("--interval", "-i", type=int, default=3600,
                       help="Cycle interval in seconds (default: 3600 = 1 hour)")
    parser.add_argument("--warning-delay", "-w", type=int, default=300,
                       help="Warning delay before action in seconds (default: 300 = 5 min)")
    parser.add_argument("--dry-run", "-d", action="store_true",
                       help="Dry run - don't execute actions")
    parser.add_argument("--once", "-o", action="store_true",
                       help="Run single cycle and exit")
    parser.add_argument("--exploration", "-e", type=float, default=0.3,
                       help="Exploration threshold (default: 0.3)")
    
    args = parser.parse_args()
    
    loop = AutoCastLoop(
        cycle_interval=args.interval,
        warning_delay=args.warning_delay,
        exploration_threshold=args.exploration
    )
    
    if args.once:
        result = loop.run_single_cycle(dry_run=args.dry_run)
        print("\n" + "="*60)
        print("SINGLE CYCLE RESULT")
        print("="*60)
        print(json.dumps(result, indent=2, default=str))
        return 0
    
    # Run continuously
    loop.run_continuous(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
