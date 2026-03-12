# AutoCast Architektur

## Ziel

Die Codebasis ist in klar getrennte Verantwortlichkeiten aufgeteilt:
- UI/CEP-Integration im Panel
- Analyse-Engine als eigenstaendiges Paket
- Testcode nah an der Engine

## Struktur

- `apps/panel`
  - CEP Panel UI (`index.html`, `css`, `js`)
  - ExtendScript Entry Points (`jsx`)
- `packages/analyzer/src`
  - Audio-Analyse (WAV, RMS, VAD, Segmente, Overlap)
  - Worker-Endpunkte fuer Panel-Aufrufe
- `packages/analyzer/test`
  - Unit/E2E Tests inkl. Testdaten

## Schichten im Analyzer

- `analyzer.js`: Pipeline-Orchestrierung
- `analyzer_defaults.js`: zentrale Standardparameter
- `analyzer_extensions.js`: Hook-System fuer Erweiterungen
- Feature-Module (`wav_reader`, `rms_calculator`, `vad_gate`, `spectral_vad`, `segment_builder`, `overlap_resolver`, `gain_normalizer`)

## Erweiterbarkeit

Neue Analyse-Schritte sollen vorzugsweise ueber das Hook-System eingebracht werden.
Wenn ein Schritt hart in die Pipeline muss:
1. Modul in `packages/analyzer/src` anlegen
2. in `analyzer.js` orchestrieren
3. Test in `packages/analyzer/test` ergaenzen

## Laufzeitpfade

- CEP Manifest: `CSXS/manifest.xml`
- Panel MainPath: `./apps/panel/index.html`
- ExtendScript ScriptPath: `./apps/panel/jsx/host.jsx`
- Analyzer Worker aus Panel:
  - `./packages/analyzer/src/analyzer_worker_stdio.js`
  - `./packages/analyzer/src/quick_gain_scan.js`
