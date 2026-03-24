# LLM Documentation Hub

Zentraler Einstieg fuer LLM-Assistenten in diesem Repository.

## Zweck

Diese Unterlagen helfen bei drei Fragen:
- Wo liegt welche Verantwortung?
- Welche Dateien werden fuer Aufgabe X angepasst?
- Welche Invarianten und Qualitaetsregeln duerfen nicht gebrochen werden?

## Empfohlene Lesereihenfolge

1. `CLAUDE.md`
2. `docs/architecture.md`
3. `docs/llm/CODEBASE_MAP.md`
4. `docs/llm/WORKFLOW_PLAYBOOK.md`
5. `docs/llm/GUARDRAILS.md`
6. `docs/llm/DOMAIN_GLOSSARY.md`
7. `docs/llm/AGENT_SYSTEM.md`
8. `docs/llm/autoresearch/README.md` (wenn kontinuierliche Agentenoptimierung genutzt wird)

## Arbeitsmodus fuer Assistenten

- Immer zuerst den betroffenen Einstiegspfad identifizieren (Panel, Analyzer, Contracts).
- Nur die fuer die Aufgabe relevanten Dateien anfassen.
- Bei Struktur- oder Refactor-Aenderungen die Guardrails strikt einhalten.
- Legacy aktiv abbauen: neuer Zielansatz wird der echte Runtime-Pfad.
- Vor Abschluss immer die Repo-Checks ausfuehren.

## Legacy-Policy (hart)

- Standardannahme: der neue Ansatz ersetzt den alten Ansatz.
- Kein Hybridbetrieb ohne belegbaren Zwang.
- Nicht zulaessig ohne konkreten Grund:
  - Dual-Paths (alt + neu) im produktiven Pfad
  - "just in case"-Fallbacks, Adapter oder Kompatibilitaetsschichten
  - neue APIs, die intern weiter die Altlogik treiben
- Altlogik darf nur bleiben, wenn mindestens ein konkreter Grund vorliegt:
  - aktiv genutzte externe Schnittstelle
  - echte interne Abhaengigkeit
  - explizit geforderte Rueckwaertskompatibilitaet
- Bei Zielkonflikt gilt: schlankere und klarere Architektur vor Kompatibilitaetsvorsicht,
  solange kein belegter Zwang dagegen spricht.
- Pflicht pro relevanter Aenderung:
  - alte Komplexitaet reduzieren
  - Sonderfaelle reduzieren
  - Altlogik ersetzen statt umschichten

## Test-Governance (verbindlich)

- Tests ko-lokal halten:
  - Panel-Tests unter `apps/panel/src/**/tests/*.test.js`
  - Analyzer-Tests unter `packages/analyzer/src/**/tests/*.test.js`
- Jede Testdatei hat genau einen klaren Fokus (ein Modul/Thema, kein Sammeltest).
- Groesse begrenzen:
  - Soft-Limit: 150 Zeilen
  - Hard-Limit: 220 Zeilen (Ausnahme nur mit kurzer Begruendung im PR/Commit-Text)
- Neue oder verschobene Tests muessen im passenden `suite_manifest.js` registriert werden.
- Wiederverwendbare Fixtures/Generatoren in `packages/analyzer/src/tests/helpers/*` auslagern.

## Abschluss-Check

```bash
npm run check
```

`npm run check` umfasst Syntax-, Struktur-, Architektur-, LLM-Requirements- und Test-Checks.

## Autoresearch

Fuer cronjob-basierte, agentische Optimierungszyklen:

- `docs/llm/AGENT_SYSTEM.md`
- `docs/llm/autoresearch/README.md`
- `docs/llm/autoresearch/PROGRAM_AUTORESEARCH.md`
