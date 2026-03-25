#!/usr/bin/env python3
"""Create skills collection in ChromaDB with defined capabilities for agents."""

import sys
import json
from datetime import datetime
from pathlib import Path

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB


def create_skills_collection():
    """Create skills collection with defined capabilities."""
    
    # Initialize ChromaDB
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    # Create or get skills collection
    if db.client is None:
        print("❌ ChromaDB client not available")
        return False
    
    # Try to delete existing collection if it exists
    try:
        db.client.delete_collection("skills")
        print("🗑️  Deleted existing 'skills' collection")
    except Exception:
        pass
    
    # Create fresh collection
    skills_coll = db.client.create_collection(
        name="skills",
        metadata={"description": "Skill definitions and capabilities for agents"}
    )
    print("✅ Created 'skills' collection")
    
    # Define all skills with metadata
    timestamp = datetime.utcnow().isoformat()
    
    skills = [
        # Data Skills
        {
            "skill_id": "skill_chromadb_query",
            "name": "ChromaDB Query",
            "category": "Data",
            "description": "Execute similarity searches and metadata queries on ChromaDB collections",
            "inputs": [
                {"name": "collection_name", "type": "string", "required": True},
                {"name": "query_text", "type": "string", "required": False},
                {"name": "query_embedding", "type": "list", "required": False},
                {"name": "where_filter", "type": "dict", "required": False},
                {"name": "n_results", "type": "integer", "required": False}
            ],
            "outputs": [
                {"name": "results", "type": "list"},
                {"name": "distances", "type": "list"},
                {"name": "metadatas", "type": "list"}
            ],
            "complexity": "medium",
            "cost": "medium",
            "agents_allowed": ["agent_method_selector", "agent_context_analyzer", "agent_success_tracker", "agent_hypothesis_generator"],
            "config": {"default_params": {"n_results": 10, "include_metadata": True}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_chromadb_store",
            "name": "ChromaDB Store",
            "category": "Data",
            "description": "Store data with embeddings in ChromaDB collections",
            "inputs": [
                {"name": "collection_name", "type": "string", "required": True},
                {"name": "ids", "type": "list", "required": True},
                {"name": "embeddings", "type": "list", "required": False},
                {"name": "metadatas", "type": "list", "required": True},
                {"name": "documents", "type": "list", "required": False}
            ],
            "outputs": [
                {"name": "success", "type": "boolean"},
                {"name": "stored_count", "type": "integer"}
            ],
            "complexity": "simple",
            "cost": "low",
            "agents_allowed": ["agent_method_collector", "agent_embedding_mutator", "agent_hypothesis_generator", "agent_auto_pilot"],
            "config": {"default_params": {"batch_size": 100}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_embedding_encode",
            "name": "Embedding Encoder",
            "category": "Data",
            "description": "Convert text to vector embeddings using sentence-transformers",
            "inputs": [
                {"name": "text", "type": "string", "required": True},
                {"name": "model_name", "type": "string", "required": False}
            ],
            "outputs": [
                {"name": "embedding", "type": "list"},
                {"name": "dimension", "type": "integer"}
            ],
            "complexity": "simple",
            "cost": "medium",
            "agents_allowed": ["agent_context_analyzer", "agent_embedding_mutator", "agent_method_selector", "agent_hypothesis_generator", "agent_auto_pilot", "agent_self_reviewer"],
            "config": {"default_params": {"model_name": "all-MiniLM-L6-v2"}},
            "status": "active",
            "created_at": timestamp
        },
        
        # Analysis Skills
        {
            "skill_id": "skill_similarity_search",
            "name": "Similarity Search",
            "category": "Analysis",
            "description": "Find similar methods or runs based on embedding similarity",
            "inputs": [
                {"name": "target_id", "type": "string", "required": True},
                {"name": "collection", "type": "string", "required": True},
                {"name": "n_results", "type": "integer", "required": False},
                {"name": "min_similarity", "type": "float", "required": False}
            ],
            "outputs": [
                {"name": "similar_items", "type": "list"},
                {"name": "similarity_scores", "type": "list"}
            ],
            "complexity": "medium",
            "cost": "medium",
            "agents_allowed": ["agent_method_selector", "agent_context_analyzer", "agent_hypothesis_generator"],
            "config": {"default_params": {"n_results": 5, "min_similarity": 0.7}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_success_analysis",
            "name": "Success Rate Analysis",
            "category": "Analysis",
            "description": "Calculate and analyze success rates from method execution history",
            "inputs": [
                {"name": "method_runs", "type": "list", "required": True},
                {"name": "time_window", "type": "string", "required": False},
                {"name": "group_by", "type": "string", "required": False}
            ],
            "outputs": [
                {"name": "success_rate", "type": "float"},
                {"name": "trend", "type": "string"},
                {"name": "confidence_interval", "type": "tuple"}
            ],
            "complexity": "medium",
            "cost": "low",
            "agents_allowed": ["agent_success_tracker", "agent_strategy_optimizer", "agent_hyperparameter_tuner", "agent_self_reviewer"],
            "config": {"default_params": {"min_samples": 10, "confidence_level": 0.95}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_context_parsing",
            "name": "Context Parser",
            "category": "Analysis",
            "description": "Parse audio context JSON and extract meaningful features",
            "inputs": [
                {"name": "context_json", "type": "dict", "required": True},
                {"name": "extract_features", "type": "list", "required": False}
            ],
            "outputs": [
                {"name": "parsed_features", "type": "dict"},
                {"name": "context_vector", "type": "list"},
                {"name": "complexity_score", "type": "float"}
            ],
            "complexity": "medium",
            "cost": "low",
            "agents_allowed": ["agent_context_analyzer", "agent_validation_guard", "agent_method_selector"],
            "config": {"default_params": {"normalize": True}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_pattern_recognition",
            "name": "Pattern Recognition",
            "category": "Analysis",
            "description": "Detect patterns in method success/failure data over time",
            "inputs": [
                {"name": "data_series", "type": "list", "required": True},
                {"name": "pattern_type", "type": "string", "required": False},
                {"name": "window_size", "type": "integer", "required": False}
            ],
            "outputs": [
                {"name": "patterns", "type": "list"},
                {"name": "pattern_strength", "type": "float"},
                {"name": "anomalies", "type": "list"}
            ],
            "complexity": "complex",
            "cost": "high",
            "agents_allowed": ["agent_strategy_optimizer", "agent_hypothesis_generator", "agent_self_reviewer"],
            "config": {"default_params": {"window_size": 10, "sensitivity": 0.8}},
            "status": "active",
            "created_at": timestamp
        },
        
        # Selection Skills
        {
            "skill_id": "skill_epsilon_greedy",
            "name": "Epsilon-Greedy Selection",
            "category": "Selection",
            "description": "Apply epsilon-greedy algorithm for exploration vs exploitation",
            "inputs": [
                {"name": "candidates", "type": "list", "required": True},
                {"name": "scores", "type": "list", "required": True},
                {"name": "epsilon", "type": "float", "required": True},
                {"name": "iteration", "type": "integer", "required": False}
            ],
            "outputs": [
                {"name": "selected", "type": "string"},
                {"name": "was_exploration", "type": "boolean"},
                {"name": "exploration_probability", "type": "float"}
            ],
            "complexity": "medium",
            "cost": "low",
            "agents_allowed": ["agent_method_selector", "agent_strategy_optimizer", "agent_hyperparameter_tuner"],
            "config": {"default_params": {"epsilon_decay": 0.995, "min_epsilon": 0.01}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_context_matching",
            "name": "Context Matching",
            "category": "Selection",
            "description": "Match current context to historically successful contexts",
            "inputs": [
                {"name": "current_context", "type": "dict", "required": True},
                {"name": "historical_contexts", "type": "list", "required": True},
                {"name": "match_threshold", "type": "float", "required": False}
            ],
            "outputs": [
                {"name": "matched_contexts", "type": "list"},
                {"name": "match_scores", "type": "list"},
                {"name": "best_match", "type": "dict"}
            ],
            "complexity": "medium",
            "cost": "medium",
            "agents_allowed": ["agent_context_analyzer", "agent_method_selector", "agent_auto_pilot"],
            "config": {"default_params": {"match_threshold": 0.8, "top_k": 3}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_ranking",
            "name": "Method Ranker",
            "category": "Selection",
            "description": "Rank methods by composite score combining multiple factors",
            "inputs": [
                {"name": "methods", "type": "list", "required": True},
                {"name": "weights", "type": "dict", "required": False},
                {"name": "context", "type": "dict", "required": False}
            ],
            "outputs": [
                {"name": "ranked_methods", "type": "list"},
                {"name": "scores", "type": "list"},
                {"name": "ranking_explanation", "type": "dict"}
            ],
            "complexity": "medium",
            "cost": "low",
            "agents_allowed": ["agent_method_selector", "agent_strategy_optimizer", "agent_auto_pilot"],
            "config": {"default_params": {"weights": {"success_rate": 0.5, "recency": 0.3, "context_match": 0.2}}},
            "status": "active",
            "created_at": timestamp
        },
        
        # Generation Skills
        {
            "skill_id": "skill_embedding_mutation",
            "name": "Embedding Mutator",
            "category": "Generation",
            "description": "Mutate embeddings in vector space to generate new method variants",
            "inputs": [
                {"name": "base_embedding", "type": "list", "required": True},
                {"name": "mutation_strength", "type": "float", "required": True},
                {"name": "n_variants", "type": "integer", "required": False},
                {"name": "constraints", "type": "dict", "required": False}
            ],
            "outputs": [
                {"name": "mutated_embeddings", "type": "list"},
                {"name": "mutation_distances", "type": "list"},
                {"name": "variant_descriptions", "type": "list"}
            ],
            "complexity": "complex",
            "cost": "high",
            "agents_allowed": ["agent_embedding_mutator", "agent_hypothesis_generator", "agent_auto_pilot"],
            "config": {"default_params": {"n_variants": 5, "distribution": "gaussian"}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_hypothesis_synthesis",
            "name": "Hypothesis Synthesis",
            "category": "Generation",
            "description": "Generate new hypotheses by combining successful method patterns",
            "inputs": [
                {"name": "successful_patterns", "type": "list", "required": True},
                {"name": "combination_strategy", "type": "string", "required": False},
                {"name": "max_hypotheses", "type": "integer", "required": False}
            ],
            "outputs": [
                {"name": "hypotheses", "type": "list"},
                {"name": "confidence_scores", "type": "list"},
                {"name": "test_requirements", "type": "list"}
            ],
            "complexity": "complex",
            "cost": "high",
            "agents_allowed": ["agent_hypothesis_generator", "agent_auto_pilot", "agent_self_reviewer"],
            "config": {"default_params": {"max_hypotheses": 10, "min_confidence": 0.6}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_method_variant",
            "name": "Method Variant Generator",
            "category": "Generation",
            "description": "Create concrete method variants from abstract hypotheses",
            "inputs": [
                {"name": "hypothesis", "type": "dict", "required": True},
                {"name": "base_method", "type": "dict", "required": True},
                {"name": "parameter_ranges", "type": "dict", "required": False}
            ],
            "outputs": [
                {"name": "method_variant", "type": "dict"},
                {"name": "parameters", "type": "dict"},
                {"name": "expected_behavior", "type": "string"}
            ],
            "complexity": "complex",
            "cost": "medium",
            "agents_allowed": ["agent_hypothesis_generator", "agent_embedding_mutator", "agent_auto_pilot"],
            "config": {"default_params": {"max_param_deviation": 0.2}},
            "status": "active",
            "created_at": timestamp
        },
        
        # Meta Skills
        {
            "skill_id": "skill_hyperparameter_tuning",
            "name": "Hyperparameter Tuner",
            "category": "Meta",
            "description": "Optimize hyperparameters using Bayesian or grid search",
            "inputs": [
                {"name": "param_space", "type": "dict", "required": True},
                {"name": "objective_function", "type": "callable", "required": True},
                {"name": "n_trials", "type": "integer", "required": False},
                {"name": "strategy", "type": "string", "required": False}
            ],
            "outputs": [
                {"name": "best_params", "type": "dict"},
                {"name": "optimization_history", "type": "list"},
                {"name": "convergence_plot", "type": "object"}
            ],
            "complexity": "complex",
            "cost": "high",
            "agents_allowed": ["agent_hyperparameter_tuner", "agent_strategy_optimizer", "agent_auto_pilot"],
            "config": {"default_params": {"n_trials": 100, "strategy": "bayesian"}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_strategy_evaluation",
            "name": "Strategy Evaluator",
            "category": "Meta",
            "description": "Evaluate selection strategies against historical data",
            "inputs": [
                {"name": "strategy", "type": "dict", "required": True},
                {"name": "historical_data", "type": "list", "required": True},
                {"name": "metrics", "type": "list", "required": False}
            ],
            "outputs": [
                {"name": "evaluation_score", "type": "float"},
                {"name": "metric_values", "type": "dict"},
                {"name": "recommendations", "type": "list"}
            ],
            "complexity": "complex",
            "cost": "high",
            "agents_allowed": ["agent_strategy_optimizer", "agent_hyperparameter_tuner", "agent_self_reviewer"],
            "config": {"default_params": {"metrics": ["regret", "cumulative_reward", "diversity"]}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_ab_testing",
            "name": "A/B Testing",
            "category": "Meta",
            "description": "Conduct A/B tests to compare method or strategy variants",
            "inputs": [
                {"name": "variant_a", "type": "dict", "required": True},
                {"name": "variant_b", "type": "dict", "required": True},
                {"name": "sample_size", "type": "integer", "required": False},
                {"name": "success_metric", "type": "string", "required": False}
            ],
            "outputs": [
                {"name": "winner", "type": "string"},
                {"name": "p_value", "type": "float"},
                {"name": "effect_size", "type": "float"},
                {"name": "is_significant", "type": "boolean"}
            ],
            "complexity": "medium",
            "cost": "medium",
            "agents_allowed": ["agent_strategy_optimizer", "agent_hyperparameter_tuner", "agent_auto_pilot"],
            "config": {"default_params": {"confidence_level": 0.95, "min_sample_size": 30}},
            "status": "active",
            "created_at": timestamp
        },
        
        # Execution Skills
        {
            "skill_id": "skill_method_execution",
            "name": "Method Executor",
            "category": "Execution",
            "description": "Execute methods with parameter injection and result capture",
            "inputs": [
                {"name": "method_id", "type": "string", "required": True},
                {"name": "parameters", "type": "dict", "required": True},
                {"name": "input_data", "type": "object", "required": True},
                {"name": "timeout", "type": "integer", "required": False}
            ],
            "outputs": [
                {"name": "result", "type": "object"},
                {"name": "execution_time_ms", "type": "integer"},
                {"name": "status", "type": "string"},
                {"name": "error", "type": "string"}
            ],
            "complexity": "medium",
            "cost": "medium",
            "agents_allowed": ["agent_method_collector", "agent_auto_pilot", "agent_validation_guard"],
            "config": {"default_params": {"timeout": 30000, "capture_metrics": True}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_result_aggregation",
            "name": "Result Aggregator",
            "category": "Execution",
            "description": "Aggregate results from multiple method executions",
            "inputs": [
                {"name": "results", "type": "list", "required": True},
                {"name": "aggregation_strategy", "type": "string", "required": False},
                {"name": "weights", "type": "list", "required": False}
            ],
            "outputs": [
                {"name": "aggregated_result", "type": "object"},
                {"name": "variance", "type": "float"},
                {"name": "confidence", "type": "float"}
            ],
            "complexity": "medium",
            "cost": "low",
            "agents_allowed": ["agent_success_tracker", "agent_strategy_optimizer", "agent_auto_pilot"],
            "config": {"default_params": {"aggregation_strategy": "mean", "outlier_removal": True}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_validation_check",
            "name": "Validation Checker",
            "category": "Execution",
            "description": "Validate methods before deployment using test cases",
            "inputs": [
                {"name": "method_candidate", "type": "dict", "required": True},
                {"name": "test_cases", "type": "list", "required": True},
                {"name": "validation_rules", "type": "list", "required": False}
            ],
            "outputs": [
                {"name": "is_valid", "type": "boolean"},
                {"name": "passed_tests", "type": "integer"},
                {"name": "failed_tests", "type": "integer"},
                {"name": "warnings", "type": "list"}
            ],
            "complexity": "medium",
            "cost": "medium",
            "agents_allowed": ["agent_validation_guard", "agent_auto_pilot", "agent_rollback_manager"],
            "config": {"default_params": {"stop_on_first_failure": False}},
            "status": "active",
            "created_at": timestamp
        },
        
        # Utility Skills
        {
            "skill_id": "skill_logging",
            "name": "Logger",
            "category": "Utility",
            "description": "Structured logging and monitoring of agent activities",
            "inputs": [
                {"name": "level", "type": "string", "required": True},
                {"name": "message", "type": "string", "required": True},
                {"name": "context", "type": "dict", "required": False},
                {"name": "metrics", "type": "dict", "required": False}
            ],
            "outputs": [
                {"name": "log_entry_id", "type": "string"},
                {"name": "timestamp", "type": "string"}
            ],
            "complexity": "simple",
            "cost": "low",
            "agents_allowed": ["agent_method_collector", "agent_performance_monitor", "agent_rollback_manager", "agent_auto_pilot", "agent_self_reviewer"],
            "config": {"default_params": {"include_stack_trace": True, "async": True}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_rollback",
            "name": "Rollback Manager",
            "category": "Utility",
            "description": "Perform rollback operations when errors or degradations detected",
            "inputs": [
                {"name": "target_state", "type": "string", "required": True},
                {"name": "current_state", "type": "dict", "required": True},
                {"name": "rollback_level", "type": "string", "required": False}
            ],
            "outputs": [
                {"name": "success", "type": "boolean"},
                {"name": "restored_state", "type": "dict"},
                {"name": "affected_components", "type": "list"}
            ],
            "complexity": "medium",
            "cost": "medium",
            "agents_allowed": ["agent_rollback_manager", "agent_validation_guard", "agent_auto_pilot"],
            "config": {"default_params": {"backup_first": True, "verify_after": True}},
            "status": "active",
            "created_at": timestamp
        },
        {
            "skill_id": "skill_http_bridge",
            "name": "HTTP Bridge",
            "category": "Utility",
            "description": "Communicate with external systems via HTTP Bridge",
            "inputs": [
                {"name": "endpoint", "type": "string", "required": True},
                {"name": "method", "type": "string", "required": True},
                {"name": "payload", "type": "dict", "required": False},
                {"name": "headers", "type": "dict", "required": False}
            ],
            "outputs": [
                {"name": "status_code", "type": "integer"},
                {"name": "response", "type": "object"},
                {"name": "latency_ms", "type": "integer"}
            ],
            "complexity": "simple",
            "cost": "low",
            "agents_allowed": ["agent_performance_monitor", "agent_auto_pilot", "agent_method_collector"],
            "config": {"default_params": {"timeout": 5000, "retries": 3}},
            "status": "active",
            "created_at": timestamp
        }
    ]
    
    # Generate embeddings and store skills
    encoder = db.encoder
    ids = []
    embeddings = []
    metadatas = []
    
    for skill in skills:
        # Create embedding from description and category
        text_for_embedding = f"{skill['name']} {skill['description']} {skill['category']}"
        embedding = encoder.encode(text_for_embedding)
        
        ids.append(skill["skill_id"])
        embeddings.append(embedding)
        
        # Serialize complex metadata for ChromaDB compatibility
        # ChromaDB only supports flat metadata (str, int, float, bool)
        serialized_skill = {
            "skill_id": skill["skill_id"],
            "name": skill["name"],
            "category": skill["category"],
            "description": skill["description"],
            "complexity": skill["complexity"],
            "cost": skill["cost"],
            "status": skill["status"],
            "created_at": skill["created_at"],
            # Serialize complex fields as JSON strings
            "inputs_json": json.dumps(skill["inputs"]),
            "outputs_json": json.dumps(skill["outputs"]),
            "agents_allowed_json": json.dumps(skill["agents_allowed"]),
            "config_json": json.dumps(skill["config"])
        }
        metadatas.append(serialized_skill)
        
        print(f"  📦 Prepared: {skill['skill_id']} ({skill['category']})")
    
    # Add all skills to collection
    skills_coll.add(
        ids=ids,
        embeddings=embeddings,
        metadatas=metadatas
    )
    
    print(f"\n✅ Added {len(skills)} skills to collection")
    return skills_coll


def verify_collection(skills_coll):
    """Verify the collection is working correctly."""
    print("\n" + "="*50)
    print("VERIFICATION")
    print("="*50)
    
    # Check count
    count = skills_coll.count()
    print(f"\n📊 Total skills in collection: {count}")
    
    # Test query: Data skills
    print("\n🔍 Test Query: 'embedding storage'")
    results = skills_coll.query(
        query_texts=["embedding storage"],
        n_results=3
    )
    
    print(f"   Found {len(results['ids'][0])} results:")
    for i, skill_id in enumerate(results['ids'][0]):
        metadata = results['metadatas'][0][i]
        distance = results['distances'][0][i]
        print(f"   - {skill_id} (distance: {distance:.4f})")
        print(f"     Name: {metadata['name']}")
        print(f"     Category: {metadata['category']}")
    
    # Test query: Selection skills
    print("\n🔍 Test Query: 'method ranking selection'")
    results = skills_coll.query(
        query_texts=["method ranking selection"],
        n_results=3
    )
    
    print(f"   Found {len(results['ids'][0])} results:")
    for i, skill_id in enumerate(results['ids'][0]):
        metadata = results['metadatas'][0][i]
        distance = results['distances'][0][i]
        print(f"   - {skill_id} (distance: {distance:.4f})")
        print(f"     Name: {metadata['name']}")
    
    # List skills by category
    print("\n📋 Skills by Category:")
    all_skills = skills_coll.get()
    
    categories = {}
    for metadata in all_skills['metadatas']:
        category = metadata['category']
        if category not in categories:
            categories[category] = []
        
        # Parse JSON fields back for display
        inputs = json.loads(metadata['inputs_json']) if 'inputs_json' in metadata else []
        outputs = json.loads(metadata['outputs_json']) if 'outputs_json' in metadata else []
        agents_allowed = json.loads(metadata['agents_allowed_json']) if 'agents_allowed_json' in metadata else []
        config = json.loads(metadata['config_json']) if 'config_json' in metadata else {}
        
        categories[category].append({
            'name': metadata['name'],
            'skill_id': metadata['skill_id'],
            'complexity': metadata['complexity'],
            'cost': metadata['cost'],
            'inputs': inputs,
            'outputs': outputs,
            'agents_allowed': agents_allowed,
            'config': config
        })
    
    for category in ['Data', 'Analysis', 'Selection', 'Generation', 'Meta', 'Execution', 'Utility']:
        if category in categories:
            print(f"\n   {category}:")
            for skill in categories[category]:
                print(f"     - {skill['name']} ({skill['skill_id']})")
                print(f"       Complexity: {skill['complexity']}, Cost: {skill['cost']}")
                print(f"       Inputs: {len(skill['inputs'])} params, Outputs: {len(skill['outputs'])} results")
                print(f"       Allowed Agents: {len(skill['agents_allowed'])}")
    
    # Test metadata filtering
    print("\n🔍 Test Metadata Filter: complexity='complex'")
    complex_skills = skills_coll.get(
        where={"complexity": "complex"}
    )
    print(f"   Found {len(complex_skills['ids'])} complex skills:")
    for metadata in complex_skills['metadatas']:
        print(f"     - {metadata['name']} ({metadata['category']})")
    
    return count


def main():
    """Main entry point."""
    print("="*50)
    print("Creating Skills Collection")
    print("="*50)
    
    # Create collection and add skills
    skills_coll = create_skills_collection()
    
    if skills_coll:
        # Verify the collection
        count = verify_collection(skills_coll)
        
        print("\n" + "="*50)
        print("✅ SUCCESS")
        print("="*50)
        print(f"Created 'skills' collection with {count} skills")
        print("Each skill has: skill_id, name, category, description, inputs, outputs, complexity, cost, agents_allowed")
        return 0
    else:
        print("\n❌ FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
