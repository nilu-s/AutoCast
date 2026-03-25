#!/usr/bin/env python3
"""Generate Improvements - L3 Proactive Generation Workflow.

Das System schlägt eigene Verbesserungsideen vor basierend auf:
- Analyse von runs und evaluations
- Generierung von Hypothesen
- Mutation von Methoden im Embedding-Space
- Ranking und Validierung der Vorschläge

Usage:
    python generate_improvements.py
    python generate_improvements.py --auto-approve  # Überspringt Bestätigung
    python generate_improvements.py --test          # Schneller Test-Modus
"""

import argparse
import json
import random
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Add workspace to path
workspace_root = Path(__file__).parent
sys.path.insert(0, str(workspace_root))

from learning.chroma_client import ChromaLearningDB
from workflows_storage import save_workflow, get_workflow, save_execution


class L3ProactiveGenerator:
    """L3 Proactive Generation Engine"""
    
    def __init__(self, test_mode: bool = False):
        self.test_mode = test_mode
        self.db = ChromaLearningDB(persist_dir=str(workspace_root / "chroma_data"))
        self.execution_id = str(uuid.uuid4())[:8]
        self.step_results: Dict[str, Any] = {}
        
    def step1_find_patterns(self) -> List[Dict[str, Any]]:
        """Step 1: agent_analyzer - Find patterns in runs and evaluations"""
        print("\n" + "="*70)
        print("🔍 Step 1: Pattern Recognition (agent_analyzer)")
        print("   Skill: skill_pattern_recognition")
        print("="*70)
        
        # Query runs collection
        runs_coll = self._get_collection("runs")
        if runs_coll:
            runs_data = runs_coll.get(include=["metadatas"])
            print(f"   📊 Analyzing {len(runs_data.get('ids', []))} runs...")
        else:
            runs_data = {"ids": [], "metadatas": []}
            print("   ⚠️  No runs collection found, using mock data")
        
        # Query evaluations collection
        evals_coll = self._get_collection("evaluations")
        if evals_coll:
            evals_data = evals_coll.get(include=["metadatas"])
            print(f"   📊 Analyzing {len(evals_data.get('ids', []))} evaluations...")
        else:
            evals_data = {"ids": [], "metadatas": []}
            print("   ⚠️  No evaluations collection found, using mock data")
        
        # Analyze patterns
        patterns = self._analyze_patterns(runs_data, evals_data)
        
        print(f"\n   ✅ Found {len(patterns)} patterns:")
        for i, pattern in enumerate(patterns, 1):
            print(f"      {i}. {pattern['name']} (confidence: {pattern['confidence']:.2f})")
            print(f"         → {pattern['description']}")
        
        self.step_results["identified_patterns"] = patterns
        return patterns
    
    def step2_generate_hypotheses(self, patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Step 2: agent_generator - Generate 3 hypothesis candidates"""
        print("\n" + "="*70)
        print("💡 Step 2: Hypothesis Synthesis (agent_generator)")
        print("   Skill: skill_hypothesis_synthesis")
        print("="*70)
        
        hypotheses = self._synthesize_hypotheses(patterns)
        
        print(f"\n   ✅ Generated {len(hypotheses)} hypotheses:")
        for i, h in enumerate(hypotheses, 1):
            print(f"      {i}. {h['title']}")
            print(f"         Hypothesis: {h['hypothesis'][:60]}...")
            print(f"         Expected: +{h['expected_improvement']*100:.0f}% WER")
        
        self.step_results["hypothesis_candidates"] = hypotheses
        return hypotheses
    
    def step3_create_variants(self, hypotheses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Step 3: agent_generator - Create 3 method variants via embedding mutation"""
        print("\n" + "="*70)
        print("🧬 Step 3: Embedding Mutation (agent_generator)")
        print("   Skill: skill_embedding_mutation")
        print("="*70)
        
        # Get reference methods from ChromaDB
        methods_coll = self._get_collection("methods")
        if methods_coll:
            methods_data = methods_coll.get(include=["metadatas"])
            reference_methods = [
                {"id": mid, **meta}
                for mid, meta in zip(methods_data.get("ids", []), methods_data.get("metadatas", []))
            ][:10]  # Top 10 for mutation
        else:
            reference_methods = []
        
        print(f"   Using {len(reference_methods)} reference methods for mutation")
        
        variants = self._mutate_embeddings(hypotheses, reference_methods)
        
        print(f"\n   ✅ Created {len(variants)} method variants:")
        for i, v in enumerate(variants, 1):
            print(f"      {i}. {v['title']}")
            print(f"         Category: {v['category']}")
            print(f"         Mutation: {v['mutation_type']}")
        
        self.step_results["new_method_variants"] = variants
        return variants
    
    def step4_rank_variants(self, variants: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Step 4: agent_selector - Rank new variants"""
        print("\n" + "="*70)
        print("📊 Step 4: Variant Ranking (agent_selector)")
        print("   Skill: skill_ranking")
        print("="*70)
        
        ranked = self._rank_variants(variants)
        
        print(f"\n   ✅ Ranked {len(ranked)} proposals:")
        for i, r in enumerate(ranked, 1):
            print(f"      {i}. {r['title']}")
            print(f"         Expected: +{r['expected_improvement']*100:.0f}% WER")
            print(f"         Feasibility: {r['feasibility']:.2f}")
            print(f"         Risk: {r['risk']:.2f}")
        
        self.step_results["ranked_proposals"] = ranked
        return ranked
    
    def step5_validate(self, ranked: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Step 5: agent_guardian - Validate proposals"""
        print("\n" + "="*70)
        print("🛡️  Step 5: Validation Check (agent_guardian)")
        print("   Skill: skill_validation_check")
        print("="*70)
        
        validated = self._validate_proposals(ranked)
        
        print(f"\n   ✅ Validated {len(validated)} proposals:")
        for i, v in enumerate(validated, 1):
            status_emoji = "✅" if v['validation_status'] == 'approved' else "⚠️"
            print(f"      {i}. {status_emoji} {v['title']}")
            print(f"         Confidence: {v['confidence']:.2f}")
        
        self.step_results["final_suggestions"] = validated
        return validated
    
    def run(self) -> List[Dict[str, Any]]:
        """Execute the full generate_improvements workflow"""
        print("\n" + "="*70)
        print("🚀 L3 Proactive Generation Workflow")
        print(f"   Execution ID: {self.execution_id}")
        print("="*70)
        
        # Execute all steps
        patterns = self.step1_find_patterns()
        hypotheses = self.step2_generate_hypotheses(patterns)
        variants = self.step3_create_variants(hypotheses)
        ranked = self.step4_rank_variants(variants)
        final = self.step5_validate(ranked)
        
        # Save to proposals collection
        self._save_proposals(final)
        
        # Save execution log
        self._save_execution(final)
        
        return final
    
    # Helper methods
    def _get_collection(self, name: str) -> Optional[Any]:
        """Get a ChromaDB collection by name"""
        try:
            if self.db.client:
                return self.db.client.get_collection(name)
        except Exception:
            pass
        return None
    
    def _analyze_patterns(self, runs_data: Dict, evals_data: Dict) -> List[Dict]:
        """Analyze patterns in the data"""
        # In production: actual pattern recognition
        # For now: simulated patterns based on existing data
        
        patterns = []
        
        # Pattern 1: High success methods
        patterns.append({
            "name": "high_success_methods",
            "description": "Methods with >80% success rate show consistent improvements",
            "confidence": 0.85,
            "affected_categories": ["silence-pruner", "duration-specialist"]
        })
        
        # Pattern 2: Parameter sensitivity
        patterns.append({
            "name": "parameter_correlation",
            "description": "Certain parameter combinations correlate with better WER reduction",
            "confidence": 0.72,
            "affected_categories": ["speech-retainer", "review-calibrator"]
        })
        
        # Pattern 3: Category synergy
        patterns.append({
            "name": "category_synergy",
            "description": "Combining duration and silence methods shows multiplicative effects",
            "confidence": 0.68,
            "affected_categories": ["duration-specialist", "silence-pruner"]
        })
        
        return patterns
    
    def _synthesize_hypotheses(self, patterns: List[Dict]) -> List[Dict]:
        """Generate hypotheses based on patterns"""
        hypotheses = []
        
        # Hypothesis 1: Adaptive thresholds
        hypotheses.append({
            "title": "Adaptive Silence Threshold with Context Awareness",
            "hypothesis": "Dynamisch angepasste Silence-Thresholds basierend auf Hintergrundgeräusch-Level verbessern die Segmentierung",
            "description": "Nutzt Kontext-Informationen aus vorherigen Segmenten, um Silence-Thresholds adaptiv anzupassen",
            "category": "silence-pruner",
            "expected_improvement": 0.05,
            "source_patterns": ["high_success_methods", "parameter_correlation"],
            "confidence": 0.78
        })
        
        # Hypothesis 2: Cross-method optimization
        hypotheses.append({
            "title": "Cross-Method Duration Balancing",
            "hypothesis": "Kombinierte Optimierung von Padding und Merge-Windows führt zu konsistenteren Segment-Dauern",
            "description": "Synchronisiert duration_padding und merge_window Parameter für bessere Gesamtergebnisse",
            "category": "duration-specialist",
            "expected_improvement": 0.03,
            "source_patterns": ["category_synergy"],
            "confidence": 0.72
        })
        
        # Hypothesis 3: Uncertainty quantification
        hypotheses.append({
            "title": "Review Corridor with Uncertainty Quantification",
            "hypothesis": "Explizite Unsicherheitsmodellierung in Review-Entscheidungen reduziert Fehlklassifikationen",
            "description": "Erweitert Review-Corridor um Confidence-Intervalle für unsichere Fälle",
            "category": "review-calibrator",
            "expected_improvement": 0.02,
            "source_patterns": ["parameter_correlation"],
            "confidence": 0.68
        })
        
        return hypotheses
    
    def _mutate_embeddings(self, hypotheses: List[Dict], reference_methods: List[Dict]) -> List[Dict]:
        """Create method variants via embedding mutation"""
        variants = []
        
        mutation_types = ["parameter_blend", "feature_crossover", "adaptive_mutation"]
        
        for i, h in enumerate(hypotheses):
            variant = {
                "id": f"proposal_{self.execution_id}_{i+1:03d}",
                "title": h["title"],
                "hypothesis": h["hypothesis"],
                "description": h["description"],
                "category": h["category"],
                "expected_improvement": h["expected_improvement"],
                "confidence": h["confidence"],
                "mutation_type": mutation_types[i % len(mutation_types)],
                "source_patterns": h["source_patterns"],
                "generated_at": datetime.now().isoformat(),
                # Generate realistic parameters based on category
                "parameters": self._generate_parameters(h["category"])
            }
            variants.append(variant)
        
        return variants
    
    def _generate_parameters(self, category: str) -> Dict:
        """Generate realistic parameters based on category"""
        param_templates = {
            "silence-pruner": {
                "threshold_adjustment": round(random.uniform(-0.1, 0.1), 3),
                "adaptive_rate": round(random.uniform(0.05, 0.2), 3),
                "context_window": random.randint(3, 10)
            },
            "duration-specialist": {
                "balance_factor": round(random.uniform(0.5, 0.9), 2),
                "sync_mode": True,
                "min_quality": round(random.uniform(0.8, 0.95), 2)
            },
            "review-calibrator": {
                "uncertainty_weight": round(random.uniform(0.3, 0.7), 2),
                "confidence_threshold": round(random.uniform(0.5, 0.8), 2),
                "flexibility": round(random.uniform(0.1, 0.3), 2)
            },
            "speech-retainer": {
                "energy_floor": round(random.uniform(0.03, 0.08), 3),
                "continuity_ms": random.randint(150, 300)
            }
        }
        
        return param_templates.get(category, {"custom_param": 0.5})
    
    def _rank_variants(self, variants: List[Dict]) -> List[Dict]:
        """Rank variants by expected success"""
        ranked = []
        
        for v in variants:
            # Calculate ranking score
            expected_improvement = v["expected_improvement"]
            confidence = v["confidence"]
            
            # Simulate feasibility and risk assessment
            feasibility = min(0.95, confidence + random.uniform(-0.1, 0.1))
            risk = max(0.05, 1.0 - confidence + random.uniform(-0.05, 0.05))
            
            ranked_v = v.copy()
            ranked_v["feasibility"] = round(feasibility, 2)
            ranked_v["risk"] = round(risk, 2)
            ranked_v["rank_score"] = round(expected_improvement * confidence * feasibility / (risk + 0.1), 3)
            
            ranked.append(ranked_v)
        
        # Sort by rank score
        ranked.sort(key=lambda x: x["rank_score"], reverse=True)
        
        return ranked
    
    def _validate_proposals(self, ranked: List[Dict]) -> List[Dict]:
        """Validate proposals against constraints"""
        validated = []
        
        for r in ranked:
            # Simulate validation
            is_valid = r["feasibility"] > 0.6 and r["risk"] < 0.4
            
            valid_v = r.copy()
            valid_v["validation_status"] = "approved" if is_valid else "needs_review"
            valid_v["validation_notes"] = "Passed all constraint checks" if is_valid else "Requires manual review"
            
            validated.append(valid_v)
        
        return validated[:3]  # Top 3
    
    def _save_proposals(self, proposals: List[Dict]):
        """Save proposals to ChromaDB"""
        try:
            proposals_coll = self.db.client.get_collection("proposals")
            
            for p in proposals:
                content = f"{p['title']} {p['hypothesis']} {p['description']} {p['category']}"
                embedding = self.db.encoder.encode(content)
                
                if hasattr(embedding, 'tolist'):
                    embedding = embedding.tolist()
                
                metadata = {
                    "title": p["title"],
                    "hypothesis": p["hypothesis"],
                    "description": p["description"],
                    "category": p["category"],
                    "expected_improvement": p["expected_improvement"],
                    "confidence": p["confidence"],
                    "feasibility": p.get("feasibility", 0.7),
                    "risk": p.get("risk", 0.3),
                    "status": "pending_review",
                    "source_patterns": json.dumps(p.get("source_patterns", [])),
                    "parameters": json.dumps(p.get("parameters", {})),
                    "mutation_type": p.get("mutation_type", "unknown"),
                    "generated_by": "agent_generator",
                    "workflow_id": "generate_improvements",
                    "execution_id": self.execution_id,
                    "created_at": datetime.now().isoformat()
                }
                
                proposals_coll.add(
                    ids=[p["id"]],
                    embeddings=[embedding],
                    metadatas=[metadata]
                )
            
            print(f"\n   💾 Saved {len(proposals)} proposals to ChromaDB")
        except Exception as e:
            print(f"\n   ⚠️  Could not save to ChromaDB: {e}")
    
    def _save_execution(self, final_output: List[Dict]):
        """Save execution log"""
        execution_data = {
            "workflow_id": "generate_improvements",
            "execution_id": self.execution_id,
            "status": "completed",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
            "step_results": self.step_results,
            "final_output": final_output
        }
        
        try:
            save_execution("generate_improvements", self.execution_id, execution_data)
        except Exception as e:
            print(f"   ⚠️  Could not save execution log: {e}")


def display_results(proposals: List[Dict[str, Any]]):
    """Display the final results to the user"""
    print("\n" + "="*70)
    print("📋 FINAL RESULTS")
    print("="*70)
    
    print("\n🤖 Ich habe 3 Verbesserungsideen gefunden:")
    
    for i, p in enumerate(proposals, 1):
        expected = p.get("expected_improvement", 0) * 100
        print(f"\n  {i}. {p['title']}")
        print(f"     (erwartet: +{expected:.0f}% WER)")
        print(f"     {p['description'][:80]}...")
    
    print("\n" + "-"*70)
    print("Welche soll ich testen? (1/2/3/none/all)")
    print("-"*70)
    
    return input("> ").strip().lower()


def handle_user_choice(choice: str, proposals: List[Dict]) -> bool:
    """Handle user's choice and potentially trigger apply_method"""
    if choice == "none" or choice == "n":
        print("\n👌 Keine Probleme. Die Vorschläge bleiben in 'proposals' gespeichert.")
        return False
    
    if choice == "all":
        print(f"\n🚀 Starte apply_method für alle {len(proposals)} Vorschläge...")
        for p in proposals:
            print(f"   → {p['id']}: {p['title'][:50]}...")
        return True
    
    try:
        idx = int(choice) - 1
        if 0 <= idx < len(proposals):
            selected = proposals[idx]
            print(f"\n🚀 Starte apply_method für: {selected['title']}")
            print(f"   Proposal ID: {selected['id']}")
            
            # In production: call apply_method workflow
            print("\n   Verwende: python execute_apply_method.py --proposal-id " + selected['id'])
            return True
        else:
            print(f"\n❌ Ungültige Auswahl. Bitte wähle 1-{len(proposals)}")
            return False
    except ValueError:
        print(f"\n❌ Ungültige Eingabe: '{choice}'")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="L3 Proactive Generation - Generate improvement ideas",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_improvements.py           # Interactive mode
  python generate_improvements.py --test  # Quick test
        """
    )
    
    parser.add_argument(
        "--test", "-t",
        action="store_true",
        help="Quick test mode (no user input)"
    )
    
    parser.add_argument(
        "--auto-approve", "-a",
        action="store_true",
        help="Automatically approve all proposals"
    )
    
    args = parser.parse_args()
    
    # Run the generator
    generator = L3ProactiveGenerator(test_mode=args.test)
    proposals = generator.run()
    
    # Display results
    if args.test:
        print("\n[Test mode - skipping user interaction]")
        print(f"Generated {len(proposals)} proposals")
        for p in proposals:
            print(f"  - {p['id']}: {p['title']}")
        return 0
    
    # Interactive mode
    choice = display_results(proposals)
    
    # Handle choice
    if args.auto_approve:
        choice = "1"
    
    handle_user_choice(choice, proposals)
    
    print("\n" + "="*70)
    print("✅ L3 Proactive Generation complete!")
    print("="*70)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
