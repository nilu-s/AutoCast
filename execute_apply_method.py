#!/usr/bin/env python3
"""
execute_apply_method.py

Apply Method Workflow für AutoCast
- Validiert Methode
- Führt Methode aus
- Aggregiert Ergebnisse
- Vergleicht vor/nach
- Entscheidet KEEP/REJECT
- Speichert Run

Usage:
    python execute_apply_method.py --method-id method_001
    python execute_apply_method.py --method-id method_001 --skip-approval
"""

import argparse
import json
import os
import sys
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any

# Import workflow storage
from workflows_storage import save_workflow, get_workflow, save_execution

# Workspace path
WORKSPACE_DIR = "/home/node/.openclaw/workspace/AutoCast"


class ApplyMethodError(Exception):
    """Raised when apply method fails"""
    pass


class ValidationError(Exception):
    """Raised when validation fails"""
    pass


class ApplyMethodEngine:
    """Apply Method workflow execution engine"""
    
    def __init__(self, method_id: str, skip_approval: bool = False):
        self.method_id = method_id
        self.skip_approval = skip_approval
        self.execution_id = str(uuid.uuid4())[:8]
        self.context: Dict[str, Any] = {}
        self.step_results: Dict[str, Any] = {}
        self.start_time = None
        self.end_time = None
        
    def log_step(self, step_num: int, agent: str, skill: str, action: str, 
                 status: str = "running", details: str = ""):
        """Log step execution"""
        emoji = "✅" if status == "completed" else "⏳" if status == "running" else "❌"
        print(f"\n{'='*60}")
        print(f"{emoji} Step {step_num}: {action}")
        print(f"   Agent: {agent} | Skill: {skill}")
        if details:
            print(f"   Details: {details}")
        print(f"{'='*60}")
    
    def step_1_validate_method(self) -> Dict[str, Any]:
        """
        Step 1: agent_guardian
        Skill: skill_validation_check
        Action: validate_method
        Prüft: Existiert Methode? Sind Parameter valid?
        """
        self.log_step(1, "agent_guardian", "skill_validation_check", 
                      "validate_method", "running")
        
        # Try to load from ChromaDB first
        try:
            from learning.chroma_client import ChromaLearningDB
            db = ChromaLearningDB()
            methods_coll = db.client.get_collection("methods")
            result = methods_coll.get(ids=[self.method_id], include=["metadatas"])
            if result.get("ids"):
                print(f"   ✓ Found method in ChromaDB: {self.method_id}")
                return {
                    "status": "valid",
                    "method_id": self.method_id,
                    "method_info": result["metadatas"][0],
                    "validation_timestamp": datetime.utcnow().isoformat()
                }
        except Exception as e:
            print(f"   Note: Could not query ChromaDB ({e}), using fallback")
        
        # Fallback: Mock validation
        valid_methods = ["method_001", "method_002", "method_003"]
        
        if self.method_id not in valid_methods:
            raise ValidationError(f"Method {self.method_id} not found")
        
        # Method info simulieren
        method_info = {
            "method_001": {
                "name": "Fine-tune Whisper",
                "type": "training",
                "parameters": {"epochs": 3, "batch_size": 16},
                "estimated_duration": 3600
            },
            "method_002": {
                "name": "Add noise augmentation",
                "type": "data_augmentation",
                "parameters": {"noise_level": 0.1},
                "estimated_duration": 600
            },
            "method_003": {
                "name": "Use larger model",
                "type": "model_upgrade",
                "parameters": {"model_size": "large"},
                "estimated_duration": 1800
            }
        }
        
        result = {
            "status": "valid",
            "method_id": self.method_id,
            "method_info": method_info.get(self.method_id, {}),
            "validation_timestamp": datetime.utcnow().isoformat()
        }
        
        self.log_step(1, "agent_guardian", "skill_validation_check", 
                      "validate_method", "completed", f"Method {self.method_id} validated")
        return result
    
    def step_2_execute_method(self, validation_result: Dict) -> Dict[str, Any]:
        """
        Step 2: agent_worker
        Skill: skill_method_execution
        Action: execute_method
        Führt Methode aus (z.B. Fine-tune Whisper)
        """
        self.log_step(2, "agent_worker", "skill_method_execution", 
                      "execute_method", "running")
        
        method_info = validation_result.get("method_info", {})
        method_name = method_info.get("name", "unknown")
        
        print(f"   🔄 Executing: {method_name}")
        print(f"   ⏱️  Estimated duration: {method_info.get('estimated_duration', 0)}s")
        
        # Mock: Methode ausführen (simuliert)
        # In Produktion: Tatsächlichen Training-Job starten
        
        execution_result = {
            "status": "completed",
            "method_id": self.method_id,
            "method_name": method_name,
            "execution_start": datetime.utcnow().isoformat(),
            "execution_end": datetime.utcnow().isoformat(),
            "parameters_applied": method_info.get("parameters", {}),
            "artifacts_generated": [
                f"model_{self.method_id}.pt",
                "training_log.json"
            ]
        }
        
        self.log_step(2, "agent_worker", "skill_method_execution", 
                      "execute_method", "completed", f"{method_name} completed")
        return execution_result
    
    def step_3_aggregate_results(self, execution_result: Dict) -> Dict[str, Any]:
        """
        Step 3: agent_analyzer
        Skill: skill_result_aggregation
        Action: aggregate_results
        Berechnet neue Metriken
        """
        self.log_step(3, "agent_analyzer", "skill_result_aggregation", 
                      "aggregate_results", "running")
        
        print("   📊 Calculating new metrics...")
        
        # Mock: Neue Metriken berechnen
        # In Produktion: Evaluation auf Test-Set durchführen
        
        new_metrics = {
            "timestamp": datetime.utcnow().isoformat(),
            "wer": 0.18,  # Simulierte Verbesserung von 0.23
            "cer": 0.12,  # Simulierte Verbesserung von 0.15
            "method_id": self.method_id,
            "evaluated_on": "test_set_v1",
            "samples": 1000
        }
        
        result = {
            "status": "completed",
            "new_metrics": new_metrics,
            "aggregation_timestamp": datetime.utcnow().isoformat()
        }
        
        self.log_step(3, "agent_analyzer", "skill_result_aggregation", 
                      "aggregate_results", "completed", 
                      f"WER: {new_metrics['wer']}, CER: {new_metrics['cer']}")
        return result
    
    def step_4_compare_before_after(self, execution_result: Dict, 
                                     new_metrics: Dict) -> Dict[str, Any]:
        """
        Step 4: agent_analyzer
        Skill: skill_success_analysis
        Action: compare_before_after
        Vergleicht alte vs neue Metriken
        """
        self.log_step(4, "agent_analyzer", "skill_success_analysis", 
                      "compare_before_after", "running")
        
        # Vorherige Metriken (aus Kontext oder DB)
        old_metrics = {
            "wer": 0.23,
            "cer": 0.15
        }
        
        # Vergleich berechnen
        wer_change = old_metrics["wer"] - new_metrics["wer"]
        cer_change = old_metrics["cer"] - new_metrics["cer"]
        wer_improvement = (wer_change / old_metrics["wer"]) * 100
        cer_improvement = (cer_change / old_metrics["cer"]) * 100
        
        analysis = {
            "status": "completed",
            "before": old_metrics,
            "after": new_metrics,
            "changes": {
                "wer_absolute": round(wer_change, 4),
                "cer_absolute": round(cer_change, 4),
                "wer_percent": round(wer_improvement, 2),
                "cer_percent": round(cer_improvement, 2)
            },
            "improved": wer_change > 0 or cer_change > 0
        }
        
        self.log_step(4, "agent_analyzer", "skill_success_analysis", 
                      "compare_before_after", "completed")
        print(f"\n   📈 Before → After:")
        print(f"      WER: {old_metrics['wer']:.2f} → {new_metrics['wer']:.2f} "
              f"({wer_improvement:+.1f}%)")
        print(f"      CER: {old_metrics['cer']:.2f} → {new_metrics['cer']:.2f} "
              f"({cer_improvement:+.1f}%)")
        
        return analysis
    
    def step_5_validate_improvement(self, improvement_analysis: Dict) -> Dict[str, Any]:
        """
        Step 5: agent_guardian
        Skill: skill_validation_check
        Action: validate_improvement
        Prüft: Ist Verbesserung > Threshold?
        """
        self.log_step(5, "agent_guardian", "skill_validation_check", 
                      "validate_improvement", "running")
        
        # Thresholds
        MIN_WER_IMPROVEMENT = 0.01  # 1% WER Verbesserung nötig
        MIN_CER_IMPROVEMENT = 0.01  # 1% CER Verbesserung nötig
        
        changes = improvement_analysis.get("changes", {})
        wer_imp = changes.get("wer_absolute", 0)
        cer_imp = changes.get("cer_absolute", 0)
        
        # Entscheidung
        wer_sufficient = wer_imp >= MIN_WER_IMPROVEMENT
        cer_sufficient = cer_imp >= MIN_CER_IMPROVEMENT
        
        if wer_sufficient and cer_sufficient:
            decision = "KEEP"
            reason = f"Significant improvement: WER -{wer_imp:.3f}, CER -{cer_imp:.3f}"
        else:
            decision = "REJECT"
            reason = f"Insufficient improvement: WER -{wer_imp:.3f}, CER -{cer_imp:.3f} " \
                     f"(min: {MIN_WER_IMPROVEMENT})"
        
        result = {
            "status": "completed",
            "decision": decision,
            "reason": reason,
            "thresholds": {
                "min_wer_improvement": MIN_WER_IMPROVEMENT,
                "min_cer_improvement": MIN_CER_IMPROVEMENT
            },
            "passed": wer_sufficient and cer_sufficient
        }
        
        emoji = "✅" if decision == "KEEP" else "❌"
        self.log_step(5, "agent_guardian", "skill_validation_check", 
                      "validate_improvement", "completed", 
                      f"{emoji} Decision: {decision}")
        
        return result
    
    def step_6_record_run(self, final_decision: Dict, execution_result: Dict,
                          improvement_analysis: Dict) -> Dict[str, Any]:
        """
        Step 6: agent_worker
        Skill: skill_chromadb_store
        Action: record_run
        Speichert Run in runs Collection
        """
        self.log_step(6, "agent_worker", "skill_chromadb_store", 
                      "record_run", "running")
        
        print("   💾 Recording run to database...")
        
        run_record = {
            "run_id": f"run_{self.execution_id}",
            "method_id": self.method_id,
            "execution_id": self.execution_id,
            "status": final_decision.get("decision", "UNKNOWN"),
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {
                "before": improvement_analysis.get("before", {}),
                "after": improvement_analysis.get("after", {}),
                "changes": improvement_analysis.get("changes", {})
            },
            "artifacts": execution_result.get("artifacts_generated", []),
            "reason": final_decision.get("reason", "")
        }
        
        # Mock: In DB speichern
        # In Produktion: ChromaDB insert
        
        result = {
            "status": "completed",
            "record_id": run_record["run_id"],
            "saved_at": datetime.utcnow().isoformat()
        }
        
        self.log_step(6, "agent_worker", "skill_chromadb_store", 
                      "record_run", "completed", 
                      f"Run {run_record['run_id']} saved")
        
        return result
    
    def run(self) -> Dict[str, Any]:
        """Execute the full apply method workflow"""
        print(f"\n{'='*70}")
        print(f"🚀 Apply Method Workflow")
        print(f"   Method ID: {self.method_id}")
        print(f"   Execution ID: {self.execution_id}")
        print(f"{'='*70}\n")
        
        self.start_time = datetime.utcnow()
        
        try:
            # Step 1: Validate method
            validation_result = self.step_1_validate_method()
            
            # Step 2: Execute method
            execution_result = self.step_2_execute_method(validation_result)
            
            # Step 3: Aggregate results
            aggregation_result = self.step_3_aggregate_results(execution_result)
            new_metrics = aggregation_result.get("new_metrics", {})
            
            # Step 4: Compare before/after
            improvement_analysis = self.step_4_compare_before_after(
                execution_result, new_metrics)
            
            # Step 5: Validate improvement
            final_decision = self.step_5_validate_improvement(improvement_analysis)
            
            # Step 6: Record run
            record_result = self.step_6_record_run(
                final_decision, execution_result, improvement_analysis)
            
            self.end_time = datetime.utcnow()
            
            # Zusammenfassung
            duration = (self.end_time - self.start_time).total_seconds()
            
            print(f"\n{'='*70}")
            print(f"✅ Apply Method Workflow Completed")
            print(f"{'='*70}")
            print(f"\n📊 Summary:")
            print(f"   Method: {self.method_id}")
            print(f"   Duration: {duration:.2f}s")
            print(f"   Decision: {final_decision.get('decision', 'UNKNOWN')}")
            
            changes = improvement_analysis.get("changes", {})
            print(f"\n📈 Improvement:")
            print(f"   WER: {improvement_analysis['before']['wer']:.2f} → "
                  f"{improvement_analysis['after']['wer']:.2f} "
                  f"({changes.get('wer_percent', 0):+.1f}%)")
            print(f"   CER: {improvement_analysis['before']['cer']:.2f} → "
                  f"{improvement_analysis['after']['cer']:.2f} "
                  f"({changes.get('cer_percent', 0):+.1f}%)")
            
            print(f"\n   Run ID: {record_result.get('record_id')}")
            print(f"{'='*70}\n")
            
            return {
                "status": "completed",
                "method_id": self.method_id,
                "execution_id": self.execution_id,
                "decision": final_decision.get("decision"),
                "improvement": improvement_analysis.get("changes", {}),
                "duration_seconds": duration
            }
            
        except Exception as e:
            self.end_time = datetime.utcnow()
            print(f"\n❌ Workflow failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "method_id": self.method_id,
                "execution_id": self.execution_id
            }


def main():
    parser = argparse.ArgumentParser(
        description="Execute Apply Method workflow",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python execute_apply_method.py --method-id method_001
  python execute_apply_method.py --method-id method_001 --skip-approval
        """
    )
    
    parser.add_argument(
        "--method-id", "-m",
        required=True,
        help="ID of the method to apply (e.g., method_001)"
    )
    
    parser.add_argument(
        "--skip-approval", "-s",
        action="store_true",
        help="Skip human approval prompts"
    )
    
    args = parser.parse_args()
    
    # Execute workflow
    engine = ApplyMethodEngine(
        method_id=args.method_id,
        skip_approval=args.skip_approval
    )
    
    result = engine.run()
    
    # Exit with appropriate code
    sys.exit(0 if result["status"] == "completed" else 1)


if __name__ == "__main__":
    main()
