#!/usr/bin/env python3
"""Verify skill constraints are properly stored in ChromaDB."""

import sys
import json
from pathlib import Path

workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB


def verify():
    """Verify all skill constraints."""
    
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
    
    print("="*70)
    print("FINAL VERIFICATION: SKILL CONSTRAINTS")
    print("="*70)
    
    # Get all skills
    all_skills = skills_coll.get()
    
    print(f"\n📊 Total skills in database: {len(all_skills['ids'])}")
    
    # Check constraint fields
    skills_with_level = 0
    skills_with_constraints = 0
    skills_by_level = {0: [], 1: [], 2: [], 3: [], 4: []}
    
    for meta in all_skills['metadatas']:
        skill_id = meta['skill_id']
        
        if 'constraint_level' in meta:
            skills_with_level += 1
            level = meta['constraint_level']
            skills_by_level[level].append(skill_id)
        
        if 'constraints_json' in meta:
            skills_with_constraints += 1
            # Try to parse constraints
            try:
                constraints = json.loads(meta['constraints_json'])
                if not isinstance(constraints, dict):
                    print(f"⚠️  {skill_id}: constraints_json is not a dict")
            except json.JSONDecodeError:
                print(f"⚠️  {skill_id}: constraints_json is not valid JSON")
    
    print(f"\n✅ Skills with constraint_level: {skills_with_level}/{len(all_skills['ids'])}")
    print(f"✅ Skills with constraints_json: {skills_with_constraints}/{len(all_skills['ids'])}")
    
    # Show distribution by level
    print("\n📊 Constraint Level Distribution:")
    level_names = [
        "READ ONLY",
        "SAFE STORE", 
        "CONTROLLED EXECUTION",
        "COMPLEX MUTATION",
        "GUARDIAN"
    ]
    
    total_expected = 0
    for level in range(5):
        count = len(skills_by_level[level])
        total_expected += count
        print(f"  Level {level} ({level_names[level]}): {count} skills")
        for skill_id in skills_by_level[level]:
            print(f"    ✓ {skill_id}")
    
    # Test query functionality
    print("\n🔍 Testing Queries:")
    
    # Query by constraint level
    for level in range(5):
        results = skills_coll.get(where={"constraint_level": level})
        print(f"  Query constraint_level={level}: {len(results['ids'])} results ✓")
    
    # Query read-only skills
    print("\n🔍 Read-only skills (Level 0):")
    results = skills_coll.get(where={"constraint_level": 0})
    for meta in results['metadatas']:
        print(f"  - {meta['skill_id']} ({meta['name']})")
    
    # Query guardian skills
    print("\n🔍 Guardian skills (Level 4):")
    results = skills_coll.get(where={"constraint_level": 4})
    for meta in results['metadatas']:
        print(f"  - {meta['skill_id']} ({meta['name']})")
    
    # Verify expected skills exist
    expected_skills = [
        "skill_chromadb_query",
        "skill_chromadb_store", 
        "skill_method_execution",
        "skill_embedding_mutation",
        "skill_validation_check"
    ]
    
    print("\n✅ Verifying key skills:")
    for skill_id in expected_skills:
        skill = skills_coll.get(ids=[skill_id])
        if skill['ids']:
            meta = skill['metadatas'][0]
            level = meta.get('constraint_level', 'N/A')
            print(f"  ✓ {skill_id}: Level {level}")
        else:
            print(f"  ✗ {skill_id}: NOT FOUND")
    
    # Final status
    all_ok = (skills_with_level == len(all_skills['ids']) and 
              skills_with_constraints == len(all_skills['ids']))
    
    print("\n" + "="*70)
    if all_ok:
        print("✅ ALL VERIFICATIONS PASSED")
    else:
        print("⚠️  SOME VERIFICATIONS FAILED")
    print("="*70)
    
    return all_ok


if __name__ == "__main__":
    sys.exit(0 if verify() else 1)
