# CHROMADB_SEMANTIC_RULES.md

**Location:** `docs/llm/autoresearch/CHROMADB_SEMANTIC_RULES.md`  
**Purpose:** Semantische Regeln für ChromaDB Collections  
**Linked from:** `CLAUDE.md`

---

## Regel 1: Dokumentation ist Single Source of Truth

Alle Dokumentation befindet sich in der ChromaDB `documents` Collection.

- Physische MD-Dateien sind veraltet (nur für Bootstrap)
- Aktuelle Version immer via `query_documents.py` abrufen
- Änderungen nur durch DB-Updates, nicht Datei-Edits

---

## Regel 2: Collection Schema

### `documents` Collection
```python
{
    "id": "file_path",  # z.B. "docs/llm/autoresearch/README.md"
    "embedding": "content_vector",
    "metadata": {
        "file_path": "string",
        "title": "string",
        "section": "string",  # z.B. "autoresearch", "agents"
        "last_updated": "ISO timestamp"
    },
    "document": "full_content"
}
```

### `methods` Collection
```python
{
    "id": "method_id",  # z.B. "vad_aggressive_threshold_0.3"
    "embedding": "method_id + parameters vector",
    "metadata": {
        "category": "string",  # "vad", "postprocess", "analysis"
        "strategy": "string",
        "success_rate": "float (0.0-1.0)",
        "attempts": "integer",
        "parameters": "json_string",
        "created_at": "ISO timestamp"
    }
}
```

### `runs` Collection
```python
{
    "id": "run_id",  # z.B. "20260325_143022"
    "embedding": "run_id vector",
    "metadata": {
        "timestamp": "ISO timestamp",
        "baseline_score": "float",
        "final_score": "float",
        "status": "string",  # "COMPLETED", "FAILED"
        "methods_applied": "list"
    }
}
```

### `method_runs` Collection
```python
{
    "id": "method_id_run_id",  # Composite
    "embedding": "[method_id, run_id] vector",
    "metadata": {
        "method_id": "string",
        "run_id": "string",
        "decision": "string",  # "KEEP", "REJECT", "FAILED"
        "improvement": "float",
        "duration_ms": "integer"
    }
}
```

---

## Regel 3: Abfrage-Prioritäten

**Reihenfolge für Informationen:**

1. **ChromaDB Similarity Search** (erste Wahl)
   ```python
   from learning.db.query_documents import search_documents
   results = search_documents("Wie funktioniert X?", n_results=5)
   ```

2. **ChromaDB Exact Match** (wenn Pfad bekannt)
   ```python
   from learning.db.query_documents import get_document_by_path
   doc = get_document_by_path("docs/llm/autoresearch/CLAUDE.md")
   ```

3. **Physische Dateien** (nur Fallback, veraltet)

---

## Regel 4: Updates und Migration

### Dokumentation aktualisieren:
```python
from learning.db.store_documents import update_document

update_document(
    file_path="docs/llm/autoresearch/CLAUDE.md",
    new_content="..."
)
```

### Alle Dokumente neu laden:
```bash
python learning/migrate_docs_to_chromadb.py
```

---

## Regel 5: Methoden-Tracking

**Jede Methode muss:**
- In `methods` Collection mit Embedding gespeichert werden
- Metadata: category, success_rate, attempts
- Automatisch via `add_method()` bei erster Nutzung

**Jeder Run muss:**
- In `runs` Collection gespeichert werden
- Verknüpfung zu Methoden in `method_runs`

**Analytics via:**
```python
from learning.analytics.similarity_analytics import SimilarityAnalytics

analytics = SimilarityAnalytics(db)
similar = analytics.get_similar_successful_methods("method_id")
```

---

## Regel 6: Bridge-Integration

**HTTP API (Port 8765):**
- `GET /similar-methods?method_id=xxx` - Ähnliche Methoden
- `GET /success-rate?method_id=xxx` - Success rate
- `GET /top-methods?limit=10` - Top Methoden
- `POST /add-method` - Neue Methode
- `POST /record-run` - Run speichern
- `POST /record-method-run` - Ergebnis speichern

**Node.js Client:**
```javascript
import { ChromaBridgeClient } from './chroma_bridge_client.js';
const client = new ChromaBridgeClient();
await client.addMethod(id, category, params);
```

---

## Regel 7: Compliance

**Muss immer gelten:**
- [ ] `docs/segments.json` NIEMALS ändern
- [ ] `npm run check` muss grün bleiben
- [ ] Type hints in Python (PEP 484)
- [ ] ChromaDB vor Datei-Lookup

---

## Quick Reference

| Task | Command |
|------|---------|
| Dokument suchen | `search_documents("query")` |
| Dokument abrufen | `get_document_by_path("path")` |
| Ähnliche Methoden | `find_similar_methods("method_id")` |
| Top Methoden | `get_top_methods(limit=10)` |
| Server starten | `python learning/bridge.py` |
| Docs migrieren | `python learning/migrate_docs_to_chromadb.py` |

---

**Letzte Aktualisierung:** 2026-03-25
