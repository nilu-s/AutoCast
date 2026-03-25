# CLAUDE.md - AutoCast Project

**Location:** `CLAUDE.md` (Project Root)  
**Scope:** Projekt-weite Konventionen, ChromaDB Single Source of Truth

---

## 🎯 Single Source of Truth: ChromaDB

**AB JETZT gilt:** Alle projekt-relevanten Informationen befinden sich in **ChromaDB**, nicht in physischen MD-Dateien.

### Was ist wo?

| Information | Quelle | Collection |
|-------------|--------|------------|
| **Dokumentation** | ChromaDB `documents` | `documents` |
| **Methoden-Katalog** | ChromaDB `methods` | `methods` |
| **Run-Ergebnisse** | ChromaDB `runs` + `method_runs` | `runs`, `method_runs` |
| **Projekt-Regeln** | Diese Datei (Root CLAUDE.md) | - |
| **ChromaDB-Regeln** | `docs/CHROMADB_SEMANTIC_RULES.md` | - |
| **Architektur** | `docs/architecture.md` | - |

### Physische Dateien (nur diese 3!)

```
AutoCast/
├── CLAUDE.md                           ← Du bist hier (Projekt-Regeln)
├── docs/
│   ├── architecture.md                 ← AutoCast Plugin Architektur
│   └── CHROMADB_SEMANTIC_RULES.md      ← ChromaDB Constraints
└── ...
```

**Alles andere** → ChromaDB `documents` Collection abrufen!

---

## 🚀 ChromaDB Schnellstart

### Verbindung herstellen:

```python
from learning.chroma_client import ChromaLearningDB

# Docker-Style (empfohlen)
db = ChromaLearningDB(persist_dir='chroma_data')

# Oder mit HTTP (wenn Docker-Container läuft)
# db = ChromaLearningDB(use_http=True, host="localhost", port=8000)
```

### Dokumentation abrufen:

```python
from learning.db.query_documents import search_documents, get_document_by_path

# Semantische Suche
results = search_documents("Wie funktioniert die Selection?", n_results=5)

# Exaktes Dokument
doc = get_document_by_path("docs/llm/autoresearch/SELF_OPTIMIZATION_MASTERPLAN.md")
```

### Methoden abrufen:

```python
from learning.analytics.similarity_analytics import SimilarityAnalytics

analytics = SimilarityAnalytics(db)
similar = analytics.get_similar_successful_methods("method_id")
top = analytics.get_top_methods(limit=10)
```

---

## 📋 Harte Invarianten

### 1. ChromaDB First

**Immer zuerst ChromaDB prüfen**, dann physische Dateien:

```python
# ✅ Richtig:
from learning.db.query_documents import get_document_by_path
doc = get_document_by_path("docs/llm/autoresearch/CLAUDE.md")

# ❌ Falsch (außer diese 3 Dateien):
# with open("docs/llm/autoresearch/CLAUDE.md") as f:
#     content = f.read()
```

### 2. Physische Dateien (nur diese 3)

| Datei | Zweck | Wann laden |
|-------|-------|------------|
| `CLAUDE.md` | Projekt-Regeln, ChromaDB-Konzept | Bei jedem Start |
| `docs/CHROMADB_SEMANTIC_RULES.md` | DB Constraints, Schema-Regeln | Bei DB-Operationen |
| `docs/architecture.md` | AutoCast Plugin Architektur | Bei Architektur-Fragen |

### 3. Source-of-Truth Schutz

```
🔴 RED LINE: docs/segments.json
🔴 RED LINE: docs/golden/*
🔴 RED LINE: docs/test_fixtures/*
```

**NIEMALS ändern** - Evaluation Ground Truth

### 4. Qualitätsstandards

**Vor jedem Commit:**
```bash
cd learning/

# 1. Type Checking
mypy db/*.py analytics/*.py

# 2. Tests
python -m pytest tests/ -v

# 3. Linting
flake8 *.py --max-line-length=88

# 4. Node.js Integration
npm run check
```

---

## 🗄️ ChromaDB Collections

### `documents` - Dokumentation
- **Embedding:** Dokumenten-Inhalt
- **Metadata:** file_path, title, section, last_updated
- **Nutzung:** Semantische Suche, Information Retrieval

### `methods` - Methoden-Katalog
- **Embedding:** method_id + Beschreibung
- **Metadata:** category, strategy, success_rate, attempts
- **Nutzung:** Similarity-basierte Auswahl

### `runs` - Run-Daten
- **Embedding:** Run-Kontext
- **Metadata:** timestamp, baseline_score, final_score, status
- **Nutzung:** Historie, Performance-Tracking

### `method_runs` - Verknüpfungen
- **Embedding:** [method_id, run_id]
- **Metadata:** decision, improvement, duration_ms
- **Nutzung:** Erfolgs-Tracking pro Methode

---

## 🔧 ChromaDB Tools

| Tool | Zweck | Location |
|------|-------|----------|
| `chroma_client.py` | ChromaDB Wrapper | `learning/chroma_client.py` |
| `query_documents.py` | Dokumenten-Queries | `learning/db/query_documents.py` |
| `similarity_analytics.py` | Analytics Engine | `learning/analytics/similarity_analytics.py` |
| `bridge.py` | HTTP API Server | `learning/bridge.py` |

---

## 📚 Weiterführende Links

- **ChromaDB Regeln:** `docs/CHROMADB_SEMANTIC_RULES.md`
- **Architektur:** `docs/architecture.md`
- **ChromaDB Docs:** https://docs.trychroma.com/

---

**Version:** 3.0 (ChromaDB Single Source of Truth)  
**Letzte Aktualisierung:** 2026-03-25
