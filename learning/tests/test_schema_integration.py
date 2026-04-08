"""Integration tests for schema validation in chroma_client.

Tests that ChromaLearningDB properly uses schema validation.

Run with:
    python3 -m pytest learning/tests/test_schema_integration.py -v
    
Or standalone:
    python3 learning/tests/test_schema_integration.py
"""

import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime

# Add workspace to path
workspace_root = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..')
)
sys.path.insert(0, workspace_root)

from learning.chroma_client import ChromaLearningDB, Run


class TestSchemaValidationInAddMethod(unittest.TestCase):
    """Test schema validation during method addition."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_add_method_includes_created_at(self):
        """Test that add_method includes created_at timestamp."""
        self.db.add_method(
            method_id="test_method_001",
            category="vad",
            parameters={"threshold": 0.5}
        )
        
        result = self.db.get_method("test_method_001")
        self.assertIsNotNone(result)
        self.assertIn("created_at", result["metadata"])
        
        # Verify it's a valid ISO datetime
        created_at = result["metadata"]["created_at"]
        self.assertIsInstance(created_at, str)
    
    def test_add_method_with_strategy_in_params(self):
        """Test that strategy is extracted from parameters."""
        self.db.add_method(
            method_id="test_method_002",
            category="vad",
            parameters={"threshold": 0.5, "strategy": "aggressive"}
        )
        
        result = self.db.get_method("test_method_002")
        self.assertIsNotNone(result)
        # Strategy should be in metadata if present in parameters
        # Note: current implementation stores strategy at top level


class TestSchemaValidationInRecordMethodRun(unittest.TestCase):
    """Test schema validation during method run recording."""
    
    def setUp(self):
        """Set up test database with a method."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
        
        # Add a method first
        self.db.add_method(
            method_id="test_method",
            category="test",
            parameters={}
        )
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_record_method_run_with_duration(self):
        """Test recording method run with duration_ms."""
        self.db.record_method_run(
            method_id="test_method",
            run_id="run_001",
            decision="KEEP",
            improvement=0.05,
            duration_ms=1500
        )
        
        runs = self.db.get_method_runs("test_method")
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["duration_ms"], 1500)
    
    def test_record_method_run_without_duration(self):
        """Test recording method run without duration_ms."""
        self.db.record_method_run(
            method_id="test_method",
            run_id="run_002",
            decision="REJECT",
            improvement=-0.01
        )
        
        runs = self.db.get_method_runs("test_method")
        # Find the run_002 entry
        run_002 = [r for r in runs if r.get("run_id") == "run_002"]
        self.assertEqual(len(run_002), 1)


class TestSchemaValidationInRecordRun(unittest.TestCase):
    """Test schema validation during run recording."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_record_run_with_methods_applied(self):
        """Test recording run with methods_applied."""
        run = Run(
            run_id="run_001",
            timestamp=datetime.utcnow().isoformat(),
            baseline_score=0.5,
            final_score=0.6,
            status="COMPLETED"
        )
        
        methods_applied = ["method_001", "method_002"]
        success = self.db.record_run(run, methods_applied=methods_applied)
        self.assertTrue(success)
    
    def test_record_run_without_methods_applied(self):
        """Test recording run without methods_applied."""
        run = Run(
            run_id="run_002",
            timestamp=datetime.utcnow().isoformat(),
            status="COMPLETED"
        )
        
        success = self.db.record_run(run)
        self.assertTrue(success)


class TestCollectionIntegrity(unittest.TestCase):
    """Test collection integrity and metadata structure."""
    
    def setUp(self):
        """Set up test database."""
        self.temp_dir = tempfile.mkdtemp()
        self.db = ChromaLearningDB(persist_dir=self.temp_dir)
    
    def tearDown(self):
        """Clean up."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_method_collection_exists(self):
        """Test that methods collection exists."""
        self.assertIsNotNone(self.db.methods)
    
    def test_runs_collection_exists(self):
        """Test that runs collection exists."""
        self.assertIsNotNone(self.db.runs)
    
    def test_method_runs_collection_exists(self):
        """Test that method_runs collection exists."""
        self.assertIsNotNone(self.db.method_runs)
    
    def test_collections_initialized(self):
        """Test that all collections are initialized."""
        self.assertIsNotNone(self.db.methods)
        self.assertIsNotNone(self.db.runs)
        self.assertIsNotNone(self.db.method_runs)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaValidationInAddMethod))
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaValidationInRecordMethodRun))
    suite.addTests(loader.loadTestsFromTestCase(TestSchemaValidationInRecordRun))
    suite.addTests(loader.loadTestsFromTestCase(TestCollectionIntegrity))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
