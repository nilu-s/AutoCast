# LLM Documentation Hub

Zentraler Einstieg fuer LLM-Assistenten in diesem Repository.

## Zweck

Diese Unterlagen helfen bei drei Fragen:
- Wo liegt welche Verantwortung?
- Welche Dateien werden fuer Aufgabe X angepasst?
- Welche Invarianten duerfen waehrend der Migration nicht gebrochen werden?

## Empfohlene Lesereihenfolge

1. `CLAUDE.md`
2. `docs/architecture.md`
3. `docs/llm/CODEBASE_MAP.md`
4. `docs/llm/WORKFLOW_PLAYBOOK.md`
5. `docs/llm/MIGRATION_GUARDRAILS.md`
6. `docs/llm/DOMAIN_GLOSSARY.md`

## Arbeitsmodus fuer Assistenten

- Immer zuerst den betroffenen Einstiegspfad identifizieren (Panel, Analyzer, Contracts).
- Nur die fuer die Aufgabe relevanten Dateien anfassen.
- Bei Struktur- oder Split-Aenderungen die Guardrails strikt einhalten.
- Vor Abschluss immer die Repo-Checks ausfuehren.

## Abschluss-Check

```bash
npm run check
```

`npm run check` umfasst Syntax-, Struktur- und Test-Checks.
