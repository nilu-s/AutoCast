# AutoCast Masterplan: Agenten-basiertes Selbstoptimierendes System

**Vision:** Vollständig autonomes System für kontinuierliche Audio-Processing-Optimierung  
**Start:** Human-in-the-Loop (Du gibst den Takt)  
**Ziel:** Vollständige Autonomie (L5)

---

## Aktueller Stand (L2: Functionally COMPLETE)

### ChromaDB Collections (8)
| Collection | Einträge | Zweck |
|------------|----------|-------|
| `agents` | 6 | Worker, Analyzer, Selector, Generator, Guardian, Orchestrator |
| `skills` | 22 | Mit Constraints Level 0-4 |
| `constraints` | 30 | Zeit, Dateisystem, Ressourcen, Qualität, Sicherheit |
| `tasks` | 1 | Vorlage/Beispiel |
| `methods` | 10 | Demo-Methoden mit Success Rates |
| `runs` | 5 | Demo-Runs mit Metriken |
| `evaluations` | 8 | Demo-WER/CER Evaluationen |
| `metrics` | 10 | Targets, Referenzwerte |

### Workflows (2)
| Workflow | Steps | Zweck |
|----------|-------|-------|
| `evaluate_current_state` | 4 | Analysiert aktuellen Stand, empfiehlt Methoden |
| `apply_method` | 6 | Wendet Methode an, validiert, speichert Run |

### Human-in-the-Loop (Proof of Concept)
```
Du: "Starte Workflow evaluate_current_state"
   → Orchestrator managed Queue
   → Agenten führen aus
   → Report: "WER 0.23 → 0.18 möglich mit Fine-tune"
   
Du: "Go" / "Nein"
   → Bei Go: Workflow apply_method startet
   → Methode wird (simuliert) ausgeführt
   → Ergebnis gespeichert
```

### Produktions-TODOs (Post-POC)
- [ ] Orchestrator als Daemon (dauerhaft laufend)
- [ ] Echte AutoCast Integration (Audio-Dateien, echte Metriken)
- [ ] Human-in-the-Loop UI (nicht nur CLI)

### Physische Dateien (3)
```
AutoCast/
├── CLAUDE.md                           # Projekt-Regeln
├── docs/
│   ├── architecture.md                 # AutoCast Plugin Architektur
│   └── CHROMADB_SEMANTIC_RULES.md      # ChromaDB Constraints
├── chroma_data/                        # ChromaDB persist_dir
└── ...
```

---

## Roadmap: L1 → L5

### 🟢 L1: Foundation ✅ (COMPLETE)
**Ziel:** Agenten-Architektur steht, Human-in-the-Loop

**Was läuft:**
- ✅ 6 Agenten definiert
- ✅ 22 Skills mit Constraints
- ✅ 30 globale Constraints
- ✅ Docker-Style ChromaDB Setup

**Human-in-the-Loop:**
- Du startet Workflows manuell
- Du reviewt Ergebnisse
- Du gibst "Go" für Changes

---

### 🟡 L2: AutoResearch Domain ✅ (FUNCTIONALLY COMPLETE)
**Ziel:** Proof-of-Concept für Agenten-basierte Workflows

**Was läuft:**
- ✅ 8 Collections (agents, skills, constraints, methods, runs, evaluations, metrics, tasks)
- ✅ 2 Workflows: evaluate_current_state, apply_method
- ✅ Python Orchestrator: Queue, Scheduler, Dispatcher
- ✅ Demo-Test erfolgreich: "WER 0.23 → 0.18"

**Proof-of-Concept funktioniert:**
```
Du: "Starte evaluate_current_state"
   → Report: "Gap: 0.03 WER, Methode A verbessert 5-8%"
   
Du: "Go"
   → apply_method startet
   → Ergebnis: WER 0.23 → 0.18
```

**Post-POC TODOs:**
- [ ] Orchestrator als Daemon
- [ ] Echte AutoCast Integration
- [ ] UI statt CLI

---

### 🟠 L3: Proactive Generation
**Ziel:** Agenten schlagen eigene Ideen vor

**Neue Skills:**
- `skill_hypothesis_generator` - Vorschläge generieren
- `skill_embedding_mutation` - Neue Methoden-Varianten

**Workflow:**
```
"Generate Improvements"
├── agent_analyzer: Findet Muster in Daten
├── agent_generator: Erstellt 3 Vorschläge
└── Output: "Ich schlage vor: A, B, C"
```

**Human-in-the-Loop:**
- System: "Ich habe 3 Ideen gefunden"
- Du: "Teste Idee A" → Workflow läuft

---

### 🔴 L4: Strategy Optimization
**Ziel:** Agenten optimieren ihre eigene Strategie

**Neue Agenten:**
- `agent_strategy_optimizer` - Wählt beste Strategie
- `agent_hyperparameter_tuner` - Tuned ε-greedy, etc.

**Automatisierung:**
- Agenten entscheiden: Exploration vs Exploitation
- Du bekommst nur noch Reports, kein "Go" nötig

---

### 🟣 L5: Full Autonomy
**Ziel:** Komplett autonomer Betrieb

**Funktion:**
```
Endlosschleife:
  1. Evaluieren (agent_analyzer)
  2. Vorschlagen (agent_generator)
  3. Ausführen (agent_worker)
  4. Validieren (agent_guardian)
  5. Repeat
```

**Human-in-the-Loop:**
- Nur noch Monitoring
- Eingriff bei Fehlern
- Strategische Richtung vorgeben

---

## Kommunikationsfluss

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│   DU        │────▶│  OpenClaw (Mawly)   │────▶│  Python     │
│ (Taktgeber) │◀────│  (Orchestration)    │◀────│ Orchestrator│
└─────────────┘     └─────────────────────┘     └──────┬──────┘
        │                                              │
        │                                              │
        │        ┌──────────────────┐                  │
        │        │   ChromaDB       │◀─────────────────┘
        │        │   (State/Knowledge)│
        │        └──────────────────┘
        │
        │        "Starte Workflow X"
        │──────────────────────────────────────────────────▶
        │
        │        "Ergebnis: Y"
        │◀──────────────────────────────────────────────────
```

---

## Nächste Schritte (Priorität)

### Sofort (heute)
1. **L2 Collections erstellen** (methods, runs, evaluations)
2. **Ersten Workflow definieren** ("Evaluate Current State")
3. **Test-Run** (manuell, Human-in-the-Loop)

### Kurzfristig (diese Woche)
4. **Queue-System** (SQLite/Redis für Tasks)
5. **Python Orchestrator** (dauerhaft laufend)
6. **Scheduler** (Parallelisierung)

### Mittelfristig (nächste Wochen)
7. **L3: Proactive Generation**
8. **Auto-Report an Dich** (täglich/wöchentlich)

### Langfristig (Monate)
9. **L4: Strategy Optimization**
10. **L5: Full Autonomy**

---

## Constraints (immer aktiv)

- 🔴 `max_task_duration`: 3h
- 🔴 `forbidden_golden`: Nie ändern
- 🟡 `max_files_per_change`: 5
- 🟢 `tests_must_pass`: npm run check

---

**Version:** 1.0 - Agenten-basiert  
**Letzte Aktualisierung:** 2026-03-25  
**Phase:** L1 Complete → L2 Starting
