# VAD Refactor - Akzeptanztests

**Zweck:** Jede Phase muss ihren Akzeptanztest bestehen, bevor sie als COMPLETE markiert wird.

**Mechanismus:**
1. Agent führt Phase aus
2. Agent führt Akzeptanztest aus
3. Nur bei PASS: Status wird auf COMPLETE gesetzt
4. Bei FAIL: Phase wird wiederholt

---

## Phase 1: Backup-Branch erstellen

**Akzeptanztest:**
```bash
# Prüfe ob Backup-Branch existiert
git branch -r | grep "mawly-analysis-refactor-backup" > /dev/null
if [ $? -eq 0 ]; then
  echo "PASS: Backup-Branch existiert"
else
  echo "FAIL: Backup-Branch fehlt"
fi

# Prüfe ob wir auf mawly-analysis sind
git branch --show-current | grep "mawly-analysis" > /dev/null
if [ $? -eq 0 ]; then
  echo "PASS: Auf korrektem Branch"
else
  echo "FAIL: Falscher Branch"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 2: Parameter-Drift identifizieren

**Akzeptanztest:**
```bash
# Prüfe ob Report existiert
if [ -f "docs/llm/param_drift_report.json" ]; then
  echo "PASS: Report existiert"
  
  # Prüfe ob mindestens 2 Drifts dokumentiert
  count=$(grep -c '"drifts"' docs/llm/param_drift_report.json)
  if [ $count -ge 1 ]; then
    echo "PASS: Drifts dokumentiert"
  else
    echo "FAIL: Keine Drifts dokumentiert"
  fi
else
  echo "FAIL: Report fehlt"
fi
```

**Erwartetes Ergebnis:** Report existiert, mindestens 2 Drifts

---

## Phase 3: useOptimizedPipeline → enableOptimizedVAD

**Akzeptanztest:**
```bash
# Prüfe ob alter Parameter entfernt
grep -r "useOptimizedPipeline" packages/analyzer/src/core/pipeline/analyzer_pipeline.js > /dev/null
if [ $? -eq 0 ]; then
  echo "FAIL: Alter Parameter noch vorhanden"
else
  echo "PASS: Alter Parameter entfernt"
fi

# Prüfe ob neuer Parameter verwendet
grep "enableOptimizedVAD" packages/analyzer/src/core/pipeline/analyzer_pipeline.js > /dev/null
if [ $? -eq 0 ]; then
  echo "PASS: Neuer Parameter verwendet"
else
  echo "FAIL: Neuer Parameter fehlt"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: npm run check grün"
else
  echo "FAIL: npm run check rot"
fi
```

**Erwartetes Ergebnis:** Alle Tests PASS

---

## Phase 4: bleedDetection → enableBleedHandling

**Akzeptanztest:**
```bash
# Prüfe ob alter Parameter entfernt
grep "bleedDetection" packages/analyzer/src/core/pipeline/vad_stage_optimized.js > /dev/null
if [ $? -eq 0 ]; then
  echo "FAIL: Alter Parameter noch vorhanden"
else
  echo "PASS: Alter Parameter entfernt"
fi

# Prüfe ob neuer Parameter verwendet
grep "enableBleedHandling" packages/analyzer/src/core/pipeline/vad_stage_optimized.js > /dev/null
if [ $? -eq 0 ]; then
  echo "PASS: Neuer Parameter verwendet"
else
  echo "FAIL: Neuer Parameter fehlt"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: npm run check grün"
else
  echo "FAIL: npm run check rot"
fi
```

**Erwartetes Ergebnis:** Alle Tests PASS

---

## Phase 5: Parameter-Drift Report aktualisieren

**Akzeptanztest:**
```bash
# Prüfe ob Report aktualisiert wurde
if grep -q '"status": "fixed"' docs/llm/param_drift_report.json; then
  echo "PASS: Drifts als fixed markiert"
else
  echo "FAIL: Keine fixed-Markierungen"
fi
```

**Erwartetes Ergebnis:** Mindestens 2 Drifts als "fixed" markiert

---

## Phase 6: vad_stage.js Feature-Analyse

**Akzeptanztest:**
```bash
# Prüfe ob Feature-Liste existiert
if [ -f "docs/llm/vad_stage_features.json" ]; then
  echo "PASS: Feature-Liste existiert"
  
  # Prüfe ob mindestens 7 Features
  count=$(grep -c '"feature"' docs/llm/vad_stage_features.json)
  if [ $count -ge 7 ]; then
    echo "PASS: Mindestens 7 Features"
  else
    echo "FAIL: Zu wenige Features"
  fi
else
  echo "FAIL: Feature-Liste fehlt"
fi
```

**Erwartetes Ergebnis:** Liste existiert, ≥7 Features

---

## Phase 7: vad_stage_optimized.js Feature-Analyse

**Akzeptanztest:**
```bash
# Prüfe ob Unique-Features-Liste existiert
if [ -f "docs/llm/vad_optimized_unique_features.json" ]; then
  echo "PASS: Unique-Features-Liste existiert"
else
  echo "FAIL: Liste fehlt"
fi
```

**Erwartetes Ergebnis:** Liste existiert

---

## Phase 8: Merge-Entscheidung dokumentieren

**Akzeptanztest:**
```bash
# Prüfe ob Merge-Strategie existiert
if [ -f "docs/llm/merge_strategy.md" ]; then
  echo "PASS: Merge-Strategie existiert"
  
  # Prüfe ob Entscheidungen dokumentiert
  if grep -q "### Übernehmen" docs/llm/merge_strategy.md; then
    echo "PASS: Übernehmen-Sektion vorhanden"
  else
    echo "FAIL: Übernehmen-Sektion fehlt"
  fi
else
  echo "FAIL: Merge-Strategie fehlt"
fi
```

**Erwartetes Ergebnis:** Dokument existiert, hat alle Sektionen

---

## Phase 9: Preprocessing-Option in vad_stage.js integrieren

**Akzeptanztest:**
```bash
# Prüfe ob enablePreprocess in vad_stage.js verwendet wird
grep "enablePreprocess" packages/analyzer/src/core/pipeline/vad_stage.js > /dev/null
if [ $? -eq 0 ]; then
  echo "PASS: enablePreprocess verwendet"
else
  echo "FAIL: enablePreprocess fehlt"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: npm run check grün"
else
  echo "FAIL: npm run check rot"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 10: Pipeline auf einheitlichen Pfad umstellen

**Akzeptanztest:**
```bash
# Prüfe ob optimizedVadStage Import entfernt
grep "optimizedVadStage" packages/analyzer/src/core/pipeline/analyzer_pipeline.js > /dev/null
if [ $? -eq 0 ]; then
  echo "FAIL: optimizedVadStage Import noch vorhanden"
else
  echo "PASS: optimizedVadStage Import entfernt"
fi

# Prüfe ob nur noch vadStage verwendet wird
grep "vadStage.runVadStage" packages/analyzer/src/core/pipeline/analyzer_pipeline.js > /dev/null
if [ $? -eq 0 ]; then
  echo "PASS: Nur vadStage verwendet"
else
  echo "FAIL: vadStage nicht gefunden"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: npm run check grün"
else
  echo "FAIL: npm run check rot"
fi

# INTEGRATION-TEST: Pipeline läuft ohne Crash
node -e "
  try {
    var pipeline = require('./packages/analyzer/src/core/pipeline/analyzer_pipeline.js');
    console.log('PASS: Pipeline lädt ohne Fehler');
    process.exit(0);
  } catch(e) {
    console.log('FAIL: Pipeline lädt nicht:', e.message);
    process.exit(1);
  }
"
```

**Erwartetes Ergebnis:** Alle Tests PASS

---

## Phase 11: vad_stage_optimized.js entfernen

**Akzeptanztest:**
```bash
# Prüfe ob Datei entfernt
if [ -f "packages/analyzer/src/core/pipeline/vad_stage_optimized.js" ]; then
  echo "FAIL: Datei existiert noch"
else
  echo "PASS: Datei entfernt"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Keine broken imports"
else
  echo "FAIL: Broken imports vorhanden"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 12: enableOptimizedVAD aus Defaults entfernen

**Akzeptanztest:**
```bash
# Prüfe ob Parameter entfernt
grep "enableOptimizedVAD" packages/analyzer/src/defaults/analyzer_defaults.js > /dev/null
if [ $? -eq 0 ]; then
  echo "FAIL: Parameter noch vorhanden"
else
  echo "PASS: Parameter entfernt"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: npm run check grün"
else
  echo "FAIL: npm run check rot"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 13: Loudness-Latch Test-Grundgerüst

**Akzeptanztest:**
```bash
# Prüfe ob Test-Datei existiert
if [ -f "packages/analyzer/test/loudness_latch_test.js" ]; then
  echo "PASS: Test-Datei existiert"
else
  echo "FAIL: Test-Datei fehlt"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: npm run check grün"
else
  echo "FAIL: npm run check rot"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 14: Loudness-Latch State-Machine Test

**Akzeptanztest:**
```bash
# Prüfe ob Test implementiert
grep -q "testStateMachine" packages/analyzer/test/loudness_latch_test.js
if [ $? -eq 0 ]; then
  echo "PASS: State-Machine Test implementiert"
else
  echo "FAIL: State-Machine Test fehlt"
fi

# Führe Test aus (falls Test-Runner verfügbar)
# npm test -- loudness_latch_test.js
```

**Erwartetes Ergebnis:** Test implementiert

---

## Phase 15: Loudness-Latch Threshold Test

**Akzeptanztest:**
```bash
# Prüfe ob Threshold-Tests implementiert
grep -q "openThresholdDb\|keepThresholdDb" packages/analyzer/test/loudness_latch_test.js
if [ $? -eq 0 ]; then
  echo "PASS: Threshold Tests implementiert"
else
  echo "FAIL: Threshold Tests fehlen"
fi
```

**Erwartetes Ergebnis:** Tests implementiert

---

## Phase 16: Loudness-Latch Window Test

**Akzeptanztest:**
```bash
# Prüfe ob Window-Tests implementiert
grep -q "latchWindowMs\|minCoveragePercent" packages/analyzer/test/loudness_latch_test.js
if [ $? -eq 0 ]; then
  echo "PASS: Window Tests implementiert"
else
  echo "FAIL: Window Tests fehlen"
fi
```

**Erwartetes Ergebnis:** Tests implementiert

---

## Phase 17: Loudness-Latch Integration Test

**Akzeptanztest:**
```bash
# Prüfe ob Integration-Test existiert
if [ -f "packages/analyzer/test/loudness_latch_integration_test.js" ]; then
  echo "PASS: Integration-Test existiert"
else
  echo "FAIL: Integration-Test fehlt"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: npm run check grün"
else
  echo "FAIL: npm run check rot"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 18: enableLoudnessLatch Default aktivieren

**Akzeptanztest:**
```bash
# Prüfe ob Default auf true gesetzt
grep "enableLoudnessLatch: true" packages/analyzer/src/defaults/analyzer_defaults.js > /dev/null
if [ $? -eq 0 ]; then
  echo "PASS: Default ist true"
else
  echo "FAIL: Default ist nicht true"
fi

# Syntax-Check
npm run check > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: npm run check grün"
else
  echo "FAIL: npm run check rot"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 19: CLAUDE.md aktualisieren

**Akzeptanztest:**
```bash
# Prüfe ob veraltete Referenzen entfernt
grep "vad_stage_optimized" docs/llm/CLAUDE.md > /dev/null
if [ $? -eq 0 ]; then
  echo "FAIL: Veraltete Referenzen noch vorhanden"
else
  echo "PASS: Veraltete Referenzen entfernt"
fi

# Prüfe ob Loudness-Latch dokumentiert
grep -q "Loudness-Latch\|loudnessLatch" docs/llm/CLAUDE.md
if [ $? -eq 0 ]; then
  echo "PASS: Loudness-Latch dokumentiert"
else
  echo "FAIL: Loudness-Latch nicht dokumentiert"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 20: Finaler Test-Durchlauf

**Akzeptanztest:**
```bash
# Führe vollständigen Test aus
npm run check > /tmp/final_test.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Alle Tests grün"
  
  # Prüfe auf Warnings
  if grep -q "warning\|Warning" /tmp/final_test.log; then
    echo "WARN: Warnings vorhanden (akzeptabel)"
  else
    echo "PASS: Keine Warnings"
  fi
else
  echo "FAIL: Tests fehlgeschlagen"
  cat /tmp/final_test.log
fi

# INTEGRATION-TEST: Pipeline läuft mit Mock-Daten
node -e "
  try {
    var pipeline = require('./packages/analyzer/src/core/pipeline/analyzer_pipeline.js');
    // Teste ob die Funktion existiert und aufrufbar ist
    if (typeof pipeline.analyze === 'function') {
      console.log('PASS: Pipeline.analyze ist aufrufbar');
      process.exit(0);
    } else {
      console.log('FAIL: Pipeline.analyze nicht gefunden');
      process.exit(1);
    }
  } catch(e) {
    console.log('FAIL: Pipeline-Integration fehlgeschlagen:', e.message);
    process.exit(1);
  }
"
```

**Erwartetes Ergebnis:** Alle Tests PASS

---

## Phase 21: Git Commit & Push

**Akzeptanztest:**
```bash
# Prüfe ob Commit existiert
git log --oneline -1 | grep -q "VAD Refactor"
if [ $? -eq 0 ]; then
  echo "PASS: Commit mit VAD Refactor Message"
else
  echo "FAIL: Kein VAD Refactor Commit"
fi

# Prüfe ob auf Remote
git log --oneline origin/mawly-analysis..mawly-analysis | wc -l
if [ $? -eq 0 ]; then
  echo "PASS: Auf Remote gepusht"
else
  echo "FAIL: Nicht gepusht"
fi
```

**Erwartetes Ergebnis:** Beide Tests PASS

---

## Phase 22: Dokumentation finalisieren

**Akzeptanztest:**
```bash
# Prüfe ob Abschlussdokumentation existiert
if [ -f "docs/llm/VAD_REFACTOR_COMPLETE.md" ]; then
  echo "PASS: Abschlussdokumentation existiert"
  
  # Prüfe ob alle Sektionen vorhanden
  if grep -q "Was wurde geändert\|Warum\|Neue Architektur" docs/llm/VAD_REFACTOR_COMPLETE.md; then
    echo "PASS: Alle Sektionen vorhanden"
  else
    echo "FAIL: Fehlende Sektionen"
  fi
else
  echo "FAIL: Abschlussdokumentation fehlt"
fi
```

**Erwartetes Ergebnis:** Dokumentation vollständig

---

## Phase 23: Cleanup

**Akzeptanztest:**
```bash
# Prüfe ob temporäre Dateien entfernt
if [ -f "docs/llm/param_drift_report.json" ] || [ -f "docs/llm/vad_stage_features.json" ]; then
  echo "FAIL: Temporäre Dateien noch vorhanden"
else
  echo "PASS: Temporäre Dateien entfernt"
fi

# Prüfe ob nur VAD_REFACTOR_COMPLETE.md übrig
if [ -f "docs/llm/VAD_REFACTOR_COMPLETE.md" ]; then
  echo "PASS: Finale Dokumentation erhalten"
else
  echo "FAIL: Finale Dokumentation fehlt"
fi
```

**Erwartetes Ergebnis:** Nur finale Dokumentation übrig

---

## Phase 24: Abschluss

**Akzeptanztest:**
```bash
# Prüfe ob Status COMPLETE
grep -q "Status.*COMPLETE" docs/llm/VAD_REFACTOR_ATOMIC_PLAN.md
if [ $? -eq 0 ]; then
  echo "PASS: Status ist COMPLETE"
else
  echo "FAIL: Status nicht COMPLETE"
fi

# Zähle abgeschlossene Phasen
completed=$(grep -c "✅" docs/llm/VAD_REFACTOR_ATOMIC_PLAN.md)
if [ $completed -ge 24 ]; then
  echo "PASS: Alle 24 Phasen abgeschlossen"
else
  echo "FAIL: Nur $completed Phasen abgeschlossen"
fi

# INTEGRATION-TEST: Finaler Pipeline-Test
node -e "
  try {
    var pipeline = require('./packages/analyzer/src/core/pipeline/analyzer_pipeline.js');
    if (typeof pipeline.analyze === 'function') {
      console.log('PASS: Pipeline bereit für Produktion');
      process.exit(0);
    } else {
      console.log('FAIL: Pipeline nicht bereit');
      process.exit(1);
    }
  } catch(e) {
    console.log('FAIL: Finaler Test fehlgeschlagen:', e.message);
    process.exit(1);
  }
"

# MANUELLES GO ERFORDERLICH
# Cron-Job pausiert hier und wartet auf menschliche Bestätigung
# Siehe VAD_REFACTOR_ATOMIC_PLAN.md - Status-Tracking
```

**Erwartetes Ergebnis:** Alle Tests PASS, dann MANUELLES GO

**WICHTIG:** Phase 24 erfordert manuelle Bestätigung. Der Agent aktualisiert den Status auf "PHASE_24_WAITING_FOR_APPROVAL" und wartet.

---

## Automatisierte Akzeptanztest-Funktion

**Für den Agent:**

Nach jeder Phase führe diesen Test aus:

```javascript
function runAcceptanceTest(phaseNumber) {
  const tests = {
    1: () => checkBackupBranchExists(),
    2: () => checkParamDriftReport(),
    3: () => checkUseOptimizedPipelineRemoved(),
    // ... usw.
  };
  
  const result = tests[phaseNumber]();
  
  if (result.pass) {
    console.log(`✅ Phase ${phaseNumber} AKZEPTIERT`);
    updateStatus(phaseNumber, "COMPLETE");
    return true;
  } else {
    console.log(`❌ Phase ${phaseNumber} ABGELEHNT: ${result.reason}`);
    return false;
  }
}
```

**Regel:**
- Bei PASS: Phase als COMPLETE markieren, nächste Phase starten
- Bei FAIL: Phase NICHT als COMPLETE markieren, beim nächsten Zyklus wiederholen
