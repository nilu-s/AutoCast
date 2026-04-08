#!/usr/bin/env python3
"""Verify AutoResearch Collections in ChromaDB.

Usage:
    python verify_autoresearch_collections.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from learning.chroma_client import ChromaLearningDB


def main():
    print("=" * 60)
    print("AutoResearch Collections Verification")
    print("=" * 60)
    
    db = ChromaLearningDB()
    
    # List all collections
    if db.client:
        collections = db.client.list_collections()
        print(f"\nAvailable Collections ({len(collections)}):")
        for coll in collections:
            print(f"  - {coll.name}")
    
    # Check methods
    print("\n--- Methods Collection ---")
    methods = db.methods.get(include=["metadatas"])
    print(f"Count: {len(methods.get('ids', []))}")
    for i, method_id in enumerate(methods.get('ids', [])[:5]):
        meta = methods['metadatas'][i]
        print(f"  {i+1}. {method_id} ({meta.get('category', 'N/A')}) - SR: {meta.get('success_rate', 0):.2%}")
    if len(methods['ids']) > 5:
        print(f"  ... and {len(methods['ids']) - 5} more")
    
    # Check runs
    print("\n--- Runs Collection ---")
    runs = db.runs.get(include=["metadatas"])
    print(f"Count: {len(runs.get('ids', []))}")
    for i, run_id in enumerate(runs.get('ids', [])):
        meta = runs['metadatas'][i]
        baseline = meta.get('baseline_score', 0)
        final = meta.get('final_score', 0)
        status = meta.get('status', 'N/A')
        print(f"  {i+1}. {run_id}: {baseline:.2f} → {final:.2f} [{status}]")
    
    # Check evaluations
    print("\n--- Evaluations Collection ---")
    try:
        evaluations_coll = db.client.get_collection("evaluations")
        evaluations = evaluations_coll.get(include=["metadatas"])
        print(f"Count: {len(evaluations.get('ids', []))}")
        for i, eval_id in enumerate(evaluations.get('ids', [])[:5]):
            meta = evaluations['metadatas'][i]
            decision = meta.get('decision', 'N/A')
            improvement = meta.get('improvement', 0)
            print(f"  {i+1}. {eval_id}: {meta.get('method_id', 'N/A')} - {decision} (Δ{improvement:+.2f})")
        if len(evaluations['ids']) > 5:
            print(f"  ... and {len(evaluations['ids']) - 5} more")
        eval_count = len(evaluations.get('ids', []))
    except Exception as e:
        print(f"  Collection error: {e}")
        eval_count = 0
    
    # Check metrics
    print("\n--- Metrics Collection ---")
    try:
        metrics_coll = db.client.get_collection("metrics")
        metrics = metrics_coll.get(include=["metadatas"])
        print(f"Count: {len(metrics.get('ids', []))}")
        for i, metric_id in enumerate(metrics.get('ids', [])):
            meta = metrics['metadatas'][i]
            value = meta.get('value', 0)
            metric_type = meta.get('type', 'N/A')
            if isinstance(value, float):
                print(f"  {i+1}. {metric_id}: {value:.3f} ({metric_type})")
            else:
                print(f"  {i+1}. {metric_id}: {value} ({metric_type})")
        metrics_count = len(metrics.get('ids', []))
    except Exception as e:
        print(f"  Collection error: {e}")
        metrics_count = 0
    
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  ✓ methods: {len(methods.get('ids', []))} entries")
    print(f"  ✓ runs: {len(runs.get('ids', []))} entries")
    print(f"  ✓ evaluations: {eval_count} entries")
    print(f"  ✓ metrics: {metrics_count} entries")
    print("=" * 60)


if __name__ == "__main__":
    main()
