# Learning Engine - ChromaDB Version

**Status:** SQLite → ChromaDB Migration Complete ✅

## Architektur

```
ChromaDB (Vektordatenbank)
├── collection: methods
│   ├── embedding: method_id + parameters (vektorisiert)
│   └── metadata: category, strategy, success_rate, attempts
├── collection: runs
│   ├── embedding: run_id (vektorisiert)
│   └── metadata: timestamp, baseline_score, final_score, status
└── collection: method_runs
    ├── embedding: [method_id, run_id] (kombiniert)
    └── metadata: decision, improvement, duration_ms
```

## Warum ChromaDB?

- **Native Similarity Search** - Methoden werden automatisch nach semantischer Ähnlichkeit gefunden
- **Kein Feature Engineering** - Parameter werden direkt als Embeddings gespeichert
- **LLM-native** - Embeddings können direkt von LLMs verstanden werden
- **Metadata + Embeddings** - Kombination aus vektorisiertem Content + strukturierten Metadaten

## Files

| File | Purpose |
|------|---------|
| `chroma_client.py` | ChromaDB client with embedding generation |
| `embedding.py` | Text → Embedding utilities |
| `requirements.txt` | Dependencies (chromadb, sentence-transformers) |
| `bridge.py` | HTTP API Bridge (Port 8765) |
| `analytics/similarity_selector.py` | Similarity-based method selection |

## Installation

```bash
cd /home/node/.openclaw/workspace/AutoCast
pip install -r learning/requirements.txt
```

## Quick Start

```python
from learning.chroma_client import ChromaLearningDB, Method, Run, MethodRun

# Initialize
db = ChromaLearningDB(persist_dir="method_results/chroma_db")

# Register a method
db.register_method(Method(
    method_id="vad_aggressive",
    category="vad",
    parameters={"threshold": 0.3, "mode": "aggressive"},
    created_at="2026-03-25T00:00:00Z"
))

# Find similar methods
similar = db.find_similar_methods("vad_aggressive", n_results=5)

# Record a run
db.record_run(Run(
    run_id="run_001",
    timestamp="2026-03-25T01:00:00Z",
    baseline_score=0.267,
    final_score=0.310,
    status="COMPLETED"
))

# Record method result
db.record_method_run(MethodRun(
    method_id="vad_aggressive",
    run_id="run_001",
    decision="KEEP",
    improvement=0.043,
    duration_ms=150000
))
```

## Similarity-Based Selection

```python
from learning.analytics.similarity_selector import SimilaritySelector

# Create selector
selector = SimilaritySelector(db)

# Select best method from pending
result = selector.select(
    pending_methods=["method_a", "method_b", "method_c"],
    current_run_id="run_001"
)

print(f"Selected: {result.method_id}")
print(f"Type: {result.selection_type}")  # 'similarity', 'exploration', or 'fallback'
print(f"Confidence: {result.confidence}")
print(f"Predicted Success: {result.predicted_success}")
print(f"Reasoning: {result.reasoning}")
```

## HTTP API Bridge

Start the server:
```bash
python3 learning/bridge.py
```

### Endpoints

**Legacy (still supported):**
- `GET /success-rate?method_id={id}` - Get success rate
- `GET /method-stats?method_id={id}` - Get method stats
- `GET /top-methods?limit={n}` - Get top methods
- `POST /register-method` - Register a method
- `POST /record-run` - Record a run
- `POST /record-method-run` - Record method run result

**NEW - Similarity-based:**
- `GET /similar-methods?method_id={id}&n={count}` - Find similar methods
- `GET /predict-success?method_id={id}&run_id={id}` - Predict success rate
- `GET /recommend-methods?run_id={id}&n={count}` - Get recommendations

### Example Usage

```bash
# Register a method
curl -X POST http://localhost:8765/register-method \
  -H "Content-Type: application/json" \
  -d '{
    "method_id": "my_method",
    "category": "optimization",
    "parameters": {"threshold": 0.5}
  }'

# Get similar methods (NEW)
curl "http://localhost:8765/similar-methods?method_id=my_method&n=5"

# Predict success (NEW)
curl "http://localhost:8765/predict-success?method_id=my_method&run_id=run_001"
```

## Embedding Model

Default: `all-MiniLM-L6-v2` (384 dimensions)

Alternatives:
- `all-MiniLM-L6-v2` - 384 dim, fast (default)
- `all-mpnet-base-v2` - 768 dim, higher quality
- `paraphrase-MiniLM-L3-v2` - 384 dim, even faster

## Migration from SQLite

The old SQLite database remains for reference. New methods use ChromaDB.

To migrate historical data:
```python
from learning.chroma_client import ChromaLearningDB, Method, Run, MethodRun

# Historical migration is handled automatically
# by the bridge when methods are first accessed
```

## Testing

```bash
# Test chroma_client
python3 learning/chroma_client.py --test

# Test embeddings
python3 learning/embedding.py --test

# Test similarity selector
python3 learning/analytics/similarity_selector.py --test

# Run all tests
cd /home/node/.openclaw/workspace/AutoCast
python3 -m pytest learning/tests/ -v
```

## CORS

The API supports CORS for Cross-Origin Requests:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`

## Graceful Shutdown

```python
from learning.bridge import stop_server
stop_server()
```

Or via signal:
```bash
kill -SIGTERM <pid>
```

## Dependencies

- `chromadb>=0.5.0` - Vector database
- `sentence-transformers>=2.2.0` - Embedding generation
- `numpy>=1.24.0` - Numerical operations
- `scikit-learn>=1.3.0` - ML utilities
- `pandas>=2.0.0` - Data processing

---

**Note:** This is the ChromaDB-based version. Legacy SQLite code is available for reference but new development should use the ChromaDB interface.
