#!/usr/bin/env python3
"""Add L3 Proactive Generation skills to ChromaDB.

Aktiviert agent_generator mit generativen Fähigkeiten:
- skill_hypothesis_generator
- skill_embedding_mutation

Usage:
    python add_l3_skills.py
"""

import sys
import json
from datetime import datetime
from pathlib import Path

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB


def add_l3_skills():
    """Add L3 generative skills to the skills collection."""
    
    # Initialize ChromaDB
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    if db.client is None:
        print("❌ ChromaDB client not available")
        return False
    
    try:
        skills_coll = db.client.get_collection("skills")
    except Exception as e:
        print(f"❌ Skills collection not found: {e}")
        return False
    
    timestamp = datetime.utcnow().isoformat()
    
    # New L3 skills for proactive generation
    l3_skills = [
        {
            "skill_id": "skill_hypothesis_synthesis",
            "name": "Hypothesis Synthesis",
            "category": "Generation",
            "description": "Generiert neue Hypothesen basierend auf identifizierten Mustern in Runs und Evaluations. Erstellt 3 kreative Verbesserungsvorschläge mit erwartetem Impact.",
            "inputs": [
                {"name": "identified_patterns", "type": "list", "required": True},
                {"name": "context", "type": "dict", "required": False}
            ],
            "outputs": [
                {"name": "hypothesis_candidates", "type": "list", "description": "3 hypothesis candidates with expected_impact"},
                {"name": "synthesis_confidence", "type": "float"}
            ],
            "complexity": "high",
            "cost": "high",
            "agents_allowed": ["agent_generator"],
            "config": {
                "default_params": {
                    "num_candidates": 3,
                    "min_confidence": 0.6
                }
            },
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_embedding_mutation",
            "name": "Embedding Mutation",
            "category": "Generation",
            "description": "Erzeugt neue Methoden-Varianten durch Mutation bestehender erfolgreicher Methoden im Embedding-Space. Kombiniert Features verschiedener Methoden.",
            "inputs": [
                {"name": "hypothesis_candidates", "type": "list", "required": True},
                {"name": "reference_methods", "type": "list", "required": False}
            ],
            "outputs": [
                {"name": "new_method_variants", "type": "list", "description": "3 new method variants with parameters"},
                {"name": "mutation_diversity", "type": "float"}
            ],
            "complexity": "high",
            "cost": "high",
            "agents_allowed": ["agent_generator"],
            "config": {
                "default_params": {
                    "num_variants": 3,
                    "mutation_rate": 0.3,
                    "crossover_rate": 0.5
                }
            },
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_pattern_recognition",
            "name": "Pattern Recognition",
            "category": "Analysis",
            "description": "Analysiert runs und evaluations Collections, um Muster zu erkennen: Welche Methoden funktionieren gut? Wo gibt es Verbesserungspotenzial?",
            "inputs": [
                {"name": "runs_collection", "type": "list", "required": True},
                {"name": "evaluations_collection", "type": "list", "required": True}
            ],
            "outputs": [
                {"name": "identified_patterns", "type": "list", "description": "List of patterns with confidence scores"},
                {"name": "improvement_areas", "type": "list"}
            ],
            "complexity": "high",
            "cost": "high",
            "agents_allowed": ["agent_analyzer"],
            "config": {
                "default_params": {
                    "min_confidence": 0.7,
                    "max_patterns": 5
                }
            },
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_ranking",
            "name": "Variant Ranking",
            "category": "Selection",
            "description": "Bewertet und rankt neue Methoden-Varianten nach Erfolgswahrscheinlichkeit und erwartetem Impact. Nutzt historische Daten für Prognosen.",
            "inputs": [
                {"name": "new_method_variants", "type": "list", "required": True}
            ],
            "outputs": [
                {"name": "ranked_proposals", "type": "list", "description": "Variants ranked by expected_success"},
                {"name": "ranking_scores", "type": "list"}
            ],
            "complexity": "medium",
            "cost": "medium",
            "agents_allowed": ["agent_selector"],
            "config": {
                "default_params": {
                    "ranking_criteria": ["expected_improvement", "feasibility", "risk"]
                }
            },
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_validation_check",
            "name": "Validation Check",
            "category": "Execution",
            "description": "Validiert neue Methoden-Vorschläge auf technische Machbarkeit und Constraint-Einhaltung. Prüft ob Vorschläge mit bestehenden Constraints kompatibel sind.",
            "inputs": [
                {"name": "ranked_proposals", "type": "list", "required": True}
            ],
            "outputs": [
                {"name": "final_suggestions", "type": "list", "description": "Top 3 valid suggestions"},
                {"name": "validation_results", "type": "list"}
            ],
            "complexity": "medium",
            "cost": "low",
            "agents_allowed": ["agent_guardian"],
            "config": {
                "default_params": {
                    "check_constraints": True,
                    "max_output": 3
                }
            },
            "status": "active",
            "created_at": timestamp
        }
    ]
    
    added_count = 0
    skipped_count = 0
    
    for skill in l3_skills:
        skill_id = skill["skill_id"]
        
        # Check if skill already exists
        try:
            existing = skills_coll.get(ids=[skill_id], include=["metadatas"])
            if existing and existing.get("ids") and len(existing["ids"]) > 0:
                print(f"  ⏭️  Skill '{skill_id}' already exists, skipping")
                skipped_count += 1
                continue
        except Exception:
            pass  # Will create new
        
        # Create embedding from skill content
        content = f"{skill['name']} {skill['category']} {skill['description']}"
        
        try:
            embedding = db.encoder.encode(content)
            
            # Convert inputs/outputs/config to JSON strings
            metadata = skill.copy()
            metadata["inputs"] = json.dumps(metadata["inputs"])
            metadata["outputs"] = json.dumps(metadata["outputs"])
            metadata["agents_allowed"] = json.dumps(metadata["agents_allowed"])
            metadata["config"] = json.dumps(metadata["config"])
            
            skills_coll.add(
                ids=[skill_id],
                embeddings=[embedding.tolist()],
                metadatas=[metadata]
            )
            
            print(f"  ✅ Added skill: {skill_id} ({skill['name']})")
            added_count += 1
            
        except Exception as e:
            print(f"  ❌ Failed to add {skill_id}: {e}")
    
    print(f"\n{'='*60}")
    print(f"L3 Skills added: {added_count}")
    print(f"Skills skipped (already exist): {skipped_count}")
    print(f"{'='*60}")
    
    return added_count > 0


if __name__ == "__main__":
    success = add_l3_skills()
    sys.exit(0 if success else 1)
