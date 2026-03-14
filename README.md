# AutoCast

AutoCast ist ein CEP-Panel fuer Adobe Premiere Pro, das Mehrspur-Podcastaufnahmen analysiert und daraus automatische Schnitt-Segmente erzeugt.

## Projektstruktur

```text
AutoCast/
  apps/
    panel/
      index.html
      css/
      js/
      jsx/
      src/
  packages/
    analyzer/
      src/
      test/
  CSXS/manifest.xml
  scripts/
  docs/
  package.json
```

## Hauptbereiche

- `apps/panel`: CEP-UI, App-Features, Adapter, ExtendScript-Bridge
- `packages/analyzer/src`: Audio-Analyse-Pipeline und Module
- `packages/analyzer/test`: Unit-, Integration- und E2E-Tests

## Entwicklung

```bash
npm run check
npm test
npm run test:e2e
npm run generate-test-data
npm run analyze -- --tracks packages/analyzer/test/test_data/track_a_host.wav packages/analyzer/test/test_data/track_b_guest1.wav
```

## Analyzer erweitern

Der Analyzer unterstuetzt Erweiterungen ueber `params.extensions`.

Verfuegbare Hooks:

- `onAfterReadTracks(ctx)`
- `onAfterRms(ctx)`
- `onAfterVad(ctx)`
- `onAfterSegments(ctx)`
- `onAfterResolveOverlaps(ctx)`
- `onFinalizeResult(ctx)`

Beispiel:

```json
{
  "extensions": [
    "./packages/analyzer/src/extensions/my_extension.js"
  ]
}
```

## Architektur und Migration

- Aktuelle Architektur: `docs/architecture.md`
- Naechste Migrationsphasen: `docs/migration_next_3_phases_todo.md`

## LLM Onboarding

- `CLAUDE.md`
- `docs/llm/README.md`
- `docs/llm/CODEBASE_MAP.md`
- `docs/llm/WORKFLOW_PLAYBOOK.md`
- `docs/llm/MIGRATION_GUARDRAILS.md`
- `docs/llm/DOMAIN_GLOSSARY.md`

## Installation in Premiere

- Windows: `Installieren.bat`
- macOS: `Installieren.command`

Manuell:

- Erweiterung nach `%APPDATA%/Adobe/CEP/extensions/AutoCast` (Windows) oder `~/Library/Application Support/Adobe/CEP/extensions/AutoCast` (macOS) kopieren.
- Premiere neu starten.

## Lizenz

MIT
