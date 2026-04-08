#!/usr/bin/env python3
"""Text to Embedding conversion utilities.

Provides utilities for converting text, methods, and runs
into embedding vectors suitable for ChromaDB storage.

Example:
    >>> from learning.embedding import MethodEmbedder
    >>> embedder = MethodEmbedder()
    >>> embedding = embedder.embed_method("vad_aggressive", "vad", {"threshold": 0.5})
    >>> print(len(embedding))  # 384 (all-MiniLM-L6-v2 dimension)
"""

import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to import sentence-transformers
try:
    from sentence_transformers import SentenceTransformer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    logger.warning("sentence-transformers not installed. Using mock embeddings.")


class EmbeddingConfig:
    """Configuration for embedding generation.
    
    Attributes:
        model_name: Name of the sentence-transformers model.
        max_length: Maximum sequence length for tokenization.
        normalize: Whether to normalize embeddings.
        mock_fallback: Whether to use mock embeddings if transformers unavailable.
    """
    
    DEFAULT_MODEL = 'all-MiniLM-L6-v2'  # 384 dimensions, fast and accurate
    ALTERNATIVE_MODELS = [
        'all-MiniLM-L6-v2',      # 384 dim, fast (recommended)
        'all-mpnet-base-v2',     # 768 dim, higher quality
        'paraphrase-MiniLM-L3-v2',  # 384 dim, even faster
    ]
    
    def __init__(self,
                 model_name: str = DEFAULT_MODEL,
                 max_length: int = 256,
                 normalize: bool = True,
                 mock_fallback: bool = True):
        """Initialize embedding configuration.
        
        Args:
            model_name: Sentence-transformers model name.
            max_length: Maximum token length.
            normalize: Whether to normalize embeddings.
            mock_fallback: Use mock embeddings if transformers unavailable.
        """
        self.model_name = model_name
        self.max_length = max_length
        self.normalize = normalize
        self.mock_fallback = mock_fallback


class EmbeddingGenerator:
    """Generate embeddings from text using sentence-transformers.
    
    This is the low-level embedding generator. For method-specific
    embedding, use MethodEmbedder.
    
    Attributes:
        config: EmbeddingConfig instance.
        _model: Cached sentence-transformers model.
    
    Example:
        >>> generator = EmbeddingGenerator()
        >>> embedding = generator.encode("This is a test sentence")
        >>> print(len(embedding))  # 384
    """
    
    def __init__(self, config: Optional[EmbeddingConfig] = None):
        """Initialize the embedding generator.
        
        Args:
            config: Embedding configuration. Uses default if None.
        """
        self.config = config or EmbeddingConfig()
        self._model = None
        self._embedding_dim = 384  # Default for all-MiniLM-L6-v2
        
        if not TRANSFORMERS_AVAILABLE and not self.config.mock_fallback:
            raise ImportError(
                "sentence-transformers is required but not installed. "
                "Install with: pip install sentence-transformers"
            )
        
        if not TRANSFORMERS_AVAILABLE:
            logger.warning("Using mock embeddings (sentence-transformers not available)")
    
    def _get_model(self) -> Any:
        """Lazy load the sentence-transformers model.
        
        Returns:
            Loaded model instance or None if using mocks.
        """
        if self._model is None and TRANSFORMERS_AVAILABLE:
            try:
                logger.info(f"Loading embedding model: {self.config.model_name}")
                self._model = SentenceTransformer(self.config.model_name)
                # Update dimension from actual model
                self._embedding_dim = self._model.get_sentence_embedding_dimension()
            except Exception as e:
                logger.error(f"Failed to load model: {e}")
                if not self.config.mock_fallback:
                    raise
        return self._model
    
    def encode(self, text: str) -> List[float]:
        """Generate embedding for text.
        
        Args:
            text: Input text to encode.
            
        Returns:
            List of floats representing the embedding vector.
            
        Raises:
            ValueError: If text is empty and mock fallback is disabled.
        """
        if not text or not text.strip():
            if not self.config.mock_fallback:
                raise ValueError("Cannot encode empty text")
            text = " "
        
        model = self._get_model()
        
        if model is not None:
            try:
                embedding = model.encode(
                    text,
                    normalize_embeddings=self.config.normalize,
                    show_progress_bar=False
                )
                return embedding.tolist()
            except Exception as e:
                logger.error(f"Model encoding failed: {e}")
                if not self.config.mock_fallback:
                    raise
        
        # Mock embedding fallback - deterministic hash-based
        return self._mock_encode(text)
    
    def _mock_encode(self, text: str) -> List[float]:
        """Generate deterministic mock embedding.
        
        Uses MD5 hash to create pseudo-random but deterministic
        values based on the input text.
        
        Args:
            text: Input text.
            
        Returns:
            Mock embedding vector.
        """
        hash_val = hashlib.md5(text.encode('utf-8')).hexdigest()
        
        mock_vec = []
        for i in range(self._embedding_dim):
            # Generate deterministic pseudo-random value
            h = hashlib.md5(f"{hash_val}_{i}".encode()).hexdigest()
            # Normalize to range [-1, 1]
            val = (int(h[:8], 16) % 2000 - 1000) / 1000.0
            mock_vec.append(val)
        
        return mock_vec
    
    def encode_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to encode.
            
        Returns:
            List of embedding vectors.
        """
        return [self.encode(text) for text in texts]
    
    @property
    def dimension(self) -> int:
        """Get the embedding dimension.
        
        Returns:
            Size of embedding vectors.
        """
        return self._embedding_dim


class MethodEmbedder:
    """High-level embedder for method definitions.
    
    Converts method information (ID, category, parameters) into
    semantically meaningful embeddings for similarity search.
    
    Example:
        >>> embedder = MethodEmbedder()
        >>> method_text = embedder.method_to_text(
        ...     "vad_aggressive",
        ...     "vad",
        ...     {"threshold": 0.3, "mode": "aggressive"}
        ... )
        >>> embedding = embedder.embed_method(
        ...     "vad_aggressive",
        ...     "vad",
        ...     {"threshold": 0.3}
        ... )
    """
    
    def __init__(self, config: Optional[EmbeddingConfig] = None):
        """Initialize method embedder.
        
        Args:
            config: Embedding configuration.
        """
        self.generator = EmbeddingGenerator(config)
    
    def method_to_text(self, method_id: str, category: str,
                       parameters: Dict[str, Any]) -> str:
        """Convert method to text representation.
        
        Creates a semantic text representation combining all
        method information for embedding.
        
        Args:
            method_id: Unique method identifier.
            category: Method category.
            parameters: Method parameters dictionary.
            
        Returns:
            Text representation suitable for embedding.
        """
        # Normalize parameters to sorted JSON for consistency
        param_str = json.dumps(parameters, sort_keys=True, separators=(',', ':'))
        
        # Create semantic text
        parts = [
            method_id.replace('_', ' '),
            category,
            param_str
        ]
        
        return ' '.join(parts)
    
    def embed_method(self, method_id: str, category: str,
                     parameters: Dict[str, Any]) -> List[float]:
        """Generate embedding for a method.
        
        Args:
            method_id: Unique method identifier.
            category: Method category.
            parameters: Method parameters.
            
        Returns:
            Embedding vector for the method.
        """
        text = self.method_to_text(method_id, category, parameters)
        return self.generator.encode(text)
    
    def embed_run(self, run_id: str, timestamp: str,
                  metadata: Optional[Dict[str, Any]] = None) -> List[float]:
        """Generate embedding for a run.
        
        Args:
            run_id: Unique run identifier.
            timestamp: Run timestamp.
            metadata: Optional additional metadata.
            
        Returns:
            Embedding vector for the run.
        """
        parts = [run_id, timestamp]
        
        if metadata:
            meta_str = json.dumps(metadata, sort_keys=True, separators=(',', ':'))
            parts.append(meta_str)
        
        text = ' '.join(parts)
        return self.generator.encode(text)
    
    def embed_method_run(self, method_id: str, run_id: str,
                         decision: Optional[str] = None,
                         improvement: Optional[float] = None) -> List[float]:
        """Generate embedding for a method-run link.
        
        Args:
            method_id: Method identifier.
            run_id: Run identifier.
            decision: Optional decision (KEEP, REJECT, etc.).
            improvement: Optional improvement value.
            
        Returns:
            Embedding vector for the method-run.
        """
        parts = [method_id, run_id]
        
        if decision:
            parts.append(decision)
        if improvement is not None:
            parts.append(f"improvement_{improvement:.4f}")
        
        text = ' '.join(parts)
        return self.generator.encode(text)


class SimilarityCalculator:
    """Calculate similarities between embeddings.
    
    Provides utility methods for computing cosine similarity
    and other metrics between embedding vectors.
    
    Example:
        >>> calc = SimilarityCalculator()
        >>> sim = calc.cosine_similarity(embedding1, embedding2)
        >>> print(f"Similarity: {sim:.2f}")
    """
    
    @staticmethod
    def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors.
        
        Args:
            vec1: First embedding vector.
            vec2: Second embedding vector.
            
        Returns:
            Cosine similarity in range [-1, 1].
        """
        import math
        
        if len(vec1) != len(vec2):
            raise ValueError(f"Vector length mismatch: {len(vec1)} vs {len(vec2)}")
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    @staticmethod
    def euclidean_distance(vec1: List[float], vec2: List[float]) -> float:
        """Calculate Euclidean distance between two vectors.
        
        Args:
            vec1: First embedding vector.
            vec2: Second embedding vector.
            
        Returns:
            Euclidean distance.
        """
        import math
        return math.sqrt(sum((a - b) ** 2 for a, b in zip(vec1, vec2)))
    
    @staticmethod
    def find_most_similar(query: List[float],
                          candidates: List[List[float]],
                          top_k: int = 5) -> List[tuple]:
        """Find most similar vectors to query.
        
        Args:
            query: Query embedding vector.
            candidates: List of candidate embedding vectors.
            top_k: Number of top results to return.
            
        Returns:
            List of (index, similarity) tuples sorted by similarity.
        """
        similarities = [
            (i, SimilarityCalculator.cosine_similarity(query, candidate))
            for i, candidate in enumerate(candidates)
        ]
        
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]


def main():
    """CLI for testing embedding functionality."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Embedding Utilities")
    parser.add_argument("--test", action="store_true", help="Run tests")
    parser.add_argument("--model", default="all-MiniLM-L6-v2", help="Model name")
    parser.add_argument("text", nargs="?", help="Text to encode")
    
    args = parser.parse_args()
    
    if args.test:
        print("Testing EmbeddingGenerator...")
        config = EmbeddingConfig(model_name=args.model)
        generator = EmbeddingGenerator(config)
        
        # Test single encoding
        test_text = "VAD aggressive mode with threshold 0.3"
        embedding = generator.encode(test_text)
        print(f"Embedding dimension: {len(embedding)}")
        print(f"Sample values: {embedding[:5]}")
        
        # Test batch encoding
        texts = ["method one", "method two", "method three"]
        batch = generator.encode_batch(texts)
        print(f"Batch size: {len(batch)}")
        
        # Test similarity
        text1 = "voice activity detection"
        text2 = "speech detection algorithm"
        text3 = "image processing"
        
        emb1 = generator.encode(text1)
        emb2 = generator.encode(text2)
        emb3 = generator.encode(text3)
        
        calc = SimilarityCalculator()
        sim12 = calc.cosine_similarity(emb1, emb2)
        sim13 = calc.cosine_similarity(emb1, emb3)
        
        print(f"\nSimilarity '{text1}' vs '{text2}': {sim12:.4f}")
        print(f"Similarity '{text1}' vs '{text3}': {sim13:.4f}")
        print("(Higher = more similar)")
        
        # Test method embedder
        print("\nTesting MethodEmbedder...")
        method_embedder = MethodEmbedder(config)
        method_emb = method_embedder.embed_method(
            "vad_aggressive",
            "vad",
            {"threshold": 0.3, "mode": "aggressive"}
        )
        print(f"Method embedding dimension: {len(method_emb)}")
        
        print("\nAll tests passed!")
        
    elif args.text:
        config = EmbeddingConfig()
        generator = EmbeddingGenerator(config)
        embedding = generator.encode(args.text)
        print(f"Embedding dimension: {len(embedding)}")
        print(f"Values (first 10): {embedding[:10]}")
    else:
        print("Use --test to run tests or provide text to encode")


if __name__ == '__main__':
    main()
