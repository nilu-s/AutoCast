# VAD Refactor - Atomarer Phasenplan (Neustart)

**Ziel:** Jeder Zyklus erzeugt einen commitbaren, testbaren Fortschritt
**Zykluszeit:** 15 Minuten (900 Sekunden Timeout)
**Erfolgskriterium:** Nach jedem Zyklus ist `npm run check` grün

---

## Prinzipien

1. **Atomare Phasen:** Jede Phase ändert genau eine Sache
2. **Testbar:** Nach jeder Phase muss `npm run check` grün sein
3. **Dokumentiert:** Jede Phase schreibt ihren Status in diese Datei
4. **Rollback-fähig:** Bei Fehler wird Phase wiederholt, nicht fortgesetzt

---

## Phase 1: Backup-Branch erstellen (Zyklus 1)

**Ziel:** Sicherer Ausgangspunkt für alle weiteren Änderungen

**Aufgaben:**
1. `git checkout mawly-analysis`
2. `git checkout -b mawly-analysis-refactor-backup`
3. `git push origin mawly-analysis-refactor-backup`
4. `git checkout mawly-analysis`

**Erfolgskriterium:**
- Branch `mawly-analysis-refactor-backup` existiert auf Remote
- Wir sind auf `mawly-analysis`

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 1
**Aktuelle Phase:** 2
**Letzte Aktion:** Backup-Branch erstellt
**Status:** ✅ FORTSCHRITT
```

---

## Phase 2: Parameter-Drift identifizieren (Zyklus 2)

**Ziel:** Vollständige Liste aller Parameter-Inkonsistenzen

**Aufgaben:**
1. Öffne `analyzer_defaults.js`, notiere alle Parameter
2. Öffne `analyzer_pipeline.js`, notiere verwendete Parameter
3. Öffne `vad_stage_optimized.js`, notiere verwendete Parameter
4. Erstelle `docs/llm/param_drift_report.json`:
   ```json
   {
     "drifts": [
       {"file": "analyzer_pipeline.js", "param": "useOptimizedPipeline", "should_be": "enableOptimizedVAD"},
       {"file": "vad_stage_optimized.js", "param": "bleedDetection", "should_be": "enableBleedHandling"}
     ],
     "missing_in_defaults": [],
     "unused_in_defaults": []
   }
   ```

**Erfolgskriterium:**
- `param_drift_report.json` existiert
- Mindestens 2 Drifts dokumentiert

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 2
**Aktuelle Phase:** 3
**Letzte Aktion:** Parameter-Drift dokumentiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 3: useOptimizedPipeline → enableOptimizedVAD (Zyklus 3)

**Ziel:** Erster Parameter-Drift behoben

**Aufgaben:**
1. Öffne `analyzer_pipeline.js`
2. Suche `params.useOptimizedPipeline`
3. Ersetze durch `params.enableOptimizedVAD !== false`
4. Speichere
5. `npm run check`

**Erfolgskriterium:**
- `npm run check` ist grün
- Keine `useOptimizedPipeline` Referenzen mehr

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 3
**Aktuelle Phase:** 4
**Letzte Aktion:** useOptimizedPipeline → enableOptimizedVAD
**Status:** ✅ FORTSCHRITT
```

---

## Phase 4: bleedDetection → enableBleedHandling (Zyklus 4)

**Ziel:** Zweiter Parameter-Drift behoben

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Suche `params.bleedDetection`
3. Ersetze durch `params.enableBleedHandling`
4. Speichere
5. `npm run check`

**Erfolgskriterium:**
- `npm run check` ist grün
- Keine `bleedDetection` Referenzen mehr

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 4
**Aktuelle Phase:** 5
**Letzte Aktion:** bleedDetection → enableBleedHandling
**Status:** ✅ FORTSCHRITT
```

---

## Phase 5: Parameter-Drift Report aktualisieren & Push (Zyklus 5)

**Ziel:** Dokumentation ist aktuell und Zwischenstand gepusht

**Aufgaben:**
1. Öffne `param_drift_report.json`
2. Markiere behobene Drifts als `"status": "fixed"`
3. Prüfe auf weitere Drifts
4. Speichere
5. **Git Commit & Push:**
   ```bash
   git add -A
   git commit -m "VAD Refactor Phasen 1-5: Parameter-Drift behoben"
   git push origin mawly-analysis
   ```

**Erfolgskriterium:**
- Report zeigt Fortschritt
- Keine unbekannten Drifts mehr
- Push erfolgreich

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 5
**Aktuelle Phase:** 6
**Letzte Aktion:** Parameter-Drift behoben & gepusht
**Status:** ✅ FORTSCHRITT
```

---

## Phase 6: vad_stage.js Feature-Analyse (Zyklus 6)

**Ziel:** Verstehen was `vad_stage.js` alles kann

**Aufgaben:**
1. Öffne `vad_stage.js`
2. Liste alle Features auf:
   - Bleed Handling
   - In-Speech Dropout Heal
   - Laughter Continuity Recovery
   - Laughter Burst Reinforce
   - enforceAlwaysOneTrackOpen
   - Speaker Lock
   - Spectral VAD
3. Speichere in `docs/llm/vad_stage_features.json`

**Erfolgskriterium:**
- `vad_stage_features.json` existiert
- Mindestens 7 Features dokumentiert

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 6
**Aktuelle Phase:** 7
**Letzte Aktion:** vad_stage.js Features analysiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 7: vad_stage_optimized.js Feature-Analyse (Zyklus 7)

**Ziel:** Verstehen was `vad_stage_optimized.js` wirklich anders macht

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Liste alle Features auf
3. Vergleiche mit `vad_stage_features.json`
4. Identifiziere echte Unterschiede (nicht nur Duplikate)
5. Speichere in `docs/llm/vad_optimized_unique_features.json`

**Erfolgskriterium:**
- `vad_optimized_unique_features.json` existiert
- Echte Unterschiede identifiziert

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 7
**Aktuelle Phase:** 8
**Letzte Aktion:** vad_stage_optimized.js analysiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 8: Merge-Entscheidung dokumentieren (Zyklus 8)

**Ziel:** Klare Strategie für den Merge

**Aufgaben:**
1. Lese beide Feature-Listen
2. Entscheide: Was überlebt? Was wird entfernt?
3. Schreibe `docs/llm/merge_strategy.md`:
   ```markdown
   ## Merge-Strategie
   
   ### Übernehmen aus vad_stage_optimized.js:
   - [ ] Feature X
   
   ### Behalten aus vad_stage.js:
   - [x] Bleed Handling
   - [x] Speaker Lock
   
   ### Entfernen:
   - [ ] Duplizierte Logik
   ```

**Erfolgskriterium:**
- `merge_strategy.md` existiert
- Entscheidungen sind dokumentiert

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 8
**Aktuelle Phase:** 9
**Letzte Aktion:** Merge-Strategie definiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 9: Preprocessing-Option in vad_stage.js integrieren (Zyklus 9)

**Ziel:** `vad_stage.js` kann optional preprocessed RMS nutzen

**Aufgaben:**
1. Öffne `vad_stage.js`
2. Prüfe ob es `params.enablePreprocess` beachtet
3. Falls nein: Füge Logik hinzu um `rmsProfiles` vs `rawRmsProfiles` zu wählen
4. Speichere
5. `npm run check`

**Erfolgskriterium:**
- `npm run check` ist grün
- `enablePreprocess` wird berücksichtigt

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 9
**Aktuelle Phase:** 10
**Letzte Aktion:** Preprocessing-Option in vad_stage.js
**Status:** ✅ FORTSCHRITT
```

---

## Phase 10: Pipeline auf einheitlichen Pfad umstellen & Push (Zyklus 10)

**Ziel:** Kein Dual-Path mehr und Zwischenstand gepusht

**Aufgaben:**
1. Öffne `analyzer_pipeline.js`
2. Entferne `if (params.enableOptimizedVAD !== false)` Switch
3. Behalte nur `vadStage.runVadStage()` Aufruf
4. Entferne `optimizedVadStage` Import
5. Speichere
6. `npm run check`
7. **Git Commit & Push:**
   ```bash
   git add -A
   git commit -m "VAD Refactor Phasen 6-10: Pipeline auf einheitlichen Pfad umgestellt"
   git push origin mawly-analysis
   ```

**Erfolgskriterium:**
- `npm run check` ist grün
- Kein `optimizedVadStage` Import mehr
- Einheitlicher Aufruf
- Push erfolgreich

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 10
**Aktuelle Phase:** 11
**Letzte Aktion:** Pipeline auf einheitlichen Pfad & gepusht
**Status:** ✅ FORTSCHRITT
```

---

## Phase 11: vad_stage_optimized.js entfernen (Zyklus 11)

**Ziel:** Alte Datei löschen

**Aufgaben:**
1. `rm packages/analyzer/src/core/pipeline/vad_stage_optimized.js`
2. Prüfe ob es Referenzen gibt
3. Falls ja: Entferne Referenzen
4. `npm run check`

**Erfolgskriterium:**
- Datei existiert nicht mehr
- `npm run check` ist grün
- Keine broken Imports

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 11
**Aktuelle Phase:** 12
**Letzte Aktion:** vad_stage_optimized.js entfernt
**Status:** ✅ FORTSCHRITT
```

---

## Phase 12: enableOptimizedVAD aus Defaults entfernen (Zyklus 12)

**Ziel:** Keine toten Parameter

**Aufgaben:**
1. Öffne `analyzer_defaults.js`
2. Entferne `enableOptimizedVAD` (wird nicht mehr gebraucht)
3. Speichere
4. `npm run check`

**Erfolgskriterium:**
- `npm run check` ist grün
- Kein `enableOptimizedVAD` mehr in Defaults

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 12
**Aktuelle Phase:** 13
**Letzte Aktion:** Tote Parameter entfernt
**Status:** ✅ FORTSCHRITT
```

---

## Phase 13: Loudness-Latch Test-Grundgerüst (Zyklus 13)

**Ziel:** Tests für Loudness-Latch vorbereiten

**Aufgaben:**
1. Erstelle `packages/analyzer/test/loudness_latch_test.js`
2. Grundgerüst:
   ```javascript
   'use strict';
   var loudnessLatch = require('../src/modules/vad/loudness_latch');
   
   function testStateMachine() {
     // TODO: Implement
     return true;
   }
   
   module.exports = {
     testStateMachine: testStateMachine
   };
   ```
3. Füge zu Test-Suite hinzu (falls nötig)
4. `npm run check`

**Erfolgskriterium:**
- Test-Datei existiert
- `npm run check` ist grün

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 13
**Aktuelle Phase:** 14
**Letzte Aktion:** Loudness-Latch Test-Grundgerüst
**Status:** ✅ FORTSCHRITT
```

---

## Phase 14: Loudness-Latch State-Machine Test (Zyklus 14)

**Ziel:** State-Machine-Logik testen

**Aufgaben:**
1. Öffne `loudness_latch_test.js`
2. Implementiere Test für Zustandsübergänge:
   - CLOSED → OPEN_CANDIDATE
   - OPEN_CANDIDATE → LATCHED_OPEN
   - LATCHED_OPEN → CLOSED
3. Speichere
4. `npm run check`

**Erfolgskriterium:**
- Test läuft durch
- `npm run check` ist grün

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 14
**Aktuelle Phase:** 15
**Letzte Aktion:** State-Machine Test implementiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 15: Loudness-Latch Threshold Test (Zyklus 15)

**Ziel:** Threshold-Logik testen

**Aufgaben:**
1. Öffne `loudness_latch_test.js`
2. Implementiere Test für:
   - openThresholdDb
   - keepThresholdDb
   - closeConfirmMs
3. Speichere
4. `npm run check`

**Erfolgskriterium:**
- Test läuft durch
- `npm run check` ist grün

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 15
**Aktuelle Phase:** 16
**Letzte Aktion:** Threshold Test implementiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 16: Loudness-Latch Window Test (Zyklus 16)

**Ziel:** Window-Coverage-Logik testen

**Aufgaben:**
1. Öffne `loudness_latch_test.js`
2. Implementiere Test für:
   - latchWindowMs
   - minCumulativeActiveMs
   - minCoveragePercent
3. Speichere
4. `npm run check`

**Erfolgskriterium:**
- Test läuft durch
- `npm run check` ist grün

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 16
**Aktuelle Phase:** 17
**Letzte Aktion:** Window Test implementiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 16: Loudness-Latch Window Test (Zyklus 16)

**Ziel:** Window-Coverage-Logik testen

**Aufgaben:**
1. Öffne `loudness_latch_test.js`
2. Implementiere Test für:
   - latchWindowMs
   - minCumulativeActiveMs
   - minCoveragePercent
3. Speichere
4. `npm run check`

**Erfolgskriterium:**
- Test läuft durch
- `npm run check` ist grün

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 16
**Aktuelle Phase:** 17
**Letzte Aktion:** Window Test implementiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 17: Loudness-Latch Integration Test (Zyklus 17)

**Ziel:** Integration in Pipeline testen

**Aufgaben:**
1. Erstelle `packages/analyzer/test/loudness_latch_integration_test.js`
2. Teste mit echten (oder mock) RMS-Daten
3. Verifiziere dass Latch korrekt öffnet/schließt
4. Speichere
5. `npm run check`

**Erfolgskriterium:**
- Integration-Test läuft durch
- `npm run check` ist grün

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 17
**Aktuelle Phase:** 18
**Letzte Aktion:** Integration Test implementiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 18: enableLoudnessLatch Default aktivieren (Zyklus 18)

**Ziel:** Loudness-Latch ist standardmäßig aktiv

**Aufgaben:**
1. Öffne `analyzer_defaults.js`
2. Ändere `enableLoudnessLatch: false` zu `enableLoudnessLatch: true`
3. Speichere
4. `npm run check`

**Erfolgskriterium:**
- `npm run check` ist grün
- Default ist `true`

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 18
**Aktuelle Phase:** 19
**Letzte Aktion:** Loudness-Latch default aktiv
**Status:** ✅ FORTSCHRITT
```

---

## Phase 19: CLAUDE.md aktualisieren (Zyklus 19)

**Ziel:** Dokumentation ist aktuell

**Aufgaben:**
1. Öffne `CLAUDE.md`
2. Entferne Hinweise auf `vad_stage_optimized.js`
3. Füge Hinweis auf Loudness-Latch hinzu
4. Aktualisiere Legacy-Strategie-Abschnitt
5. Speichere

**Erfolgskriterium:**
- `CLAUDE.md` ist aktuell
- Keine veralteten Referenzen

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 19
**Aktuelle Phase:** 20
**Letzte Aktion:** CLAUDE.md aktualisiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 20: Finaler Test-Durchlauf & Push (Zyklus 20)

**Ziel:** Alles funktioniert zusammen und Zwischenstand gepusht

**Aufgaben:**
1. `npm run check`
2. Speichere Output
3. Prüfe auf Errors/Warnings
4. Falls grün:
5. **Git Commit & Push:**
   ```bash
   git add -A
   git commit -m "VAD Refactor Phasen 17-20: Tests implementiert, Loudness-Latch integriert"
   git push origin mawly-analysis
   ```

**Erfolgskriterium:**
- `npm run check` ist grün
- Keine Warnings
- Commit erstellt
- Push erfolgreich

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 20
**Aktuelle Phase:** 21
**Letzte Aktion:** Finaler Test grün & gepusht
**Status:** ✅ FORTSCHRITT
```

---

## Phase 21: Git Commit & Push (Zyklus 21)

**Ziel:** Änderungen sichern

**Aufgaben:**
1. `git add -A`
2. `git commit -m "VAD Refactor: Remove optimized stage, add Loudness-Latch, fix parameter drift"`
3. `git push origin mawly-analysis`

**Erfolgskriterium:**
- Push erfolgreich
- Commit auf Remote

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 21
**Aktuelle Phase:** 22
**Letzte Aktion:** Code gepusht
**Status:** ✅ FORTSCHRITT
```

---

## Phase 22: Dokumentation finalisieren (Zyklus 22)

**Ziel:** Abschlussdokumentation

**Aufgaben:**
1. Erstelle `docs/llm/VAD_REFACTOR_COMPLETE.md`
2. Dokumentiere:
   - Was wurde geändert
   - Warum
   - Neue Architektur
   - Migration-Guide
3. Speichere

**Erfolgskriterium:**
- Dokumentation existiert
- Vollständig und verständlich

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 22
**Aktuelle Phase:** 23
**Letzte Aktion:** Dokumentation finalisiert
**Status:** ✅ FORTSCHRITT
```

---

## Phase 23: Cleanup (Zyklus 23)

**Ziel:** Aufräumen

**Aufgaben:**
1. Entferne temporäre Dateien (falls nicht mehr nötig):
   - `param_drift_report.json`
   - `vad_stage_features.json`
   - `vad_optimized_unique_features.json`
   - `merge_strategy.md`
2. Behalte nur `VAD_REFACTOR_COMPLETE.md`
3. `git add -A`
4. `git commit -m "VAD Refactor: Cleanup documentation"`
5. `git push`

**Erfolgskriterium:**
- Nur noch relevante Dokumentation
- Push erfolgreich

**Status-Update:**
```markdown
**Abgeschlossene Phasen:** 23
**Aktuelle Phase:** 24
**Letzte Aktion:** Cleanup abgeschlossen
**Status:** ✅ FORTSCHRITT
```

---

## Phase 24: Abschluss & Manuelles GO (Zyklus 24)

**Ziel:** Projekt abschließen mit menschlicher Bestätigung

**Aufgaben:**
1. Aktualisiere diese Datei:
   ```markdown
   ## Status-Tracking
   
   **Abgeschlossene Phasen:** 23/24
   **Aktuelle Phase:** 24
   **Letzte Aktion:** Warte auf manuelles GO
   **Status:** ⏸️ WARTET_AUF_BESTÄTIGUNG
   ```
2. Führe finalen Integration-Test aus
3. **PAUSIERE** - Warte auf menschliches GO

**Manuelles GO:**
- Du prüfst den finalen Commit
- Wenn alles OK: Ändere Status auf "PHASE_24_APPROVED"
- Agent fährt dann fort mit Deaktivierung

**Akzeptanztest:** Siehe VAD_REFACTOR_ACCEPTANCE_TESTS.md

**Status-Update (vor GO):**
```markdown
**Abgeschlossene Phasen:** 23
**Aktuelle Phase:** 24
**Letzte Aktion:** Warte auf manuelles GO
**Status:** ⏸️ WARTET_AUF_BESTÄTIGUNG
```

**Status-Update (nach GO):**
```markdown
**Abgeschlossene Phasen:** 24
**Aktuelle Phase:** COMPLETE
**Letzte Aktion:** VAD Refactor abgeschlossen
**Status:** ✅ REFACTOR_COMPLETE
```

---

## Status-Tracking

**Abgeschlossene Phasen:** 22
**Aktuelle Phase:** 23
**Letzte Aktion:** Dokumentation finalisiert (Phase 22 COMPLETE)
**Status:** ✅ FORTSCHRITT

**Cron-Job:** 89dc60cc-db28-4c41-ad51-63eeea16d48d
**Nächster Schritt:** Phase 23 starten (Cleanup)
**Manuelles GO erforderlich in:** Phase 24
