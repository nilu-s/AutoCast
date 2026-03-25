#!/usr/bin/env python3
"""Verifizierung der ChromaDB Docker-Setup.

Prüft:
1. Docker-Style Datenverzeichnis existiert
2. ChromaDB Client funktioniert
3. Collections sind verfügbar
4. Bridge funktioniert
"""

import sys
from pathlib import Path

def verify_setup():
    """Verify ChromaDB Docker setup."""
    print("=" * 60)
    print("ChromaDB Docker-Style Setup Verifikation")
    print("=" * 60)
    
    # 1. Check data directory
    chroma_data = Path("chroma_data")
    if chroma_data.exists():
        items = list(chroma_data.iterdir())
        print(f"✓ chroma_data/ existiert ({len(items)} items)")
        if any(f.suffix == '.sqlite3' for f in items if f.is_file()):
            print("  - SQLite Datenbank vorhanden")
    else:
        print("✗ chroma_data/ nicht gefunden")
        return False
    
    # 2. Check Docker Compose file
    if Path("docker-compose.chroma.yml").exists():
        print("✓ docker-compose.chroma.yml existiert")
    else:
        print("✗ docker-compose.chroma.yml fehlt")
    
    # 3. Test ChromaDB Client
    try:
        sys.path.insert(0, str(Path.cwd()))
        from learning.chroma_client import ChromaLearningDB
        
        db = ChromaLearningDB()
        print("✓ ChromaDB Client initialisiert")
        
        # Test collections
        if db.client:
            cols = db.client.list_collections()
            print(f"✓ Collections: {len(cols)}")
            for c in cols:
                count = c.count()
                print(f"  - {c.name}: {count} Einträge")
        
        # Test add/get
        import time
        test_id = f"verify_{int(time.time())}"
        db.add_method(test_id, "vad", {"threshold": 0.5})
        method = db.get_method(test_id)
        if method and method["method_id"] == test_id:
            print(f"✓ Add/Get funktioniert")
        
    except Exception as e:
        print(f"✗ Client Fehler: {e}")
        return False
    
    # 4. Test Bridge
    try:
        from learning.bridge import ChromaBridgeHandler
        handler = ChromaBridgeHandler
        handler._init_db(handler)
        if handler.db and handler.analytics:
            print("✓ Bridge initialisiert")
    except Exception as e:
        print(f"✗ Bridge Fehler: {e}")
    
    # 5. Check documentation
    if Path("CHROMADB_DOCKER_SETUP.md").exists():
        print("✓ Dokumentation vorhanden")
    
    print("=" * 60)
    print("Verifikation abgeschlossen!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = verify_setup()
    sys.exit(0 if success else 1)
