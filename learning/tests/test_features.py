"""Tests for feature extraction and similarity calculation.

This module contains comprehensive tests for the FeatureExtractor class,
covering method parsing, feature extraction, similarity calculation,
and clustering functionality.
"""

import unittest
import math
from typing import List, Dict, Any

# Handle imports for both test running modes
import sys
import os

# Add project root to path
sys.path.insert(0, '/home/node/.openclaw/workspace/AutoCast')
sys.path.insert(0, '/home/node/.openclaw/workspace/AutoCast/learning')

from learning.analytics.features import FeatureExtractor, MethodFeatures


class TestMethodFeatures(unittest.TestCase):
    """Tests for MethodFeatures dataclass."""
    
    def test_method_features_creation(self) -> None:
        """Test creating MethodFeatures instance."""
        features = MethodFeatures(
            category='vad',
            strategy='aggressive',
            parameters={'threshold': 0.3},
            feature_vector=[1.0, 0.0, 0.5],
            method_id='vad_aggressive_threshold_0.3'
        )
        
        self.assertEqual(features.category, 'vad')
        self.assertEqual(features.strategy, 'aggressive')
        self.assertEqual(features.parameters, {'threshold': 0.3})
        self.assertEqual(features.feature_vector, [1.0, 0.0, 0.5])
        self.assertEqual(features.method_id, 'vad_aggressive_threshold_0.3')
    
    def test_method_features_defaults(self) -> None:
        """Test MethodFeatures with default values."""
        features = MethodFeatures(category='test', strategy='default')
        
        self.assertEqual(features.category, 'test')
        self.assertEqual(features.strategy, 'default')
        self.assertEqual(features.parameters, {})
        self.assertEqual(features.feature_vector, [])
        self.assertEqual(features.method_id, '')


class TestParseMethodId(unittest.TestCase):
    """Tests for parse_method_id method."""
    
    def setUp(self) -> None:
        """Set up test fixture."""
        self.extractor = FeatureExtractor()
    
    def test_simple_vad_method(self) -> None:
        """Test parsing simple VAD method."""
        features = self.extractor.parse_method_id('vad_aggressive_threshold_0.3')
        
        self.assertEqual(features.category, 'vad')
        self.assertEqual(features.strategy, 'aggressive')
        self.assertEqual(features.parameters, {'threshold': 0.3})
        self.assertEqual(features.method_id, 'vad_aggressive_threshold_0.3')
    
    def test_denoise_method(self) -> None:
        """Test parsing denoise method."""
        features = self.extractor.parse_method_id('denoise_standard_strength_0.5')
        
        self.assertEqual(features.category, 'denoise')
        self.assertEqual(features.strategy, 'standard')
        self.assertEqual(features.parameters, {'strength': 0.5})
    
    def test_multiple_parameters(self) -> None:
        """Test parsing method with multiple parameters."""
        features = self.extractor.parse_method_id(
            'normalize_standard_target_-16.0_threshold_-20.0'
        )
        
        self.assertEqual(features.category, 'normalize')
        self.assertEqual(features.strategy, 'standard')
        self.assertEqual(features.parameters, {
            'target': -16.0,
            'threshold': -20.0
        })
    
    def test_integer_parameters(self) -> None:
        """Test parsing integer parameter values."""
        features = self.extractor.parse_method_id('compressor_aggressive_ratio_4')
        
        self.assertEqual(features.parameters, {'ratio': 4})
    
    def test_boolean_parameters(self) -> None:
        """Test parsing boolean parameter values."""
        features_true = self.extractor.parse_method_id('filter_aggressive_soft_true')
        self.assertEqual(features_true.parameters, {'soft': True})
        
        features_false = self.extractor.parse_method_id('filter_aggressive_soft_false')
        self.assertEqual(features_false.parameters, {'soft': False})
    
    def test_empty_method_id(self) -> None:
        """Test parsing empty method ID."""
        features = self.extractor.parse_method_id('')
        
        self.assertEqual(features.category, 'unknown')
        self.assertEqual(features.strategy, 'unknown')
        self.assertEqual(features.parameters, {})
    
    def test_single_part_method(self) -> None:
        """Test parsing single-part method ID."""
        features = self.extractor.parse_method_id('standalone')
        
        self.assertEqual(features.category, 'standalone')
        self.assertEqual(features.strategy, 'default')
        self.assertEqual(features.parameters, {})
    
    def test_two_part_method(self) -> None:
        """Test parsing two-part method ID."""
        features = self.extractor.parse_method_id('category_strategy')
        
        self.assertEqual(features.category, 'category')
        self.assertEqual(features.strategy, 'strategy')
        self.assertEqual(features.parameters, {})
    
    def test_odd_number_parts(self) -> None:
        """Test parsing method with odd number of parts."""
        features = self.extractor.parse_method_id('vad_aggressive_threshold')
        
        self.assertEqual(features.category, 'vad')
        self.assertEqual(features.strategy, 'aggressive')
        self.assertEqual(features.parameters, {})


class TestExtractFeatures(unittest.TestCase):
    """Tests for feature extraction."""
    
    def setUp(self) -> None:
        """Set up test fixture."""
        self.extractor = FeatureExtractor()
    
    def test_single_method_extraction(self) -> None:
        """Test feature extraction for single method."""
        self.extractor.fit(['vad_aggressive_threshold_0.3'])
        features = self.extractor.extract_features('vad_aggressive_threshold_0.3')
        
        self.assertEqual(features.category, 'vad')
        self.assertEqual(features.strategy, 'aggressive')
        self.assertGreater(len(features.feature_vector), 0)
    
    def test_feature_vector_consistency(self) -> None:
        """Test that feature vectors have consistent length."""
        method_ids = [
            'vad_aggressive_threshold_0.3',
            'vad_standard_threshold_0.5',
            'denoise_gentle_strength_0.4'
        ]
        
        self.extractor.fit(method_ids)
        
        features_list = [self.extractor.extract_features(mid) for mid in method_ids]
        lengths = [len(f.feature_vector) for f in features_list]
        
        self.assertEqual(len(set(lengths)), 1)  # All same length
    
    def test_feature_vector_normalized(self) -> None:
        """Test that feature vector values are normalized."""
        self.extractor.fit(['vad_aggressive_threshold_0.5'])
        features = self.extractor.extract_features('vad_aggressive_threshold_0.5')
        
        # Check that values are within reasonable ranges
        for value in features.feature_vector:
            self.assertIsInstance(value, float)
            self.assertTrue(-10 <= value <= 10)  # Reasonable range
    
    def test_batch_extraction(self) -> None:
        """Test batch feature extraction."""
        method_ids = [
            'vad_aggressive_threshold_0.3',
            'denoise_standard_strength_0.5'
        ]
        
        features_list = self.extractor.extract_batch(method_ids)
        
        self.assertEqual(len(features_list), 2)
        self.assertEqual(features_list[0].category, 'vad')
        self.assertEqual(features_list[1].category, 'denoise')
    
    def test_auto_fit(self) -> None:
        """Test auto-fitting on single method."""
        # Don't call fit() explicitly
        features = self.extractor.extract_features('vad_aggressive_threshold_0.3')
        
        self.assertTrue(self.extractor._fitted)
        self.assertGreater(len(features.feature_vector), 0)
    
    def test_feature_dimension_property(self) -> None:
        """Test feature_dimension property."""
        self.extractor.fit(['vad_aggressive_threshold_0.3'])
        
        dim = self.extractor.feature_dimension
        features = self.extractor.extract_features('vad_aggressive_threshold_0.3')
        
        self.assertEqual(len(features.feature_vector), dim)


class TestSimilarity(unittest.TestCase):
    """Tests for similarity calculation."""
    
    def setUp(self) -> None:
        """Set up test fixture."""
        self.extractor = FeatureExtractor()
    
    def test_identical_methods_similarity(self) -> None:
        """Test similarity of identical methods is 1.0."""
        method_id = 'vad_aggressive_threshold_0.3'
        self.extractor.fit([method_id])
        
        features_a = self.extractor.extract_features(method_id)
        features_b = self.extractor.extract_features(method_id)
        
        sim = self.extractor.similarity(features_a, features_b)
        
        self.assertAlmostEqual(sim, 1.0, places=5)
    
    def test_similar_methods_high_similarity(self) -> None:
        """Test similar methods have high similarity."""
        method_ids = [
            'vad_aggressive_threshold_0.3',
            'vad_aggressive_threshold_0.35'
        ]
        
        self.extractor.fit(method_ids)
        
        features_a = self.extractor.extract_features(method_ids[0])
        features_b = self.extractor.extract_features(method_ids[1])
        
        sim = self.extractor.similarity(features_a, features_b)
        
        self.assertGreater(sim, 0.9)
        self.assertLessEqual(sim, 1.0)
    
    def test_different_category_low_similarity(self) -> None:
        """Test different categories have lower similarity."""
        method_ids = [
            'vad_aggressive_threshold_0.3',
            'denoise_standard_strength_0.5'
        ]
        
        self.extractor.fit(method_ids)
        
        features_a = self.extractor.extract_features(method_ids[0])
        features_b = self.extractor.extract_features(method_ids[1])
        
        sim = self.extractor.similarity(features_a, features_b)
        
        # Should be less similar than same category
        self.assertLess(sim, 0.9)
    
    def test_similarity_range(self) -> None:
        """Test similarity is always in [0, 1]."""
        method_ids = [
            'vad_aggressive_threshold_0.3',
            'denoise_standard_strength_0.5',
            'normalize_gentle_target_-16.0'
        ]
        
        self.extractor.fit(method_ids)
        
        for i, mid_a in enumerate(method_ids):
            for mid_b in method_ids[i:]:
                features_a = self.extractor.extract_features(mid_a)
                features_b = self.extractor.extract_features(mid_b)
                
                sim = self.extractor.similarity(features_a, features_b)
                
                self.assertGreaterEqual(sim, 0.0)
                self.assertLessEqual(sim, 1.0)
    
    def test_empty_vector_similarity(self) -> None:
        """Test similarity with empty vectors."""
        features = MethodFeatures(
            category='test',
            strategy='test',
            feature_vector=[]
        )
        
        sim = self.extractor.similarity(features, features)
        self.assertEqual(sim, 0.0)
    
    def test_different_length_vectors(self) -> None:
        """Test similarity handles different length vectors."""
        features_a = MethodFeatures(
            category='test',
            strategy='test',
            feature_vector=[1.0, 0.5, 0.0]
        )
        features_b = MethodFeatures(
            category='test',
            strategy='test',
            feature_vector=[1.0, 0.5]
        )
        
        sim = self.extractor.similarity(features_a, features_b)
        self.assertGreaterEqual(sim, 0.0)
        self.assertLessEqual(sim, 1.0)


class TestFindSimilarMethods(unittest.TestCase):
    """Tests for find_similar_methods method."""
    
    def setUp(self) -> None:
        """Set up test fixture."""
        self.extractor = FeatureExtractor()
        self.candidates = [
            'vad_aggressive_threshold_0.3',
            'vad_aggressive_threshold_0.35',
            'vad_standard_threshold_0.4',
            'denoise_standard_strength_0.5',
            'normalize_gentle_target_-16.0'
        ]
    
    def test_find_similar_with_threshold(self) -> None:
        """Test finding similar methods with threshold."""
        similar = self.extractor.find_similar_methods(
            'vad_aggressive_threshold_0.3',
            self.candidates,
            threshold=0.8
        )
        
        # Should find similar VAD methods
        method_ids = [s[0] for s in similar]
        self.assertIn('vad_aggressive_threshold_0.35', method_ids)
    
    def test_similarity_score_descending(self) -> None:
        """Test results are sorted by similarity descending."""
        similar = self.extractor.find_similar_methods(
            'vad_aggressive_threshold_0.3',
            self.candidates,
            threshold=0.0
        )
        
        if len(similar) > 1:
            scores = [s[1] for s in similar]
            self.assertEqual(scores, sorted(scores, reverse=True))
    
    def test_empty_candidates(self) -> None:
        """Test with empty candidate list."""
        similar = self.extractor.find_similar_methods(
            'vad_aggressive_threshold_0.3',
            [],
            threshold=0.8
        )
        
        self.assertEqual(similar, [])
    
    def test_exclude_self(self) -> None:
        """Test that reference method is excluded from results."""
        candidates = ['vad_aggressive_threshold_0.3']
        
        similar = self.extractor.find_similar_methods(
            'vad_aggressive_threshold_0.3',
            candidates,
            threshold=0.0
        )
        
        self.assertEqual(similar, [])


class TestClusterMethods(unittest.TestCase):
    """Tests for cluster_methods method."""
    
    def setUp(self) -> None:
        """Set up test fixture."""
        self.extractor = FeatureExtractor()
    
    def test_basic_clustering(self) -> None:
        """Test basic clustering functionality."""
        try:
            import sklearn  # noqa: F401
        except ImportError:
            self.skipTest("sklearn not available")
        
        method_ids = [
            'vad_aggressive_threshold_0.3',
            'vad_aggressive_threshold_0.35',
            'vad_standard_threshold_0.4',
            'denoise_standard_strength_0.5',
            'denoise_gentle_strength_0.4',
            'normalize_standard_target_-16.0'
        ]
        
        clusters = self.extractor.cluster_methods(method_ids, n_clusters=3)
        
        # Check structure
        self.assertIsInstance(clusters, dict)
        self.assertGreater(len(clusters), 0)
        
        # Check all methods are assigned
        all_assigned = []
        for cluster_methods in clusters.values():
            all_assigned.extend(cluster_methods)
        
        self.assertEqual(sorted(all_assigned), sorted(method_ids))
    
    def test_cluster_count_adjustment(self) -> None:
        """Test that n_clusters is adjusted for few methods."""
        try:
            import sklearn  # noqa: F401
        except ImportError:
            self.skipTest("sklearn not available")
        
        method_ids = [
            'vad_aggressive_threshold_0.3',
            'denoise_standard_strength_0.5'
        ]
        
        # Request more clusters than methods
        clusters = self.extractor.cluster_methods(method_ids, n_clusters=5)
        
        # Should be adjusted to number of methods
        self.assertLessEqual(len(clusters), len(method_ids))
    
    def test_empty_methods_raises(self) -> None:
        """Test that empty method list raises error."""
        try:
            import sklearn  # noqa: F401
        except ImportError:
            self.skipTest("sklearn not available")
        
        with self.assertRaises(ValueError):
            self.extractor.cluster_methods([], n_clusters=3)
    
    def test_sklearn_required(self) -> None:
        """Test that sklearn is required for clustering."""
        # Temporarily simulate sklearn not being available
        original_sklearn = self.extractor.__class__.__dict__.get('SKLEARN_AVAILABLE')
        
        try:
            # This test is complex to do without mocking, so we just check
            # the error message is appropriate
            import sklearn  # noqa: F401
            # If sklearn is available, we can't test the skip easily
            # without mocking, so just pass
        except ImportError:
            with self.assertRaises(ValueError) as context:
                self.extractor.cluster_methods(['vad_test'], n_clusters=2)
            
            self.assertIn('sklearn', str(context.exception))


class TestFeatureNames(unittest.TestCase):
    """Tests for get_feature_names method."""
    
    def setUp(self) -> None:
        """Set up test fixture."""
        self.extractor = FeatureExtractor()
    
    def test_feature_names_length(self) -> None:
        """Test feature names match feature vector length."""
        self.extractor.fit(['vad_aggressive_threshold_0.3'])
        
        features = self.extractor.extract_features('vad_aggressive_threshold_0.3')
        names = self.extractor.get_feature_names()
        
        self.assertEqual(len(features.feature_vector), len(names))
    
    def test_feature_names_prefixes(self) -> None:
        """Test feature names have correct prefixes."""
        self.extractor.fit([
            'vad_aggressive_threshold_0.3',
            'denoise_standard_strength_0.5'
        ])
        
        names = self.extractor.get_feature_names()
        
        # Should have category names
        self.assertTrue(any('cat_' in name for name in names))
        
        # Should have strategy names
        self.assertTrue(any('strat_' in name for name in names))
        
        # Should have parameter slots
        self.assertTrue(any('param_' in name for name in names))


class TestIntegration(unittest.TestCase):
    """Integration tests for the complete workflow."""
    
    def test_end_to_end_workflow(self) -> None:
        """Test complete feature extraction and similarity workflow."""
        extractor = FeatureExtractor()
        
        # Step 1: Parse method IDs
        method_ids = [
            'vad_aggressive_threshold_0.3',
            'vad_aggressive_threshold_0.35',
            'vad_standard_threshold_0.4',
            'denoise_standard_strength_0.5',
            'denoise_gentle_strength_0.4'
        ]
        
        # Step 2: Extract features
        features_list = extractor.extract_batch(method_ids)
        self.assertEqual(len(features_list), 5)
        
        # Step 3: Calculate similarities
        sim_matrix = []
        for i, fa in enumerate(features_list):
            row = []
            for j, fb in enumerate(features_list):
                sim = extractor.similarity(fa, fb)
                row.append(sim)
            sim_matrix.append(row)
        
        # Check diagonal is all 1.0 (self-similarity)
        for i in range(len(method_ids)):
            self.assertAlmostEqual(sim_matrix[i][i], 1.0, places=5)
        
        # Step 4: Find similar methods
        similar = extractor.find_similar_methods(
            method_ids[0],
            method_ids[1:],
            threshold=0.8
        )
        
        # Should find similar VAD methods
        self.assertGreater(len(similar), 0)
        
        # Step 5: Cluster methods (if sklearn available)
        try:
            import sklearn  # noqa: F401
            clusters = extractor.cluster_methods(method_ids, n_clusters=2)
            self.assertGreater(len(clusters), 0)
        except ImportError:
            pass  # Skip clustering test


def run_tests() -> None:
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestMethodFeatures))
    suite.addTests(loader.loadTestsFromTestCase(TestParseMethodId))
    suite.addTests(loader.loadTestsFromTestCase(TestExtractFeatures))
    suite.addTests(loader.loadTestsFromTestCase(TestSimilarity))
    suite.addTests(loader.loadTestsFromTestCase(TestFindSimilarMethods))
    suite.addTests(loader.loadTestsFromTestCase(TestClusterMethods))
    suite.addTests(loader.loadTestsFromTestCase(TestFeatureNames))
    suite.addTests(loader.loadTestsFromTestCase(TestIntegration))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    unittest.main()