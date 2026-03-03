# AutoCast

**Automatisches Podcast-Mehrspur-Ducking-Plugin für Adobe Premiere Pro.**

AutoCast analysiert deine Mehrspuraufnahmen und senkt automatisch inaktive Sprecher ab (Ducking), sodass immer nur die aktuell sprechende Person voll zu hören ist – mit sanften Crossfades und erhaltenem Raumton.

## Features

- **Automatische Spracherkennung** – RMS/VAD-Analyse pro Track mit adaptivem Noise Floor
- **Smartes Ducking** – Volume-Automation-Keyframes (keine destruktiven Schnitte)
- **Bleed-Unterdrückung** – Funktioniert bei Same-Room-Aufnahmen mit Mikrofon-Übersprechen
- **Overlap-Handling** – Einstellbar: lautester Sprecher gewinnt oder alle bleiben aktiv
- **Crossfades** – Weiche Übergänge (5–500 ms) statt harter Cuts
- **Raumton-Erhaltung** – Inaktive Spuren auf -24 dB (nicht stumm) für natürlichen Sound
- **Vorschau-Marker** – Sprecherwechsel als farbige Marker auf der Timeline prüfen
- **Komplett rücksetzbar** – Alle Keyframes per Knopfdruck entfernen
- **Keine Abhängigkeiten** – Alles in einer Datei, nichts zu installieren

## Voraussetzungen

- Adobe Premiere Pro CC 2021 oder neuer (v15.0+)
- Windows 10/11 oder macOS 10.14+

## Installation

### Schnellinstallation

**Windows:** `Installieren.bat` doppelklicken  
**macOS:** `Installieren.command` doppelklicken

Danach: Premiere Pro starten → `Fenster > Erweiterungen > AutoCast`

### Manuelle Installation

1. Debug-Modus aktivieren (einmalig):
   - **Windows:** Registry öffnen, zu `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.11` navigieren, `PlayerDebugMode` auf `1` setzen
   - **macOS:** Terminal: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1`

2. Den `AutoCast`-Ordner kopieren nach:
   - **Windows:** `%APPDATA%\Adobe\CEP\extensions\AutoCast`
   - **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/AutoCast`

3. Premiere Pro neustarten

### Deinstallation

**Windows:** `Deinstallieren.bat` doppelklicken  
**macOS:** `Deinstallieren.command` doppelklicken

## Benutzung

1. Podcast-Sequenz öffnen (eine Audiospur pro Sprecher)
2. `Fenster > Erweiterungen > AutoCast` öffnen
3. **Load Tracks** klicken – lädt die Audio-Tracks aus der Sequenz
4. Parameter anpassen oder Defaults verwenden
5. **Analyze** klicken – Sprachaktivität wird erkannt
6. **Preview Markers** klicken – farbige Marker zur Kontrolle setzen (optional)
7. **Apply Edits** klicken – Volume-Keyframes werden generiert
8. Bei Bedarf manuell in Premiere nachbessern

## Parameter

| Parameter | Default | Bereich | Beschreibung |
|-----------|---------|---------|-------------|
| Sensitivity | 12 dB | 3–30 | Schwellwert über Noise Floor. Höher = weniger empfindlich |
| Hold Time | 500 ms | 100–2000 | Minimale Gate-Öffnungsdauer (verhindert Pumpen) |
| Min Segment | 300 ms | 50–2000 | Segmente kürzer als dieser Wert werden ignoriert |
| Ducking Level | -24 dB | -60 bis -6 | Lautstärke inaktiver Spuren (nicht stumm = Raumton) |
| Crossfade | 30 ms | 5–500 | Übergangszeit beim Ducking |
| Overlap Policy | Dominant Wins | – | Was passiert wenn zwei gleichzeitig reden |

Jeder Parameter hat ein **?**-Icon mit Erklärung (deutsch) beim Hovern.

## Entwicklung

### Projektstruktur

```
AutoCast/
├── CSXS/manifest.xml        # CEP-Konfiguration
├── index.html                # Panel UI
├── css/styles.css            # Dark-Mode Adobe-Theme
├── js/
│   ├── main.js               # UI-Controller
│   ├── csi_bridge.js         # ExtendScript-Bridge
│   └── mock_csi.js           # Browser-Mock-Layer
├── jsx/
│   ├── host.jsx              # ExtendScript-Dispatcher
│   ├── get_track_info.jsx    # Sequenz-Info lesen
│   ├── apply_keyframes.jsx   # Volume-Automation
│   └── apply_markers.jsx     # Timeline-Marker
├── node/
│   ├── analyzer.js           # Analyse-Pipeline
│   ├── wav_reader.js         # WAV-Parser
│   ├── rms_calculator.js     # RMS-Energie
│   ├── vad_gate.js           # Sprachaktivitätserkennung
│   ├── segment_builder.js    # Segment-Builder
│   └── overlap_resolver.js   # Overlap-Auflösung
└── test/                     # Unit- & E2E-Tests
```

### Testen ohne Premiere Pro

Ca. 80% des Plugins ist ohne Premiere testbar:

```bash
# Alle Tests laufen lassen (31 Tests)
node test/run_all_tests.js

# Test-WAVs generieren
node test/generate_test_wav.js

# CLI-Analyse
node node/analyzer.js --tracks test/test_data/track_a_host.wav test/test_data/track_b_guest1.wav --output result.json

# UI im Browser testen → einfach index.html in Chrome öffnen (Mock-Modus aktiviert sich automatisch)
```

### Debugging

- Chrome DevTools: `localhost:8088` im Browser öffnen während Premiere läuft
- `PlayerDebugMode` muss auf `1` gesetzt sein (s. Installation)

## Bekannte Einschränkungen

- Clips sollten idealerweise durchgehend pro Track sein (ein Clip pro Sprecher)
- Audio-Quellen müssen im WAV-Format vorliegen
- ExtendScript-Keyframes setzen ist der Performance-Flaschenhals (~30–90 Sek. für 60 Min × 3 Tracks)

## Lizenz

MIT
