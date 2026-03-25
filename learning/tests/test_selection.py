"""Tests for selection strategies.

This module provides comprehensive tests for all selection strategies,
including epsilon-greedy, random, success-based, and Thompson sampling.

Example:
    $ python -m pytest learning/tests/test_selection.py -v
"""

import random
import sys
import unittest
from datetime import datetime
from typing import List

# Add parent to path for imports
sys.path.insert(0, '/home/node/.openclaw/workspace/AutoCast')

from learning.analytics.selection import (
    EpsilonGreedyStrategy,
    RandomStrategy,
    SelectionReason,
    SelectionResult,
    MethodInfo,
    RunHistory,
    SuccessBasedStrategy,
    ThompsonSamplingStrategy,
    create_strategy,
    get_available_strategies,
)


class TestMethodInfo(unittest.TestCase):
    """Tests for MethodInfo dataclass."""
    
    def test_method_info_creation(self) -> None:
        """Test basic MethodInfo creation."""
        method = MethodInfo(
            method_id="test_method",
            category="test",
            parameters={"param1": 1.0},
            success_rate=0.8,
            total_runs=10,
        )
        
        self.assertEqual(method.method_id, "test_method")
        self.assertEqual(method.category, "test")
        self.assertEqual(method.success_rate, 0.8)
        self.assertEqual(method.total_runs, 10)
    
    def test_is_explored_property(self) -> None:
        """Test is_explored property."""
        unexplored = MethodInfo("m1", "cat", {}, total_runs=2)
        explored = MethodInfo("m2", "cat", {}, total_runs=3)
        
        self.assertFalse(unexplored.is_explored)
        self.assertTrue(explored.is_explored)


class TestSelectionReason(unittest.TestCase):
    """Tests for SelectionReason enum."""
    
    def test_reason_values(self) -> None:
        """Test that all reasons exist."""
        self.assertIsNotNone(SelectionReason.EXPLORATION)
        self.assertIsNotNone(SelectionReason.EXPLOITATION)
        self.assertIsNotNone(SelectionReason.THOMPSON_SAMPLING)
        self.assertIsNotNone(SelectionReason.RANDOM)
        self.assertIsNotNone(SelectionReason.UNKNOWN)


class TestRandomStrategy(unittest.TestCase):
    """Tests for RandomStrategy."""
    
    def setUp(self) -> None:
        """Set up test fixtures."""
        self.methods: List[MethodInfo] = [
            MethodInfo(f"method_{i}", "test", {}, success_rate=0.5, total_runs=5)
            for i in range(5)
        ]
        self.history: List[RunHistory] = []
    
    def test_determinism(self) -> None:
        """Test that RandomStrategy is deterministic with fixed seed."""
        strategy1 = RandomStrategy(seed=42)
        strategy2 = RandomStrategy(seed=42)
        
        result1 = strategy1.select(self.methods, self.history)
        result2 = strategy2.select(self.methods, self.history)
        
        self.assertEqual(result1.method_id, result2.method_id)
    
    def test_empty_methods_raises_error(self) -> None:
        """Test that empty methods list raises ValueError."""
        strategy = RandomStrategy(seed=42)
        
        with self.assertRaises(ValueError):
            strategy.select([], self.history)
    
    def test_returns_valid_method(self) -> None:
        """Test that returned method is from the pending list."""
        strategy = RandomStrategy(seed=42)
        result = strategy.select(self.methods, self.history)
        
        method_ids = {m.method_id for m in self.methods}
        self.assertIn(result.method_id, method_ids)
    
    def test_reason_is_random(self) -> None:
        """Test that reason is RANDOM."""
        strategy = RandomStrategy(seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertEqual(result.reason, SelectionReason.RANDOM)
    
    def test_exploration_probability_is_one(self) -> None:
        """Test that exploration probability is 1.0 for random strategy."""
        strategy = RandomStrategy(seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertEqual(result.exploration_probability, 1.0)


class TestSuccessBasedStrategy(unittest.TestCase):
    """Tests for SuccessBasedStrategy."""
    
    def setUp(self) -> None:
        """Set up test fixtures."""
        self.methods: List[MethodInfo] = [
            MethodInfo("low", "test", {}, success_rate=0.3, total_runs=10),
            MethodInfo("high", "test", {}, success_rate=0.9, total_runs=10),
            MethodInfo("medium", "test", {}, success_rate=0.5, total_runs=10),
        ]
        self.history: List[RunHistory] = []
    
    def test_selects_highest_success_rate(self) -> None:
        """Test that highest success rate method is selected."""
        strategy = SuccessBasedStrategy(seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertEqual(result.method_id, "high")
    
    def test_reason_is_exploitation(self) -> None:
        """Test that reason is EXPLOITATION."""
        strategy = SuccessBasedStrategy(seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertEqual(result.reason, SelectionReason.EXPLOITATION)
    
    def test_empty_methods_raises_error(self) -> None:
        """Test that empty methods list raises ValueError."""
        strategy = SuccessBasedStrategy(seed=42)
        
        with self.assertRaises(ValueError):
            strategy.select([], self.history)
    
    def test_untested_methods_use_default_rate(self) -> None:
        """Test that untested methods use default success rate."""
        methods = [
            MethodInfo("untested", "test", {}, success_rate=0.0, total_runs=0),
            MethodInfo("tested", "test", {}, success_rate=0.4, total_runs=5),
        ]
        
        strategy = SuccessBasedStrategy(default_success_rate=0.5, seed=42)
        result = strategy.select(methods, self.history)
        
        # Untested with default 0.5 should be selected over tested with 0.4
        self.assertEqual(result.method_id, "untested")
    
    def test_confidence_is_success_rate(self) -> None:
        """Test that confidence reflects the success rate."""
        strategy = SuccessBasedStrategy(seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertAlmostEqual(result.confidence, 0.9, places=5)


class TestEpsilonGreedyStrategy(unittest.TestCase):
    """Tests for EpsilonGreedyStrategy."""
    
    def setUp(self) -> None:
        """Set up test fixtures."""
        self.methods: List[MethodInfo] = [
            MethodInfo("low", "test", {}, success_rate=0.3, total_runs=10),
            MethodInfo("high", "test", {}, success_rate=0.9, total_runs=10),
        ]
        self.history: List[RunHistory] = []
    
    def test_determinism(self) -> None:
        """Test that EpsilonGreedyStrategy is deterministic with fixed seed."""
        strategy1 = EpsilonGreedyStrategy(epsilon=0.5, seed=42)
        strategy2 = EpsilonGreedyStrategy(epsilon=0.5, seed=42)
        
        results1 = [strategy1.select(self.methods, self.history).method_id for _ in range(10)]
        results2 = [strategy2.select(self.methods, self.history).method_id for _ in range(10)]
        
        self.assertEqual(results1, results2)
    
    def test_empty_methods_raises_error(self) -> None:
        """Test that empty methods list raises ValueError."""
        strategy = EpsilonGreedyStrategy(seed=42)
        
        with self.assertRaises(ValueError):
            strategy.select([], self.history)
    
    def test_epsilon_zero_always_exploits(self) -> None:
        """Test that epsilon=0 always selects best method."""
        strategy = EpsilonGreedyStrategy(epsilon=0.0, seed=42)
        
        results = [strategy.select(self.methods, self.history).method_id for _ in range(20)]
        
        # All results should be "high" (best method)
        self.assertTrue(all(r == "high" for r in results))
    
    def test_epsilon_one_always_explores(self) -> None:
        """Test that epsilon=1.0 always explores (random selection)."""
        strategy = EpsilonGreedyStrategy(epsilon=1.0, seed=42)
        
        # With epsilon=1, should always explore
        results = [strategy.select(self.methods, self.history) for _ in range(20)]
        
        # All should be EXPLORATION
        self.assertTrue(all(r.reason == SelectionReason.EXPLORATION for r in results))
    
    def test_exploration_vs_exploitation_distribution(self) -> None:
        """Test that exploration/exploitation follows epsilon."""
        epsilon = 0.3
        strategy = EpsilonGreedyStrategy(epsilon=epsilon, seed=42)
        
        # Reset to ensure clean state
        strategy = EpsilonGreedyStrategy(epsilon=epsilon, seed=42)
        
        exploration_count = 0
        exploitation_count = 0
        trials = 1000
        
        for _ in range(trials):
            result = strategy.select(self.methods, self.history)
            if result.reason == SelectionReason.EXPLORATION:
                exploration_count += 1
            else:
                exploitation_count += 1
        
        # Check that exploration rate is approximately epsilon
        observed_epsilon = exploration_count / trials
        self.assertAlmostEqual(observed_epsilon, epsilon, delta=0.05)
    
    def test_decay_reduces_epsilon(self) -> None:
        """Test that decay reduces epsilon over selections."""
        strategy = EpsilonGreedyStrategy(epsilon=1.0, decay=0.9, seed=42)
        
        initial_epsilon = strategy.current_epsilon
        
        # Make several selections
        for _ in range(10):
            strategy.select(self.methods, self.history)
        
        # Epsilon should have decayed
        self.assertLess(strategy.current_epsilon, initial_epsilon)
    
    def test_exploration_probability_in_result(self) -> None:
        """Test that exploration probability is included in result."""
        epsilon = 0.25
        strategy = EpsilonGreedyStrategy(epsilon=epsilon, seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertEqual(result.exploration_probability, epsilon)
    
    def test_exploitation_selects_best_method(self) -> None:
        """Test that exploitation selects the best method."""
        strategy = EpsilonGreedyStrategy(epsilon=0.0, seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertEqual(result.method_id, "high")
        self.assertEqual(result.reason, SelectionReason.EXPLOITATION)
    
    def test_reset_resets_epsilon(self) -> None:
        """Test that reset restores initial epsilon."""
        strategy = EpsilonGreedyStrategy(epsilon=0.5, decay=0.9, seed=42)
        
        # Make selections to decay epsilon
        for _ in range(10):
            strategy.select(self.methods, self.history)
        
        self.assertLess(strategy.current_epsilon, strategy.initial_epsilon)
        
        # Reset
        strategy.reset()
        
        self.assertEqual(strategy.current_epsilon, strategy.initial_epsilon)
        self.assertEqual(strategy.selection_count, 0)
    
    def test_get_stats(self) -> None:
        """Test that get_stats returns expected values."""
        strategy = EpsilonGreedyStrategy(epsilon=0.3, decay=0.95, seed=42)
        
        # Make some selections
        for _ in range(5):
            strategy.select(self.methods, self.history)
        
        stats = strategy.get_stats()
        
        self.assertEqual(stats['initial_epsilon'], 0.3)
        self.assertEqual(stats['decay'], 0.95)
        self.assertEqual(stats['selection_count'], 5)
        self.assertLess(stats['current_epsilon'], stats['initial_epsilon'])


class TestThompsonSamplingStrategy(unittest.TestCase):
    """Tests for ThompsonSamplingStrategy."""
    
    def setUp(self) -> None:
        """Set up test fixtures."""
        self.methods: List[MethodInfo] = [
            MethodInfo("low", "test", {}, success_rate=0.3, total_runs=10),
            MethodInfo("high", "test", {}, success_rate=0.9, total_runs=10),
        ]
        self.history: List[RunHistory] = [
            RunHistory("low", "KEEP"),
            RunHistory("low", "REJECT"),
            RunHistory("low", "REJECT"),
            RunHistory("high", "KEEP"),
            RunHistory("high", "KEEP"),
            RunHistory("high", "REJECT"),
        ]
    
    def test_determinism(self) -> None:
        """Test that ThompsonSamplingStrategy is deterministic with fixed seed."""
        strategy1 = ThompsonSamplingStrategy(seed=42)
        strategy2 = ThompsonSamplingStrategy(seed=42)
        
        results1 = [strategy1.select(self.methods, self.history).method_id for _ in range(10)]
        results2 = [strategy2.select(self.methods, self.history).method_id for _ in range(10)]
        
        self.assertEqual(results1, results2)
    
    def test_empty_methods_raises_error(self) -> None:
        """Test that empty methods list raises ValueError."""
        strategy = ThompsonSamplingStrategy(seed=42)
        
        with self.assertRaises(ValueError):
            strategy.select([], self.history)
    
    def test_reason_is_thompson_sampling(self) -> None:
        """Test that reason is THOMPSON_SAMPLING."""
        strategy = ThompsonSamplingStrategy(seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertEqual(result.reason, SelectionReason.THOMPSON_SAMPLING)
    
    def test_method_info_contains_posterior_params(self) -> None:
        """Test that result includes posterior parameters."""
        strategy = ThompsonSamplingStrategy(seed=42)
        result = strategy.select(self.methods, self.history)
        
        self.assertIn('posterior_alpha', result.method_info)
        self.assertIn('posterior_beta', result.method_info)
        self.assertIn('sample_value', result.method_info)
    
    def test_beta_sample_in_range(self) -> None:
        """Test that beta samples are in [0, 1]."""
        strategy = ThompsonSamplingStrategy(seed=42)
        
        for _ in range(100):
            sample = strategy._beta_sample(2.0, 3.0)
            self.assertGreaterEqual(sample, 0.0)
            self.assertLessEqual(sample, 1.0)


class TestCreateStrategy(unittest.TestCase):
    """Tests for strategy factory."""
    
    def test_create_random_strategy(self) -> None:
        """Test creating RandomStrategy."""
        strategy = create_strategy('random', seed=42)
        self.assertIsInstance(strategy, RandomStrategy)
    
    def test_create_success_based_strategy(self) -> None:
        """Test creating SuccessBasedStrategy."""
        strategy = create_strategy('success_based', seed=42)
        self.assertIsInstance(strategy, SuccessBasedStrategy)
    
    def test_create_epsilon_greedy_strategy(self) -> None:
        """Test creating EpsilonGreedyStrategy."""
        strategy = create_strategy('epsilon_greedy', epsilon=0.2, seed=42)
        self.assertIsInstance(strategy, EpsilonGreedyStrategy)
        self.assertEqual(strategy.epsilon, 0.2)
    
    def test_create_thompson_sampling_strategy(self) -> None:
        """Test creating ThompsonSamplingStrategy."""
        strategy = create_strategy('thompson_sampling', seed=42)
        self.assertIsInstance(strategy, ThompsonSamplingStrategy)
    
    def test_unknown_strategy_raises_error(self) -> None:
        """Test that unknown strategy raises ValueError."""
        with self.assertRaises(ValueError):
            create_strategy('unknown_strategy')
    
    def test_get_available_strategies(self) -> None:
        """Test that get_available_strategies returns list."""
        strategies = get_available_strategies()
        
        expected = ['random', 'success_based', 'epsilon_greedy', 'thompson_sampling']
        for strategy in expected:
            self.assertIn(strategy, strategies)


class TestEdgeCases(unittest.TestCase):
    """Tests for edge cases."""
    
    def test_single_method_selection(self) -> None:
        """Test selecting from single method list."""
        methods = [MethodInfo("only", "test", {}, success_rate=0.5, total_runs=5)]
        history: List[RunHistory] = []
        
        for StrategyClass in [RandomStrategy, SuccessBasedStrategy, EpsilonGreedyStrategy]:
            strategy = StrategyClass(seed=42)
            result = strategy.select(methods, history)
            self.assertEqual(result.method_id, "only")
    
    def test_zero_success_rate_methods(self) -> None:
        """Test with all methods having zero success rate."""
        methods = [
            MethodInfo("a", "test", {}, success_rate=0.0, total_runs=5),
            MethodInfo("b", "test", {}, success_rate=0.0, total_runs=5),
        ]
        history: List[RunHistory] = []
        
        strategy = SuccessBasedStrategy(seed=42)
        result = strategy.select(methods, history)
        
        # Should select first one (both equal)
        self.assertIn(result.method_id, ["a", "b"])
    
    def test_very_small_epsilon(self) -> None:
        """Test with very small epsilon."""
        methods = [
            MethodInfo("a", "test", {}, success_rate=0.3, total_runs=10),
            MethodInfo("b", "test", {}, success_rate=0.9, total_runs=10),
        ]
        history: List[RunHistory] = []
        
        strategy = EpsilonGreedyStrategy(epsilon=0.001, seed=42)
        
        # Almost always exploitation
        results = [strategy.select(methods, history).reason for _ in range(100)]
        exploitation_count = sum(1 for r in results if r == SelectionReason.EXPLOITATION)
        
        self.assertGreater(exploitation_count, 95)
    
    def test_large_number_of_methods(self) -> None:
        """Test with large number of methods."""
        methods = [
            MethodInfo(f"method_{i}", "test", {}, success_rate=i/100, total_runs=10)
            for i in range(100)
        ]
        history: List[RunHistory] = []
        
        strategy = EpsilonGreedyStrategy(seed=42)
        result = strategy.select(methods, history)
        
        method_ids = {m.method_id for m in methods}
        self.assertIn(result.method_id, method_ids)


class TestIntegrationWithAnalytics(unittest.TestCase):
    """Integration tests for selection with analytics."""
    
    def test_selection_from_analytics_data(self) -> None:
        """Test selection using realistic analytics data."""
        methods = [
            MethodInfo("noise_reduction", "filter", {"threshold": 0.5}, success_rate=0.8, total_runs=20),
            MethodInfo("volume_boost", "gain", {"db": 3.0}, success_rate=0.6, total_runs=15),
            MethodInfo("new_method", "experimental", {}, success_rate=0.0, total_runs=0),
        ]
        history = [
            RunHistory("noise_reduction", "KEEP", improvement=0.05, duration_ms=1000),
            RunHistory("noise_reduction", "KEEP", improvement=0.03, duration_ms=1100),
            RunHistory("volume_boost", "KEEP", improvement=0.02, duration_ms=500),
            RunHistory("volume_boost", "REJECT", improvement=-0.01, duration_ms=600),
        ]
        
        strategy = EpsilonGreedyStrategy(epsilon=0.2, seed=42)
        result = strategy.select(methods, history)
        
        self.assertIn(result.method_id, [m.method_id for m in methods])
        self.assertIn('category', result.method_info)


class TestSelectionResult(unittest.TestCase):
    """Tests for SelectionResult dataclass."""
    
    def test_selection_result_creation(self) -> None:
        """Test SelectionResult creation."""
        result = SelectionResult(
            method_id="test_method",
            reason=SelectionReason.EXPLOITATION,
            confidence=0.9,
            exploration_probability=0.2,
            method_info={"category": "test"}
        )
        
        self.assertEqual(result.method_id, "test_method")
        self.assertEqual(result.reason, SelectionReason.EXPLOITATION)
        self.assertEqual(result.confidence, 0.9)
        self.assertEqual(result.exploration_probability, 0.2)
        self.assertEqual(result.method_info["category"], "test")


class TestRunHistory(unittest.TestCase):
    """Tests for RunHistory dataclass."""
    
    def test_run_history_creation(self) -> None:
        """Test RunHistory creation."""
        run = RunHistory(
            method_id="test_method",
            decision="KEEP",
            improvement=0.05,
            duration_ms=1000,
            recorded_at=datetime.now()
        )
        
        self.assertEqual(run.method_id, "test_method")
        self.assertEqual(run.decision, "KEEP")
        self.assertEqual(run.improvement, 0.05)


def run_tests() -> None:
    """Run all tests."""
    unittest.main(verbosity=2)


if __name__ == "__main__":
    run_tests()
