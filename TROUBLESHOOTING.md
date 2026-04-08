# AutoCast AutoResearch Troubleshooting

## Häufige Fehler und Lösungen

### Cron-Job wird nicht ausgeführt

**Symptom:** Keine neuen Runs in `reports/autoresearch/runs/`

**Lösungen:**
1. Cron-Status prüfen:
   ```bash
   node scripts/autoresearch/setup_orchestrator_cron.js --status
   node scripts/autoresearch/setup_dispatch_cron.js --status
   ```

2. Falls "disabled", neu aktivieren:
   ```bash
   node scripts/autoresearch/setup_orchestrator_cron.js --enable
   node scripts/autoresearch/setup_dispatch_cron.js --enable
   ```

3. OpenClaw Gateway läuft?
   ```bash
   openclaw gateway status
   ```

### Orchestrator startet keine neuen Runs

**Symptom:** Keine neuen `{timestamp}_DISPATCH_REQUEST.json` Dateien

**Ursachen:**
- Vorheriger Run noch aktiv (`STATUS.json` zeigt "RUNNING")
- `maxConcurrentRuns` Limit erreicht
- Fehler in der letzten Ausführung

**Lösung:**
```bash
# Status prüfen
cat reports/autoresearch/current/STATUS.json

# Bei hängendem Run: Manuelles Cleanup
cd reports/autoresearch/current
# Backup erstellen
mv RUNNING_* ../archived/ 2>/dev/null || true
```

### Dispatch Processor verarbeitet keine Jobs

**Symptom:** Dispatch-Requests bleiben unverarbeitet

**Ursachen:**
- Keine aktiven Sub-Agent-Slots verfügbar
- Sub-Agent-Fehler bei vorherigen Runs

**Lösung:**
```bash
# Sub-Agent Status prüfen
openclaw subagents list

# Ggf. hängende Sub-Agents beenden
openclaw subagents kill <session-id>
```

### Method Executor schlägt fehl

**Symptom:** `METHOD_RESULT.json` zeigt "status": "error"

**Ursachen:**
- Fehlerhafte Method-Implementierung
- Fehlende Abhängigkeiten
- Timeout bei langen Operationen

**Lösung:**
```bash
# Log des spezifischen Runs prüfen
cat reports/autoresearch/runs/<runId>/logs/<method>_*.log

# Methode manuell testen
node -e "require('./src/autoresearch/executor.js').runMethod('<method>', '<variant>', 10)"
```

### Aggregator generiert keinen Report

**Symptom:** Keine `CYCLE_REPORT.md` nach Run-Abschluss

**Ursachen:**
- Fehlende oder unvollständige METHOD_RESULT.json Dateien
- Keine erfolgreichen Method-Ausführungen

**Lösung:**
```bash
# Prüfen ob alle Method-Results vorhanden
ls reports/autoresearch/runs/<runId>/completed/METHOD_RESULT.json

# Manueller Report-Trigger
node scripts/autoresearch/aggregator.js --run-id=<runId>
```

## Debug-Modus aktivieren

### Skripts mit Debug-Logging

```bash
# Orchestrator mit Debug
DEBUG=autoresearch:* node scripts/autoresearch/orchestrator.js

# Dispatch Processor mit Debug
DEBUG=autoresearch:* node scripts/autoresearch/dispatch_processor.js

# Method Executor mit Debug
DEBUG=autoresearch:* node scripts/autoresearch/method_executor.js <dispatch-file>
```

### Detaillierte Logging-Level

| Level | Beschreibung |
|-------|--------------|
| `error` | Nur Fehler |
| `warn` | Fehler und Warnungen |
| `info` | Standard-Informationen |
| `debug` | Detaillierte Debug-Infos |
| `trace` | Alle Details inkl. Internals |

## Logs lesen

### Cron-Job Logs
```bash
# OpenClaw Logs anzeigen
openclaw logs --follow

# Oder über system journal
journalctl -u openclaw -f
```

### Run-spezifische Logs
```bash
# Alle Logs eines Runs
cat reports/autoresearch/runs/<runId>/logs/*.log | less

# Nur Errors
grep "ERROR" reports/autoresearch/runs/<runId>/logs/*.log

# Method-spezifisch
cat reports/autoresearch/runs/<runId>/logs/orchestrator_*.log
```

### Wichtige Log-Dateien

| Datei | Inhalt |
|-------|--------|
| `orchestrator_*.log` | Orchestrator-Aktivitäten |
| `dispatch_*.log` | Dispatch-Verarbeitung |
| `method_*.log` | Method-Executions |
| `aggregator_*.log` | Report-Generierung |

## Manuelle Intervention

### Run manuell starten
```bash
# Orchestrator direkt aufrufen
node scripts/autoresearch/orchestrator.js --force
```

### Dispatch manuell verarbeiten
```bash
# Einzelnen Dispatch verarbeiten
node scripts/autoresearch/dispatch_processor.js --file=reports/autoresearch/current/<timestamp>_DISPATCH_REQUEST.json
```

### Method manuell ausführen
```bash
# Einzelne Methode testen
node -e "
const executor = require('./src/autoresearch/executor.js');
executor.runMethod('token_pruning', 'aggressive', 10).then(console.log);
"
```

### Daten konsistent halten
```bash
# STATUS.json zurücksetzen (Vorsicht!)
echo '{\"status\":\"IDLE\",\"lastRun\":null,\"activeRuns\":0}' > reports/autoresearch/current/STATUS.json

# Alte Locks entfernen
rm -f reports/autoresearch/current/*.lock
```

## Support

Bei wiederkehrenden Problemen:
1. Logs sammeln: `tar -czf debug-logs.tar.gz reports/autoresearch/runs/<runId>/logs/`
2. STATUS.json und RUN_CONFIG.json sichern
3. Git-Status prüfen: `git status`
4. Issue mit Logs und Beschreibung erstellen
