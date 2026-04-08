# L4 Strategy Optimization System

Selbstoptimierendes Strategie-System für AutoCast - Agenten lernen, welche Workflows/Methoden am besten funktionieren und optimieren sich selbst.

## Features

### 1. Strategies Collection
- **7 Strategie-Typen**: Exploration, Exploitation, Balanced, Adaptive, Contextual, Bayesian
- **ε-greedy Parameter**: Einstellbare Epsilon-Werte für Exploration vs Exploitation
- **Performance Tracking**: success_rate, avg_improvement, total_runs
- **Auto-Optimierung**: Parameter werden automatisch basierend auf Performance angepasst

### 2. Workflow "optimize_strategy"
4-Schritte Workflow zur kontinuierlichen Strategie-Optimierung:

**Step 1: agent_analyzer**
- Skill: `skill_success_analysis`
- Action: `analyze_strategy_performance`
- Analysiert historische Performance aller Strategien
- Output: `strategy_performance_report`

**Step 2: agent_selector**  
- Skill: `skill_strategy_evaluation`
- Action: `evaluate_exploration_exploitation`
- Vergleicht Exploration vs Exploitation Erfolg
- Empfehlung: Mehr Exploration? Mehr Exploitation? Oder Balance?
- Output: `recommendation`

**Step 3: agent_hyperparameter_tuner**
- Skill: `skill_hyperparameter_tuning`  
- Action: `tune_epsilon_greedy`
- Passt ε an: z.B. ε=0.2 → ε=0.15 (mehr Exploitation wenn erfolgreich)
- Output: `new_epsilon_value`

**Step 4: agent_selector**
- Skill: `skill_strategy_evaluation`
- Action: `select_optimal_workflow`
- Entscheidet: evaluate → apply? Oder evaluate → generate → apply?
- Output: `recommended_sequence`

### 3. Auto-Optimierungs-Loop
- **Nach jedem Run**: `analyze_performance()`
- **Nach 5 Runs**: `optimize_strategy()`
- **Strategie wird besser über Zeit** - selbstlernend

### 4. Reduced Human-in-the-Loop (L4)
- **L3**: "Go" erforderlich für jeden Workflow
- **L4**: System sagt "Ich werde X tun, stoppe mich wenn nein"
- Du bekommst nur noch Reports, kein "Go" nötig
- Auto-proceed nach 10 Sekunden, außer Stop-Signal

## Dateien

| Datei | Beschreibung |
|-------|--------------|
| `create_strategies_collection.py` | Erstellt die strategies Collection |
| `optimize_strategy.py` | Einmalige Strategie-Optimierung |
| `auto_optimization_loop.py` | Kontinuierlicher Optimierungs-Loop |
| `workflows/optimize_strategy_workflow.json` | Workflow-Definition |
| `strategies_data/strategies.json` | Strategies Collection (JSON) |
| `strategies_data/best_strategy.json` | Aktuell beste Strategie |
| `strategies_data/workflow_results/` | Workflow Ergebnisse |

## Verwendung

### Einmalige Optimierung
```bash
python optimize_strategy.py
```

Mit Initialisierung:
```bash
python optimize_strategy.py --init --save
```

### Kontinuierlicher Loop
```bash
# Einzelne Iteration
python auto_optimization_loop.py --once

# Status Report
python auto_optimization_loop.py --report

# Sofortige Optimierung erzwingen
python auto_optimization_loop.py --force-optimize

# Kontinuierlich laufen lassen
python auto_optimization_loop.py
```

## Strategie-Typen

### Exploration (ε=0.3)
- **epsilon_greedy_aggressive**: Hohe Exploration für neue Methoden
- Mehr Zufall, mehr Entdeckung

### Exploitation (ε=0.1)  
- **epsilon_greedy_conservative**: Geringe Exploration, bekannte Methoden nutzen
- Weniger Zufall, mehr Bestätigung

### Balanced (ε=0.2)
- **epsilon_greedy_balanced**: Ausgewogenes Verhältnis
- Standard für steady improvement

### Adaptive
- **ucb_bandit**: Upper Confidence Bound mit Konfidenzintervallen
- **softmax_selection**: Wahrscheinlichkeitsbasierte Auswahl

### Contextual
- **contextual_bandit**: Kontext-basierte Auswahl (Audio-Features)

### Bayesian
- **thompson_sampling**: Bayesian Ansatz mit Beta-Verteilung

## Performance Metriken

Jede Strategy tracked:
- `total_runs`: Gesamtläufe
- `successful_runs`: Erfolgreiche Läufe
- `success_rate`: Erfolgsquote
- `avg_improvement`: Durchschnittliche Verbesserung
- `best_improvement`: Beste Verbesserung
- `last_used`: Letzte Verwendung

## Auto-Optimierung

Das System passt automatisch an:
1. **Wenn Exploration erfolgreich** → ε erhöhen
2. **Wenn Exploitation erfolgreich** → ε verringern
3. **Wenn Performance gleich** → ε beibehalten
4. **Nach 5 Runs** → Automatische Optimierung

## Integration

Das L4 System integriert sich mit:
- **L1-L3**: Nutzt bestehende Learning Database
- **Orchestrator**: Kann vom Scheduler getriggert werden
- **ChromaDB**: Für strategie-basierte Suche
- **Agents**: Nutzt existierende Agent-Definitionen

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                     L4 Strategy Layer                        │
├─────────────────────────────────────────────────────────────┤
│  strategies Collection (7 Strategien)                       │
│  ├── Exploration: ε=0.3 (aggressive)                      │
│  ├── Exploitation: ε=0.1 (conservative)                     │
│  ├── Balanced: ε=0.2 (default)                            │
│  ├── Adaptive: UCB, Softmax                               │
│  ├── Contextual: Bandit mit Audio-Features                │
│  └── Bayesian: Thompson Sampling                          │
├─────────────────────────────────────────────────────────────┤
│  optimize_strategy Workflow                                 │
│  Step 1: Analyze Performance                                │
│  Step 2: Evaluate Exploration vs Exploitation               │
│  Step 3: Tune Epsilon-Greedy                               │
│  Step 4: Select Optimal Sequence                             │
├─────────────────────────────────────────────────────────────┤
│  Auto-Optimization Loop                                     │
│  ├── After every run: analyze_performance()               │
│  ├── After 5 runs: optimize_strategy()                      │
│  └── Reduced Human-in-the-Loop                              │
└─────────────────────────────────────────────────────────────┘
```

## Outputs

- ✅ strategies Collection mit Performance-Daten
- ✅ Workflow "optimize_strategy" 
- ✅ auto_optimization_loop.py
- ✅ Weniger Human-in-the-Loop
