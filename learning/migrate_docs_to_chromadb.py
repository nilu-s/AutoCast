#!/usr/bin/env python3
"""Migrate all MD documentation to ChromaDB.

This script indexes all Markdown files in the AutoCast docs directory
(excluding CLAUDE.md) into ChromaDB for semantic search.

Usage:
    python migrate_docs_to_chromadb.py [--check]

Options:
    --check    Verify migration without writing to DB
"""

import argparse
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from learning.db.store_documents import (
    store_all_documents,
    get_collection_stats,
    DEFAULT_PERSIST_DIR
)


def find_all_md_files(docs_dir: str) -> list:
    """Find all markdown files in the docs directory."""
    docs_path = Path(docs_dir)
    if not docs_path.exists():
        return []
    
    return list(docs_path.rglob("*.md"))


def main():
    parser = argparse.ArgumentParser(
        description="Migrate MD documentation to ChromaDB"
    )
    parser.add_argument(
        "--docs-dir",
        default="/home/node/.openclaw/workspace/AutoCast/docs",
        help="Path to docs directory"
    )
    parser.add_argument(
        "--persist-dir",
        default=DEFAULT_PERSIST_DIR,
        help="ChromaDB persistence directory"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check mode - don't write to DB"
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show collection statistics"
    )
    
    args = parser.parse_args()
    
    # Show stats only
    if args.stats:
        print("=" * 60)
        print("ChromaDB Documents Collection Statistics")
        print("=" * 60)
        stats = get_collection_stats(args.persist_dir)
        
        if "error" in stats:
            print(f"Error: {stats['error']}")
            return 1
        
        print(f"Collection: {stats.get('collection_name', 'N/A')}")
        print(f"Status: {stats.get('status', 'unknown')}")
        print(f"Total Documents: {stats.get('total_documents', 0)}")
        
        sections = stats.get('sections', {})
        if sections:
            print("\nDocuments by Section:")
            for section, count in sorted(sections.items()):
                print(f"  {section}: {count}")
        
        return 0
    
    # Find all MD files
    print("=" * 60)
    print("AutoCast Documentation Migration to ChromaDB")
    print("=" * 60)
    print(f"\nSource: {args.docs_dir}")
    print(f"Persist: {args.persist_dir}")
    
    if args.check:
        print("\n[CHECK MODE] - No writes to database")
    
    print()
    
    md_files = find_all_md_files(args.docs_dir)
    
    if not md_files:
        print("No markdown files found!")
        return 1
    
    # Exclude CLAUDE.md
    md_files = [f for f in md_files if f.name != "CLAUDE.md"]
    
    print(f"Found {len(md_files)} markdown files (excluding CLAUDE.md)")
    print()
    
    # List files by section
    sections = {}
    for md_file in md_files:
        rel_path = md_file.relative_to(Path(args.docs_dir))
        section = str(rel_path.parent) if str(rel_path.parent) != "." else "root"
        
        if section not in sections:
            sections[section] = []
        sections[section].append(md_file.name)
    
    print("Files by Section:")
    for section in sorted(sections.keys()):
        print(f"\n  [{section}]")
        for filename in sorted(sections[section]):
            print(f"    - {filename}")
    
    if args.check:
        print("\n" + "=" * 60)
        print("Check mode complete - no changes made")
        print("=" * 60)
        return 0
    
    # Perform migration
    print("\n" + "=" * 60)
    print("Starting migration...")
    print("=" * 60)
    
    success, total = store_all_documents(
        args.docs_dir,
        exclude_files=["CLAUDE.md"],
        persist_dir=args.persist_dir
    )
    
    print()
    print("=" * 60)
    print(f"Migration Complete: {success}/{total} documents stored")
    print("=" * 60)
    
    # Show final stats
    stats = get_collection_stats(args.persist_dir)
    if "error" not in stats:
        print(f"\nCollection now contains {stats.get('total_documents', 0)} documents")
    
    return 0 if success == total else 1


if __name__ == "__main__":
    exit(main())
