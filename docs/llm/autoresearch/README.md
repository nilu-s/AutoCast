# AutoCast Autoresearch

Diese Dokumente legen ein kontinuierliches LLM-Agenten-System fest, das
`docs/segments.json` als Source-of-Truth verwendet und die Trefferquote
sowie die Segmentdauer-Approximation automatisiert verbessert.

## Ziel

- Wiederholbare, cronjob-basierte Verbesserungszyklen.
- Klare Orchestrierung mit Subagenten.
- Harte Validierung gegen:
  - Recall (`speech`, `review`, `ignore`)
  - Segmentdauer-Qualitaet (`good`, `near`, `poor`)
  - Gesamtziel `objectiveScore`.

## Komponenten

- Orchestrator:
  - `scripts/autoresearch/orchestrator.js`
  - fuehrt Evaluation aus
  - entscheidet Prioritaeten
  - erstellt delegierbare Task- und Methoden-Briefs pro Agent
  - optional: dispatch an externen Agent-CLI-Command
- Runtime-Konfiguration:
  - `docs/llm/autoresearch/runtime/config.json`
  - `docs/llm/autoresearch/runtime/method_catalog.json`
- Evaluator:
  - `scripts/evaluate_pipeline.js`
  - erzeugt:
    - `evaluate_output.txt`
    - `reports/autoresearch/last_eval.json`
- Agenten-Playbooks:
  - `docs/llm/autoresearch/PROGRAM_AUTORESEARCH.md`
  - `docs/llm/autoresearch/agents/*.md`
- Scheduling:
  - Trigger-Modell: OpenClaw Prompt-First (`openclaw run --prompt-file ...`)

## Segmentdauer-Qualitaet

Neben Frame-Recall wird die Segmentdauer bewertet (nur `speech` + `review`):

- `good`:
  - Coverage >= 0.80
  - relative Dauerabweichung <= 0.20
- `near`:
  - Coverage >= 0.60
  - relative Dauerabweichung <= 0.40
- `poor`:
  - alles darunter

Metrik fuer Optimierung:
- `durationGoodOrNearRatio = (good + near) / total`

## Objective Score

Der Orchestrator priorisiert nach:

```text
objective =
  0.45 * speechRecall +
  0.20 * reviewRecall +
  0.20 * ignoreRecall +
  0.15 * durationGoodOrNearRatio
```

## Autoresearch Integration

Das Referenz-Repo wurde nach `tools/autoresearch` geklont.

Der empfohlene Arbeitsmodus:
1. Orchestrator-Lauf ausfuehren.
2. Methoden-Briefs in `reports/autoresearch/tasks/` von Agenten bearbeiten lassen.
3. Agenten sollen echte Codepatches liefern (mehrere Methoden pro Task ausprobieren).
4. Jede Agent-Aenderung muss mit `npm run check` + `node scripts/evaluate_pipeline.js`
   validiert werden.
5. Nur Verbesserungen mit stabilem/hoeherem Objective uebernehmen.

## OpenClaw Cron Mode

Wenn Scheduling via OpenClaw laufen soll, startet Cron nur den Prompt:

- Prompt:
  - `docs/llm/autoresearch/runtime/openclaw_cron_prompt.md`
- Cron/Task Scheduler startet z. B.:
  - `openclaw run --cwd <repo> --prompt-file docs/llm/autoresearch/runtime/openclaw_cron_prompt.md`

Damit ist der Trigger minimal, und der Prompt steuert den gesamten Ablauf automatisch.
