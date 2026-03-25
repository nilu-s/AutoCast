#!/usr/bin/env python3
"""Similarity Analytics for ChromaDB-based Learning Engine.

Provides advanced analytics capabilities using ChromaDB similarity search,
including method recommendations, clustering, success prediction, and
semantic search by description.

Example:
    >>> from learning.analytics.similarity_analytics import SimilarityAnalytics
    >>> from learning.chroma_client import ChromaLearningDB
    >>> db = ChromaLearningDB()
    >>> analytics = SimilarityAnalytics(db)
    >>> similar = analytics.get_similar_successful_methods("method_001", 5)
    >>> recommendations = analytics.recommend_methods_for_run("run_001", 3)
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Optional sklearn import for clustering
try:
    import numpy as np
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    np = None  # type: ignore


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors.
    
    Args:
        vec1: First vector.
        vec2: Second vector.
        
    Returns:
        Cosine similarity score between -1.0 and 1.0.
    """
    if not vec1 or not vec2:
        return 0.0
    
    import math
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot / (norm1 * norm2)


@dataclass
class MethodRecommendation:
    """Recommendation for a method in a specific run context.
    
    Attributes:
        method_id: The recommended method identifier.
        score: Recommendation score (0.0 to 1.0).
        reason: Human-readable explanation.
        similar_successful: List of similar successful methods.
        predicted_success: Predicted success rate (0.0 to 1.0).
    """
    method_id: str
    score: float
    reason: str
    similar_successful: List[Dict[str, Any]] = field(default_factory=list)
    predicted_success: float = 0.0


@dataclass
class MethodCluster:
    """Cluster of similar methods.
    
    Attributes:
        cluster_id: Unique cluster identifier.
        method_ids: List of method IDs in the cluster.
        centroid: Cluster centroid (mean of embeddings).
        avg_success_rate: Average success rate of methods in cluster.
        dominant_category: Most common category in cluster.
    """
    cluster_id: int
    method_ids: List[str]
    centroid: Optional[List[float]] = None
    avg_success_rate: float = 0.0
    dominant_category: str = ""


@dataclass
class SuccessPrediction:
    """Prediction of method success for a specific context.
    
    Attributes:
        method_id: The method being predicted.
        predicted_success_rate: Predicted success rate (0.0 to 1.0).
        confidence: Confidence in prediction (0.0 to 1.0).
        based_on: Number of similar methods used for prediction.
        similar_methods: List of similar methods with their success rates.
        context_run_id: Run ID used for context (if any).
    """
    method_id: str
    predicted_success_rate: float
    confidence: float
    based_on: int
    similar_methods: List[Dict[str, Any]] = field(default_factory=list)
    context_run_id: Optional[str] = None


class SimilarityAnalytics:
    """Analytics engine using ChromaDB similarity search.
    
    Provides advanced analytics capabilities including:
    - Finding similar successful methods
    - Recommending methods for specific runs
    - Clustering methods by embedding similarity
    - Predicting method success rates
    - Searching by natural language description
    
    Attributes:
        db: ChromaLearningDB instance for database operations.
        min_success_rate: Threshold for considering a method "successful".
        min_confidence_samples: Minimum samples needed for high confidence.
        
    Example:
        >>> db = ChromaLearningDB()
        >>> analytics = SimilarityAnalytics(db)
        >>> similar = analytics.get_similar_successful_methods("m1", 5)
        >>> clusters = analytics.get_method_clusters(3)
    """
    
    def __init__(
        self,
        chroma_db: Any,
        min_success_rate: float = 0.5,
        min_confidence_samples: int = 5
    ):
        """Initialize the similarity analytics engine.
        
        Args:
            chroma_db: ChromaLearningDB instance.
            min_success_rate: Threshold for "successful" methods.
            min_confidence_samples: Samples needed for high confidence.
        """
        self.db = chroma_db
        self.min_success_rate = min_success_rate
        self.min_confidence_samples = min_confidence_samples
        
        logger.info(
            f"SimilarityAnalytics initialized "
            f"(min_success_rate={min_success_rate}, "
            f"min_samples={min_confidence_samples})"
        )
    
    def get_similar_successful_methods(
        self,
        method_id: str,
        n_results: int = 5,
        min_success_rate: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """Find similar methods that have been successful.
        
        Searches for methods semantically similar to the given method
        that have a success rate above the threshold.
        
        Args:
            method_id: Reference method ID.
            n_results: Number of results to return.
            min_success_rate: Override default success rate threshold.
            
        Returns:
            List of similar successful method dictionaries.
            
        Example:
            >>> similar = analytics.get_similar_successful_methods("vad_001", 5)
            >>> print(similar[0]["method_id"])
            'vad_002'
        """
        threshold = min_success_rate or self.min_success_rate
        
        try:
            # Get similar methods
            similar = self.db.find_similar_methods(method_id, n_results=n_results * 2)
            
            if not similar:
                logger.debug(f"No similar methods found for {method_id}")
                return []
            
            # Filter by success rate and attempts
            successful = [
                method for method in similar
                if method.get("success_rate", 0.0) >= threshold
                and method.get("attempts", 0) > 0
            ]
            
            # Sort by similarity * success_rate for better ranking
            successful.sort(
                key=lambda m: m.get("similarity", 0) * m.get("success_rate", 0),
                reverse=True
            )
            
            logger.debug(
                f"Found {len(successful)} successful methods similar to {method_id}"
            )
            return successful[:n_results]
            
        except Exception as e:
            logger.error(f"Failed to find similar successful methods: {e}")
            return []
    
    def recommend_methods_for_run(
        self,
        run_id: str,
        n_recommendations: int = 5,
        category: Optional[str] = None
    ) -> List[MethodRecommendation]:
        """Recommend methods for a specific run context.
        
        Analyzes the run context (baseline score, previous runs)
        to recommend the most promising methods.
        
        Args:
            run_id: The run ID to recommend methods for.
            n_recommendations: Number of recommendations to return.
            category: Optional category filter.
            
        Returns:
            List of MethodRecommendation objects.
            
        Example:
            >>> recs = analytics.recommend_methods_for_run("run_001", 3)
            >>> print(recs[0].method_id)
            'method_abc'
        """
        try:
            # Get run info if available
            run_info = self._get_run_info(run_id)
            
            # Get all methods
            if category:
                methods = self.db.query_by_metadata(category=category)
            else:
                methods = self.db.methods.get(include=["metadatas"])
                methods = [
                    {"method_id": mid, **meta}
                    for mid, meta in zip(methods["ids"], methods["metadatas"])
                ]
            
            if not methods:
                logger.warning(f"No methods found for run {run_id}")
                return []
            
            # Score each method
            scored_methods: List[Tuple[Dict[str, Any], float, str]] = []
            
            for method in methods:
                method_id = method.get("method_id", "")
                if not method_id:
                    continue
                
                # Get similar successful methods
                similar = self.get_similar_successful_methods(
                    method_id,
                    n_results=5,
                    min_success_rate=0.3
                )
                
                # Calculate recommendation score
                if similar:
                    avg_similarity = sum(s.get("similarity", 0) for s in similar) / len(similar)
                    avg_success = sum(s.get("success_rate", 0) for s in similar) / len(similar)
                    score = avg_similarity * avg_success
                    reason = f"Based on {len(similar)} similar successful methods"
                    predicted_success = avg_success
                else:
                    # Use method's own success rate if available
                    success_rate = method.get("success_rate", 0.0)
                    attempts = method.get("attempts", 0)
                    
                    if attempts > 0:
                        score = success_rate * 0.5  # Lower score without similar methods
                        reason = f"Own success rate: {success_rate:.2f}"
                        predicted_success = success_rate
                    else:
                        score = 0.1  # Low score for untested methods
                        reason = "Untested method - exploration recommended"
                        predicted_success = 0.5
                
                scored_methods.append((method, score, reason, predicted_success))
            
            # Sort by score descending
            scored_methods.sort(key=lambda x: x[1], reverse=True)
            
            # Build recommendations
            recommendations = []
            for method, score, reason, pred_success in scored_methods[:n_recommendations]:
                method_id = method.get("method_id", "")
                similar = self.get_similar_successful_methods(method_id, n_results=3)
                
                recommendations.append(MethodRecommendation(
                    method_id=method_id,
                    score=score,
                    reason=reason,
                    similar_successful=similar,
                    predicted_success=pred_success
                ))
            
            return recommendations
            
        except Exception as e:
            logger.error(f"Failed to recommend methods for run {run_id}: {e}")
            return []
    
    def get_method_clusters(
        self,
        n_clusters: int = 5,
        category: Optional[str] = None
    ) -> List[MethodCluster]:
        """Cluster methods by embedding similarity.
        
        Uses K-Means clustering on method embeddings to group
        similar methods together.
        
        Args:
            n_clusters: Number of clusters to create.
            category: Optional category filter.
            
        Returns:
            List of MethodCluster objects.
            
        Raises:
            ValueError: If sklearn is not available.
            
        Example:
            >>> clusters = analytics.get_method_clusters(3)
            >>> print(f"Found {len(clusters)} clusters")
            3
        """
        if not SKLEARN_AVAILABLE or np is None:
            raise ValueError(
                "sklearn is required for clustering. "
                "Install with: pip install scikit-learn"
            )
        
        try:
            # Get methods with embeddings
            if category:
                methods_data = self.db.query_by_metadata(category=category)
            else:
                methods_data = self.db.methods.get(include=["metadatas", "embeddings"])
                methods_data = [
                    {
                        "method_id": mid,
                        "metadata": meta,
                        "embedding": emb
                    }
                    for mid, meta, emb in zip(
                        methods_data["ids"],
                        methods_data["metadatas"],
                        methods_data["embeddings"]
                    )
                ]
            
            if len(methods_data) < n_clusters:
                logger.warning(
                    f"Not enough methods ({len(methods_data)}) for {n_clusters} clusters"
                )
                n_clusters = max(1, len(methods_data))
            
            if not methods_data:
                return []
            
            # Build embedding matrix
            embeddings = []
            valid_methods = []
            
            for method in methods_data:
                emb = method.get("embedding") or method.get("metadata", {}).get("embedding")
                if emb:
                    embeddings.append(emb)
                    valid_methods.append(method)
            
            if not embeddings:
                logger.warning("No embeddings found for clustering")
                return []
            
            # Convert to numpy array
            X = np.array(embeddings)
            
            # Run K-Means
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = kmeans.fit_predict(X)
            
            # Build clusters
            clusters: Dict[int, List[Dict]] = {}
            for i, label in enumerate(labels):
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append(valid_methods[i])
            
            # Create MethodCluster objects
            result = []
            for cluster_id, methods in clusters.items():
                method_ids = [m.get("method_id", "") for m in methods]
                
                # Calculate average success rate
                success_rates = [
                    m.get("metadata", {}).get("success_rate", 0.0)
                    for m in methods
                ]
                avg_success = sum(success_rates) / len(success_rates) if success_rates else 0.0
                
                # Find dominant category
                categories = [
                    m.get("metadata", {}).get("category", "unknown")
                    for m in methods
                ]
                dominant = max(set(categories), key=categories.count) if categories else "unknown"
                
                result.append(MethodCluster(
                    cluster_id=int(cluster_id),
                    method_ids=method_ids,
                    centroid=kmeans.cluster_centers_[cluster_id].tolist(),
                    avg_success_rate=avg_success,
                    dominant_category=dominant
                ))
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to cluster methods: {e}")
            return []
    
    def predict_success(
        self,
        method_id: str,
        context_run_id: Optional[str] = None
    ) -> SuccessPrediction:
        """Predict success rate for a method.
        
        Predicts the success rate based on similar methods' performance.
        Can optionally use a specific run context for additional insights.
        
        Args:
            method_id: Method ID to predict success for.
            context_run_id: Optional run ID for context.
            
        Returns:
            SuccessPrediction object with prediction details.
            
        Example:
            >>> pred = analytics.predict_success("method_001", "run_001")
            >>> print(f"Predicted success: {pred.predicted_success_rate:.2%}")
            Predicted success: 75.00%
        """
        try:
            # Get similar methods
            similar = self.db.find_similar_methods(method_id, n_results=10)
            
            if not similar:
                # No similar methods - return neutral prediction
                return SuccessPrediction(
                    method_id=method_id,
                    predicted_success_rate=0.5,
                    confidence=0.0,
                    based_on=0,
                    similar_methods=[],
                    context_run_id=context_run_id
                )
            
            # Filter methods with attempts
            tried_similar = [
                m for m in similar
                if m.get("attempts", 0) > 0
            ]
            
            if not tried_similar:
                # Similar but untested
                return SuccessPrediction(
                    method_id=method_id,
                    predicted_success_rate=0.5,
                    confidence=0.1,
                    based_on=len(similar),
                    similar_methods=similar[:3],
                    context_run_id=context_run_id
                )
            
            # Calculate weighted success rate
            total_weight = sum(m.get("similarity", 0) for m in tried_similar)
            
            if total_weight > 0:
                weighted_success = sum(
                    m.get("success_rate", 0) * m.get("similarity", 0)
                    for m in tried_similar
                ) / total_weight
            else:
                weighted_success = sum(
                    m.get("success_rate", 0) for m in tried_similar
                ) / len(tried_similar)
            
            # Calculate confidence based on sample count
            confidence = min(len(tried_similar) / self.min_confidence_samples, 1.0)
            
            return SuccessPrediction(
                method_id=method_id,
                predicted_success_rate=weighted_success,
                confidence=confidence,
                based_on=len(tried_similar),
                similar_methods=tried_similar[:5],
                context_run_id=context_run_id
            )
            
        except Exception as e:
            logger.error(f"Failed to predict success for {method_id}: {e}")
            return SuccessPrediction(
                method_id=method_id,
                predicted_success_rate=0.5,
                confidence=0.0,
                based_on=0,
                similar_methods=[],
                context_run_id=context_run_id
            )
    
    def get_success_rate(self, method_id: str) -> float:
        """Get the current success rate for a method.
        
        Retrieves the success rate from method metadata.
        
        Args:
            method_id: Method ID to get success rate for.
            
        Returns:
            Success rate as float (0.0-1.0), or 0.0 if not found.
            
        Example:
            >>> rate = analytics.get_success_rate("method_001")
            >>> print(f"Success rate: {rate:.2%}")
            Success rate: 80.00%
        """
        try:
            result = self.db.get_success_rate(method_id)
            return float(result)
        except Exception as e:
            logger.error(f"Failed to get success rate for {method_id}: {e}")
            return 0.0
    
    def get_top_methods(
        self,
        limit: int = 10,
        category: Optional[str] = None,
        min_attempts: int = 0
    ) -> List[Dict[str, Any]]:
        """Get top performing methods by success rate.
        
        Returns methods sorted by success rate, optionally filtered
        by category and minimum attempts.
        
        Args:
            limit: Maximum number of methods to return.
            category: Optional category filter.
            min_attempts: Minimum attempts required.
            
        Returns:
            List of method dictionaries sorted by success rate.
            
        Example:
            >>> top = analytics.get_top_methods(5, category="vad")
            >>> print(top[0]["method_id"])
            'best_vad_method'
        """
        try:
            results = self.db.get_top_methods(
                n_results=limit,
                category=category,
                min_attempts=min_attempts
            )
            return results
        except Exception as e:
            logger.error(f"Failed to get top methods: {e}")
            return []
    
    def search_by_description(
        self,
        description: str,
        n_results: int = 5,
        min_success_rate: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """Search methods by natural language description.
        
        Encodes the description text and performs similarity search
        to find semantically matching methods.
        
        Args:
            description: Natural language description to search for.
            n_results: Number of results to return.
            min_success_rate: Optional success rate filter.
            
        Returns:
            List of matching method dictionaries.
            
        Example:
            >>> results = analytics.search_by_description(
            ...     "aggressive voice activity detection", 5)
            >>> print(results[0]["method_id"])
            'vad_aggressive'
        """
        try:
            # Use search_by_parameters with description as context
            results = self.db.search_by_parameters(
                {"description": description},
                n_results=n_results * 2  # Get extra for filtering
            )
            
            if min_success_rate is not None:
                results = [
                    r for r in results
                    if r.get("success_rate", 0.0) >= min_success_rate
                ]
            
            return results[:n_results]
            
        except Exception as e:
            logger.error(f"Failed to search by description: {e}")
            return []
    
    def _get_run_info(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a run.
        
        Args:
            run_id: Run ID to get info for.
            
        Returns:
            Run info dictionary or None.
        """
        try:
            result = self.db.runs.get(
                ids=[run_id],
                include=["metadatas"]
            )
            if result["ids"]:
                return result["metadatas"][0]
        except Exception as e:
            logger.debug(f"Could not get run info for {run_id}: {e}")
        return None
    
    def get_analytics_summary(self) -> Dict[str, Any]:
        """Get a summary of analytics data.
        
        Returns:
            Dictionary with summary statistics.
            
        Example:
            >>> summary = analytics.get_analytics_summary()
            >>> print(f"Total methods: {summary['total_methods']}")
        """
        try:
            # Get all methods
            methods = self.db.methods.get(include=["metadatas"])
            
            if not methods["ids"]:
                return {
                    "total_methods": 0,
                    "total_runs": 0,
                    "avg_success_rate": 0.0,
                    "top_category": "",
                    "categories": {}
                }
            
            total_methods = len(methods["ids"])
            
            # Calculate statistics
            success_rates = []
            categories: Dict[str, int] = {}
            total_attempts = 0
            
            for meta in methods["metadatas"]:
                success_rates.append(meta.get("success_rate", 0.0))
                cat = meta.get("category", "unknown")
                categories[cat] = categories.get(cat, 0) + 1
                total_attempts += meta.get("attempts", 0)
            
            avg_success = sum(success_rates) / len(success_rates) if success_rates else 0.0
            
            # Get top category
            top_category = max(categories.items(), key=lambda x: x[1])[0] if categories else ""
            
            # Get total runs
            runs = self.db.runs.get()
            total_runs = len(runs["ids"]) if runs else 0
            
            return {
                "total_methods": total_methods,
                "total_runs": total_runs,
                "avg_success_rate": avg_success,
                "top_category": top_category,
                "categories": categories,
                "total_attempts": total_attempts
            }
            
        except Exception as e:
            logger.error(f"Failed to get analytics summary: {e}")
            return {
                "total_methods": 0,
                "total_runs": 0,
                "avg_success_rate": 0.0,
                "top_category": "",
                "categories": {},
                "error": str(e)
            }


def main():
    """CLI for testing similarity analytics."""
    import argparse
    import sys
    import os
    
    # Add workspace to path for imports
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    sys.path.insert(0, workspace_root)
    
    parser = argparse.ArgumentParser(description="Similarity Analytics")
    parser.add_argument("--test", action="store_true", help="Run tests")
    parser.add_argument("--method-id", help="Method ID for operations")
    parser.add_argument("--run-id", help="Run ID for recommendations")
    parser.add_argument("--description", help="Description for search")
    parser.add_argument("--clusters", type=int, default=3, help="Number of clusters")
    
    args = parser.parse_args()
    
    if args.test:
        print("Testing SimilarityAnalytics...")
        
        from learning.chroma_client import ChromaLearningDB
        import tempfile
        import shutil
        
        temp_dir = tempfile.mkdtemp()
        try:
            db = ChromaLearningDB(persist_dir=temp_dir)
            analytics = SimilarityAnalytics(db)
            
            # Add test methods
            test_methods = [
                ("vad_aggressive_001", "vad", {"threshold": 0.3}),
                ("vad_aggressive_002", "vad", {"threshold": 0.35}),
                ("vad_normal_001", "vad", {"threshold": 0.5}),
                ("vad_mild_001", "vad", {"threshold": 0.7}),
                ("noise_gate_001", "filter", {"threshold": -40}),
                ("noise_gate_002", "filter", {"threshold": -35}),
            ]
            
            for mid, cat, params in test_methods:
                db.add_method(mid, cat, params)
            
            # Simulate runs
            for i in range(10):
                run_id = f"run_{i:03d}"
                db.record_run(
                    type('Run', (), {
                        'run_id': run_id,
                        'timestamp': '2026-03-25T00:00:00Z',
                        'baseline_score': 0.2,
                        'final_score': 0.25,
                        'status': 'COMPLETED'
                    })(),
                    methods_applied=[]
                )
                
                # Different success patterns
                if i < 8:
                    db.record_method_run("vad_aggressive_001", run_id, "KEEP", 0.05)
                else:
                    db.record_method_run("vad_aggressive_001", run_id, "REJECT", -0.01)
                
                if i < 6:
                    db.record_method_run("vad_normal_001", run_id, "KEEP", 0.04)
                else:
                    db.record_method_run("vad_normal_001", run_id, "REJECT", -0.01)
                
                db.record_method_run("noise_gate_001", run_id, "KEEP", 0.03)
            
            print("\n1. Test get_similar_successful_methods:")
            similar = analytics.get_similar_successful_methods("vad_aggressive_001", 3)
            for s in similar:
                print(f"   - {s['method_id']}: success={s.get('success_rate', 0):.2f}")
            
            print("\n2. Test predict_success:")
            pred = analytics.predict_success("vad_aggressive_001")
            print(f"   Predicted: {pred.predicted_success_rate:.2%}")
            print(f"   Confidence: {pred.confidence:.2f}")
            print(f"   Based on: {pred.based_on} methods")
            
            print("\n3. Test get_top_methods:")
            top = analytics.get_top_methods(3)
            for t in top:
                print(f"   - {t['method_id']}: {t.get('success_rate', 0):.2%}")
            
            print("\n4. Test search_by_description:")
            results = analytics.search_by_description("aggressive voice detection", 3)
            for r in results:
                print(f"   - {r['method_id']}")
            
            print("\n5. Test get_method_clusters:")
            try:
                clusters = analytics.get_method_clusters(2)
                for c in clusters:
                    print(f"   Cluster {c.cluster_id}: {len(c.method_ids)} methods")
                    print(f"      Avg success: {c.avg_success_rate:.2%}")
                    print(f"      Category: {c.dominant_category}")
            except ValueError as e:
                print(f"   (Skipped: {e})")
            
            print("\n6. Test recommend_methods_for_run:")
            recs = analytics.recommend_methods_for_run("run_010", 3)
            for r in recs:
                print(f"   - {r.method_id}: score={r.score:.2f}, predicted={r.predicted_success:.2%}")
            
            print("\n7. Test get_analytics_summary:")
            summary = analytics.get_analytics_summary()
            print(f"   Total methods: {summary['total_methods']}")
            print(f"   Avg success: {summary['avg_success_rate']:.2%}")
            print(f"   Categories: {summary['categories']}")
            
            print("\n✅ All tests passed!")
            
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
    
    elif args.method_id:
        db = ChromaLearningDB()
        analytics = SimilarityAnalytics(db)
        
        print(f"Predicting success for {args.method_id}:")
        pred = analytics.predict_success(args.method_id)
        print(f"  Predicted: {pred.predicted_success_rate:.2%}")
        print(f"  Confidence: {pred.confidence:.2f}")
        
        print(f"\nSimilar successful methods:")
        similar = analytics.get_similar_successful_methods(args.method_id, 5)
        for s in similar:
            print(f"  - {s['method_id']}: {s.get('success_rate', 0):.2%}")
    
    elif args.run_id:
        db = ChromaLearningDB()
        analytics = SimilarityAnalytics(db)
        
        print(f"Recommendations for run {args.run_id}:")
        recs = analytics.recommend_methods_for_run(args.run_id, 5)
        for r in recs:
            print(f"  - {r.method_id}: score={r.score:.2f}")
            print(f"    {r.reason}")
    
    elif args.description:
        db = ChromaLearningDB()
        analytics = SimilarityAnalytics(db)
        
        print(f"Search results for: {args.description}")
        results = analytics.search_by_description(args.description, 5)
        for r in results:
            print(f"  - {r['method_id']}")
    
    else:
        print("Use --test to run tests or provide --method-id, --run-id, or --description")


if __name__ == '__main__':
    main()
