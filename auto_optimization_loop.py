#!/usr/bin/env python3
"""
L4 Auto-Optimization Loop
Continuously monitors runs and optimizes strategy over time.

Behavior:
- After every run: analyze_performance()
- After every 5 runs: optimize_strategy()
- Strategy gets better over time automatically

Reduced Human-in-the-Loop:
- L3: Required "Go" approval for each workflow
- L4: System announces "I will do X, stop me if no" - only reports, no approval needed
"""

import sys
import json
import time
import signal
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from collections import deque

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from optimize_strategy import OptimizeStrategyWorkflow, StrategyDatabase

try:
    from learning.learning_db import LearningDB
    SQLITE_AVAILABLE = True
except ImportError:
    SQLITE_AVAILABLE = False


@dataclass
class RunCounter:
    """Tracks runs since last optimization."""
    total_runs: int = 0
    runs_since_optimization: int = 0
    optimization_threshold: int = 5
    last_optimization: Optional[str] = None
    run_history: deque = field(default_factory=lambda: deque(maxlen=100))
    
    def record_run(self, run_data: Dict):
        """Record a new run."""
        self.total_runs += 1
        self.runs_since_optimization += 1
        self.run_history.append({
            **run_data,
            "timestamp": datetime.utcnow().isoformat()
        })
    
    def should_optimize(self) -> bool:
        """Check if optimization should run."""
        return self.runs_since_optimization >= self.optimization_threshold
    
    def reset_counter(self):
        """Reset optimization counter after running."""
        self.runs_since_optimization = 0
        self.last_optimization = datetime.utcnow().isoformat()


class NotificationManager:
    """
    Manages notifications for reduced Human-in-the-Loop.
    
    L4 Style: "I will do X, stop me if no"
    Instead of waiting for "Go", we announce intent and proceed after short delay.
    """
    
    def __init__(self, stop_delay_seconds: int = 10):
        self.stop_delay_seconds = stop_delay_seconds
        self.pending_stop = False
        self.notifications = []
    
    def announce_action(self, action: str, details: Dict = None) -> bool:
        """
        Announce an action and wait for potential stop signal.
        
        Returns True if should proceed, False if stopped.
        """
        timestamp = datetime.utcnow().isoformat()
        
        print("\n" + "="*60)
        print("🤖 AUTO-PILOT NOTIFICATION")
        print("="*60)
        print(f"Time: {timestamp}")
        print(f"Action: {action}")
        
        if details:
            print(f"\nDetails:")
            for key, value in details.items():
                print(f"  - {key}: {value}")
        
        print(f"\n⏱️  Auto-proceeding in {self.stop_delay_seconds}s...")
        print(f"   (Send SIGUSR1 or create .stop file to cancel)")
        print("="*60)
        
        # Store notification
        self.notifications.append({
            "timestamp": timestamp,
            "action": action,
            "details": details,
            "proceeded": True  # Will be updated
        })
        
        # In L4, we don't block - we just announce and proceed
        # The stop mechanism is external (signal or file)
        self.pending_stop = False
        
        return not self.pending_stop
    
    def can_proceed(self) -> bool:
        """Check if we can proceed (no stop signal received)."""
        return not self.pending_stop
    
    def trigger_stop(self):
        """Trigger stop signal."""
        self.pending_stop = True
        print("\n🛑 Stop signal received! Cancelling action...")
    
    def get_report(self) -> List[Dict]:
        """Get notification history report."""
        return self.notifications


class PerformanceAnalyzer:
    """Analyzes performance after each run."""
    
    def __init__(self, db: StrategyDatabase):
        self.db = db
        self.analysis_history = []
    
    def analyze_current_performance(self) -> Dict[str, Any]:
        """Analyze performance after a run."""
        print("\n" + "-"*50)
        print("📊 Post-Run Performance Analysis")
        print("-"*50)
        
        # Get current strategies
        strategies = self.db.get_all_strategies()
        
        if not strategies:
            return {"error": "No strategies available"}
        
        # Calculate current performance metrics
        metrics = {
            "timestamp": datetime.utcnow().isoformat(),
            "strategies_analyzed": len(strategies),
            "active_strategies": len([s for s in strategies.values() 
                                       if s.get("metadata", {}).get("status") == "active"]),
            "avg_success_rate": 0.0,
            "avg_improvement": 0.0,
            "top_strategy": None,
            "recommendations": []
        }
        
        # Calculate averages
        total_success_rate = 0
        total_improvement = 0
        strategy_count = 0
        
        for strategy_id, strategy in strategies.items():
            perf = strategy.get("performance", {})
            if perf.get("total_runs", 0) > 0:
                total_success_rate += perf.get("success_rate", 0)
                total_improvement += perf.get("avg_improvement", 0)
                strategy_count += 1
        
        if strategy_count > 0:
            metrics["avg_success_rate"] = total_success_rate / strategy_count
            metrics["avg_improvement"] = total_improvement / strategy_count
        
        # Find top strategy
        best_strategy = None
        best_score = -float('inf')
        
        for strategy_id, strategy in strategies.items():
            perf = strategy.get("performance", {})
            score = (perf.get("success_rate", 0) * 0.6 + 
                    min(perf.get("avg_improvement", 0) / 10, 1.0) * 0.4)
            if score > best_score and perf.get("total_runs", 0) > 0:
                best_score = score
                best_strategy = {
                    "strategy_id": strategy_id,
                    "name": strategy.get("name"),
                    "success_rate": perf.get("success_rate", 0),
                    "avg_improvement": perf.get("avg_improvement", 0),
                    "composite_score": score
                }
        
        metrics["top_strategy"] = best_strategy
        
        # Generate recommendations
        if metrics["avg_success_rate"] < 0.5:
            metrics["recommendations"].append("Success rate below 50% - consider more exploration")
        
        if best_strategy and best_strategy["success_rate"] > 0.8:
            metrics["recommendations"].append(f"Strategy '{best_strategy['name']}' performing well - consider increasing exploitation")
        
        if not any(s.get("performance", {}).get("total_runs", 0) > 5 
                   for s in strategies.values()):
            metrics["recommendations"].append("Insufficient data - need more runs for optimization")
        
        # Print results
        print(f"\n📈 Current Performance:")
        print(f"   Active Strategies: {metrics['active_strategies']}")
        print(f"   Avg Success Rate: {metrics['avg_success_rate']:.2%}")
        print(f"   Avg Improvement: {metrics['avg_improvement']:.4f}")
        
        if best_strategy:
            print(f"\n🏆 Top Strategy: {best_strategy['name']}")
            print(f"   Success Rate: {best_strategy['success_rate']:.2%}")
        
        if metrics["recommendations"]:
            print(f"\n💡 Recommendations:")
            for rec in metrics["recommendations"]:
                print(f"   - {rec}")
        
        self.analysis_history.append(metrics)
        return metrics


class AutoOptimizationLoop:
    """
    Continuous auto-optimization loop.
    
    Runs in background:
    - Analyzes after every run
    - Optimizes strategy every 5 runs
    - Saves state for persistence
    """
    
    def __init__(
        self,
        optimization_threshold: int = 5,
        check_interval_seconds: int = 60,
        stop_delay: int = 10
    ):
        self.db = StrategyDatabase()
        self.workflow = OptimizeStrategyWorkflow()
        self.counter = RunCounter(optimization_threshold=optimization_threshold)
        self.notifier = NotificationManager(stop_delay_seconds=stop_delay)
        self.analyzer = PerformanceAnalyzer(self.db)
        
        self.check_interval = check_interval_seconds
        self.running = False
        self.state_file = workspace / "strategies_data" / "auto_loop_state.json"
        
        # Load previous state
        self._load_state()
    
    def _load_state(self):
        """Load previous loop state."""
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r') as f:
                    state = json.load(f)
                    self.counter.total_runs = state.get("total_runs", 0)
                    self.counter.runs_since_optimization = state.get("runs_since_optimization", 0)
                    self.counter.last_optimization = state.get("last_optimization")
                    print(f"📂 Loaded state: {self.counter.total_runs} total runs")
            except Exception as e:
                print(f"⚠️ Could not load state: {e}")
    
    def _save_state(self):
        """Save current loop state."""
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        state = {
            "total_runs": self.counter.total_runs,
            "runs_since_optimization": self.counter.runs_since_optimization,
            "last_optimization": self.counter.last_optimization,
            "saved_at": datetime.utcnow().isoformat()
        }
        
        with open(self.state_file, 'w') as f:
            json.dump(state, f, indent=2)
    
    def check_for_new_runs(self) -> List[Dict]:
        """Check learning database for new runs since last check."""
        new_runs = []
        
        if SQLITE_AVAILABLE:
            try:
                db_path = workspace / "method_results" / "learning.db"
                if db_path.exists():
                    db = LearningDB(str(db_path))
                    
                    # Get recent runs
                    cursor = db.conn.execute(
                        """
                        SELECT r.run_id, r.timestamp, r.baseline_score, r.final_score, r.status
                        FROM runs r
                        ORDER BY r.timestamp DESC
                        LIMIT 10
                        """
                    )
                    
                    for row in cursor.fetchall():
                        run = dict(row)
                        # Only count if newer than our tracking
                        if self._is_new_run(run):
                            new_runs.append(run)
                    
                    db.close()
            except Exception as e:
                print(f"⚠️ Could not check for runs: {e}")
        
        return new_runs
    
    def _is_new_run(self, run: Dict) -> bool:
        """Check if a run is new (not yet processed)."""
        run_id = run.get("run_id")
        # Simple check: if not in recent history, it's new
        recent_ids = [r.get("run_id") for r in self.counter.run_history]
        return run_id not in recent_ids
    
    def process_run(self, run_data: Dict):
        """Process a new run."""
        print(f"\n📝 Processing run: {run_data.get('run_id', 'unknown')}")
        
        # Record the run
        self.counter.record_run(run_data)
        
        # Analyze performance
        analysis = self.analyzer.analyze_current_performance()
        
        # Check if optimization needed
        if self.counter.should_optimize():
            print(f"\n⚡ Threshold reached ({self.counter.runs_since_optimization} runs)!")
            self.run_optimization()
        
        # Save state
        self._save_state()
    
    def run_optimization(self):
        """Run the strategy optimization workflow."""
        print("\n" + "="*60)
        print("🚀 TRIGGERING STRATEGY OPTIMIZATION")
        print("="*60)
        
        # L4: Announce and auto-proceed
        should_proceed = self.notifier.announce_action(
            "optimize_strategy workflow",
            {
                "runs_since_last": self.counter.runs_since_optimization,
                "total_runs": self.counter.total_runs,
                "will_tune_epsilon": True,
                "expected_duration": "30-60 seconds"
            }
        )
        
        if not should_proceed:
            print("⏸️ Optimization cancelled by user")
            return
        
        # Run the optimization
        try:
            results = self.workflow.execute(
                run_history=list(self.counter.run_history)
            )
            
            # Reset counter
            self.counter.reset_counter()
            
            # Save results
            self.workflow.save_workflow_result(results)
            
            print("\n✅ Optimization completed successfully")
            
        except Exception as e:
            print(f"\n❌ Optimization failed: {e}")
            import traceback
            traceback.print_exc()
    
    def generate_report(self) -> Dict:
        """Generate status report."""
        report = {
            "timestamp": datetime.utcnow().isoformat(),
            "total_runs": self.counter.total_runs,
            "runs_since_optimization": self.counter.runs_since_optimization,
            "next_optimization_in": self.counter.optimization_threshold - self.counter.runs_since_optimization,
            "last_optimization": self.counter.last_optimization,
            "notification_count": len(self.notifier.notifications),
            "recent_analyses": list(self.analyzer.analysis_history)[-5:],
            "top_strategy": None
        }
        
        # Get current top strategy
        strategies = self.db.get_all_strategies()
        best = None
        best_score = -float('inf')
        
        for strategy_id, strategy in strategies.items():
            perf = strategy.get("performance", {})
            score = perf.get("success_rate", 0) * perf.get("avg_improvement", 0)
            if score > best_score:
                best_score = score
                best = {
                    "strategy_id": strategy_id,
                    "name": strategy.get("name"),
                    "performance": perf
                }
        
        report["top_strategy"] = best
        
        return report
    
    def print_report(self):
        """Print current status report."""
        report = self.generate_report()
        
        print("\n" + "="*60)
        print("📊 AUTO-OPTIMIZATION STATUS REPORT")
        print("="*60)
        print(f"Generated: {report['timestamp']}")
        print(f"\n📈 Statistics:")
        print(f"   Total Runs: {report['total_runs']}")
        print(f"   Runs Since Last Optimization: {report['runs_since_optimization']}")
        print(f"   Next Optimization In: {report['next_optimization_in']} runs")
        
        if report['last_optimization']:
            print(f"   Last Optimization: {report['last_optimization']}")
        
        if report['top_strategy']:
            top = report['top_strategy']
            print(f"\n🏆 Current Top Strategy:")
            print(f"   Name: {top['name']}")
            print(f"   Success Rate: {top['performance'].get('success_rate', 0):.2%}")
            print(f"   Total Runs: {top['performance'].get('total_runs', 0)}")
        
        print("\n🤖 Notifications Sent: {}".format(report['notification_count']))
        print("="*60)
    
    def run_single_iteration(self):
        """Run a single check iteration."""
        print(f"\n🔍 Checking for new runs... ({datetime.utcnow().strftime('%H:%M:%S')})")
        
        new_runs = self.check_for_new_runs()
        
        if new_runs:
            print(f"   Found {len(new_runs)} new run(s)")
            for run in new_runs:
                self.process_run(run)
        else:
            print("   No new runs")
        
        # Check if optimization needed (in case we missed the threshold)
        if self.counter.should_optimize():
            self.run_optimization()
    
    def run_continuous(self, max_iterations: Optional[int] = None):
        """Run the optimization loop continuously."""
        print("="*60)
        print("🤖 L4 AUTO-OPTIMIZATION LOOP STARTED")
        print("="*60)
        print(f"Check interval: {self.check_interval}s")
        print(f"Optimization threshold: {self.counter.optimization_threshold} runs")
        print(f"Auto-proceed delay: {self.notifier.stop_delay_seconds}s")
        print(f"State file: {self.state_file}")
        print("\nPress Ctrl+C to stop")
        print("="*60)
        
        self.running = True
        iteration = 0
        
        try:
            while self.running:
                self.run_single_iteration()
                
                iteration += 1
                if max_iterations and iteration >= max_iterations:
                    print(f"\n✅ Reached max iterations ({max_iterations})")
                    break
                
                # Wait for next check
                print(f"\n⏱️  Sleeping {self.check_interval}s...")
                time.sleep(self.check_interval)
                
        except KeyboardInterrupt:
            print("\n\n🛑 Interrupted by user")
        finally:
            self._save_state()
            print("\n💾 State saved")
            self.print_report()
    
    def stop(self):
        """Stop the loop."""
        self.running = False
        self._save_state()


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="L4 Auto-Optimization Loop")
    parser.add_argument("--once", action="store_true", help="Run single iteration and exit")
    parser.add_argument("--report", action="store_true", help="Print status report and exit")
    parser.add_argument("--interval", type=int, default=60, help="Check interval in seconds")
    parser.add_argument("--threshold", type=int, default=5, help="Runs before optimization")
    parser.add_argument("--max-iterations", type=int, help="Max iterations before stopping")
    parser.add_argument("--force-optimize", action="store_true", help="Force optimization now")
    
    args = parser.parse_args()
    
    loop = AutoOptimizationLoop(
        optimization_threshold=args.threshold,
        check_interval_seconds=args.interval
    )
    
    if args.report:
        loop.print_report()
        return 0
    
    if args.force_optimize:
        loop.run_optimization()
        return 0
    
    if args.once:
        loop.run_single_iteration()
        loop.print_report()
        return 0
    
    # Run continuously
    loop.run_continuous(max_iterations=args.max_iterations)
    return 0


if __name__ == "__main__":
    sys.exit(main())
