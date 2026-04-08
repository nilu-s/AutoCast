#!/usr/bin/env python3
"""ChromaDB Client for Learning Engine - Docker Edition.

Nutzt PersistentClient mit isoliertem Datenverzeichnis (Docker-Style).
Kann auch mit HttpClient für echte Docker-ChromaDB verbunden werden.

Example:
    >>> from learning.chroma_client import ChromaLearningDB
    >>> db = ChromaLearningDB()  # Standard: chroma_data/
    >>> db.add_method("method_001", "vad", {"threshold": 0.5})
"""

import json
import logging
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to import optional dependencies
try:
    import chromadb
    from chromadb.config import Settings
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    logger.warning("chromadb not installed. Using mock implementation.")

try:
    from sentence_transformers import SentenceTransformer
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    logger.warning("sentence-transformers not installed. Using mock embeddings.")


@dataclass
class Method:
    """Method definition for storage in ChromaDB."""
    method_id: str
    category: str
    parameters: Dict[str, Any]
    created_at: str


@dataclass
class Run:
    """Run definition for storage in ChromaDB."""
    run_id: str
    timestamp: str
    baseline_score: Optional[float] = None
    final_score: Optional[float] = None
    status: str = "COMPLETED"


@dataclass
class MethodRun:
    """MethodRun linking methods to runs."""
    method_id: str
    run_id: str
    decision: Optional[str] = None
    improvement: Optional[float] = None
    duration_ms: Optional[int] = None


class MockCollection:
    """Mock collection for when ChromaDB is not available."""
    
    def __init__(self, name: str):
        self.name = name
        self._data: Dict[str, Dict] = {}
        self._embeddings: Dict[str, List[float]] = {}
    
    def add(self, ids: List[str], embeddings: List[List[float]], 
            metadatas: List[Dict[str, Any]]) -> None:
        for id_, emb, meta in zip(ids, embeddings, metadatas):
            self._data[id_] = meta
            self._embeddings[id_] = emb
    
    def get(self, ids: Optional[List[str]] = None, where: Optional[Dict] = None,
            include: Optional[List[str]] = None) -> Dict[str, Any]:
        result = {"ids": [], "metadatas": [], "embeddings": []}
        
        if ids:
            for id_ in ids:
                if id_ in self._data:
                    result["ids"].append(id_)
                    result["metadatas"].append(self._data[id_])
                    result["embeddings"].append(self._embeddings.get(id_))
        elif where:
            for id_, meta in self._data.items():
                if self._matches_where(meta, where):
                    result["ids"].append(id_)
                    result["metadatas"].append(meta)
                    result["embeddings"].append(self._embeddings.get(id_))
        
        if include:
            if "embeddings" not in include:
                result["embeddings"] = None
            if "metadatas" not in include:
                result["metadatas"] = None
        
        return result
    
    def _matches_where(self, meta: Dict, where: Dict) -> bool:
        for key, value in where.items():
            if key not in meta:
                return False
            if isinstance(value, dict):
                for op, val in value.items():
                    meta_val = meta[key]
                    try:
                        meta_val = float(meta_val)
                        val = float(val)
                    except (ValueError, TypeError):
                        pass
                    if op == "$gte" and meta_val < val:
                        return False
                    elif op == "$gt" and meta_val <= val:
                        return False
                    elif op == "$lte" and meta_val > val:
                        return False
                    elif op == "$lt" and meta_val >= val:
                        return False
                    elif op == "$eq" and meta_val != val:
                        return False
            elif meta[key] != value:
                return False
        return True
    
    def _cosine_sim(self, vec1: List[float], vec2: List[float]) -> float:
        import math
        dot = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot / (norm1 * norm2)
    
    def query(self, query_embeddings: List[List[float]], n_results: int = 10,
              where: Optional[Dict] = None, include: Optional[List[str]] = None) -> Dict[str, Any]:
        result = {"ids": [[]], "distances": [[]], "metadatas": [[]]}
        if not self._data:
            return result
        
        query_emb = query_embeddings[0]
        similarities = []
        
        for id_, emb in self._embeddings.items():
            if where:
                meta = self._data[id_]
                if not self._matches_where(meta, where):
                    continue
            
            sim = self._cosine_sim(query_emb, emb)
            similarities.append((id_, 1.0 - sim, self._data[id_]))
        
        similarities.sort(key=lambda x: x[1])
        
        for id_, dist, meta in similarities[:n_results]:
            result["ids"][0].append(id_)
            result["distances"][0].append(dist)
            result["metadatas"][0].append(meta)
        
        return result
    
    def update(self, ids: List[str], embeddings: Optional[List[List[float]]] = None,
               metadatas: Optional[List[Dict[str, Any]]] = None) -> None:
        for i, id_ in enumerate(ids):
            if id_ in self._data:
                if metadatas and i < len(metadatas):
                    self._data[id_].update(metadatas[i])
                if embeddings and i < len(embeddings) and embeddings[i] is not None:
                    self._embeddings[id_] = embeddings[i]


class EmbeddingGenerator:
    """Generate embeddings for text using sentence-transformers."""
    
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        self.model_name = model_name
        self._model = None
        
        if not TRANSFORMERS_AVAILABLE:
            logger.warning("Using mock embeddings")
    
    def _get_model(self) -> Any:
        if self._model is None and TRANSFORMERS_AVAILABLE:
            logger.info(f"Loading embedding model: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
        return self._model
    
    def encode(self, text: str) -> List[float]:
        model = self._get_model()
        if model is not None:
            embedding = model.encode(text)
            return embedding.tolist()
        else:
            import hashlib
            hash_val = hashlib.md5(text.encode()).hexdigest()
            mock_vec = []
            for i in range(384):
                h = hashlib.md5(f"{hash_val}_{i}".encode()).hexdigest()
                mock_vec.append((int(h[:8], 16) % 2000 - 1000) / 1000.0)
            return mock_vec
    
    @property
    def dimension(self) -> int:
        return len(self.encode("test"))


class ChromaLearningDB:
    """ChromaDB-based Learning Database - Docker Edition.
    
    Uses PersistentClient with isolated data directory (Docker-style).
    Can be configured to use HttpClient for real Docker-ChromaDB.
    
    Attributes:
        persist_dir: Directory where ChromaDB persists data.
        client: ChromaDB client instance.
        encoder: EmbeddingGenerator instance.
        methods: Collection for method definitions.
        runs: Collection for run data.
        method_runs: Collection linking methods to runs.
    """
    
    def __init__(self, persist_dir: str = None, use_http: bool = False,
                 host: str = "localhost", port: int = 8000):
        """Initialize ChromaDB client and collections.
        
        Args:
            persist_dir: Directory for ChromaDB persistence (default: chroma_data/)
            use_http: If True, use HttpClient instead of PersistentClient
            host: ChromaDB server host (for HttpClient)
            port: ChromaDB server port (for HttpClient)
        """
        # Default to chroma_data directory (Docker-style)
        if persist_dir is None:
            persist_dir = str(Path(__file__).parent.parent / "chroma_data")
        
        self.persist_dir = persist_dir
        self.use_http = use_http
        self.host = host
        self.port = port
        self.encoder = EmbeddingGenerator()
        
        if not CHROMADB_AVAILABLE:
            logger.warning("Using mock ChromaDB implementation")
            self.client = None
            self.methods = MockCollection("methods")
            self.runs = MockCollection("runs")
            self.method_runs = MockCollection("method_runs")
        else:
            if use_http:
                # Docker-ChromaDB: Use HttpClient
                try:
                    self.client = chromadb.HttpClient(
                        host=host,
                        port=port,
                        settings=Settings(anonymized_telemetry=False)
                    )
                    self.client.heartbeat()
                    logger.info(f"Connected to ChromaDB HTTP at {host}:{port}")
                except Exception as e:
                    logger.error(f"Failed to connect to HTTP ChromaDB: {e}")
                    logger.info("Falling back to PersistentClient")
                    self.client = None
            else:
                # Docker-style: Use PersistentClient with isolated directory
                Path(persist_dir).mkdir(parents=True, exist_ok=True)
                self.client = chromadb.PersistentClient(
                    path=persist_dir,
                    settings=Settings(anonymized_telemetry=False)
                )
                logger.info(f"ChromaDB initialized with persist_dir: {persist_dir}")
            
            self._init_collections()
    
    def _init_collections(self) -> None:
        """Initialize or get ChromaDB collections."""
        if self.client is None:
            self.methods = MockCollection("methods")
            self.runs = MockCollection("runs")
            self.method_runs = MockCollection("method_runs")
            return
            
        self.methods = self.client.get_or_create_collection(
            name="methods",
            metadata={"description": "Method definitions with embeddings"}
        )
        self.runs = self.client.get_or_create_collection(
            name="runs",
            metadata={"description": "Run data with embeddings"}
        )
        self.method_runs = self.client.get_or_create_collection(
            name="method_runs",
            metadata={"description": "Links between methods and runs"}
        )
        logger.debug("Collections initialized: methods, runs, method_runs")
    
    def _encode(self, text: str) -> List[float]:
        """Generate embedding vector for text."""
        return self.encoder.encode(text)
    
    def add_method(self, method_id: str, category: str, parameters: Dict[str, Any]) -> None:
        """Add a method to the database."""
        try:
            existing = self.methods.get(ids=[method_id])
            if existing and existing.get("ids"):
                logger.debug(f"Method {method_id} already exists")
                raise ValueError(f"Method {method_id} already exists")
        except Exception as e:
            if "already exists" in str(e):
                raise
        
        now = datetime.utcnow().isoformat()
        metadata = {
            "category": category,
            "strategy": parameters.get("strategy", ""),
            "parameters": str(parameters),
            "success_rate": 0.0,
            "attempts": 0,
            "created_at": now
        }
        
        embedding = self._encode(f"{method_id} {parameters}")
        
        self.methods.add(
            ids=[method_id],
            embeddings=[embedding],
            metadatas=[metadata]
        )
        logger.info(f"Added method: {method_id}")
    
    def find_similar_methods(self, method_id: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """Find similar methods using similarity search."""
        try:
            result = self.methods.get(ids=[method_id], include=["embeddings"])
            if not result or not result.get("embeddings"):
                logger.warning(f"Method {method_id} not found")
                return []
            
            # Convert embeddings to list if numpy array
            embeddings = result["embeddings"]
            if hasattr(embeddings, 'tolist'):
                embeddings = embeddings.tolist()
            
            similar = self.methods.query(
                query_embeddings=embeddings,
                n_results=n_results + 1,
                include=["metadatas", "distances", "ids"]
            )
            
            results = []
            for i in range(len(similar["ids"][0])):
                # Convert to string for comparison
                current_id = str(similar["ids"][0][i])
                if current_id != str(method_id):
                    results.append({
                        "method_id": current_id,
                        "distance": similar["distances"][0][i],
                        "similarity": 1.0 - similar["distances"][0][i],
                        **similar["metadatas"][0][i]
                    })
            
            return results[:n_results]
        except Exception as e:
            logger.error(f"Failed to find similar methods: {e}")
            return []
    
    def record_method_run(self, method_id: str, run_id: str, decision: str,
                          improvement: float, duration_ms: Optional[int] = None) -> None:
        """Record a method run."""
        metadata = {
            "method_id": method_id,
            "run_id": run_id,
            "decision": decision,
            "improvement": improvement,
        }
        if duration_ms is not None:
            metadata["duration_ms"] = duration_ms
        
        composite_id = f"{method_id}_{run_id}"
        embedding = self._encode(composite_id)
        
        self.method_runs.add(
            ids=[composite_id],
            embeddings=[embedding],
            metadatas=[metadata]
        )
        
        self._update_method_stats(method_id)
        logger.debug(f"Recorded method_run: {composite_id}")
    
    def _update_method_stats(self, method_id: str) -> None:
        """Update method statistics."""
        try:
            results = self.method_runs.get(
                where={"method_id": method_id},
                include=["metadatas"]
            )
            if not results or not results.get("metadatas"):
                return
            
            attempts = len(results["metadatas"])
            keeps = sum(1 for m in results["metadatas"] if m.get("decision") == "KEEP")
            success_rate = keeps / attempts if attempts > 0 else 0.0
            
            existing = self.methods.get(ids=[method_id], include=["embeddings"])
            if not existing or not existing.get("ids"):
                return
            
            metadata = existing["metadatas"][0] if existing.get("metadatas") else {}
            metadata["success_rate"] = success_rate
            metadata["attempts"] = attempts
            
            self.methods.update(
                ids=[method_id],
                embeddings=existing.get("embeddings"),
                metadatas=[metadata]
            )
        except Exception as e:
            logger.error(f"Failed to update method stats: {e}")
    
    def query_by_metadata(self, category: Optional[str] = None,
                          min_success_rate: Optional[float] = None,
                          min_attempts: Optional[int] = None) -> List[Dict[str, Any]]:
        """Query methods by metadata."""
        try:
            where_clause = {}
            if category:
                where_clause["category"] = category
            if min_success_rate is not None:
                where_clause["success_rate"] = {"$gte": min_success_rate}
            if min_attempts is not None:
                where_clause["attempts"] = {"$gte": min_attempts}
            
            if not where_clause:
                results = self.methods.get(include=["metadatas"])
            else:
                results = self.methods.get(where=where_clause, include=["metadatas"])
            
            if not results:
                return []
            
            return [{"method_id": results["ids"][i], **results["metadatas"][i]}
                    for i in range(len(results.get("ids", [])))]
        except Exception as e:
            logger.error(f"Failed to query by metadata: {e}")
            return []
    
    def get_method(self, method_id: str) -> Optional[Dict[str, Any]]:
        """Get method by ID."""
        try:
            result = self.methods.get(ids=[method_id], include=["metadatas", "embeddings"])
            # Check if we got any results
            ids = result.get("ids", [])
            
            # Handle numpy arrays by converting to list
            if hasattr(ids, 'tolist'):
                ids = ids.tolist()
            
            # Check if list is empty
            if not ids or len(ids) == 0:
                return None
                
            return {
                "method_id": str(ids[0]),
                "metadata": result["metadatas"][0] if result.get("metadatas") and len(result["metadatas"]) > 0 else {},
                "embedding": result["embeddings"][0] if result.get("embeddings") and len(result["embeddings"]) > 0 else None
            }
        except Exception as e:
            logger.error(f"Failed to get method: {e}")
        return None
    
    def get_success_rate(self, method_id: str) -> float:
        """Get success rate."""
        try:
            result = self.methods.get(ids=[method_id], include=["metadatas"])
            if result and result.get("metadatas"):
                return float(result["metadatas"][0].get("success_rate", 0.0))
        except Exception as e:
            logger.error(f"Failed to get success rate: {e}")
        return 0.0
    
    def get_top_methods(self, n_results: int = 10, min_attempts: int = 0,
                        category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get top methods."""
        try:
            where_clause = {"attempts": {"$gte": min_attempts}}
            if category:
                where_clause["category"] = category
            
            results = self.methods.get(where=where_clause, include=["metadatas"])
            if not results or not results.get("ids"):
                return []
            
            methods = [{"method_id": results["ids"][i], **results["metadatas"][i]}
                       for i in range(len(results["ids"]))]
            methods.sort(key=lambda x: x.get("success_rate", 0), reverse=True)
            return methods[:n_results]
        except Exception as e:
            logger.error(f"Failed to get top methods: {e}")
            return []
    
    def search_by_parameters(self, parameters: Dict[str, Any], n_results: int = 5) -> List[Dict[str, Any]]:
        """Search by parameters."""
        try:
            param_text = str(parameters)
            embedding = self._encode(param_text)
            
            results = self.methods.query(
                query_embeddings=[embedding],
                n_results=n_results,
                include=["metadatas", "distances", "ids"]
            )
            
            if not results:
                return []
            
            return [{
                "method_id": results["ids"][0][i],
                "distance": results["distances"][0][i],
                "similarity": 1.0 - results["distances"][0][i],
                **results["metadatas"][0][i]
            } for i in range(len(results.get("ids", [[]])[0]))]
        except Exception as e:
            logger.error(f"Failed to search by parameters: {e}")
            return []
    
    def record_run(self, run: Run, methods_applied: Optional[List[str]] = None) -> bool:
        """Record a run."""
        try:
            embedding = self._encode(run.run_id)
            
            metadata = {"timestamp": run.timestamp, "status": run.status}
            if run.baseline_score is not None:
                metadata["baseline_score"] = run.baseline_score
            if run.final_score is not None:
                metadata["final_score"] = run.final_score
            if methods_applied is not None:
                metadata["methods_applied"] = methods_applied
            
            self.runs.add(
                ids=[run.run_id],
                embeddings=[embedding],
                metadatas=[metadata]
            )
            logger.info(f"Recorded run: {run.run_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to record run: {e}")
            return False
    
    def get_method_runs(self, method_id: str) -> List[Dict[str, Any]]:
        """Get method runs."""
        try:
            results = self.method_runs.get(
                where={"method_id": method_id},
                include=["metadatas"]
            )
            if not results:
                return []
            return [{"method_run_id": results["ids"][i], **results["metadatas"][i]}
                    for i in range(len(results.get("ids", [])))]
        except Exception as e:
            logger.error(f"Failed to get method runs: {e}")
            return []


def main():
    """CLI for testing."""
    import argparse
    
    parser = argparse.ArgumentParser(description="ChromaDB Learning Client")
    parser.add_argument("--persist-dir", default=None, help="ChromaDB data directory")
    parser.add_argument("--use-http", action="store_true", help="Use HTTP client")
    parser.add_argument("--host", default="localhost", help="ChromaDB host")
    parser.add_argument("--port", type=int, default=8000, help="ChromaDB port")
    parser.add_argument("--test", action="store_true", help="Run tests")
    
    args = parser.parse_args()
    
    if args.test:
        print(f"Testing ChromaLearningDB...")
        db = ChromaLearningDB(
            persist_dir=args.persist_dir,
            use_http=args.use_http,
            host=args.host,
            port=args.port
        )
        
        db.add_method(
            method_id="test_method_001",
            category="vad",
            parameters={"threshold": 0.5, "mode": "aggressive"}
        )
        print("✓ Method registered")
        
        similar = db.find_similar_methods("test_method_001", n_results=3)
        print(f"✓ Found {len(similar)} similar methods")
        
        print("\n✓ Tests complete!")
    else:
        print("Use --test to run tests")


if __name__ == '__main__':
    main()
