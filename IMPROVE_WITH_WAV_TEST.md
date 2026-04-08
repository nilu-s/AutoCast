# Improve with WAV Test Workflow - AUTONOMOUS

Ein **vollständig autonomer** REAL-WORLD Workflow für Code-Änderungen mit automatischem WAV-Test und WER-basierter Evaluation.

## 🎯 Features

### Vollständig Autonom
- ✅ **Keine User-Interaktion nötig** - Workflow läuft komplett selbstständig
- ✅ **Automatischer WAV-Test** - Nutzt `test_fixtures/reference.wav`
- ✅ **Automatische Evaluation** - Vergleicht mit `segments.json`
- ✅ **Automatische Entscheidung** - KEEP/REJECT basierend auf WER-Verbesserung

### Safety
- ✅ **segments.json ist Read-Only** - Ground Truth bleibt unverändert
- ✅ **Automatisches Backup** - Vor jeder Änderung
- ✅ **Rollback bei REJECT** - Automatisches Zurücksetzen bei schlechten Ergebnissen

## 🚀 Schnellstart

### Einzelner Run

```bash
cd /home/node/.openclaw/workspace/AutoCast
python3 improve_with_wav_test.py --method-id vad_threshold_tune
```

### Mit eigener Referenz-WAV

```bash
python3 improve_with_wav_test.py --method-id method_001 --reference-wav test_fixtures/sample.wav
```

## 📋 Workflow Schritte (alle autonom)

```
1. ✅ validate_method        - Validiert Methode
2. ✅ create_backup          - Erstellt Backup + prüft segments.json read-only
3. ✅ execute_code_change    - Wendet Code-Änderung an
4. 🎵 auto_test_with_reference_wav  - Führt Referenz-WAV durch AutoCast
5. 📊 auto_evaluate          - Vergleicht Output mit segments.json
6. 📈 auto_compare           - WER/CER vor/nach Vergleich
7. 🧠 auto_decide           - Entscheidet KEEP oder REJECT
8. 🔄 apply_or_rollback      - Wendet an oder rollt zurück
9. 💾 record_run            - Speichert Ergebnis
```

## 📊 Decision Logic

**KEEP** wenn:
```python
new_wer < baseline_wer - 0.01  # Mindestens 1% WER-Verbesserung
```

**REJECT** wenn:
- Keine signifikante Verbesserung (< 1%)
- WER verschlechtert sich

## 📁 Requirements

### Dateien
- `test_fixtures/reference.wav` - Referenz-Audiodatei für Tests
- `docs/segments.json` - Ground Truth (read-only)

### Verzeichnisstruktur
```
AutoCast/
├── improve_with_wav_test.py          # Haupt-Script
├── workflows/
│   └── improve_with_wav_test.json    # Workflow Definition
├── test_fixtures/
│   └── reference.wav                 # Referenz-WAV (benötigt)
└── docs/
    └── segments.json                 # Ground Truth (read-only)
```

## 🎵 Unterstützte Methoden

| Methode | Beschreibung | Dateien |
|---------|--------------|---------|
| `method_001` | Fine-tune Whisper | `src/model/training.py` |
| `method_002` | Add noise augmentation | `src/audio/augment.py` |
| `vad_threshold_tune` | VAD Threshold anpassen | `src/audio/vad.ts` |
| `noise_reduction` | Noise Reduction verbessern | `src/audio/processor.ts` |
| `segmentation_improve` | Segmentierungs-Logik verbessern | `src/audio/segmenter.ts` |

## 📈 Evaluation Metriken

Die autonome Evaluation berechnet:

- **WER** (Word Error Rate) - Primäre Metrik für Decision
- **CER** (Character Error Rate) - Sekundäre Metrik
- **Speech Detection Accuracy** - % korrekter Speech-Segmente
- **Boundary Accuracy** - Durchschnittliche Zeitabweichung (ms)
- **False Positive Rate** - % falsch erkannter Segmente

## 🔄 Ablauf

### Erfolgreicher Run (KEEP)
```
🚀 AUTONOMOUS Improve with WAV Test Workflow
   Method ID: vad_threshold_tune
   Reference WAV: test_fixtures/reference.wav

...

📈 Autonomous Evaluation Results:
   WER: 0.1800 (18.00%)
   CER: 0.1200 (12.00%)
   Speech Detection Accuracy: 85.5%

📊 WER Comparison:
   Baseline WER: 0.2300
   New WER: 0.1800
   Improvement: +0.0500

✅ Autonomous Decision: KEEP
   Reason: WER improved by 0.0500 (+21.74%) from 0.2300 to 0.1800

✅ AUTONOMOUS Workflow Completed
```

### Fehlgeschlagener Run (REJECT)
```
📊 WER Comparison:
   Baseline WER: 0.2300
   New WER: 0.2800
   Improvement: -0.0500

❌ Autonomous Decision: REJECT
   Reason: WER worsened by 0.0500 from 0.2300 to 0.2800

❌ REJECT: Rolling back changes...
```

## 🔧 Integration

Der Workflow integriert mit:
- ✅ ChromaDB (speichert Runs)
- ✅ Rollback-Mechanismus (Safety)
- ✅ segments.json (unveränderbare Ground Truth)
- ✅ AutoCast Processing (führt WAV-Dateien aus)

## 🧪 Testen

### Ohne Referenz-WAV (Simulation)
Wenn `test_fixtures/reference.wav` nicht existiert, läuft der Workflow im Simulations-Modus:

```bash
python3 improve_with_wav_test.py --method-id vad_threshold_tune
# Output: Reference WAV not found, using simulation...
```

### Mit echter Referenz-WAV
```bash
# Platziere deine WAV-Datei
cp /path/to/your/audio.wav test_fixtures/reference.wav

# Führe Workflow aus
python3 improve_with_wav_test.py --method-id method_001
```

## 📊 Beispiel-Ausgabe

```
🚀 AUTONOMOUS Improve with WAV Test Workflow
   Method ID: method_001
   Execution ID: a7b3c9d2
   Reference WAV: test_fixtures/reference.wav
   Segments.json: /home/node/.openclaw/workspace/AutoCast/docs/segments.json

============================================================
⏳ Step 1: validate_method
   Agent: agent_guardian | Skill: skill_validation_check
============================================================
   ✓ Method method_001 validated

...

============================================================
⏳ Step 4: auto_test_with_reference_wav
   Agent: agent_worker | Skill: skill_method_execution
============================================================
   🎵 Auto-testing with reference WAV...
   📁 Reference: test_fixtures/reference.wav
   ⚙️  Running: node scripts/process.js --input reference.wav --output /tmp/...

============================================================
⏳ Step 5: auto_evaluate
   Agent: agent_analyzer | Skill: skill_success_analysis
============================================================
   📊 Autonomous evaluation against segments.json...

   📈 Autonomous Evaluation Results:
      WER (Word Error Rate): 0.1800 (18.00%)
      CER (Character Error Rate): 0.1200 (12.00%)
      Speech Detection Accuracy: 85.5%
      Boundary Accuracy: 120.0ms
      False Positive Rate: 8.2%

============================================================
⏳ Step 7: auto_decide_keep_reject
   Agent: agent_selector | Skill: skill_strategy_evaluation
============================================================
   🧠 Autonomous decision making...

   📊 WER Comparison:
      Baseline WER: 0.2300 (23.00%)
      New WER: 0.1800 (18.00%)
      Improvement: +0.0500 (+21.74%)

   ✅ Autonomous Decision: KEEP
      Reason: WER improved by 0.0500 (+21.74%) from 0.2300 to 0.1800

============================================================
✅ AUTONOMOUS Workflow Completed
============================================================

📊 Summary:
   Method: method_001
   Duration: 4.23s
   Decision: KEEP

📈 WER Analysis:
   Baseline WER: 0.2300
   New WER: 0.1800
   Improvement: +0.0500

   Run ID: run_a7b3c9d2
```

## 🔐 Safety

### segments.json Protection
- File wird automatisch auf `read-only` (444) gesetzt
- Workflow bricht ab wenn schreibbar

### Backup & Rollback
- Backup wird vor jeder Änderung erstellt
- Bei REJECT oder Fehler: Automatisches Restore
- Backup wird nach erfolgreichem KEEP gelöscht

## 📚 Dateien

- `improve_with_wav_test.py` - Autonomes Haupt-Script
- `workflows/improve_with_wav_test.json` - Workflow Definition
- `docs/segments.json` - Ground Truth (read-only)
- `test_fixtures/reference.wav` - Referenz-Audio (benötigt)
