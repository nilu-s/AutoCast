#!/usr/bin/env python3
"""
L4 Strategy Optimization Workflow
Implements self-optimizing strategy selection for exploration vs exploitation.

Workflow Steps:
1. agent_analyzer - Analyze historical strategy performance
2. agent_selector - Evaluate exploration vs exploitation balance
3. agent_hyperparameter_tuner - Tune epsilon-greedy parameters
4. agent_selector - Select optimal workflow sequence
"""

import sys
import json
import random
import math
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

try:
    from learning.chroma_client import ChromaLearningDB
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False

try:
    from learning.learning_db import LearningDB
    SQLITE_AVAILABLE = True
except ImportError:
    SQLITE_AVAILABLE = False


@dataclass
class StrategyPerformance:
    """Performance metrics for a strategy."""
    strategy_id: str
    total_runs: int = 0
    successful_runs: int = 0
    avg_improvement: float = 0.0
    best_improvement: float = 0.0
    success_rate: float = 0.0
    last_used: Optional[str] = None
    
    def update(self, improvement: float, success: bool):
        """Update performance with a new run."""
        self.total_runs += 1
        if success:
            self.successful_runs += 1
        
        # Moving average
        self.avg_improvement = (
            (self.avg_improvement * (self.total_runs - 1) + improvement) / self.total_runs
        )
        self.best_improvement = max(self.best_improvement, improvement)
        self.success_rate = self.successful_runs / self.total_runs if self.total_runs > 0 else 0.0
        self.last_used = datetime.utcnow().isoformat()


class StrategyDatabase:
    """Interface for strategy storage (ChromaDB or JSON fallback)."""
    
    def __init__(self):
        self.workspace = Path(__file__).parent
        self.chroma_db = None
        self.json_file = self.workspace / "strategies_data" / "strategies.json"
        self.storage_type = None
        
        if CHROMADB_AVAILABLE:
            try:
                persist_dir = str(self.workspace / "chroma_data")
                self.chroma_db = ChromaLearningDB(persist_dir=persist_dir)
                if self.chroma_db.client:
                    self.storage_type = "chromadb"
                    print("✅ Using ChromaDB for strategies")
                else:
                    self.chroma_db = None
            except Exception as e:
                print(f"⚠️ ChromaDB init failed: {e}")
        
        if not self.storage_type:
            self.storage_type = "json"
            print("✅ Using JSON fallback for strategies")
            self.json_file.parent.mkdir(parents=True, exist_ok=True)
    
    def get_collection(self):
        """Get strategies collection."""
        if self.storage_type == "chromadb":
            try:
                coll = self.chroma_db.client.get_collection("strategies")
                # Verify collection has data
                if coll.count() > 0:
                    return coll
                else:
                    return None
            except Exception:
                return None
        return None
    
    def get_all_strategies(self) -> Dict[str, Dict]:
        """Get all strategies."""
        if self.storage_type == "chromadb":
            coll = self.get_collection()
            if coll:
                result = coll.get()
                return {
                    metadata["strategy_id"]: metadata
                    for metadata in result["metadatas"]
                }
        
        # JSON fallback - directly load from the collection JSON file
        strategies_file = self.workspace / "strategies_data" / "strategies.json"
        if strategies_file.exists():
            with open(strategies_file, 'r') as f:
                data = json.load(f)
                return data.get("strategies", {})
        
        # Legacy fallback
        if self.json_file.exists():
            with open(self.json_file, 'r') as f:
                data = json.load(f)
                return data.get("strategies", {})
        return {}
    
    def get_strategy(self, strategy_id: str) -> Optional[Dict]:
        """Get a specific strategy."""
        strategies = self.get_all_strategies()
        return strategies.get(strategy_id)
    
    def update_strategy(self, strategy_id: str, updates: Dict):
        """Update a strategy."""
        if self.storage_type == "chromadb":
            coll = self.get_collection()
            if coll:
                # Get existing
                result = coll.get(ids=[strategy_id])
                if result["metadatas"]:
                    strategy = result["metadatas"][0]
                    strategy.update(updates)
                    strategy["metadata"]["updated_at"] = datetime.utcnow().isoformat()
                    
                    # Re-embed
                    text_for_embedding = f"{strategy['name']} {strategy['description']} {strategy['type']}"
                    embedding = self.chroma_db.encoder.encode(text_for_embedding)
                    
                    coll.update(
                        ids=[strategy_id],
                        embeddings=[embedding],
                        metadatas=[strategy],
                        documents=[json.dumps(strategy)]
                    )
                    return True
        
        # JSON fallback - use the correct strategies file
        strategies = self.get_all_strategies()
        if strategy_id in strategies:
            strategies[strategy_id].update(updates)
            strategies[strategy_id]["metadata"]["updated_at"] = datetime.utcnow().isoformat()
            
            strategies_file = self.workspace / "strategies_data" / "strategies.json"
            with open(strategies_file, 'w') as f:
                json.dump({
                    "collection_name": "strategies",
                    "created_at": datetime.utcnow().isoformat(),
                    "description": "Strategy definitions and performance data for L4 self-optimization",
                    "updated_at": datetime.utcnow().isoformat(),
                    "strategies": strategies
                }, f, indent=2)
            return True
        return False
    
    def save_best_strategy(self, strategy_id: str, performance: Dict):
        """Save best performing strategy."""
        best_file = self.workspace / "strategies_data" / "best_strategy.json"
        best_file.parent.mkdir(parents=True, exist_ok=True)
        
        data = {
            "strategy_id": strategy_id,
            "performance": performance,
            "saved_at": datetime.utcnow().isoformat()
        }
        
        with open(best_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"💾 Saved best strategy: {strategy_id}")
        return True


class StrategyAnalyzer:
    """
    Step 1: agent_analyzer
    Skill: skill_success_analysis
    Action: analyze_strategy_performance
    """
    
    def __init__(self, db: StrategyDatabase):
        self.db = db
    
    def analyze_performance(self, run_history: List[Dict] = None) -> Dict[str, Any]:
        """Analyze historical strategy performance."""
        print("\n" + "="*50)
        print("STEP 1: Strategy Performance Analysis")
        print("="*50)
        
        strategies = self.db.get_all_strategies()
        
        if not strategies:
            print("⚠️ No strategies found, initializing default")
            return self._create_default_analysis()
        
        # Calculate performance metrics
        performance_report = {
            "timestamp": datetime.utcnow().isoformat(),
            "total_strategies": len(strategies),
            "analyzed_strategies": [],
            "top_performer": None,
            "worst_performer": None,
            "insights": []
        }
        
        best_strategy = None
        worst_strategy = None
        best_score = -float('inf')
        worst_score = float('inf')
        
        for strategy_id, strategy in strategies.items():
            perf = strategy.get("performance", {})
            
            # Calculate composite score
            success_rate = perf.get("success_rate", 0)
            avg_improvement = perf.get("avg_improvement", 0)
            total_runs = perf.get("total_runs", 0)
            
            # Weighted score: success_rate * 0.6 + normalized_improvement * 0.4
            improvement_score = min(avg_improvement / 10.0, 1.0)  # Normalize to 0-1
            composite_score = (success_rate * 0.6) + (improvement_score * 0.4)
            
            analysis = {
                "strategy_id": strategy_id,
                "name": strategy.get("name"),
                "type": strategy.get("type"),
                "total_runs": total_runs,
                "success_rate": success_rate,
                "avg_improvement": avg_improvement,
                "composite_score": composite_score,
                "epsilon": strategy.get("parameters", {}).get("epsilon")
            }
            
            performance_report["analyzed_strategies"].append(analysis)
            
            if composite_score > best_score:
                best_score = composite_score
                best_strategy = analysis
            
            if composite_score < worst_score:
                worst_score = composite_score
                worst_strategy = analysis
        
        performance_report["top_performer"] = best_strategy
        performance_report["worst_performer"] = worst_strategy
        
        # Generate insights
        insights = self._generate_insights(performance_report["analyzed_strategies"])
        performance_report["insights"] = insights
        
        # Print report
        print(f"\n📊 Analyzed {len(strategies)} strategies")
        print(f"\n🏆 Top Performer:")
        if best_strategy:
            print(f"   - {best_strategy['name']} ({best_strategy['strategy_id']})")
            print(f"   - Success Rate: {best_strategy['success_rate']:.2%}")
            print(f"   - Avg Improvement: {best_strategy['avg_improvement']:.3f}")
            print(f"   - Composite Score: {best_strategy['composite_score']:.3f}")
        
        print(f"\n📉 Worst Performer:")
        if worst_strategy:
            print(f"   - {worst_strategy['name']} ({worst_strategy['strategy_id']})")
            print(f"   - Success Rate: {worst_strategy['success_rate']:.2%}")
            print(f"   - Avg Improvement: {worst_strategy['avg_improvement']:.3f}")
        
        print(f"\n💡 Insights:")
        for insight in insights:
            print(f"   - {insight}")
        
        return performance_report
    
    def _generate_insights(self, strategies: List[Dict]) -> List[str]:
        """Generate insights from strategy analysis."""
        insights = []
        
        if not strategies:
            return ["No data available yet"]
        
        # Compare exploration vs exploitation
        exploration = [s for s in strategies if s.get("type") == "exploration"]
        exploitation = [s for s in strategies if s.get("type") == "exploitation"]
        balanced = [s for s in strategies if s.get("type") == "balanced"]
        
        if exploration and exploitation:
            exp_score = sum(s.get("composite_score", 0) for s in exploration) / len(exploration)
            expl_score = sum(s.get("composite_score", 0) for s in exploitation) / len(exploitation)
            
            if exp_score > expl_score:
                insights.append(f"Exploration strategies outperform exploitation by {(exp_score - expl_score):.3f}")
            else:
                insights.append(f"Exploitation strategies outperform exploration by {(expl_score - exp_score):.3f}")
        
        # Check epsilon correlation
        epsilon_strategies = [(s.get("epsilon"), s.get("composite_score", 0)) 
                              for s in strategies if s.get("epsilon") is not None]
        if len(epsilon_strategies) >= 2:
            # Simple correlation check
            epsilons = [e for e, _ in epsilon_strategies]
            scores = [s for _, s in epsilon_strategies]
            avg_epsilon = sum(epsilons) / len(epsilons)
            insights.append(f"Average epsilon across strategies: {avg_epsilon:.3f}")
        
        # Check for underperforming strategies
        low_performers = [s for s in strategies if s.get("composite_score", 0) < 0.3 and s.get("total_runs", 0) > 5]
        if low_performers:
            insights.append(f"{len(low_performers)} strategies underperforming (>5 runs, score < 0.3)")
        
        if not insights:
            insights.append("Insufficient data for detailed insights")
        
        return insights
    
    def _create_default_analysis(self) -> Dict:
        """Create default analysis when no data exists."""
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "total_strategies": 0,
            "analyzed_strategies": [],
            "top_performer": None,
            "worst_performer": None,
            "insights": ["No historical data available. Initialize strategies first."]
        }


class StrategySelector:
    """
    Step 2 & 4: agent_selector
    Skill: skill_strategy_evaluation
    Actions: evaluate_exploration_exploitation, select_optimal_workflow
    """
    
    def __init__(self, db: StrategyDatabase):
        self.db = db
    
    def evaluate_exploration_exploitation(
        self, 
        performance_report: Dict,
        current_epsilon: float = 0.2
    ) -> Dict[str, Any]:
        """
        Evaluate balance between exploration and exploitation.
        
        Returns recommendation: more exploration, more exploitation, or maintain balance.
        """
        print("\n" + "="*50)
        print("STEP 2: Exploration vs Exploitation Evaluation")
        print("="*50)
        
        strategies = performance_report.get("analyzed_strategies", [])
        
        # Calculate exploration metrics
        exploration_success = self._calculate_type_success(strategies, "exploration")
        exploitation_success = self._calculate_type_success(strategies, "exploitation")
        balanced_success = self._calculate_type_success(strategies, "balanced")
        
        # Determine recommendation
        recommendation = self._determine_recommendation(
            exploration_success, 
            exploitation_success, 
            balanced_success,
            current_epsilon
        )
        
        print(f"\n📊 Current ε (epsilon): {current_epsilon:.3f}")
        print(f"\n📈 Exploration Success: {exploration_success:.3f}")
        print(f"📈 Exploitation Success: {exploitation_success:.3f}")
        print(f"📈 Balanced Success: {balanced_success:.3f}")
        
        print(f"\n🎯 Recommendation:")
        print(f"   Action: {recommendation['action']}")
        print(f"   Reason: {recommendation['reason']}")
        print(f"   Target ε: {recommendation['target_epsilon']:.3f}")
        print(f"   Confidence: {recommendation['confidence']:.2%}")
        
        return recommendation
    
    def _calculate_type_success(self, strategies: List[Dict], strategy_type: str) -> float:
        """Calculate average success for a strategy type."""
        type_strategies = [s for s in strategies if s.get("type") == strategy_type]
        if not type_strategies:
            return 0.5  # Default neutral
        return sum(s.get("composite_score", 0) for s in type_strategies) / len(type_strategies)
    
    def _determine_recommendation(
        self, 
        exploration: float, 
        exploitation: float,
        balanced: float,
        current_epsilon: float
    ) -> Dict:
        """Determine recommendation based on performance."""
        
        # If no data, default to balanced
        if exploration == 0 and exploitation == 0:
            return {
                "action": "maintain",
                "reason": "Insufficient data for recommendation",
                "target_epsilon": current_epsilon,
                "confidence": 0.5
            }
        
        # Find best performing type
        scores = {
            "exploration": exploration,
            "exploitation": exploitation,
            "balanced": balanced
        }
        best_type = max(scores, key=scores.get)
        
        # Determine target epsilon based on recommendation
        if best_type == "exploration":
            # Increase exploration
            target_epsilon = min(current_epsilon + 0.05, 0.4)
            confidence = exploration / (exploration + exploitation + balanced + 0.01)
            return {
                "action": "increase_exploration",
                "reason": f"Exploration strategies outperform (score: {exploration:.3f})",
                "target_epsilon": target_epsilon,
                "confidence": min(confidence, 0.9)
            }
        
        elif best_type == "exploitation":
            # Decrease exploration (increase exploitation)
            target_epsilon = max(current_epsilon - 0.05, 0.05)
            confidence = exploitation / (exploration + exploitation + balanced + 0.01)
            return {
                "action": "increase_exploitation",
                "reason": f"Exploitation strategies outperform (score: {exploitation:.3f})",
                "target_epsilon": target_epsilon,
                "confidence": min(confidence, 0.9)
            }
        
        else:
            # Maintain balance
            confidence = balanced / (exploration + exploitation + balanced + 0.01)
            return {
                "action": "maintain",
                "reason": f"Balanced approach performs best (score: {balanced:.3f})",
                "target_epsilon": current_epsilon,
                "confidence": min(confidence, 0.9)
            }
    
    def select_optimal_workflow(
        self, 
        performance_report: Dict,
        recommendation: Dict
    ) -> Dict[str, Any]:
        """
        Step 4: Select optimal workflow sequence.
        
        Decides: evaluate → apply? Or evaluate → generate → apply?
        """
        print("\n" + "="*50)
        print("STEP 4: Select Optimal Workflow Sequence")
        print("="*50)
        
        # Determine if generation is needed
        strategies = performance_report.get("analyzed_strategies", [])
        low_diversity = len([s for s in strategies if s.get("total_runs", 0) > 0]) < 3
        poor_performance = recommendation.get("confidence", 1) < 0.5
        
        # Decision logic
        if low_diversity or poor_performance:
            sequence = ["evaluate", "generate", "apply"]
            reason = "Low diversity or poor performance - generating new strategies"
        else:
            sequence = ["evaluate", "apply"]
            reason = "Good diversity and performance - optimizing existing strategies"
        
        workflow_selection = {
            "timestamp": datetime.utcnow().isoformat(),
            "recommended_sequence": sequence,
            "reason": reason,
            "low_diversity": low_diversity,
            "poor_performance": poor_performance,
            "steps": []
        }
        
        # Build detailed steps
        for step in sequence:
            if step == "evaluate":
                workflow_selection["steps"].append({
                    "step": 1,
                    "name": "evaluate_performance",
                    "agent": "agent_analyzer",
                    "action": "analyze_strategy_performance",
                    "status": "completed"  # This is what we're doing now
                })
            elif step == "generate":
                workflow_selection["steps"].append({
                    "step": 2,
                    "name": "generate_strategies",
                    "agent": "agent_hypothesis_generator",
                    "action": "generate_new_strategies",
                    "status": "pending",
                    "note": "Only if diversity is low"
                })
            elif step == "apply":
                workflow_selection["steps"].append({
                    "step": 3 if "generate" in sequence else 2,
                    "name": "apply_strategy",
                    "agent": "agent_method_selector",
                    "action": "select_with_new_strategy",
                    "status": "pending"
                })
        
        print(f"\n🔄 Selected Workflow Sequence:")
        print(f"   Sequence: {' → '.join(sequence)}")
        print(f"   Reason: {reason}")
        print(f"\n📋 Steps:")
        for step in workflow_selection["steps"]:
            print(f"   {step['step']}. {step['name']} [{step['status']}]")
            print(f"      Agent: {step['agent']}")
            print(f"      Action: {step['action']}")
        
        return workflow_selection


class HyperparameterTuner:
    """
    Step 3: agent_hyperparameter_tuner
    Skill: skill_hyperparameter_tuning
    Action: tune_epsilon_greedy
    """
    
    def __init__(self, db: StrategyDatabase):
        self.db = db
    
    def tune_epsilon_greedy(
        self, 
        recommendation: Dict,
        strategy_id: str = "epsilon_greedy_balanced"
    ) -> Dict[str, Any]:
        """
        Tune epsilon-greedy parameters based on recommendation.
        
        Adjusts ε: higher for exploration, lower for exploitation.
        Example: ε=0.2 → ε=0.15 (more exploitation when successful)
        """
        print("\n" + "="*50)
        print("STEP 3: Hyperparameter Tuning")
        print("="*50)
        
        # Get current strategy
        strategy = self.db.get_strategy(strategy_id)
        if not strategy:
            print(f"⚠️ Strategy {strategy_id} not found, using defaults")
            current_epsilon = 0.2
            current_decay = 0.95
        else:
            params = strategy.get("parameters", {})
            current_epsilon = params.get("epsilon", 0.2)
            current_decay = params.get("decay_rate", 0.95)
        
        # Calculate new epsilon
        target_epsilon = recommendation.get("target_epsilon", current_epsilon)
        action = recommendation.get("action", "maintain")
        
        # Apply smoothing - don't jump too fast
        if action == "increase_exploration":
            new_epsilon = min(current_epsilon * 1.2, target_epsilon, 0.4)
            new_decay = current_decay * 0.98  # Slower decay
            adjustment_reason = "More exploration needed"
        elif action == "increase_exploitation":
            new_epsilon = max(current_epsilon * 0.85, target_epsilon, 0.05)
            new_decay = min(current_decay * 1.02, 0.99)  # Faster decay to min
            adjustment_reason = "More exploitation beneficial"
        else:
            new_epsilon = current_epsilon
            new_decay = current_decay
            adjustment_reason = "Maintaining balance"
        
        tuning_result = {
            "timestamp": datetime.utcnow().isoformat(),
            "strategy_id": strategy_id,
            "previous_epsilon": current_epsilon,
            "new_epsilon": round(new_epsilon, 3),
            "previous_decay": current_decay,
            "new_decay": round(new_decay, 3),
            "adjustment": action,
            "reason": adjustment_reason,
            "min_epsilon": 0.05,
            "applied": False
        }
        
        # Apply the tuning
        success = self.db.update_strategy(strategy_id, {
            "parameters": {
                **(strategy.get("parameters", {}) if strategy else {}),
                "epsilon": round(new_epsilon, 3),
                "decay_rate": round(new_decay, 3),
                "min_epsilon": 0.05
            },
            "metadata": {
                "auto_optimized": True,
                "last_tuned": datetime.utcnow().isoformat(),
                "tuning_reason": adjustment_reason
            }
        })
        
        tuning_result["applied"] = success
        
        print(f"\n🔧 Epsilon Tuning:")
        print(f"   Previous: ε = {current_epsilon:.3f}")
        print(f"   New: ε = {new_epsilon:.3f}")
        print(f"   Change: {((new_epsilon - current_epsilon) / current_epsilon * 100):+.1f}%")
        
        print(f"\n🔧 Decay Rate Tuning:")
        print(f"   Previous: {current_decay:.3f}")
        print(f"   New: {new_decay:.3f}")
        
        print(f"\n📝 Adjustment: {adjustment_reason}")
        print(f"✅ Applied: {success}")
        
        return tuning_result
    
    def tune_ucb_parameters(self, strategy_id: str = "ucb_bandit") -> Dict:
        """Tune UCB exploration parameter c."""
        strategy = self.db.get_strategy(strategy_id)
        if not strategy:
            return {"error": "UCB strategy not found"}
        
        current_c = strategy.get("parameters", {}).get("c", 2.0)
        perf = strategy.get("performance", {})
        
        # Adjust c based on success rate
        success_rate = perf.get("success_rate", 0.5)
        if success_rate < 0.4:
            new_c = current_c * 1.1  # Increase exploration
        elif success_rate > 0.8:
            new_c = current_c * 0.9  # Decrease exploration
        else:
            new_c = current_c
        
        return {
            "strategy_id": strategy_id,
            "previous_c": current_c,
            "new_c": round(new_c, 2),
            "reason": f"Success rate {success_rate:.2%}"
        }


class OptimizeStrategyWorkflow:
    """
    Complete L4 Workflow: optimize_strategy
    
    Orchestrates the 4-step optimization process:
    1. Analyze historical performance
    2. Evaluate exploration/exploitation balance
    3. Tune epsilon-greedy parameters
    4. Select optimal workflow sequence
    """
    
    def __init__(self):
        self.db = StrategyDatabase()
        self.analyzer = StrategyAnalyzer(self.db)
        self.selector = StrategySelector(self.db)
        self.tuner = HyperparameterTuner(self.db)
    
    def execute(self, run_history: List[Dict] = None, dry_run: bool = False) -> Dict:
        """Execute the complete optimization workflow."""
        print("="*60)
        print("L4 STRATEGY OPTIMIZATION WORKFLOW")
        print("="*60)
        print(f"Started: {datetime.utcnow().isoformat()}")
        print(f"Dry Run: {dry_run}")
        print("="*60)
        
        results = {
            "workflow_id": "optimize_strategy",
            "started_at": datetime.utcnow().isoformat(),
            "dry_run": dry_run,
            "steps": {}
        }
        
        # Step 1: Analyze performance
        performance_report = self.analyzer.analyze_performance(run_history)
        results["steps"]["step1_analysis"] = {
            "status": "completed",
            "output": "strategy_performance_report",
            "data": performance_report
        }
        
        # Step 2: Evaluate exploration vs exploitation
        current_epsilon = 0.2  # Default
        strategies = self.db.get_all_strategies()
        if strategies:
            balanced = strategies.get("epsilon_greedy_balanced", {})
            current_epsilon = balanced.get("parameters", {}).get("epsilon", 0.2)
        
        recommendation = self.selector.evaluate_exploration_exploitation(
            performance_report, 
            current_epsilon
        )
        results["steps"]["step2_evaluation"] = {
            "status": "completed",
            "output": "recommendation",
            "data": recommendation
        }
        
        # Step 3: Tune hyperparameters
        tuning_result = self.tuner.tune_epsilon_greedy(
            recommendation,
            "epsilon_greedy_balanced"
        )
        results["steps"]["step3_tuning"] = {
            "status": "completed",
            "output": "new_epsilon_value",
            "data": tuning_result
        }
        
        # Step 4: Select optimal workflow
        workflow_selection = self.selector.select_optimal_workflow(
            performance_report,
            recommendation
        )
        results["steps"]["step4_selection"] = {
            "status": "completed",
            "output": "recommended_sequence",
            "data": workflow_selection
        }
        
        # Save best strategy
        top_performer = performance_report.get("top_performer")
        if top_performer:
            self.db.save_best_strategy(
                top_performer["strategy_id"],
                top_performer
            )
        
        # Final summary
        results["completed_at"] = datetime.utcnow().isoformat()
        results["success"] = True
        
        print("\n" + "="*60)
        print("WORKFLOW COMPLETED")
        print("="*60)
        print(f"✅ Strategy optimization complete")
        print(f"   New ε: {tuning_result.get('new_epsilon')}")
        print(f"   Recommendation: {recommendation.get('action')}")
        print(f"   Sequence: {' → '.join(workflow_selection.get('recommended_sequence', []))}")
        
        return results
    
    def save_workflow_result(self, results: Dict, output_dir: Optional[str] = None):
        """Save workflow results to file."""
        if output_dir is None:
            output_dir = self.db.workspace / "strategies_data" / "workflow_results"
        
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        output_file = output_dir / f"optimize_strategy_{timestamp}.json"
        
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"\n💾 Results saved: {output_file}")
        return output_file


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="L4 Strategy Optimization Workflow")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--save", action="store_true", help="Save results to file")
    parser.add_argument("--init", action="store_true", help="Initialize strategies collection first")
    
    args = parser.parse_args()
    
    # Initialize if requested
    if args.init:
        print("🚀 Initializing strategies collection...")
        from create_strategies_collection import create_strategies_collection
        create_strategies_collection()
        print()
    
    # Run workflow
    workflow = OptimizeStrategyWorkflow()
    results = workflow.execute(dry_run=args.dry_run)
    
    # Save if requested
    if args.save:
        workflow.save_workflow_result(results)
    
    return 0 if results.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())
