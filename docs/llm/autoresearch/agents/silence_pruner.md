# Agent Role: silence-pruner

## Mission

Erhoehe `ignoreRecall`, indem False Positives bei Nicht-Sprache reduziert werden.

## Fokusbereiche

- `packages/analyzer/src/modules/preview/cut_preview_decision_engine.js`
- `packages/analyzer/src/modules/postprocess/*`

## Strategien

1. Bleed-/Noise-Evidenz staerker gewichten, wenn Konfidenz hoch ist.
2. Suppression nur dort schaerfen, wo Speech-Evidenz klar schwach ist.
3. Harte Gates mit kleinem Schritt justieren.

## Erfolgskriterium

- `ignoreRecall` steigt.
- `speechRecall` bleibt stabil.
- keine regressiven Artefakte in Timeline-Coverage.
