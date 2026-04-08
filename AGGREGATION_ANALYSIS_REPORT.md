# AutoCast Result Aggregation Analysis

## 1. Aktueller Zustand

### 1.1 CYCLE_REPORT.md Existenz
**Ja**, CYCLE_REPORT.md wird erstellt – allerdings mit einem gravierenden Mangel:
- **Dateiname:** `openclaw_cycle_report.md` (im jeweiligen Run-Verzeichnis)
- **Erstellt bei:** Cycle-Start (Orchestrierung)
- **Problem:** Die Sektionen "Accepted Methods" und "Rejected Methods" bleiben **immer leer** (`*(pending dispatch execution)*`)

### 1.2 Beobachtung aus 28+ Runs
Alle gefundenen `openclaw_cycle_report.md` Dateien zeigen das gleiche Muster:
```markdown
## Accepted Methods
*(pending dispatch execution)*

## Rejected Methods
*(pending dispatch execution)*
```

### 1.3 Method Results Struktur
Die `method_results/*.json` Dateien werden erstellt, aber **nicht aggregiert**. Zwei verschiedene Schemas wurden gefunden:

**Schema A (älter):**
```json
{
  "method_name": "...",
  "timestamp": "...",
  "objectiveScore": { "before": 0.267, "after": 0.6385, "improvement": 0.3715 },
  "changed_files": [...],
  "changes_summary": [...],
  "test_results": { "npm_check": "passed", ... },
  "metrics": { "speech_recall": "90.51%", ... },
  "recommendation": "KEEP",
  "rationale": "..."
}
```

**Schema B (neuer):**
```json
{
  "jobIndex": 1,
  "methodId": "silence_overlap_bleed_weight",
  "status": "completed",
  "changedFiles": [...],
  "metricsBefore": { "recall": {...}, "durationQuality": {...} },
  "metricsAfter": { "recall": {...}, "durationQuality": {...} },
  "objectiveScoreBefore": 0.6385,
  "objectiveScoreAfter": 0.6385,
  "recommendation": "REJECT",
  "reason": "..."
}
```

**Schema C (weitere Variante):**
```json
{
  "methodId": "review_corridor_soften",
  "status": "completed",
  "decision": "reject",
  "scoreBefore": 0.6385,
  "scoreAfter": 0.6346,
  "delta": -0.0039,
  "changedFiles": [...],
  "notes": "..."
}
```

### 1.4 Das Problem
- Keine zentrale Aggregation aller Job-Ergebnisse
- Keine Übersicht über KEEP/REJECT Entscheidungen pro Run
- Keine Score-Verlaufs-Dokumentation
- Keine Zusammenfassung was verbessert wurde
- Der CYCLE_REPORT bleibt ein "Start-Dokument" ohne Abschluss

---

## 2. Vorgeschlagene CYCLE_REPORT Struktur

```markdown
# CYCLE_REPORT.md – Run Abschlussbericht

## Run Metadata
| Feld | Wert |
|------|------|
| Run ID | 20260324_194419 |
| Timestamp Start | 2026-03-24T19:44:19Z |
| Timestamp End | 2026-03-24T20:37:00Z |
| Baseline Score | 0.2670 |
| Final Best Score | 0.6385 |
| Total Improvement | +139% |

## Score Verlauf
```
0.2670 → 0.6385 (+0.3715)  [silence_overlap_bleed_weight - KEEP]
0.6385 → 0.6385 (+0.0000)  [silence_noise_gate_postprocess - REJECT]
0.6385 → 0.6385 (+0.0000)  [duration_padding_rebalance - REJECT]
0.6385 → 0.6379 (-0.0006)  [duration_merge_window_tuning - REJECT]
0.6379 → 0.6346 (-0.0033)  [review_corridor_soften - REJECT]
...
```

## Jobs Übersicht

### Abgeschlossene Jobs (9/9)

| # | Task Agent | Method ID | Status | Decision | Score Δ | Files Changed |
|---|------------|-----------|--------|----------|---------|---------------|
| 1 | silence-pruner | silence_overlap_bleed_weight | ✅ COMPLETED | **KEEP** | +0.3715 | 1 |
| 2 | silence-pruner | silence_noise_gate_postprocess | ✅ COMPLETED | REJECT | 0.0000 | 0 |
| 3 | duration-specialist | duration_padding_rebalance | ✅ COMPLETED | REJECT | 0.0000 | 0 |
| 4 | duration-specialist | duration_merge_window_tuning | ✅ COMPLETED | REJECT | -0.0006 | 2 |
| 5 | review-calibrator | review_corridor_soften | ✅ COMPLETED | REJECT | -0.0039 | 1 |
| 6 | review-calibrator | review_bleed_uncertainty_gate | ✅ COMPLETED | REJECT | -0.0014 | 1 |
| 7 | speech-retainer | speech_low_energy_hold | ✅ COMPLETED | REJECT | -0.0058 | 3 |
| 8 | speech-retainer | speech_threshold_recenter | ✅ COMPLETED | REJECT | -0.0006 | 1 |
| 9 | validator | validator_full_gate | ✅ COMPLETED | REJECT | 0.0000 | 0 |

### Zusammenfassung nach Decision

| Decision | Count | Gesamter Impact |
|----------|-------|-----------------|
| KEEP | 1 | +0.3715 |
| REJECT | 8 | -0.0123 (kumulativ, vor Reverts) |
| PENDING | 0 | - |
| FAILED | 0 | - |

## Akzeptierte Änderungen (KEEP)

### 1. silence_overlap_bleed_weight
- **Task:** silence-pruner
- **Score Impact:** +0.3715 (+139%)
- **Files:** `packages/analyzer/src/modules/preview/cut_preview_decision_engine.js`
- **Changes:**
  - bleedConfidence: 0.26 → 0.34
  - bleedEvidence: 0.15 → 0.20
  - contextualOverlapPenalty: 0.22 → 0.28
- **Metrics After:**
  - speechRecall: 90.51%
  - reviewRecall: 4.95%
  - ignoreRecall: 92.39%
  - goodNearRatio: 24.33%
- **Tests:** 115/115 passed

## Abgelehnte Änderungen (REJECT)

| Method | Reason |
|--------|--------|
| silence_noise_gate_postprocess | Keine messbare Auswirkung |
| duration_padding_rebalance | Keine messbare Auswirkung |
| duration_merge_window_tuning | Score -0.0006, mehr Fragmentierung |
| review_corridor_soften | Score -0.0039, review recall blieb niedrig |
| review_bleed_uncertainty_gate | Keine messbare Auswirkung |
| speech_low_energy_hold | Score -0.0058, Hypothese falsch |
| speech_threshold_recenter | Score -0.0006 |
| validator_full_gate | Keine Änderungen |

## Metrik-Entwicklung

| Metrik | Initial | Final | Ziel | Gap |
|--------|---------|-------|------|-----|
| objectiveScore | 0.267 | 0.6385 | 0.82 | -0.1815 |
| speechRecall | 0.593 | 0.905 | 0.93 | -0.025 |
| reviewRecall | 0.000 | 0.050 | 0.20 | -0.150 |
| ignoreRecall | 0.000 | 0.924 | 0.94 | -0.016 |
| durationGoodOrNearRatio | 0.000 | 0.243 | 0.70 | -0.457 |

## Learnings & Patterns

### Was funktioniert:
- Overlap/bleed Suppression-Gewichtung erhöhen → signifikanter Gain

### Was nicht funktioniert:
- Subtile Parameter-Tweaks ohne Testdaten-Abdeckung
- Review corridor softening (review recall bleibt stubborn)
- Low-energy speech protection (führt zu mehr Fehlern)

### Offene Probleme:
- reviewRecall bleibt bei ~5% (Ziel: 20%)
- durationGoodOrNearRatio nur 24% (Ziel: 70%)

## Nächste Empfohlene Schritte

1. **Review Recall:** Aggressivere Maßnahmen nötig – aktuelle Änderungen zu konservativ
2. **Duration Quality:** Separater Fokus auf Segment-Längen-Approximation
3. **Validation:** Der Validator hat keine Änderungen akzeptiert – möglicherweise zu streng?

---
*Generated by AutoCast Result Aggregator | 2026-03-25T02:00:00Z*
```

---

## 3. Implementierungsplan

### 3.1 Architektur-Entscheidung: Separater Cron-Job vs. Teil des Dispatch-Processors

**Empfehlung: Teil des Dispatch-Processors** (mit Modifikation)

| Kriterium | Separater Cron-Job | Teil Dispatch-Processor |
|-----------|-------------------|------------------------|
| Echtzeit-Update | ❌ Verzögert | ✅ Sofort nach Job-Completion |
| Komplexität | Höher (separate Prozessverwaltung) | Niedriger (bestehende Infrastruktur) |
| Fehlerbehandlung | Eigene Logik nötig | Nutzt bestehende Retry-Mechanismen |
| Ressourcen | Zusätzlicher Overhead | Kein zusätzlicher Overhead |
| Entkopplung | Stärker entkoppelt | Enger gekoppelt |

**Entscheidungsbegründung:**
Der Dispatch-Processor weiß bereits, wann ein Job endet (Sub-Agent Completion). Ein separater Cron-Job müsste entweder:
- Polling machen (ineffizient)
- Oder auf Events warten (komplexere Infrastruktur)

### 3.2 Vorgeschlagene Implementierung

**Option A: Inline Aggregation (Empfohlen)**
```
Dispatch Processor:
  FOR each job in jobs:
    1. Spawn Sub-Agent
    2. Wait for completion
    3. Read method_results/job_X_result.json
    4. Update CYCLE_REPORT.md (append to section)
    5. Update running score/metrics
  6. Finalize CYCLE_REPORT.md (summary section)
```

**Option B: Post-Process Aggregation**
```
Dispatch Processor:
  FOR each job in jobs:
    1. Spawn Sub-Agent
    2. Wait for completion
    3. Continue to next job
  
  AFTER all jobs:
    4. Call Aggregator Function
    5. Aggregator liest alle method_results/*.json
    6. Generiert finalen CYCLE_REPORT.md
```

**Empfehlung: Option B** – sauberere Trennung, einfacher zu testen

### 3.3 Aggregator-Komponente

**Datei:** `scripts/aggregate_cycle_results.js`

**Input:**
- `runDir` (z.B. `/.../runs/20260324_194419/`)
- `dispatch_request.json` (für Job-Metadaten)
- `method_results/*.json` (für Ergebnisse)
- `orchestrator_brief.md` (für Initial-Metriken)

**Output:**
- Aktualisiertes `CYCLE_REPORT.md`

**Algorithmus:**
```javascript
function aggregateCycleResults(runDir) {
  const dispatchRequest = readJSON(`${runDir}/openclaw_dispatch_request.json`);
  const brief = readMarkdown(`${runDir}/orchestrator_brief.md`);
  const resultFiles = glob(`${runDir}/method_results/*.json`);
  
  const results = resultFiles.map(file => readJSON(file));
  const baselineScore = extractBaselineScore(brief);
  
  let currentScore = baselineScore;
  const jobSummaries = [];
  
  for (const job of dispatchRequest.jobs) {
    const result = results.find(r => r.methodId === job.methodId || r.jobIndex === job.index);
    
    if (!result) {
      jobSummaries.push({ status: 'PENDING', ... });
      continue;
    }
    
    const scoreBefore = result.objectiveScoreBefore || result.scoreBefore;
    const scoreAfter = result.objectiveScoreAfter || result.scoreAfter;
    const delta = scoreAfter - scoreBefore;
    
    jobSummaries.push({
      index: job.index,
      taskAgent: job.taskAgent,
      methodId: job.methodId,
      methodTitle: job.methodTitle,
      status: result.status || 'completed',
      decision: (result.recommendation || result.decision || 'UNKNOWN').toUpperCase(),
      scoreBefore,
      scoreAfter,
      delta,
      changedFiles: result.changedFiles || result.changed_files || [],
      notes: result.reason || result.rationale || result.notes || ''
    });
    
    if (result.recommendation === 'KEEP' || result.decision === 'keep') {
      currentScore = scoreAfter;
    }
  }
  
  const accepted = jobSummaries.filter(j => j.decision === 'KEEP');
  const rejected = jobSummaries.filter(j => j.decision === 'REJECT');
  const pending = jobSummaries.filter(j => j.status !== 'completed');
  
  const report = generateMarkdown({
    runId: dispatchRequest.runId,
    baselineScore,
    finalScore: currentScore,
    totalImprovement: currentScore - baselineScore,
    jobSummaries,
    accepted,
    rejected,
    pending
  });
  
  writeFile(`${runDir}/CYCLE_REPORT.md`, report);
}
```

### 3.4 Integration in Dispatch-Processor

**Modifikation des bestehenden Dispatch-Processors:**

```javascript
// Am Ende der Dispatch-Schleife
async function finalizeCycle(runDir) {
  const aggregator = require('./scripts/aggregate_cycle_results');
  await aggregator.aggregate(runDir);
  console.log(`✅ CYCLE_REPORT.md aktualisiert: ${runDir}/CYCLE_REPORT.md`);
}
```

### 3.5 JSON Schema Normalisierung

Da verschiedene Schemas gefunden wurden, sollte der Aggregator flexibel sein:

```javascript
function normalizeResult(raw) {
  return {
    methodId: raw.methodId || raw.method_name?.toLowerCase().replace(/\s+/g, '_'),
    jobIndex: raw.jobIndex,
    status: raw.status || 'unknown',
    decision: (raw.recommendation || raw.decision || 'UNKNOWN').toUpperCase(),
    scoreBefore: raw.objectiveScoreBefore || raw.scoreBefore || raw.objectiveScore?.before,
    scoreAfter: raw.objectiveScoreAfter || raw.scoreAfter || raw.objectiveScore?.after,
    changedFiles: raw.changedFiles || raw.changed_files || [],
    metricsBefore: raw.metricsBefore || {
      recall: {
        speech: parsePercentage(raw.metrics?.speech_recall),
        review: parsePercentage(raw.metrics?.review_recall),
        ignore: parsePercentage(raw.metrics?.ignore_recall)
      }
    },
    reason: raw.reason || raw.rationale || raw.notes || ''
  };
}
```

### 3.6 Zeitplan

| Phase | Aufwand | Beschreibung |
|-------|---------|--------------|
| 1. Aggregator-Skript | 2h | `scripts/aggregate_cycle_results.js` erstellen |
| 2. Schema-Normalisierung | 1h | Unterstützung für alle gefundenen JSON-Schemas |
| 3. Integration | 1h | Dispatch-Processor um Finalisierung erweitern |
| 4. Testing | 2h | Mit historischen Runs testen |
| 5. Dokumentation | 1h | README aktualisieren |

**Gesamtaufwand:** ~7 Stunden

---

## 4. Zusammenfassung

### Aktuelles Problem
- CYCLE_REPORT.md wird erstellt, aber nie aktualisiert
- Job-Ergebnisse liegen in `method_results/` verstreut
- Keine zentrale Übersicht über KEEP/REJECT Entscheidungen
- Keine Score-Verlaufs-Dokumentation

### Lösung
- **Aggregator als Teil des Dispatch-Processors** (Post-Process)
- **Flexible JSON-Schema-Unterstützung** für historische Daten
- **Erweiterte CYCLE_REPORT.md Struktur** mit:
  - Score-Verlauf
  - Job-Übersicht mit Decisions
  - Akzeptierte vs. Abgelehnte Änderungen
  - Metrik-Entwicklung
  - Learnings & Patterns

### Nächste Schritte
1. `scripts/aggregate_cycle_results.js` implementieren
2. Dispatch-Processor um Finalisierung erweitern
3. Mit bestehenden Runs testen
4. Optional: Alte Reports nachträglich aggregieren
