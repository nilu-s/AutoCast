# VAD Refactor Phasenplan

**Projekt:** Analyzer Pipeline Refactor - vad_stage_optimized.js Bereinigung
**Zeitrahmen:** 36 Zyklen × 10 Minuten = 6 Stunden
**Startbedingung:** Cron-Job liest diese Datei + CLAUDE.md vor jeder Phase

---

## Zyklus-Struktur

Jeder Zyklus:
1. Cron-Job wacht auf
2. Liest CLAUDE.md (verpflichtend)
3. Liest diese Datei
4. Führt die aktuelle Phase aus
5. Schreibt Fortschritt in Phase-Status
6. Schläft wieder ein

---

## Phase 1: Vorbereitung - Datei-Validierung (Zyklus 1)

**Ziel:** Sicherstellen dass alle Dateien existieren und lesbar sind

**Aufgaben:**
1. Prüfe Existenz von:
   - `packages/analyzer/src/core/pipeline/vad_stage_optimized.js`
   - `packages/analyzer/src/core/pipeline/vad_stage.js`
   - `packages/analyzer/src/defaults/analyzer_defaults.js`
   - `packages/analyzer/src/modules/vad/laughter_detector.js`
   - `packages/analyzer/src/modules/preprocess/audio_preprocess.js`
   - `packages/analyzer/src/modules/vad/spectral_vad_optimized.js`
2. Erstelle Backup-Ordner `.backups/zyklus_1/`
3. Kopiere alle oben genannten Dateien in Backup-Ordner
4. Schreibe Status: `PHASE_1_COMPLETE`

**Erfolgskriterium:** Alle Dateien lesbar, Backup erstellt

---

## Phase 2: Vorbereitung - Test-Baseline (Zyklus 2)

**Ziel:** Test-Suite vor Änderungen laufen lassen

**Aufgaben:**
1. Führe `npm run check` aus
2. Speichere Output in `.backups/zyklus_2/test_baseline.log`
3. Notiere Anzahl der fehlenden Tests/Errors
4. Schreibe Status: `PHASE_2_COMPLETE`

**Erfolgskriterium:** Test-Baseline dokumentiert

---

## Phase 3: Analyse - Parameter-Mapping-Dokumentation (Zyklus 3)

**Ziel:** Vollständiges Mapping der Parameter-Drifts dokumentieren

**Aufgaben:**
1. Lese `analyzer_defaults.js` vollständig
2. Lese `vad_stage_optimized.js` vollständig
3. Erstelle Mapping-Tabelle:
   - `enablePreprocess` → NEU in defaults (default: true)
   - `enableOptimizedVAD` → NEU in defaults (default: true)
   - `enableSpeakerProfile` → existiert als `primarySpeakerLock`
   - `detectLaughter` → existiert als `useLaughterDetection`
   - `continuityEnforcement` → existiert als `enableInSpeechDropoutHeal`
4. Speichere Mapping in `.backups/zyklus_3/param_mapping.json`
5. Schreibe Status: `PHASE_3_COMPLETE`

**Erfolgskriterium:** Mapping-Datei existiert

---

## Phase 4: Kritische Fixes - Import-Korrektur (Zyklus 4)

**Ziel:** Fehlenden Import hinzufügen

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Füge nach Zeile 13 ein:
   ```javascript
   var laughterDetector = require('../../modules/vad/laughter_detector');
   ```
3. Speichere Datei
4. Führe `npm run check` aus (nur Syntax-Check)
5. Schreibe Status: `PHASE_4_COMPLETE`

**Erfolgskriterium:** Kein Syntax-Error, Import vorhanden

---

## Phase 5: Kritische Fixes - Hartkodierte Parameter 1/2 (Zyklus 5)

**Ziel:** Spectral-VAD Parameter korrigieren

**Aufgaben:**
1. In `vad_stage_optimized.js`, Zeile 108-110:
   - Ersetze `frameDurationMs: 20` durch `frameDurationMs: params.frameDurationMs || 20`
   - Ersetze `speechLowHz: 200` durch `speechLowHz: params.speechLowHz || 200`
   - Ersetze `speechHighHz: 4000` durch `speechHighHz: params.speechHighHz || 4000`
2. Führe `npm run check` aus
3. Schreibe Status: `PHASE_5_COMPLETE`

**Erfolgskriterium:** Parameter sind konfigurierbar

---

## Phase 6: Kritische Fixes - Hartkodierte Parameter 2/2 (Zyklus 6)

**Ziel:** Laughter-Detection Parameter korrigieren

**Aufgaben:**
1. In `vad_stage_optimized.js`, Zeile 139:
   - Ersetze `params.frameDurationMs || 10` durch direkte Nutzung von `params.frameDurationMs`
2. Prüfe dass `frameDurationMs` aus params kommt
3. Führe `npm run check` aus
4. Schreibe Status: `PHASE_6_COMPLETE`

**Erfolgskriterium:** Keine hartkodierten Parameter mehr

---

## Phase 7: Parameter-Alignment - Defaults erweitern 1/3 (Zyklus 7)

**Ziel:** Neue Parameter in analyzer_defaults.js hinzufügen

**Aufgaben:**
1. Öffne `analyzer_defaults.js`
2. Füge nach `debugMaxFrames` hinzu:
   ```javascript
   // Optimized pipeline parameters
   enablePreprocess: true,
   enableOptimizedVAD: true,
   speechLowHz: 200,
   speechHighHz: 4000,
   ```
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_7_COMPLETE`

**Erfolgskriterium:** Neue Parameter in defaults

---

## Phase 8: Parameter-Alignment - Defaults erweitern 2/3 (Zyklus 8)

**Ziel:** Loudness-Latch Parameter-Platzhalter hinzufügen

**Aufgaben:**
1. Öffne `analyzer_defaults.js`
2. Füge nach `speechHighHz` hinzu:
   ```javascript
   // Loudness Latch (preparation for Phase 19-24)
   enableLoudnessLatch: false,
   loudnessLatchOpenThresholdDb: -48,
   loudnessLatchKeepThresholdDb: -52,
   loudnessLatchOpenMinDurationMs: 100,
   loudnessLatchWindowMs: 4000,
   loudnessLatchMinCumulativeActiveMs: 1200,
   loudnessLatchMinCoveragePercent: 35,
   loudnessLatchCloseConfirmMs: 1000,
   ```
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_8_COMPLETE`

**Erfolgskriterium:** Loudness-Latch Parameter vorhanden

---

## Phase 9: Parameter-Alignment - Defaults erweitern 3/3 (Zyklus 9)

**Ziel:** Parameter-Aliases für Kompatibilität

**Aufgaben:**
1. Öffne `analyzer_defaults.js`
2. Füge Kommentar hinzu:
   ```javascript
   // Parameter aliases for vad_stage_optimized compatibility
   // enableSpeakerProfile -> primarySpeakerLock (use primarySpeakerLock)
   // detectLaughter -> useLaughterDetection (use useLaughterDetection)
   // continuityEnforcement -> enableInSpeechDropoutHeal (use enableInSpeechDropoutHeal)
   ```
3. Speichere Datei
4. Schreibe Status: `PHASE_9_COMPLETE`

**Erfolgskriterium:** Dokumentation der Aliases

---

## Phase 10: Parameter-Alignment - vad_stage_optimized korrigieren 1/2 (Zyklus 10)

**Ziel:** Parameter-Namen in vad_stage_optimized anpassen

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Suche `params.enableSpeakerProfile`
3. Ersetze durch `params.primarySpeakerLock`
4. Suche `params.detectLaughter`
5. Ersetze durch `params.useLaughterDetection`
6. Speichere Datei
7. Führe `npm run check` aus
8. Schreibe Status: `PHASE_10_COMPLETE`

**Erfolgskriterium:** Parameter-Namen konsistent

---

## Phase 11: Parameter-Alignment - vad_stage_optimized korrigieren 2/2 (Zyklus 11)

**Ziel:** Continuity-Parameter korrigieren

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Suche `params.continuityEnforcement`
3. Ersetze durch `params.enableInSpeechDropoutHeal`
4. Prüfe dass `continuityEnforcer` Import existiert
5. Speichere Datei
6. Führe `npm run check` aus
7. Schreibe Status: `PHASE_11_COMPLETE`

**Erfolgskriterium:** Continuity-Parameter konsistent

---

## Phase 12: Parameter-Alignment - Validierung (Zyklus 12)

**Ziel:** Vollständige Parameter-Konsistenz prüfen

**Aufgaben:**
1. Erstelle Liste aller Parameter in `vad_stage_optimized.js`
2. Vergleiche mit `analyzer_defaults.js`
3. Stelle sicher: Jeder Parameter hat Default
4. Dokumentiere in `.backups/zyklus_12/param_validation.log`
5. Schreibe Status: `PHASE_12_COMPLETE`

**Erfolgskriterium:** Alle Parameter haben Defaults

---

## Phase 13: Preprocessing-Extraktion - Analyse (Zyklus 13)

**Ziel:** Preprocessing-Code identifizieren

**Aufgaben:**
1. Lese `vad_stage_optimized.js` Zeile 94-99
2. Lese `rms_stage.js` vollständig
3. Identifiziere wo Preprocessing eingehängt werden könnte
4. Dokumentiere in `.backups/zyklus_13/preprocess_analysis.md`
5. Schreibe Status: `PHASE_13_COMPLETE`

**Erfolgskriterium:** Analyse dokumentiert

---

## Phase 14: Preprocessing-Extraktion - rms_stage.js erweitern (Zyklus 14)

**Ziel:** Preprocessing-Option in RMS-Stage hinzufügen

**Aufgaben:**
1. Öffne `rms_stage.js`
2. Füge Import hinzu:
   ```javascript
   var preprocess = require('../../modules/preprocess/audio_preprocess');
   ```
3. Modifiziere RMS-Berechnung:
   ```javascript
   var samples = audioData[i].samples;
   if (params.enablePreprocess) {
       samples = preprocess.preprocess(samples, trackInfos[i].sampleRate, {
           noiseGate: false
       });
   }
   var rmsResult = rmsCalc.calculateRMS(samples, audioData[i].sampleRate, params.frameDurationMs);
   ```
4. Speichere Datei
5. Führe `npm run check` aus
6. Schreibe Status: `PHASE_14_COMPLETE`

**Erfolgskriterium:** Preprocessing in RMS-Stage verfügbar

---

## Phase 15: Preprocessing-Extraktion - vad_stage_optimized bereinigen 1/2 (Zyklus 15)

**Ziel:** Dupliziertes Preprocessing aus vad_stage_optimized entfernen

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Entferne Zeile 94-99 (Preprocessing-Block)
3. Entferne `preprocess` Import (wenn nicht mehr benötigt)
4. Entferne `audioData` Parameter aus Funktionssignatur (wenn nicht mehr benötigt)
5. Nutze stattdessen `rmsProfiles` direkt
6. Speichere Datei
7. Führe `npm run check` aus
8. Schreibe Status: `PHASE_15_COMPLETE`

**Erfolgskriterium:** Kein dupliziertes Preprocessing mehr

---

## Phase 16: Preprocessing-Extraktion - vad_stage_optimized bereinigen 2/2 (Zyklus 16)

**Ziel:** Duplizierte Spectral-Berechnung entfernen

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Entferne Zeile 112-122 (eigene Spectral-VAD-Berechnung)
3. Nutze stattdessen `spectralResults` aus Parameter
4. Entferne `optimizedVad` Import (wenn nicht mehr benötigt)
5. Speichere Datei
6. Führe `npm run check` aus
7. Schreibe Status: `PHASE_16_COMPLETE`

**Erfolgskriterium:** Keine duplizierte Spectral-Berechnung mehr

---

## Phase 17: Preprocessing-Extraktion - analyzer_pipeline anpassen (Zyklus 17)

**Ziel:** Pipeline-Parameter anpassen

**Aufgaben:**
1. Öffne `analyzer_pipeline.js`
2. Entferne `audioData: readResult.audioData` aus `optimizedVadStage.runOptimizedVadStage()` Aufruf
3. Führe `npm run check` aus
4. Schreibe Status: `PHASE_17_COMPLETE`

**Erfolgskriterium:** Pipeline ohne audioData-Weitergabe an VAD

---

## Phase 18: Preprocessing-Extraktion - Validierung (Zyklus 18)

**Ziel:** Keine duplizierten Berechnungen mehr

**Aufgaben:**
1. Vergleiche `vad_stage_optimized.js` mit `vad_stage.js`
2. Stelle sicher: Keine doppelte RMS-Berechnung
3. Stelle sicher: Keine doppelte Spectral-Berechnung
4. Stelle sicher: Keine doppelte Laughter-Berechnung
5. Dokumentiere in `.backups/zyklus_18/dedup_validation.log`
6. Schreibe Status: `PHASE_18_COMPLETE`

**Erfolgskriterium:** Keine Duplikate mehr

---

## Phase 19: Loudness-Latch - Modul-Grundgerüst (Zyklus 19)

**Ziel:** Neue Datei für Loudness-Latch erstellen

**Aufgaben:**
1. Erstelle Datei `packages/analyzer/src/modules/vad/loudness_latch.js`
2. Grundgerüst:
   ```javascript
   'use strict';
   
   function applyLoudnessLatch(vadResults, rmsProfiles, params) {
       // Implementation in Phase 20-23
       return vadResults;
   }
   
   module.exports = {
       applyLoudnessLatch: applyLoudnessLatch
   };
   ```
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_19_COMPLETE`

**Erfolgskriterium:** Datei existiert, Syntax OK

---

## Phase 20: Loudness-Latch - State-Machine-Logik (Zyklus 20)

**Ziel:** Zustandsmodell implementieren

**Aufgaben:**
1. Öffne `loudness_latch.js`
2. Implementiere State-Machine:
   ```javascript
   var State = {
       CLOSED: 0,
       OPEN_CANDIDATE: 1,
       LATCHED_OPEN: 2
   };
   ```
3. Implementiere Frame-weise Verarbeitung
4. Speichere Datei
5. Führe `npm run check` aus
6. Schreibe Status: `PHASE_20_COMPLETE`

**Erfolgskriterium:** State-Machine implementiert

---

## Phase 21: Loudness-Latch - Threshold-Logik (Zyklus 21)

**Ziel:** Threshold-basierte Zustandsübergänge

**Aufgaben:**
1. Öffne `loudness_latch.js`
2. Implementiere:
   - `openThresholdDb` Check für OPEN_CANDIDATE
   - `keepThresholdDb` Check für LATCHED_OPEN
   - Timer für `openMinDurationMs`
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_21_COMPLETE`

**Erfolgskriterium:** Threshold-Logik implementiert

---

## Phase 22: Loudness-Latch - Window-Logik (Zyklus 22)

**Ziel:** Sliding-Window für kumulative Aktivität

**Aufgaben:**
1. Öffne `loudness_latch.js`
2. Implementiere:
   - `latchWindowMs` als Sliding-Window
   - Zählung kumulativer Aktivität im Fenster
   - Coverage-Berechnung (`minCoveragePercent`)
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_22_COMPLETE`

**Erfolgskriterium:** Window-Logik implementiert

---

## Phase 23: Loudness-Latch - Close-Confirm (Zyklus 23)

**Ziel:** Schließen-Verzögerung implementieren

**Aufgaben:**
1. Öffne `loudness_latch.js`
2. Implementiere:
   - `closeConfirmMs` Timer
   - Übergang von LATCHED_OPEN zu CLOSED
   - Hysterese für Schließ-Entscheidung
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_23_COMPLETE`

**Erfolgskriterium:** Close-Confirm implementiert

---

## Phase 24: Loudness-Latch - Integration (Zyklus 24)

**Ziel:** Loudness-Latch in Pipeline einhängen

**Aufgaben:**
1. Öffne `analyzer_pipeline.js`
2. Füge Import hinzu:
   ```javascript
   var loudnessLatch = require('../../modules/vad/loudness_latch');
   ```
3. Füge nach VAD-Stage ein:
   ```javascript
   if (params.enableLoudnessLatch) {
       vadResults = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
   }
   ```
4. Speichere Datei
5. Führe `npm run check` aus
6. Schreibe Status: `PHASE_24_COMPLETE`

**Erfolgskriterium:** Integration vollständig

---

## Phase 25: Wrapper-Reduktion - vad_stage_optimized als Wrapper (Zyklus 25)

**Ziel:** vad_stage_optimized zu dünnem Wrapper machen

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Ersetze kompletten Inhalt durch:
   ```javascript
   'use strict';
   
   var vadStage = require('./vad_stage');
   
   function runOptimizedVadStage(ctx) {
       // Optimized VAD is now a thin wrapper around standard VAD
       // Preprocessing happens in RMS stage, spectral features in feature stage
       // This ensures feature parity and removes code duplication
       return vadStage.runVadStage(ctx);
   }
   
   module.exports = {
       runOptimizedVadStage: runOptimizedVadStage
   };
   ```
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_25_COMPLETE`

**Erfolgskriterium:** Wrapper implementiert

---

## Phase 26: Wrapper-Reduktion - Parameter-Weiterleitung (Zyklus 26)

**Ziel:** Sicherstellen dass alle Parameter korrekt weitergeleitet werden

**Aufgaben:**
1. Öffne `vad_stage_optimized.js`
2. Prüfe dass `ctx` unverändert an `vadStage.runVadStage` übergeben wird
3. Füge Kommentar hinzu:
   ```javascript
   // DEPRECATED: This wrapper will be removed in Phase 33
   // Use vad_stage.runVadStage directly
   ```
4. Speichere Datei
5. Führe `npm run check` aus
6. Schreibe Status: `PHASE_26_COMPLETE`

**Erfolgskriterium:** Wrapper funktioniert

---

## Phase 27: Wrapper-Reduktion - Pipeline-Switch entfernen Vorbereitung (Zyklus 27)

**Ziel:** Vorbereitung für Entfernung des useOptimizedPipeline-Switch

**Aufgaben:**
1. Öffne `analyzer_pipeline.js`
2. Füge Kommentar hinzu:
   ```javascript
   // TODO Phase 33: Remove useOptimizedPipeline switch
   // Both paths now use the same implementation
   ```
3. Speichere Datei
4. Schreibe Status: `PHASE_27_COMPLETE`

**Erfolgskriterium:** Kommentar vorhanden

---

## Phase 28: Wrapper-Reduktion - CLAUDE.md Update (Zyklus 28)

**Ziel:** Dokumentation aktualisieren

**Aufgaben:**
1. Öffne `CLAUDE.md`
2. Füge unter "Legacy-Strategie" hinzu:
   ```markdown
   ## VAD Stage Refactor (ab Zyklus 28)
   - vad_stage_optimized.js ist nun ein dünner Wrapper
   - Preprocessing wurde in RMS-Stage verschoben
   - Loudness-Latch als separater Pass verfügbar
   - useOptimizedPipeline-Switch wird in Phase 33 entfernt
   ```
3. Speichere Datei
4. Schreibe Status: `PHASE_28_COMPLETE`

**Erfolgskriterium:** Dokumentation aktualisiert

---

## Phase 29: Integration - End-to-End Test Vorbereitung (Zyklus 29)

**Ziel:** Test-Dateien vorbereiten

**Aufgaben:**
1. Erstelle Test-Datei: `packages/analyzer/test/loudness_latch_test.js` (Grundgerüst)
2. Erstelle Test-Datei: `packages/analyzer/test/vad_stage_parity_test.js` (Grundgerüst)
3. Führe `npm run check` aus
4. Schreibe Status: `PHASE_29_COMPLETE`

**Erfolgskriterium:** Test-Dateien existieren

---

## Phase 30: Integration - Test-Implementierung 1/2 (Zyklus 30)

**Ziel:** Loudness-Latch Tests implementieren

**Aufgaben:**
1. Öffne `loudness_latch_test.js`
2. Implementiere Tests:
   - State-Machine-Transitions
   - Threshold-Logik
   - Window-Coverage
   - Close-Confirm
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_30_COMPLETE`

**Erfolgskriterium:** Tests implementiert

---

## Phase 31: Tests - Test-Implementierung 2/2 (Zyklus 31)

**Ziel:** VAD-Stage-Parity Tests

**Aufgaben:**
1. Öffne `vad_stage_parity_test.js`
2. Implementiere Tests:
   - Standard VAD vs Optimized VAD liefern gleiche Ergebnisse
   - Parameter-Mapping korrekt
   - Gate-Snapshots vollständig
3. Speichere Datei
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_31_COMPLETE`

**Erfolgskriterium:** Tests implementiert

---

## Phase 32: Tests - Test-Ausführung (Zyklus 32)

**Ziel:** Alle Tests laufen lassen

**Aufgaben:**
1. Führe `npm run check` aus
2. Speichere Output in `.backups/zyklus_32/test_final.log`
3. Vergleiche mit Baseline aus Phase 2
4. Dokumentiere Unterschiede
5. Schreibe Status: `PHASE_32_COMPLETE`

**Erfolgskriterium:** Tests ausgeführt

---

## Phase 33: Finalisierung - useOptimizedPipeline entfernen (Zyklus 33)

**Ziel:** Dual-Path entfernen

**Aufgaben:**
1. Öffne `analyzer_pipeline.js`
2. Entferne `useOptimizedPipeline` Switch
3. Entferne `optimizedVadStage` Import
4. Behalte nur `vadStage.runVadStage` Aufruf
5. Speichere Datei
6. Führe `npm run check` aus
7. Schreibe Status: `PHASE_33_COMPLETE`

**Erfolgskriterium:** Einheitlicher Pfad

---

## Phase 34: Finalisierung - vad_stage_optimized.js entfernen (Zyklus 34)

**Ziel:** Wrapper-Datei entfernen

**Aufgaben:**
1. Lösche `vad_stage_optimized.js`
2. Entferne Import aus `analyzer_pipeline.js` (falls noch vorhanden)
3. Führe `npm run check` aus
4. Schreibe Status: `PHASE_34_COMPLETE`

**Erfolgskriterium:** Datei entfernt

---

## Phase 35: Finalisierung - Cleanup (Zyklus 35)

**Ziel:** Aufräumen

**Aufgaben:**
1. Entferne ungenutzte Imports in allen Pipeline-Dateien
2. Prüfe auf verwaiste Parameter in `analyzer_defaults.js`
3. Aktualisiere `CLAUDE.md` - Entferne Hinweise auf vad_stage_optimized
4. Führe `npm run check` aus
5. Schreibe Status: `PHASE_35_COMPLETE`

**Erfolgskriterium:** Cleanup vollständig

---

## Phase 36: Abschluss - Finaler Test & Dokumentation (Zyklus 36)

**Ziel:** Projekt abschließen

**Aufgaben:**
1. Führe `npm run check` aus
2. Speichere finalen Test-Output
3. Erstelle Zusammenfassung in `.backups/REFACTOR_COMPLETE.md`:
   - Was wurde geändert
   - Warum
   - Neue Architektur
   - Verbleibende TODOs
4. Lösche Cron-Job (oder setze auf inaktiv)
5. Schreibe Status: `PHASE_36_COMPLETE - REFACTOR_FINISHED`

**Erfolgskriterium:** Projekt abgeschlossen

---

## Status-Tracking

Der Cron-Job liest diese Datei und führt die Phase aus, die noch nicht als COMPLETE markiert ist.

**Aktueller Status:** `PHASE_23_COMPLETE`

**Cron-Job ID:** `b734302c-b593-4f99-9a39-4f363ec71cae`

**Nächster Lauf:** Alle 10 Minuten

**Letzte Aktualisierung:** 2026-03-16 14:03 UTC

---

## Abgeschlossene Phasen

| Phase | Beschreibung | Status |
|-------|--------------|--------|
| 1 | Vorbereitung - Datei-Validierung | ✅ COMPLETE |
| 2 | Vorbereitung - Test-Baseline | ✅ COMPLETE |
| 3 | Analyse - Parameter-Mapping-Dokumentation | ✅ COMPLETE |
| 4 | Kritische Fixes - Import-Korrektur | ✅ COMPLETE |
| 5 | Kritische Fixes - Hartkodierte Parameter 1/2 | ✅ COMPLETE |
| 6 | Kritische Fixes - Hartkodierte Parameter 2/2 | ✅ COMPLETE |
| 7 | Parameter-Alignment - Defaults erweitern 1/3 | ✅ COMPLETE |
| 8 | Parameter-Alignment - Defaults erweitern 2/3 | ✅ COMPLETE |
| 9 | Parameter-Alignment - Defaults erweitern 3/3 | ✅ COMPLETE |
| 10 | Parameter-Alignment - vad_stage_optimized korrigieren 1/2 | ✅ COMPLETE |
| 11 | Parameter-Alignment - vad_stage_optimized korrigieren 2/2 | ✅ COMPLETE |
| 12 | Parameter-Alignment - Validierung | ✅ COMPLETE |
| 13 | Preprocessing-Extraktion - Analyse | ✅ COMPLETE |
| 14 | Preprocessing-Extraktion - rms_stage.js erweitern | ✅ COMPLETE |
| 15 | Preprocessing-Extraktion - vad_stage_optimized bereinigen 1/2 | ✅ COMPLETE |
| 16 | Preprocessing-Extraktion - vad_stage_optimized bereinigen 2/2 | ✅ COMPLETE |
| 17 | Preprocessing-Extraktion - analyzer_pipeline anpassen | ✅ COMPLETE |
| 18 | Preprocessing-Extraktion - Validierung | ✅ COMPLETE |
| 19 | Loudness-Latch - Modul-Grundgerüst | ✅ COMPLETE |
| 20 | Loudness-Latch - State-Machine-Logik | ✅ COMPLETE |
| 21 | Loudness-Latch - Threshold-Logik | ✅ COMPLETE |
| 22 | Loudness-Latch - Window-Logik | ✅ COMPLETE |
| 23 | Loudness-Latch - Close-Confirm | ✅ COMPLETE |

## Nächste Phase

**Phase 23:** Loudness-Latch - Close-Confirm
