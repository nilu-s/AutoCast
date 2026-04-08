#!/usr/bin/env python3
"""Test queries for AutoResearch Collections.

Usage:
    python test_autoresearch_queries.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from learning.chroma_client import ChromaLearningDB


def main():
    print("=" * 70)
    print("AutoResearch Collections - Query Tests")
    print("=" * 70)
    
    db = ChromaLearningDB()
    
    # Test 1: Finde beste Methode (höchste success_rate)
    print("\n1️⃣  QUERY: 'Finde beste Methode' (highest success_rate)")
    print("-" * 70)
    
    methods = db.methods.get(include=["metadatas"])
    sorted_methods = sorted(
        zip(methods['ids'], methods['metadatas']),
        key=lambda x: x[1].get('success_rate', 0),
        reverse=True
    )
    print(f"   Top 5 Methoden nach Erfolgsrate:")
    for i, (method_id, meta) in enumerate(sorted_methods[:5], 1):
        print(f"   {i}. {method_id}")
        print(f"      Titel: {meta.get('title', 'N/A')}")
        print(f"      Kategorie: {meta.get('category', 'N/A')}")
        print(f"      Erfolgsrate: {meta.get('success_rate', 0):.2%}")
        print(f"      Versuche: {meta.get('attempts', 0)}")
        print()
    
    # Test 2: Vergleiche Runs
    print("2️⃣  QUERY: 'Vergleiche Runs' (compare all runs)")
    print("-" * 70)
    
    runs = db.runs.get(include=["metadatas"])
    print(f"   {'Run ID':<20} {'Baseline':<10} {'Final':<10} {'Δ':<10} {'Status':<12} {'Methoden'}")
    print(f"   {'-'*70}")
    
    for run_id, meta in zip(runs['ids'], runs['metadatas']):
        baseline = meta.get('baseline_score', 0)
        final = meta.get('final_score', 0)
        improvement = final - baseline
        status = meta.get('status', 'N/A')
        methods_applied = json.loads(meta.get('methods_applied', '[]'))
        sign = "+" if improvement >= 0 else ""
        
        print(f"   {run_id:<20} {baseline:<10.2f} {final:<10.2f} {sign}{improvement:<9.2f} {status:<12} {len(methods_applied)} methods")
    
    print()
    
    # Test 3: Methoden nach Kategorie filtern
    print("3️⃣  QUERY: 'Methoden nach Kategorie'")
    print("-" * 70)
    
    categories = ["silence-pruner", "duration-specialist", "review-calibrator", 
                  "speech-retainer", "validator"]
    
    for category in categories:
        results = db.query_by_metadata(category=category)
        print(f"   📁 {category}: {len(results)} Methoden")
        for method in results:
            print(f"      • {method['method_id']}: {method.get('title', 'N/A')}")
    
    print()
    
    # Test 4: Ähnliche Methoden finden
    print("4️⃣  QUERY: 'Finde ähnliche Methoden zu speech_low_energy_hold'")
    print("-" * 70)
    
    similar = db.find_similar_methods("speech_low_energy_hold", n_results=4)
    print(f"   Ähnliche Methoden zu 'speech_low_energy_hold':")
    for method in similar:
        print(f"   • {method['method_id']} ({method.get('category', 'N/A')})")
        print(f"     Ähnlichkeit: {method.get('similarity', 0):.3f}")
    
    print()
    
    # Test 5: Evaluation Summary
    print("5️⃣  QUERY: 'Evaluation Summary (WER Improvements)'")
    print("-" * 70)
    
    try:
        eval_coll = db.client.get_collection("evaluations")
        evaluations = eval_coll.get(include=["metadatas"])
        
        print(f"   {'Eval ID':<15} {'Method':<35} {'Decision':<10} {'WER Δ':<10}")
        print(f"   {'-'*70}")
        
        # Calculate summary stats
        keep_count = sum(1 for m in evaluations['metadatas'] if m.get('decision') == 'KEEP')
        reject_count = sum(1 for m in evaluations['metadatas'] if m.get('decision') == 'REJECT')
        pending_count = sum(1 for m in evaluations['metadatas'] if m.get('decision') == 'PENDING')
        
        for eval_id, meta in zip(evaluations['ids'], evaluations['metadatas']):
            method_id = meta.get('method_id', 'N/A')[:32]
            decision = meta.get('decision', 'N/A')
            improvement = meta.get('improvement', 0)
            sign = "+" if improvement >= 0 else ""
            
            print(f"   {eval_id:<15} {method_id:<35} {decision:<10} {sign}{improvement:<9.2f}")
        
        print()
        print(f"   Summary: {keep_count} KEEP, {reject_count} REJECT, {pending_count} PENDING")
    except Exception as e:
        print(f"   Error: {e}")
    
    print()
    
    # Test 6: Metrics Overview
    print("6️⃣  QUERY: 'Metrics Overview'")
    print("-" * 70)
    
    try:
        metrics_coll = db.client.get_collection("metrics")
        metrics = metrics_coll.get(include=["metadatas"])
        
        targets = [m for m in zip(metrics['ids'], metrics['metadatas']) if m[1].get('type') == 'target']
        current = [m for m in zip(metrics['ids'], metrics['metadatas']) if m[1].get('type') == 'current_best']
        thresholds = [m for m in zip(metrics['ids'], metrics['metadatas']) if m[1].get('type') == 'threshold']
        
        print("   🎯 Targets:")
        for metric_id, meta in targets:
            value = meta.get('value', 0)
            print(f"      • {meta.get('name', metric_id)}: {value:.3f}")
        
        print("\n   📊 Current Best:")
        for metric_id, meta in current:
            value = meta.get('value', 0)
            print(f"      • {meta.get('name', metric_id)}: {value:.3f}")
        
        print("\n   ⚠️  Thresholds:")
        for metric_id, meta in thresholds:
            value = meta.get('value', 0)
            print(f"      • {meta.get('name', metric_id)}: {value:.3f}")
    except Exception as e:
        print(f"   Error: {e}")
    
    print()
    print("=" * 70)
    print("✅ All queries executed successfully!")
    print("=" * 70)


if __name__ == "__main__":
    main()
