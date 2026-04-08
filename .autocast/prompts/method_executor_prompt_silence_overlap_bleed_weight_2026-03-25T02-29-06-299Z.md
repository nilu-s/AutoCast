# Method Executor Prompt Template

## Mission

**Führe EXAKT EINE Methode aus und entscheide: KEEP oder REJECT**

Du bist ein spezialisierter Sub-Agent für die Ausführung und Evaluation einer einzelnen Research-Methode. Deine Aufgabe ist es, die vorgegebene Methode zu implementieren, zu testen und objektiv zu bewerten. Du triffst eine binäre Entscheidung basierend auf quantitativen Metriken.

---

## Input Parameters

| Parameter | Wert |
|-----------|------|
| `methodId` | silence_overlap_bleed_weight |
| `methodTitle` | silence_overlap_bleed_weight |
| `promptFile` |  |
| `runId` | 20260325_021955 |
| `runDir` | /home/node/.openclaw/workspace/AutoCast |
| `resultPath` | .autocast/results/result_silence_overlap_bleed_weight_20260325_021955.json |
| `baselineMetrics` | {} |

---

## ⚠️ WARNINGS

> **ARBEITSVERZEICHNIS:** `/home/node/.openclaw/workspace/AutoCast`
>
> **DATEINAME MUSS EXAKT SEIN:** Alle Dateioperationen müssen mit exakten Pfaden arbeiten.

---

## STRICT WORKFLOW

### Phase 1: VOR der Änderung (Baseline)

**Schritt 1.1: Git Stash**
```bash
cd /home/node/.openclaw/workspace/AutoCast
git stash push -m "method-executor-silence_overlap_bleed_weight-before"
```

**Schritt 1.2: Baseline Evaluation**
- Führe die Baseline-Tests durch (falls definiert)
- Speichere die aktuellen Metriken als Referenz
- **Baseline Metrics:** `{}`

---

### Phase 2: Implementierung

**Schritt 2.1: Methode verstehen**
- Lese die Prompt-Datei: ``
- Analysiere die vorgeschlagene Methode
- Identifiziere notwendige Code-Änderungen

**Schritt 2.2: Implementierung durchführen**
- Implementiere die Methode gemäß Prompt
- Halte dich strikt an die Vorgabe
- Keine zusätzlichen Änderungen vornehmen

---

### Phase 3: Testing

**Schritt 3.1: Tests ausführen**
- Führe alle relevanten Tests durch
- Dokumentiere Test-Ergebnisse
- Bei Fehlern: Notiere den Fehler-Typ

**Schritt 3.2: Validierung**
- Stelle sicher, dass die Implementierung funktioniert
- Überprüfe auf offensichtliche Bugs

---

### Phase 4: Evaluation

**Schritt 4.1: Metriken sammeln**
- Führe Evaluations-Script aus (falls vorhanden)
- Sammle quantitative Metriken

**Schritt 4.2: Vergleich mit Baseline**
```
objectiveScore = berechneScore(currentMetrics)
baselineScore = berechneScore({})

if objectiveScore > baselineScore:
    DECISION = "KEEP"
else:
    DECISION = "REJECT"
```

---

## Entscheidungskriterium

| Bedingung | Entscheidung |
|-----------|--------------|
| `objectiveScore > baselineScore` | **KEEP** |
| `objectiveScore <= baselineScore` | **REJECT** |
| Tests schlagen fehl / Absturz | **FAILED** |

---

## Finalisierung

### Bei KEEP

```bash
# 1. Änderungen committen
cd /home/node/.openclaw/workspace/AutoCast
git add -A
git commit -m "[silence_overlap_bleed_weight] silence_overlap_bleed_weight - IMPROVEMENT"

# 2. Result-JSON schreiben
# Siehe Schema unten
```

### Bei REJECT

```bash
# 1. Änderungen verwerfen
cd /home/node/.openclaw/workspace/AutoCast
git checkout -- .
git stash pop  # Falls vorhanden

# 2. Result-JSON schreiben
# Siehe Schema unten
```

### Bei FAILED

```bash
# 1. Änderungen verwerfen (Cleanup)
cd /home/node/.openclaw/workspace/AutoCast
git checkout -- .
git stash pop  # Falls vorhanden

# 2. Result-JSON schreiben
# Siehe Schema unten
```

---

## Result-JSON Schema

Schreibe das Ergebnis in: `.autocast/results/result_silence_overlap_bleed_weight_20260325_021955.json`

```json
{
  "runId": "20260325_021955",
  "methodId": "silence_overlap_bleed_weight",
  "methodTitle": "silence_overlap_bleed_weight",
  "decision": "KEEP|REJECT|FAILED",
  "timestamp": "2026-03-25T02:30:00Z",
  "metrics": {
    "baseline": {},
    "current": {
      "objectiveScore": 0.0,
      "additionalMetrics": {}
    },
    "improvement": 0.0
  },
  "execution": {
    "duration": 0,
    "testsPassed": true,
    "error": null
  },
  "notes": "Optionale Notizen zur Entscheidung"
}
```

### Feld-Beschreibungen

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `runId` | string | Eindeutige Run-ID |
| `methodId` | string | ID der ausgeführten Methode |
| `methodTitle` | string | Titel der Methode |
| `decision` | enum | KEEP, REJECT, oder FAILED |
| `timestamp` | ISO8601 | Zeitstempel der Fertigstellung |
| `metrics.baseline` | object | Baseline-Metriken |
| `metrics.current` | object | Aktuelle Metriken nach Implementierung |
| `metrics.improvement` | float | Differenz current - baseline |
| `execution.duration` | int | Dauer in Sekunden |
| `execution.testsPassed` | boolean | True wenn alle Tests bestanden |
| `execution.error` | string | Fehlermeldung bei FAILED, sonst null |
| `notes` | string | Optionale Erläuterungen |

---

## Output Location

**Result-Datei:** `.autocast/results/result_silence_overlap_bleed_weight_20260325_021955.json`

---

## Constraints

1. **EXAKT EINE Methode** - Führe nur die angegebene Methode aus
2. **Keine Seiteneffekte** - Ändere nichts außerhalb des Workflows
3. **Quantitative Entscheidung** - Die Entscheidung MUSS auf Metriken basieren
4. **Cleanup bei REJECT/FAILED** - Arbeitsverzeichnis muss sauber hinterlassen werden
5. **JSON valide** - Das Result-JSON muss valides JSON sein
