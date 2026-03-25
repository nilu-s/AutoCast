"""Initialize ChromaDB collections with correct schema.

Provides collection setup and validation for the learning database.
Collections: methods, runs, method_runs

Example:
    >>> from learning.db.init_collections import initialize_collections
    >>> initializer = initialize_collections("./chroma_db")
    >>> initializer.validate_all_collections()
"""

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from learning.db.schema import (
    COLLECTION_SCHEMAS,
    METHOD_SCHEMA,
    RUNS_SCHEMA,
    METHOD_RUNS_SCHEMA,
    SchemaValidator,
    ValidationResult,
)

logger = logging.getLogger(__name__)

# Try to import optional dependencies
try:
    import chromadb
    from chromadb.config import Settings
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    logger.warning("chromadb not installed. Collection initialization limited.")


@dataclass
class CollectionInfo:
    """Information about a ChromaDB collection.
    
    Attributes:
        name: Collection name.
        exists: Whether collection exists.
        count: Number of items in collection.
        metadata: Collection metadata.
        schema_valid: Whether collection follows schema.
        validation_errors: List of validation errors.
    """
    name: str
    exists: bool = False
    count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    schema_valid: bool = False
    validation_errors: List[str] = field(default_factory=list)


class CollectionInitializer:
    """Initialize and validate ChromaDB collections.
    
    Manages the setup of three collections:
    - methods: Method definitions with embeddings
    - runs: Run data with timestamps
    - method_runs: Links between methods and runs
    
    Attributes:
        persist_dir: Directory for ChromaDB persistence.
        client: ChromaDB client instance.
        validator: SchemaValidator instance.
        methods: Methods collection.
        runs: Runs collection.
        method_runs: MethodRuns collection.
    """
    
    def __init__(
        self,
        persist_dir: str = "method_results/chroma_db",
        embedding_dimension: int = 384
    ):
        """Initialize the collection initializer.
        
        Args:
            persist_dir: Directory for ChromaDB persistence.
            embedding_dimension: Expected embedding dimension.
        """
        self.persist_dir = persist_dir
        self.validator = SchemaValidator(embedding_dimension=embedding_dimension)
        
        self.client: Optional[Any] = None
        self.methods: Optional[Any] = None
        self.runs: Optional[Any] = None
        self.method_runs: Optional[Any] = None
        
        if CHROMADB_AVAILABLE:
            self._init_client()
        else:
            logger.warning("Using mock collections (ChromaDB not available)")
    
    def _init_client(self) -> None:
        """Initialize ChromaDB client."""
        try:
            self.client = chromadb.Client(
                Settings(
                    persist_directory=self.persist_dir,
                    anonymized_telemetry=False
                )
            )
            logger.info(f"ChromaDB client initialized at {self.persist_dir}")
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB client: {e}")
            self.client = None
    
    def create_collections(self, overwrite: bool = False) -> bool:
        """Create all collections with proper schema.
        
        Args:
            overwrite: If True, delete existing collections first.
            
        Returns:
            True if all collections created successfully.
        """
        if not CHROMADB_AVAILABLE or self.client is None:
            logger.error("ChromaDB not available, cannot create collections")
            return False
        
        success = True
        
        # Methods collection
        if not self._create_collection("methods", overwrite):
            success = False
        
        # Runs collection
        if not self._create_collection("runs", overwrite):
            success = False
        
        # Method runs collection
        if not self._create_collection("method_runs", overwrite):
            success = False
        
        if success:
            logger.info("All collections created successfully")
        
        return success
    
    def _create_collection(self, name: str, overwrite: bool = False) -> bool:
        """Create a single collection.
        
        Args:
            name: Collection name.
            overwrite: If True, delete existing collection first.
            
        Returns:
            True if collection created successfully.
        """
        try:
            # Check if exists
            existing = self.client.list_collections()
            exists = name in [c.name for c in existing]
            
            if exists:
                if overwrite:
                    logger.info(f"Deleting existing collection: {name}")
                    self.client.delete_collection(name=name)
                else:
                    logger.debug(f"Collection {name} already exists")
                    return True
            
            # Create collection
            collection = self.client.create_collection(
                name=name,
                metadata={
                    "description": self._get_description(name),
                    "created_at": datetime.utcnow().isoformat(),
                    "schema_version": "1.0"
                }
            )
            
            logger.info(f"Created collection: {name}")
            
            # Store reference
            if name == "methods":
                self.methods = collection
            elif name == "runs":
                self.runs = collection
            elif name == "method_runs":
                self.method_runs = collection
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to create collection {name}: {e}")
            return False
    
    def _get_description(self, collection_name: str) -> str:
        """Get description for a collection.
        
        Args:
            collection_name: Name of the collection.
            
        Returns:
            Description string.
        """
        descriptions = {
            "methods": "Method definitions with embeddings and success tracking",
            "runs": "Run data with baseline/final scores and timestamps",
            "method_runs": "Links between methods and runs with decisions",
        }
        return descriptions.get(collection_name, "Learning database collection")
    
    def get_collection_info(self, name: str) -> CollectionInfo:
        """Get information about a collection.
        
        Args:
            name: Collection name.
            
        Returns:
            CollectionInfo with details about the collection.
        """
        info = CollectionInfo(name=name)
        
        if not CHROMADB_AVAILABLE or self.client is None:
            info.validation_errors.append("ChromaDB not available")
            return info
        
        try:
            # Check if exists
            existing = self.client.list_collections()
            exists = name in [c.name for c in existing]
            info.exists = exists
            
            if not exists:
                info.validation_errors.append(f"Collection {name} does not exist")
                return info
            
            # Get collection
            collection = self.client.get_collection(name=name)
            
            # Get count
            info.count = collection.count()
            
            # Get metadata
            info.metadata = collection.metadata or {}
            
            # Validate schema if there are items
            if info.count > 0:
                schema = COLLECTION_SCHEMAS.get(name)
                if schema:
                    # Sample a few items
                    sample = collection.get(limit=min(5, info.count))
                    all_valid = True
                    
                    for i, meta in enumerate(sample.get("metadatas", [])):
                        result = self.validator.validate_metadata(meta, schema)
                        if not result.is_valid:
                            all_valid = False
                            info.validation_errors.extend(
                                [f"Item {i}: {e}" for e in result.errors]
                            )
                    
                    info.schema_valid = all_valid
            else:
                info.schema_valid = True  # Empty collection is valid
            
        except Exception as e:
            info.validation_errors.append(f"Error accessing collection: {e}")
        
        return info
    
    def validate_all_collections(self) -> Tuple[bool, Dict[str, CollectionInfo]]:
        """Validate all collections.
        
        Returns:
            Tuple of (all_valid, dict of collection_name -> info).
        """
        collections = ["methods", "runs", "method_runs"]
        results = {}
        all_valid = True
        
        for name in collections:
            info = self.get_collection_info(name)
            results[name] = info
            
            if not info.exists:
                all_valid = False
                logger.warning(f"Collection {name} does not exist")
            elif not info.schema_valid:
                all_valid = False
                logger.warning(f"Collection {name} has schema violations")
        
        return all_valid, results
    
    def get_collection_schemas(self) -> Dict[str, Dict[str, Any]]:
        """Get schemas for all collections in serializable format.
        
        Returns:
            Dictionary of collection_name -> schema definition.
        """
        schemas = {}
        
        for name, schema in COLLECTION_SCHEMAS.items():
            fields = {}
            for field_name, field_def in schema.items():
                fields[field_name] = {
                    "type": field_def.field_type.value,
                    "required": field_def.required,
                    "default": field_def.default,
                    "allowed_values": field_def.allowed_values,
                    "min_value": field_def.min_value,
                    "max_value": field_def.max_value,
                    "description": field_def.description,
                }
            schemas[name] = fields
        
        return schemas
    
    def print_collection_status(self) -> None:
        """Print status of all collections."""
        print("=" * 60)
        print("ChromaDB Collections Status")
        print("=" * 60)
        print(f"Persist directory: {self.persist_dir}")
        print(f"ChromaDB available: {CHROMADB_AVAILABLE}")
        print("-" * 60)
        
        all_valid, results = self.validate_all_collections()
        
        for name, info in results.items():
            status = "✓" if info.exists and info.schema_valid else "✗"
            print(f"\n{status} {name}")
            print(f"  Exists: {info.exists}")
            print(f"  Count: {info.count}")
            print(f"  Schema valid: {info.schema_valid}")
            
            if info.validation_errors:
                print(f"  Errors:")
                for error in info.validation_errors:
                    print(f"    - {error}")
        
        print("\n" + "=" * 60)
        print(f"Overall status: {'VALID' if all_valid else 'INVALID'}")
        print("=" * 60)
    
    def reset_collections(self) -> bool:
        """Reset all collections (delete and recreate).
        
        Returns:
            True if reset successful.
        """
        return self.create_collections(overwrite=True)


def initialize_collections(
    persist_dir: str = "method_results/chroma_db",
    embedding_dimension: int = 384,
    overwrite: bool = False
) -> CollectionInitializer:
    """Convenience function to initialize collections.
    
    Args:
        persist_dir: Directory for ChromaDB persistence.
        embedding_dimension: Expected embedding dimension.
        overwrite: If True, delete existing collections first.
        
    Returns:
        Initialized CollectionInitializer.
    """
    initializer = CollectionInitializer(
        persist_dir=persist_dir,
        embedding_dimension=embedding_dimension
    )
    
    if overwrite or not initializer.validate_all_collections()[0]:
        initializer.create_collections(overwrite=overwrite)
    
    return initializer


def main():
    """CLI for collection management."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="ChromaDB Collections Management"
    )
    parser.add_argument(
        "--persist-dir",
        default="method_results/chroma_db",
        help="ChromaDB persistence directory"
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="Initialize collections"
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset collections (delete and recreate)"
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate existing collections"
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Print collection status"
    )
    
    args = parser.parse_args()
    
    if args.reset:
        print("Resetting collections...")
        initializer = initialize_collections(
            persist_dir=args.persist_dir,
            overwrite=True
        )
        initializer.print_collection_status()
    elif args.init:
        print("Initializing collections...")
        initializer = initialize_collections(
            persist_dir=args.persist_dir,
            overwrite=False
        )
        initializer.print_collection_status()
    elif args.validate:
        print("Validating collections...")
        initializer = CollectionInitializer(persist_dir=args.persist_dir)
        all_valid, results = initializer.validate_all_collections()
        
        for name, info in results.items():
            print(f"\n{name}:")
            print(f"  Exists: {info.exists}")
            print(f"  Schema valid: {info.schema_valid}")
            if info.validation_errors:
                print(f"  Errors: {info.validation_errors}")
        
        print(f"\nOverall: {'VALID' if all_valid else 'INVALID'}")
        return 0 if all_valid else 1
    elif args.status:
        initializer = CollectionInitializer(persist_dir=args.persist_dir)
        initializer.print_collection_status()
    else:
        parser.print_help()
    
    return 0


if __name__ == "__main__":
    exit(main())
