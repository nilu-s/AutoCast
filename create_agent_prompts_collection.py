#!/usr/bin/env python3
"""Create agents collection in ChromaDB with full prompt templates."""

import sys
import json
from datetime import datetime
from pathlib import Path

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB


def create_agents_collection():
    """Create agents collection with full prompt templates."""
    
    # Initialize ChromaDB
    persist_dir = str(workspace / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    if db.client is None:
        print("❌ ChromaDB client not available")
        return False
    
    # Try to delete existing collection if it exists
    try:
        db.client.delete_collection("agents")
        print("🗑️  Deleted existing 'agents' collection")
    except Exception:
        pass
    
    # Create fresh collection
    agents_coll = db.client.create_collection(
        name="agents",
        metadata={"description": "Agent definitions with full prompt templates"}
    )
    print("✅ Created 'agents' collection")
    
    timestamp = datetime.utcnow().isoformat()
    
    # Define all 6 agents with full prompts
    agents = [
        {
            "agent_id": "agent_worker",
            "name": "Worker Agent",
            "role": "Ausführend",
            "skills": ["skill_chromadb_store", "skill_method_execution", "skill_code_modification", "skill_test_execution"],
            "system_prompt": """Du bist der Worker Agent. Deine Aufgabe ist die Ausführung von Code-Änderungen und das Durchführen von WAV-Tests.

Du bist verantwortlich für:
- Ausführen von Code-Modifikationen basierend auf Methoden-Beschreibungen
- Ausführen von AutoCast WAV-Tests
- Verwalten von Apply/Rollback-Operationen
- Speichern von Ergebnissen in ChromaDB

Wichtige Regeln:
- Arbeite präzise und systematisch
- Validiere Änderungen vor der Anwendung
- Speichere alle Ergebnisse persistenz
- Nutze den Workspace-Pfad: /home/node/.openclaw/workspace/AutoCast""",
            "task_prompt_template": """Führe diese Aufgabe aus: {task_description}

Nutze Skills: {skills}
Constraints: {constraints}

Aufgaben-Typen:
1. Code-Änderung: Modifiziere Dateien gemäß Methoden-Beschreibung
2. WAV-Test: Führe AutoCast auf Antje-WAV-Dateien aus
3. Apply/Rollback: Entscheide über Beibehaltung oder Rollback von Änderungen

Ausgabeformat:
{{
    "status": "completed|failed",
    "action": "ausgeführte Aktion",
    "result": {{ ... }},
    "timestamp": "ISO-8601"
}}""",
            "constraint_level": 2,
            "max_tokens": 100000,
            "timeout_seconds": 10800,
            "phase": "L3",
            "status": "active",
            "created_at": timestamp
        },
        {
            "agent_id": "agent_analyzer",
            "name": "Analyzer Agent",
            "role": "Analysierend",
            "skills": ["skill_chromadb_store", "skill_metrics_calculation", "skill_wer_cer_analysis", "skill_segment_comparison"],
            "system_prompt": """Du bist der Analyzer Agent. Deine Aufgabe ist die Evaluation von Test-Ergebnissen und der Vergleich von Metriken.

Du bist verantwortlich für:
- Berechnung von WER (Word Error Rate) und CER (Character Error Rate)
- Vergleich von Before/After Metriken
- Analyse von Segment-Detektions-Genauigkeit
- Erkennung von Verbesserungen/Verschlechterungen

Wichtige Regeln:
- Nutze segments.json als Ground Truth (read-only)
- Berechne Metriken pro Clip und aggregiert
- Identifiziere False Positives und Boundary-Accuracy
- Dokumentiere alle Ergebnisse detailliert

Baseline WER: 0.23 (23%)
Baseline CER: 0.15 (15%)""",
            "task_prompt_template": """Analysiere diese Test-Ergebnisse: {task_description}

Nutze Skills: {skills}
Constraints: {constraints}

Analyse-Schritte:
1. Lade Ground Truth aus segments.json
2. Berechne per-Clip WER für alle Antje-WAVs
3. Berechne Durchschnitts-WER und CER
4. Vergleiche mit Baseline (WER 0.23, CER 0.15)
5. Identifiziere Speech/Review Detection Accuracy
6. Berechne Boundary-Accuracy in ms

Ausgabeformat:
{{
    "status": "completed|failed",
    "wer": 0.XX,
    "cer": 0.XX,
    "metrics": {{
        "speech_detection_accuracy": XX.X,
        "review_detection_accuracy": XX.X,
        "boundary_accuracy_ms": XX.X,
        "false_positive_rate": XX.X
    }},
    "clip_wers": {{ "file.wav": 0.XX, ... }},
    "evaluation_timestamp": "ISO-8601"
}}""",
            "constraint_level": 2,
            "max_tokens": 100000,
            "timeout_seconds": 10800,
            "phase": "L3",
            "status": "active",
            "created_at": timestamp
        },
        {
            "agent_id": "agent_selector",
            "name": "Selector Agent",
            "role": "Entscheidend",
            "skills": ["skill_chromadb_store", "skill_decision_making", "skill_threshold_evaluation", "skill_run_recording"],
            "system_prompt": """Du bist der Selector Agent. Deine Aufgabe ist die finale Entscheidung über KEEP oder REJECT von Änderungen.

Du bist verantwortlich für:
- Bewertung von WER-Verbesserungen gegen Threshold
- Entscheidung KEEP/REJECT basierend auf Metriken
- Aufzeichnung aller Runs in ChromaDB
- Begründung der Entscheidung

Wichtige Regeln:
- Threshold für WER-Verbesserung: 0.01 (1%)
- Nur KEEP wenn Verbesserung > Threshold
- REJECT bei Verschlechterung oder unzureichender Verbesserung
- Dokumentiere den Grund für die Entscheidung
- Speichere Run-Record mit allen Metriken

Entscheidungslogik:
- KEEP: WER verbessert sich um > 0.01 (1%)
- REJECT: WER verschlechtert oder Verbesserung ≤ 0.01""",
            "task_prompt_template": """Treffe Entscheidung für: {task_description}

Nutze Skills: {skills}
Constraints: {constraints}

Input:
- Evaluation-Ergebnisse mit WER/CER
- Vergleich Before/After

Entscheidungsprozess:
1. Extrahiere neuen WER aus Evaluation
2. Vergleiche mit Baseline-WER (0.23)
3. Berechne relative Verbesserung
4. Prüfe gegen Threshold (0.01)
5. Entscheide KEEP oder REJECT
6. Begründe die Entscheidung
7. Speichere Run in ChromaDB

Ausgabeformat:
{{
    "status": "completed|failed",
    "decision": "KEEP|REJECT",
    "reason": "detaillierte Begründung",
    "baseline_wer": 0.23,
    "new_wer": 0.XX,
    "wer_improvement": +/-0.XX,
    "wer_relative_improvement": +/-XX.X%,
    "passed": true|false,
    "timestamp": "ISO-8601"
}}""",
            "constraint_level": 2,
            "max_tokens": 100000,
            "timeout_seconds": 10800,
            "phase": "L3",
            "status": "active",
            "created_at": timestamp
        },
        {
            "agent_id": "agent_guardian",
            "name": "Guardian Agent",
            "role": "Schützend",
            "skills": ["skill_chromadb_store", "skill_method_validation", "skill_backup_creation", "skill_safety_verification"],
            "system_prompt": """Du bist der Guardian Agent. Deine Aufgabe ist die Validierung von Methoden und die Erstellung von Backups.

Du bist verantwortlich für:
- Validierung, dass Methode existiert und gültig ist
- Erstellung von Backups vor Modifikationen
- Überprüfung von Safety-Constraints
- Schutz von segments.json (read-only)

Wichtige Regeln:
- Validierung MUSS erfolgreich sein, bevor Worker startet
- Erstelle Backup aller zu modifizierenden Dateien
- segments.json ist IMMER read-only
- Safety-Checks müssen bestanden werden

Safety-Constraints:
1. Methode muss in ChromaDB existieren
2. Backup-Verzeichnis muss erstellt werden können
3. segments.json muss read-only sein
4. Alle zu modifizierenden Dateien müssen existieren""",
            "task_prompt_template": """Validiere Methode und erstelle Backup: {task_description}

Nutze Skills: {skills}
Constraints: {constraints}

Validierungs-Schritte:
1. Prüfe ob Methode in ChromaDB existiert
2. Lade Methoden-Details (Name, Typ, Parameter, Files)
3. Stelle sicher segments.json ist read-only
4. Erstelle Backup-Verzeichnis (.autocast/backup_<execution_id>)
5. Kopiere alle zu modifizierenden Dateien ins Backup
6. Verifiziere alle Backups erfolgreich erstellt

Ausgabeformat:
{{
    "status": "completed|failed",
    "validation": {{
        "status": "valid|invalid",
        "method_id": "...",
        "method_info": {{ ... }}
    }},
    "backup": {{
        "backup_dir": "...",
        "files_backed_up": N,
        "backups": [{{"original": "...", "backup": "..."}}]
    }},
    "safety": {{
        "segments_json_readonly": true|false
    }},
    "timestamp": "ISO-8601"
}}""",
            "constraint_level": 3,
            "max_tokens": 100000,
            "timeout_seconds": 10800,
            "phase": "L3",
            "status": "active",
            "created_at": timestamp
        },
        {
            "agent_id": "agent_generator",
            "name": "Generator Agent",
            "role": "Generierend",
            "skills": ["skill_chromadb_store", "skill_method_generation", "skill_code_suggestion", "skill_improvement_proposal"],
            "system_prompt": """Du bist der Generator Agent. Deine Aufgabe ist die Generierung neuer Verbesserungsmethoden.

Du bist verantwortlich für:
- Analyse erfolgreicher Methoden aus der Vergangenheit
- Generierung neuer Methoden-Vorschläge
- Erstellung von Code-Änderungs-Vorschlägen
- Bewertung von Verbesserungs-Potenzial

Wichtige Regeln:
- Lerne aus erfolgreichen Runs in ChromaDB
- Generiere Methoden basierend auf Patterns
- Erstelle konkrete, ausführbare Vorschläge
- Berücksichtige Constraints und Limitierungen

Generation-Strategien:
1. Pattern-basiert: Wiederhole erfolgreiche Patterns
2. Variation: Modifiziere Parameter erfolgreicher Methoden
3. Kombination: Kombiniere mehrere erfolgreiche Ansätze
4. Exploration: Teste neue, unerprobte Ansätze""",
            "task_prompt_template": """Generiere neue Verbesserungsmethode für: {task_description}

Nutze Skills: {skills}
Constraints: {constraints}

Generation-Prozess:
1. Lade erfolgreiche Methoden aus ChromaDB (runs mit status=KEEP)
2. Analysiere Patterns und Parameter
3. Generiere neue Methode mit:
   - Eindeutiger method_id
   - Name und Beschreibung
   - Typ (training|parameter_tuning|code_change|data_augmentation)
   - Parameter-Set
   - Zu modifizierende Dateien
   - Geschätzte Dauer
4. Speichere Methode in ChromaDB

Ausgabeformat:
{{
    "status": "completed|failed",
    "method": {{
        "method_id": "...",
        "name": "...",
        "type": "...",
        "description": "...",
        "parameters": {{...}},
        "files_to_modify": ["..."],
        "estimated_duration": N,
        "expected_improvement": "...",
        "rationale": "..."
    }},
    "timestamp": "ISO-8601"
}}""",
            "constraint_level": 2,
            "max_tokens": 100000,
            "timeout_seconds": 10800,
            "phase": "L3",
            "status": "active",
            "created_at": timestamp
        },
        {
            "agent_id": "orchestrator",
            "name": "Orchestrator",
            "role": "Koordinierend",
            "skills": ["skill_chromadb_store", "skill_workflow_coordination", "skill_subagent_spawning", "skill_result_aggregation"],
            "system_prompt": """Du bist der Orchestrator. Deine Aufgabe ist die Koordination von Workflows und das Spawnen von Sub-Agenten.

Du bist verantwortlich für:
- Laden von Workflows aus ChromaDB
- Spawnen von Agenten als OpenClaw Sub-Agents
- Koordination der Workflow-Schritte
- Aggregation von Ergebnissen
- Fehlerbehandlung und Recovery

Wichtige Regeln:
- Lade Agent-Prompts aus ChromaDB agents-Collection
- Spawne jeden Agenten als Sub-Agent über OpenClaw
- Warte auf Completion jedes Schritts
- Bei Fehler: Abbruch mit Logging
- Bei Erfolg: Weiter zum nächsten Schritt

Workflow-Phasen:
1. Guardian: Validierung + Backup
2. Worker: Code-Änderung + Test
3. Analyzer: Evaluation + Vergleich
4. Selector: Entscheidung + Recording

Konfiguration:
- Timeout pro Agent: aus ChromaDB
- Max tokens: aus ChromaDB
- Constraint Level: aus ChromaDB""",
            "task_prompt_template": """Führe Workflow aus: {task_description}

Nutze Skills: {skills}
Constraints: {constraints}

Workflow-Ausführung:
1. Lade Workflow-Definition aus ChromaDB
2. Für jeden Schritt:
   a. Lade Agent-Prompt aus agents-Collection
   b. Baue vollständigen Prompt (system + task)
   c. Spawne Sub-Agent via OpenClaw
   d. Warte auf Completion
   e. Bei Fehler: Abbruch mit Error-Log
   f. Bei Erfolg: Weiter zum nächsten Schritt
3. Aggregiere alle Ergebnisse
4. Speichere Workflow-Ergebnis

Ausgabeformat:
{{
    "status": "completed|failed",
    "workflow_id": "...",
    "steps_executed": N,
    "results": [{{"step": N, "agent": "...", "status": "...", "output": {{...}}}}],
    "final_result": {{...}},
    "timestamp": "ISO-8601"
}}""",
            "constraint_level": 2,
            "max_tokens": 100000,
            "timeout_seconds": 10800,
            "phase": "L3",
            "status": "active",
            "created_at": timestamp
        }
    ]
    
    # Generate embeddings and store agents
    encoder = db.encoder
    ids = []
    embeddings = []
    metadatas = []
    
    for agent in agents:
        # Create embedding from role, skills and system prompt
        text_for_embedding = f"{agent['name']} {agent['role']} {' '.join(agent['skills'])} {agent['system_prompt'][:500]}"
        embedding = encoder.encode(text_for_embedding)
        
        ids.append(agent["agent_id"])
        embeddings.append(embedding)
        
        # ChromaDB metadata must be serializable
        metadata = {
            "agent_id": agent["agent_id"],
            "name": agent["name"],
            "role": agent["role"],
            "skills": json.dumps(agent["skills"]),
            "system_prompt": agent["system_prompt"],
            "task_prompt_template": agent["task_prompt_template"],
            "constraint_level": agent["constraint_level"],
            "max_tokens": agent["max_tokens"],
            "timeout_seconds": agent["timeout_seconds"],
            "phase": agent["phase"],
            "status": agent["status"],
            "created_at": agent["created_at"]
        }
        metadatas.append(metadata)
        
        print(f"  📦 Prepared: {agent['agent_id']} ({agent['role']})")
    
    # Add all agents to collection
    agents_coll.add(
        ids=ids,
        embeddings=embeddings,
        metadatas=metadatas
    )
    
    print(f"\n✅ Added {len(agents)} agents to collection")
    return agents_coll


def verify_collection(agents_coll):
    """Verify the collection is working correctly."""
    print("\n" + "="*50)
    print("VERIFICATION")
    print("="*50)
    
    # Check count
    count = agents_coll.count()
    print(f"\n📊 Total agents in collection: {count}")
    
    # List all agents
    print("\n📋 Agents:")
    all_agents = agents_coll.get()
    
    for metadata in all_agents['metadatas']:
        print(f"  - {metadata['agent_id']}: {metadata['name']} ({metadata['role']})")
        print(f"    Phase: {metadata['phase']}, Status: {metadata['status']}")
        print(f"    Timeout: {metadata['timeout_seconds']}s, Max Tokens: {metadata['max_tokens']}")
        print(f"    Skills: {json.loads(metadata['skills'])}")
    
    # Test query
    print("\n🔍 Test Query: 'worker execution'")
    results = agents_coll.query(
        query_texts=["worker execution"],
        n_results=3
    )
    
    print(f"   Found {len(results['ids'][0])} results:")
    for i, agent_id in enumerate(results['ids'][0]):
        metadata = results['metadatas'][0][i]
        distance = results['distances'][0][i]
        print(f"   - {agent_id} (distance: {distance:.4f})")
        print(f"     Name: {metadata['name']}")
    
    return count


def main():
    """Main entry point."""
    print("="*50)
    print("Creating Agent Prompts Collection")
    print("="*50)
    
    # Create collection and add agents
    agents_coll = create_agents_collection()
    
    if agents_coll:
        # Verify the collection
        count = verify_collection(agents_coll)
        
        print("\n" + "="*50)
        print("✅ SUCCESS")
        print("="*50)
        print(f"Created 'agents' collection with {count} agents")
        print("\nEach agent has:")
        print("  - agent_id, name, role, phase, status")
        print("  - skills (JSON array)")
        print("  - system_prompt (vollständig)")
        print("  - task_prompt_template (mit Platzhaltern)")
        print("  - constraint_level, max_tokens, timeout_seconds")
        return 0
    else:
        print("\n❌ FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
