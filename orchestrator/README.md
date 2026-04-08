# Orchestrator module for AutoCast

This module provides task decomposition and agent coordination.

## Quick Start

```python
from orchestrator import Orchestrator

# Create orchestrator
orch = Orchestrator()

# Execute a workflow
success, tasks = orch.execute_workflow(
    workflow_name="execute_run",
    context={"method_id": "method_001"}
)

# Check status
status = orch.get_system_status()
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Orchestrator │────▶ AgentMatcher │────▶ ChromaDB    │
│             │     │              │     │             │
│ - Decompose  │     │ - Skill Match │     │ - agents    │
│ - Assign     │     │ - Score       │     │ - tasks     │
│ - Execute    │     │ - Select      │     │ - skills    │
└─────────────┘     └──────────────┘     └─────────────┘
```

## Workflow Templates

- **execute_run**: validate → execute → analyze → store
- **generate_method**: analyze → hypothesize → create → validate
- **optimize_strategy**: analyze → evaluate → tune

## Agent Roles

| Agent | Type | Skills | Role |
|-------|------|--------|------|
| agent_worker | Ausführend | 4 | Task execution, data collection |
| agent_analyzer | Analytisch | 5 | Data analysis, pattern recognition |
| agent_selector | Entscheidend | 4 | Method/strategy selection |
| agent_generator | Kreativ | 4 | Generate new ideas/methods |
| agent_guardian | Schützend | 5 | Monitor, validate, rollback |
| orchestrator | Koordinator | 3 + meta | Task decomposition, coordination |
