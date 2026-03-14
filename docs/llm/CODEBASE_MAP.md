# Codebase Map

Schneller Datei-Kompass fuer typische Eingriffe.

## Top-Level

- `apps/panel`: CEP-Panel (UI, Orchestrierung, Host-Bruecke)
- `packages/analyzer`: Audio-Analyse und Segment-Entscheidungen
- `CSXS/manifest.xml`: CEP-Metadaten und Laufzeitpfade
- `scripts`: Repo-Checks und Install/Uninstall-Helfer
- `docs`: Architektur, LLM-Dokumentation und Arbeitsleitlinien

## Panel (Frontend und Host-Integration)

### Einstiegspunkte

- `apps/panel/index.html`: Script-Reihenfolge und UI-Struktur
- `apps/panel/js/main.js`: Runtime-Orchestrierung

### App-Layer

- `apps/panel/src/app/panel_bootstrap.js`
- `apps/panel/src/app/panel_controller.js`
- `apps/panel/src/app/panel_init_feature.js`
- `apps/panel/src/app/panel_flow_runtime_feature.js`
- `apps/panel/src/app/panel_params_feature.js`

### Adapter-Layer

- `apps/panel/src/adapters/host/csi_bridge_adapter.js`
- `apps/panel/src/adapters/analyzer/analyzer_client_adapter.js`
- `apps/panel/src/adapters/storage/panel_storage_adapter.js`

### Feature-Layer

- `apps/panel/src/features/tracks/*`
- `apps/panel/src/features/analysis/*`
- `apps/panel/src/features/cut-preview/*`
- `apps/panel/src/features/apply-edits/*`
- `apps/panel/src/features/audio-preview/*`
- `apps/panel/src/features/settings/*`

## Analyzer (Backend-Logik)

### Einstiegspunkte

- `packages/analyzer/src/analyzer.js` (oeffentliche API/Fassade)
- `packages/analyzer/src/interfaces/cli/analyzer_cli.js`
- `packages/analyzer/src/interfaces/worker/stdio_json_worker.js`

### Kern

- `packages/analyzer/src/core/pipeline/analyzer_pipeline.js`
- Stage-Dateien in `packages/analyzer/src/core/pipeline/*`
- Contracts in `packages/analyzer/src/core/contracts/analyzer_contracts.js`

### Module

- IO: `packages/analyzer/src/modules/io/*`
- Energy: `packages/analyzer/src/modules/energy/*`
- VAD: `packages/analyzer/src/modules/vad/*`
- Segmentation: `packages/analyzer/src/modules/segmentation/*`
- Overlap: `packages/analyzer/src/modules/overlap/*`
- Preview: `packages/analyzer/src/modules/preview/*`
- Postprocess:
  - `packages/analyzer/src/modules/postprocess/analyzer_postprocess.js` (Fassade/Exports)
  - `packages/analyzer/src/modules/postprocess/postprocess_gap_passes.js`
  - `packages/analyzer/src/modules/postprocess/postprocess_continuity_passes.js`
  - `packages/analyzer/src/modules/postprocess/postprocess_prune_passes.js`
  - `packages/analyzer/src/modules/postprocess/postprocess_shared_utils.js`

## Tests

- Runner: `packages/analyzer/test/test_runner.js`
- Unit-Suite: `packages/analyzer/test/unit/suite_manifest.js`
- Integration-Suite: `packages/analyzer/test/integration/suite_manifest.js`
- E2E-Suite: `packages/analyzer/test/e2e/suite_manifest.js`
- Analyzer-Tests ko-lokal:
  - `packages/analyzer/src/core/**/tests/*.test.js`
  - `packages/analyzer/src/modules/**/tests/*.test.js`
  - `packages/analyzer/src/tests/**/*.test.js`
- Panel-Tests ko-lokal:
  - `apps/panel/src/app/tests/*.test.js`
  - `apps/panel/src/adapters/tests/*.test.js`
  - `apps/panel/src/features/*/tests/*.test.js`
  - `apps/panel/src/shared/tests/*.test.js`
- Test-Helper:
  - `packages/analyzer/src/tests/helpers/*.js`

## Repo-Checks

- Syntax: `scripts/check_syntax.js` (`npm run check:syntax`)
- Struktur: `scripts/check_structure.js` (`npm run check:structure`)
- Architekturgrenzen: `scripts/check_architecture.js` (`npm run check:arch`)
- Gesamt: `npm run check`
