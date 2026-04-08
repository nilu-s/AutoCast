# AutoCast Orchestrator Cron-Job Setup

Dokumentation für den stündlichen AutoCast Orchestrator Cron-Job.

## Überblick

Der Orchestrator Cron-Job führt automatisch stündlich den AutoCast Orchestrator aus, um neue Dispatch-Requests zu erstellen und Research-Jobs zu planen.

## Dateien

| Datei | Beschreibung |
|-------|-------------|
| `docs/llm/autoresearch/cron/orchestrator_cron_config.json` | Cron-Job Konfiguration für OpenClaw Gateway |
| `scripts/autoresearch/setup_orchestrator_cron.js` | Setup- und Verwaltungsskript |
| `.autocast/cron/orchestrator_state.json` | Zustandsdatei (optional) |

## Schnelleinstieg

### Status prüfen
```bash
node scripts/autoresearch/setup_orchestrator_cron.js --status
```

### Dry-Run (Test ohne Änderungen)
```bash
node scripts/autoresearch/setup_orchestrator_cron.js --dry-run
```

### Cron-Job aktivieren
```bash
# 1. Konfiguration validieren
node scripts/autoresearch/setup_orchestrator_cron.js --test

# 2. State aktivieren
node scripts/autoresearch/setup_orchestrator_cron.js --enable

# 3. Cron-Job im OpenClaw Gateway erstellen
openclaw cron create --config docs/llm/autoresearch/cron/orchestrator_cron_config.json
```

### Cron-Job deaktivieren
```bash
# State deaktivieren
node scripts/autoresearch/setup_orchestrator_cron.js --disable

# Cron-Job im Gateway löschen
openclaw cron delete autocast-orchestrator-hourly
```

## Konfiguration

### `orchestrator_cron_config.json`

```json
{
  "name": "autocast-orchestrator-hourly",
  "schedule": {
    "kind": "every",
    "everyMs": 3600000
  },
  "payload": {
    "kind": "agentTurn",
    "message": "..."
  },
  "delivery": {
    "mode": "announce",
    "channel": "telegram",
    "to": "8298214295",
    "bestEffort": true
  }
}
```

**Parameter:**
- `name`: Eindeutiger Cron-Job Name
- `schedule.everyMs`: 3600000 = 60 Minuten
- `payload.message`: Der Prompt für den Agenten
- `delivery.channel`: Ausgabekanal (telegram)
- `delivery.to`: Ziel-Chat-ID

## Workflow

Der Cron-Job führt folgende Schritte aus:

1. **Prüfung**: Arbeitsverzeichnis `/home/node/.openclaw/workspace/AutoCast`
2. **Ausführung**: `node scripts/autoresearch/orchestrator.js`
3. **Erstellung**: 
   - `reports/autoresearch/runs/{runId}/openclaw_dispatch_request.json`
   - `reports/autoresearch/runs/{runId}/STATUS.json` (mit PENDING Jobs)
   - `reports/autoresearch/runs/{runId}/method_results/` (leer)
4. **Reporting**: Run ID, Anzahl Jobs, Baseline Score
5. **Übergabe**: Dispatch Processor übernimmt Ausführung

## Erfolgskriterien

- ✅ `orchestrator.js` läuft ohne Fehler
- ✅ `STATUS.json` existiert mit PENDING Jobs
- ✅ `method_results/` Verzeichnis existiert

## Fehlerbehandlung

| Fehler | Aktion |
|--------|--------|
| orchestrator.js fehlschlägt | Logge Fehler, EXIT |
| Keine Jobs erstellt | Logge Warnung, EXIT |
| segments.json fehlt | CRITICAL - Workflow blockiert |

## Manuelle Ausführung

Für Tests oder Debug:

```bash
cd /home/node/.openclaw/workspace/AutoCast
node scripts/autoresearch/orchestrator.js
```

Ausgabe prüfen:
```bash
# Neuesten Run finden
ls -t reports/autoresearch/runs/ | head -1

# STATUS.json prüfen
cat reports/autoresearch/runs/{runId}/STATUS.json

# Dispatch-Request prüfen
cat reports/autoresearch/runs/{runId}/openclaw_dispatch_request.json
```

## Integration mit OpenClaw Gateway

Das Setup-Skript verwaltet den lokalen State. Die tatsächliche Cron-Job-Ausführung erfolgt über das OpenClaw Gateway:

```bash
# Cron-Job im Gateway anzeigen
openclaw cron list

# Logs anzeigen
openclaw cron logs autocast-orchestrator-hourly

# Manuelle Auslösung
openclaw cron trigger autocast-orchestrator-hourly
```

## Troubleshooting

### Problem: Cron-Job wird nicht ausgeführt

1. Gateway prüfen: `openclaw gateway status`
2. Cron-Job existiert: `openclaw cron list | grep autocast`
3. Logs prüfen: `openclaw cron logs autocast-orchestrator-hourly`

### Problem: Keine Runs erstellt

1. segments.json prüfen: `cat docs/segments.json | head -20`
2. Manuell testen: `node scripts/autoresearch/orchestrator.js`
3. Fehler-Output prüfen

### Problem: State inkonsistent

```bash
# State zurücksetzen
rm .autocast/cron/orchestrator_state.json
node scripts/autoresearch/setup_orchestrator_cron.js --enable
```

## Änderungshistorie

| Version | Datum | Änderungen |
|---------|-------|-----------|
| 1.0.0 | 2026-03-25 | Initiale Version |

## Siehe auch

- [WORKFLOW_MASTERPLAN.md](docs/llm/autoresearch/WORKFLOW_MASTERPLAN.md)
- [SUBAGENT_SPAWNER.md](scripts/autoresearch/SUBAGENT_SPAWNER.md)
- [AGGREGATOR.md](scripts/autoresearch/AGGREGATOR.md)
