# AutoResearch - Dokumentations-Index

Vollständige Übersicht aller AutoResearch-Dateien und ihrer Zwecke.

## 📋 Hauptdokumente

| Datei | Zweck | Phase |
|-------|-------|-------|
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Installation, Setup, Cron-Jobs, Monitoring | 4.4 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Fehlerbehebung, Debug-Modus, Logs | 4.4 |
| [AUTORESEARCH_INDEX.md](AUTORESEARCH_INDEX.md) | Diese Datei - Übersicht aller Dokumente | 4.4 |

## 📖 Konzept-Dokumente

| Datei | Zweck | Phase |
|-------|-------|-------|
| [docs/llm/autoresearch/README.md](docs/llm/autoresearch/README.md) | Einführung in AutoResearch, Architektur-Überblick | 4.4 |
| [docs/llm/ARCHITECTURE.md](docs/llm/ARCHITECTURE.md) | System-Architektur, Komponenten-Interaktion | 4.0 |
| [docs/llm/API.md](docs/llm/API.md) | API-Spezifikation, Endpunkte, Datenformate | 4.0 |

## 🔧 Core Scripts

| Datei | Zweck | Phase |
|-------|-------|-------|
| `scripts/autoresearch/orchestrator.js` | Haupt-Orchestrator, erstellt Dispatch-Requests | 4.1 |
| `scripts/autoresearch/dispatch_processor.js` | Verarbeitet Dispatch-Requests | 4.1 |
| `scripts/autoresearch/method_executor.js` | Führt einzelne Methoden aus | 4.2 |
| `scripts/autoresearch/aggregator.js` | Aggregiert Ergebnisse, generiert Reports | 4.3 |
| `scripts/autoresearch/setup_orchestrator_cron.js` | Cron-Setup für Orchestrator | 4.4 |
| `scripts/autoresearch/setup_dispatch_cron.js` | Cron-Setup für Dispatch Processor | 4.4 |
| `scripts/autoresearch/cleanup.js` | Archiviert alte Runs, rotiert Logs | 4.4 |

## 🏗️ Source Code

| Datei | Zweck | Phase |
|-------|-------|-------|
| `src/autoresearch/orchestrator/` | Orchestrator-Logik | 4.1 |
| `src/autoresearch/orchestrator/index.js` | Haupt-Orchestrator-Modul | 4.1 |
| `src/autoresearch/orchestrator/planner.js` | Planung von Method-Tests | 4.1 |
| `src/autoresearch/orchestrator/dispatcher.js` | Dispatch-Management | 4.1 |
| `src/autoresearch/processor/` | Dispatch Processor Logik | 4.1 |
| `src/autoresearch/processor/index.js` | Haupt-Processor-Modul | 4.1 |
| `src/autoresearch/processor/queue.js` | Job-Queue Verwaltung | 4.1 |
| `src/autoresearch/executor/` | Method Execution Logik | 4.2 |
| `src/autoresearch/executor/index.js` | Haupt-Executor-Modul | 4.2 |
| `src/autoresearch/executor/runner.js` | Method-Runner | 4.2 |
| `src/autoresearch/executor/benchmark.js` | Benchmark-Framework | 4.2 |
| `src/autoresearch/aggregator/` | Aggregator Logik | 4.3 |
| `src/autoresearch/aggregator/index.js` | Haupt-Aggregator-Modul | 4.3 |
| `src/autoresearch/aggregator/analyzer.js` | Ergebnis-Analyse | 4.3 |
| `src/autoresearch/aggregator/report.js` | Report-Generator | 4.3 |

## 🔬 Methoden

| Datei | Zweck | Phase |
|-------|-------|-------|
| `src/autoresearch/methods/token_pruning.js` | Token-Reduktions-Methode | 4.2 |
| `src/autoresearch/methods/context_caching.js` | Context-Caching-Methode | 4.2 |
| `src/autoresearch/methods/prompt_compression.js` | Prompt-Komprimierung | 4.2 |
| `src/autoresearch/methods/batch_optimization.js` | Batch-Optimierung | 4.2 |
| `src/autoresearch/methods/parallel_requests.js` | Parallelisierung | 4.2 |

## 🎛️ Varianten

| Datei | Zweck | Phase |
|-------|-------|-------|
| `src/autoresearch/variants/token_pruning/` | Token Pruning Varianten | 4.2 |
| `src/autoresearch/variants/token_pruning/conservative.json` | Konservative Einstellungen | 4.2 |
| `src/autoresearch/variants/token_pruning/aggressive.json` | Aggressive Einstellungen | 4.2 |
| `src/autoresearch/variants/token_pruning/adaptive.json` | Adaptive Einstellungen | 4.2 |
| `src/autoresearch/variants/context_caching/` | Context Caching Varianten | 4.2 |
| `src/autoresearch/variants/prompt_compression/` | Prompt Compression Varianten | 4.2 |
| `src/autoresearch/variants/batch_optimization/` | Batch Optimization Varianten | 4.2 |
| `src/autoresearch/variants/parallel_requests/` | Parallel Requests Varianten | 4.2 |

## 🗂️ Daten & Reports

| Pfad | Zweck | Phase |
|------|-------|-------|
| `reports/autoresearch/current/` | Aktive Konfiguration | 4.1 |
| `reports/autoresearch/current/STATUS.json` | System-Status | 4.1 |
| `reports/autoresearch/current/CONFIG.json` | Globale Konfiguration | 4.1 |
| `reports/autoresearch/runs/` | Run-spezifische Daten | 4.1-4.3 |
| `reports/autoresearch/runs/{runId}/` | Einzelner Run | 4.1-4.3 |
| `reports/autoresearch/runs/{runId}/STATUS.json` | Run-Status | 4.1 |
| `reports/autoresearch/runs/{runId}/RUN_CONFIG.json` | Run-Konfiguration | 4.1 |
| `reports/autoresearch/runs/{runId}/RESULT.json` | Gesamtergebnis | 4.3 |
| `reports/autoresearch/runs/{runId}/CYCLE_REPORT.md` | Detail-Report | 4.3 |
| `reports/autoresearch/runs/{runId}/completed/` | Abgeschlossene Method-Results | 4.2 |
| `reports/autoresearch/runs/{runId}/logs/` | Log-Dateien | 4.1-4.3 |
| `reports/autoresearch/archived/` | Archivierte alte Runs | 4.4 |

## 🧪 Tests

| Datei | Zweck | Phase |
|-------|-------|-------|
| `tests/autoresearch/orchestrator.test.js` | Orchestrator Tests | 4.1 |
| `tests/autoresearch/dispatch.test.js` | Dispatch Tests | 4.1 |
| `tests/autoresearch/executor.test.js` | Executor Tests | 4.2 |
| `tests/autoresearch/benchmark.test.js` | Benchmark Tests | 4.2 |
| `tests/autoresearch/aggregator.test.js` | Aggregator Tests | 4.3 |
| `tests/autoresearch/integration.test.js` | Integration Tests | 4.3 |

## 📊 Schemas

| Datei | Zweck | Phase |
|-------|-------|-------|
| `schemas/DISPATCH_REQUEST.json` | JSON Schema für Dispatch-Requests | 4.1 |
| `schemas/METHOD_RESULT.json` | JSON Schema für Method-Results | 4.2 |
| `schemas/STATUS.json` | JSON Schema für Status-Dateien | 4.1 |
| `schemas/CONFIG.json` | JSON Schema für Konfiguration | 4.1 |

## 📈 Templates

| Datei | Zweck | Phase |
|-------|-------|-------|
| `templates/CYCLE_REPORT.md` | Template für Cycle Reports | 4.3 |
| `templates/METHOD_REPORT.md` | Template für Method Reports | 4.2 |
| `templates/STATUS_UPDATE.md` | Template für Status-Updates | 4.1 |

## Legende

| Phase | Beschreibung |
|-------|--------------|
| 4.0 | Design & Spezifikation |
| 4.1 | Orchestrator & Dispatch |
| 4.2 | Method Execution |
| 4.3 | Aggregation & Reporting |
| 4.4 | Deployment & Dokumentation |

## Quick Links

- **Schnellstart:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Architektur:** [docs/llm/ARCHITECTURE.md](docs/llm/ARCHITECTURE.md)
- **Troubleshooting:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Einführung:** [docs/llm/autoresearch/README.md](docs/llm/autoresearch/README.md)
