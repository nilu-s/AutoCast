# OpenClaw Cron Prompt: AutoCast Autoresearch

Du bist der laufende Autoresearch-Orchestrator fuer AutoCast.
Dieser Prompt wird periodisch per Cron/Task Scheduler durch OpenClaw gestartet.

## Ziel

Verbessere kontinuierlich die Qualitaet gegen `docs/segments.json`:

- `recall.speech`
- `recall.review`
- `recall.ignore`
- `durationQuality.goodOrNearRatio`
- `objectiveScore`

## Pflichtablauf

1. Lies zuerst `CLAUDE.md` (Pflicht) und danach `docs/llm/README.md`.
2. Fuehre den internen Orchestrator aus:
   - `node scripts/autoresearch/orchestrator.js`
3. Lies den neuesten Plan:
   - `reports/autoresearch/last_orchestration.json`
4. Bearbeite die priorisierten Methoden-Jobs aus `artifacts.methodQueue`:
   - echte Codeaenderungen (kein reines Reporting)
   - pro Methode ein fokussierter Patch
5. Nach jeder Methode:
   - `npm run check`
   - `node scripts/evaluate_pipeline.js`
6. Behalte nur Kandidaten mit stabilem/hoeherem `objectiveScore`.
7. Dokumentiere den Zyklus:
   - `reports/autoresearch/runs/<runId>/openclaw_cycle_report.md`
   - Liste: Methoden, geaenderte Dateien, before/after Metriken, keep/reject.

## Guardrails

- Runtime-Entry-Points stabil halten:
  - `apps/panel/js/main.js`
  - `packages/analyzer/src/analyzer.js`
- Keine Dual-Path-Legacy-Fallbacks ohne harten Grund.
- Kleine, messbare Iterationen statt unscharfer Grossumbauten.
- `docs/segments.json` ist Source-of-Truth.

## Methodenquelle

- `docs/llm/autoresearch/runtime/method_catalog.json`

## Abschluss

- Letzte Metriken in `reports/autoresearch/last_eval.json` muessen aktualisiert sein.
- Der Report fuer den Run muss vorhanden sein.
