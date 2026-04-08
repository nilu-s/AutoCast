"""Configuration for Learning Engine.

Central configuration file for feature flags and learning parameters.
"""

from typing import Dict, Any

# Feature Flags
FEATURES: Dict[str, bool] = {
    "L2_SIMILARITY_SELECTION": True,  # Enable similarity-based method selection
    "L2_CONTEXT_EMBEDDING": True,     # Enable context-based embeddings
    "L2_ANALYTICS": True,             # Enable similarity analytics
    "L2_CHROMA_BRIDGE": True,         # Enable ChromaDB Bridge API
}

# Selection Strategy Configuration
SELECTION_CONFIG: Dict[str, Any] = {
    "epsilon": 0.2,                  # Exploration probability (0.0 to 1.0)
    "min_success_rate": 0.3,         # Minimum success rate threshold
    "min_confidence_samples": 5,     # Minimum samples for high confidence
    "exploration_threshold": 0.3,    # Cosine similarity threshold for exploration
    "n_candidates_default": 3,       # Default number of candidates
}

# ChromaDB Bridge Configuration
BRIDGE_CONFIG: Dict[str, Any] = {
    "host": "localhost",
    "port": 8765,
    "timeout_ms": 5000,
    "retries": 2,
    "retry_delay_ms": 1000,
}

# Embedding Configuration
EMBEDDING_CONFIG: Dict[str, Any] = {
    "model": "all-MiniLM-L6-v2",
    "device": "cpu",
    "normalize": True,
}

def is_feature_enabled(feature_name: str) -> bool:
    """Check if a feature is enabled.
    
    Args:
        feature_name: Name of the feature to check.
        
    Returns:
        True if feature is enabled, False otherwise.
    """
    return FEATURES.get(feature_name, False)


def get_selection_config() -> Dict[str, Any]:
    """Get selection strategy configuration.
    
    Returns:
        Dictionary with selection configuration.
    """
    return SELECTION_CONFIG.copy()


def get_bridge_config() -> Dict[str, Any]:
    """Get ChromaDB Bridge configuration.
    
    Returns:
        Dictionary with bridge configuration.
    """
    return BRIDGE_CONFIG.copy()


def update_feature(feature_name: str, enabled: bool) -> None:
    """Update a feature flag.
    
    Args:
        feature_name: Name of the feature to update.
        enabled: New enabled state.
    """
    if feature_name in FEATURES:
        FEATURES[feature_name] = enabled
    else:
        raise ValueError(f"Unknown feature: {feature_name}")