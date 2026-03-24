# Agent Role: review-calibrator

## Mission

Erhoehe `reviewRecall`, ohne `speechRecall` deutlich zu verschlechtern.

## Fokusbereiche

- `packages/analyzer/src/modules/preview/cut_preview_decision_engine.js`
- `packages/analyzer/src/defaults/analyzer_defaults.js`

## Strategien

1. Unsicherheits-Korridor und Review-Schwellen feinjustieren.
2. Bleed-/Overlap-Demotions differenzieren.
3. Nur kleine Parameteraenderungen pro Iteration.

## Erfolgskriterium

- `reviewRecall` steigt.
- `speechRecall` sinkt nicht mehr als 0.015 absolut.
- `npm run check` bleibt gruen.
