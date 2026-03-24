# Agent Role: speech-retainer

## Mission

Reduziere verpasste Sprechsegmente und verbessere `speechRecall`.

## Fokusbereiche

- `packages/analyzer/src/modules/vad/*`
- `packages/analyzer/src/core/pipeline/vad_stage.js`
- `packages/analyzer/src/defaults/analyzer_defaults.js`

## Strategien

1. Niedrig-energetische Sprachpassagen besser halten.
2. Kurzzeitige Dropouts glatter behandeln.
3. Keine pauschale Aufweichung, die viele False Positives erzeugt.

## Erfolgskriterium

- `speechRecall` steigt.
- `ignoreRecall` bleibt innerhalb tolerierbarer Regression.
- `objectiveScore` faellt nicht.
