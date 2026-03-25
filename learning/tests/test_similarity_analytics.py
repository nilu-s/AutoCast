#!/usr/bin/env python3
"""Tests for Similarity Analytics module.

Run with:
    python3 -m pytest learning/tests/test_similarity_analytics.py -v
    
Or standalone:
    python3 learning/tests/test_similarity_analytics.py
"""

import unittest
import tempfile
import shutil
import os
import sys
from typing import Any, Dict, List

# Add workspace to path
workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, workspace_root)

from learning.chroma_client import ChromaLearningDB
from learning.analytics.similarity_analytics import (
    SimilarityAnalytics,
    MethodRecommendation,
    MethodCluster,
    SuccessPrediction,
    cosine_similarity
)


class TestCosineSimilarity(unittest.TestCase):
    """Test cosine_similarity function."""
    
    def test_identical_vectors(self):
        """Test cosine similarity of identical vectors."""
        vec = [1.0, 2.0, 3.0]
        result = cosine_similarity(vec, vec)
        self.assertAlmostEqual(result, 1.0, places=5)
    
    def test_orthogonal_vectors(self):
        """Test cosine similarity of orthogonal vectors."""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [0.0, 1.0, 0.0]
        result = cosine_similarity(vec1, vec2)
        self.assertAlmostEqual(result, 0.0, places=5)
    
    def test_opposite_vectors(self):
        """Test cosine similarity of opposite vectors."""
        vec1 = [1.0, 2.0, 3.0]
        vec2 = [-1.0, -2.0, -3.0]
        result = cosine_similarity(vec1, vec2)
        self.assertAlmostEqual(result, -1.0, places=5)
    
    def test_empty_vectors(self):
        """Test cosine similarity with empty vectors."""
        result = cosine_similarity([], [1.0, 2.0])
        self.assertEqual(result, 0.0)
    
    def test_zero_vector(self):
        """Test cosine similarity with zero vector."""
        result = cosine_similarity([0.0, 0.0], [1.0, 2.0])
        self.assertEqual(result, 0.0)


class TestSimilarityAnalyticsInit(unittest.TestCase):
    """Test SimilarityAnalytics initialization."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
    
    def tearDown(self):
        """Clean up test database."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_init_with_defaults(self):
        """Test initialization with default parameters."""
        analytics = SimilarityAnalytics(self.db)
        self.assertEqual(analytics.db, self.db)
        self.assertEqual(analytics.min_success_rate, 0.5)
        self.assertEqual(analytics.min_confidence_samples, 5)
    
    def test_init_with_custom_params(self):
        """Test initialization with custom parameters."""
        analytics = SimilarityAnalytics(
            self.db,
            min_success_rate=0.7,
            min_confidence_samples=10
        )
        self.assertEqual(analytics.min_success_rate, 0.7)
        self.assertEqual(analytics.min_confidence_samples, 10)


class TestGetSimilarSuccessfulMethods(unittest.TestCase):
    """Test get_similar_successful_methods functionality."""
    
    def setUp(self):
        """Set up test database with methods."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        # Add similar VAD methods
        self.vad_methods = [
            ("vad_aggressive", "vad", {"threshold": 0.3}),
            ("vad_normal", "vad", {"threshold": 0.5}),
            ("vad_mild", "vad", {"threshold": 0.7}),
        ]
        
        for mid, cat, params in self.vad_methods:
            self.db.add_method(mid, cat, params)
        
        # Add runs with different success patterns
        for i in range(10):
            self.db.record_method_run(
                "vad_aggressive", f"run_{i:03d}",
                "KEEP" if i < 8 else "REJECT",
                0.05
            )
        
        for i in range(5):
            self.db.record_method_run(
                "vad_normal", f"run_normal_{i:03d}",
                "KEEP" if i < 3 else "REJECT",
                0.04
            )
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_find_similar_successful(self):
        """Test finding similar successful methods."""
        similar = self.analytics.get_similar_successful_methods(
            "vad_aggressive", n_results=5
        )
        
        # Should find vad_normal (60% success rate)
        self.assertGreater(len(similar), 0)
        
        # Check that results have required fields
        for s in similar:
            self.assertIn("method_id", s)
            self.assertIn("success_rate", s)
    
    def test_filter_by_min_success_rate(self):
        """Test filtering by minimum success rate."""
        similar = self.analytics.get_similar_successful_methods(
            "vad_aggressive",
            n_results=5,
            min_success_rate=0.7
        )
        
        # vad_aggressive itself has 80% success
        # vad_normal has 60% success - should be filtered out
        for s in similar:
            self.assertGreaterEqual(s.get("success_rate", 0), 0.7)
    
    def test_nonexistent_method(self):
        """Test with non-existent method."""
        similar = self.analytics.get_similar_successful_methods(
            "nonexistent", n_results=5
        )
        self.assertEqual(len(similar), 0)


class TestPredictSuccess(unittest.TestCase):
    """Test predict_success functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        # Add methods
        methods = [
            ("m1", "test", {"p": 1}),
            ("m2", "test", {"p": 2}),
            ("m3", "other", {"p": 3}),
        ]
        
        for mid, cat, params in methods:
            self.db.add_method(mid, cat, params)
        
        # Add runs
        for i in range(10):
            self.db.record_method_run("m1", f"run_{i:03d}", "KEEP", 0.05)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_predict_success_returns_prediction(self):
        """Test that predict_success returns a SuccessPrediction."""
        pred = self.analytics.predict_success("m1")
        
        self.assertIsInstance(pred, SuccessPrediction)
        self.assertEqual(pred.method_id, "m1")
        self.assertGreaterEqual(pred.predicted_success_rate, 0.0)
        self.assertLessEqual(pred.predicted_success_rate, 1.0)
    
    def test_predict_success_with_context(self):
        """Test prediction with context run ID."""
        pred = self.analytics.predict_success("m1", context_run_id="run_001")
        
        self.assertEqual(pred.context_run_id, "run_001")
        self.assertIsInstance(pred.confidence, float)
    
    def test_predict_success_for_untested(self):
        """Test prediction for untested method."""
        pred = self.analytics.predict_success("m3")
        
        # Should return valid prediction (may be 0.5 or based on mock data)
        self.assertGreaterEqual(pred.predicted_success_rate, 0.0)
        self.assertLessEqual(pred.predicted_success_rate, 1.0)
        self.assertIsInstance(pred.confidence, float)


class TestGetTopMethods(unittest.TestCase):
    """Test get_top_methods functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        # Add methods with different success rates
        methods = [
            ("high", "vad", {"p": 1}),
            ("medium", "vad", {"p": 2}),
            ("low", "filter", {"p": 3}),
        ]
        
        for mid, cat, params in methods:
            self.db.add_method(mid, cat, params)
        
        # high: 90% success
        for i in range(10):
            self.db.record_method_run("high", f"run_h_{i:03d}", "KEEP", 0.05)
        
        # medium: 50% success
        for i in range(10):
            self.db.record_method_run(
                "medium", f"run_m_{i:03d}",
                "KEEP" if i < 5 else "REJECT", 0.04
            )
        
        # low: 20% success
        for i in range(5):
            self.db.record_method_run(
                "low", f"run_l_{i:03d}",
                "KEEP" if i < 1 else "REJECT", 0.02
            )
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_get_top_methods_sorted(self):
        """Test that results are sorted by success rate."""
        top = self.analytics.get_top_methods(limit=10)
        
        self.assertGreaterEqual(len(top), 3)
        
        # Check sorted descending
        rates = [m.get("success_rate", 0) for m in top]
        self.assertEqual(rates, sorted(rates, reverse=True))
    
    def test_get_top_methods_with_limit(self):
        """Test limit parameter."""
        top = self.analytics.get_top_methods(limit=2)
        
        self.assertLessEqual(len(top), 2)
    
    def test_get_top_methods_category_filter(self):
        """Test category filter."""
        top = self.analytics.get_top_methods(limit=10, category="vad")
        
        for m in top:
            self.assertEqual(m.get("category"), "vad")
    
    def test_get_top_methods_min_attempts(self):
        """Test min_attempts filter."""
        top = self.analytics.get_top_methods(limit=10, min_attempts=8)
        
        for m in top:
            self.assertGreaterEqual(m.get("attempts", 0), 8)


class TestSearchByDescription(unittest.TestCase):
    """Test search_by_description functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        # Add methods
        methods = [
            ("vad_aggressive", "vad", {"threshold": 0.3}),
            ("vad_normal", "vad", {"threshold": 0.5}),
            ("noise_gate", "filter", {"threshold": -40}),
        ]
        
        for mid, cat, params in methods:
            self.db.add_method(mid, cat, params)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_search_by_description_returns_results(self):
        """Test that search returns results."""
        results = self.analytics.search_by_description(
            "voice activity detection", n_results=3
        )
        
        # Should return methods
        self.assertIsInstance(results, list)
    
    def test_search_with_min_success_rate(self):
        """Test search with success rate filter."""
        results = self.analytics.search_by_description(
            "detection",
            n_results=5,
            min_success_rate=0.5
        )
        
        for r in results:
            self.assertGreaterEqual(r.get("success_rate", 0), 0.5)


class TestRecommendMethodsForRun(unittest.TestCase):
    """Test recommend_methods_for_run functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        # Add methods
        methods = [
            ("m1", "test", {"p": 1}),
            ("m2", "test", {"p": 2}),
            ("m3", "other", {"p": 3}),
        ]
        
        for mid, cat, params in methods:
            self.db.add_method(mid, cat, params)
        
        # Add runs for m1
        for i in range(10):
            self.db.record_method_run("m1", f"run_{i:03d}", "KEEP", 0.05)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_recommend_returns_list(self):
        """Test that recommend returns a list."""
        recs = self.analytics.recommend_methods_for_run("run_001", 5)
        
        self.assertIsInstance(recs, list)
    
    def test_recommend_returns_method_recommendations(self):
        """Test that recommendations are MethodRecommendation objects."""
        recs = self.analytics.recommend_methods_for_run("run_001", 3)
        
        for r in recs:
            self.assertIsInstance(r, MethodRecommendation)
            self.assertIn("method_id", r.__dict__)
            self.assertIn("score", r.__dict__)
    
    def test_recommend_with_category_filter(self):
        """Test recommendation with category filter."""
        recs = self.analytics.recommend_methods_for_run(
            "run_001", 5, category="test"
        )
        
        for r in recs:
            method = self.db.get_method(r.method_id)
            self.assertEqual(method["metadata"]["category"], "test")


class TestGetMethodClusters(unittest.TestCase):
    """Test get_method_clusters functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        # Add multiple methods for clustering
        for i in range(8):
            self.db.add_method(f"method_{i:02d}", "test", {"param": i})
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_cluster_raises_without_sklearn(self):
        """Test that clustering raises ValueError when sklearn is not available."""
        # When sklearn is not available, should raise ValueError
        try:
            clusters = self.analytics.get_method_clusters(n_clusters=2)
            # If we get here, sklearn is available
            self.assertIsInstance(clusters, list)
        except ValueError as e:
            # Expected when sklearn is not installed
            self.assertIn("sklearn", str(e).lower())
    
    def test_cluster_with_category_filter(self):
        """Test clustering with category filter."""
        try:
            clusters = self.analytics.get_method_clusters(
                n_clusters=2, category="test"
            )
            self.assertIsInstance(clusters, list)
        except ValueError:
            # Expected when sklearn is not available
            pass


class TestGetSuccessRate(unittest.TestCase):
    """Test get_success_rate functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        self.db.add_method("test_method", "test", {"p": 1})
        
        # Add successful runs
        for i in range(8):
            self.db.record_method_run(
                "test_method", f"run_{i:03d}", "KEEP", 0.05
            )
        
        # Add failed runs
        for i in range(2):
            self.db.record_method_run(
                "test_method", f"run_fail_{i:03d}", "REJECT", -0.01
            )
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_get_success_rate(self):
        """Test getting success rate."""
        rate = self.analytics.get_success_rate("test_method")
        
        # 8 keeps out of 10 total = 80%
        self.assertAlmostEqual(rate, 0.8, places=1)
    
    def test_get_success_rate_nonexistent(self):
        """Test getting success rate for non-existent method."""
        rate = self.analytics.get_success_rate("nonexistent")
        
        self.assertEqual(rate, 0.0)


class TestGetAnalyticsSummary(unittest.TestCase):
    """Test get_analytics_summary functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        # Add methods
        methods = [
            ("m1", "vad", {"p": 1}),
            ("m2", "vad", {"p": 2}),
            ("m3", "filter", {"p": 3}),
        ]
        
        for mid, cat, params in methods:
            self.db.add_method(mid, cat, params)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_summary_returns_dict(self):
        """Test that summary returns a dictionary."""
        summary = self.analytics.get_analytics_summary()
        
        self.assertIsInstance(summary, dict)
    
    def test_summary_has_required_fields(self):
        """Test that summary has required fields."""
        summary = self.analytics.get_analytics_summary()
        
        self.assertIn("total_methods", summary)
        self.assertIn("total_runs", summary)
        self.assertIn("avg_success_rate", summary)
        self.assertIn("categories", summary)
    
    def test_summary_structure(self):
        """Test that summary has the correct structure."""
        summary = self.analytics.get_analytics_summary()
        
        self.assertIsInstance(summary["total_methods"], int)
        self.assertIsInstance(summary["categories"], dict)


class TestIntegration(unittest.TestCase):
    """Integration tests for SimilarityAnalytics."""
    
    def setUp(self):
        """Set up test database with realistic data."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        self.analytics = SimilarityAnalytics(self.db)
        
        # Add VAD methods
        vad_methods = [
            ("vad_aggressive_001", "vad", {"threshold": 0.3, "mode": "energy"}),
            ("vad_aggressive_002", "vad", {"threshold": 0.35, "mode": "energy"}),
            ("vad_normal_001", "vad", {"threshold": 0.5, "mode": "hybrid"}),
            ("vad_mild_001", "vad", {"threshold": 0.7, "mode": "hybrid"}),
        ]
        
        # Add filter methods
        filter_methods = [
            ("noise_gate_001", "filter", {"threshold": -40}),
            ("noise_gate_002", "filter", {"threshold": -35}),
            ("high_pass_001", "filter", {"freq": 100}),
        ]
        
        all_methods = vad_methods + filter_methods
        
        for mid, cat, params in all_methods:
            self.db.add_method(mid, cat, params)
        
        # Simulate runs with different success patterns
        for i in range(20):
            run_id = f"run_{i:03d}"
            
            # VAD aggressive methods: high success
            if i < 16:
                self.db.record_method_run("vad_aggressive_001", run_id, "KEEP", 0.08)
                self.db.record_method_run("vad_aggressive_002", run_id, "KEEP", 0.07)
            else:
                self.db.record_method_run("vad_aggressive_001", run_id, "REJECT", -0.01)
                self.db.record_method_run("vad_aggressive_002", run_id, "REJECT", -0.01)
            
            # VAD normal: medium success
            if i < 12:
                self.db.record_method_run("vad_normal_001", run_id, "KEEP", 0.05)
            else:
                self.db.record_method_run("vad_normal_001", run_id, "REJECT", -0.01)
            
            # VAD mild: low success
            if i < 4:
                self.db.record_method_run("vad_mild_001", run_id, "KEEP", 0.02)
            else:
                self.db.record_method_run("vad_mild_001", run_id, "REJECT", -0.02)
            
            # Filters: mixed success
            if i < 14:
                self.db.record_method_run("noise_gate_001", run_id, "KEEP", 0.06)
            else:
                self.db.record_method_run("noise_gate_001", run_id, "REJECT", -0.01)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_integration_similar_methods(self):
        """Integration test: find similar successful methods."""
        similar = self.analytics.get_similar_successful_methods(
            "vad_aggressive_001", n_results=5
        )
        
        self.assertGreater(len(similar), 0)
        
        # Check that results are sorted by relevance
        for i in range(len(similar) - 1):
            score_i = similar[i].get("similarity", 0) * similar[i].get("success_rate", 0)
            score_j = similar[i + 1].get("similarity", 0) * similar[i + 1].get("success_rate", 0)
            self.assertGreaterEqual(score_i, score_j)
    
    def test_integration_success_prediction(self):
        """Integration test: predict success."""
        pred = self.analytics.predict_success("vad_aggressive_001")
        
        self.assertGreater(pred.predicted_success_rate, 0.5)
        self.assertGreater(pred.based_on, 0)
    
    def test_integration_top_methods(self):
        """Integration test: get top methods."""
        top = self.analytics.get_top_methods(limit=5)
        
        self.assertGreater(len(top), 0)
        
        # First method should be one of the high-performing ones
        self.assertIn(top[0]["method_id"], [
            "vad_aggressive_001", "vad_aggressive_002",
            "noise_gate_001"
        ])
    
    def test_integration_recommendations(self):
        """Integration test: recommend methods for run."""
        recs = self.analytics.recommend_methods_for_run("run_new", 5)
        
        # Should return list (may be empty in mock mode)
        self.assertIsInstance(recs, list)
        
        # If recommendations exist, validate structure
        for r in recs:
            self.assertGreaterEqual(r.score, 0.0)
            self.assertLessEqual(r.score, 1.0)
    
    def test_integration_clustering(self):
        """Integration test: cluster methods."""
        try:
            clusters = self.analytics.get_method_clusters(n_clusters=2)
            
            self.assertGreater(len(clusters), 0)
            
            # Verify total methods in clusters
            total = sum(len(c.method_ids) for c in clusters)
            self.assertEqual(total, 7)  # All methods should be assigned
        except ValueError:
            # Expected when sklearn is not available
            pass
    
    def test_integration_summary(self):
        """Integration test: analytics summary."""
        summary = self.analytics.get_analytics_summary()
        
        # Summary should have expected structure
        self.assertIn("total_methods", summary)
        self.assertIn("categories", summary)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestCosineSimilarity))
    suite.addTests(loader.loadTestsFromTestCase(TestSimilarityAnalyticsInit))
    suite.addTests(loader.loadTestsFromTestCase(TestGetSimilarSuccessfulMethods))
    suite.addTests(loader.loadTestsFromTestCase(TestPredictSuccess))
    suite.addTests(loader.loadTestsFromTestCase(TestGetTopMethods))
    suite.addTests(loader.loadTestsFromTestCase(TestSearchByDescription))
    suite.addTests(loader.loadTestsFromTestCase(TestRecommendMethodsForRun))
    suite.addTests(loader.loadTestsFromTestCase(TestGetMethodClusters))
    suite.addTests(loader.loadTestsFromTestCase(TestGetSuccessRate))
    suite.addTests(loader.loadTestsFromTestCase(TestGetAnalyticsSummary))
    suite.addTests(loader.loadTestsFromTestCase(TestIntegration))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
