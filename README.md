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
- `packages/analyzer/src/**/tests`: ko-lokale Analyzer-Tests (Runner-Manifeste unter `packages/analyzer/test/*`)

## Entwicklung

```bash
npm run check:llm
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

## Architektur und Betrieb

- Aktuelle Architektur: `docs/architecture.md`
- Workflow-Playbook: `docs/llm/WORKFLOW_PLAYBOOK.md`
- Engineering-Guardrails: `docs/llm/GUARDRAILS.md`

## LLM Onboarding

- `CLAUDE.md`
- `docs/llm/README.md`
- `docs/llm/CODEBASE_MAP.md`
- `docs/llm/WORKFLOW_PLAYBOOK.md`
- `docs/llm/GUARDRAILS.md`
- `docs/llm/DOMAIN_GLOSSARY.md`

## Installation in Premiere

- Windows: `Installieren.bat`
- macOS: `Installieren.command`

Manuell:

- Erweiterung nach `%APPDATA%/Adobe/CEP/extensions/AutoCast` (Windows) oder `~/Library/Application Support/Adobe/CEP/extensions/AutoCast` (macOS) kopieren.
- Premiere neu starten.

## AutoResearch

AutoCast enthält ein vollständig automatisiertes Research-System für kontinuierliche Pipeline-Optimierung.

### Quick Start

```bash
# Cron-Jobs aktivieren
node scripts/autoresearch/setup_orchestrator_cron.js --enable
node scripts/autoresearch/setup_dispatch_cron.js --enable

# Status prüfen
node scripts/autoresearch/setup_dispatch_cron.js --status
```

### Dokumentation

- **[QUICKSTART.md](./QUICKSTART.md)** - In 5 Minuten loslegen
- **[PROJECT_COMPLETION_REPORT.md](./PROJECT_COMPLETION_REPORT.md)** - Vollständiger Abschluss-Bericht
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Produktions-Deployment
- **[MAINTENANCE.md](./MAINTENANCE.md)** - Wartung und Monitoring

### Architektur

```
Orchestrator (stündlich) → Dispatch (alle 15min) → Method Execution → Aggregation
```

Ergebnisse in `reports/autoresearch/runs/latest/CYCLE_REPORT.md`

## Lizenz

MIT
