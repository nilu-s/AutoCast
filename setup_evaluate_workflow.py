#!/usr/bin/env python3
"""
Setup Script: Evaluate Current State Workflow

Creates the first AutoCast workflow and stores it.
"""

import json
from workflows_storage import save_workflow, list_workflows, get_workflow

WORKFLOW_DEFINITION = {
    "workflow_id": "evaluate_current_state",
    "name": "Evaluate Current State",
    "description": "Analyzes current AutoCast performance and identifies weaknesses",
    "version": "1.0",
    "steps": [
        {
            "step": 1,
            "agent": "agent_analyzer",
            "skill": "skill_chromadb_query",
            "action": "load_current_metrics",
            "description": "Load current WER/CER from evaluations collection",
            "output": "current_metrics_report"
        },
        {
            "step": 2,
            "agent": "agent_analyzer",
            "skill": "skill_success_analysis",
            "action": "compare_to_baseline",
            "description": "Compare current vs target metrics",
            "input": "current_metrics_report",
            "output": "gap_analysis"
        },
        {
            "step": 3,
            "agent": "agent_selector",
            "skill": "skill_similarity_search",
            "action": "find_relevant_methods",
            "description": "Find methods that could improve the gap",
            "input": "gap_analysis",
            "output": "recommended_methods"
        },
        {
            "step": 4,
            "agent": "agent_selector",
            "skill": "skill_ranking",
            "action": "rank_recommendations",
            "description": "Rank methods by potential improvement",
            "input": "recommended_methods",
            "output": "final_recommendations"
        }
    ],
    "output": {
        "metrics": "current_metrics_report",
        "gap_analysis": "gap_analysis",
        "recommendations": "final_recommendations"
    },
    "human_approval_required": True,
    "auto_rollback": False,
    "applicable_constraints": [
        "max_task_duration",
        "max_tokens_per_task",
        "forbidden_golden"
    ]
}


def main():
    print("=" * 70)
    print("🚀 Setting up 'Evaluate Current State' Workflow")
    print("=" * 70)
    
    # Show current workflows
    print("\n📋 Current workflows in storage:")
    existing = list_workflows()
    if existing:
        for wf_id in existing:
            wf = get_workflow(wf_id)
            print(f"   - {wf_id} ({wf.get('name', 'N/A')})")
    else:
        print("   (none)")
    
    # Save workflow
    print(f"\n💾 Saving workflow: {WORKFLOW_DEFINITION['workflow_id']}")
    success = save_workflow(WORKFLOW_DEFINITION)
    
    if success:
        print("\n✅ Workflow saved successfully!")
        print("\n📄 Workflow Details:")
        print(f"   Name: {WORKFLOW_DEFINITION['name']}")
        print(f"   Description: {WORKFLOW_DEFINITION['description']}")
        print(f"   Version: {WORKFLOW_DEFINITION['version']}")
        print(f"   Steps: {len(WORKFLOW_DEFINITION['steps'])}")
        print(f"   Human Approval Required: {WORKFLOW_DEFINITION['human_approval_required']}")
        print(f"   Auto Rollback: {WORKFLOW_DEFINITION['auto_rollback']}")
        print(f"   Constraints: {', '.join(WORKFLOW_DEFINITION['applicable_constraints'])}")
        
        print("\n📊 Steps Overview:")
        for step in WORKFLOW_DEFINITION['steps']:
            print(f"   {step['step']}. [{step['agent']}] {step['description']}")
            print(f"      Skill: {step['skill']} | Action: {step['action']}")
        
        print("\n" + "=" * 70)
        print("✨ Setup Complete!")
        print("=" * 70)
        print("\n🔧 Next Steps:")
        print("   1. Execute: python execute_workflow.py --workflow-id evaluate_current_state")
        print("   2. Skip approval: python execute_workflow.py --workflow-id evaluate_current_state --skip-approval")
        print("   3. List workflows: python execute_workflow.py --list")
        print("")
        
        return True
    else:
        print("\n❌ Failed to save workflow")
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)