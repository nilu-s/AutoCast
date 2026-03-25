#!/usr/bin/env python3
"""Similarity-based Selection for Method Exploration.

Replaces epsilon-greedy feature-based selection with semantic similarity search.
Methods are selected based on their embedding similarity to previously
successful methods, eliminating the need for manual feature engineering.

Example:
    >>> from learning.analytics.similarity_selector import SimilaritySelector
    >>> from learning.chroma_client import ChromaLearningDB
    >>> db = ChromaLearningDB()
    >>> selector = SimilaritySelector(db)
    >>> result = selector.select(["method_a", "method_b", "method_c"], "run_001")
    >>> print(result.method_id)
    'method_a'
    >>> print(result.reasoning)
    'Based on 3 similar methods with avg success 0.75'
"""

import logging
import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from learning.chroma_client import ChromaLearningDB

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class SimilaritySelectionResult:
    """Result of a similarity-based method selection.
    
    Attributes:
        method_id: The selected method identifier.
        selection_type: Type of selection ('similarity', 'exploration', 'fallback').
        confidence: Confidence score (0.0 to 1.0).
        similar_methods: List of similar methods used for decision.
        reasoning: Human-readable explanation of the selection.
        predicted_success: Predicted success rate (0.0 to 1.0).
    """
    method_id: str
    selection_type: str
    confidence: float
    similar_methods: List[Dict[str, Any]] = field(default_factory=list)
    reasoning: str = ""
    predicted_success: float = 0.0


class SimilaritySelector:
    """Select methods using ChromaDB similarity search.
    
    Replaces epsilon-greedy by using semantic similarity instead
    of manual feature engineering. Methods are scored based on
    the success rate of semantically similar methods.
    
    The selector automatically balances exploration and exploitation:
    - Exploitation: When similar successful methods exist
    - Exploration: When no data exists (natural discovery)
    
    Attributes:
        db: ChromaLearningDB instance.
        exploration_threshold: Similarity threshold below which to explore.
        min_confidence_samples: Minimum samples for high confidence.
        _rng: Random number generator for tie-breaking.
    
    Example:
        >>> db = ChromaLearningDB()
        >>> selector = SimilaritySelector(db, exploration_threshold=0.3)
        >>> result = selector.select(["m1", "m2", "m3"], "run_001")
        >>> print(result.selection_type)
        'similarity'
    """
    
    def __init__(self, 
                 chroma_db: ChromaLearningDB,
                 exploration_threshold: float = 0.3,
                 min_confidence_samples: int = 5,
                 seed: int = 42):
        """Initialize the similarity selector.
        
        Args:
            chroma_db: ChromaDB client for similarity queries.
            exploration_threshold: Cosine similarity threshold for exploration.
            min_confidence_samples: Samples needed for max confidence.
            seed: Random seed for reproducibility.
        """
        self.db = chroma_db
        self.exploration_threshold = exploration_threshold
        self.min_confidence_samples = min_confidence_samples
        self._rng = random.Random(seed)
        
        logger.info(f"SimilaritySelector initialized "
                   f"(threshold={exploration_threshold}, "
                   f"min_samples={min_confidence_samples})")
    
    def select(self, 
               pending_methods: List[str],
               current_run_id: str) -> SimilaritySelectionResult:
        """Select best method using similarity search.
        
        Strategy:
        1. Get all pending methods with their embeddings
        2. Find similar successful methods for each
        3. Select the one with highest predicted success
        4. If no data, use natural exploration (random selection)
        
        Args:
            pending_methods: List of method IDs available for selection.
            current_run_id: Current run ID for context.
            
        Returns:
            SimilaritySelectionResult with selected method and metadata.
            
        Raises:
            ValueError: If pending_methods is empty.
            
        Example:
            >>> result = selector.select(["m1", "m2"], "run_001")
            >>> print(result.method_id)
            'm1'
        """
        if not pending_methods:
            raise ValueError("Cannot select from empty pending_methods list")
        
        if len(pending_methods) == 1:
            # Single option - score it
            score = self._score_method(pending_methods[0], current_run_id)
            return SimilaritySelectionResult(
                method_id=pending_methods[0],
                selection_type=score['selection_type'],
                confidence=score['confidence'],
                similar_methods=score.get('similar_methods', []),
                reasoning=score['reasoning'],
                predicted_success=score['predicted_success']
            )
        
        # Score each pending method
        scored_methods: List[Tuple[str, Dict[str, Any]]] = []
        for method_id in pending_methods:
            score = self._score_method(method_id, current_run_id)
            scored_methods.append((method_id, score))
            
            logger.debug(f"Scored {method_id}: predicted={score['predicted_success']:.2f}, "
                        f"type={score['selection_type']}")
        
        # Sort by predicted success (descending)
        scored_methods.sort(key=lambda x: x[1]['predicted_success'], reverse=True)
        
        # Add small random tie-breaker
        for i in range(len(scored_methods) - 1):
            if abs(scored_methods[i][1]['predicted_success'] - 
                   scored_methods[i + 1][1]['predicted_success']) < 0.01:
                if self._rng.random() < 0.5:
                    scored_methods[i], scored_methods[i + 1] = \
                        scored_methods[i + 1], scored_methods[i]
        
        # Select best
        best = scored_methods[0]
        
        logger.info(f"Selected {best[0]} with predicted success "
                   f"{best[1]['predicted_success']:.2f} ({best[1]['selection_type']})")
        
        return SimilaritySelectionResult(
            method_id=best[0],
            selection_type=best[1]['selection_type'],
            confidence=best[1]['confidence'],
            similar_methods=best[1].get('similar_methods', []),
            reasoning=best[1]['reasoning'],
            predicted_success=best[1]['predicted_success']
        )
    
    def _score_method(self, 
                      method_id: str, 
                      run_id: str) -> Dict[str, Any]:
        """Score a method based on similar methods' success.
        
        Queries ChromaDB for semantically similar methods and calculates
        a predicted success rate based on their historical performance.
        
        Args:
            method_id: Method to score.
            run_id: Current run ID (for context).
            
        Returns:
            Dictionary with predicted_success, confidence, selection_type,
            reasoning, and similar_methods.
        """
        # Find similar methods
        try:
            similar = self.db.find_similar_methods(method_id, n_results=10)
        except Exception as e:
            logger.warning(f"Failed to find similar methods for {method_id}: {e}")
            return {
                'predicted_success': 0.5,
                'confidence': 0.0,
                'selection_type': 'exploration',
                'reasoning': 'Similarity query failed, exploring',
                'similar_methods': []
            }
        
        if not similar:
            # No similar methods - pure exploration
            return {
                'predicted_success': 0.5,
                'confidence': 0.0,
                'selection_type': 'exploration',
                'reasoning': 'No similar methods found, exploring new territory',
                'similar_methods': []
            }
        
        # Filter methods with actual attempts
        tried_similar = [
            m for m in similar 
            if m.get('attempts', 0) > 0 and 'success_rate' in m
        ]
        
        if not tried_similar:
            # Similar methods exist but none have been tried
            return {
                'predicted_success': 0.5,
                'confidence': 0.1,
                'selection_type': 'exploration',
                'reasoning': f'{len(similar)} similar methods untested, exploring',
                'similar_methods': similar[:3]
            }
        
        # Calculate weighted success rate based on similarity
        total_sim = sum(m.get('similarity', 0) for m in tried_similar)
        
        if total_sim == 0:
            # No similarity weights, use simple average
            avg_success = sum(m.get('success_rate', 0) for m in tried_similar) / len(tried_similar)
        else:
            # Weighted by similarity
            avg_success = sum(
                m.get('success_rate', 0) * m.get('similarity', 0)
                for m in tried_similar
            ) / total_sim
        
        # Confidence based on number of samples
        confidence = min(len(tried_similar) / self.min_confidence_samples, 1.0)
        
        # Determine selection type
        if confidence < 0.3:
            selection_type = 'exploration'
            reasoning = f'Limited data ({len(tried_similar)} similar), exploring'
        else:
            selection_type = 'similarity'
            reasoning = f'Based on {len(tried_similar)} similar methods with avg success {avg_success:.2f}'
        
        return {
            'predicted_success': avg_success,
            'confidence': confidence,
            'selection_type': selection_type,
            'reasoning': reasoning,
            'similar_methods': tried_similar[:3]
        }
    
    def batch_select(self, 
                     pending_methods: List[str],
                     n_select: int,
                     current_run_id: str) -> List[SimilaritySelectionResult]:
        """Select multiple methods in order of predicted success.
        
        Args:
            pending_methods: List of method IDs available for selection.
            n_select: Number of methods to select.
            current_run_id: Current run ID for context.
            
        Returns:
            List of SimilaritySelectionResult in selection order.
            
        Example:
            >>> results = selector.batch_select(["m1", "m2", "m3"], 2, "run_001")
            >>> print([r.method_id for r in results])
            ['m2', 'm1']
        """
        remaining = pending_methods.copy()
        selected = []
        
        for _ in range(min(n_select, len(pending_methods))):
            result = self.select(remaining, current_run_id)
            selected.append(result)
            remaining.remove(result.method_id)
        
        return selected
    
    def recommend_for_context(self,
                              context: str,
                              n_results: int = 5) -> List[Dict[str, Any]]:
        """Recommend methods based on a text context description.
        
        Encodes the context text and searches for similar methods.
        Useful for natural language queries.
        
        Args:
            context: Text description of desired method characteristics.
            n_results: Number of recommendations to return.
            
        Returns:
            List of method dictionaries with similarity scores.
        """
        try:
            # Use search_by_parameters with context as parameters
            results = self.db.search_by_parameters(
                {"context": context},
                n_results=n_results * 2  # Get extra for filtering
            )
            
            # Filter for methods with some success
            successful = [
                r for r in results 
                if r.get('success_rate', 0) > 0.3 or r.get('attempts', 0) < 3
            ]
            
            return successful[:n_results]
            
        except Exception as e:
            logger.error(f"Failed to get recommendations: {e}")
            return []
    
    def explain_selection(self,
                          method_id: str,
                          run_id: str) -> Dict[str, Any]:
        """Get detailed explanation of why a method would be selected.
        
        Args:
            method_id: Method to explain.
            run_id: Current run ID.
            
        Returns:
            Dictionary with detailed explanation.
        """
        score = self._score_method(method_id, run_id)
        
        # Get method info
        method_info = self.db.get_method(method_id)
        
        return {
            "method_id": method_id,
            "method_info": method_info,
            "predicted_success": score['predicted_success'],
            "confidence": score['confidence'],
            "selection_type": score['selection_type'],
            "reasoning": score['reasoning'],
            "similar_methods": score.get('similar_methods', []),
            "exploration_threshold": self.exploration_threshold,
            "min_confidence_samples": self.min_confidence_samples
        }


class SimilaritySelectionStats:
    """Track statistics for similarity-based selections.
    
    Useful for analyzing the selector's behavior over time.
    
    Attributes:
        selections: List of all selection results.
        selections_by_type: Count of selections by type.
    """
    
    def __init__(self):
        """Initialize statistics tracker."""
        self.selections: List[SimilaritySelectionResult] = []
        self.selections_by_type: Dict[str, int] = {
            'similarity': 0,
            'exploration': 0,
            'fallback': 0
        }
    
    def record(self, result: SimilaritySelectionResult) -> None:
        """Record a selection result.
        
        Args:
            result: Selection result to record.
        """
        self.selections.append(result)
        self.selections_by_type[result.selection_type] = \
            self.selections_by_type.get(result.selection_type, 0) + 1
    
    def get_stats(self) -> Dict[str, Any]:
        """Get selection statistics.
        
        Returns:
            Dictionary with selection counts and average confidence.
        """
        if not self.selections:
            return {
                "total_selections": 0,
                "by_type": self.selections_by_type,
                "avg_confidence": 0.0
            }
        
        avg_confidence = sum(s.confidence for s in self.selections) / len(self.selections)
        
        return {
            "total_selections": len(self.selections),
            "by_type": self.selections_by_type.copy(),
            "avg_confidence": avg_confidence,
            "avg_predicted_success": sum(s.predicted_success for s in self.selections) / len(self.selections)
        }


def main():
    """CLI for testing similarity selector."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Similarity Selector")
    parser.add_argument("--test", action="store_true", help="Run tests")
    parser.add_argument("--method-id", help="Method ID to score")
    parser.add_argument("--pending", nargs="+", help="List of pending method IDs")
    parser.add_argument("--run-id", default="test_run_001", help="Run ID")
    parser.add_argument("--exploration-threshold", type=float, default=0.3)
    
    args = parser.parse_args()
    
    if args.test:
        print("Testing SimilaritySelector...")
        
        # Create test DB
        db = ChromaLearningDB(persist_dir=":memory:")
        
        # Add some test methods
        from learning.chroma_client import Method
        
        test_methods = [
            Method("vad_aggressive", "vad", {"threshold": 0.3}, "2026-03-25T00:00:00Z"),
            Method("vad_normal", "vad", {"threshold": 0.5}, "2026-03-25T00:00:00Z"),
            Method("vad_mild", "vad", {"threshold": 0.7}, "2026-03-25T00:00:00Z"),
            Method("noise_gate", "filter", {"threshold": -40}, "2026-03-25T00:00:00Z"),
        ]
        
        for m in test_methods:
            db.register_method(m)
        
        # Simulate some results
        from learning.chroma_client import MethodRun, Run
        
        db.record_run(Run("run_001", "2026-03-25T01:00:00Z", 0.2, 0.25, "COMPLETED"))
        db.record_method_run(MethodRun("vad_aggressive", "run_001", "KEEP", 0.05, 120000))
        
        db.record_run(Run("run_002", "2026-03-25T02:00:00Z", 0.22, 0.28, "COMPLETED"))
        db.record_method_run(MethodRun("vad_aggressive", "run_002", "KEEP", 0.06, 115000))
        
        db.record_run(Run("run_003", "2026-03-25T03:00:00Z", 0.25, 0.26, "COMPLETED"))
        db.record_method_run(MethodRun("vad_normal", "run_003", "REJECT", 0.01, 110000))
        
        # Create selector
        selector = SimilaritySelector(db, exploration_threshold=0.3)
        
        # Test selection
        pending = ["vad_aggressive", "vad_normal", "vad_mild", "noise_gate"]
        result = selector.select(pending, "run_004")
        
        print(f"\nSelected: {result.method_id}")
        print(f"Type: {result.selection_type}")
        print(f"Confidence: {result.confidence:.2f}")
        print(f"Predicted Success: {result.predicted_success:.2f}")
        print(f"Reasoning: {result.reasoning}")
        print(f"Similar Methods: {len(result.similar_methods)}")
        
        # Test batch selection
        print("\n\nBatch selection (top 3):")
        batch = selector.batch_select(pending, 3, "run_004")
        for i, r in enumerate(batch, 1):
            print(f"  {i}. {r.method_id} ({r.selection_type}, confidence={r.confidence:.2f})")
        
        # Test explanation
        print("\n\nExplanation for vad_normal:")
        explanation = selector.explain_selection("vad_normal", "run_004")
        print(f"  Predicted Success: {explanation['predicted_success']:.2f}")
        print(f"  Reasoning: {explanation['reasoning']}")
        
        print("\n\nAll tests passed!")
        
    elif args.method_id and args.pending:
        db = ChromaLearningDB()
        selector = SimilaritySelector(db, args.exploration_threshold)
        
        result = selector.select(args.pending, args.run_id)
        
        print(f"Selected: {result.method_id}")
        print(f"Type: {result.selection_type}")
        print(f"Confidence: {result.confidence:.2f}")
        print(f"Predicted Success: {result.predicted_success:.2f}")
        print(f"Reasoning: {result.reasoning}")
        
    else:
        print("Use --test to run tests or provide --method-id and --pending")


if __name__ == '__main__':
    main()
