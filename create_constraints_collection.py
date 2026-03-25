#!/usr/bin/env python3
"""Create constraints collection in ChromaDB with defined agent constraints for code changes."""

import sys
import json
from datetime import datetime
from pathlib import Path

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB


def create_constraints_collection():
    """Create constraints collection with defined agent constraints."""
    
    # Initialize ChromaDB
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    # Create or get constraints collection
    if db.client is None:
        print("❌ ChromaDB client not available")
        return False
    
    # Try to delete existing collection if it exists
    try:
        db.client.delete_collection("constraints")
        print("🗑️  Deleted existing 'constraints' collection")
    except Exception:
        pass
    
    # Create fresh collection
    constraints_coll = db.client.create_collection(
        name="constraints",
        metadata={"description": "Agent constraints for code changes and quality gates"}
    )
    print("✅ Created 'constraints' collection")
    
    # Define all constraints with metadata
    timestamp = datetime.utcnow().isoformat()
    
    constraints = [
        # Zeit-Constraints
        {
            "constraint_id": "max_task_duration",
            "name": "Maximum Task Duration",
            "type": "time_limit",
            "limit": "3h",
            "limit_seconds": 10800,
            "severity": "blocking",
            "description": "Ein Sub-Agent Task darf nicht länger als 3 Stunden laufen",
            "applies_to_agents": ["sub_agent", "background_task", "agent_worker", "agent_hypothesis_generator"],
            "action_on_exceed": "kill_and_notify",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "timeout_no_progress",
            "name": "No Progress Timeout",
            "type": "inactivity_timeout",
            "limit": "30m",
            "limit_seconds": 1800,
            "severity": "warning",
            "description": "Timeout nach 30 Minuten ohne Fortschritt",
            "applies_to_agents": ["sub_agent", "background_task", "agent_worker"],
            "action_on_exceed": "warn_and_escalate",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Ressourcen-Constraints
        {
            "constraint_id": "max_tokens_per_task",
            "name": "Maximum Tokens Per Task",
            "type": "resource_limit",
            "resource": "tokens",
            "limit": 1000000,
            "unit": "tokens",
            "severity": "warning",
            "description": "Maximum number of tokens allowed per task execution",
            "applies_to_agents": ["sub_agent", "agent_worker", "agent_hypothesis_generator", "agent_embedding_mutator"],
            "action_on_exceed": "warn_and_throttle",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "max_api_calls",
            "name": "Maximum API Calls",
            "type": "resource_limit",
            "resource": "api_calls",
            "limit": 100,
            "per": "task",
            "unit": "calls",
            "severity": "warning",
            "description": "Maximum API calls allowed per task",
            "applies_to_agents": ["sub_agent", "agent_worker", "agent_hypothesis_generator"],
            "action_on_exceed": "warn_and_throttle",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "max_memory_usage",
            "name": "Maximum Memory Usage",
            "type": "resource_limit",
            "resource": "memory",
            "limit": 512,
            "unit": "MB",
            "severity": "blocking",
            "description": "Maximum memory usage allowed for task execution",
            "applies_to_agents": ["sub_agent", "agent_worker", "background_task"],
            "action_on_exceed": "kill_and_notify",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Dateisystem-Constraints (zusätzlich)
        {
            "constraint_id": "forbidden_golden",
            "name": "Golden Files Protection",
            "type": "forbidden_path",
            "pattern": "docs/golden/*",
            "severity": "critical",
            "description": "Evaluation Ground Truth - niemals ändern",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_embedding_mutator", "agent_auto_pilot"],
            "action_on_violation": "block_and_alert",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "forbidden_test_fixtures",
            "name": "Test Fixtures Protection",
            "type": "forbidden_path",
            "pattern": "docs/test_fixtures/*",
            "severity": "critical",
            "description": "Test fixtures must not be modified",
            "applies_to_agents": ["agent_worker", "agent_auto_pilot"],
            "action_on_violation": "block_and_alert",
            "notification_targets": ["agent_guardian"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "forbidden_segments",
            "name": "Segments JSON Protection",
            "type": "forbidden_file",
            "pattern": "docs/segments.json",
            "severity": "critical",
            "description": "Segments JSON file must never be modified",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_embedding_mutator", "agent_auto_pilot"],
            "action_on_violation": "block_and_alert",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Qualitäts-Constraints (zusätzlich)
        {
            "constraint_id": "no_coverage_decrease",
            "name": "Coverage Must Not Decrease",
            "type": "quality_gate",
            "metric": "test_coverage",
            "must_not_decrease": True,
            "severity": "warning",
            "description": "Test coverage must not decrease from baseline",
            "applies_to_agents": ["agent_worker", "agent_auto_pilot", "agent_hypothesis_generator"],
            "action_on_violation": "warn_and_request_approval",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "no_lint_errors",
            "name": "No Lint Errors",
            "type": "quality_gate",
            "command": "flake8 . --max-line-length=88",
            "must_pass": True,
            "severity": "blocking",
            "description": "No lint errors allowed - code must pass flake8",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_auto_pilot"],
            "action_on_violation": "block_commit",
            "notification_targets": ["agent_guardian"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "max_files_per_change",
            "name": "Maximum Files Per Change",
            "type": "file_limit",
            "max_files": 5,
            "severity": "warning",
            "description": "Maximum number of files allowed per change",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_auto_pilot"],
            "action_on_exceed": "require_approval",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Sicherheits-Constraints
        {
            "constraint_id": "no_secrets_in_output",
            "name": "No Secrets in Output",
            "type": "security",
            "pattern": "(password|secret|token|key)\\s*[=:]\\s*\\S+",
            "severity": "critical",
            "description": "Secrets must not be exposed in output",
            "applies_to_agents": ["all_agents", "agent_worker", "agent_hypothesis_generator", "agent_auto_pilot"],
            "action_on_violation": "redact_and_alert",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "whitelist_external_apis",
            "name": "Whitelisted External APIs Only",
            "type": "security",
            "allowed_hosts": ["api.github.com", "huggingface.co", "api.openai.com", "api.anthropic.com"],
            "severity": "blocking",
            "description": "Only whitelisted external APIs are allowed",
            "applies_to_agents": ["all_agents", "agent_worker", "agent_hypothesis_generator", "agent_embedding_mutator"],
            "action_on_violation": "block_and_alert",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Forbidden File Constraints
        {
            "constraint_id": "constraint_never_change_segments",
            "name": "Never Change Segments",
            "type": "forbidden_file",
            "pattern": "docs/segments.json",
            "severity": "critical",
            "description": "Evaluation Ground Truth - NIEMALS ändern",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_embedding_mutator", "agent_auto_pilot"],
            "action_on_violation": "block_and_alert",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_protect_golden",
            "name": "Protect Golden Files",
            "type": "forbidden_file",
            "pattern": "docs/golden/*",
            "severity": "critical",
            "description": "Golden reference files must not be modified",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_embedding_mutator", "agent_auto_pilot"],
            "action_on_violation": "block_and_alert",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_protect_test_fixtures",
            "name": "Protect Test Fixtures",
            "type": "forbidden_file",
            "pattern": "docs/test_fixtures/*",
            "severity": "high",
            "description": "Test fixtures should not be modified without explicit approval",
            "applies_to_agents": ["agent_worker", "agent_auto_pilot"],
            "action_on_violation": "warn_and_request_approval",
            "notification_targets": ["agent_guardian"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Quality Gate Constraints
        {
            "constraint_id": "constraint_tests_must_pass",
            "name": "Tests Must Pass",
            "type": "quality_gate",
            "command": "npm run check",
            "must_pass": True,
            "severity": "blocking",
            "description": "All tests must pass before code changes are committed",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_embedding_mutator", "agent_auto_pilot", "agent_method_variant_generator"],
            "action_on_violation": "block_commit",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_type_check_pass",
            "name": "Type Check Pass",
            "type": "quality_gate",
            "command": "npm run typecheck",
            "must_pass": True,
            "severity": "blocking",
            "description": "TypeScript type checking must pass",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_auto_pilot"],
            "action_on_violation": "block_commit",
            "notification_targets": ["agent_guardian"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_lint_pass",
            "name": "Lint Pass",
            "type": "quality_gate",
            "command": "npm run lint",
            "must_pass": True,
            "severity": "blocking",
            "description": "Code linting must pass with no errors",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_auto_pilot"],
            "action_on_violation": "block_commit",
            "notification_targets": ["agent_guardian"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_coverage_not_decreased",
            "name": "Coverage Not Decreased",
            "type": "quality_gate",
            "command": "npm run test:coverage",
            "must_pass": True,
            "severity": "warning",
            "description": "Test coverage must not decrease below baseline",
            "applies_to_agents": ["agent_worker", "agent_auto_pilot", "agent_hypothesis_generator"],
            "action_on_violation": "warn_and_request_approval",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Limit Constraints
        {
            "constraint_id": "constraint_max_files_per_change",
            "name": "Max Files Per Change",
            "type": "limit",
            "max_files": 5,
            "severity": "warning",
            "description": "Maximum number of files that can be changed in a single operation",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_auto_pilot"],
            "action_on_violation": "warn_and_split",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_max_lines_per_change",
            "name": "Max Lines Per Change",
            "type": "limit",
            "max_lines": 500,
            "severity": "warning",
            "description": "Maximum lines of code that can be changed in a single operation",
            "applies_to_agents": ["agent_worker", "agent_auto_pilot"],
            "action_on_violation": "warn_and_request_approval",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_forbidden_patterns",
            "name": "Forbidden File Patterns",
            "type": "forbidden_pattern",
            "patterns": ["*.test.js", "*.spec.js", "*.test.ts", "*.spec.ts"],
            "severity": "high",
            "description": "Test files must not be modified by automated agents",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_auto_pilot"],
            "action_on_violation": "block_and_alert",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Review Policy Constraints
        {
            "constraint_id": "constraint_auto_approve_simple",
            "name": "Auto Approve Simple",
            "type": "review_policy",
            "complexity_threshold": "low",
            "auto_approve": ["simple", "low_risk", "docs_only"],
            "severity": "info",
            "description": "Automatically approve simple changes with low risk",
            "applies_to_agents": ["agent_guardian"],
            "action_on_violation": "request_review",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_human_review_complex",
            "name": "Human Review Complex",
            "type": "review_policy",
            "complexity_threshold": "medium",
            "auto_approve": [],
            "severity": "info",
            "description": "Require human review for medium and high complexity changes",
            "applies_to_agents": ["agent_guardian"],
            "action_on_violation": "request_human_review",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Rollback Constraints
        {
            "constraint_id": "constraint_rollback_on_test_fail",
            "name": "Rollback On Test Fail",
            "type": "rollback_condition",
            "metric": "test_pass_rate",
            "threshold": "< 100%",
            "auto_rollback": True,
            "severity": "critical",
            "description": "Automatically rollback when tests fail after commit",
            "applies_to_agents": ["agent_rollback_manager", "agent_guardian"],
            "action_on_violation": "auto_rollback",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_rollback_on_performance_degradation",
            "name": "Rollback On Performance Degradation",
            "type": "rollback_condition",
            "metric": "performance",
            "threshold": "degradation > 10%",
            "auto_rollback": True,
            "severity": "high",
            "description": "Automatically rollback when performance degrades more than 10%",
            "applies_to_agents": ["agent_rollback_manager", "agent_guardian", "agent_performance_monitor"],
            "action_on_violation": "auto_rollback",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_rollback_on_user_error",
            "name": "Rollback On User Reported Error",
            "type": "rollback_condition",
            "metric": "user_reported_error",
            "threshold": "> 0",
            "auto_rollback": False,
            "severity": "high",
            "description": "Trigger rollback review when users report errors",
            "applies_to_agents": ["agent_rollback_manager", "agent_guardian"],
            "action_on_violation": "review_and_rollback",
            "notification_targets": ["agent_guardian", "orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        
        # Code Change Permission Constraints
        {
            "constraint_id": "constraint_code_changes_allowed",
            "name": "Code Changes Allowed",
            "type": "code_change_permission",
            "allowed": True,
            "max_files_per_change": 5,
            "forbidden_patterns": ["*.test.js", "*.spec.js", "*.test.ts", "*.spec.ts"],
            "required_tests": ["npm run check"],
            "must_pass_before_commit": True,
            "severity": "info",
            "description": "General permission and limits for code changes",
            "applies_to_agents": ["agent_worker", "agent_hypothesis_generator", "agent_auto_pilot"],
            "action_on_violation": "enforce_limits",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        },
        {
            "constraint_id": "constraint_guardian_override",
            "name": "Guardian Override",
            "type": "code_change_permission",
            "allowed": True,
            "max_files_per_change": 20,
            "forbidden_patterns": [],
            "required_tests": [],
            "must_pass_before_commit": False,
            "severity": "info",
            "description": "Guardian agent has override permissions for critical fixes",
            "applies_to_agents": ["agent_guardian"],
            "action_on_violation": "log_only",
            "notification_targets": ["orchestrator"],
            "created_at": timestamp,
            "status": "active"
        }
    ]
    
    # Generate embeddings and store constraints
    encoder = db.encoder
    ids = []
    embeddings = []
    metadatas = []
    
    for constraint in constraints:
        # Create embedding from description and details
        text_for_embedding = f"{constraint['name']} {constraint['description']} {constraint['type']} severity:{constraint['severity']}"
        embedding = encoder.encode(text_for_embedding)
        
        ids.append(constraint["constraint_id"])
        embeddings.append(embedding)
        
        # Serialize complex metadata for ChromaDB compatibility
        serialized_constraint = {
            "constraint_id": constraint["constraint_id"],
            "name": constraint["name"],
            "type": constraint["type"],
            "severity": constraint["severity"],
            "description": constraint["description"],
            "status": constraint["status"],
            "created_at": constraint["created_at"],
            # Serialize complex fields as JSON strings
            "applies_to_agents_json": json.dumps(constraint["applies_to_agents"]),
            "notification_targets_json": json.dumps(constraint["notification_targets"])
        }
        
        # Add action field (can be action_on_violation or action_on_exceed)
        if "action_on_violation" in constraint:
            serialized_constraint["action_on_violation"] = constraint["action_on_violation"]
        if "action_on_exceed" in constraint:
            serialized_constraint["action_on_exceed"] = constraint["action_on_exceed"]
        
        # Add type-specific fields
        if "pattern" in constraint:
            serialized_constraint["pattern"] = constraint["pattern"]
        if "patterns" in constraint:
            serialized_constraint["patterns_json"] = json.dumps(constraint["patterns"])
        if "command" in constraint:
            serialized_constraint["command"] = constraint["command"]
        if "must_pass" in constraint:
            serialized_constraint["must_pass"] = str(constraint["must_pass"]).lower()
        if "max_files" in constraint:
            serialized_constraint["max_files"] = constraint["max_files"]
        if "max_lines" in constraint:
            serialized_constraint["max_lines"] = constraint["max_lines"]
        if "complexity_threshold" in constraint:
            serialized_constraint["complexity_threshold"] = constraint["complexity_threshold"]
        if "auto_approve" in constraint:
            serialized_constraint["auto_approve_json"] = json.dumps(constraint["auto_approve"])
        if "metric" in constraint:
            serialized_constraint["metric"] = constraint["metric"]
        if "threshold" in constraint:
            serialized_constraint["threshold"] = constraint["threshold"]
        if "auto_rollback" in constraint:
            serialized_constraint["auto_rollback"] = str(constraint["auto_rollback"]).lower()
        if "allowed" in constraint:
            serialized_constraint["allowed"] = str(constraint["allowed"]).lower()
        if "forbidden_patterns" in constraint:
            serialized_constraint["forbidden_patterns_json"] = json.dumps(constraint["forbidden_patterns"])
        if "required_tests" in constraint:
            serialized_constraint["required_tests_json"] = json.dumps(constraint["required_tests"])
        if "must_pass_before_commit" in constraint:
            serialized_constraint["must_pass_before_commit"] = str(constraint["must_pass_before_commit"]).lower()
        # Zeit-Constraints Felder
        if "limit_seconds" in constraint:
            serialized_constraint["limit_seconds"] = constraint["limit_seconds"]
        # Ressourcen-Constraints Felder
        if "resource" in constraint:
            serialized_constraint["resource"] = constraint["resource"]
        if "limit" in constraint:
            serialized_constraint["limit"] = constraint["limit"]
        if "unit" in constraint:
            serialized_constraint["unit"] = constraint["unit"]
        if "per" in constraint:
            serialized_constraint["per"] = constraint["per"]
        # Qualitäts-Constraints Felder
        if "must_not_decrease" in constraint:
            serialized_constraint["must_not_decrease"] = str(constraint["must_not_decrease"]).lower()
        # Sicherheits-Constraints Felder
        if "allowed_hosts" in constraint:
            serialized_constraint["allowed_hosts_json"] = json.dumps(constraint["allowed_hosts"])
        
        metadatas.append(serialized_constraint)
        
        print(f"  📦 Prepared: {constraint['constraint_id']} ({constraint['type']}, {constraint['severity']})")
    
    # Add all constraints to collection
    constraints_coll.add(
        ids=ids,
        embeddings=embeddings,
        metadatas=metadatas
    )
    
    print(f"\n✅ Added {len(constraints)} constraints to collection")
    return constraints_coll


def verify_collection(constraints_coll):
    """Verify the collection is working correctly."""
    print("\n" + "="*50)
    print("VERIFICATION")
    print("="*50)
    
    # Check count
    count = constraints_coll.count()
    print(f"\n📊 Total constraints in collection: {count}")
    
    # Test query: Critical constraints
    print("\n🔍 Test Query: 'critical severity'")
    results = constraints_coll.query(
        query_texts=["critical severity"],
        n_results=5
    )
    
    print(f"   Found {len(results['ids'][0])} results:")
    for i, constraint_id in enumerate(results['ids'][0]):
        metadata = results['metadatas'][0][i]
        distance = results['distances'][0][i]
        print(f"   - {constraint_id} (distance: {distance:.4f})")
        print(f"     Name: {metadata['name']}")
        print(f"     Type: {metadata['type']}, Severity: {metadata['severity']}")
    
    # Test query: Quality gates
    print("\n🔍 Test Query: 'test must pass quality gate'")
    results = constraints_coll.query(
        query_texts=["test must pass quality gate"],
        n_results=5
    )
    
    print(f"   Found {len(results['ids'][0])} results:")
    for i, constraint_id in enumerate(results['ids'][0]):
        metadata = results['metadatas'][0][i]
        distance = results['distances'][0][i]
        print(f"   - {constraint_id} (distance: {distance:.4f})")
        print(f"     Name: {metadata['name']}")
    
    # List constraints by type
    print("\n📋 Constraints by Type:")
    all_constraints = constraints_coll.get()
    
    types = {}
    for metadata in all_constraints['metadatas']:
        constraint_type = metadata['type']
        if constraint_type not in types:
            types[constraint_type] = []
        types[constraint_type].append({
            'name': metadata['name'],
            'constraint_id': metadata['constraint_id'],
            'severity': metadata['severity']
        })
    
    for constraint_type in ['time_limit', 'inactivity_timeout', 'resource_limit', 'forbidden_file', 
                            'forbidden_path', 'file_limit', 'quality_gate', 'limit', 'review_policy', 
                            'rollback_condition', 'forbidden_pattern', 'security', 'code_change_permission']:
        if constraint_type in types:
            print(f"\n   {constraint_type.upper()}:")
            for c in types[constraint_type]:
                print(f"     - {c['name']} ({c['severity']})")
    
    # Test metadata filtering
    print("\n🔍 Test Metadata Filter: severity='critical'")
    critical_constraints = constraints_coll.get(
        where={"severity": "critical"}
    )
    print(f"   Found {len(critical_constraints['ids'])} critical constraints:")
    for metadata in critical_constraints['metadatas']:
        print(f"     - {metadata['name']} ({metadata['type']})")
    
    # Test query for agent-specific constraints
    print("\n🔍 Test Query: Agent 'agent_worker' constraints")
    # Use where filter for JSON search (we'll search in metadata)
    all_constraints = constraints_coll.get()
    worker_constraints = []
    for metadata in all_constraints['metadatas']:
        agents = json.loads(metadata.get('applies_to_agents_json', '[]'))
        if 'agent_worker' in agents:
            worker_constraints.append(metadata)
    
    print(f"   Found {len(worker_constraints)} constraints for agent_worker:")
    for c in worker_constraints:
        print(f"     - {c['name']} ({c['type']}, {c['severity']})")
    
    return count


def main():
    """Main entry point."""
    print("="*50)
    print("Creating Constraints Collection")
    print("="*50)
    
    # Create collection and add constraints
    constraints_coll = create_constraints_collection()
    
    if constraints_coll:
        # Verify the collection
        count = verify_collection(constraints_coll)
        
        print("\n" + "="*50)
        print("✅ SUCCESS")
        print("="*50)
        print(f"Created 'constraints' collection with {count} constraints")
        print("Constraint types: forbidden_file, quality_gate, limit, review_policy, rollback_condition")
        print("Each constraint has: constraint_id, name, type, severity, applies_to_agents")
        return 0
    else:
        print("\n❌ FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
