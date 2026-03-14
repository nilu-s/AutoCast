# CLAUDE.md

Dieses Repository ist fuer Assistenzsysteme optimiert. Diese Datei ist der Startpunkt.

## Mission

AutoCast ist ein CEP-Plugin fuer Adobe Premiere Pro:
- Mehrspur-Audio analysieren
- relevante Sprechsegmente erkennen
- daraus Schnittbereiche (cut-only) fuer die Timeline erzeugen

## Schnellstart (LLM)

1. Lies `docs/llm/README.md`.
2. Lies `docs/architecture.md` fuer Architekturueberblick.
3. Lies `docs/llm/CODEBASE_MAP.md` fuer Dateieinstieg.
4. Fuehre vor Abschluss immer `npm run check` aus.

## Harte Invarianten

- Keine unbeabsichtigte Verhaltensaenderung waehrend Migrations-Splits.
- Panel greift Analyzer nur ueber Adapter/API an.
- Runtime-Entry-Points muessen stabil bleiben:
  - `apps/panel/js/main.js`
  - `packages/analyzer/src/analyzer.js`
- Struktur-, Syntax- und Test-Gates muessen gruen bleiben:
  - `npm run check`

## Wo anfangen bei typischen Aufgaben

- UI/Flow im Panel: `apps/panel/js/main.js` + `apps/panel/src/app/*`
- Feature-Logik Panel: `apps/panel/src/features/*`
- Analyzer-Pipeline: `packages/analyzer/src/core/pipeline/*`
- Analyzer-Module: `packages/analyzer/src/modules/*`
- Postprocess-Fassade: `packages/analyzer/src/modules/postprocess/analyzer_postprocess.js`
- Postprocess Gap-Passes: `packages/analyzer/src/modules/postprocess/postprocess_gap_passes.js`
- Postprocess Continuity-Passes: `packages/analyzer/src/modules/postprocess/postprocess_continuity_passes.js`
- Postprocess Prune-Passes: `packages/analyzer/src/modules/postprocess/postprocess_prune_passes.js`
- Postprocess Shared Utils: `packages/analyzer/src/modules/postprocess/postprocess_shared_utils.js`
- Vertraege/Validierung: `apps/panel/src/core/contracts/*`, `packages/analyzer/src/core/contracts/*`

## Qualitaets-Checkliste

- Code geaendert -> `npm run check`
- Neue Strukturdateien -> `scripts/check_structure.js` ggf. erweitern
- API/Payloads geaendert -> Contract-Validierung und Tests aktualisieren
- Neue Testdatei -> in passendes `suite_manifest.js` einhaengen

## Weitere LLM-Dokumente

- `docs/llm/README.md`
- `docs/llm/CODEBASE_MAP.md`
- `docs/llm/WORKFLOW_PLAYBOOK.md`
- `docs/llm/MIGRATION_GUARDRAILS.md`
- `docs/llm/DOMAIN_GLOSSARY.md`
