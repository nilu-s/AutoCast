#!/usr/bin/env python3
"""Similarity-Based Selection Engine for Method Dispatch.

Wählt Methoden basierend auf Similarity zu erfolgreichen Methoden aus
vergangenen Runs. Implementiert ε-greedy Strategy für Exploration/Exploitation.

Example:
    >>> from learning.selection.similarity_selector import SimilaritySelector
    >>> selector = SimilaritySelector(epsilon=0.2)
    >>> candidates = selector.select_method(
    ...     context={"audio_type": "podcast", "noise_level": "high"},
    ...     n_candidates=3
    ... )
    >>> print(candidates[0].method_id, candidates[0].score)
"""

import json
import logging
import os
import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import urlopen, Request
from urllib.error import URLError
import ssl

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_BRIDGE_HOST = os.environ.get('CHROMA_BRIDGE_HOST', 'localhost')
DEFAULT_BRIDGE_PORT = int(os.environ.get('CHROMA_BRIDGE_PORT', '8765'))
DEFAULT_EPSILON = 0.2
DEFAULT_MIN_SUCCESS_RATE = 0.3


@dataclass
class MethodCandidate:
    """Candidate method with similarity-based ranking score.
    
    Attributes:
        method_id: Unique identifier for the method.
        score: Combined score (success_rate × similarity_score).
        success_rate: Historical success rate of the method.
        similarity_score: Context similarity score (0.0 to 1.0).
        attempts: Number of historical attempts.
        context_match: How well method matches current context.
        metadata: Additional method metadata.
    """
    method_id: str
    score: float
    success_rate: float = 0.0
    similarity_score: float = 0.0
    attempts: int = 0
    context_match: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SelectionResult:
    """Result of a method selection operation.
    
    Attributes:
        candidates: List of ranked method candidates.
        selection_type: Type of selection ('exploration', 'exploitation').
        context: The context used for selection.
        epsilon: Epsilon value used for exploration decision.
        was_exploration: Whether this was an exploration selection.
    """
    candidates: List[MethodCandidate]
    selection_type: str
    context: Dict[str, Any]
    epsilon: float
    was_exploration: bool = False


@dataclass
class ContextEmbedding:
    """Context embedding for similarity search.
    
    Attributes:
        audio_type: Type of audio (podcast, interview, etc.).
        noise_level: Noise level (low, medium, high).
        speech_density: Speech density (sparse, normal, dense).
        duration_min: Duration in minutes.
        speaker_count: Number of speakers.
        embedding: Computed embedding vector (optional).
    """
    audio_type: str = "unknown"
    noise_level: str = "medium"
    speech_density: str = "normal"
    duration_min: float = 0.0
    speaker_count: int = 1
    embedding: Optional[List[float]] = None
    
    def to_text(self) -> str:
        """Convert context to text for embedding generation."""
        return (
            f"Audio type: {self.audio_type}. "
            f"Noise level: {self.noise_level}. "
            f"Speech density: {self.speech_density}. "
            f"Duration: {self.duration_min} minutes. "
            f"Speakers: {self.speaker_count}."
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "audio_type": self.audio_type,
            "noise_level": self.noise_level,
            "speech_density": self.speech_density,
            "duration_min": self.duration_min,
            "speaker_count": self.speaker_count,
        }


class ChromaBridgeClient:
    """HTTP Client for ChromaDB Bridge API.
    
    Communicates with the Python learning/bridge.py HTTP server
    to query method statistics and similarity data.
    """
    
    def __init__(self, host: str = DEFAULT_BRIDGE_HOST, port: int = DEFAULT_BRIDGE_PORT):
        """Initialize the bridge client.
        
        Args:
            host: Bridge server hostname.
            port: Bridge server port.
        """
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}"
        self._ssl_context = ssl.create_default_context()
        self._ssl_context.check_hostname = False
        self._ssl_context.verify_mode = ssl.CERT_NONE
        
    def _request(self, path: str, timeout: int = 5) -> Optional[Dict[str, Any]]:
        """Make HTTP GET request to bridge."""
        try:
            url = f"{self.base_url}{path}"
            req = Request(url, method='GET')
            req.add_header('Accept', 'application/json')
            
            with urlopen(req, timeout=timeout, context=self._ssl_context) as response:
                data = response.read().decode('utf-8')
                return json.loads(data) if data else {}
        except URLError as e:
            logger.warning(f"Bridge request failed: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON response: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return None
    
    def is_healthy(self) -> bool:
        """Check if bridge is healthy."""
        try:
            response = self._request('/health', timeout=2)
            if response is not None:
                return response.get('status') == 'ok'
            return False
        except Exception:
            return False
    
    def get_success_rate(self, method_id: str) -> Optional[Dict[str, Any]]:
        """Get success rate for a method.
        
        Args:
            method_id: Method identifier.
            
        Returns:
            Dict with success_rate, attempts, found status.
        """
        return self._request(f'/success-rate?method_id={method_id}')
    
    def get_top_methods(self, limit: int = 10, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get top performing methods.
        
        Args:
            limit: Maximum number of methods.
            category: Optional category filter.
            
        Returns:
            List of method dictionaries.
        """
        path = f'/top-methods?limit={limit}'
        if category:
            path += f'&category={category}'
        
        response = self._request(path)
        if response and 'methods' in response:
            return response['methods']
        return []
    
    def get_similar_methods(self, method_id: str, n: int = 5) -> List[Dict[str, Any]]:
        """Get similar methods to a given method.
        
        Args:
            method_id: Reference method ID.
            n: Number of similar methods.
            
        Returns:
            List of similar method dictionaries.
        """
        response = self._request(f'/similar-methods?method_id={method_id}&n={n}')
        if response and 'similar_methods' in response:
            return response['similar_methods']
        return []


class SimilaritySelector:
    """Selects methods based on similarity to successful methods.
    
    Uses ε-greedy strategy to balance exploration and exploitation:
    - With probability ε: select random method (exploration)
    - With probability 1-ε: select top similar successful method (exploitation)
    
    Ranking formula: score = success_rate × similarity_score
    
    Attributes:
        epsilon: Exploration probability (0.0 to 1.0).
        bridge_client: Client for ChromaDB Bridge API.
        min_success_rate: Minimum success rate to consider.
        seed: Random seed for reproducibility.
    """
    
    def __init__(
        self,
        epsilon: float = DEFAULT_EPSILON,
        min_success_rate: float = DEFAULT_MIN_SUCCESS_RATE,
        bridge_host: str = DEFAULT_BRIDGE_HOST,
        bridge_port: int = DEFAULT_BRIDGE_PORT,
        seed: int = 42
    ):
        """Initialize the similarity selector.
        
        Args:
            epsilon: Exploration probability (0.0 to 1.0).
            min_success_rate: Minimum success rate to consider successful.
            bridge_host: ChromaDB Bridge host.
            bridge_port: ChromaDB Bridge port.
            seed: Random seed for reproducibility.
        """
        self.epsilon = epsilon
        self.min_success_rate = min_success_rate
        self.bridge_client = ChromaBridgeClient(bridge_host, bridge_port)
        self._rng = random.Random(seed)
        self.seed = seed
        
        logger.info(
            f"SimilaritySelector initialized (epsilon={epsilon}, "
            f"min_success_rate={min_success_rate})"
        )
    
    def _context_to_embedding(self, context: Dict[str, Any]) -> ContextEmbedding:
        """Convert context dict to ContextEmbedding."""
        return ContextEmbedding(
            audio_type=context.get('audio_type', 'unknown'),
            noise_level=context.get('noise_level', 'medium'),
            speech_density=context.get('speech_density', 'normal'),
            duration_min=context.get('duration_min', 0.0),
            speaker_count=context.get('speaker_count', 1),
        )
    
    def _calculate_context_similarity(
        self,
        context: ContextEmbedding,
        method_metadata: Dict[str, Any]
    ) -> float:
        """Calculate similarity between context and method metadata.
        
        Simple matching based on shared attributes.
        Returns score between 0.0 and 1.0.
        """
        score = 0.0
        weights = {
            'audio_type': 0.3,
            'noise_level': 0.25,
            'speech_density': 0.25,
            'duration_min': 0.1,
            'speaker_count': 0.1,
        }
        
        context_dict = context.to_dict()
        
        for key, weight in weights.items():
            if key in method_metadata and key in context_dict:
                if method_metadata[key] == context_dict[key]:
                    score += weight
                elif key == 'duration_min':
                    # For duration, check if within 20% range
                    try:
                        meta_val = float(method_metadata[key])
                        ctx_val = float(context_dict[key])
                        if ctx_val > 0:
                            ratio = min(meta_val, ctx_val) / max(meta_val, ctx_val)
                            score += weight * ratio
                    except (ValueError, TypeError):
                        pass
        
        return score
    
    def _get_successful_methods(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get methods with success rate above threshold.
        
        Args:
            limit: Maximum number of methods to retrieve.
            
        Returns:
            List of successful method dictionaries.
        """
        all_methods = self.bridge_client.get_top_methods(limit=limit)
        successful = [
            m for m in all_methods
            if m.get('success_rate', 0) >= self.min_success_rate
            and m.get('attempts', 0) >= 1
        ]
        return successful
    
    def _rank_candidates(
        self,
        methods: List[Dict[str, Any]],
        context: ContextEmbedding
    ) -> List[MethodCandidate]:
        """Rank method candidates by combined score.
        
        Score = success_rate × similarity_score
        
        Args:
            methods: List of method dictionaries.
            context: Current context embedding.
            
        Returns:
            List of ranked MethodCandidate objects.
        """
        candidates = []
        
        for method in methods:
            method_id = method.get('method_id', '')
            success_rate = method.get('success_rate', 0.0)
            attempts = method.get('attempts', 0)
            
            # Calculate context similarity
            metadata = method.get('metadata', {})
            if not metadata:
                metadata = {k: v for k, v in method.items() if k not in ['method_id', 'success_rate', 'attempts']}
            
            similarity = self._calculate_context_similarity(context, metadata)
            
            # Combined score
            score = success_rate * similarity if success_rate > 0 else similarity * 0.5
            
            candidate = MethodCandidate(
                method_id=method_id,
                score=score,
                success_rate=success_rate,
                similarity_score=similarity,
                attempts=attempts,
                context_match=similarity,
                metadata=metadata
            )
            candidates.append(candidate)
        
        # Sort by score descending
        candidates.sort(key=lambda x: x.score, reverse=True)
        return candidates
    
    def select_method(
        self,
        context: Dict[str, Any],
        n_candidates: int = 3,
        available_methods: Optional[List[str]] = None
    ) -> List[MethodCandidate]:
        """Select methods based on similarity to successful methods.
        
        1. Suche ähnliche Kontexte in ChromaDB
        2. Finde erfolgreiche Methoden aus ähnlichen Runs
        3. Return ranked candidates
        
        Uses ε-greedy strategy:
        - With probability ε: return random candidates (exploration)
        - With probability 1-ε: return top similar candidates (exploitation)
        
        Args:
            context: Context dict with keys like audio_type, noise_level, etc.
            n_candidates: Number of candidates to return.
            available_methods: Optional list of available method IDs to filter.
            
        Returns:
            List of ranked MethodCandidate objects.
        """
        context_embedding = self._context_to_embedding(context)
        
        # Check if bridge is available
        if not self.bridge_client.is_healthy():
            logger.warning("ChromaDB Bridge not available - using fallback")
            return self._fallback_selection(context, n_candidates, available_methods)
        
        # ε-greedy decision
        is_exploration = self._rng.random() < self.epsilon
        
        if is_exploration:
            logger.info(f"EXPLORATION: Selecting random methods (ε={self.epsilon})")
            return self._exploration_selection(context, n_candidates, available_methods)
        
        logger.info(f"EXPLOITATION: Selecting similar successful methods")
        return self._exploitation_selection(context_embedding, n_candidates, available_methods)
    
    def _exploration_selection(
        self,
        context: Dict[str, Any],
        n_candidates: int,
        available_methods: Optional[List[str]] = None
    ) -> List[MethodCandidate]:
        """Select random methods for exploration."""
        # Get all methods
        all_methods = self.bridge_client.get_top_methods(limit=100)
        
        if available_methods:
            all_methods = [m for m in all_methods if m.get('method_id') in available_methods]
        
        if not all_methods:
            return self._fallback_selection(context, n_candidates, available_methods)
        
        # Random selection
        selected = self._rng.sample(all_methods, min(n_candidates, len(all_methods)))
        
        candidates = []
        for method in selected:
            candidates.append(MethodCandidate(
                method_id=method.get('method_id', ''),
                score=0.5,  # Neutral score for exploration
                success_rate=method.get('success_rate', 0.0),
                similarity_score=0.0,
                attempts=method.get('attempts', 0),
                context_match=0.0,
                metadata={'selection_type': 'exploration'}
            ))
        
        return candidates
    
    def _exploitation_selection(
        self,
        context: ContextEmbedding,
        n_candidates: int,
        available_methods: Optional[List[str]] = None
    ) -> List[MethodCandidate]:
        """Select top similar successful methods for exploitation."""
        # Get successful methods
        successful = self._get_successful_methods(limit=50)
        
        if available_methods:
            successful = [m for m in successful if m.get('method_id') in available_methods]
        
        if not successful:
            logger.info("No successful methods found - falling back to exploration")
            return self._exploration_selection(context.to_dict(), n_candidates, available_methods)
        
        # Rank candidates
        candidates = self._rank_candidates(successful, context)
        
        # Return top N
        return candidates[:n_candidates]
    
    def _fallback_selection(
        self,
        context: Dict[str, Any],
        n_candidates: int,
        available_methods: Optional[List[str]] = None
    ) -> List[MethodCandidate]:
        """Fallback when bridge is unavailable - return neutral candidates."""
        logger.warning("Using fallback selection - bridge unavailable")
        
        if available_methods:
            # Return available methods with neutral scores
            return [
                MethodCandidate(
                    method_id=mid,
                    score=0.5,
                    success_rate=0.0,
                    similarity_score=0.0,
                    attempts=0,
                    context_match=0.0,
                    metadata={'selection_type': 'fallback'}
                )
                for mid in available_methods[:n_candidates]
            ]
        
        # Return empty candidates
        return []
    
    def get_selection_result(
        self,
        context: Dict[str, Any],
        n_candidates: int = 3,
        available_methods: Optional[List[str]] = None
    ) -> SelectionResult:
        """Get full selection result with metadata.
        
        Args:
            context: Context dict.
            n_candidates: Number of candidates.
            available_methods: Optional filter list.
            
        Returns:
            SelectionResult with candidates and metadata.
        """
        was_exploration = self._rng.random() < self.epsilon
        candidates = self.select_method(context, n_candidates, available_methods)
        
        return SelectionResult(
            candidates=candidates,
            selection_type='exploration' if was_exploration else 'exploitation',
            context=context,
            epsilon=self.epsilon,
            was_exploration=was_exploration
        )
    
    def reset_rng(self) -> None:
        """Reset random number generator for reproducibility."""
        self._rng = random.Random(self.seed)
        logger.debug(f"RNG reset with seed {self.seed}")


def create_selector(
    epsilon: float = DEFAULT_EPSILON,
    **kwargs
) -> SimilaritySelector:
    """Factory function to create a SimilaritySelector.
    
    Args:
        epsilon: Exploration probability.
        **kwargs: Additional arguments for SimilaritySelector.
        
    Returns:
        Configured SimilaritySelector instance.
        
    Example:
        >>> selector = create_selector(epsilon=0.2, seed=42)
    """
    return SimilaritySelector(epsilon=epsilon, **kwargs)


# Feature flag support
def is_similarity_selection_enabled() -> bool:
    """Check if similarity selection feature is enabled.
    
    Returns:
        True if L2_SIMILARITY_SELECTION feature is enabled.
    """
    try:
        from learning.config import FEATURES
        return FEATURES.get("L2_SIMILARITY_SELECTION", False)
    except ImportError:
        # Default to True if config not available
        return True


if __name__ == '__main__':
    # Simple CLI test
    import argparse
    
    parser = argparse.ArgumentParser(description='Similarity Selector CLI')
    parser.add_argument('--test', action='store_true', help='Run tests')
    parser.add_argument('--context', type=str, help='JSON context string')
    parser.add_argument('--epsilon', type=float, default=0.2)
    parser.add_argument('--n', type=int, default=3, help='Number of candidates')
    
    args = parser.parse_args()
    
    if args.test:
        print("Testing SimilaritySelector...")
        
        # Create selector
        selector = SimilaritySelector(epsilon=args.epsilon, seed=42)
        
        # Test context
        context = {
            "audio_type": "podcast",
            "noise_level": "high",
            "speech_density": "normal",
            "duration_min": 30.0,
            "speaker_count": 2
        }
        
        # Test selection
        result = selector.get_selection_result(context, n_candidates=args.n)
        
        print(f"\nSelection Type: {result.selection_type}")
        print(f"Epsilon: {result.epsilon}")
        print(f"Was Exploration: {result.was_exploration}")
        print(f"\nCandidates ({len(result.candidates)}):")
        
        for i, candidate in enumerate(result.candidates, 1):
            print(f"  {i}. {candidate.method_id}")
            print(f"     Score: {candidate.score:.3f}")
            print(f"     Success Rate: {candidate.success_rate:.3f}")
            print(f"     Similarity: {candidate.similarity_score:.3f}")
            print(f"     Attempts: {candidate.attempts}")
        
        print("\nTest complete!")
        
    elif args.context:
        context = json.loads(args.context)
        selector = SimilaritySelector(epsilon=args.epsilon)
        
        result = selector.get_selection_result(context, n_candidates=args.n)
        
        print(json.dumps({
            'selection_type': result.selection_type,
            'candidates': [
                {
                    'method_id': c.method_id,
                    'score': c.score,
                    'success_rate': c.success_rate,
                    'similarity': c.similarity_score
                }
                for c in result.candidates
            ]
        }, indent=2))
    else:
        print("Use --test to run tests or provide --context with JSON")