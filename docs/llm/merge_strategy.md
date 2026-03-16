## Merge-Strategie für VAD Pipeline

### Analyse-Ergebnis

- **vad_stage.js**: 13 Features, vollständige Pipeline
- **vad_stage_optimized.js**: 5 Features (größtenteils Duplikate)
- **Eindeutige Unterschiede**: Nur die Default-Werte für Speaker Profile sind anders

### Übernehmen aus vad_stage_optimized.js:

- [x] Optimierte Speaker Profile Defaults (minConfidence: 0.15, minFrames: 5 für real audio)
  - Diese Werte müssen in analyzer_defaults.js hinzugefügt werden
  - Falls nicht gesetzt, fallback auf bisherige Werte

### Behalten aus vad_stage.js:

- [x] Bleed Handling (mit enableBleedHandling)
- [x] Speaker Lock
- [x] In-Speech Dropout Heal
- [x] Laughter Continuity Recovery
- [x] Laughter Burst Reinforce
- [x] Always One Track Open enforcement
- [x] Alle Debug Features

### Entfernen:

- [x] vad_stage_optimized.js (duplizierte Logik)
- [x] enableOptimizedVAD Parameter (nicht mehr benötigt)

### Migration-Plan:

1. Optimierte Defaults in analyzer_defaults.js ergänzen:
   ```javascript
   speakerProfileMinConfidence: 0.30,  // statt implizit höher
   speakerProfileMinFrames: 10,         // statt implizit höher
   optimizedSpeakerProfileMinConfidence: 0.15,  // neu
   optimizedSpeakerProfileMinFrames: 5          // neu
   ```

2. In vad_stage.js:
   - Falls params.useOptimizedSpeakerDefaults → nutze optimierte Werte
   - Sonst: Standard-Werte

3. Pipeline auf einheitlichen Pfad umstellen
4. vad_stage_optimized.js entfernen
5. enableOptimizedVAD aus Defaults entfernen

### Ergebnis:

- Eine einheitliche VAD-Stage
- Alle Features erhalten
- Keine Code-Duplikation
- Rückwärtskompatibel durch Defaults
