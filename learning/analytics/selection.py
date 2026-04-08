"""Selection strategies for method exploration and exploitation.

This module provides various selection strategies for choosing methods
to apply, balancing exploration (trying new methods) and exploitation
(using known good methods).

Example:
    >>> from learning.analytics.selection import EpsilonGreedyStrategy
    >>> strategy = EpsilonGreedyStrategy(epsilon=0.2, seed=42)
    >>> selected = strategy.select(pending_methods, history)
    >>> print(selected.reason)
    SelectionReason.EXPLOITATION

Supported strategies:
    - RandomStrategy: Pure random selection (baseline)
    - SuccessBasedStrategy: Select by success rate
    - EpsilonGreedyStrategy: Balance exploration/exploitation with epsilon-greedy
    - ThompsonSamplingStrategy: Bayesian approach using Thompson sampling
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
import random
import statistics
from typing import Any, Dict, List, Optional, Protocol, Tuple, Union


class SelectionReason(Enum):
    """Reason why a method was selected.
    
    Attributes:
        EXPLORATION: Selected randomly for exploration.
        EXPLOITATION: Selected as best-known method.
        THOMPSON_SAMPLING: Selected via Thompson sampling.
        RANDOM: Selected purely at random.
        UNKNOWN: Selection reason not determined.
    """
    EXPLORATION = auto()
    EXPLOITATION = auto()
    THOMPSON_SAMPLING = auto()
    RANDOM = auto()
    UNKNOWN = auto()


@dataclass
class SelectionResult:
    """Result of a method selection.
    
    Attributes:
        method_id: The selected method identifier.
        reason: Why this method was selected.
        confidence: Confidence score (0.0 to 1.0).
        exploration_probability: Probability of exploration for this selection.
        method_info: Additional method information.
    """
    method_id: str
    reason: SelectionReason
    confidence: float
    exploration_probability: float
    method_info: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MethodInfo:
    """Information about a method for selection purposes.
    
    Attributes:
        method_id: Unique identifier for the method.
        category: Method category/type.
        parameters: Method parameters.
        success_rate: Current success rate (0.0 to 1.0).
        total_runs: Total number of runs.
        avg_improvement: Average improvement when kept.
        last_run: Timestamp of last run.
    """
    method_id: str
    category: str
    parameters: Dict[str, Any]
    success_rate: float = 0.0
    total_runs: int = 0
    avg_improvement: float = 0.0
    last_run: Optional[datetime] = None
    
    @property
    def is_explored(self) -> bool:
        """Check if method has been sufficiently explored.
        
        Returns:
            True if method has at least 3 runs.
        """
        return self.total_runs >= 3


@dataclass
class RunHistory:
    """History of method runs.
    
    Attributes:
        method_id: The method that was run.
        decision: Run decision (KEEP, REJECT, FAILED).
        improvement: Score improvement.
        duration_ms: Run duration in milliseconds.
        recorded_at: Timestamp of the run.
    """
    method_id: str
    decision: str
    improvement: Optional[float] = None
    duration_ms: Optional[float] = None
    recorded_at: Optional[datetime] = None


class SelectionStrategy(ABC):
    """Abstract base class for method selection strategies.
    
    All selection strategies must implement the `select` method
    which chooses a method from pending methods based on history.
    
    Args:
        seed: Random seed for determinism. Default is 42.
    
    Attributes:
        seed: The random seed used.
        _rng: Internal random number generator.
    
    Example:
        >>> class MyStrategy(SelectionStrategy):
        ...     def select(self, pending, history):
        ...         return SelectionResult("method_1", SelectionReason.RANDOM, 1.0, 0.0)
    """
    
    def __init__(self, seed: int = 42) -> None:
        """Initialize the selection strategy.
        
        Args:
            seed: Random seed for reproducibility.
        """
        self.seed = seed
        self._rng = random.Random(seed)
    
    @abstractmethod
    def select(
        self,
        pending_methods: List[MethodInfo],
        history: List[RunHistory]
    ) -> SelectionResult:
        """Select a method from pending methods.
        
        Args:
            pending_methods: List of methods available for selection.
            history: History of previous runs.
        
        Returns:
            SelectionResult with selected method and metadata.
        
        Raises:
            ValueError: If pending_methods is empty.
        """
        pass
    
    def reset_rng(self) -> None:
        """Reset the random number generator to initial state.
        
        Useful for testing determinism.
        """
        self._rng = random.Random(self.seed)


class RandomStrategy(SelectionStrategy):
    """Pure random selection strategy.
    
    This is the simplest baseline strategy - selects methods
    completely at random, ignoring any historical performance data.
    
    Args:
        seed: Random seed for determinism. Default is 42.
    
    Example:
        >>> strategy = RandomStrategy(seed=42)
        >>> result = strategy.select(pending_methods, history)
        >>> print(result.method_id)
        'some_method'
    """
    
    def select(
        self,
        pending_methods: List[MethodInfo],
        history: List[RunHistory]
    ) -> SelectionResult:
        """Select a random method.
        
        Args:
            pending_methods: List of methods available for selection.
            history: History of previous runs (ignored).
        
        Returns:
            SelectionResult with randomly selected method.
        
        Raises:
            ValueError: If pending_methods is empty.
        """
        if not pending_methods:
            raise ValueError("Cannot select from empty pending_methods list")
        
        selected = self._rng.choice(pending_methods)
        
        return SelectionResult(
            method_id=selected.method_id,
            reason=SelectionReason.RANDOM,
            confidence=1.0 / len(pending_methods),
            exploration_probability=1.0,
            method_info={
                'category': selected.category,
                'total_runs': selected.total_runs,
                'success_rate': selected.success_rate,
            }
        )


class SuccessBasedStrategy(SelectionStrategy):
    """Selection strategy based on success rate.
    
    Always selects the method with the highest success rate.
    Pure exploitation strategy with no exploration.
    
    For untested methods (0 runs), uses a default success rate
    of 0.5 to allow selection.
    
    Args:
        default_success_rate: Success rate for untested methods. Default 0.5.
        seed: Random seed for determinism. Default is 42.
    
    Example:
        >>> strategy = SuccessBasedStrategy(default_success_rate=0.5)
        >>> result = strategy.select(pending_methods, history)
    """
    
    def __init__(
        self,
        default_success_rate: float = 0.5,
        seed: int = 42
    ) -> None:
        """Initialize success-based strategy.
        
        Args:
            default_success_rate: Success rate for untested methods.
            seed: Random seed for reproducibility.
        """
        super().__init__(seed)
        self.default_success_rate = default_success_rate
    
    def select(
        self,
        pending_methods: List[MethodInfo],
        history: List[RunHistory]
    ) -> SelectionResult:
        """Select method with highest success rate.
        
        Args:
            pending_methods: List of methods available for selection.
            history: History of previous runs (used for stats).
        
        Returns:
            SelectionResult with best method selected.
        
        Raises:
            ValueError: If pending_methods is empty.
        """
        if not pending_methods:
            raise ValueError("Cannot select from empty pending_methods list")
        
        # Calculate effective success rate for each method
        def get_success_rate(method: MethodInfo) -> float:
            if method.total_runs == 0:
                return self.default_success_rate
            return method.success_rate
        
        # Sort by success rate descending
        sorted_methods = sorted(
            pending_methods,
            key=get_success_rate,
            reverse=True
        )
        
        selected = sorted_methods[0]
        effective_rate = get_success_rate(selected)
        
        return SelectionResult(
            method_id=selected.method_id,
            reason=SelectionReason.EXPLOITATION,
            confidence=effective_rate,
            exploration_probability=0.0,
            method_info={
                'category': selected.category,
                'total_runs': selected.total_runs,
                'success_rate': selected.success_rate,
                'effective_success_rate': effective_rate,
            }
        )


class EpsilonGreedyStrategy(SelectionStrategy):
    """Epsilon-greedy selection strategy.
    
    Balances exploration and exploitation:
    - With probability epsilon: explore (select random method)
    - With probability 1-epsilon: exploit (select best method)
    
    Supports optional decay to reduce exploration over time.
    
    Args:
        epsilon: Exploration probability (0.0 to 1.0). Default 0.2.
        decay: Optional decay rate per selection (0.0 to 1.0). Default None.
        default_success_rate: Success rate for untested methods. Default 0.5.
        seed: Random seed for determinism. Default is 42.
    
    Attributes:
        current_epsilon: Current epsilon value (after decay).
        selection_count: Number of selections made.
    
    Example:
        >>> strategy = EpsilonGreedyStrategy(epsilon=0.2, seed=42)
        >>> result = strategy.select(pending_methods, history)
        >>> # 80% chance: best method, 20% chance: random method
    """
    
    def __init__(
        self,
        epsilon: float = 0.2,
        decay: Optional[float] = None,
        default_success_rate: float = 0.5,
        seed: int = 42
    ) -> None:
        """Initialize epsilon-greedy strategy.
        
        Args:
            epsilon: Initial exploration probability.
            decay: Optional decay rate per selection (e.g., 0.99).
            default_success_rate: Success rate for untested methods.
            seed: Random seed for reproducibility.
        """
        super().__init__(seed)
        self.epsilon = epsilon
        self.initial_epsilon = epsilon
        self.decay = decay
        self.default_success_rate = default_success_rate
        self.current_epsilon = epsilon
        self.selection_count = 0
    
    def select(
        self,
        pending_methods: List[MethodInfo],
        history: List[RunHistory]
    ) -> SelectionResult:
        """Select method using epsilon-greedy algorithm.
        
        Args:
            pending_methods: List of methods available for selection.
            history: History of previous runs.
        
        Returns:
            SelectionResult with selected method and metadata.
        
        Raises:
            ValueError: If pending_methods is empty.
        """
        if not pending_methods:
            raise ValueError("Cannot select from empty pending_methods list")
        
        # Decide: explore or exploit?
        is_exploration = self._rng.random() < self.current_epsilon
        
        if is_exploration:
            # Exploration: select random method
            selected = self._rng.choice(pending_methods)
            result = SelectionResult(
                method_id=selected.method_id,
                reason=SelectionReason.EXPLORATION,
                confidence=self.current_epsilon / len(pending_methods),
                exploration_probability=self.current_epsilon,
                method_info={
                    'category': selected.category,
                    'total_runs': selected.total_runs,
                    'success_rate': selected.success_rate,
                }
            )
        else:
            # Exploitation: select best method
            result = self._select_best(pending_methods)
        
        # Update selection count and decay epsilon
        self.selection_count += 1
        if self.decay is not None:
            self.current_epsilon *= self.decay
        
        return result
    
    def _select_best(
        self,
        pending_methods: List[MethodInfo]
    ) -> SelectionResult:
        """Select the best method by success rate.
        
        Args:
            pending_methods: List of methods to choose from.
        
        Returns:
            SelectionResult with best method.
        """
        def get_success_rate(method: MethodInfo) -> float:
            if method.total_runs == 0:
                return self.default_success_rate
            return method.success_rate
        
        sorted_methods = sorted(
            pending_methods,
            key=get_success_rate,
            reverse=True
        )
        
        selected = sorted_methods[0]
        
        return SelectionResult(
            method_id=selected.method_id,
            reason=SelectionReason.EXPLOITATION,
            confidence=get_success_rate(selected),
            exploration_probability=self.current_epsilon,
            method_info={
                'category': selected.category,
                'total_runs': selected.total_runs,
                'success_rate': selected.success_rate,
            }
        )
    
    def reset(self) -> None:
        """Reset epsilon to initial value and selection count."""
        self.current_epsilon = self.initial_epsilon
        self.selection_count = 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current strategy statistics.
        
        Returns:
            Dictionary with epsilon stats.
        """
        return {
            'initial_epsilon': self.initial_epsilon,
            'current_epsilon': self.current_epsilon,
            'selection_count': self.selection_count,
            'decay': self.decay,
        }


class ThompsonSamplingStrategy(SelectionStrategy):
    """Thompson sampling selection strategy.
    
    Bayesian approach that samples from the posterior distribution
    of each method's success rate.
    
    Uses Beta distribution (conjugate prior for Bernoulli trials):
    - Prior: Beta(1, 1) = Uniform
    - Posterior: Beta(1 + successes, 1 + failures)
    
    Naturally balances exploration/exploitation without explicit epsilon.
    
    Args:
        seed: Random seed for determinism. Default is 42.
        alpha_prior: Prior alpha parameter. Default 1.0.
        beta_prior: Prior beta parameter. Default 1.0.
    
    Example:
        >>> strategy = ThompsonSamplingStrategy(seed=42)
        >>> result = strategy.select(pending_methods, history)
        >>> print(result.reason)
        SelectionReason.THOMPSON_SAMPLING
    """
    
    def __init__(
        self,
        seed: int = 42,
        alpha_prior: float = 1.0,
        beta_prior: float = 1.0
    ) -> None:
        """Initialize Thompson sampling strategy.
        
        Args:
            seed: Random seed for reproducibility.
            alpha_prior: Prior alpha parameter for Beta distribution.
            beta_prior: Prior beta parameter for Beta distribution.
        """
        super().__init__(seed)
        self.alpha_prior = alpha_prior
        self.beta_prior = beta_prior
    
    def select(
        self,
        pending_methods: List[MethodInfo],
        history: List[RunHistory]
    ) -> SelectionResult:
        """Select method using Thompson sampling.
        
        Args:
            pending_methods: List of methods available for selection.
            history: History of previous runs.
        
        Returns:
            SelectionResult with selected method.
        
        Raises:
            ValueError: If pending_methods is empty.
        """
        if not pending_methods:
            raise ValueError("Cannot select from empty pending_methods list")
        
        # Sample from each method's posterior
        samples = []
        for method in pending_methods:
            alpha, beta = self._get_beta_params(method, history)
            # Beta distribution sample
            sample = self._beta_sample(alpha, beta)
            samples.append((method, sample, alpha, beta))
        
        # Select method with highest sample
        selected_method, sample_val, alpha, beta = max(samples, key=lambda x: x[1])
        
        return SelectionResult(
            method_id=selected_method.method_id,
            reason=SelectionReason.THOMPSON_SAMPLING,
            confidence=sample_val,
            exploration_probability=0.0,  # Implicit in sampling
            method_info={
                'category': selected_method.category,
                'total_runs': selected_method.total_runs,
                'success_rate': selected_method.success_rate,
                'posterior_alpha': alpha,
                'posterior_beta': beta,
                'sample_value': sample_val,
            }
        )
    
    def _get_beta_params(
        self,
        method: MethodInfo,
        history: List[RunHistory]
    ) -> Tuple[float, float]:
        """Calculate Beta distribution parameters for a method.
        
        Args:
            method: The method to calculate params for.
            history: Full run history.
        
        Returns:
            Tuple of (alpha, beta) parameters.
        """
        # Count successes and failures from history
        successes = 0
        failures = 0
        
        for run in history:
            if run.method_id == method.method_id:
                if run.decision == 'KEEP':
                    successes += 1
                elif run.decision == 'REJECT':
                    failures += 1
                # FAILED doesn't count as success or failure
        
        # Posterior parameters
        alpha = self.alpha_prior + successes
        beta = self.beta_prior + failures
        
        return alpha, beta
    
    def _beta_sample(self, alpha: float, beta: float) -> float:
        """Sample from Beta distribution using Gamma distributions.
        
        Beta(alpha, beta) = Gamma(alpha, 1) / (Gamma(alpha, 1) + Gamma(beta, 1))
        
        Args:
            alpha: Alpha parameter.
            beta: Beta parameter.
        
        Returns:
            Sample from Beta distribution.
        """
        # Using Gamma distribution sampling
        # Gamma(k, theta) where k=shape, theta=scale
        # For Beta: alpha, beta are the shape parameters
        
        x = self._gamma_sample(alpha)
        y = self._gamma_sample(beta)
        
        return x / (x + y) if (x + y) > 0 else 0.5
    
    def _gamma_sample(self, shape: float) -> float:
        """Sample from Gamma distribution using Marsaglia-Tsang method.
        
        Args:
            shape: Shape parameter (k > 0).
        
        Returns:
            Sample from Gamma(shape, 1).
        """
        if shape < 1:
            # Use property: Gamma(a) = Gamma(a+1) * U^(1/a)
            return self._gamma_sample(shape + 1) * (self._rng.random() ** (1.0 / shape))
        
        if shape == 1.0:
            # Exponential distribution
            return -1.0 * (1.0 / (self._rng.random() + 1e-10))  # Avoid log(0)
        
        # Marsaglia and Tsang method for shape >= 1
        d = shape - 1.0 / 3.0
        c = 1.0 / (9.0 * d) ** 0.5
        
        while True:
            x = self._rng.gauss(0, 1)
            v = 1.0 + c * x
            
            if v <= 0:
                continue
            
            v = v * v * v
            u = self._rng.random()
            
            if u < 1.0 - 0.0331 * (x * x) * (x * x):
                return d * v
            
            if (1.0 / (1.0 + 1e-10)) < 1.0:  # log(u) check
                if x * x / 2.0 + d * (1.0 - v + (1.0 if v <= 0 else (v if v <= 0 else (v if v <= 0 else v)))) < 0:
                    continue
            
            # Simplified acceptance check
            if u < 1.0 and x * x / 2.0 + d * (1.0 - v + (1.0 if v <= 0 else 0)) < 0:
                continue
            
            return d * v


# Factory for creating strategies
STRATEGY_REGISTRY: Dict[str, type] = {
    'random': RandomStrategy,
    'success_based': SuccessBasedStrategy,
    'epsilon_greedy': EpsilonGreedyStrategy,
    'thompson_sampling': ThompsonSamplingStrategy,
}


def create_strategy(
    strategy_name: str,
    **kwargs: Any
) -> SelectionStrategy:
    """Create a selection strategy by name.
    
    Args:
        strategy_name: Name of the strategy to create.
        **kwargs: Additional arguments for the strategy.
    
    Returns:
        Instance of the requested strategy.
    
    Raises:
        ValueError: If strategy_name is not recognized.
    
    Example:
        >>> strategy = create_strategy('epsilon_greedy', epsilon=0.2, seed=42)
    """
    if strategy_name not in STRATEGY_REGISTRY:
        raise ValueError(
            f"Unknown strategy: {strategy_name}. "
            f"Available: {list(STRATEGY_REGISTRY.keys())}"
        )
    
    strategy_class = STRATEGY_REGISTRY[strategy_name]
    return strategy_class(**kwargs)


def get_available_strategies() -> List[str]:
    """Get list of available strategy names.
    
    Returns:
        List of strategy names.
    """
    return list(STRATEGY_REGISTRY.keys())
