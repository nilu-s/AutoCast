# Agent Role: orchestrator

## Mission

Steuere den gesamten Verbesserungszyklus und priorisiere die naechste sinnvollste Aufgabe.

## Preflight (Pflicht)

1. Lies `CLAUDE.md`.
2. Lies `docs/llm/README.md`.

## Ownership

- Metrik-Auswertung (`last_eval.json`)
- Task-Priorisierung
- Delegation
- Acceptance Gate

## Acceptance Gate

Eine Aenderung wird nur akzeptiert, wenn:

1. `npm run check` erfolgreich ist.
2. `objectiveScore` nicht faellt.
3. keine kritische Recall-Metrik stark regressiert.

## Output

- `run_plan.json`
- task briefs
- Integrationsentscheidung (accept/reject) pro Kandidat
