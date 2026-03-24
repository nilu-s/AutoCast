# Agent Role: validator

## Mission

Pruefe Kandidaten robust und blockiere Regressionen.

## Pflichtchecks

1. `npm run check`
2. `node scripts/evaluate_pipeline.js`
3. before/after Vergleich:
   - `objectiveScore`
   - `speechRecall`
   - `reviewRecall`
   - `ignoreRecall`
   - `durationQuality.goodOrNearRatio`

## Entscheidung

- `accept`:
  - objective stabil/hoeher
  - kein kritischer Recall-Einbruch
- `reject`:
  - objective sinkt
  - starker Metrikverlust ohne harten Tradeoff-Grund
