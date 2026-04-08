# ChromaDB Docker Setup

Diese Dokumentation beschreibt die Docker-kompatible Einrichtung von ChromaDB für AutoCast.

## Übersicht

Da Docker in diesem Environment nicht mit Root-Rechten läuft, wird ChromaDB im **Docker-Style** betrieben:
- Isoliertes Datenverzeichnis (`chroma_data/`)
- PersistentClient für persistente Speicherung
- Optionale HTTP-API für externe Verbindungen

## Dateistruktur

```
AutoCast/
├── chroma_data/              # ChromaDB Daten (Docker-Style)
│   ├── chroma.sqlite3        # SQLite Datenbank
│   └── ...                   # Weitere ChromaDB Dateien
├── docker-compose.chroma.yml # Docker Compose Konfiguration
├── chroma_api_server.py      # Optionaler REST API Server
└── learning/
    ├── chroma_client.py    # Docker-kompatibler Client
    └── bridge.py            # HTTP Bridge
```

## Installation

### 1. Abhängigkeiten

```bash
python3 -m pip install chromadb sentence-transformers --break-system-packages
```

### 2. Docker Compose (optional - für echtes Docker)

```bash
# Starte ChromaDB Container
docker compose -f docker-compose.chroma.yml up -d

# Prüfe Status
docker ps | grep chroma
curl http://localhost:8000/api/v1/heartbeat
```

### 3. Docker-Style (ohne Docker)

```bash
# ChromaDB Client verwendet automatisch chroma_data/
python3 -c "from learning.chroma_client import ChromaLearningDB; db = ChromaLearningDB()"
```

## Konfiguration

### Umgebungsvariablen

| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `CHROMA_PERSIST_DIR` | Datenverzeichnis | `chroma_data` |
| `CHROMA_USE_HTTP` | HttpClient verwenden | `false` |
| `CHROMA_HOST` | ChromaDB Host | `localhost` |
| `CHROMA_PORT` | ChromaDB Port | `8000` |

### Verwendung im Code

```python
from learning.chroma_client import ChromaLearningDB

# Docker-Style (lokale Speicherung)
db = ChromaLearningDB(persist_dir="chroma_data")

# Mit HTTP-Client (echtes Docker)
db = ChromaLearningDB(use_http=True, host="localhost", port=8000)
```

## Start/Stop Befehle

### Start

```bash
# Docker-Style Client (kein Server nötig)
python3 -c "from learning.chroma_client import ChromaLearningDB; db = ChromaLearningDB()"

# Optional: REST API Server starten
python3 chroma_api_server.py &
```

### Stop

```bash
# REST API Server stoppen
pkill -f chroma_api_server

# Oder mit PID
kill <PID>
```

### Mit Docker

```bash
# Starten
docker compose -f docker-compose.chroma.yml up -d

# Stoppen
docker compose -f docker-compose.chroma.yml down

# Logs
docker compose -f docker-compose.chroma.yml logs -f
```

## Verifikation

```bash
# 1. Prüfe API Erreichbarkeit
curl http://localhost:8000/api/v1/heartbeat

# 2. Liste Collections
curl http://localhost:8000/api/v1/collections

# 3. Python Test
python3 -c "
from learning.chroma_client import ChromaLearningDB
db = ChromaLearningDB()
print('Collections:', [c.name for c in db.client.list_collections()])
"
```

## Troubleshooting

### Port 8000 belegt

```bash
# Finde Prozess
lsof -i :8000

# Beenden
kill <PID>
```

### Permission denied

```bash
# Berechtigungen korrigieren
chmod -R 755 chroma_data/
```

### Daten Migration

```bash
# Von altem chroma_db zu chroma_data
python3 migrate_to_docker.py
```

### Embedding Model Fehler

```bash
# Model Cache löschen
rm -rf ~/.cache/torch/sentence_transformers/
```

## Migration von alter DB

```bash
# 1. Sichere alte Daten
cp -r method_results/chroma_db method_results/chroma_db.backup

# 2. Migriere
python3 migrate_to_docker.py

# 3. Verifiziere
python3 -c "
from learning.chroma_client import ChromaLearningDB
db = ChromaLearningDB()
print('OK: Daten migriert')
"
```

## Backup

```bash
# Backup erstellen
tar -czf chroma_backup_$(date +%Y%m%d).tar.gz chroma_data/

# Backup wiederherstellen
rm -rf chroma_data/
tar -xzf chroma_backup_YYYYMMDD.tar.gz
```
