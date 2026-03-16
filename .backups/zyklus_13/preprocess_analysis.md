# Preprocessing-Extraktion Analyse (Phase 13)

**Datum:** 2026-03-16 12:12 UTC

## Zusammenfassung

Analyse der Preprocessing-Code-Duplikation zwischen `vad_stage_optimized.js` und `rms_stage.js`.

## Gefundene Duplikationen in vad_stage_optimized.js

### 1. Zeile 94-99: Preprocessing-Block
```javascript
if (enablePreprocess && audioData[i] && audioData[i].samples) {
    var preprocessed = preprocess.preprocess(audioData[i].samples, trackInfos[i].sampleRate, {
        noiseGate: false  // Don't use noise gate - VAD handles silence detection
    });
    // Re-compute RMS profile from pre-processed audio
    var rmsResult = rmsCalc.calculateRMS(preprocessed, trackInfos[i].sampleRate, params.frameDurationMs || 10);
    processedRmsProfile = rmsResult.rms;
}
```

**Problem:** RMS wird hier NEU berechnet, obwohl `rms_stage.js` bereits RMS berechnet hat.

### 2. Zeile 112-122: Spectral-VAD-Berechnung
```javascript
var optResult = optimizedVad.computeOptimizedSpectralVAD(preprocessed, trackInfos[i].sampleRate, {
    frameDurationMs: params.frameDurationMs || 20,
    speechLowHz: params.speechLowHz || 200,
    speechHighHz: params.speechHighHz || 4000
});
```

**Problem:** Spectral-VAD wird hier berechnet, obwohl `spectralResults` bereits als Parameter übergeben werden.

### 3. Zeile 139-145: Duplizierte Spectral-Berechnung für Speaker Profile
```javascript
if (!conf && enableOptimizedVAD && audioData[i] && audioData[i].samples) {
    var preprocessed = enablePreprocess ? 
        preprocess.preprocess(audioData[i].samples, trackInfos[i].sampleRate, { noiseGate: false }) : 
        audioData[i].samples;
    var optResult = optimizedVad.computeOptimizedSpectralVAD(preprocessed, trackInfos[i].sampleRate);
    conf = optimizedVad.smoothConfidence(optResult.confidence, 3);
}
```

**Problem:** Nochmalige Duplikation der Spectral-Berechnung.

## Aktueller Zustand rms_stage.js

- Berechnet RMS für alle Tracks
- Wendet Gain-Normalisierung an (falls aktiviert)
- **Kein Preprocessing** - dies ist die Lücke

## Empfohlene Änderungen

### Phase 14: rms_stage.js erweitern
- Import `preprocess` hinzufügen
- Preprocessing vor RMS-Berechnung anwenden (wenn `enablePreprocess`)
- `preprocessedSamples` zurückgeben für spätere Stages

### Phase 15-16: vad_stage_optimized.js bereinigen
- Entferne Zeile 94-99 (Preprocessing-Block)
- Entferne Zeile 112-122 (Spectral-VAD-Berechnung)
- Nutze stattdessen `spectralResults` aus ctx
- Entferne Zeile 139-145 (duplizierte Spectral-Berechnung)

### Phase 17: analyzer_pipeline.js anpassen
- Entferne `audioData` aus `optimizedVadStage.runOptimizedVadStage()` Aufruf
- Stattdessen `preprocessedSamples` übergeben (neu aus rms_stage)

## Impact

- **Vorteil:** Keine doppelte Berechnung mehr
- **Vorteil:** Klarere Trennung der Verantwortlichkeiten
- **Risiko:** Pipeline-Schnittstelle ändert sich

## Abhängigkeiten

- `analyzer_pipeline.js` muss angepasst werden
- `rms_stage.js` muss neue Daten zurückgeben
- `vad_stage_optimized.js` muss `audioData` nicht mehr erwarten
