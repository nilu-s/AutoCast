# VAD Refactor - Neustart Assessment

**Datum:** 2026-03-16
**Auslöser:** Cron-Job Timeout, unvollständige Umsetzung

---

## Was wurde erreicht (Phasen 1-24)

### ✅ Funktioniert
1. **Preprocessing verschoben** - `rms_stage.js` macht jetzt Preprocessing
2. **Keine doppelte Spectral-Berechnung** - `vad_stage_optimized.js` nutzt Feature-Stage-Ergebnisse
3. **Loudness-Latch Modul** - `loudness_latch.js` implementiert mit State-Machine
4. **Parameter in Defaults** - Neue Parameter für Preprocessing und Loudness-Latch

### ❌ Nicht funktioniert / Offen
1. **Parameter-Drift** - `useOptimizedPipeline` vs `enableOptimizedVAD`
2. **Bleed-Parameter-Drift** - `bleedDetection` vs `enableBleedHandling`
3. **Loudness-Latch nicht getestet** - Implementiert aber ohne Tests
4. **vad_stage_optimized.js ist kein Wrapper** - Noch ~200 Zeilen eigene Logik
5. **Keine Feature-Parität** - Viele Features aus `vad_stage.js` fehlen
6. **Dual-Path existiert weiterhin**

---

## Kritische Entscheidungen für Neustart

### Option A: Wrapper-Strategie (ursprünglicher Plan)
- `vad_stage_optimized.js` wird dünner Wrapper um `vad_stage.js`
- Preprocessing bleibt in `rms_stage.js`
- Loudness-Latch als separater Pass

**Problem:** `vad_stage.js` hat ~400 Zeilen komplexe Logik. Ein Wrapper, der alles durchleitet, bringt nichts. Ein Wrapper, der was ändert, dupliziert Logik.

### Option B: Merge-Strategie (empfohlen)
- `vad_stage_optimized.js` löschen
- Sinnvolle Änderungen (Preprocessing in RMS, Parameter-Alignment) in `vad_stage.js` übernehmen
- Einheitliche VAD-Stage
- Loudness-Latch als optionaler Pass

**Vorteil:** Kein Dual-Path, klare Verantwortlichkeit

### Option C: Komplett-Refactor
- Beide Dateien analysieren
- Neue, saubere VAD-Stage von Grund auf
- Alle Features konsolidieren

**Aufwand:** Hoch, aber sauberstes Ergebnis

---

## Empfohlener Neustart-Plan

### Phase 1: Assessment & Backup (15 Min)
- Aktuellen Stand in Branch `mawly-analysis-backup` sichern
- `vad_stage.js` und `vad_stage_optimized.js` detailliert vergleichen
- Entscheidung: Welche Features aus welcher Datei überleben?

### Phase 2: Parameter-Drift beheben (30 Min)
- `useOptimizedPipeline` → `enableOptimizedVAD` in Pipeline
- `bleedDetection` → `enableBleedHandling` in optimized
- Alle Parameter konsistent machen
- `npm run check` muss grün bleiben

### Phase 3: vad_stage.js erweitern (60 Min)
- Preprocessing-Option aus optimized übernehmen
- Parameter-Alignment aus Defaults nutzen
- Loudness-Latch Integration vorbereiten

### Phase 4: vad_stage_optimized.js entfernen (30 Min)
- Pipeline auf einheitlichen Pfad umstellen
- `useOptimizedPipeline` Switch entfernen
- `npm run check`

### Phase 5: Loudness-Latch vervollständigen (60 Min)
- Tests schreiben
- Integration testen
- Parameter feinjustieren

### Phase 6: Finalisierung (30 Min)
- Dokumentation aktualisieren
- `CLAUDE.md` bereinigen
- Finaler Test

**Gesamt:** ~3.5 Stunden konzentrierte Arbeit

---

## Offene Fragen

1. Soll `vad_stage_optimized.js` komplett weg oder als Legacy-Flag erhalten bleiben?
2. Soll Loudness-Latch default aktiv sein oder opt-in?
3. Welche Features aus `vad_stage_optimized.js` sind wirklich wichtig?

---

## Empfehlung

**Option B (Merge-Strategie)** mit folgender Priorisierung:
1. Parameter-Drift beheben (sofort)
2. `vad_stage_optimized.js` entfernen (nach Backup)
3. Loudness-Latch Tests schreiben
4. Dokumentation aktualisieren

Der Refactor ist nicht gescheitert, aber er braucht einen sauberen Abschluss statt weiterer partieller Zyklen.
