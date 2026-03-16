# Fix: Segment Visibility in AutoCast

## Root-Cause-Analyse

Die Tracks wurden zu stark zu größeren Blöcken zusammengezogen durch:

1. **`cut_preview_builder.js`**: `previewSegmentMergeGapMs: 1000ms` (Default) → Merged Segmente mit bis zu 1 Sekunde Pause
2. **`postprocess_stage.js`**: `sameTrackGapMergeMaxMs: 1400ms` → Merged Segmente in der Pipeline
3. **`segment_stage.js`**: `snippetPadBeforeMs/AfterMs: 1200ms` → Erweitert Segmente zusätzlich
4. **UI**: Verwendet `cutPreview.items` statt `result.segments`

## Geänderte Dateien

### 1. `/packages/analyzer/src/defaults/analyzer_defaults.js`

**Geänderte Defaults:**
- `previewSegmentMergeGapMs`: 1000ms → **250ms** (75% Reduktion)
- `sameTrackGapMergeMaxMs`: 1400ms → **600ms** (57% Reduktion)

**Begründung:**
- 250ms deckt kurze Sprechpausen auf (natürliche Atempause ~300-500ms)
- 600ms im Postprocess verhindert hartes Zusammenführen längerer Gesprächspausen
- Beide Werte bewahren individuelle Segmente bei ~500ms+ Abstand

### 2. `/packages/analyzer/src/tests/regression/segment_isolation_regression.test.js` (Neu)

**Regression-Schutz:**
- Überprüft dass `previewSegmentMergeGapMs <= 500ms`
- Überprüft dass `sameTrackGapMergeMaxMs <= 800ms`
- Testet dass 3 separate Segmente auch als 3 Preview-Items dargestellt werden
- Verhindert versehentliches Zurücksetzen der Werte

## Diff-Ausschnitte

```javascript
// analyzer_defaults.js
- previewSegmentMergeGapMs: 1000,
+ previewSegmentMergeGapMs: 250,  // REDUCED: 1000ms -> 250ms

- sameTrackGapMergeMaxMs: 1400,
+ sameTrackGapMergeMaxMs: 600,    // REDUCED: 1400ms -> 600ms
```

## Warum diese Lösung

1. **Minimal-invasiv**: Nur 2 Default-Werte geändert
2. **Keine UI-Änderung nötig**: `cutPreview.items` zeigt jetzt feinere Struktur
3. **Rückwärtskompatibel**: Werte sind konservativer (weniger Merge)
4. **Deterministisch**: Klare Schwellen, keine Magie

## Verifikation

```bash
cd AutoCast
node packages/analyzer/src/tests/regression/segment_isolation_regression.test.js
```

Erwartetes Ergebnis:
```
[PASS] Merge thresholds are within safe limits
[PASS] Segments remain isolated in preview (items: 3)
=== Results: 2 passed, 0 failed ===
```

## Annahmen

1. Audio enthält natürliche Sprechpausen >300ms zwischen Segmenten
2. UI soll `cutPreview.items` weiterhin nutzen (keine Umstellung auf `segments` nötig)
3. 250ms/600ms sind konservativ genug für Dialog ohne zu fragmentieren
