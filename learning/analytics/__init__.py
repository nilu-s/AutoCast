"""Analytics module for Learning Engine.

This module provides feature extraction and similarity-based selection
capabilities for method analysis and machine learning.

Key Components:
    - features.py: Legacy feature extraction (for compatibility)
    - similarity_selector.py: ChromaDB-based similarity selection
    - similarity_analytics.py: ChromaDB-based analytics and predictions (NEW)
    - selection.py: Legacy epsilon-greedy selection (for reference)

ChromaDB Migration:
    The system now uses similarity-based selection via ChromaDB embeddings
    instead of manual feature engineering.

Example:
    >>> from learning.analytics import SimilarityAnalytics
    >>> from learning.chroma_client import ChromaLearningDB
    >>> db = ChromaLearningDB()
    >>> analytics = SimilarityAnalytics(db)
    >>> similar = analytics.get_similar_successful_methods("m1", 5)
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Legacy imports (for compatibility)
try:
    from learning.analytics.features import FeatureExtractor, MethodFeatures
    FEATURES_AVAILABLE = True
except ImportError:
    FEATURES_AVAILABLE = False

# Similarity selector imports
try:
    from learning.analytics.similarity_selector import (
        SimilaritySelector,
        SimilaritySelectionResult,
        SimilaritySelectionStats
    )
    SIMILARITY_SELECTOR_AVAILABLE = True
except ImportError:
    SIMILARITY_SELECTOR_AVAILABLE = False

# Similarity analytics imports (NEW)
try:
    from learning.analytics.similarity_analytics import (
        SimilarityAnalytics,
        MethodRecommendation,
        MethodCluster,
        SuccessPrediction,
        cosine_similarity
    )
    SIMILARITY_ANALYTICS_AVAILABLE = True
except ImportError:
    SIMILARITY_ANALYTICS_AVAILABLE = False

__all__ = []

if FEATURES_AVAILABLE:
    __all__.extend(['FeatureExtractor', 'MethodFeatures'])

if SIMILARITY_SELECTOR_AVAILABLE:
    __all__.extend([
        'SimilaritySelector',
        'SimilaritySelectionResult',
        'SimilaritySelectionStats'
    ])

if SIMILARITY_ANALYTICS_AVAILABLE:
    __all__.extend([
        'SimilarityAnalytics',
        'MethodRecommendation',
        'MethodCluster',
        'SuccessPrediction',
        'cosine_similarity'
    ])