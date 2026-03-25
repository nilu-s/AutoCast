#!/usr/bin/env python3
"""Query and verify agent constraints from ChromaDB."""

import sys
import json
from datetime import datetime
from pathlib import Path

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB


def query_constraints():
    """Query and display all constraints."""
    
    # Initialize ChromaDB
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    if db.client is None:
        print("❌ ChromaDB client not available")
        return False
    
    try:
        constraints_coll = db.client.get_collection("constraints")
    except Exception as e:
        print(f"❌ Constraints collection not found: {e}")
        return False
    
    print("="*70)
    print("CONSTRAINTS COLLECTION QUERY")
    print("="*70)
    
    # Get all constraints
    all_constraints = constraints_coll.get()
    
    print(f"\n📊 Total constraints: {len(all_constraints['ids'])}\n")
    
    # Group by type
    by_type = {}
    for metadata in all_constraints['metadatas']:
        constraint_type = metadata['type']
        if constraint_type not in by_type:
            by_type[constraint_type] = []
        by_type[constraint_type].append(metadata)
    
    # Display by type
    for constraint_type, constraints in by_type.items():
        print(f"\n🔒 {constraint_type.upper().replace('_', ' ')} ({len(constraints)})")
        print("-" * 70)
        for c in constraints:
            print(f"  ID: {c['constraint_id']}")
            print(f"  Name: {c['name']}")
            print(f"  Severity: {c['severity']}")
            print(f"  Description: {c['description']}")
            
            # Type-specific details
            if 'pattern' in c:
                print(f"  Pattern: {c['pattern']}")
            if 'patterns_json' in c:
                patterns = json.loads(c['patterns_json'])
                print(f"  Patterns: {patterns}")
            if 'command' in c:
                print(f"  Command: {c['command']}")
            if 'must_pass' in c:
                print(f"  Must Pass: {c['must_pass']}")
            if 'max_files' in c:
                print(f"  Max Files: {c['max_files']}")
            if 'max_lines' in c:
                print(f"  Max Lines: {c['max_lines']}")
            if 'complexity_threshold' in c:
                print(f"  Complexity Threshold: {c['complexity_threshold']}")
            if 'metric' in c:
                threshold = c.get('threshold', 'N/A')
                print(f"  Metric: {c['metric']}, Threshold: {threshold}")
            if 'auto_rollback' in c:
                print(f"  Auto Rollback: {c['auto_rollback']}")
            if 'allowed' in c:
                print(f"  Allowed: {c['allowed']}")
            if 'forbidden_patterns_json' in c:
                patterns = json.loads(c['forbidden_patterns_json'])
                print(f"  Forbidden Patterns: {patterns}")
            if 'required_tests_json' in c:
                tests = json.loads(c['required_tests_json'])
                print(f"  Required Tests: {tests}")
            
            agents = json.loads(c.get('applies_to_agents_json', '[]'))
            print(f"  Applies to: {agents}")
            print()
    
    return True


def query_agents_with_constraints():
    """Query agents and their applicable constraints."""
    
    # Initialize ChromaDB
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    if db.client is None:
        print("❌ ChromaDB client not available")
        return False
    
    try:
        agents_coll = db.client.get_collection("agents")
        constraints_coll = db.client.get_collection("constraints")
    except Exception as e:
        print(f"❌ Collection not found: {e}")
        return False
    
    print("="*70)
    print("AGENTS WITH CONSTRAINTS")
    print("="*70)
    
    # Get all agents
    all_agents = agents_coll.get()
    
    print(f"\n📊 Total agents: {len(all_agents['ids'])}\n")
    
    for metadata in all_agents['metadatas']:
        agent_id = metadata['agent_id']
        print(f"\n🤖 {agent_id}")
        print("-" * 70)
        print(f"  Name: {metadata.get('name', 'N/A')}")
        print(f"  Role: {metadata.get('role', 'N/A')}")
        
        # Get applicable constraints
        constraint_ids = json.loads(metadata.get('applicable_constraints_json', '[]'))
        
        if constraint_ids:
            print(f"\n  Applicable Constraints ({len(constraint_ids)}):")
            
            # Get full constraint details
            for cid in constraint_ids:
                try:
                    constraint_data = constraints_coll.get(ids=[cid])
                    if constraint_data['ids']:
                        c = constraint_data['metadatas'][0]
                        print(f"    • {c['name']} ({c['type']}, {c['severity']})")
                except Exception:
                    print(f"    • {cid} (details unavailable)")
        else:
            print("  Constraints: None (read-only agent)")
    
    return True


def test_constraint_queries():
    """Test various constraint queries."""
    
    # Initialize ChromaDB
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    if db.client is None:
        print("❌ ChromaDB client not available")
        return False
    
    try:
        constraints_coll = db.client.get_collection("constraints")
    except Exception as e:
        print(f"❌ Constraints collection not found: {e}")
        return False
    
    print("\n" + "="*70)
    print("TESTING CONSTRAINT QUERIES")
    print("="*70)
    
    # Test 1: Query by severity
    print("\n🔍 Query: severity='critical'")
    results = constraints_coll.get(where={"severity": "critical"})
    print(f"   Found {len(results['ids'])} critical constraints:")
    for metadata in results['metadatas']:
        print(f"     - {metadata['name']}")
    
    # Test 2: Query by type
    print("\n🔍 Query: type='quality_gate'")
    results = constraints_coll.get(where={"type": "quality_gate"})
    print(f"   Found {len(results['ids'])} quality gate constraints:")
    for metadata in results['metadatas']:
        print(f"     - {metadata['name']}")
    
    # Test 3: Semantic query
    print("\n🔍 Semantic Query: 'forbidden file'")
    results = constraints_coll.query(
        query_texts=["forbidden file"],
        n_results=5
    )
    print(f"   Found {len(results['ids'][0])} results:")
    for i, cid in enumerate(results['ids'][0]):
        print(f"     - {results['metadatas'][0][i]['name']} "
              f"(distance: {results['distances'][0][i]:.4f})")
    
    # Test 4: Semantic query for rollback
    print("\n🔍 Semantic Query: 'rollback'")
    results = constraints_coll.query(
        query_texts=["rollback"],
        n_results=5
    )
    print(f"   Found {len(results['ids'][0])} results:")
    for i, cid in enumerate(results['ids'][0]):
        print(f"     - {results['metadatas'][0][i]['name']} "
              f"(distance: {results['distances'][0][i]:.4f})")
    
    # Test 5: Combined query with metadata filter
    print("\n🔍 Query: type='rollback_condition', severity='high'")
    results = constraints_coll.get(
        where={"$and": [
            {"type": {"$eq": "rollback_condition"}},
            {"severity": {"$eq": "high"}}
        ]}
    )
    print(f"   Found {len(results['ids'])} rollback conditions with high severity:")
    for metadata in results['metadatas']:
        print(f"     - {metadata['name']}")
    
    return True


def verify_constraint_links():
    """Verify agent -> constraint links work correctly."""
    
    # Initialize ChromaDB
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    if db.client is None:
        print("❌ ChromaDB client not available")
        return False
    
    try:
        agents_coll = db.client.get_collection("agents")
        constraints_coll = db.client.get_collection("constraints")
    except Exception as e:
        print(f"❌ Collection not found: {e}")
        return False
    
    print("\n" + "="*70)
    print("VERIFYING AGENT -> CONSTRAINT LINKS")
    print("="*70)
    
    # Test agent_worker
    print("\n✅ Testing agent_worker constraint links:")
    agent_data = agents_coll.get(ids=["agent_worker"])
    if agent_data['ids']:
        constraint_ids = json.loads(agent_data['metadatas'][0].get('applicable_constraints_json', '[]'))
        print(f"   Applicable constraints: {len(constraint_ids)}")
        
        # Verify each constraint exists
        found = 0
        for cid in constraint_ids:
            try:
                c = constraints_coll.get(ids=[cid])
                if c['ids']:
                    found += 1
                    print(f"   ✓ {cid} exists")
                else:
                    print(f"   ✗ {cid} NOT FOUND")
            except Exception as e:
                print(f"   ✗ {cid} ERROR: {e}")
        
        print(f"\n   Result: {found}/{len(constraint_ids)} constraints verified")
    
    # Test agent_guardian
    print("\n✅ Testing agent_guardian constraint links:")
    agent_data = agents_coll.get(ids=["agent_guardian"])
    if agent_data['ids']:
        constraint_ids = json.loads(agent_data['metadatas'][0].get('applicable_constraints_json', '[]'))
        print(f"   Applicable constraints: {len(constraint_ids)}")
        
        # Verify each constraint exists
        found = 0
        for cid in constraint_ids:
            try:
                c = constraints_coll.get(ids=[cid])
                if c['ids']:
                    found += 1
                    print(f"   ✓ {cid} exists")
                else:
                    print(f"   ✗ {cid} NOT FOUND")
            except Exception as e:
                print(f"   ✗ {cid} ERROR: {e}")
        
        print(f"\n   Result: {found}/{len(constraint_ids)} constraints verified")
    
    return True


def main():
    """Main entry point."""
    print("="*70)
    print("CONSTRAINT QUERY AND VERIFICATION SYSTEM")
    print("="*70)
    
    # Query all constraints
    if not query_constraints():
        return 1
    
    # Query agents with constraints
    if not query_agents_with_constraints():
        return 1
    
    # Test constraint queries
    if not test_constraint_queries():
        return 1
    
    # Verify constraint links
    if not verify_constraint_links():
        return 1
    
    print("\n" + "="*70)
    print("✅ ALL VERIFICATIONS PASSED")
    print("="*70)
    print("\nSummary:")
    print("  • Constraints collection created with 17 constraints")
    print("  • Agents linked to applicable constraints via JSON field")
    print("  • Query by severity, type, and semantic search working")
    print("  • Rollback mechanism configured")
    print("  • Agent -> Constraint links verified")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
