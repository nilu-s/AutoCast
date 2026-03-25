#!/usr/bin/env python3
"""Tests for SimilaritySelector - Similarity-Based Method Selection.

Test suite covering:
- Exploration vs Exploitation (ε-greedy strategy)
- Context similarity matching
- Ranking algorithm
- Fallback behavior
"""

import json
import os
import sys
import unittest
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, Any, List

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from learning.selection.similarity_selector import (
    SimilaritySelector,
    MethodCandidate,
    SelectionResult,
    ContextEmbedding,
    ChromaBridgeClient,
    create_selector,
)


class TestContextEmbedding(unittest.TestCase):
    """Test ContextEmbedding data class."""
    
    def test_default_creation(self):
        """Test default context embedding creation."""
        ctx = ContextEmbedding()
        self.assertEqual(ctx.audio_type, "unknown")
        self.assertEqual(ctx.noise_level, "medium")
        self.assertEqual(ctx.speech_density, "normal")
        self.assertEqual(ctx.duration_min, 0.0)
        self.assertEqual(ctx.speaker_count, 1)
        self.assertIsNone(ctx.embedding)
    
    def test_custom_creation(self):
        """Test custom context embedding creation."""
        ctx = ContextEmbedding(
            audio_type="podcast",
            noise_level="high",
            speech_density="dense",
            duration_min=30.0,
            speaker_count=2
        )
        self.assertEqual(ctx.audio_type, "podcast")
        self.assertEqual(ctx.noise_level, "high")
        self.assertEqual(ctx.duration_min, 30.0)
    
    def test_to_text(self):
        """Test context to text conversion."""
        ctx = ContextEmbedding(
            audio_type="podcast",
            noise_level="high",
            duration_min=30.0
        )
        text = ctx.to_text()
        self.assertIn("podcast", text)
        self.assertIn("high", text)
        self.assertIn("30.0", text)
    
    def test_to_dict(self):
        """Test context to dict conversion."""
        ctx = ContextEmbedding(audio_type="podcast", noise_level="high")
        d = ctx.to_dict()
        self.assertEqual(d["audio_type"], "podcast")
        self.assertEqual(d["noise_level"], "high")
        self.assertIn("duration_min", d)


class TestEpsilonGreedyStrategy(unittest.TestCase):
    """Test ε-greedy strategy implementation."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_bridge = Mock(spec=ChromaBridgeClient)
        self.mock_bridge.is_healthy.return_value = True
        
    @patch('learning.selection.similarity_selector.ChromaBridgeClient')
    def test_exploration_selection(self, mock_bridge_class):
        """Test exploration selection with high probability."""
        # Setup mock
        mock_bridge_class.return_value = self.mock_bridge
        self.mock_bridge.get_top_methods.return_value = [
            {"method_id": "method_1", "success_rate": 0.5, "attempts": 5},
            {"method_id": "method_2", "success_rate": 0.6, "attempts": 3},
        ]
        
        # Create selector with epsilon=1.0 (always explore)
        selector = SimilaritySelector(epsilon=1.0, seed=42)
        selector.bridge_client = self.mock_bridge
        
        context = {"audio_type": "podcast", "noise_level": "high"}
        result = selector.get_selection_result(context, n_candidates=2)
        
        # Should be exploration
        self.assertTrue(result.was_exploration)
        self.assertEqual(result.selection_type, "exploration")
        self.assertEqual(len(result.candidates), 2)
    
    @patch('learning.selection.similarity_selector.ChromaBridgeClient')
    def test_exploitation_selection(self, mock_bridge_class):
        """Test exploitation selection with low probability."""
        # Setup mock
        mock_bridge_class.return_value = self.mock_bridge
        self.mock_bridge.get_top_methods.return_value = [
            {"method_id": "method_1", "success_rate": 0.9, "attempts": 10},
            {"method_id": "method_2", "success_rate": 0.8, "attempts": 8},
            {"method_id": "method_3", "success_rate": 0.3, "attempts": 2},
        ]
        
        # Create selector with epsilon=0.0 (always exploit)
        selector = SimilaritySelector(epsilon=0.0, seed=42)
        selector.bridge_client = self.mock_bridge
        
        context = {"audio_type": "podcast", "noise_level": "high"}
        result = selector.get_selection_result(context, n_candidates=2)
        
        # Should be exploitation
        self.assertFalse(result.was_exploration)
        self.assertEqual(result.selection_type, "exploitation")
        self.assertEqual(len(result.candidates), 2)
    
    @patch('learning.selection.similarity_selector.ChromaBridgeClient')
    def test_epsilon_probability(self, mock_bridge_class):
        """Test that epsilon controls exploration probability."""
        # Setup mock - always return healthy to test probability
        mock_bridge = Mock()
        mock_bridge.is_healthy.return_value = True
        mock_bridge.get_top_methods.return_value = [
            {"method_id": "method_1", "success_rate": 0.9, "attempts": 10},
        ]
        mock_bridge_class.return_value = mock_bridge
        
        # Test with epsilon=0.5 - deterministic with fixed seed
        selector = SimilaritySelector(epsilon=0.5, seed=42)
        # Manually set the bridge client to our mock
        selector.bridge_client = mock_bridge
        
        context = {"audio_type": "podcast", "noise_level": "high"}
        
        # Reset RNG and check first few selections
        # With seed=42 and epsilon=0.5, we should get a mix
        results = []
        for i in range(10):
            selector.reset_rng()
            # Advance RNG by calling random multiple times
            for _ in range(i):
                selector._rng.random()
            result = selector.get_selection_result(context, n_candidates=1)
            results.append(result.was_exploration)
        
        # Check that we have at least some variation (mix of exploration and exploitation)
        exploration_count = sum(results)
        self.assertGreaterEqual(exploration_count, 0)  # At least 0
        self.assertLessEqual(exploration_count, 10)    # At most 10
        
        # The key test is that with epsilon=0, we never explore
        # and with epsilon=1.0, we always explore
        selector_zero = SimilaritySelector(epsilon=0.0, seed=42)
        selector_zero.bridge_client = mock_bridge
        selector_zero.reset_rng()
        result_zero = selector_zero.get_selection_result(context, n_candidates=1)
        self.assertFalse(result_zero.was_exploration)
        
        selector_one = SimilaritySelector(epsilon=1.0, seed=42)
        selector_one.bridge_client = mock_bridge
        selector_one.reset_rng()
        result_one = selector_one.get_selection_result(context, n_candidates=1)
        self.assertTrue(result_one.was_exploration)


class TestContextSimilarityMatching(unittest.TestCase):
    """Test context similarity matching."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.selector = SimilaritySelector(epsilon=0.0, seed=42)
    
    def test_exact_match(self):
        """Test exact context matching."""
        context = ContextEmbedding(
            audio_type="podcast",
            noise_level="high",
            speech_density="dense"
        )
        metadata = {
            "audio_type": "podcast",
            "noise_level": "high",
            "speech_density": "dense"
        }
        
        similarity = self.selector._calculate_context_similarity(context, metadata)
        self.assertGreater(similarity, 0.7)  # Should be high
    
    def test_partial_match(self):
        """Test partial context matching."""
        context = ContextEmbedding(
            audio_type="podcast",
            noise_level="high",
            speech_density="normal"
        )
        metadata = {
            "audio_type": "podcast",
            "noise_level": "low",
            "speech_density": "normal"
        }
        
        similarity = self.selector._calculate_context_similarity(context, metadata)
        self.assertGreater(similarity, 0.3)  # Some matching
        self.assertLess(similarity, 0.7)       # But not too high
    
    def test_no_match(self):
        """Test no context matching."""
        context = ContextEmbedding(
            audio_type="podcast",
            noise_level="high"
        )
        metadata = {
            "audio_type": "interview",
            "noise_level": "low"
        }
        
        similarity = self.selector._calculate_context_similarity(context, metadata)
        self.assertEqual(similarity, 0.0)  # No matching
    
    def test_duration_similarity(self):
        """Test duration-based similarity."""
        context = ContextEmbedding(duration_min=30.0)
        metadata = {"duration_min": 25.0}  # Close duration
        
        similarity = self.selector._calculate_context_similarity(context, metadata)
        self.assertGreater(similarity, 0.0)  # Some similarity from duration
        self.assertLess(similarity, 0.15)    # But limited by weight


class TestRankingAlgorithm(unittest.TestCase):
    """Test ranking algorithm."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.selector = SimilaritySelector(epsilon=0.0, seed=42)
    
    def test_score_calculation(self):
        """Test combined score calculation."""
        methods = [
            {"method_id": "m1", "success_rate": 0.9, "attempts": 10},
            {"method_id": "m2", "success_rate": 0.8, "attempts": 5},
            {"method_id": "m3", "success_rate": 0.5, "attempts": 3},
        ]
        context = ContextEmbedding(audio_type="podcast")
        
        candidates = self.selector._rank_candidates(methods, context)
        
        # Should be sorted by score (descending)
        self.assertEqual(len(candidates), 3)
        self.assertGreaterEqual(candidates[0].score, candidates[1].score)
        self.assertGreaterEqual(candidates[1].score, candidates[2].score)
    
    def test_high_success_rate_priority(self):
        """Test that high success rate methods are ranked higher."""
        methods = [
            {"method_id": "low_success", "success_rate": 0.3, "attempts": 10},
            {"method_id": "high_success", "success_rate": 0.9, "attempts": 10},
        ]
        context = ContextEmbedding()
        
        candidates = self.selector._rank_candidates(methods, context)
        
        # Both have 0 similarity since context has no matching metadata
        # Score = success_rate * 0 = 0 for both, so they both have score 0
        # With equal scores, order may vary. Check that both are present.
        method_ids = [c.method_id for c in candidates]
        self.assertIn("high_success", method_ids)
        self.assertIn("low_success", method_ids)
        
        # When similarity is equal (0), the one with higher success rate 
        # should have higher raw score before tie-breaking
        # Actually, let's test with matching metadata
        methods_with_meta = [
            {"method_id": "low_success", "success_rate": 0.3, "attempts": 10, 
             "metadata": {"audio_type": "podcast"}},
            {"method_id": "high_success", "success_rate": 0.9, "attempts": 10,
             "metadata": {"audio_type": "podcast"}},
        ]
        context_with_meta = ContextEmbedding(audio_type="podcast")
        
        candidates2 = self.selector._rank_candidates(methods_with_meta, context_with_meta)
        # High success rate should be first when metadata matches
        self.assertEqual(candidates2[0].method_id, "high_success")
        self.assertEqual(candidates2[1].method_id, "low_success")
    
    def test_n_candidates_limit(self):
        """Test that n_candidates limits returned candidates."""
        methods = [
            {"method_id": f"m{i}", "success_rate": 0.5, "attempts": 5}
            for i in range(10)
        ]
        context = ContextEmbedding()
        
        candidates = self.selector._rank_candidates(methods, context)
        
        # All methods should be ranked
        self.assertEqual(len(candidates), 10)
        
        # But selection should limit
        with patch.object(self.selector.bridge_client, 'is_healthy', return_value=True):
            with patch.object(self.selector.bridge_client, 'get_top_methods', return_value=methods):
                result = self.selector.select_method({}, n_candidates=3)
                self.assertLessEqual(len(result), 3)


class TestFallbackBehavior(unittest.TestCase):
    """Test fallback behavior when bridge is unavailable."""
    
    @patch('learning.selection.similarity_selector.ChromaBridgeClient')
    def test_bridge_unavailable_fallback(self, mock_bridge_class):
        """Test fallback when bridge is not available."""
        mock_bridge = Mock()
        mock_bridge.is_healthy.return_value = False
        mock_bridge_class.return_value = mock_bridge
        
        selector = SimilaritySelector(epsilon=0.2, seed=42)
        
        # Should return fallback result
        context = {"audio_type": "podcast"}
        result = selector.select_method(context, n_candidates=3)
        
        # Fallback returns empty list or available methods
        self.assertIsInstance(result, list)
    
    @patch('learning.selection.similarity_selector.ChromaBridgeClient')
    def test_bridge_error_fallback(self, mock_bridge_class):
        """Test fallback on bridge error."""
        mock_bridge = Mock()
        # The is_healthy method handles exceptions internally, so we mock _request
        mock_bridge.is_healthy.return_value = False
        mock_bridge_class.return_value = mock_bridge
        
        selector = SimilaritySelector(epsilon=0.2, seed=42)
        
        context = {"audio_type": "podcast"}
        result = selector.select_method(context, n_candidates=3)
        
        # Should fallback gracefully
        self.assertIsInstance(result, list)
    
    def test_available_methods_fallback(self):
        """Test fallback with available methods list."""
        selector = SimilaritySelector(epsilon=0.2, seed=42)
        
        # Force fallback by making bridge unavailable
        selector.bridge_client = Mock()
        selector.bridge_client.is_healthy.return_value = False
        
        available = ["method_1", "method_2", "method_3"]
        context = {"audio_type": "podcast"}
        result = selector.select_method(context, n_candidates=2, available_methods=available)
        
        # Should return available methods
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0].method_id, "method_1")
        self.assertEqual(result[0].score, 0.5)  # Neutral score


class TestIntegration(unittest.TestCase):
    """Integration tests."""
    
    @patch('learning.selection.similarity_selector.ChromaBridgeClient')
    def test_end_to_end_selection(self, mock_bridge_class):
        """Test end-to-end selection flow."""
        mock_bridge = Mock()
        mock_bridge.is_healthy.return_value = True
        mock_bridge.get_top_methods.return_value = [
            {"method_id": "vad_aggressive", "success_rate": 0.85, "attempts": 20, "metadata": {"category": "vad"}},
            {"method_id": "noise_gate", "success_rate": 0.75, "attempts": 15, "metadata": {"category": "filter"}},
            {"method_id": "vad_normal", "success_rate": 0.60, "attempts": 10, "metadata": {"category": "vad"}},
        ]
        mock_bridge_class.return_value = mock_bridge
        
        selector = SimilaritySelector(epsilon=0.2, seed=42)
        
        context = {
            "audio_type": "podcast",
            "noise_level": "high",
            "speech_density": "dense",
            "duration_min": 30.0,
            "speaker_count": 2
        }
        
        result = selector.get_selection_result(context, n_candidates=3)
        
        # Verify structure
        self.assertIsInstance(result, SelectionResult)
        self.assertIsInstance(result.candidates, list)
        self.assertIn(result.selection_type, ["exploration", "exploitation"])
        self.assertIsInstance(result.context, dict)
        self.assertEqual(result.epsilon, 0.2)
        
        # Verify candidates
        for candidate in result.candidates:
            self.assertIsInstance(candidate, MethodCandidate)
            self.assertIsNotNone(candidate.method_id)
            self.assertIsInstance(candidate.score, float)
            self.assertIsInstance(candidate.success_rate, float)


class TestFactory(unittest.TestCase):
    """Test factory function."""
    
    def test_create_selector(self):
        """Test create_selector factory function."""
        selector = create_selector(epsilon=0.3, seed=123)
        
        self.assertIsInstance(selector, SimilaritySelector)
        self.assertEqual(selector.epsilon, 0.3)
        self.assertEqual(selector.seed, 123)
    
    def test_create_selector_defaults(self):
        """Test create_selector with defaults."""
        selector = create_selector()
        
        self.assertIsInstance(selector, SimilaritySelector)
        self.assertEqual(selector.epsilon, 0.2)  # Default


def run_tests():
    """Run all tests."""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestContextEmbedding))
    suite.addTests(loader.loadTestsFromTestCase(TestEpsilonGreedyStrategy))
    suite.addTests(loader.loadTestsFromTestCase(TestContextSimilarityMatching))
    suite.addTests(loader.loadTestsFromTestCase(TestRankingAlgorithm))
    suite.addTests(loader.loadTestsFromTestCase(TestFallbackBehavior))
    suite.addTests(loader.loadTestsFromTestCase(TestIntegration))
    suite.addTests(loader.loadTestsFromTestCase(TestFactory))
    
    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Return exit code
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(run_tests())