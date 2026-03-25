#!/usr/bin/env python3
"""
Migrationsskript: Alle Dateien zu ChromaDB migrieren.

Erstellt:
- documents: Aus MD-Dateien (docs/ + reports/autoresearch/)
- methods: Aus Task-Method-Dateien
- runs: Test-Runs für Similarity Selection
- method_runs: Verknüpfungen

Usage:
    python migrate_all_to_chromadb.py
"""

import os
import sys
import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

# Wir sind im scripts/autoresearch/learning-Verzeichnis
import importlib.util

WORKSPACE_DIR = Path('/home/node/.openclaw/workspace/AutoCast')
CLIENT_PATH = WORKSPACE_DIR / 'learning' / 'chroma_client.py'

# Lade chroma_client direkt
spec = importlib.util.spec_from_file_location("chroma_client", str(CLIENT_PATH))
chroma_client = importlib.util.module_from_spec(spec)
sys.modules['chroma_client'] = chroma_client
spec.loader.exec_module(chroma_client)

ChromaLearningDB = chroma_client.ChromaLearningDB
Method = chroma_client.Method
Run = chroma_client.Run

def extract_title_from_md(content: str) -> str:
    """Extrahiert Titel aus erster Überschrift."""
    # Suche nach # oder ## Titel
    match = re.search(r'^#+\s*(.+)$', content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return "Untitled"

def get_section_from_path(file_path: str) -> str:
    """Bestimmt die Section aus dem Dateipfad."""
    parts = file_path.split('/')
    if 'autoresearch' in parts:
        return 'autoresearch'
    elif 'architecture' in file_path.lower():
        return 'architecture'
    elif 'tasks' in parts:
        return 'autoresearch/tasks'
    elif 'runs' in parts:
        return 'autoresearch/runs'
    return 'docs'

def read_md_files() -> List[Dict[str, Any]]:
    """Liest alle relevanten MD-Dateien (außer CLAUDE.md und CHROMADB_SEMANTIC_RULES.md)."""
    workspace = Path('/home/node/.openclaw/workspace/AutoCast')
    md_files = []
    
    # Liste der zu überspringenden Dateien
    skip_files = {'CLAUDE.md', 'CHROMADB_SEMANTIC_RULES.md'}
    
    # Suche in docs/
    docs_dir = workspace / 'docs'
    if docs_dir.exists():
        for md_file in docs_dir.rglob('*.md'):
            if md_file.name in skip_files:
                continue
            rel_path = str(md_file.relative_to(workspace))
            try:
                content = md_file.read_text(encoding='utf-8')
                title = extract_title_from_md(content)
                section = get_section_from_path(rel_path)
                md_files.append({
                    'file_path': rel_path,
                    'title': title,
                    'section': section,
                    'content': content,
                    'last_updated': datetime.fromtimestamp(md_file.stat().st_mtime).isoformat()
                })
            except Exception as e:
                print(f"  Warning: Could not read {rel_path}: {e}")
    
    # Suche in reports/autoresearch/
    reports_dir = workspace / 'reports' / 'autoresearch'
    if reports_dir.exists():
        for md_file in reports_dir.rglob('*.md'):
            rel_path = str(md_file.relative_to(workspace))
            try:
                content = md_file.read_text(encoding='utf-8')
                title = extract_title_from_md(content)
                section = get_section_from_path(rel_path)
                md_files.append({
                    'file_path': rel_path,
                    'title': title,
                    'section': section,
                    'content': content,
                    'last_updated': datetime.fromtimestamp(md_file.stat().st_mtime).isoformat()
                })
            except Exception as e:
                print(f"  Warning: Could not read {rel_path}: {e}")
    
    return md_files

def extract_methods_from_tasks() -> List[Dict[str, Any]]:
    """Extrahiert Methoden aus Task-Method-Dateien."""
    workspace = Path('/home/node/.openclaw/workspace/AutoCast')
    tasks_dir = workspace / 'reports' / 'autoresearch' / 'tasks'
    methods = []
    
    if not tasks_dir.exists():
        return methods
    
    for method_file in tasks_dir.glob('*_method_*.md'):
        try:
            content = method_file.read_text(encoding='utf-8')
            
            # Extrahiere method_id aus dem Dateinamen
            match = re.search(r'([^/]+)\.md$', str(method_file))
            if not match:
                continue
            filename = match.group(1)
            
            # Parse method_id aus dem Filename (z.B. 1_silence-pruner_method_1_silence_overlap_bleed_weight)
            parts = filename.split('_method_')
            if len(parts) == 2:
                task_part = parts[0]
                method_part = parts[1]
                method_id = f"{task_part}_method_{method_part}"
            else:
                method_id = filename
            
            # Bestimme Kategorie aus dem Inhalt oder Dateinamen
            category = 'unknown'
            if 'silence' in filename:
                category = 'silence_pruning'
            elif 'duration' in filename:
                category = 'duration'
            elif 'review' in filename:
                category = 'review'
            elif 'speech' in filename:
                category = 'speech'
            elif 'validator' in filename:
                category = 'validation'
            
            # Extrahiere Hypothese
            hypothesis = ""
            hyp_match = re.search(r'## Method.*?\n.*?hypothesis:\s*(.+?)(?:\n|$)', content, re.DOTALL)
            if hyp_match:
                hypothesis = hyp_match.group(1).strip()
            
            # Extrahiere Titel
            title = extract_title_from_md(content)
            
            methods.append({
                'method_id': method_id,
                'category': category,
                'parameters': {
                    'title': title,
                    'hypothesis': hypothesis,
                    'source_file': str(method_file.relative_to(workspace))
                }
            })
        except Exception as e:
            print(f"  Warning: Could not parse {method_file}: {e}")
    
    return methods

def migrate_documents(db: ChromaLearningDB, md_files: List[Dict]) -> int:
    """Migriert MD-Dateien zu ChromaDB documents Collection."""
    print("\n=== Migrating Documents ===")
    
    # Check if documents collection exists, create if not
    try:
        docs_collection = db.client.get_collection('documents')
        print(f"  Found existing 'documents' collection")
    except Exception:
        docs_collection = db.client.create_collection('documents')
        print(f"  Created 'documents' collection")
    
    count = 0
    for doc in md_files:
        try:
            # Generate embedding from content
            embedding = db._encode(doc['content'])
            
            # Add to documents collection
            docs_collection.add(
                ids=[doc['file_path']],
                embeddings=[embedding],
                metadatas=[{
                    'file_path': doc['file_path'],
                    'title': doc['title'],
                    'section': doc['section'],
                    'last_updated': doc['last_updated']
                }],
                documents=[doc['content']]
            )
            count += 1
            if count % 10 == 0:
                print(f"  ... {count} documents migrated")
        except Exception as e:
            print(f"  Error migrating {doc['file_path']}: {e}")
    
    print(f"  ✓ Migrated {count} documents")
    return count

def migrate_methods(db: ChromaLearningDB, methods: List[Dict]) -> int:
    """Migriert Methoden zu ChromaDB methods Collection."""
    print("\n=== Migrating Methods ===")
    
    count = 0
    for method in methods:
        try:
            # Check if method already exists
            existing = db.methods.get(ids=[method['method_id']])
            if existing and existing.get('ids') and len(existing['ids']) > 0:
                print(f"  Skip existing: {method['method_id']}")
                continue
            
            db.add_method(
                method_id=method['method_id'],
                category=method['category'],
                parameters=method['parameters']
            )
            count += 1
        except ValueError as e:
            if "already exists" in str(e):
                pass
            else:
                print(f"  Error migrating {method['method_id']}: {e}")
        except Exception as e:
            print(f"  Error migrating {method['method_id']}: {e}")
    
    print(f"  ✓ Migrated {count} methods")
    return count

def create_test_runs(db: ChromaLearningDB) -> int:
    """Erstellt Test-Runs für Similarity Selection."""
    print("\n=== Creating Test Runs ===")
    
    runs = [
        {
            'run_id': 'test_run_001',
            'timestamp': datetime.utcnow().isoformat(),
            'baseline_score': 0.45,
            'final_score': 0.52,
            'status': 'COMPLETED',
            'methods_applied': ['1_silence-pruner_method_1_silence_overlap_bleed_weight']
        },
        {
            'run_id': 'test_run_002',
            'timestamp': datetime.utcnow().isoformat(),
            'baseline_score': 0.48,
            'final_score': 0.61,
            'status': 'COMPLETED',
            'methods_applied': [
                '2_duration-specialist_method_1_duration_padding_rebalance',
                '3_review-calibrator_method_1_review_corridor_soften'
            ]
        },
        {
            'run_id': 'test_run_003',
            'timestamp': datetime.utcnow().isoformat(),
            'baseline_score': 0.52,
            'final_score': 0.58,
            'status': 'COMPLETED',
            'methods_applied': [
                '4_speech-retainer_method_1_speech_low_energy_hold',
                '4_speech-retainer_method_2_speech_threshold_recenter'
            ]
        }
    ]
    
    count = 0
    for run_data in runs:
        try:
            run = Run(
                run_id=run_data['run_id'],
                timestamp=run_data['timestamp'],
                baseline_score=run_data['baseline_score'],
                final_score=run_data['final_score'],
                status=run_data['status']
            )
            
            db.record_run(run, methods_applied=run_data['methods_applied'])
            
            # Create method_runs for each method in this run
            for method_id in run_data['methods_applied']:
                improvement = run_data['final_score'] - run_data['baseline_score']
                decision = 'KEEP' if improvement > 0.05 else 'REJECT'
                
                db.record_method_run(
                    method_id=method_id,
                    run_id=run_data['run_id'],
                    decision=decision,
                    improvement=improvement,
                    duration_ms=15000  # Dummy value
                )
            
            count += 1
        except Exception as e:
            print(f"  Error creating run {run_data['run_id']}: {e}")
    
    print(f"  ✓ Created {count} test runs")
    return count

def verify_migration(db: ChromaLearningDB) -> Dict[str, int]:
    """Verifiziert die Migration."""
    print("\n=== Verifying Migration ===")
    
    # Get documents collection count
    try:
        docs_collection = db.client.get_collection('documents')
        docs_count = docs_collection.count()
    except Exception:
        docs_count = 0
    
    methods_result = db.methods.get()
    methods_count = len(methods_result['ids']) if methods_result else 0
    
    runs_result = db.runs.get()
    runs_count = len(runs_result['ids']) if runs_result else 0
    
    method_runs_result = db.method_runs.get()
    method_runs_count = len(method_runs_result['ids']) if method_runs_result else 0
    
    results = {
        'documents': docs_count,
        'methods': methods_count,
        'runs': runs_count,
        'method_runs': method_runs_count
    }
    
    print(f"  documents: {docs_count} entries (expected: ~25-30)")
    print(f"  methods: {methods_count} entries (expected: ~15+)")
    print(f"  runs: {runs_count} entries (expected: ~3)")
    print(f"  method_runs: {method_runs_count} entries (expected: ~3+)")
    
    return results

def test_query(db: ChromaLearningDB) -> bool:
    """Testet Query-Funktionalität."""
    print("\n=== Testing Query ===")
    
    try:
        # Test 1: Query documents
        docs_collection = db.client.get_collection('documents')
        results = docs_collection.query(
            query_embeddings=[db._encode("architecture")],
            n_results=3
        )
        print(f"  ✓ Document query successful ({len(results['ids'][0])} results)")
        
        # Test 2: Query methods
        similar = db.find_similar_methods('1_silence-pruner_method_1_silence_overlap_bleed_weight', n_results=3)
        print(f"  ✓ Method similarity search successful ({len(similar)} results)")
        
        # Test 3: Query runs
        runs_result = db.runs.get(where={"status": "COMPLETED"})
        print(f"  ✓ Run query successful ({len(runs_result['ids'])} results)")
        
        return True
    except Exception as e:
        print(f"  ✗ Query test failed: {e}")
        return False

def main():
    print("=" * 60)
    print("ChromaDB Migration - Alle Dateien")
    print("=" * 60)
    
    # Initialize DB
    db = ChromaLearningDB(persist_dir='chroma_data')
    
    # Step 1: Read all MD files
    print("\n=== Reading MD Files ===")
    md_files = read_md_files()
    print(f"  Found {len(md_files)} MD files")
    
    # Step 2: Extract methods
    print("\n=== Extracting Methods ===")
    methods = extract_methods_from_tasks()
    print(f"  Found {len(methods)} methods")
    
    # Step 3: Migrate documents
    docs_count = migrate_documents(db, md_files)
    
    # Step 4: Migrate methods
    methods_count = migrate_methods(db, methods)
    
    # Step 5: Create test runs
    runs_count = create_test_runs(db)
    
    # Step 6: Verify
    stats = verify_migration(db)
    
    # Step 7: Test queries
    query_ok = test_query(db)
    
    # Summary
    print("\n" + "=" * 60)
    print("MIGRATION REPORT")
    print("=" * 60)
    print(f"\nDocuments Collection: {stats['documents']} entries")
    print(f"Methods Collection: {stats['methods']} entries")
    print(f"Runs Collection: {stats['runs']} entries")
    print(f"Method_Runs Collection: {stats['method_runs']} entries")
    
    print(f"\nQuery Test: {'✓ PASSED' if query_ok else '✗ FAILED'}")
    
    # Sample entries
    print("\n--- Sample Document IDs ---")
    try:
        docs_collection = db.client.get_collection('documents')
        sample_docs = docs_collection.get(limit=5)
        for doc_id in sample_docs['ids'][:5]:
            print(f"  - {doc_id}")
    except Exception as e:
        print(f"  Could not get sample: {e}")
    
    print("\n--- Sample Method IDs ---")
    methods_result = db.methods.get(limit=5)
    if methods_result and methods_result['ids']:
        for method_id in methods_result['ids'][:5]:
            print(f"  - {method_id}")
    
    print("\n" + "=" * 60)
    print("Migration complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
