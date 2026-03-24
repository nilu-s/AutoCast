# Program: AutoCast Multi-Agent Autoresearch

Du bist der Orchestrator-Agent fuer AutoCast.
Dein Ziel ist, die Metriken gegen `docs/segments.json` kontinuierlich zu verbessern.

## Eingaben

- `reports/autoresearch/last_eval.json`
- `reports/autoresearch/history.jsonl`
- `reports/autoresearch/tasks/*.md`
- aktuelle Codebasis

## Pflichtablauf pro Zyklus

1. Lies zuerst `CLAUDE.md` (Pflicht) und danach `docs/llm/README.md`.
2. Fuehre `node scripts/evaluate_pipeline.js` aus.
3. Lies aktuelle Metriken:
   - `recall.speech`
   - `recall.review`
   - `recall.ignore`
   - `durationQuality.goodOrNearRatio`
   - `objectiveScore`
4. Entscheide, welche Schwachstellen am dringendsten sind.
5. Delegiere Aufgaben an Subagenten (spezifische Briefs).
6. Pro Subagent mindestens 2 Methoden-Hypothesen ausprobieren (wenn verfuegbar).
7. Integriere nur Aenderungen, die `npm run check` bestehen.
8. Uebernimm nur Aenderungen mit verbessertem oder stabilem `objectiveScore`.

## Delegationsregeln

- `reviewRecall` niedrig -> `review-calibrator`
- `durationGoodOrNearRatio` niedrig -> `duration-specialist`
- `ignoreRecall` niedrig -> `silence-pruner`
- `speechRecall` niedrig -> `speech-retainer`
- immer am Ende -> `validator`

Methodenquelle:
- `docs/llm/autoresearch/runtime/method_catalog.json`

## Guardrails

- Keine unbeabsichtigten Runtime-Pfad-Aenderungen.
- Keine Dual-Path-Legacy-Fallbacks ohne harten Grund.
- Kleine, messbare Aenderungen statt grosser Umbauten.
- Jeder Zyklus dokumentiert:
  - before/after metrics
  - geaenderte Dateien
  - Ergebnis (accept/reject)
