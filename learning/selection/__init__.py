"""Selection module for similarity-based method selection.

This module provides the SimilaritySelector class for context-based
method selection using ChromaDB embeddings and ε-greedy strategy.

Example:
    >>> from learning.selection import SimilaritySelector, MethodCandidate
    >>> selector = SimilaritySelector(epsilon=0.2)
    >>> candidates = selector.select_method(
    ...     context={"audio_type": "podcast", "noise_level": "high"},
    ...     n_candidates=3
    ... )
"""

from .similarity_selector import (
    SimilaritySelector,
    MethodCandidate,
    SelectionResult,
    ContextEmbedding,
)

__all__ = [
    "SimilaritySelector",
    "MethodCandidate",
    "SelectionResult",
    "ContextEmbedding",
]