#!/usr/bin/env python3
"""Similarity Analytics for ChromaDB Learning Engine.

Provides analytics functions for the ChromaDB-based learning system,
including method recommendations based on run history and success patterns.

Example:
    >>> from learning.chroma_client import ChromaLearningDB
    >>> from learning.similarity_analytics import SimilarityAnalytics
    >>> db = ChromaLearningDB()
    >>> analytics = SimilarityAnalytics(db)
    >>> recommendations = analytics.recommend_methods_for_run("run_001", n_results=5)
"""

import logging
from typing import Any, Dict, List, Optional

from learning.chroma_client import ChromaLearningDB

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SimilarityAnalytics:
    """Analytics functions for similarity-based method selection.

    Provides recommendations and analysis based on ChromaDB embeddings
    and method run history.

    Attributes:
        db: ChromaLearningDB instance for database access.
    """

    def __init__(self, db: ChromaLearningDB) -> None:
        """Initialize SimilarityAnalytics.

        Args:
            db: ChromaLearningDB instance for database access.
        """
        self.db = db
        logger.info("SimilarityAnalytics initialized")

    def recommend_methods_for_run(
        self,
        run_id: str,
        n_results: int = 5,
        min_success_rate: float = 0.0
    ) -> List[Dict[str, Any]]:
        """Recommend methods for a specific run.

        Analyzes the run history and finds methods that performed well
        in similar runs.

        Args:
            run_id: The run ID to get recommendations for.
            n_results: Number of recommendations to return.
            min_success_rate: Minimum success rate filter.

        Returns:
            List of recommended method dictionaries with reasons.
        """
        recommendations = []

        try:
            # Get all top methods
            top_methods = self.db.get_top_methods(
                n_results=n_results * 2,  # Get more for filtering
                min_attempts=1
            )

            for method in top_methods:
                success_rate = method.get('success_rate', 0.0)

                if success_rate < min_success_rate:
                    continue

                # Build recommendation with reason
                reason = self._build_recommendation_reason(method, success_rate)

                recommendations.append({
                    'method_id': method['method_id'],
                    'category': method.get('category', 'unknown'),
                    'success_rate': success_rate,
                    'attempts': method.get('attempts', 0),
                    'reason': reason
                })

                if len(recommendations) >= n_results:
                    break

        except Exception as e:
            logger.error(f"Failed to get recommendations for run {run_id}: {e}")

        return recommendations[:n_results]

    def _build_recommendation_reason(
        self,
        method: Dict[str, Any],
        success_rate: float
    ) -> str:
        """Build a human-readable recommendation reason.

        Args:
            method: Method data dictionary.
            success_rate: The method's success rate.

        Returns:
            Human-readable recommendation reason.
        """
        attempts = method.get('attempts', 0)
        category = method.get('category', 'unknown')

        if success_rate >= 0.8 and attempts >= 5:
            return f"Proven high success rate ({success_rate:.0%}) with {attempts} attempts"
        elif success_rate >= 0.8:
            return f"High success rate ({success_rate:.0%}) in limited attempts"
        elif success_rate >= 0.6:
            return f"Good success rate ({success_rate:.0%}) across {attempts} attempts"
        elif attempts >= 10:
            return f"Well-tested method ({attempts} attempts) with moderate success"
        else:
            return f"New method in category '{category}' with limited history"

    def analyze_method_effectiveness(
        self,
        method_id: str
    ) -> Optional[Dict[str, Any]]:
        """Analyze the effectiveness of a specific method.

        Args:
            method_id: The method to analyze.

        Returns:
            Effectiveness analysis dictionary or None if not found.
        """
        try:
            method = self.db.get_method(method_id)
            if not method:
                return None

            method_runs = self.db.get_method_runs(method_id)

            if not method_runs:
                return {
                    'method_id': method_id,
                    'found': True,
                    'has_runs': False,
                    'success_rate': 0.0,
                    'analysis': 'No runs recorded yet'
                }

            # Calculate additional metrics
            improvements = [
                run.get('improvement', 0)
                for run in method_runs
                if run.get('improvement') is not None
            ]

            durations = [
                run.get('duration_ms', 0)
                for run in method_runs
                if run.get('duration_ms') is not None
            ]

            avg_improvement = sum(improvements) / len(improvements) if improvements else 0.0
            avg_duration = sum(durations) / len(durations) if durations else 0.0

            # Analyze trend (last 5 vs first 5)
            if len(method_runs) >= 10:
                recent = method_runs[-5:]
                early = method_runs[:5]

                recent_keeps = sum(1 for r in recent if r.get('decision') == 'KEEP')
                early_keeps = sum(1 for r in early if r.get('decision') == 'KEEP')

                recent_rate = recent_keeps / len(recent)
                early_rate = early_keeps / len(early)

                if recent_rate > early_rate + 0.2:
                    trend = 'improving'
                elif recent_rate < early_rate - 0.2:
                    trend = 'declining'
                else:
                    trend = 'stable'
            else:
                trend = 'insufficient_data'

            return {
                'method_id': method_id,
                'found': True,
                'has_runs': True,
                'success_rate': method.get('success_rate', 0.0),
                'attempts': len(method_runs),
                'avg_improvement': avg_improvement,
                'avg_duration_ms': avg_duration,
                'trend': trend,
                'analysis': f"Method shows {trend} performance trend"
            }

        except Exception as e:
            logger.error(f"Failed to analyze method {method_id}: {e}")
            return None

    def find_similar_successful_methods(
        self,
        method_id: str,
        n_results: int = 5,
        min_success_rate: float = 0.5
    ) -> List[Dict[str, Any]]:
        """Find methods similar to the given one that have high success rates.

        Args:
            method_id: The reference method ID.
            n_results: Number of results to return.
            min_success_rate: Minimum success rate filter.

        Returns:
            List of similar successful method dictionaries.
        """
        similar_successful = []

        try:
            # Get similar methods
            similar = self.db.find_similar_methods(method_id, n_results=n_results * 2)

            for method in similar:
                success_rate = method.get('success_rate', 0.0)

                if success_rate >= min_success_rate:
                    similar_successful.append({
                        'method_id': method['method_id'],
                        'category': method.get('category', 'unknown'),
                        'success_rate': success_rate,
                        'similarity': method.get('similarity', 0.0),
                        'attempts': method.get('attempts', 0)
                    })

                if len(similar_successful) >= n_results:
                    break

        except Exception as e:
            logger.error(f"Failed to find similar successful methods for {method_id}: {e}")

        return similar_successful[:n_results]

    def get_category_performance(self) -> Dict[str, Dict[str, Any]]:
        """Get performance statistics by method category.

        Returns:
            Dictionary mapping categories to performance stats.
        """
        category_stats = {}

        try:
            # Get all methods
            all_methods = self.db.query_by_metadata()

            # Group by category
            by_category: Dict[str, List[Dict[str, Any]]] = {}
            for method in all_methods:
                category = method.get('category', 'unknown')
                if category not in by_category:
                    by_category[category] = []
                by_category[category].append(method)

            # Calculate stats per category
            for category, methods in by_category.items():
                if not methods:
                    continue

                success_rates = [m.get('success_rate', 0.0) for m in methods]
                attempts = [m.get('attempts', 0) for m in methods]

                category_stats[category] = {
                    'method_count': len(methods),
                    'avg_success_rate': sum(success_rates) / len(success_rates),
                    'total_attempts': sum(attempts),
                    'best_method': max(methods, key=lambda m: m.get('success_rate', 0.0)).get('method_id'),
                    'best_success_rate': max(success_rates) if success_rates else 0.0
                }

        except Exception as e:
            logger.error(f"Failed to get category performance: {e}")

        return category_stats


def main():
    """CLI for testing SimilarityAnalytics."""
    import argparse

    parser = argparse.ArgumentParser(description="Similarity Analytics CLI")
    parser.add_argument("--persist-dir", default="method_results/chroma_db")
    parser.add_argument("--test", action="store_true", help="Run basic tests")

    args = parser.parse_args()

    if args.test:
        print("Testing SimilarityAnalytics...")
        db = ChromaLearningDB(persist_dir=args.persist_dir)
        analytics = SimilarityAnalytics(db)

        # Test category performance
        stats = analytics.get_category_performance()
        print(f"Category stats: {stats}")

        print("Tests complete!")
    else:
        print("Use --test to run basic tests")


if __name__ == '__main__':
    main()
