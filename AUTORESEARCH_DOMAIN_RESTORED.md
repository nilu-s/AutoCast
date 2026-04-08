# AutoResearch Domain - Wiederhergestellt ✅

**Datum:** 2026-03-25  
**Task:** L2 - AutoResearch Domain wiederherstellen

## Zusammenfassung

Alle 4 Collections wurden erfolgreich mit Demo-Daten erstellt und verifiziert.

## Collections

### 1. `methods` (10 Einträge)
Methoden aus dem bestehenden Katalog mit Embeddings:

| Method ID | Kategorie | Erfolgsrate | Versuche |
|-----------|-----------|-------------|----------|
| `validator_full_gate` | validator | 92% | 25 |
| `speech_low_energy_hold` | speech-retainer | 88% | 18 |
| `duration_padding_rebalance` | duration-specialist | 82% | 15 |
| `review_corridor_soften` | review-calibrator | 79% | 11 |
| `silence_overlap_bleed_weight` | silence-pruner | 75% | 12 |
| `speech_threshold_recenter` | speech-retainer | 73% | 10 |
| `duration_merge_window_tuning` | duration-specialist | 71% | 8 |
| `boundary_precision_tuner` | segmentation-expert | 70% | 6 |
| `silence_noise_gate_postprocess` | silence-pruner | 68% | 9 |
| `review_bleed_uncertainty_gate` | review-calibrator | 65% | 7 |

**Metadata:** category, title, hypothesis, description, code_scope, success_rate, attempts, parameters

### 2. `runs` (5 Einträge)
Demo-Runs mit verschiedenen Status:

| Run ID | Baseline | Final | Δ | Status | Methoden |
|--------|----------|-------|---|--------|----------|
| `run_20260320_001` | 0.62 | 0.71 | +0.09 | COMPLETED | 2 |
| `run_20260321_002` | 0.71 | 0.78 | +0.07 | COMPLETED | 3 |
| `run_20260322_003` | 0.78 | 0.75 | -0.03 | COMPLETED | 2 |
| `run_20260323_004` | 0.75 | 0.84 | +0.09 | COMPLETED | 4 |
| `run_20260324_005` | 0.84 | 0.86 | +0.02 | RUNNING | 2 |

**Metadata:** timestamp, baseline_score, final_score, status, methods_applied, context

### 3. `evaluations` (8 Einträge)
WER/CER Metriken für Baseline vs Final:

| Eval ID | Method ID | Decision | WER Δ | CER Δ |
|---------|-----------|----------|-------|-------|
| `eval_run_001` | silence_overlap_bleed_weight | KEEP | +0.04 | +0.03 |
| `eval_run_004` | speech_low_energy_hold | KEEP | +0.03 | +0.02 |
| `eval_run_006` | silence_noise_gate_postprocess | KEEP | +0.03 | +0.03 |
| `eval_run_003` | review_corridor_soften | KEEP | +0.02 | +0.01 |
| `eval_run_002` | duration_padding_rebalance | KEEP | +0.01 | +0.01 |
| `eval_run_007` | speech_threshold_recenter | KEEP | +0.01 | +0.01 |
| `eval_run_008` | speech_low_energy_hold | PENDING | +0.01 | +0.005 |
| `eval_run_005` | duration_merge_window_tuning | REJECT | -0.02 | -0.02 |

**Metadata:** run_id, method_id, baseline_wer, final_wer, baseline_cer, final_cer, improvement, decision, notes

### 4. `metrics` (10 Einträge)
Referenzwerte und Ziele:

| Metric ID | Typ | Wert | Beschreibung |
|-----------|-----|------|--------------|
| `target_wer` | target | 0.150 | Target Word Error Rate |
| `target_cer` | target | 0.080 | Target Character Error Rate |
| `current_best_wer` | current_best | 0.150 | Best WER achieved |
| `current_best_cer` | current_best | 0.085 | Best CER achieved |
| `baseline_wer` | baseline | 0.280 | Initial WER |
| `improvement_threshold` | threshold | 0.010 | Min. acceptable improvement |
| `regression_threshold` | threshold | -0.020 | Max. acceptable regression |
| `success_rate_target` | target | 0.750 | Target method success rate |
| `avg_improvement_per_run` | derived | 0.048 | Average improvement per run |
| `total_methods_tested` | count | 10 | Number of methods tested |

## Verifizierte Queries

Alle folgenden Queries funktionieren:

1. ✅ **"Finde beste Methode"** - Sortiert nach success_rate
2. ✅ **"Vergleiche Runs"** - Vergleicht baseline vs final scores
3. ✅ **"Methoden nach Kategorie"** - Filtert nach category
4. ✅ **"Ähnliche Methoden"** - Embeddings-basierte Suche
5. ✅ **"Evaluation Summary"** - WER/CER Improvements
6. ✅ **"Metrics Overview"** - Targets vs Current Best

## Dateien

- `create_autoresearch_collections.py` - Script zum Erstellen der Collections
- `verify_autoresearch_collections.py` - Verifizierungsscript
- `test_autoresearch_queries.py` - Query-Tests

## ChromaDB Status

```
Collections (9):
  - methods (10 entries)
  - runs (5 entries)
  - evaluations (8 entries)
  - metrics (10 entries)
  - constraints (existing)
  - agents (existing)
  - skills (existing)
  - tasks (existing)
  - method_runs (existing)
```

## Nächste Schritte

- Integration in den Workflow
- Aktualisierung bei neuen Runs
- Analytics Dashboard aufbauen
