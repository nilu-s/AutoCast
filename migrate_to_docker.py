#!/usr/bin/env python3
"""Migrate data from old chroma_db to new Docker-style chroma_data.
"""

import sys
import shutil
from pathlib import Path

def migrate_data():
    """Migrate existing ChromaDB data to Docker-style location."""
    old_path = Path("method_results/chroma_db")
    new_path = Path("chroma_data")
    
    print(f"Checking for existing data...")
    print(f"  Old path: {old_path}")
    print(f"  New path: {new_path}")
    
    if not old_path.exists():
        print("  No old data found, starting fresh")
        new_path.mkdir(parents=True, exist_ok=True)
        return True
    
    if new_path.exists() and any(new_path.iterdir()):
        print(f"  New location already has data ({len(list(new_path.iterdir()))} items)")
        response = input("  Overwrite? (y/N): ")
        if response.lower() != 'y':
            print("  Migration cancelled")
            return False
    
    # Copy data
    print(f"  Copying data...")
    if new_path.exists():
        shutil.rmtree(new_path)
    shutil.copytree(old_path, new_path)
    
    print(f"  ✓ Migrated {len(list(new_path.rglob('*')))} items")
    return True

if __name__ == "__main__":
    success = migrate_data()
    sys.exit(0 if success else 1)
