#!/usr/bin/env python3
"""Assign constraint levels and constraints to skills in ChromaDB."""

import sys
import json
from datetime import datetime
from pathlib import Path

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB


# Skill Constraint Definitions
SKILL_CONSTRAINTS = {
    # Level 0: READ ONLY (keine Code-Änderungen)
    "skill_chromadb_query": {
        "constraint_level": 0,
        "constraints": {
            "code_changes": False,
            "read_only": True
        }
    },
    "skill_similarity_search": {
        "constraint_level": 0,
        "constraints": {
            "code_changes": False,
            "read_only": True
        }
    },
    "skill_success_analysis": {
        "constraint_level": 0,
        "constraints": {
            "code_changes": False,
            "read_only": True
        }
    },
    "skill_context_parsing": {
        "constraint_level": 0,
        "constraints": {
            "code_changes": False,
            "read_only": True
        }
    },
    "skill_pattern_recognition": {
        "constraint_level": 0,
        "constraints": {
            "code_changes": False,
            "read_only": True
        }
    },
    "skill_logging": {
        "constraint_level": 0,
        "constraints": {
            "code_changes": False,
            "read_only": True
        }
    },
    
    # Level 1: SAFE STORE (nur Daten, kein Code)
    "skill_chromadb_store": {
        "constraint_level": 1,
        "constraints": {
            "code_changes": False,
            "data_only": True
        }
    },
    "skill_embedding_encode": {
        "constraint_level": 1,
        "constraints": {
            "code_changes": False,
            "data_only": True
        }
    },
    "skill_result_aggregation": {
        "constraint_level": 1,
        "constraints": {
            "code_changes": False,
            "data_only": True
        }
    },
    "skill_http_bridge": {
        "constraint_level": 1,
        "constraints": {
            "code_changes": False,
            "data_only": True
        }
    },
    
    # Level 2: CONTROLLED EXECUTION (Code-Änderungen mit Limits)
    "skill_method_execution": {
        "constraint_level": 2,
        "constraints": {
            "code_changes": True,
            "max_files": 5,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json"],
            "required_tests": ["npm run check"],
            "must_pass": True
        }
    },
    "skill_method_variant": {
        "constraint_level": 2,
        "constraints": {
            "code_changes": True,
            "max_files": 5,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json"],
            "required_tests": ["npm run check"],
            "must_pass": True
        }
    },
    "skill_epsilon_greedy": {
        "constraint_level": 2,
        "constraints": {
            "code_changes": True,
            "max_files": 5,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json"],
            "required_tests": ["npm run check"],
            "must_pass": True
        }
    },
    "skill_context_matching": {
        "constraint_level": 2,
        "constraints": {
            "code_changes": True,
            "max_files": 5,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json"],
            "required_tests": ["npm run check"],
            "must_pass": True
        }
    },
    "skill_ranking": {
        "constraint_level": 2,
        "constraints": {
            "code_changes": True,
            "max_files": 5,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json"],
            "required_tests": ["npm run check"],
            "must_pass": True
        }
    },
    "skill_ab_testing": {
        "constraint_level": 2,
        "constraints": {
            "code_changes": True,
            "max_files": 5,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json"],
            "required_tests": ["npm run check"],
            "must_pass": True
        }
    },
    
    # Level 3: COMPLEX MUTATION (höheres Risiko)
    "skill_embedding_mutation": {
        "constraint_level": 3,
        "constraints": {
            "code_changes": True,
            "max_files": 10,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json", "golden/*"],
            "required_tests": ["npm run check", "pytest"],
            "must_pass": True,
            "human_review_required": True
        }
    },
    "skill_hypothesis_synthesis": {
        "constraint_level": 3,
        "constraints": {
            "code_changes": True,
            "max_files": 10,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json", "golden/*"],
            "required_tests": ["npm run check", "pytest"],
            "must_pass": True,
            "human_review_required": True
        }
    },
    "skill_hyperparameter_tuning": {
        "constraint_level": 3,
        "constraints": {
            "code_changes": True,
            "max_files": 10,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json", "golden/*"],
            "required_tests": ["npm run check", "pytest"],
            "must_pass": True,
            "human_review_required": True
        }
    },
    "skill_strategy_evaluation": {
        "constraint_level": 3,
        "constraints": {
            "code_changes": True,
            "max_files": 10,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "segments.json", "golden/*"],
            "required_tests": ["npm run check", "pytest"],
            "must_pass": True,
            "human_review_required": True
        }
    },
    
    # Level 4: GUARDIAN (Schutz & Rollback)
    "skill_validation_check": {
        "constraint_level": 4,
        "constraints": {
            "can_modify_any": False,
            "can_approve": True,
            "rollback_authority": True
        }
    },
    "skill_rollback": {
        "constraint_level": 4,
        "constraints": {
            "can_modify_any": False,
            "can_approve": True,
            "rollback_authority": True
        }
    },
    "skill_validation_checker": {
        "constraint_level": 4,
        "constraints": {
            "can_modify_any": False,
            "can_approve": True,
            "rollback_authority": True
        }
    }
}


def assign_constraints():
    """Assign constraint levels and constraints to skills."""
    
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
        print("Please run create_skills_collection.py first")
        return False
    
    print("="*70)
    print("ASSIGNING CONSTRAINTS TO SKILLS")
    print("="*70)
    
    updated_count = 0
    
    for skill_id, constraint_data in SKILL_CONSTRAINTS.items():
        try:
            # Get current skill
            skill = skills_coll.get(ids=[skill_id])
            
            if not skill['ids']:
                print(f"⚠️  Skill not found: {skill_id}")
                continue
            
            # Get existing metadata
            meta = skill['metadatas'][0]
            
            # Add constraint level and constraints
            meta['constraint_level'] = constraint_data['constraint_level']
            meta['constraints_json'] = json.dumps(constraint_data['constraints'])
            
            # Update skill
            skills_coll.update(
                ids=[skill_id],
                metadatas=[meta]
            )
            
            updated_count += 1
            
            # Show assignment
            level_name = [
                "READ ONLY",
                "SAFE STORE",
                "CONTROLLED EXECUTION",
                "COMPLEX MUTATION",
                "GUARDIAN"
            ][constraint_data['constraint_level']]
            
            print(f"  ✅ {skill_id}: Level {constraint_data['constraint_level']} ({level_name})")
            
        except Exception as e:
            print(f"  ❌ Error updating {skill_id}: {e}")
    
    print(f"\n📊 Updated {updated_count}/{len(SKILL_CONSTRAINTS)} skills")
    return True


def verify_constraints():
    """Verify that all skills have constraints assigned."""
    
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
    
    print("\n" + "="*70)
    print("VERIFICATION")
    print("="*70)
    
    # Get all skills
    all_skills = skills_coll.get()
    
    print(f"\n📊 Total skills: {len(all_skills['ids'])}")
    
    # Check each skill
    skills_with_constraints = 0
    skills_without_constraints = []
    
    for i, skill_id in enumerate(all_skills['ids']):
        meta = all_skills['metadatas'][i]
        
        if 'constraint_level' in meta and 'constraints_json' in meta:
            skills_with_constraints += 1
        else:
            skills_without_constraints.append(skill_id)
    
    print(f"✅ Skills with constraints: {skills_with_constraints}/{len(all_skills['ids'])}")
    
    if skills_without_constraints:
        print(f"⚠️  Skills without constraints: {len(skills_without_constraints)}")
        for sid in skills_without_constraints:
            print(f"    - {sid}")
    else:
        print("✅ All skills have constraints!")
    
    # Verify constraint level filtering works
    print("\n🔍 Testing constraint level queries:")
    
    for level in range(5):
        results = skills_coll.get(where={"constraint_level": level})
        count = len(results['ids'])
        level_name = [
            "READ ONLY",
            "SAFE STORE",
            "CONTROLLED EXECUTION",
            "COMPLEX MUTATION",
            "GUARDIAN"
        ][level]
        print(f"  Level {level} ({level_name}): {count} skills")
        
        # Show skills in this level
        for meta in results['metadatas']:
            print(f"    - {meta['skill_id']}")
    
    return len(skills_without_constraints) == 0


def show_constraint_summary():
    """Show summary of all constraints by level."""
    
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
    
    print("\n" + "="*70)
    print("CONSTRAINT SUMMARY")
    print("="*70)
    
    # Get all skills
    all_skills = skills_coll.get()
    
    # Group by level
    levels = {0: [], 1: [], 2: [], 3: [], 4: []}
    
    for meta in all_skills['metadatas']:
        if 'constraint_level' in meta:
            level = meta['constraint_level']
            levels[level].append({
                'id': meta['skill_id'],
                'name': meta['name'],
                'constraints': json.loads(meta.get('constraints_json', '{}'))
            })
    
    level_descriptions = {
        0: ("READ ONLY", "No code changes allowed"),
        1: ("SAFE STORE", "Data operations only, no code"),
        2: ("CONTROLLED EXECUTION", "Code changes with limits"),
        3: ("COMPLEX MUTATION", "Higher risk mutations"),
        4: ("GUARDIAN", "Protection & rollback authority")
    }
    
    for level in range(5):
        level_name, level_desc = level_descriptions[level]
        skills = levels[level]
        
        print(f"\n🔒 Level {level}: {level_name}")
        print(f"   {level_desc}")
        print(f"   Skills: {len(skills)}")
        
        for skill in skills:
            print(f"\n   📦 {skill['id']}")
            print(f"      Name: {skill['name']}")
            constraints = skill['constraints']
            for key, value in constraints.items():
                if isinstance(value, list):
                    print(f"      {key}: {value}")
                else:
                    print(f"      {key}: {value}")
    
    return True


def main():
    """Main entry point."""
    print("="*70)
    print("SKILL CONSTRAINT ASSIGNMENT")
    print("="*70)
    
    # Assign constraints
    if not assign_constraints():
        return 1
    
    # Verify constraints
    if not verify_constraints():
        return 1
    
    # Show summary
    if not show_constraint_summary():
        return 1
    
    print("\n" + "="*70)
    print("✅ SUCCESS")
    print("="*70)
    print("\nSummary:")
    print(f"  • {len(SKILL_CONSTRAINTS)} skills updated with constraints")
    print("  • Constraint levels: 0 (read-only) to 4 (guardian)")
    print("  • All skills can be filtered by constraint_level")
    print("  • Each skill has constraints dict with specific rules")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
