#!/usr/bin/env python3
"""Create strategies collection in ChromaDB for self-optimizing exploration vs exploitation."""

import sys
import json
from datetime import datetime
from pathlib import Path

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

try:
    from learning.chroma_client import ChromaLearningDB
except ImportError:
    print("⚠️ ChromaDB client not available, using JSON fallback")
    ChromaLearningDB = None


def create_strategies_collection():
    """Create strategies collection with exploration vs exploitation strategies."""
    
    timestamp = datetime.utcnow().isoformat()
    
    # Define initial strategies
    strategies = [
        {
            "strategy_id": "epsilon_greedy_aggressive",
            "name": "Aggressive Epsilon-Greedy",
            "description": "High exploration rate (ε=0.3) for discovering new methods",
            "type": "exploration",
            "parameters": {
                "epsilon": 0.3,
                "min_epsilon": 0.05,
                "decay_rate": 0.98,
                "exploration_threshold": 0.6
            },
            "performance": {
                "total_runs": 0,
                "successful_runs": 0,
                "avg_improvement": 0.0,
                "best_improvement": 0.0,
                "last_used": None,
                "success_rate": 0.0
            },
            "metadata": {
                "created_at": timestamp,
                "updated_at": timestamp,
                "status": "active",
                "phase": "L4",
                "auto_optimized": False
            }
        },
        {
            "strategy_id": "epsilon_greedy_balanced",
            "name": "Balanced Epsilon-Greedy",
            "description": "Balanced exploration/exploitation (ε=0.2) for steady improvement",
            "type": "balanced",
            "parameters": {
                "epsilon": 0.2,
                "min_epsilon": 0.05,
                "decay_rate": 0.95,
                "exploration_threshold": 0.5
            },
            "performance": {
                "total_runs": 0,
                "successful_runs": 0,
                "avg_improvement": 0.0,
                "best_improvement": 0.0,
                "last_used": None,
                "success_rate": 0.0
            },
            "metadata": {
                "created_at": timestamp,
                "updated_at": timestamp,
                "status": "active",
                "phase": "L4",
                "auto_optimized": False
            }
        },
        {
            "strategy_id": "epsilon_greedy_conservative",
            "name": "Conservative Epsilon-Greedy",
            "description": "Low exploration (ε=0.1) for exploiting known good methods",
            "type": "exploitation",
            "parameters": {
                "epsilon": 0.1,
                "min_epsilon": 0.02,
                "decay_rate": 0.90,
                "exploration_threshold": 0.4
            },
            "performance": {
                "total_runs": 0,
                "successful_runs": 0,
                "avg_improvement": 0.0,
                "best_improvement": 0.0,
                "last_used": None,
                "success_rate": 0.0
            },
            "metadata": {
                "created_at": timestamp,
                "updated_at": timestamp,
                "status": "active",
                "phase": "L4",
                "auto_optimized": False
            }
        },
        {
            "strategy_id": "ucb_bandit",
            "name": "Upper Confidence Bound",
            "description": "UCB algorithm for balancing exploration and exploitation with confidence intervals",
            "type": "adaptive",
            "parameters": {
                "c": 2.0,  # exploration parameter
                "ucb_threshold": 0.7,
                "min_confidence": 0.3
            },
            "performance": {
                "total_runs": 0,
                "successful_runs": 0,
                "avg_improvement": 0.0,
                "best_improvement": 0.0,
                "last_used": None,
                "success_rate": 0.0
            },
            "metadata": {
                "created_at": timestamp,
                "updated_at": timestamp,
                "status": "experimental",
                "phase": "L4",
                "auto_optimized": False
            }
        },
        {
            "strategy_id": "softmax_selection",
            "name": "Softmax Selection",
            "description": "Probability-based selection using softmax over method scores",
            "type": "adaptive",
            "parameters": {
                "temperature": 1.0,
                "min_temperature": 0.1,
                "temperature_decay": 0.99
            },
            "performance": {
                "total_runs": 0,
                "successful_runs": 0,
                "avg_improvement": 0.0,
                "best_improvement": 0.0,
                "last_used": None,
                "success_rate": 0.0
            },
            "metadata": {
                "created_at": timestamp,
                "updated_at": timestamp,
                "status": "experimental",
                "phase": "L4",
                "auto_optimized": False
            }
        },
        {
            "strategy_id": "contextual_bandit",
            "name": "Contextual Bandit",
            "description": "Context-aware strategy selection based on audio characteristics",
            "type": "contextual",
            "parameters": {
                "context_features": ["noise_level", "duration", "num_tracks", "complexity"],
                "exploration_bonus": 0.15,
                "context_weight": 0.5
            },
            "performance": {
                "total_runs": 0,
                "successful_runs": 0,
                "avg_improvement": 0.0,
                "best_improvement": 0.0,
                "last_used": None,
                "success_rate": 0.0
            },
            "metadata": {
                "created_at": timestamp,
                "updated_at": timestamp,
                "status": "experimental",
                "phase": "L4",
                "auto_optimized": False
            }
        },
        {
            "strategy_id": "thompson_sampling",
            "name": "Thompson Sampling",
            "description": "Bayesian approach with Beta distribution for strategy selection",
            "type": "bayesian",
            "parameters": {
                "alpha_prior": 1.0,
                "beta_prior": 1.0,
                "sample_count": 100
            },
            "performance": {
                "total_runs": 0,
                "successful_runs": 0,
                "avg_improvement": 0.0,
                "best_improvement": 0.0,
                "last_used": None,
                "success_rate": 0.0
            },
            "metadata": {
                "created_at": timestamp,
                "updated_at": timestamp,
                "status": "experimental",
                "phase": "L4",
                "auto_optimized": False
            }
        }
    ]
    
    # Try ChromaDB first
    if ChromaLearningDB:
        try:
            return _create_in_chromadb(strategies)
        except Exception as e:
            print(f"⚠️ ChromaDB failed: {e}, using JSON fallback")
    
    # Fallback to JSON
    return _create_in_json(strategies)


def _create_in_chromadb(strategies):
    """Create strategies collection in ChromaDB."""
    workspace = Path(__file__).parent
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    if db.client is None:
        raise Exception("ChromaDB client not available")
    
    # Try to delete existing collection
    try:
        db.client.delete_collection("strategies")
        print("🗑️  Deleted existing 'strategies' collection")
    except Exception:
        pass
    
    # Create fresh collection
    strategies_coll = db.client.create_collection(
        name="strategies",
        metadata={
            "description": "Strategy definitions and performance data for L4 self-optimization",
            "created_at": datetime.utcnow().isoformat()
        }
    )
    print("✅ Created 'strategies' collection in ChromaDB")
    
    # Generate embeddings and store strategies
    encoder = db.encoder
    ids = []
    embeddings = []
    metadatas = []
    documents = []
    
    for strategy in strategies:
        # Create embedding from strategy description
        text_for_embedding = f"{strategy['name']} {strategy['description']} {strategy['type']}"
        embedding = encoder.encode(text_for_embedding)
        
        ids.append(strategy["strategy_id"])
        embeddings.append(embedding)
        metadatas.append(strategy)
        documents.append(json.dumps(strategy))
        
        print(f"  📦 Prepared: {strategy['strategy_id']} ({strategy['type']})")
    
    # Add all strategies to collection
    strategies_coll.add(
        ids=ids,
        embeddings=embeddings,
        metadatas=metadatas,
        documents=documents
    )
    
    print(f"\n✅ Added {len(strategies)} strategies to ChromaDB")
    return strategies_coll, "chromadb"


def _create_in_json(strategies):
    """Create strategies collection in JSON file."""
    workspace = Path(__file__).parent
    strategies_file = workspace / "strategies_data" / "strategies.json"
    strategies_file.parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        "collection_name": "strategies",
        "created_at": datetime.utcnow().isoformat(),
        "description": "Strategy definitions and performance data for L4 self-optimization",
        "strategies": {s["strategy_id"]: s for s in strategies}
    }
    
    with open(strategies_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"✅ Created 'strategies' collection in JSON: {strategies_file}")
    print(f"✅ Added {len(strategies)} strategies")
    return data, "json"


def verify_collection(result, storage_type):
    """Verify the collection is working correctly."""
    print("\n" + "="*50)
    print("VERIFICATION")
    print("="*50)
    
    if storage_type == "chromadb":
        strategies_coll = result
        count = strategies_coll.count()
        print(f"\n📊 Total strategies: {count}")
        
        # Test query: exploration strategies
        print("\n🔍 Test Query: 'exploration strategy'")
        results = strategies_coll.query(
            query_texts=["exploration strategy"],
            n_results=3
        )
        
        print(f"   Found {len(results['ids'][0])} results:")
        for i, strategy_id in enumerate(results['ids'][0]):
            metadata = results['metadatas'][0][i]
            distance = results['distances'][0][i]
            print(f"   - {strategy_id} (distance: {distance:.4f})")
            print(f"     Type: {metadata['type']}, ε={metadata['parameters'].get('epsilon', 'N/A')}")
        
        # List all strategies by type
        print("\n📋 Strategies by Type:")
        all_strategies = strategies_coll.get()
        
        by_type = {}
        for metadata in all_strategies['metadatas']:
            strategy_type = metadata['type']
            if strategy_type not in by_type:
                by_type[strategy_type] = []
            by_type[strategy_type].append(metadata['name'])
        
        for strategy_type, names in sorted(by_type.items()):
            print(f"\n   {strategy_type}:")
            for name in names:
                print(f"     - {name}")
        
        return count
    
    else:  # JSON
        data = result
        strategies = data.get("strategies", {})
        count = len(strategies)
        print(f"\n📊 Total strategies: {count}")
        
        # List by type
        by_type = {}
        for strategy_id, strategy in strategies.items():
            strategy_type = strategy['type']
            if strategy_type not in by_type:
                by_type[strategy_type] = []
            by_type[strategy_type].append(strategy['name'])
        
        print("\n📋 Strategies by Type:")
        for strategy_type, names in sorted(by_type.items()):
            print(f"\n   {strategy_type}:")
            for name in names:
                print(f"     - {name}")
        
        return count


def main():
    """Main entry point."""
    print("="*50)
    print("Creating Strategies Collection (L4)")
    print("="*50)
    print("Stores exploration vs exploitation strategies")
    print("With ε-greedy values, thresholds, and performance tracking")
    print("="*50 + "\n")
    
    # Create collection
    result, storage_type = create_strategies_collection()
    
    # Verify the collection
    count = verify_collection(result, storage_type)
    
    print("\n" + "="*50)
    print("✅ SUCCESS")
    print("="*50)
    print(f"Created 'strategies' collection with {count} strategies")
    print(f"Storage: {storage_type}")
    print("\nStrategy types:")
    print("  - exploration (high ε)")
    print("  - exploitation (low ε)")
    print("  - balanced (medium ε)")
    print("  - adaptive (UCB, Softmax)")
    print("  - contextual (context-aware)")
    print("  - bayesian (Thompson Sampling)")
    print("\nEach strategy tracks:")
    print("  - total_runs, successful_runs")
    print("  - avg_improvement, best_improvement")
    print("  - success_rate, last_used")
    return 0


if __name__ == "__main__":
    sys.exit(main())
