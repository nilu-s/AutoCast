#!/usr/bin/env python3
"""Create AutoResearch Domain Collections with Demo Data.

Erstellt die Collections:
- methods: Methoden aus dem bestehenden Katalog
- runs: Demo-Runs mit verschiedenen Status
- evaluations: Metriken (WER, CER) für Baseline vs Final
- metrics: Referenzwerte und Ziele

Usage:
    python create_autoresearch_collections.py
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

# Add workspace to path
workspace_root = Path(__file__).parent
sys.path.insert(0, str(workspace_root))

from learning.chroma_client import ChromaLearningDB


def create_methods_collection(db: ChromaLearningDB) -> int:
    """Create methods collection with demo data.
    
    Returns:
        Number of methods created
    """
    print("\n=== Creating Methods Collection ===")
    
    methods_data = [
        {
            "id": "silence_overlap_bleed_weight",
            "category": "silence-pruner",
            "title": "Increase overlap/bleed suppression weighting",
            "hypothesis": "False-positive speech in bleed-heavy sections is reduced by slightly stronger suppression pressure.",
            "description": "Raises suppression pressure only where overlap trust is high, keeping clean non-overlap speech mostly unchanged.",
            "code_scope": ["packages/analyzer/src/modules/preview/cut_preview_decision_engine.js"],
            "success_rate": 0.75,
            "attempts": 12,
            "parameters": {"suppression_factor": 1.15, "threshold_adjustment": -0.05}
        },
        {
            "id": "silence_noise_gate_postprocess",
            "category": "silence-pruner",
            "title": "Tighten residual noise pruning",
            "hypothesis": "Residual noise in processed segments can be reduced with post-processing noise gate.",
            "description": "Applies a secondary noise gate after initial pruning to catch residual artifacts.",
            "code_scope": ["packages/analyzer/src/modules/postprocess/noise_gate.js"],
            "success_rate": 0.68,
            "attempts": 9,
            "parameters": {"noise_floor": -60, "attack_ms": 10, "release_ms": 50}
        },
        {
            "id": "duration_padding_rebalance",
            "category": "duration-specialist",
            "title": "Rebalance pre/post snippet padding",
            "hypothesis": "Smaller asymmetric padding better approximates target durations.",
            "description": "Try conservative reductions on before/after pads while preserving handover continuity safeguards.",
            "code_scope": ["packages/analyzer/src/defaults/analyzer_defaults.js", 
                        "packages/analyzer/src/modules/segmentation/segment_padding.js"],
            "success_rate": 0.82,
            "attempts": 15,
            "parameters": {"pre_padding": 0.3, "post_padding": 0.5, "asymmetric_ratio": 0.6}
        },
        {
            "id": "duration_merge_window_tuning",
            "category": "duration-specialist",
            "title": "Tune merge windows for finer segmentation",
            "hypothesis": "Optimized merge windows improve segment boundary precision.",
            "description": "Fine-tunes temporal merge windows to balance between over-segmentation and under-segmentation.",
            "code_scope": ["packages/analyzer/src/modules/segmentation/merge_window.js"],
            "success_rate": 0.71,
            "attempts": 8,
            "parameters": {"min_gap_ms": 50, "max_gap_ms": 300, "adaptive_factor": 1.2}
        },
        {
            "id": "review_corridor_soften",
            "category": "review-calibrator",
            "title": "Soften hard review corridor",
            "hypothesis": "Softer review corridor reduces false positives while maintaining quality standards.",
            "description": "Relaxes the strict review threshold to reduce unnecessary manual reviews.",
            "code_scope": ["packages/analyzer/src/modules/review/corridor_detector.js"],
            "success_rate": 0.79,
            "attempts": 11,
            "parameters": {"lower_bound": 0.35, "upper_bound": 0.85, "softness": 0.2}
        },
        {
            "id": "review_bleed_uncertainty_gate",
            "category": "review-calibrator",
            "title": "Strengthen bleed-uncertainty review routing",
            "hypothesis": "Better routing of uncertain bleed cases improves overall review efficiency.",
            "description": "Enhances detection of uncertain speech segments for targeted review.",
            "code_scope": ["packages/analyzer/src/modules/review/uncertainty_router.js"],
            "success_rate": 0.65,
            "attempts": 7,
            "parameters": {"uncertainty_threshold": 0.4, "bleed_weight": 0.6}
        },
        {
            "id": "speech_low_energy_hold",
            "category": "speech-retainer",
            "title": "Protect low-energy speech continuity",
            "hypothesis": "Low-energy speech regions are often incorrectly classified as silence.",
            "description": "Maintains speech continuity by preserving low-energy regions that show speech-like patterns.",
            "code_scope": ["packages/analyzer/src/modules/speech/low_energy_protection.js"],
            "success_rate": 0.88,
            "attempts": 18,
            "parameters": {"energy_floor": 0.05, "continuity_window_ms": 200}
        },
        {
            "id": "speech_threshold_recenter",
            "category": "speech-retainer",
            "title": "Recenter speech threshold margins",
            "hypothesis": "Recentered thresholds better accommodate varying speech energy levels.",
            "description": "Dynamically adjusts speech detection thresholds based on observed energy distribution.",
            "code_scope": ["packages/analyzer/src/modules/speech/threshold_adaptive.js"],
            "success_rate": 0.73,
            "attempts": 10,
            "parameters": {"center_adaptation_rate": 0.1, "min_threshold": 0.15, "max_threshold": 0.45}
        },
        {
            "id": "validator_full_gate",
            "category": "validator",
            "title": "Full quality gate",
            "hypothesis": "Comprehensive validation catches edge cases missed by individual modules.",
            "description": "Applies multi-stage validation including consistency checks and quality thresholds.",
            "code_scope": ["packages/analyzer/src/modules/validation/full_gate.js"],
            "success_rate": 0.92,
            "attempts": 25,
            "parameters": {"strictness": 0.8, "check_consistency": True, "min_confidence": 0.7}
        },
        {
            "id": "boundary_precision_tuner",
            "category": "segmentation-expert",
            "title": "Fine-tune segment boundary precision",
            "hypothesis": "Sub-frame boundary adjustments improve segment edge detection.",
            "description": "Adjusts segment boundaries at sub-frame resolution for optimal cut points.",
            "code_scope": ["packages/analyzer/src/modules/segmentation/boundary_precision.js"],
            "success_rate": 0.70,
            "attempts": 6,
            "parameters": {"sub_frame_resolution": 0.5, "lookahead_frames": 3}
        }
    ]
    
    count = 0
    for method in methods_data:
        # Create embedding from method_id + description + hypothesis
        content = f"{method['id']} {method['title']} {method['hypothesis']} {method['description']}"
        embedding = db.encoder.encode(content)
        
        metadata = {
            "category": method['category'],
            "title": method['title'],
            "hypothesis": method['hypothesis'],
            "description": method['description'],
            "code_scope": json.dumps(method['code_scope']),
            "success_rate": method['success_rate'],
            "attempts": method['attempts'],
            "parameters": json.dumps(method['parameters']),
            "created_at": datetime.now().isoformat()
        }
        
        try:
            db.methods.add(
                ids=[method['id']],
                embeddings=[embedding],
                metadatas=[metadata]
            )
            print(f"  ✓ Added: {method['id']} ({method['category']}) - SR: {method['success_rate']:.2%}")
            count += 1
        except Exception as e:
            print(f"  ✗ Failed: {method['id']} - {e}")
    
    return count


def create_runs_collection(db: ChromaLearningDB) -> int:
    """Create runs collection with demo data.
    
    Returns:
        Number of runs created
    """
    print("\n=== Creating Runs Collection ===")
    
    base_time = datetime.now() - timedelta(days=5)
    
    runs_data = [
        {
            "run_id": "run_20260320_001",
            "timestamp": (base_time + timedelta(days=0)).isoformat(),
            "baseline_score": 0.62,
            "final_score": 0.71,
            "status": "COMPLETED",
            "methods_applied": ["silence_overlap_bleed_weight", "duration_padding_rebalance"],
            "context": "Initial baseline run with silence and duration methods"
        },
        {
            "run_id": "run_20260321_002",
            "timestamp": (base_time + timedelta(days=1)).isoformat(),
            "baseline_score": 0.71,
            "final_score": 0.78,
            "status": "COMPLETED",
            "methods_applied": ["review_corridor_soften", "speech_low_energy_hold", "validator_full_gate"],
            "context": "Quality improvement with review and speech methods"
        },
        {
            "run_id": "run_20260322_003",
            "timestamp": (base_time + timedelta(days=2)).isoformat(),
            "baseline_score": 0.78,
            "final_score": 0.75,
            "status": "COMPLETED",
            "methods_applied": ["duration_merge_window_tuning", "review_bleed_uncertainty_gate"],
            "context": "Regressive run - merge window too aggressive"
        },
        {
            "run_id": "run_20260323_004",
            "timestamp": (base_time + timedelta(days=3)).isoformat(),
            "baseline_score": 0.75,
            "final_score": 0.84,
            "status": "COMPLETED",
            "methods_applied": ["silence_noise_gate_postprocess", "speech_threshold_recenter", 
                             "boundary_precision_tuner", "validator_full_gate"],
            "context": "Recovery with noise gate and threshold tuning"
        },
        {
            "run_id": "run_20260324_005",
            "timestamp": (base_time + timedelta(days=4)).isoformat(),
            "baseline_score": 0.84,
            "final_score": 0.86,
            "status": "RUNNING",
            "methods_applied": ["speech_low_energy_hold", "duration_padding_rebalance"],
            "context": "Ongoing optimization for marginal gains"
        }
    ]
    
    count = 0
    for run in runs_data:
        # Create embedding from run_id + context + methods
        content = f"{run['run_id']} {run['context']} {' '.join(run['methods_applied'])}"
        embedding = db.encoder.encode(content)
        
        metadata = {
            "timestamp": run['timestamp'],
            "baseline_score": run['baseline_score'],
            "final_score": run['final_score'],
            "status": run['status'],
            "methods_applied": json.dumps(run['methods_applied']),
            "context": run['context'],
            "improvement": run['final_score'] - run['baseline_score']
        }
        
        try:
            db.runs.add(
                ids=[run['run_id']],
                embeddings=[embedding],
                metadatas=[metadata]
            )
            improvement = run['final_score'] - run['baseline_score']
            sign = "+" if improvement >= 0 else ""
            print(f"  ✓ Added: {run['run_id']} ({run['status']}) - {sign}{improvement:.2f}")
            count += 1
        except Exception as e:
            print(f"  ✗ Failed: {run['run_id']} - {e}")
    
    return count


def create_evaluations_collection(db: ChromaLearningDB) -> int:
    """Create evaluations collection with WER/CER metrics.
    
    Returns:
        Number of evaluations created
    """
    print("\n=== Creating Evaluations Collection ===")
    
    evaluations_data = [
        {
            "eval_id": "eval_run_001",
            "run_id": "run_20260320_001",
            "method_id": "silence_overlap_bleed_weight",
            "baseline_wer": 0.28,
            "final_wer": 0.24,
            "baseline_cer": 0.18,
            "final_cer": 0.15,
            "improvement": 0.04,
            "decision": "KEEP",
            "notes": "WER improved by 4 percentage points, consistent across test files"
        },
        {
            "eval_id": "eval_run_002",
            "run_id": "run_20260320_001",
            "method_id": "duration_padding_rebalance",
            "baseline_wer": 0.24,
            "final_wer": 0.23,
            "baseline_cer": 0.15,
            "final_cer": 0.14,
            "improvement": 0.01,
            "decision": "KEEP",
            "notes": "Marginal but stable improvement, good/near ratio improved"
        },
        {
            "eval_id": "eval_run_003",
            "run_id": "run_20260321_002",
            "method_id": "review_corridor_soften",
            "baseline_wer": 0.23,
            "final_wer": 0.21,
            "baseline_cer": 0.14,
            "final_cer": 0.13,
            "improvement": 0.02,
            "decision": "KEEP",
            "notes": "Reduced false positive reviews by 15%"
        },
        {
            "eval_id": "eval_run_004",
            "run_id": "run_20260321_002",
            "method_id": "speech_low_energy_hold",
            "baseline_wer": 0.21,
            "final_wer": 0.18,
            "baseline_cer": 0.13,
            "final_cer": 0.11,
            "improvement": 0.03,
            "decision": "KEEP",
            "notes": "Significant improvement on low-energy speech samples"
        },
        {
            "eval_id": "eval_run_005",
            "run_id": "run_20260322_003",
            "method_id": "duration_merge_window_tuning",
            "baseline_wer": 0.18,
            "final_wer": 0.20,
            "baseline_cer": 0.11,
            "final_cer": 0.13,
            "improvement": -0.02,
            "decision": "REJECT",
            "notes": "Over-aggressive merging caused boundary errors"
        },
        {
            "eval_id": "eval_run_006",
            "run_id": "run_20260323_004",
            "method_id": "silence_noise_gate_postprocess",
            "baseline_wer": 0.20,
            "final_wer": 0.17,
            "baseline_cer": 0.13,
            "final_cer": 0.10,
            "improvement": 0.03,
            "decision": "KEEP",
            "notes": "Excellent noise reduction without speech loss"
        },
        {
            "eval_id": "eval_run_007",
            "run_id": "run_20260323_004",
            "method_id": "speech_threshold_recenter",
            "baseline_wer": 0.17,
            "final_wer": 0.16,
            "baseline_cer": 0.10,
            "final_cer": 0.09,
            "improvement": 0.01,
            "decision": "KEEP",
            "notes": "Subtle improvement, thresholds well-adapted"
        },
        {
            "eval_id": "eval_run_008",
            "run_id": "run_20260324_005",
            "method_id": "speech_low_energy_hold",
            "baseline_wer": 0.16,
            "final_wer": 0.15,
            "baseline_cer": 0.09,
            "final_cer": 0.085,
            "improvement": 0.01,
            "decision": "PENDING",
            "notes": "Second iteration, marginal improvement"
        }
    ]
    
    count = 0
    for eval_data in evaluations_data:
        # Create embedding from eval_id + method_id + notes
        content = f"{eval_data['eval_id']} {eval_data['method_id']} {eval_data['notes']} WER: {eval_data['baseline_wer']} -> {eval_data['final_wer']}"
        embedding = db.encoder.encode(content)
        
        metadata = {
            "run_id": eval_data['run_id'],
            "method_id": eval_data['method_id'],
            "baseline_wer": eval_data['baseline_wer'],
            "final_wer": eval_data['final_wer'],
            "baseline_cer": eval_data['baseline_cer'],
            "final_cer": eval_data['final_cer'],
            "improvement": eval_data['improvement'],
            "decision": eval_data['decision'],
            "notes": eval_data['notes'],
            "wer_delta": eval_data['final_wer'] - eval_data['baseline_wer'],
            "cer_delta": eval_data['final_cer'] - eval_data['baseline_cer']
        }
        
        try:
            # Use evaluations collection if it exists, otherwise use method_runs as a proxy
            if hasattr(db, 'evaluations'):
                collection = db.evaluations
            else:
                # Create a new collection for evaluations
                if db.client:
                    db.evaluations = db.client.get_or_create_collection(
                        name="evaluations",
                        metadata={"description": "Evaluation metrics (WER, CER)"}
                    )
                else:
                    from learning.chroma_client import MockCollection
                    db.evaluations = MockCollection("evaluations")
                collection = db.evaluations
            
            collection.add(
                ids=[eval_data['eval_id']],
                embeddings=[embedding],
                metadatas=[metadata]
            )
            
            sign = "+" if eval_data['improvement'] >= 0 else ""
            print(f"  ✓ Added: {eval_data['eval_id']} ({eval_data['decision']}) - WER Δ: {sign}{eval_data['improvement']:.2f}")
            count += 1
        except Exception as e:
            print(f"  ✗ Failed: {eval_data['eval_id']} - {e}")
    
    return count


def create_metrics_collection(db: ChromaLearningDB) -> int:
    """Create metrics collection with reference values and targets.
    
    Returns:
        Number of metrics created
    """
    print("\n=== Creating Metrics Collection ===")
    
    metrics_data = [
        {
            "metric_id": "target_wer",
            "name": "Target Word Error Rate",
            "value": 0.15,
            "type": "target",
            "unit": "ratio",
            "description": "Target WER for production-ready speech processing",
            "rationale": "Industry standard for high-quality ASR post-processing"
        },
        {
            "metric_id": "target_cer",
            "name": "Target Character Error Rate",
            "value": 0.08,
            "type": "target",
            "unit": "ratio",
            "description": "Target CER for fine-grained accuracy",
            "rationale": "Stricter than WER, ensures character-level precision"
        },
        {
            "metric_id": "current_best_wer",
            "name": "Current Best WER",
            "value": 0.15,
            "type": "current_best",
            "unit": "ratio",
            "description": "Best WER achieved so far",
            "rationale": "Updated after run_20260324_005 with speech_low_energy_hold"
        },
        {
            "metric_id": "current_best_cer",
            "name": "Current Best CER",
            "value": 0.085,
            "type": "current_best",
            "unit": "ratio",
            "description": "Best CER achieved so far",
            "rationale": "CER target partially met, room for improvement"
        },
        {
            "metric_id": "baseline_wer",
            "name": "Baseline WER",
            "value": 0.28,
            "type": "baseline",
            "unit": "ratio",
            "description": "Initial WER before any optimization",
            "rationale": "Starting point from run_20260320_001"
        },
        {
            "metric_id": "improvement_threshold",
            "name": "Minimum Acceptable Improvement",
            "value": 0.01,
            "type": "threshold",
            "unit": "ratio",
            "description": "Minimum WER improvement to accept a method",
            "rationale": "Reject methods with <1% improvement"
        },
        {
            "metric_id": "regression_threshold",
            "name": "Maximum Acceptable Regression",
            "value": -0.02,
            "type": "threshold",
            "unit": "ratio",
            "description": "WER regression limit before auto-rejection",
            "rationale": "Any regression >2% triggers automatic rollback"
        },
        {
            "metric_id": "success_rate_target",
            "name": "Target Method Success Rate",
            "value": 0.75,
            "type": "target",
            "unit": "ratio",
            "description": "Target success rate for individual methods",
            "rationale": "Methods with SR>75% are considered reliable"
        },
        {
            "metric_id": "avg_improvement_per_run",
            "name": "Average Improvement per Run",
            "value": 0.048,
            "type": "derived",
            "unit": "ratio",
            "description": "Average score improvement across all completed runs",
            "rationale": "Calculated from runs with status COMPLETED"
        },
        {
            "metric_id": "total_methods_tested",
            "name": "Total Methods Tested",
            "value": 10,
            "type": "count",
            "unit": "count",
            "description": "Number of unique methods tested",
            "rationale": "Coverage metric for the method catalog"
        }
    ]
    
    count = 0
    for metric in metrics_data:
        # Create embedding from metric_id + name + description
        content = f"{metric['metric_id']} {metric['name']} {metric['description']} {metric['type']}"
        embedding = db.encoder.encode(content)
        
        metadata = {
            "name": metric['name'],
            "value": metric['value'],
            "type": metric['type'],
            "unit": metric['unit'],
            "description": metric['description'],
            "rationale": metric['rationale'],
            "created_at": datetime.now().isoformat()
        }
        
        try:
            # Create metrics collection if it doesn't exist
            if not hasattr(db, 'metrics'):
                if db.client:
                    db.metrics = db.client.get_or_create_collection(
                        name="metrics",
                        metadata={"description": "Reference metrics and targets"}
                    )
                else:
                    from learning.chroma_client import MockCollection
                    db.metrics = MockCollection("metrics")
            
            db.metrics.add(
                ids=[metric['metric_id']],
                embeddings=[embedding],
                metadatas=[metadata]
            )
            
            value_str = f"{metric['value']:.3f}" if isinstance(metric['value'], float) else str(metric['value'])
            print(f"  ✓ Added: {metric['metric_id']} ({metric['type']}) = {value_str}")
            count += 1
        except Exception as e:
            print(f"  ✗ Failed: {metric['metric_id']} - {e}")
    
    return count


def verify_collections(db: ChromaLearningDB) -> Dict[str, bool]:
    """Verify all collections have entries.
    
    Returns:
        Dictionary with verification results
    """
    print("\n=== Verification ===")
    
    results = {}
    
    # Check methods
    try:
        methods = db.methods.get(include=["metadatas"])
        results['methods'] = len(methods.get('ids', [])) > 0
        print(f"  {'✓' if results['methods'] else '✗'} methods: {len(methods.get('ids', []))} entries")
    except Exception as e:
        results['methods'] = False
        print(f"  ✗ methods collection error: {e}")
    
    # Check runs
    try:
        runs = db.runs.get(include=["metadatas"])
        results['runs'] = len(runs.get('ids', [])) > 0
        print(f"  {'✓' if results['runs'] else '✗'} runs: {len(runs.get('ids', []))} entries")
    except Exception as e:
        results['runs'] = False
        print(f"  ✗ runs collection error: {e}")
    
    # Check evaluations
    try:
        if hasattr(db, 'evaluations'):
            evaluations = db.evaluations.get(include=["metadatas"])
            results['evaluations'] = len(evaluations.get('ids', [])) > 0
            print(f"  {'✓' if results['evaluations'] else '✗'} evaluations: {len(evaluations.get('ids', []))} entries")
        else:
            results['evaluations'] = False
            print(f"  ✗ evaluations collection not found")
    except Exception as e:
        results['evaluations'] = False
        print(f"  ✗ evaluations collection error: {e}")
    
    # Check metrics
    try:
        if hasattr(db, 'metrics'):
            metrics = db.metrics.get(include=["metadatas"])
            results['metrics'] = len(metrics.get('ids', [])) > 0
            print(f"  {'✓' if results['metrics'] else '✗'} metrics: {len(metrics.get('ids', []))} entries")
        else:
            results['metrics'] = False
            print(f"  ✗ metrics collection not found")
    except Exception as e:
        results['metrics'] = False
        print(f"  ✗ metrics collection error: {e}")
    
    return results


def test_queries(db: ChromaLearningDB) -> bool:
    """Test query functionality.
    
    Returns:
        True if all queries work
    """
    print("\n=== Testing Queries ===")
    
    all_passed = True
    
    # Query 1: Finde beste Methode
    print("\n1. Query: 'finde beste Methode'")
    try:
        # Get methods with highest success rate
        query_text = "beste Methode höchste Erfolgsrate success rate"
        embedding = db.encoder.encode(query_text)
        results = db.methods.query(
            query_embeddings=[embedding],
            n_results=3,
            include=["metadatas", "distances"]
        )
        if results['ids'][0]:
            for i, method_id in enumerate(results['ids'][0]):
                meta = results['metadatas'][0][i]
                print(f"   → {method_id}: {meta.get('title', 'N/A')} (SR: {meta.get('success_rate', 0):.2%})")
            print("   ✓ Query erfolgreich")
        else:
            print("   ✗ Keine Ergebnisse")
            all_passed = False
    except Exception as e:
        print(f"   ✗ Query fehlgeschlagen: {e}")
        all_passed = False
    
    # Query 2: Vergleiche Runs
    print("\n2. Query: 'Vergleiche Runs'")
    try:
        query_text = "vergleiche runs baseline final improvement"
        embedding = db.encoder.encode(query_text)
        results = db.runs.query(
            query_embeddings=[embedding],
            n_results=5,
            include=["metadatas"]
        )
        if results['ids'][0]:
            for i, run_id in enumerate(results['ids'][0]):
                meta = results['metadatas'][0][i]
                baseline = meta.get('baseline_score', 0)
                final = meta.get('final_score', 0)
                improvement = final - baseline
                sign = "+" if improvement >= 0 else ""
                print(f"   → {run_id}: {baseline:.2f} → {final:.2f} ({sign}{improvement:.2f}) [{meta.get('status', 'N/A')}]")
            print("   ✓ Query erfolgreich")
        else:
            print("   ✗ Keine Ergebnisse")
            all_passed = False
    except Exception as e:
        print(f"   ✗ Query fehlgeschlagen: {e}")
        all_passed = False
    
    # Query 3: Methoden nach Kategorie
    print("\n3. Query: 'speech-retainer Methoden'")
    try:
        results = db.query_by_metadata(category="speech-retainer")
        if results:
            for method in results[:3]:
                print(f"   → {method['method_id']}: {method.get('title', 'N/A')}")
            print("   ✓ Query erfolgreich")
        else:
            print("   ✗ Keine Ergebnisse")
            all_passed = False
    except Exception as e:
        print(f"   ✗ Query fehlgeschlagen: {e}")
        all_passed = False
    
    # Query 4: Beste Evaluation (höchste WER-Verbesserung)
    print("\n4. Query: 'Beste Evaluation (WER)'")
    try:
        if hasattr(db, 'evaluations'):
            evals = db.evaluations.get(include=["metadatas"])
            if evals['ids']:
                # Sort by improvement
                sorted_evals = sorted(
                    zip(evals['ids'], evals['metadatas']),
                    key=lambda x: x[1].get('improvement', 0),
                    reverse=True
                )
                for eval_id, meta in sorted_evals[:3]:
                    improvement = meta.get('improvement', 0)
                    sign = "+" if improvement >= 0 else ""
                    print(f"   → {eval_id}: {meta.get('method_id', 'N/A')} - WER Δ {sign}{improvement:.2f} ({meta.get('decision', 'N/A')})")
                print("   ✓ Query erfolgreich")
            else:
                print("   ✗ Keine Ergebnisse")
                all_passed = False
    except Exception as e:
        print(f"   ✗ Query fehlgeschlagen: {e}")
        all_passed = False
    
    return all_passed


def main():
    """Main entry point."""
    print("=" * 60)
    print("AutoResearch Domain - Collections Setup")
    print("=" * 60)
    
    # Initialize ChromaDB
    db = ChromaLearningDB()
    print(f"\nChromaDB initialized: {db.persist_dir}")
    
    # Create collections
    methods_count = create_methods_collection(db)
    runs_count = create_runs_collection(db)
    eval_count = create_evaluations_collection(db)
    metrics_count = create_metrics_collection(db)
    
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  - methods: {methods_count} entries")
    print(f"  - runs: {runs_count} entries")
    print(f"  - evaluations: {eval_count} entries")
    print(f"  - metrics: {metrics_count} entries")
    print("=" * 60)
    
    # Verify collections
    verification = verify_collections(db)
    
    # Test queries
    queries_passed = test_queries(db)
    
    # Final result
    print("\n" + "=" * 60)
    print("Final Result:")
    all_verified = all(verification.values())
    if all_verified and queries_passed:
        print("  ✓ All collections created and verified")
        print("  ✓ All queries working")
        print("  ✓ AutoResearch Domain successfully restored!")
        return 0
    else:
        print("  ✗ Some verifications failed")
        for collection, status in verification.items():
            print(f"    - {collection}: {'✓' if status else '✗'}")
        if not queries_passed:
            print("  ✗ Some queries failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
