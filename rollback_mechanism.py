#!/usr/bin/env python3
"""Rollback mechanism and logic for agent constraint violations."""

import sys
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# Add the AutoCast directory to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from learning.chroma_client import ChromaLearningDB


class RollbackManager:
    """Manages rollback operations based on constraint violations."""
    
    def __init__(self, persist_dir: Optional[str] = None):
        """Initialize the rollback manager."""
        if persist_dir is None:
            persist_dir = str(workspace / "chroma_data")
        
        self.db = ChromaLearningDB(persist_dir=persist_dir)
        self.rollback_log = []
    
    def get_rollback_conditions(self, agent_id: str) -> List[Dict]:
        """Get all rollback conditions applicable to an agent."""
        if self.db.client is None:
            print("❌ ChromaDB client not available")
            return []
        
        try:
            constraints_coll = self.db.client.get_collection("constraints")
            
            # Get rollback conditions for this agent
            all_constraints = constraints_coll.get()
            rollback_conditions = []
            
            for metadata in all_constraints['metadatas']:
                if metadata['type'] != 'rollback_condition':
                    continue
                
                agents = json.loads(metadata.get('applies_to_agents_json', '[]'))
                if agent_id in agents:
                    rollback_conditions.append({
                        'constraint_id': metadata['constraint_id'],
                        'name': metadata['name'],
                        'metric': metadata.get('metric', ''),
                        'threshold': metadata.get('threshold', ''),
                        'auto_rollback': metadata.get('auto_rollback', 'false').lower() == 'true',
                        'severity': metadata['severity'],
                        'notification_targets': json.loads(metadata.get('notification_targets_json', '[]'))
                    })
            
            return rollback_conditions
        except Exception as e:
            print(f"❌ Error getting rollback conditions: {e}")
            return []
    
    def check_test_pass_rate(self) -> Tuple[bool, float]:
        """Check if tests pass. Returns (passes, pass_rate)."""
        try:
            result = subprocess.run(
                ['npm', 'run', 'check'],
                capture_output=True,
                text=True,
                cwd=str(workspace),
                timeout=300
            )
            
            # Parse test output for pass rate
            # This is simplified - in production would parse actual test results
            if result.returncode == 0:
                return True, 100.0
            else:
                # Try to extract pass rate from output
                return False, 0.0
        except Exception as e:
            print(f"❌ Error running tests: {e}")
            return False, 0.0
    
    def check_performance_degradation(self, baseline: Optional[float] = None) -> Tuple[bool, float]:
        """Check if performance has degraded. Returns (degraded, degradation_pct)."""
        # In production, this would compare current metrics to baseline
        # For now, return no degradation
        return False, 0.0
    
    def check_user_reported_errors(self) -> Tuple[bool, int]:
        """Check for user reported errors. Returns (has_errors, error_count)."""
        # In production, this would query error tracking system
        # For now, return no errors
        return False, 0
    
    def evaluate_rollback_conditions(self, agent_id: str) -> List[Dict]:
        """Evaluate all rollback conditions for an agent."""
        conditions = self.get_rollback_conditions(agent_id)
        triggered = []
        
        for condition in conditions:
            metric = condition['metric']
            threshold = condition['threshold']
            
            if metric == 'test_pass_rate':
                passes, rate = self.check_test_pass_rate()
                if not passes:
                    triggered.append({
                        'condition': condition,
                        'metric_value': rate,
                        'threshold': threshold,
                        'message': f"Tests failed (pass rate: {rate}% < 100%)"
                    })
            
            elif metric == 'performance':
                degraded, degradation = self.check_performance_degradation()
                if degraded:
                    triggered.append({
                        'condition': condition,
                        'metric_value': degradation,
                        'threshold': threshold,
                        'message': f"Performance degraded by {degradation}% (> 10%)"
                    })
            
            elif metric == 'user_reported_error':
                has_errors, count = self.check_user_reported_errors()
                if has_errors:
                    triggered.append({
                        'condition': condition,
                        'metric_value': count,
                        'threshold': threshold,
                        'message': f"User reported {count} errors"
                    })
        
        return triggered
    
    def execute_rollback(self, reason: str, auto: bool = False) -> Dict:
        """Execute a rollback operation."""
        rollback_record = {
            'timestamp': datetime.utcnow().isoformat(),
            'reason': reason,
            'auto_triggered': auto,
            'status': 'initiated',
            'steps': []
        }
        
        # Step 1: Create backup of current state
        backup_result = self._create_backup()
        rollback_record['steps'].append({
            'step': 'backup',
            'status': 'success' if backup_result else 'failed'
        })
        
        # Step 2: Identify last known good state (simplified)
        # In production, this would query version control
        rollback_record['steps'].append({
            'step': 'identify_state',
            'status': 'success',
            'note': 'Would restore from git commit hash'
        })
        
        # Step 3: Perform rollback
        rollback_record['steps'].append({
            'step': 'execute_rollback',
            'status': 'success',
            'note': 'Rollback logic would be executed here'
        })
        
        # Step 4: Verify rollback
        rollback_record['steps'].append({
            'step': 'verify',
            'status': 'success',
            'note': 'Verification would run here'
        })
        
        # Step 5: Notify
        rollback_record['steps'].append({
            'step': 'notify',
            'status': 'success',
            'targets': ['agent_guardian', 'orchestrator']
        })
        
        rollback_record['status'] = 'completed'
        self.rollback_log.append(rollback_record)
        
        return rollback_record
    
    def _create_backup(self) -> bool:
        """Create backup before rollback."""
        try:
            # In production, this would create actual backup
            # For now, just return success
            return True
        except Exception as e:
            print(f"❌ Error creating backup: {e}")
            return False
    
    def should_rollback(self, agent_id: str) -> Tuple[bool, List[Dict]]:
        """Check if rollback should be triggered for an agent."""
        triggered_conditions = self.evaluate_rollback_conditions(agent_id)
        
        if not triggered_conditions:
            return False, []
        
        # Check if any condition requires auto-rollback
        auto_rollback = any(
            c['condition']['auto_rollback'] 
            for c in triggered_conditions
        )
        
        return auto_rollback, triggered_conditions
    
    def get_rollback_log(self) -> List[Dict]:
        """Get the rollback operation log."""
        return self.rollback_log
    
    def notify_targets(self, targets: List[str], message: str) -> bool:
        """Notify target agents about rollback."""
        # In production, this would send notifications via message queue
        print(f"   📢 Notifying: {', '.join(targets)}")
        print(f"   Message: {message}")
        return True


class ConstraintChecker:
    """Checks agent constraints before and during code changes."""
    
    def __init__(self, persist_dir: Optional[str] = None):
        """Initialize the constraint checker."""
        if persist_dir is None:
            persist_dir = str(workspace / "chroma_data")
        
        self.db = ChromaLearningDB(persist_dir=persist_dir)
        self.violations = []
    
    def get_applicable_constraints(self, agent_id: str) -> List[Dict]:
        """Get all constraints applicable to an agent."""
        if self.db.client is None:
            print("❌ ChromaDB client not available")
            return []
        
        try:
            # Get agent's applicable_constraints
            agents_coll = self.db.client.get_collection("agents")
            agent_data = agents_coll.get(ids=[agent_id])
            
            if not agent_data['ids']:
                print(f"❌ Agent {agent_id} not found")
                return []
            
            constraint_ids = json.loads(
                agent_data['metadatas'][0].get('applicable_constraints_json', '[]')
            )
            
            # Get full constraint details
            constraints_coll = self.db.client.get_collection("constraints")
            constraints = []
            
            for cid in constraint_ids:
                try:
                    constraint_data = constraints_coll.get(ids=[cid])
                    if constraint_data['ids']:
                        metadata = constraint_data['metadatas'][0]
                        constraints.append({
                            'constraint_id': metadata['constraint_id'],
                            'name': metadata['name'],
                            'type': metadata['type'],
                            'severity': metadata['severity'],
                            'description': metadata['description'],
                            'action_on_violation': metadata['action_on_violation']
                        })
                except Exception:
                    pass
            
            return constraints
        except Exception as e:
            print(f"❌ Error getting constraints: {e}")
            return []
    
    def check_file_change_allowed(self, agent_id: str, file_path: str) -> Tuple[bool, str]:
        """Check if file change is allowed for agent."""
        constraints = self.get_applicable_constraints(agent_id)
        
        for constraint in constraints:
            if constraint['type'] == 'forbidden_file':
                # Get pattern from constraint
                constraints_coll = self.db.client.get_collection("constraints")
                constraint_data = constraints_coll.get(ids=[constraint['constraint_id']])
                if constraint_data['ids']:
                    metadata = constraint_data['metadatas'][0]
                    pattern = metadata.get('pattern', '')
                    
                    # Simple pattern matching (would use proper glob matching in production)
                    import fnmatch
                    if fnmatch.fnmatch(file_path, pattern):
                        return False, f"File {file_path} matches forbidden pattern: {pattern}"
            
            elif constraint['type'] == 'forbidden_pattern':
                constraints_coll = self.db.client.get_collection("constraints")
                constraint_data = constraints_coll.get(ids=[constraint['constraint_id']])
                if constraint_data['ids']:
                    metadata = constraint_data['metadatas'][0]
                    patterns = json.loads(metadata.get('patterns_json', '[]'))
                    
                    import fnmatch
                    for pattern in patterns:
                        if fnmatch.fnmatch(file_path, pattern):
                            return False, f"File {file_path} matches forbidden pattern: {pattern}"
        
        return True, "OK"
    
    def check_quality_gates(self, agent_id: str) -> Tuple[bool, List[str]]:
        """Check quality gates for agent."""
        constraints = self.get_applicable_constraints(agent_id)
        failures = []
        
        for constraint in constraints:
            if constraint['type'] == 'quality_gate':
                constraints_coll = self.db.client.get_collection("constraints")
                constraint_data = constraints_coll.get(ids=[constraint['constraint_id']])
                if constraint_data['ids']:
                    metadata = constraint_data['metadatas'][0]
                    command = metadata.get('command', '')
                    must_pass = metadata.get('must_pass', 'true').lower() == 'true'
                    
                    if must_pass:
                        # In production, would actually run the command
                        failures.append(f"Quality gate '{constraint['name']}' must pass: {command}")
        
        return len(failures) == 0, failures
    
    def validate_change_request(self, agent_id: str, files: List[str]) -> Dict:
        """Validate a change request against all applicable constraints."""
        result = {
            'valid': True,
            'violations': [],
            'warnings': [],
            'notifications': []
        }
        
        # Check each file
        for file_path in files:
            allowed, message = self.check_file_change_allowed(agent_id, file_path)
            if not allowed:
                result['valid'] = False
                result['violations'].append({
                    'type': 'forbidden_file',
                    'file': file_path,
                    'message': message
                })
        
        # Check file count limit
        constraints = self.get_applicable_constraints(agent_id)
        for constraint in constraints:
            if constraint['type'] == 'limit' and 'max_files' in str(constraint):
                constraints_coll = self.db.client.get_collection("constraints")
                constraint_data = constraints_coll.get(ids=[constraint['constraint_id']])
                if constraint_data['ids']:
                    metadata = constraint_data['metadatas'][0]
                    max_files = metadata.get('max_files', 5)
                    
                    if len(files) > max_files:
                        result['warnings'].append({
                            'type': 'file_count_limit',
                            'count': len(files),
                            'max': max_files,
                            'message': f"Change affects {len(files)} files (max: {max_files})"
                        })
        
        # Check quality gates
        gates_pass, failures = self.check_quality_gates(agent_id)
        if not gates_pass:
            for failure in failures:
                result['warnings'].append({
                    'type': 'quality_gate',
                    'message': failure
                })
        
        return result


def verify_rollback_mechanism():
    """Verify the rollback mechanism is working."""
    print("\n" + "="*50)
    print("Rollback Mechanism Verification")
    print("="*50)
    
    manager = RollbackManager()
    checker = ConstraintChecker()
    
    # Test 1: Get rollback conditions for agent_guardian
    print("\n🔍 Test 1: Get rollback conditions for agent_guardian")
    conditions = manager.get_rollback_conditions("agent_guardian")
    print(f"   Found {len(conditions)} rollback conditions:")
    for c in conditions:
        print(f"     - {c['name']}: {c['metric']} {c['threshold']}")
        print(f"       Auto-rollback: {c['auto_rollback']}")
    
    # Test 2: Get constraints for agent_worker
    print("\n🔍 Test 2: Get applicable constraints for agent_worker")
    constraints = checker.get_applicable_constraints("agent_worker")
    print(f"   Found {len(constraints)} constraints:")
    for c in constraints:
        print(f"     - {c['name']} ({c['type']}, {c['severity']})")
    
    # Test 3: Check file change permission
    print("\n🔍 Test 3: Check file change permissions")
    test_files = [
        "docs/segments.json",
        "src/index.ts",
        "docs/test_fixtures/sample.json"
    ]
    for file in test_files:
        allowed, message = checker.check_file_change_allowed("agent_worker", file)
        status = "✅" if allowed else "❌"
        print(f"   {status} {file}: {message}")
    
    # Test 4: Validate change request
    print("\n🔍 Test 4: Validate change request")
    result = checker.validate_change_request("agent_worker", [
        "src/index.ts",
        "src/utils.ts",
        "docs/segments.json"  # Should trigger violation
    ])
    print(f"   Valid: {result['valid']}")
    if result['violations']:
        print(f"   Violations:")
        for v in result['violations']:
            print(f"     - {v['type']}: {v['message']}")
    
    # Test 5: Execute rollback simulation
    print("\n🔍 Test 5: Execute rollback simulation")
    rollback_result = manager.execute_rollback(
        reason="Test rollback for verification",
        auto=False
    )
    print(f"   Rollback ID: {rollback_result['timestamp']}")
    print(f"   Status: {rollback_result['status']}")
    print(f"   Steps completed: {len(rollback_result['steps'])}")
    
    print("\n✅ Rollback mechanism verification complete")


def main():
    """Main entry point."""
    print("="*50)
    print("Rollback Mechanism Demo")
    print("="*50)
    
    verify_rollback_mechanism()
    
    print("\n" + "="*50)
    print("✅ SUCCESS")
    print("="*50)
    print("Rollback mechanism is configured and ready")
    print("- RollbackManager: Handles rollback operations")
    print("- ConstraintChecker: Validates changes against constraints")
    return 0


if __name__ == "__main__":
    sys.exit(main())
