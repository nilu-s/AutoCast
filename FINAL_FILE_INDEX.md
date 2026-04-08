# AutoResearch - Final File Index

Vollständige, finale Liste aller relevanten Dateien im AutoResearch-System.

**Generated:** 2026-03-25  
**Version:** AutoResearch v3.4.0  
**Status:** Production Ready

---

## Core Scripts

| Pfad | Zweck | Größe | Letzte Änderung |
|------|-------|-------|-----------------|
| `scripts/autoresearch/orchestrator.js` | Haupt-Orchestrator - Erstellt Runs, Tasks, Dispatch-Requests | ~18KB | 2026-03-25 |
| `scripts/autoresearch/dispatch_processor.js` | Verarbeitet pending Jobs, spawnt Method Executors | ~14KB | 2026-03-25 |
| `scripts/autoresearch/aggregator.js` | Sammelt Results, generiert CYCLE_REPORT.md | ~8KB | 2026-03-25 |
| `scripts/autoresearch/execute_method.js` | Führt einzelne Methoden aus | ~6KB | 2026-03-25 |
| `scripts/autoresearch/execute_method.test.js` | Unit Tests für Method Execution | ~3KB | 2026-03-25 |

## Cron Management

| Pfad | Zweck | Größe | Letzte Änderung |
|------|-------|-------|-----------------|
| `scripts/autoresearch/setup_orchestrator_cron.js` | Verwaltet Orchestrator Cron-Job | ~7KB | 2026-03-25 |
| `scripts/autoresearch/setup_dispatch_cron.js` | Verwaltet Dispatch Cron-Job (ES Modules) | ~8KB | 2026-03-25 |

## Library Modules

| Pfad | Zweck | Größe | Letzte Änderung |
|------|-------|-------|-----------------|
| `scripts/autoresearch/lib/result_naming.mjs` | Generiert eindeutige Job-Keys und Result-Pfade | ~2KB | 2026-03-25 |
| `scripts/autoresearch/lib/status_manager.mjs` | STATUS.json CRUD-Operationen | ~4KB | 2026-03-25 |

## Configuration

| Pfad | Zweck | Größe | Letzte Änderung |
|------|-------|-------|-----------------|
| `docs/llm/autoresearch/runtime/config.json` | Targets, Limits, Method-Catalog Pfad | ~1KB | 2026-03-25 |
| `docs/llm/autoresearch/runtime/method_catalog.json` | Verfügbare Methoden pro Agent | ~3KB | 2026-03-25 |
| `docs/llm/autoresearch/cron/orchestrator_cron_config.json` | Cron-Schedule für Orchestrator | ~1KB | 2026-03-25 |
| `docs/llm/autoresearch/cron/dispatch_cron_config.json` | Cron-Schedule für Dispatch | ~1KB | 2026-03-25 |

## Documentation

| Pfad | Zweck | Größe | Letzte Änderung |
|------|-------|-------|-----------------|
| `PROJECT_COMPLETION_REPORT.md` | Umfassender Abschluss-Bericht | ~15KB | 2026-03-25 |
| `QUICKSTART.md` | Schnelleinstieg für neue Nutzer | ~5KB | 2026-03-25 |
| `MAINTENANCE.md` | Wartungs- und Monitoring-Guide | ~12KB | 2026-03-25 |
| `FINAL_FILE_INDEX.md` | Diese Datei - Kompletter Datei-Index | ~8KB | 2026-03-25 |
| `DEPLOYMENT_GUIDE.md` | Produktions-Deployment Anleitung | ~6KB | 2026-03-25 |
| `INTEGRATION_TEST_REPORT.md` | Test-Ergebnisse und Bug-Reports | ~10KB | 2026-03-25 |

## Output Directories

| Pfad | Zweck |
|------|-------|
| `reports/autoresearch/runs/<runId>/` | Run-spezifische Daten (STATUS.json, CYCLE_REPORT.md, Task-Files) |
| `reports/autoresearch/tasks/` | Aktuelle Task-Briefs (Symlinks zu latest) |
| `reports/autoresearch/archive/` | Archivierte Runs (>30 Tage) |
| `.cron/` | Cron-Status-Dateien (Marker-Files) |
| `logs/` | Application Logs (wenn konfiguriert) |

## Generated Files (pro Run)

| Datei | Beschreibung |
|-------|--------------|
| `STATUS.json` | Job-Status-Tracking (PENDING/RUNNING/COMPLETED/FAILED) |
| `CYCLE_REPORT.md` | Abschlussbericht mit Metriken und Decisions |
| `run_plan.json` | Vollständiger Run-Plan mit Tasks und Methods |
| `method_queue.json` | Queue aller auszuführenden Method-Jobs |
| `dispatch_result.json` | Dispatch-Metadaten |
| `openclaw_dispatch_request.json` | Machine-readable Dispatch-Request |
| `OPENCLAW_DISPATCH.md` | Human-readable Dispatch-Übersicht |
| `orchestrator_brief.md` | Zusammenfassung für Menschen |
| `<N>_<agent>.md` | Task-Briefs |
| `<N>_<agent>_method_<M>_<method>.md` | Method-Briefs |
| `method_results/<jobKey>.json` | Einzelne Method-Results |
| `subagent-tasks/` | Sub-Agent Task-Files (temp) |

## Statische Reports

| Pfad | Beschreibung |
|------|--------------|
| `reports/autoresearch/history.jsonl` | Append-only Historie aller Runs (JSON Lines) |
| `reports/autoresearch/last_eval.json` | Letzte Pipeline-Evaluation |
| `reports/autoresearch/last_orchestration.json` | Letzter Orchestrator-Plan |

## Zusammenfassung

| Kategorie | Anzahl Dateien | Gesamtgröße |
|-----------|----------------|-------------|
| Core Scripts | 6 | ~56KB |
| Library Modules | 2 | ~6KB |
| Cron Management | 2 | ~15KB |
| Configuration | 4 | ~6KB |
| Documentation | 6 | ~58KB |
| **Total (Statisch)** | **20** | **~141KB** |

### Dynamische Dateien (beispielhaft pro Run)

- ~20 Dateien pro Run (Tasks, Methods, Results, Reports)
- Aktuell ~30 Runs = ~600 Dateien
- Empfohlen: Archivierung nach 30 Tagen

### Disk-Nutzung (geschätzt)

```
Statische Dateien:      ~150 KB
Pro Run:                ~50 KB
30 Tage Retention:      ~1.5 MB
90 Tage Retention:      ~4.5 MB
Archiv (komprimiert):   ~30% der Originalgröße
```

---

## Verzeichnisstruktur

```
AutoCast/
├── scripts/
│   └── autoresearch/
│       ├── orchestrator.js
│       ├── dispatch_processor.js
│       ├── aggregator.js
│       ├── execute_method.js
│       ├── execute_method.test.js
│       ├── setup_orchestrator_cron.js
│       ├── setup_dispatch_cron.js
│       └── lib/
│           ├── result_naming.mjs
│           └── status_manager.mjs
├── docs/
│   └── llm/
│       └── autoresearch/
│           ├── runtime/
│           │   ├── config.json
│           │   ├── method_catalog.json
│           │   └── method_executor_prompt_template.md
│           └── cron/
│               ├── orchestrator_cron_config.json
│               └── dispatch_cron_config.json
├── reports/
│   └── autoresearch/
│       ├── runs/
│       │   └── 20260325_025616/
│       │       ├── STATUS.json
│       │       ├── CYCLE_REPORT.md
│       │       ├── run_plan.json
│       │       ├── method_queue.json
│       │       └── ...
│       ├── tasks/
│       ├── archive/
│       ├── history.jsonl
│       ├── last_eval.json
│       └── last_orchestration.json
├── .cron/
│   ├── orchestrator_enabled
│   └── dispatch_enabled
├── logs/
│   └── autoresearch.log
├── PROJECT_COMPLETION_REPORT.md
├── QUICKSTART.md
├── MAINTENANCE.md
├── FINAL_FILE_INDEX.md
├── DEPLOYMENT_GUIDE.md
└── INTEGRATION_TEST_REPORT.md
```

---

*File Index v1.0 | AutoCast AutoResearch*
