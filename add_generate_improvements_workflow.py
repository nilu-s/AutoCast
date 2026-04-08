#!/usr/bin/env python3
"""Add generate_improvements workflow to the system.

Erstellt den L3 Workflow "generate_improvements" und speichert ihn
in workflows_storage.

Usage:
    python add_generate_improvements_workflow.py
"""

import sys
from pathlib import Path

# Add workspace to path
workspace_root = Path(__file__).parent
sys.path.insert(0, str(workspace_root))

from workflows_storage import save_workflow


def create_generate_improvements_workflow():
    """Create the L3 generate_improvements workflow definition."""
    
    workflow = {
        "workflow_id": "generate_improvements",
        "name": "Generate Improvements",
        "description": "Generates new method proposals by analyzing patterns in runs and evaluations, then creates hypotheses and mutates embeddings to suggest improvements",
        "version": "1.0",
        "level": "L3",
        "steps": [
            {
                "step": 1,
                "agent": "agent_analyzer",
                "skill": "skill_pattern_recognition",
                "action": "find_patterns_in_data",
                "description": "Analyze runs and evaluations to identify patterns",
                "input": "runs_collection, evaluations_collection",
                "output": "identified_patterns"
            },
            {
                "step": 2,
                "agent": "agent_generator",
                "skill": "skill_hypothesis_synthesis",
                "action": "generate_hypotheses",
                "description": "Generate 3 hypothesis candidates based on identified patterns",
                "input": "identified_patterns",
                "output": "hypothesis_candidates"
            },
            {
                "step": 3,
                "agent": "agent_generator",
                "skill": "skill_embedding_mutation",
                "action": "create_method_variants",
                "description": "Create 3 new method variants via embedding mutation",
                "input": "hypothesis_candidates",
                "output": "new_method_variants"
            },
            {
                "step": 4,
                "agent": "agent_selector",
                "skill": "skill_ranking",
                "action": "rank_new_variants",
                "description": "Rank new variants by expected success and feasibility",
                "input": "new_method_variants",
                "output": "ranked_proposals"
            },
            {
                "step": 5,
                "agent": "agent_guardian",
                "skill": "skill_validation_check",
                "action": "validate_proposals",
                "description": "Validate proposals against constraints and approve top 3",
                "input": "ranked_proposals",
                "output": "final_3_suggestions"
            }
        ],
        "output": {
            "proposals": "final_3_suggestions",
            "patterns": "identified_patterns",
            "rankings": "ranked_proposals"
        },
        "human_approval_required": True,
        "auto_rollback": False,
        "applicable_constraints": [
            "max_task_duration",
            "max_tokens_per_task",
            "forbidden_golden"
        ],
        "next_workflows": [
            {
                "workflow_id": "apply_method",
                "trigger": "user_selects_proposal",
                "description": "After user selects a proposal, apply_method can be triggered"
            }
        ]
    }
    
    return workflow


def main():
    print("="*70)
    print("Adding L3 Workflow: generate_improvements")
    print("="*70)
    
    workflow = create_generate_improvements_workflow()
    
    try:
        save_workflow(workflow)
        print(f"\n✅ Workflow '{workflow['workflow_id']}' saved successfully!")
        print(f"   Name: {workflow['name']}")
        print(f"   Description: {workflow['description'][:60]}...")
        print(f"   Steps: {len(workflow['steps'])}")
        print(f"   Level: {workflow['level']}")
        
        print("\n   Workflow steps:")
        for step in workflow["steps"]:
            print(f"      {step['step']}. {step['agent']} → {step['skill']}")
            print(f"         Action: {step['action']}")
        
        print("\n   Next workflows:")
        for next_wf in workflow["next_workflows"]:
            print(f"      → {next_wf['workflow_id']} ({next_wf['trigger']})")
        
        print(f"\n{'='*70}")
        return 0
        
    except Exception as e:
        print(f"\n❌ Error saving workflow: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
