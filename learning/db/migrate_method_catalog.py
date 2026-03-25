#!/usr/bin/env python3
"""Migrate method_catalog.json to ChromaDB.

Usage:
    python learning/db/migrate_method_catalog.py

Requirements:
    - method_catalog.json exists at docs/llm/autoresearch/runtime/method_catalog.json
    - learning.chroma_client.ChromaLearningDB is available
"""

import json
import sys
from datetime import datetime
from pathlib import Path

# Add workspace to path
workspace_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(workspace_root))

from learning.chroma_client import ChromaLearningDB


def migrate_method_catalog(catalog_path: str, db: ChromaLearningDB = None) -> int:
    """Migrate method catalog to ChromaDB.
    
    Args:
        catalog_path: Path to method_catalog.json
        db: Optional ChromaLearningDB instance (creates new if None)
        
    Returns:
        Number of methods migrated
    """
    if db is None:
        db = ChromaLearningDB()
    
    catalog_file = Path(catalog_path)
    if not catalog_file.exists():
        raise FileNotFoundError(f"Catalog not found: {catalog_path}")
    
    with open(catalog_file) as f:
        catalog = json.load(f)
    
    migrated_count = 0
    
    for category, methods in catalog.items():
        for method in methods:
            method_id = method['id']
            
            # Erstelle Embedding aus method.id + title + hypothesis
            content = f"{method_id} {method['title']} {method['hypothesis']}"
            
            # Generate embedding (encode returns list directly in mock mode)
            embedding = db.encoder.encode(content)
            
            # Prepare metadata
            metadata = {
                "category": category,
                "title": method['title'],
                "hypothesis": method['hypothesis'],
                "code_scope": json.dumps(method.get('codeScope', [])),
                "edit_strategy": json.dumps(method.get('editStrategy', [])),
                "success_rate": 0.0,
                "attempts": 0,
                "created_at": datetime.now().isoformat()
            }
            
            # Add to ChromaDB
            db.methods.add(
                ids=[method_id],
                embeddings=[embedding],
                metadatas=[metadata]
            )
            
            print(f"  ✓ Migrated: {method_id} ({category})")
            migrated_count += 1
    
    return migrated_count


def verify_migration(db: ChromaLearningDB, catalog: dict) -> bool:
    """Verify migration by checking all methods are in ChromaDB.
    
    Args:
        db: ChromaLearningDB instance
        catalog: Original catalog data
        
    Returns:
        True if all methods verified
    """
    print("\n--- Verification ---")
    all_verified = True
    
    for category, methods in catalog.items():
        for method in methods:
            method_id = method['id']
            result = db.methods.get(ids=[method_id], include=["metadatas"])
            
            if not result["ids"]:
                print(f"  ✗ Missing: {method_id}")
                all_verified = False
            else:
                meta = result["metadatas"][0]
                if meta["category"] != category:
                    print(f"  ✗ Wrong category for {method_id}: {meta['category']} vs {category}")
                    all_verified = False
                else:
                    print(f"  ✓ Verified: {method_id}")
    
    return all_verified


def demo_queries(db: ChromaLearningDB):
    """Demonstrate query capabilities."""
    print("\n--- Query Examples ---")
    
    # 1. Suche Methoden nach Beschreibung (ähnlichkeitsbasiert)
    print("\n1. Ähnlichkeitssuche nach 'speech threshold':")
    query_text = "speech threshold"
    query_embedding = db.encoder.encode(query_text)
    results = db.methods.query(
        query_embeddings=[query_embedding],
        n_results=3,
        include=["metadatas", "distances"]
    )
    for i, method_id in enumerate(results["ids"][0]):
        meta = results["metadatas"][0][i]
        dist = results["distances"][0][i]
        print(f"   {method_id} ({meta['category']}) - dist: {dist:.3f}")
        print(f"      → {meta['title']}")
    
    # 2. Finde ähnliche Methoden zu einer bestehenden
    print("\n2. Methoden ähnlich zu 'review_corridor_soften':")
    similar = db.find_similar_methods("review_corridor_soften", n_results=3)
    for m in similar:
        print(f"   {m['method_id']} ({m['category']}) - similarity: {m['similarity']:.3f}")
    
    # 3. Filter nach Kategorie
    print("\n3. Alle Methoden der Kategorie 'speech-retainer':")
    speech_methods = db.query_by_metadata(category="speech-retainer")
    for m in speech_methods:
        print(f"   {m['method_id']}: {m.get('title', 'N/A')}")
    
    # 4. Metadata-basierte Abfrage
    print("\n4. Methoden mit hohen attempts (zukünftig nach mehreren Runs):")
    # Aktuell noch 0, zeigt aber wie es funktioniert
    experienced = db.query_by_metadata(min_attempts=0)
    print(f"   Gefunden: {len(experienced)} Methoden")


def main():
    """Run migration and verification."""
    catalog_path = "docs/llm/autoresearch/runtime/method_catalog.json"
    
    print("=== Method Catalog Migration ===\n")
    print(f"Source: {catalog_path}")
    
    # Load catalog for verification
    with open(catalog_path) as f:
        catalog = json.load(f)
    
    total_methods = sum(len(m) for m in catalog.values())
    print(f"Methods to migrate: {total_methods}\n")
    
    # Create single DB instance for migration and verification
    db = ChromaLearningDB()
    
    # Migrate
    print("--- Migration ---")
    migrated = migrate_method_catalog(catalog_path, db)
    print(f"\nMigrated {migrated} methods")
    
    # Verify
    verified = verify_migration(db, catalog)
    
    if verified:
        print("\n✓ All methods verified in ChromaDB")
    else:
        print("\n✗ Verification failed")
        return 1
    
    # Demo queries
    demo_queries(db)
    
    # Delete original file
    print("\n--- Cleanup ---")
    catalog_file = Path(catalog_path)
    if catalog_file.exists():
        catalog_file.unlink()
        print(f"✓ Deleted: {catalog_path}")
    
    print("\n=== Migration Complete ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
