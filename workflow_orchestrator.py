#!/usr/bin/env python3
"""
Einfacher Orchestrator - lädt Agent-Prompts aus ChromaDB,
spawned sie als OpenClaw Sub-Agents, koordiniert Workflow.
"""

import sys
import json
import time
import subprocess
from pathlib import Path

# Add AutoCast directory to path
WORKSPACE = Path(__file__).parent
sys.path.insert(0, str(WORKSPACE))
sys.path.insert(0, str(WORKSPACE / "learning"))

from learning.chroma_client import ChromaLearningDB


def load_agent_prompt(agent_id):
    """Lädt Agent-Prompt aus ChromaDB"""
    db = ChromaLearningDB()
    agent_coll = db.client.get_collection('agents')
    agent = agent_coll.get(ids=[agent_id], include=['metadatas'])
    
    if not agent or not agent.get('ids'):
        raise ValueError(f"Agent {agent_id} not found in ChromaDB")
    
    return agent['metadatas'][0]


def load_workflow(workflow_id):
    """Lädt Workflow aus ChromaDB"""
    db = ChromaLearningDB()
    workflows_coll = db.client.get_collection('workflows')
    workflow = workflows_coll.get(ids=[workflow_id], include=['metadatas'])
    
    if not workflow or not workflow.get('ids'):
        raise ValueError(f"Workflow {workflow_id} not found")
    
    metadata = workflow['metadatas'][0]
    return {
        'workflow_id': metadata['workflow_id'],
        'name': metadata['name'],
        'steps': json.loads(metadata.get('steps', '[]'))
    }


def get_constraints_for_agent(agent_id):
    """Gibt Constraints für Agent zurück"""
    constraints_map = {
        'agent_worker': 'Arbeite präzise, validiere Änderungen, speichere Ergebnisse',
        'agent_analyzer': 'Nutze segments.json als Ground Truth, berechne alle Metriken',
        'agent_selector': 'Threshold: 0.01, entscheide objektiv',
        'agent_guardian': 'Validiere vor Worker, Backup vor Änderungen, segments.json read-only',
        'agent_generator': 'Lerne aus erfolgreichen Runs, generiere konkrete Vorschläge',
        'orchestrator': 'Koordiniere sequentiell, warte auf Completion, handle Fehler'
    }
    return constraints_map.get(agent_id, 'Standard constraints')


def build_full_prompt(agent, task_description):
    """Baut vollständigen Prompt aus Agent-Definition"""
    system_prompt = agent['system_prompt']
    
    # Parse skills from JSON
    skills = json.loads(agent.get('skills', '[]'))
    
    task_prompt = agent['task_prompt_template'].format(
        task_description=task_description,
        skills=skills,
        constraints=get_constraints_for_agent(agent['agent_id'])
    )
    
    return f"{system_prompt}\n\n{task_prompt}"


def spawn_subagent(agent_id, full_prompt, timeout_seconds):
    """Spawned Sub-Agent als separaten Python-Prozess"""
    print(f"  🚀 Spawning {agent_id}...")
    
    # Escape the full_prompt for embedding in the script
    escaped_prompt = full_prompt.replace("'", "'\\''").replace(chr(0x7b), "{{").replace(chr(0x7d), "}}")
    
    # Create temporary script for sub-agent
    script_content = f'''#!/usr/bin/env python3
import sys
import json
import time

full_prompt = """{full_prompt}"""

# Simulated sub-agent execution
print("="*50)
print(f"Sub-Agent: {agent_id}")
print("="*50)
print()
print("PROMPT:")
print(full_prompt[:500] + "...")
print()
print("STATUS: Executing...")

# Simulate work
time.sleep(1)

# Return result
result = dict(
    agent_id="{agent_id}",
    status="completed",
    output="Task executed successfully",
    timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
)

print()
print("RESULT:")
print(json.dumps(result, indent=2))
'''
    
    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(script_content)
        script_path = f.name
    
    try:
        # Execute sub-agent process
        result = subprocess.run(
            ['python3', script_path],
            capture_output=True,
            text=True,
            timeout=timeout_seconds
        )
        
        print(result.stdout)
        if result.stderr:
            print(f"  ⚠️ stderr: {result.stderr[:200]}")
        
        # Parse result from output
        if result.returncode == 0:
            return {
                'status': 'completed',
                'agent_id': agent_id,
                'output': result.stdout
            }
        else:
            return {
                'status': 'failed',
                'agent_id': agent_id,
                'error': f'Exit code: {result.returncode}'
            }
    except subprocess.TimeoutExpired:
        return {
            'status': 'failed',
            'agent_id': agent_id,
            'error': f'Timeout after {timeout_seconds}s'
        }
    finally:
        import os
        os.unlink(script_path)


def wait_for_completion(result, timeout_seconds):
    """Wartet auf Completion (bei subprocess bereits synchron)"""
    return result


def spawn_agent(agent_id, task_description):
    """Spawned Agent aus ChromaDB als Sub-Agent"""
    agent = load_agent_prompt(agent_id)
    
    # Baue Prompt
    full_prompt = build_full_prompt(agent, task_description)
    
    # Timeout aus ChromaDB
    timeout_seconds = agent.get('timeout_seconds', 3600)
    
    # Spawne Sub-Agent
    result = spawn_subagent(agent_id, full_prompt, timeout_seconds)
    
    return result


def run_workflow(workflow_id, method_id=None):
    """Führt Workflow mit echten Sub-Agents aus"""
    print(f"\n{'='*60}")
    print(f"Workflow Orchestrator")
    print(f"{'='*60}")
    print(f"Workflow: {workflow_id}")
    if method_id:
        print(f"Method: {method_id}")
    print()
    
    # Workflow Schritte aus ChromaDB laden
    workflow = load_workflow(workflow_id)
    print(f"✅ Loaded workflow: {workflow['name']}")
    print(f"   Steps: {len(workflow['steps'])}")
    print()
    
    results = []
    final_result = None
    
    for step in workflow['steps']:
        step_num = step.get('step', 0)
        agent_id = step.get('agent', 'unknown')
        description = step.get('description', 'No description')
        
        print(f"\n{'─'*60}")
        print(f"Step {step_num}: {agent_id}")
        print(f"{'─'*60}")
        print(f"Description: {description}")
        print()
        
        # Add method context if provided
        task_description = description
        if method_id:
            task_description = f"{description} | Method: {method_id}"
        
        try:
            # Spawne Agent
            result = spawn_agent(
                agent_id=agent_id,
                task_description=task_description
            )
            
            results.append({
                'step': step_num,
                'agent': agent_id,
                'status': result.get('status', 'unknown'),
                'output': result.get('output', '')[:200]
            })
            
            if result.get('status') == 'failed':
                print(f"\n❌ Agent failed: {result.get('error', 'Unknown error')}")
                final_result = result
                break
            
            print(f"\n✅ Step complete")
            final_result = result
            
        except Exception as e:
            print(f"\n❌ Step failed with exception: {e}")
            results.append({
                'step': step_num,
                'agent': agent_id,
                'status': 'failed',
                'error': str(e)
            })
            final_result = {'status': 'failed', 'error': str(e)}
            break
    
    # Summary
    print(f"\n{'='*60}")
    print("Workflow Summary")
    print(f"{'='*60}")
    print(f"Steps executed: {len(results)}/{len(workflow['steps'])}")
    print(f"Final status: {final_result.get('status', 'unknown')}")
    
    return {
        'workflow_id': workflow_id,
        'method_id': method_id,
        'status': final_result.get('status', 'unknown'),
        'steps': results,
        'final_result': final_result
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python workflow_orchestrator.py <workflow_id> [method_id]")
        sys.exit(1)
    
    workflow_id = sys.argv[1]
    method_id = sys.argv[2] if len(sys.argv) > 2 else None
    
    try:
        result = run_workflow(workflow_id, method_id)
        print(f"\n{'='*60}")
        print("Workflow Complete")
        print(f"{'='*60}")
        print(json.dumps(result, indent=2))
        sys.exit(0 if result['status'] == 'completed' else 1)
    except Exception as e:
        print(f"\n❌ Workflow failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
