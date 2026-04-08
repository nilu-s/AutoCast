"""Feature extraction and similarity calculation for method analysis.

This module provides feature extraction capabilities for method identifiers,
enabling machine learning analysis through numerical feature vectors and
similarity calculations.

Example:
    >>> from learning.analytics.features import FeatureExtractor
    >>> extractor = FeatureExtractor()
    >>> features = extractor.parse_method_id('vad_aggressive_threshold_0.3')
    >>> features.category
    'vad'
    >>> features.strategy
    'aggressive'
    >>> features.parameters
    {'threshold': 0.3}
"""

import re
import math
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass, field
from collections import defaultdict

try:
    import numpy as np
    from sklearn.metrics.pairwise import cosine_similarity
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    np = None  # type: ignore

try:
    from learning.db.extended_db import ExtendedLearningDB
except ImportError:
    try:
        from db.extended_db import ExtendedLearningDB
    except ImportError:
        ExtendedLearningDB = None  # type: ignore


@dataclass
class MethodFeatures:
    """Represents extracted features from a method identifier.
    
    Attributes:
        category: The method category (e.g., 'vad', 'denoise', 'normalize').
        strategy: The strategy name (e.g., 'aggressive', 'gentle', 'standard').
        parameters: Dictionary of parameter names and values.
        feature_vector: Normalized numerical feature vector for ML.
        method_id: The original method identifier string.
    """
    category: str
    strategy: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    feature_vector: List[float] = field(default_factory=list)
    method_id: str = ""


class FeatureExtractor:
    """Extracts features from method identifiers for ML analysis.
    
    Parses method identifiers in the format 'category_strategy_param1_val1_param2_val2...'
    and converts them into numerical feature vectors suitable for machine learning.
    
    The extractor maintains a vocabulary of known categories, strategies, and parameters
    to ensure consistent feature vector dimensions across different methods.
    
    Example:
        >>> extractor = FeatureExtractor()
        >>> features = extractor.parse_method_id('vad_aggressive_threshold_0.3')
        >>> features.category
        'vad'
        >>> features.strategy
        'aggressive'
        >>> features.parameters
        {'threshold': 0.3}
    """
    
    def __init__(self):
        """Initialize the feature extractor with empty vocabulary."""
        self._category_vocab: Dict[str, int] = {}
        self._strategy_vocab: Dict[str, int] = {}
        self._param_name_vocab: Dict[str, int] = {}
        self._param_value_vocab: Dict[str, int] = {}
        self._max_param_slots: int = 10  # Maximum number of parameter slots
        self._fitted = False
    
    def parse_method_id(self, method_id: str) -> MethodFeatures:
        """Parse a method identifier into structured features.
        
        Parses method identifiers in the format 'category_strategy_param1_val1_...'
        and extracts category, strategy, and parameters.
        
        Args:
            method_id: The method identifier string to parse.
        
        Returns:
            MethodFeatures object containing parsed components.
        
        Example:
            >>> extractor = FeatureExtractor()
            >>> features = extractor.parse_method_id('vad_aggressive_threshold_0.3')
            >>> features.category
            'vad'
            >>> features.strategy
            'aggressive'
            >>> features.parameters
            {'threshold': 0.3}
        """
        if not method_id:
            return MethodFeatures(
                category='unknown',
                strategy='unknown',
                parameters={},
                feature_vector=[],
                method_id=method_id
            )
        
        # Split by underscore
        parts = method_id.split('_')
        
        if len(parts) < 2:
            # Handle edge case: single part identifier
            return MethodFeatures(
                category=parts[0] if parts else 'unknown',
                strategy='default',
                parameters={},
                feature_vector=[],
                method_id=method_id
            )
        
        category = parts[0]
        strategy = parts[1]
        
        # Parse parameters (param_value pairs)
        parameters: Dict[str, Any] = {}
        i = 2
        while i + 1 < len(parts):
            param_name = parts[i]
            param_value_str = parts[i + 1]
            
            # Try to convert to appropriate type
            param_value = self._convert_value(param_value_str)
            parameters[param_name] = param_value
            
            i += 2
        
        return MethodFeatures(
            category=category,
            strategy=strategy,
            parameters=parameters,
            feature_vector=[],  # Will be populated by extract_features
            method_id=method_id
        )
    
    def _convert_value(self, value_str: str) -> Union[float, int, str, bool]:
        """Convert a string value to appropriate type.
        
        Attempts to convert the string to: float, int, bool (true/false),
        or keeps as string if no conversion is possible.
        
        Args:
            value_str: The string value to convert.
        
        Returns:
            Converted value as float, int, bool, or string.
        """
        # Check for boolean values
        lower_val = value_str.lower()
        if lower_val in ('true', 'yes', 'on', 'enabled'):
            return True
        if lower_val in ('false', 'no', 'off', 'disabled'):
            return False
        
        # Try integer conversion
        try:
            return int(value_str)
        except ValueError:
            pass
        
        # Try float conversion
        try:
            return float(value_str)
        except ValueError:
            pass
        
        # Return as string
        return value_str
    
    def fit(self, method_ids: List[str]) -> 'FeatureExtractor':
        """Fit the extractor to a set of method IDs.
        
        Builds vocabulary from categories, strategies, and parameters
        to ensure consistent feature vector dimensions.
        
        Args:
            method_ids: List of method identifiers to fit on.
        
        Returns:
            Self for method chaining.
        
        Example:
            >>> extractor = FeatureExtractor()
            >>> extractor.fit(['vad_aggressive_threshold_0.3', 
            ...              'denoise_standard_strength_0.5'])
        """
        categories = set()
        strategies = set()
        param_names = set()
        param_values = set()
        max_params = 0
        
        for method_id in method_ids:
            features = self.parse_method_id(method_id)
            categories.add(features.category)
            strategies.add(features.strategy)
            
            param_count = len(features.parameters)
            if param_count > max_params:
                max_params = param_count
            
            for name, value in features.parameters.items():
                param_names.add(name)
                param_values.add(str(value))
        
        # Build vocabularies with consistent ordering
        self._category_vocab = {cat: i for i, cat in enumerate(sorted(categories))}
        self._strategy_vocab = {strat: i for i, strat in enumerate(sorted(strategies))}
        self._param_name_vocab = {name: i for i, name in enumerate(sorted(param_names))}
        self._param_value_vocab = {val: i for i, val in enumerate(sorted(param_values))}
        self._max_param_slots = max(max_params, self._max_param_slots)
        self._fitted = True
        
        return self
    
    def extract_features(self, method_id: str) -> MethodFeatures:
        """Extract numerical features from a method identifier.
        
        Converts a method identifier into a normalized numerical feature vector
        suitable for machine learning. Must call fit() first or extractor
        will auto-fit on single sample.
        
        Args:
            method_id: The method identifier to extract features from.
        
        Returns:
            MethodFeatures with populated feature_vector.
        
        Example:
            >>> extractor = FeatureExtractor()
            >>> extractor.fit(['vad_aggressive_threshold_0.3'])
            >>> features = extractor.extract_features('vad_aggressive_threshold_0.3')
            >>> len(features.feature_vector) > 0
            True
        """
        features = self.parse_method_id(method_id)
        
        # Auto-fit if not fitted
        if not self._fitted:
            self.fit([method_id])
        
        # Build feature vector
        vector: List[float] = []
        
        # One-hot encode category
        cat_vector = [0.0] * len(self._category_vocab)
        if features.category in self._category_vocab:
            cat_vector[self._category_vocab[features.category]] = 1.0
        vector.extend(cat_vector)
        
        # One-hot encode strategy
        strat_vector = [0.0] * len(self._strategy_vocab)
        if features.strategy in self._strategy_vocab:
            strat_vector[self._strategy_vocab[features.strategy]] = 1.0
        vector.extend(strat_vector)
        
        # Encode parameters as normalized values
        param_values: List[float] = []
        for name, value in features.parameters.items():
            # Encode parameter name
            name_code = self._param_name_vocab.get(name, -1)
            if name_code >= 0:
                # Normalize name code
                name_normalized = name_code / max(len(self._param_name_vocab), 1)
                param_values.append(name_normalized)
            else:
                param_values.append(0.0)
            
            # Encode parameter value
            if isinstance(value, (int, float)):
                # Normalize numeric values to [-1, 1] range
                # Assuming most audio parameters are in [0, 1] or [0, 100] range
                if isinstance(value, float) and 0.0 <= value <= 1.0:
                    param_values.append(value * 2 - 1)  # Scale to [-1, 1]
                elif 0 <= value <= 100:
                    param_values.append(value / 50 - 1)  # Scale to [-1, 1]
                else:
                    param_values.append(max(-1.0, min(1.0, value / 100)))
            elif isinstance(value, bool):
                param_values.append(1.0 if value else -1.0)
            else:
                # String value - use vocabulary
                val_code = self._param_value_vocab.get(str(value), 0)
                val_normalized = val_code / max(len(self._param_value_vocab), 1)
                param_values.append(val_normalized * 2 - 1)
        
        # Pad or truncate to fixed length
        target_length = self._max_param_slots * 2  # name + value for each slot
        while len(param_values) < target_length:
            param_values.append(0.0)
        param_values = param_values[:target_length]
        
        vector.extend(param_values)
        
        features.feature_vector = vector
        return features
    
    def extract_batch(self, method_ids: List[str]) -> List[MethodFeatures]:
        """Extract features from multiple method identifiers.
        
        Args:
            method_ids: List of method identifiers.
        
        Returns:
            List of MethodFeatures with populated feature vectors.
        """
        # Fit on all method IDs first
        self.fit(method_ids)
        
        # Extract features for each
        return [self.extract_features(mid) for mid in method_ids]
    
    def similarity(
        self,
        features_a: MethodFeatures,
        features_b: MethodFeatures
    ) -> float:
        """Calculate cosine similarity between two method features.
        
        Uses cosine similarity to measure how similar two method
        configurations are based on their feature vectors.
        
        Args:
            features_a: First MethodFeatures object.
            features_b: Second MethodFeatures object.
        
        Returns:
            Cosine similarity score between 0.0 and 1.0.
        
        Example:
            >>> extractor = FeatureExtractor()
            >>> extractor.fit(['vad_aggressive_threshold_0.3', 
            ...              'vad_standard_threshold_0.4'])
            >>> a = extractor.extract_features('vad_aggressive_threshold_0.3')
            >>> b = extractor.extract_features('vad_standard_threshold_0.4')
            >>> sim = extractor.similarity(a, b)
            >>> 0.0 <= sim <= 1.0
            True
        """
        vec_a = features_a.feature_vector
        vec_b = features_b.feature_vector
        
        if not vec_a or not vec_b:
            return 0.0
        
        # Ensure same length
        max_len = max(len(vec_a), len(vec_b))
        vec_a = vec_a + [0.0] * (max_len - len(vec_a))
        vec_b = vec_b + [0.0] * (max_len - len(vec_b))
        
        if SKLEARN_AVAILABLE and np is not None:
            # Use sklearn's cosine_similarity
            a_array = np.array(vec_a).reshape(1, -1)
            b_array = np.array(vec_b).reshape(1, -1)
            sim = cosine_similarity(a_array, b_array)[0, 0]
            return float(max(0.0, min(1.0, sim)))
        else:
            # Pure Python implementation
            dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
            norm_a = math.sqrt(sum(a * a for a in vec_a))
            norm_b = math.sqrt(sum(b * b for b in vec_b))
            
            if norm_a == 0 or norm_b == 0:
                return 0.0
            
            sim = dot_product / (norm_a * norm_b)
            return max(0.0, min(1.0, sim))
    
    def find_similar_methods(
        self,
        method_id: str,
        candidate_ids: List[str],
        threshold: float = 0.8
    ) -> List[Tuple[str, float]]:
        """Find methods similar to a reference method.
        
        Calculates similarity between the reference method and all candidates,
        returning those that meet the similarity threshold.
        
        Args:
            method_id: The reference method identifier.
            candidate_ids: List of candidate method identifiers to compare.
            threshold: Minimum similarity score (0.0 to 1.0) to include.
        
        Returns:
            List of tuples (method_id, similarity_score) sorted by similarity.
        
        Example:
            >>> extractor = FeatureExtractor()
            >>> candidates = ['vad_aggressive_threshold_0.3', 
            ...               'vad_standard_threshold_0.35',
            ...               'denoise_gentle_strength_0.5']
            >>> similar = extractor.find_similar_methods(
            ...     'vad_aggressive_threshold_0.3', candidates, threshold=0.7)
        """
        if not candidate_ids:
            return []
        
        # Fit on all IDs
        all_ids = [method_id] + candidate_ids
        self.fit(all_ids)
        
        # Extract features for reference
        ref_features = self.extract_features(method_id)
        
        # Compare with candidates
        similar: List[Tuple[str, float]] = []
        for candidate_id in candidate_ids:
            if candidate_id == method_id:
                continue
            
            cand_features = self.extract_features(candidate_id)
            sim = self.similarity(ref_features, cand_features)
            
            if sim >= threshold:
                similar.append((candidate_id, sim))
        
        # Sort by similarity descending
        similar.sort(key=lambda x: x[1], reverse=True)
        return similar
    
    def cluster_methods(
        self,
        method_ids: List[str],
        n_clusters: int = 5
    ) -> Dict[int, List[str]]:
        """Cluster methods using K-Means algorithm.
        
        Groups similar methods into clusters based on their feature vectors
        using the K-Means clustering algorithm from scikit-learn.
        
        Args:
            method_ids: List of method identifiers to cluster.
            n_clusters: Number of clusters to create. Defaults to 5.
                Automatically adjusted if fewer methods than clusters.
        
        Returns:
            Dictionary mapping cluster index to list of method IDs.
        
        Raises:
            ValueError: If method_ids is empty or sklearn is not available.
        
        Example:
            >>> extractor = FeatureExtractor()
            >>> methods = ['vad_aggressive_threshold_0.3',
            ...            'vad_standard_threshold_0.4',
            ...            'denoise_gentle_strength_0.5']
            >>> clusters = extractor.cluster_methods(methods, n_clusters=2)
        """
        if not method_ids:
            raise ValueError("Cannot cluster empty list of method IDs")
        
        if not SKLEARN_AVAILABLE or np is None:
            raise ValueError("sklearn is required for clustering. Install with: pip install scikit-learn")
        
        # Adjust n_clusters if necessary
        n_clusters = min(n_clusters, len(method_ids))
        if n_clusters < 1:
            n_clusters = 1
        
        # Extract features
        features_list = self.extract_batch(method_ids)
        
        # Build feature matrix
        feature_matrix = np.array([f.feature_vector for f in features_list])
        
        # Run K-Means
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(feature_matrix)
        
        # Group by cluster
        clusters: Dict[int, List[str]] = defaultdict(list)
        for method_id, label in zip(method_ids, labels):
            clusters[int(label)].append(method_id)
        
        return dict(clusters)
    
    def get_feature_names(self) -> List[str]:
        """Get human-readable names for feature vector components.
        
        Returns:
            List of feature names corresponding to feature vector indices.
        """
        names: List[str] = []
        
        # Category names
        for cat in sorted(self._category_vocab.keys(), 
                          key=lambda x: self._category_vocab[x]):
            names.append(f"cat_{cat}")
        
        # Strategy names
        for strat in sorted(self._strategy_vocab.keys(),
                           key=lambda x: self._strategy_vocab[x]):
            names.append(f"strat_{strat}")
        
        # Parameter slots
        for i in range(self._max_param_slots):
            names.append(f"param_{i}_name")
            names.append(f"param_{i}_value")
        
        return names
    
    @property
    def feature_dimension(self) -> int:
        """Get the dimension of feature vectors.
        
        Returns:
            Length of feature vectors produced by this extractor.
        """
        if not self._fitted:
            return 0
        return (len(self._category_vocab) + 
                len(self._strategy_vocab) + 
                self._max_param_slots * 2)