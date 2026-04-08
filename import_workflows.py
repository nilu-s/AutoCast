#!/usr/bin/env python3
"""Import workflows from JSON files into ChromaDB."""

import sys
import json
from pathlib import Path

WORKSPACE = Path(__file__).parent
sys.path.insert(0, str(WORKSPACE))
sys.path.insert(0, str(WORKSPACE / "learning"))

from learning.chroma_client import ChromaLearningDB


def import_workflow(json_path):
    """Import a single workflow from JSON to ChromaDB."""
    with open(json_path, 'r') as f:
        workflow = json.load(f)
    
    db = ChromaLearningDB()
    
    # Create or get workflows collection
    try:
        workflows_coll = db.client.get_collection('workflows')
        print(f"✅ Using existing 'workflows' collection")
    except:
        workflows_coll = db.client.create_collection(
            name='workflows',
            metadata={'description': 'Workflow definitions'}
        )
        print(f"✅ Created 'workflows' collection")
    
    workflow_id = workflow['workflow_id']
    name = workflow['name']
    description = workflow.get('description', '')
    steps = json.dumps(workflow.get('steps', []))
    
    # Create embedding from name + description + steps
    text_for_embedding = f"{name} {description} {steps[:500]}"
    embedding = db.encoder.encode(text_for_embedding)
    
    # Flatten for ChromaDB metadata
    metadata = {
        'workflow_id': workflow_id,
        'name': name,
        'description': description,
        'version': workflow.get('version', '1.0.0'),
        'level': workflow.get('level', 'L1'),
        'status': workflow.get('status', 'active'),
        'created_at': workflow.get('created_at', ''),
        'steps': steps,
        'autonomous': str(workflow.get('autonomous', False)),
        'safety_features': json.dumps(workflow.get('safety_features', {}))
    }
    
    # Check if exists and update, else add
    try:
        existing = workflows_coll.get(ids=[workflow_id])
        if existing and existing.get('ids'):
            workflows_coll.update(
                ids=[workflow_id],
                embeddings=[embedding],
                metadatas=[metadata]
            )
            print(f"  📝 Updated: {workflow_id}")
        else:
            raise Exception("New entry")
    except:
        workflows_coll.add(
            ids=[workflow_id],
            embeddings=[embedding],
            metadatas=[metadata]
        )
        print(f"  ➕ Added: {workflow_id}")
    
    return workflow_id


def main():
    workflows_dir = WORKSPACE / 'workflows'
    
    if not workflows_dir.exists():
        print(f"❌ Workflows directory not found: {workflows_dir}")
        return 1
    
    print("="*50)
    print("Importing Workflows to ChromaDB")
    print("="*50)
    
    imported = []
    for json_file in workflows_dir.glob('*.json'):
        print(f"\nProcessing: {json_file.name}")
        try:
            workflow_id = import_workflow(json_file)
            imported.append(workflow_id)
        except Exception as e:
            print(f"  ❌ Error: {e}")
    
    print(f"\n{'='*50}")
    print(f"✅ Imported {len(imported)} workflows")
    for wid in imported:
        print(f"  - {wid}")
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
