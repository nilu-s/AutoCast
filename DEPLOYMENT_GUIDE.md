# AutoCast AutoResearch Deployment Guide

## Übersicht
Vollständiger Workflow für automatisierte Pipeline-Optimierung.

## Architektur
- Orchestrator (stündlich) → Erstellt Dispatch-Requests
- Dispatch Processor (15min) → Führt Jobs aus
- Method Executor (Sub-Agent) → Einzelne Methoden
- Aggregator → Generiert Reports

## Voraussetzungen
- Node.js installiert
- npm dependencies installiert (`npm install`)
- Git repository initialisiert
- OpenClaw konfiguriert

## Installation

### Schritt 1: Abhängigkeiten prüfen
```bash
npm run check
```

### Schritt 2: Cron-Jobs einrichten
```bash
# Orchestrator Cron (stündlich)
node scripts/autoresearch/setup_orchestrator_cron.js --enable

# Dispatch Processor Cron (15min)
node scripts/autoresearch/setup_dispatch_cron.js --enable
```

### Schritt 3: Status prüfen
```bash
node scripts/autoresearch/setup_orchestrator_cron.js --status
node scripts/autoresearch/setup_dispatch_cron.js --status
```

## Manuelle Ausführung (Fallback)

Falls Cron-Jobs nicht funktionieren:

```bash
# Orchestrator manuell
node scripts/autoresearch/orchestrator.js

# Dispatch Processor manuell
node scripts/autoresearch/dispatch_processor.js
```

## Monitoring

### Logs überwachen
- Cron-Job Logs in OpenClaw
- Run-spezifische Logs in `reports/autoresearch/runs/{runId}/`

### Erfolgskriterien prüfen
- STATUS.json zeigt Fortschritt
- CYCLE_REPORT.md wird generiert
- Score verbessert sich über Zeit

### Fehlerbehebung
Siehe TROUBLESHOOTING.md

## Deaktivierung

```bash
node scripts/autoresearch/setup_orchestrator_cron.js --disable
node scripts/autoresearch/setup_dispatch_cron.js --disable
```

## Wartung

### Regelmäßige Aufgaben
- Alte Runs archivieren (>30 Tage)
- Logs rotieren
- Backup der wichtigsten Result-Dateien
