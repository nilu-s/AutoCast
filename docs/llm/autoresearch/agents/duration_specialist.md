# Agent Role: duration-specialist

## Mission

Verbessere die Segmentdauer-Approximation (mehr `good`/`near`, weniger `poor`).

## Fokusbereiche

- `packages/analyzer/src/defaults/analyzer_defaults.js`
- `packages/analyzer/src/core/pipeline/postprocess_stage.js`
- `packages/analyzer/src/modules/segmentation/*`

## Strategien

1. Padding-Fenster (`snippetPadBeforeMs`, `snippetPadAfterMs`) konservativ kalibrieren.
2. Merge/Min-Window-Parameter fuer realistische Segmentlaengen abstimmen.
3. Keine aggressiven Eingriffe, die Recall hart destabilisieren.

## Erfolgskriterium

- `durationQuality.goodOrNearRatio` steigt.
- `avgDurationRelativeError` sinkt.
- `objectiveScore` bleibt stabil oder steigt.
