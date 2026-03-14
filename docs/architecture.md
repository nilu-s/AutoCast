# AutoCast Architektur

## Zielbild

AutoCast folgt einer Feature-First Architektur mit klaren Schnittstellen:

- Panel: Feature-Module + Adapter fuer Host/Analyzer/Storage
- Analyzer: Stage-basierte Kernpipeline, getrennt von Interfaces/IO
- Tests: Unit, Integration, E2E mit Manifest-gesteuertem Runner

## Zielstruktur

```text
apps/panel/src/
  app/
  core/
  shared/
  adapters/
    host/
    analyzer/
    storage/
  features/
    tracks/
    analysis/
    cut-preview/
    apply-edits/
    audio-preview/
    settings/

packages/analyzer/src/
  core/
    pipeline/
    contracts/
    utils/
  modules/
    io/
    energy/
    vad/
    segmentation/
    overlap/
    preview/
    postprocess/
  interfaces/
    cli/
    worker/
  defaults/
  extensions/

packages/analyzer/test/
  unit/
  integration/
  e2e/
```

## Aktueller Architekturstand

### Panel

- Einstieg bleibt `apps/panel/js/main.js` (Runtime-stabil).
- App-Orchestrierung liegt in `apps/panel/src/app/*`.
- Adapter kapseln externe Abhaengigkeiten:
  - Host: `apps/panel/src/adapters/host/*`
  - Analyzer: `apps/panel/src/adapters/analyzer/*`
  - Storage: `apps/panel/src/adapters/storage/*`
- Feature-Logik liegt unter `apps/panel/src/features/*`.
- State- und Komponenten-Layer sind angelegt:
  - `features/*/state/*`
  - `features/*/components/*`

### Analyzer

- Einstieg bleibt `packages/analyzer/src/analyzer.js` (Fassade/API).
- Analyse laeuft ueber Stage-Runner:
  - `packages/analyzer/src/core/pipeline/analyzer_pipeline.js`
- Fachlogik liegt in `packages/analyzer/src/modules/*`.
- Parameter-Helfer liegen in `packages/analyzer/src/core/utils/*`.

### Contracts und Validierung

- Analyzer-Vertrag:
  - `packages/analyzer/src/core/contracts/analyzer_contracts.js`
- Panel-Vertrag:
  - `apps/panel/src/core/contracts/panel_contracts.js`
- Request/Response-Validierung ist Teil der Runtime-Pfade (Adapter/Worker/CLI).

### Tests

- Zentraler Runner:
  - `packages/analyzer/test/test_runner.js`
- Suite-Manifeste:
  - `packages/analyzer/test/unit/suite_manifest.js`
  - `packages/analyzer/test/integration/suite_manifest.js`
  - `packages/analyzer/test/e2e/suite_manifest.js`

## Engineeringprinzipien

1. Keine Verhaltensaenderung bei Datei-Splits/Refactors.
2. Erst Helper, dann State/Komponenten, dann Orchestrierung.
3. Panel darf Analyzer-Interna nicht direkt laden (nur ueber Adapter/API).
4. Nach jedem Teilschritt `npm run check`.

## Laufzeitpfade (stabil)

- CEP Manifest: `CSXS/manifest.xml`
- Panel MainPath: `./apps/panel/index.html`
- ExtendScript ScriptPath: `./apps/panel/jsx/host.jsx`
- Analyzer Worker:
  - `./packages/analyzer/src/analyzer_worker_stdio.js`
  - `./packages/analyzer/src/quick_gain_scan.js`

## Struktur- und Doku-Referenzen

- Struktur-Gate: `scripts/check_structure.js`
- LLM-Onboarding: `CLAUDE.md`, `docs/llm/*`
