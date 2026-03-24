# LLM Agent System (Unified)

Dieses Dokument verbindet den normalen LLM-Entwicklungsworkflow mit dem
cronjob-basierten Autoresearch-Loop.

## Ebenen

1. **Core LLM Workflow**
   - `docs/llm/README.md`
   - `docs/llm/WORKFLOW_PLAYBOOK.md`
   - `docs/llm/GUARDRAILS.md`
2. **Autoresearch Layer**
   - `docs/llm/autoresearch/README.md`
   - `docs/llm/autoresearch/PROGRAM_AUTORESEARCH.md`
   - `docs/llm/autoresearch/runtime/*`

## Prinzip

- Nicht nur Metriken lesen, sondern aktiv Code anpassen.
- Pro Task mehrere Methoden testen (Hypothesen -> Patch -> Check -> Eval).
- Nur objektiv bessere oder stabile Ergebnisse uebernehmen.

## Zyklus

1. Baseline evaluieren (`scripts/evaluate_pipeline.js`).
2. Orchestrator priorisiert naechste Aufgabe.
3. Subagenten bearbeiten Methoden-Briefs mit echten Codeaenderungen.
4. Validator entscheidet accept/reject anhand Metriken + Checks.
5. Scheduler startet den naechsten Zyklus.

## Scheduler-Modell

- Empfohlen: OpenClaw Prompt-First.
- Cron/Task Scheduler startet nur:
  - `openclaw run --prompt-file docs/llm/autoresearch/runtime/openclaw_cron_prompt.md`
- Der Prompt fuehrt den Rest automatisch aus (Orchestrierung, Methodentests, Validation).

## Acceptance

Pflicht pro akzeptiertem Kandidaten:

1. `npm run check` erfolgreich.
2. Keine harte Guardrail-Verletzung.
3. `objectiveScore` nicht schlechter.
4. Metrik-Tradeoffs klar dokumentiert.
