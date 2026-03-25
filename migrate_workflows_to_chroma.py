#!/usr/bin/env python3
"""
Migrate workflows from JSON to ChromaDB

Run this when ChromaDB is available to migrate workflows
"""

from workflows_storage import migrate_to_chromadb

if __name__ == "__main__":
    print("🔄 Migrating workflows to ChromaDB...")
    migrate_to_chromadb()