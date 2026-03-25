# Method Executor Task

## Parameters
- **Method ID**: silence_overlap_bleed_weight
- **Method Title**: Increase overlap/bleed suppression weighting
- **Run ID**: 20260325_021955
- **Result Path**: reports/autoresearch/runs/20260325_021955/method_results/silence_overlap_bleed_weight_result.json
- **Status Path**: reports/autoresearch/runs/20260325_021955/STATUS.json

## Instructions

# AutoCast Method Executor

## Deine Mission
Führe EXAKT EINE Methode aus und entscheide: KEEP oder REJECT.

## Input Parameter
- methodId: silence_overlap_bleed_weight
- methodTitle: Increase overlap/bleed suppression weighting
- promptFile: reports/autoresearch/runs/20260325_021955/1_silence-pruner_method_1_silence_overlap_bleed_weight.md
- runId: 20260325_021955
- runDir: reports/autoresearch/runs/20260325_021955
- resultPath: reports/autoresearch/runs/20260325_021955/method_results/silence_overlap_bleed_weight_result.json
- baselineMetrics: {}

## STRICT WORKFLOW

### VOR der Änderung (MANDATORY)
1. `git stash push -m "pre-silence_overlap_bleed_weight"`
2. Speichere baseline: `node scripts/evaluate_pipeline.js`
3. Lese objectiveScore aus evaluate_output.txt
4. Speichere in Variable: baselineScore

### Nach der Änderung
5. Lese Method-Brief aus reports/autoresearch/runs/20260325_021955/1_silence-pruner_method_1_silence_overlap_bleed_weight.md
6. Implementiere die Methode (Code-Änderung)
7. `npm run check` → MUSS bestehen (115/115 Tests)
8. `node scripts/evaluate_pipeline.js`
9. Lese neuen objectiveScore aus evaluate_output.txt

### Entscheidung
- objectiveScore > baselineScore: KEEP
- objectiveScore <= baselineScore: REJECT

### Bei KEEP
- `git add .`
- `git commit -m "experiment: silence_overlap_bleed_weight - Score {baseline}-{new} ({delta}%)"`
- Schreibe Result-JSON nach reports/autoresearch/runs/20260325_021955/method_results/silence_overlap_bleed_weight_result.json
- Aktualisiere STATUS.json auf COMPLETED + KEEP

### Bei REJECT
- `git checkout -- .`
- `git stash pop`
- Schreibe Result-JSON nach reports/autoresearch/runs/20260325_021955/method_results/silence_overlap_bleed_weight_result.json mit decision: REJECT
- Aktualisiere STATUS.json auf COMPLETED + REJECT

### Bei FAILED (Tests fehlgeschlagen oder Error)
- `git checkout -- .`
- `git stash pop`
- Schreibe Result-JSON nach reports/autoresearch/runs/20260325_021955/method_results/silence_overlap_bleed_weight_result.json mit decision: FAILED
- Aktualisiere STATUS.json auf FAILED

## Result-JSON Schema (STRICT)
```json
{
  "schemaVersion": "1.0.0",
  "methodId": "silence_overlap_bleed_weight",
  "runId": "20260325_021955",
  "status": "completed",
  "decision": "KEEP|REJECT|FAILED",
  "timestamp": "ISO-8601",
  "metrics": {
    "before": { "objectiveScore": baseline, ... },
    "after": { "objectiveScore": new, ... }
  },
  "changedFiles": [...],
  "git": { "commitHash": "...", "commitMessage": "..." },
  "notes": "..."
}
```

## WICHTIG
- Datei MUSS exakt heißen: silence_overlap_bleed_weight_result.json
- Keine Abweichungen vom Schema
- Bei Unsicherheit: REJECT
- Arbeitsverzeichnis: /home/node/.openclaw/workspace/AutoCast


## Output Requirements

1. Führe den STRICT WORKFLOW aus
2. Schreibe das Result-JSON nach: reports/autoresearch/runs/20260325_021955/method_results/silence_overlap_bleed_weight_result.json
3. Aktualisiere STATUS.json: reports/autoresearch/runs/20260325_021955/STATUS.json

## Result Schema

Das Result-JSON muss exakt diesem Schema folgen:

```json
{
  "schemaVersion": "1.0.0",
  "methodId": "silence_overlap_bleed_weight",
  "runId": "20260325_021955",
  "status": "completed",
  "decision": "KEEP|REJECT|FAILED",
  "timestamp": "ISO-8601",
  "metrics": {
    "before": { "objectiveScore": number, ... },
    "after": { "objectiveScore": number, ... }
  },
  "changedFiles": [...],
  "git": { "commitHash": "...", "commitMessage": "..." },
  "notes": "..."
}
```
