#!/usr/bin/env python3
"""Tests for ChromaDB client.

Tests the ChromaLearningDB class and related functionality.

Run with:
    python3 -m pytest learning/tests/test_chroma_client.py -v
    
Or standalone:
    python3 learning/tests/test_chroma_client.py
"""

import unittest
import tempfile
import shutil
import os
import sys

# Add workspace to path
workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, workspace_root)

from learning.chroma_client import (
    ChromaLearningDB,
    Method,
    Run,
    MethodRun,
    EmbeddingGenerator
)


class TestEmbeddingGenerator(unittest.TestCase):
    """Test embedding generation."""
    
    def test_encode_returns_list(self):
        """Test that encode returns a list."""
        gen = EmbeddingGenerator()
        embedding = gen.encode("test text")
        self.assertIsInstance(embedding, list)
        self.assertGreater(len(embedding), 0)
    
    def test_encode_consistent(self):
        """Test that encoding is deterministic."""
        gen = EmbeddingGenerator()
        emb1 = gen.encode("same text")
        emb2 = gen.encode("same text")
        self.assertEqual(emb1, emb2)
    
    def test_encode_different_texts(self):
        """Test that different texts produce different embeddings."""
        gen = EmbeddingGenerator()
        emb1 = gen.encode("text one")
        emb2 = gen.encode("text two")
        self.assertNotEqual(emb1, emb2)
    
    def test_dimension_property(self):
        """Test dimension property."""
        gen = EmbeddingGenerator()
        self.assertEqual(gen.dimension, len(gen.encode("test")))


class TestChromaLearningDBInit(unittest.TestCase):
    """Test ChromaLearningDB initialization."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
    
    def tearDown(self):
        """Clean up test database."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_init_collections(self):
        """Test that collections are initialized."""
        self.assertIsNotNone(self.db.methods)
        self.assertIsNotNone(self.db.runs)
        self.assertIsNotNone(self.db.method_runs)


class TestAddMethod(unittest.TestCase):
    """Test add_method functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
    
    def tearDown(self):
        """Clean up test database."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_add_method_basic(self):
        """Test basic method addition."""
        self.db.add_method(
            method_id="test_method_001",
            category="vad",
            parameters={"threshold": 0.5}
        )
        
        result = self.db.get_method("test_method_001")
        self.assertIsNotNone(result)
        self.assertEqual(result["method_id"], "test_method_001")
        self.assertEqual(result["metadata"]["category"], "vad")
    
    def test_add_method_duplicate_raises(self):
        """Test that duplicate method raises ValueError."""
        self.db.add_method(
            method_id="duplicate_method",
            category="vad",
            parameters={"threshold": 0.5}
        )
        
        with self.assertRaises(ValueError):
            self.db.add_method(
                method_id="duplicate_method",
                category="filter",
                parameters={"threshold": -40}
            )
    
    def test_add_method_with_complex_params(self):
        """Test adding method with complex parameters."""
        params = {
            "threshold": 0.5,
            "mode": "aggressive",
            "nested": {"key": "value"}
        }
        
        self.db.add_method(
            method_id="complex_method",
            category="analysis",
            parameters=params
        )
        
        result = self.db.get_method("complex_method")
        self.assertIsNotNone(result)
        self.assertIn("aggressive", result["metadata"]["parameters"])


class TestFindSimilarMethods(unittest.TestCase):
    """Test find_similar_methods functionality."""
    
    def setUp(self):
        """Set up test database with methods."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        
        # Register multiple similar methods
        self.vad_methods = [
            ("vad_aggressive", "vad", {"threshold": 0.3}),
            ("vad_normal", "vad", {"threshold": 0.5}),
            ("vad_mild", "vad", {"threshold": 0.7}),
        ]
        
        self.filter_methods = [
            ("noise_gate", "filter", {"threshold": -40}),
            ("high_pass", "filter", {"freq": 100}),
        ]
        
        for mid, cat, params in self.vad_methods + self.filter_methods:
            self.db.add_method(mid, cat, params)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_find_similar_returns_results(self):
        """Test that similar methods are found."""
        similar = self.db.find_similar_methods("vad_aggressive", n_results=3)
        self.assertGreater(len(similar), 0)
    
    def test_find_similar_has_required_fields(self):
        """Test that results have required fields."""
        similar = self.db.find_similar_methods("vad_aggressive", n_results=3)
        
        for s in similar:
            self.assertIn("method_id", s)
            self.assertIn("distance", s)
            self.assertIn("similarity", s)
            self.assertIn("category", s)
    
    def test_find_similar_excludes_self(self):
        """Test that query method is excluded from results."""
        similar = self.db.find_similar_methods("vad_aggressive", n_results=5)
        
        method_ids = [s["method_id"] for s in similar]
        self.assertNotIn("vad_aggressive", method_ids)
    
    def test_find_similar_not_found(self):
        """Test behavior when method not found."""
        similar = self.db.find_similar_methods("non_existent", n_results=3)
        self.assertEqual(len(similar), 0)


class TestRecordMethodRun(unittest.TestCase):
    """Test record_method_run functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        
        # Add method
        self.db.add_method(
            method_id="test_mr_method",
            category="test",
            parameters={}
        )
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_record_method_run_basic(self):
        """Test basic method run recording."""
        self.db.record_method_run(
            method_id="test_mr_method",
            run_id="run_001",
            decision="KEEP",
            improvement=0.05
        )
        
        # Check method runs
        runs = self.db.get_method_runs("test_mr_method")
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["decision"], "KEEP")
        self.assertEqual(runs[0]["improvement"], 0.05)
    
    def test_record_multiple_runs(self):
        """Test recording multiple runs for same method."""
        for i in range(3):
            self.db.record_method_run(
                method_id="test_mr_method",
                run_id=f"run_{i:03d}",
                decision="KEEP" if i < 2 else "REJECT",
                improvement=0.05 if i < 2 else -0.01
            )
        
        runs = self.db.get_method_runs("test_mr_method")
        self.assertEqual(len(runs), 3)
    
    def test_record_run_updates_success_rate(self):
        """Test that recording run updates method success rate."""
        # Initial rate
        initial_rate = self.db.get_success_rate("test_mr_method")
        self.assertEqual(initial_rate, 0.0)
        
        # Record KEEP
        self.db.record_method_run(
            method_id="test_mr_method",
            run_id="run_001",
            decision="KEEP",
            improvement=0.05
        )
        
        # Record REJECT
        self.db.record_method_run(
            method_id="test_mr_method",
            run_id="run_002",
            decision="REJECT",
            improvement=-0.01
        )
        
        # Success rate should be 0.5
        success_rate = self.db.get_success_rate("test_mr_method")
        self.assertEqual(success_rate, 0.5)
        
        # Check attempts
        method_data = self.db.get_method("test_mr_method")
        self.assertEqual(method_data["metadata"]["attempts"], 2)


class TestQueryByMetadata(unittest.TestCase):
    """Test query_by_metadata functionality."""
    
    def setUp(self):
        """Set up test database with methods."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        
        # Add methods with different categories and stats
        methods = [
            ("method_a", "vad", {"p": 1}),
            ("method_b", "vad", {"p": 2}),
            ("method_c", "filter", {"p": 3}),
        ]
        
        for mid, cat, params in methods:
            self.db.add_method(mid, cat, params)
        
        # Add runs to set success rates
        for i in range(5):
            self.db.record_method_run("method_a", f"run_a_{i}", "KEEP", 0.05)
        
        for i in range(5):
            decision = "KEEP" if i < 2 else "REJECT"
            self.db.record_method_run("method_b", f"run_b_{i}", decision, 0.05)
        
        self.db.record_method_run("method_c", "run_c_0", "KEEP", 0.05)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_query_by_category(self):
        """Test querying by category."""
        results = self.db.query_by_metadata(category="vad")
        self.assertEqual(len(results), 2)
        
        method_ids = [r["method_id"] for r in results]
        self.assertIn("method_a", method_ids)
        self.assertIn("method_b", method_ids)
    
    def test_query_by_min_success_rate(self):
        """Test querying by minimum success rate."""
        # method_a: 5/5 = 1.0
        # method_b: 2/5 = 0.4
        # method_c: 1/1 = 1.0
        results = self.db.query_by_metadata(min_success_rate=0.9)
        # Both method_a (1.0) and method_c (1.0) should match
        self.assertGreaterEqual(len(results), 1)
        method_ids = [r["method_id"] for r in results]
        self.assertIn("method_a", method_ids)
    
    def test_query_by_min_attempts(self):
        """Test querying by minimum attempts."""
        results = self.db.query_by_metadata(min_attempts=3)
        method_ids = [r["method_id"] for r in results]
        self.assertIn("method_a", method_ids)
        self.assertIn("method_b", method_ids)
    
    def test_query_combined_filters(self):
        """Test querying with multiple filters."""
        results = self.db.query_by_metadata(
            category="vad",
            min_attempts=3
        )
        self.assertEqual(len(results), 2)


class TestGetTopMethods(unittest.TestCase):
    """Test get_top_methods functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        
        # Add methods
        methods = [
            ("high_perf", "vad", {"p": 1}),
            ("med_perf", "vad", {"p": 2}),
            ("low_perf", "filter", {"p": 3}),
        ]
        
        for mid, cat, params in methods:
            self.db.add_method(mid, cat, params)
        
        # Set success rates via runs
        for i in range(10):
            self.db.record_method_run("high_perf", f"hp_{i}", "KEEP", 0.05)
        
        for i in range(10):
            decision = "KEEP" if i < 5 else "REJECT"
            self.db.record_method_run("med_perf", f"mp_{i}", decision, 0.05)
        
        for i in range(10):
            decision = "KEEP" if i < 2 else "REJECT"
            self.db.record_method_run("low_perf", f"lp_{i}", decision, 0.05)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_get_top_methods_sorted(self):
        """Test that top methods are sorted by success rate."""
        top = self.db.get_top_methods(n_results=3)
        self.assertGreaterEqual(len(top), 3)
        
        # Should be sorted by success_rate descending
        rates = [m["success_rate"] for m in top]
        self.assertEqual(rates, sorted(rates, reverse=True))
    
    def test_get_top_methods_category_filter(self):
        """Test category filtering."""
        top = self.db.get_top_methods(n_results=3, category="vad")
        
        for m in top:
            self.assertEqual(m["category"], "vad")
    
    def test_get_top_methods_min_attempts(self):
        """Test minimum attempts filter."""
        # All have 10 attempts
        top = self.db.get_top_methods(n_results=3, min_attempts=5)
        self.assertGreaterEqual(len(top), 2)


class TestGetMethod(unittest.TestCase):
    """Test get_method functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        
        self.db.add_method(
            method_id="test_get",
            category="test",
            parameters={"key": "value"}
        )
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_get_method_found(self):
        """Test getting existing method."""
        result = self.db.get_method("test_get")
        self.assertIsNotNone(result)
        self.assertEqual(result["method_id"], "test_get")
        self.assertEqual(result["metadata"]["category"], "test")
    
    def test_get_method_not_found(self):
        """Test getting non-existent method."""
        result = self.db.get_method("non_existent")
        self.assertIsNone(result)


class TestGetSuccessRate(unittest.TestCase):
    """Test get_success_rate functionality."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        
        self.db.add_method("sr_test", "test", {})
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_get_success_rate_initial(self):
        """Test initial success rate."""
        rate = self.db.get_success_rate("sr_test")
        self.assertEqual(rate, 0.0)
    
    def test_get_success_rate_non_existent(self):
        """Test success rate for non-existent method."""
        rate = self.db.get_success_rate("non_existent")
        self.assertEqual(rate, 0.0)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestEmbeddingGenerator))
    suite.addTests(loader.loadTestsFromTestCase(TestChromaLearningDBInit))
    suite.addTests(loader.loadTestsFromTestCase(TestAddMethod))
    suite.addTests(loader.loadTestsFromTestCase(TestFindSimilarMethods))
    suite.addTests(loader.loadTestsFromTestCase(TestRecordMethodRun))
    suite.addTests(loader.loadTestsFromTestCase(TestQueryByMetadata))
    suite.addTests(loader.loadTestsFromTestCase(TestGetTopMethods))
    suite.addTests(loader.loadTestsFromTestCase(TestGetMethod))
    suite.addTests(loader.loadTestsFromTestCase(TestGetSuccessRate))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
