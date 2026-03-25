"""
Workflow Storage Module
Manages workflows in ChromaDB (or JSON fallback)
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any

WORKSPACE_DIR = "/home/node/.openclaw/workspace/AutoCast"
WORKFLOWS_DIR = os.path.join(WORKSPACE_DIR, "workflows_data")
WORKFLOWS_FILE = os.path.join(WORKFLOWS_DIR, "workflows.json")

def ensure_workflows_dir():
    """Ensure workflows directory exists"""
    os.makedirs(WORKFLOWS_DIR, exist_ok=True)

def load_workflows_storage() -> Dict[str, Any]:
    """Load workflows from JSON storage"""
    ensure_workflows_dir()
    if os.path.exists(WORKFLOWS_FILE):
        with open(WORKFLOWS_FILE, 'r') as f:
            return json.load(f)
    return {"workflows": {}, "executions": {}}

def save_workflows_storage(storage: Dict[str, Any]):
    """Save workflows to JSON storage"""
    ensure_workflows_dir()
    with open(WORKFLOWS_FILE, 'w') as f:
        json.dump(storage, f, indent=2)

def save_workflow(workflow: Dict[str, Any]) -> bool:
    """
    Save a workflow to storage
    
    Args:
        workflow: Workflow definition dict
        
    Returns:
        bool: Success status
    """
    storage = load_workflows_storage()
    workflow_id = workflow.get("workflow_id")
    
    if not workflow_id:
        print("Error: workflow_id required")
        return False
    
    workflow["saved_at"] = datetime.utcnow().isoformat()
    storage["workflows"][workflow_id] = workflow
    
    save_workflows_storage(storage)
    print(f"✅ Workflow '{workflow_id}' saved successfully")
    return True

def get_workflow(workflow_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a workflow by ID
    
    Args:
        workflow_id: Workflow ID
        
    Returns:
        Workflow dict or None
    """
    storage = load_workflows_storage()
    return storage["workflows"].get(workflow_id)

def list_workflows() -> List[str]:
    """List all workflow IDs"""
    storage = load_workflows_storage()
    return list(storage["workflows"].keys())

def save_execution(workflow_id: str, execution_id: str, execution_data: Dict[str, Any]):
    """Save workflow execution results"""
    storage = load_workflows_storage()
    
    if workflow_id not in storage["executions"]:
        storage["executions"][workflow_id] = {}
    
    storage["executions"][workflow_id][execution_id] = {
        **execution_data,
        "saved_at": datetime.utcnow().isoformat()
    }
    
    save_workflows_storage(storage)

def get_execution(workflow_id: str, execution_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific execution"""
    storage = load_workflows_storage()
    return storage["executions"].get(workflow_id, {}).get(execution_id)

def get_workflow_executions(workflow_id: str) -> Dict[str, Any]:
    """Get all executions for a workflow"""
    storage = load_workflows_storage()
    return storage["executions"].get(workflow_id, {})

# Migration to ChromaDB (for future use)
def migrate_to_chromadb():
    """Migrate workflows from JSON to ChromaDB"""
    try:
        import chromadb
        from chromadb.config import Settings
        
        chroma_client = chromadb.HttpClient(
            host="localhost",
            port=8000,
            settings=Settings(allow_reset=True, anonymized_telemetry=False)
        )
        
        # Create or get workflows collection
        try:
            collection = chroma_client.create_collection(
                name="workflows",
                metadata={"description": "AutoCast workflow definitions"}
            )
        except Exception:
            collection = chroma_client.get_collection(name="workflows")
        
        # Load from JSON
        storage = load_workflows_storage()
        
        for workflow_id, workflow in storage["workflows"].items():
            workflow_json = json.dumps(workflow)
            collection.upsert(
                ids=[workflow_id],
                documents=[workflow_json],
                metadatas=[{
                    "name": workflow.get("name", ""),
                    "version": workflow.get("version", "1.0"),
                    "workflow_id": workflow_id
                }]
            )
        
        print(f"✅ Migrated {len(storage['workflows'])} workflows to ChromaDB")
        return True
        
    except Exception as e:
        print(f"⚠️ Migration failed: {e}")
        return False

if __name__ == "__main__":
    # Test storage
    print("Workflow Storage Module")
    print(f"Storage location: {WORKFLOWS_FILE}")
    workflows = list_workflows()
    print(f"Stored workflows: {workflows}")