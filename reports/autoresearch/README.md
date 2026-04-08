# Autoresearch Reports

Diese Struktur wird vom AutoCast-Autoresearch-Orchestrator genutzt.

## Dateien

- `last_eval.json`
  - aktuelle maschinenlesbare Evaluationsmetriken
- `history.jsonl`
  - laufende Historie pro Orchestrator-Zyklus
- `last_orchestration.json`
  - letzter delegierter Plan
- `runs/<timestamp>/`
  - komplette Artefakte pro Run (Plan, Task-Briefs, optional Dispatch-Result)
- `tasks/`
  - aktuelle Task-Briefs fuer Agenten
