"""Example usage of selection strategies.

This file demonstrates how to use the selection strategies
for method exploration and exploitation.

Usage:
    cd /home/node/.openclaw/workspace/AutoCast
    python3 learning/analytics/example_usage.py
"""

import sys
sys.path.insert(0, '/home/node/.openclaw/workspace/AutoCast')

from learning.analytics.selection import (
    EpsilonGreedyStrategy,
    RandomStrategy,
    SuccessBasedStrategy,
    ThompsonSamplingStrategy,
    SelectionReason,
    MethodInfo,
    RunHistory,
    create_strategy,
)


def example_epsilon_greedy():
    """Example: Epsilon-Greedy Strategy."""
    print("=" * 50)
    print("Epsilon-Greedy Strategy Example")
    print("=" * 50)
    
    # Define available methods
    methods = [
        MethodInfo("noise_reduction", "filter", {"threshold": 0.5}, 
                   success_rate=0.8, total_runs=20),
        MethodInfo("volume_boost", "gain", {"db": 3.0}, 
                   success_rate=0.6, total_runs=15),
        MethodInfo("new_method", "experimental", {}, 
                   success_rate=0.0, total_runs=0),
    ]
    
    history = [
        RunHistory("noise_reduction", "KEEP", improvement=0.05),
        RunHistory("volume_boost", "REJECT", improvement=-0.01),
    ]
    
    # Create strategy with epsilon=0.2 (20% exploration)
    strategy = EpsilonGreedyStrategy(epsilon=0.2, seed=42)
    
    # Make selections
    for i in range(10):
        result = strategy.select(methods, history)
        reason_str = "EXPLORE" if result.reason == SelectionReason.EXPLORATION else "EXPLOIT"
        print(f"Selection {i+1}: {result.method_id} ({reason_str})")
    
    # Show stats
    stats = strategy.get_stats()
    print(f"\nStats: {stats}")


def example_with_decay():
    """Example: Epsilon-Greedy with Decay."""
    print("\n" + "=" * 50)
    print("Epsilon-Greedy with Decay Example")
    print("=" * 50)
    
    methods = [
        MethodInfo("method_a", "test", {}, success_rate=0.7, total_runs=10),
        MethodInfo("method_b", "test", {}, success_rate=0.5, total_runs=10),
    ]
    history = []
    
    # Create strategy with decay
    strategy = EpsilonGreedyStrategy(epsilon=1.0, decay=0.9, seed=42)
    
    print(f"Initial epsilon: {strategy.current_epsilon}")
    
    for i in range(10):
        result = strategy.select(methods, history)
        print(f"Step {i+1}: epsilon={strategy.current_epsilon:.4f}, "
              f"selected={result.method_id}")


def example_factory():
    """Example: Using the Strategy Factory."""
    print("\n" + "=" * 50)
    print("Strategy Factory Example")
    print("=" * 50)
    
    methods = [
        MethodInfo("m1", "test", {}, success_rate=0.8, total_runs=10),
        MethodInfo("m2", "test", {}, success_rate=0.4, total_runs=10),
    ]
    history = []
    
    # Create different strategies using factory
    strategies = ["random", "success_based", "epsilon_greedy", "thompson_sampling"]
    
    for name in strategies:
        strategy = create_strategy(name, seed=42)
        result = strategy.select(methods, history)
        print(f"{name:20s}: selected={result.method_id}, "
              f"reason={result.reason.name}")


def example_thompson_sampling():
    """Example: Thompson Sampling Strategy."""
    print("\n" + "=" * 50)
    print("Thompson Sampling Strategy Example")
    print("=" * 50)
    
    methods = [
        MethodInfo("proven", "test", {}, success_rate=0.9, total_runs=20),
        MethodInfo("untested", "test", {}, success_rate=0.0, total_runs=0),
    ]
    
    # History with 18 successes and 2 failures for "proven"
    history = []
    for _ in range(18):
        history.append(RunHistory("proven", "KEEP"))
    for _ in range(2):
        history.append(RunHistory("proven", "REJECT"))
    
    strategy = ThompsonSamplingStrategy(seed=42)
    
    # Count selections
    proven_count = 0
    untested_count = 0
    
    for _ in range(100):
        result = strategy.select(methods, history)
        if result.method_id == "proven":
            proven_count += 1
        else:
            untested_count += 1
    
    print(f"Proven method selected: {proven_count} times")
    print(f"Untested method selected: {untested_count} times")
    print("(Thompson sampling naturally explores untested methods)")


if __name__ == "__main__":
    example_epsilon_greedy()
    example_with_decay()
    example_factory()
    example_thompson_sampling()
