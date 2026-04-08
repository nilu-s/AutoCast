# AutoResearch Quickstart

In 5 Minuten loslegen mit dem AutoCast AutoResearch Workflow.

## Voraussetzungen

- Node.js v18+
- npm install ausgeführt
- Git Repository initialisiert

## In 5 Minuten loslegen

### 1. Cron-Jobs aktivieren

```bash
# Orchestrator (stündlich)
node scripts/autoresearch/setup_orchestrator_cron.js --enable

# Dispatch Processor (alle 15 Minuten)
node scripts/autoresearch/setup_dispatch_cron.js --enable
```

### 2. Status prüfen

```bash
# Orchestrator Status
node scripts/autoresearch/setup_orchestrator_cron.js --status

# Dispatch Status
node scripts/autoresearch/setup_dispatch_cron.js --status
```

### 3. Ersten Run manuell starten (optional)

Warte auf den automatischen Cron, oder starte manuell:

```bash
# Orchestrator manuell ausführen
node scripts/autoresearch/orchestrator.js
```

### 4. Ergebnisse sehen

Nach ~1 Stunde (je nach Method-Execution):

```bash
# Aktuellster Report
cat reports/autoresearch/runs/latest/CYCLE_REPORT.md

# Oder spezifischer Run
cat reports/autoresearch/runs/20260325_025616/CYCLE_REPORT.md
```

## Häufige Befehle

### Cron-Verwaltung

```bash
# Status anzeigen
node scripts/autoresearch/setup_orchestrator_cron.js --status
node scripts/autoresearch/setup_dispatch_cron.js --status

# Deaktivieren
node scripts/autoresearch/setup_orchestrator_cron.js --disable
node scripts/autoresearch/setup_dispatch_cron.js --disable

# Dry-Run (Test ohne Änderungen)
node scripts/autoresearch/setup_orchestrator_cron.js --dry-run
node scripts/autoresearch/setup_dispatch_cron.js --dry-run
```

### Manuelle Ausführung

```bash
# Orchestrator (erstellt Run + Tasks)
node scripts/autoresearch/orchestrator.js

# Dispatch Processor (verarbeitet pending Jobs)
node scripts/autoresearch/dispatch_processor.js [--runId <id>]

# Aggregator (generiert Report aus Results)
node scripts/autoresearch/aggregator.js [--runId <id>]

# Einzelne Methode ausführen
node scripts/autoresearch/execute_method.js --method <methodId>
```

### Monitoring

```bash
# Aktuelle Runs auflisten
ls -la reports/autoresearch/runs/

# Status eines Runs prüfen
cat reports/autoresearch/runs/<runId>/STATUS.json | jq '.overallStatus'

# Offene Jobs anzeigen
cat reports/autoresearch/runs/<runId>/STATUS.json | jq '.jobs | to_entries[] | select(.value.status == "PENDING")'
```

## Troubleshooting

### Keine Runs erstellt

```bash
# Prüfe ob segments.json existiert
ls docs/segments.json

# Manuelle Evaluation testen
node scripts/evaluate_pipeline.js
```

### Dispatch findet keine Jobs

```bash
# Prüfe STATUS.json
cat reports/autoresearch/runs/latest/STATUS.json

# Sollte zeigen: overallStatus: "IN_PROGRESS" und jobs mit status: "PENDING"
```

### Method Execution schlägt fehl

```bash
# Prüfe ob Template existiert
ls docs/llm/autoresearch/runtime/method_executor_prompt_template.md

# Manuelle Ausführung mit Debug
node scripts/autoresearch/execute_method.js --method <methodId> --dry-run
```

## Next Steps

1. **[Maintenance Guide](./MAINTENANCE.md)** - Regelmäßige Wartungsaufgaben
2. **[PROJECT_COMPLETION_REPORT](./PROJECT_COMPLETION_REPORT.md)** - Vollständige Projekt-Dokumentation
3. **[DEPLOYMENT_GUIDE](./DEPLOYMENT_GUIDE.md)** - Produktions-Deployment

---

*Quickstart v1.0 | AutoCast AutoResearch*
