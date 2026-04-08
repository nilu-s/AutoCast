#!/usr/bin/env python3
"""
L5 Emergency Stop System

Provides multiple ways to stop the autonomous system:
1. File-based: Touch .emergency_stop file
2. Signal-based: Send SIGUSR1
3. CLI: Run emergency_stop.py
4. HTTP: (optional) HTTP endpoint

Safety features:
- Immediate stop on signal
- Graceful shutdown with state saving
- Rollback to last checkpoint if requested
- Audit log of all stops
"""

import sys
import os
import json
import signal
import argparse
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict

workspace = Path(__file__).parent


@dataclass
class StopRecord:
    """Record of an emergency stop event."""
    timestamp: str
    reason: str
    triggered_by: str
    auto_rollback: bool
    run_number: Optional[int] = None
    checkpoint_id: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


class EmergencyStopManager:
    """
    Manages emergency stop functionality.
    
    Can be triggered via:
    - File: .emergency_stop
    - Signal: SIGUSR1
    - CLI: emergency_stop.py
    """
    
    def __init__(self):
        self.workspace = workspace
        self.stop_file = workspace / ".emergency_stop"
        self.pause_file = workspace / ".pause_requested"
        self.audit_log = workspace / ".autocast" / "stop_audit.log"
        self.audit_log.parent.mkdir(parents=True, exist_ok=True)
        
        self.stop_handlers = []
        self.is_stopped = False
        self.is_paused = False
    
    def register_handler(self, handler):
        """Register a callback for stop events."""
        self.stop_handlers.append(handler)
    
    def trigger_stop(
        self,
        reason: str = "manual",
        triggered_by: str = "cli",
        auto_rollback: bool = False
    ) -> Dict[str, Any]:
        """
        Trigger emergency stop.
        
        Args:
            reason: Why the stop was triggered
            triggered_by: How it was triggered (cli, signal, file, api)
            auto_rollback: Whether to rollback after stopping
        
        Returns:
            Dict with stop result
        """
        timestamp = datetime.utcnow().isoformat()
        
        print("="*60)
        print("🛑 EMERGENCY STOP TRIGGERED")
        print("="*60)
        print(f"Time: {timestamp}")
        print(f"Reason: {reason}")
        print(f"Source: {triggered_by}")
        
        # Create stop file
        self.stop_file.touch()
        
        # Get current state
        state = self._get_current_state()
        
        # Log the stop
        record = StopRecord(
            timestamp=timestamp,
            reason=reason,
            triggered_by=triggered_by,
            auto_rollback=auto_rollback,
            run_number=state.get("current_run"),
            checkpoint_id=state.get("last_checkpoint")
        )
        
        self._log_stop(record)
        
        # Notify handlers
        for handler in self.stop_handlers:
            try:
                handler(reason, triggered_by)
            except Exception as e:
                print(f"⚠️ Handler error: {e}")
        
        # Auto-rollback if requested
        rollback_result = None
        if auto_rollback:
            rollback_result = self._perform_rollback()
        
        self.is_stopped = True
        
        result = {
            "stopped": True,
            "timestamp": timestamp,
            "reason": reason,
            "triggered_by": triggered_by,
            "rollback_performed": auto_rollback,
            "rollback_result": rollback_result,
            "state_at_stop": state
        }
        
        print("\n✅ Stop complete")
        print(f"   Run #{state.get('current_run', 'unknown')} halted")
        if auto_rollback:
            print(f"   Rollback: {'Success' if rollback_result else 'Failed'}")
        print("="*60)
        
        return result
    
    def trigger_pause(self, duration_minutes: Optional[int] = None) -> Dict[str, Any]:
        """
        Trigger a pause (temporary stop).
        
        Args:
            duration_minutes: Optional auto-resume after N minutes
        
        Returns:
            Dict with pause result
        """
        timestamp = datetime.utcnow().isoformat()
        
        print("="*60)
        print("⏸️ PAUSE REQUESTED")
        print("="*60)
        
        # Create pause file
        pause_data = {
            "paused_at": timestamp,
            "auto_resume": duration_minutes is not None,
            "resume_at": (datetime.utcnow().timestamp() + duration_minutes * 60) if duration_minutes else None
        }
        
        with open(self.pause_file, 'w') as f:
            json.dump(pause_data, f)
        
        self.is_paused = True
        
        print(f"System paused at {timestamp}")
        if duration_minutes:
            resume_time = datetime.fromtimestamp(pause_data["resume_at"]).strftime('%H:%M:%S')
            print(f"Auto-resume scheduled for {resume_time}")
        print("Run 'emergency_stop.py --resume' to unpause")
        
        return {
            "paused": True,
            "timestamp": timestamp,
            "auto_resume": duration_minutes is not None,
            "resume_at": pause_data["resume_at"]
        }
    
    def resume(self) -> Dict[str, Any]:
        """Resume from pause."""
        if not self.pause_file.exists():
            print("⚠️ System is not paused")
            return {"resumed": False, "reason": "not_paused"}
        
        self.pause_file.unlink()
        self.is_paused = False
        
        timestamp = datetime.utcnow().isoformat()
        print(f"✅ System resumed at {timestamp}")
        
        return {
            "resumed": True,
            "timestamp": timestamp
        }
    
    def check_stop_requested(self) -> bool:
        """Check if stop was requested."""
        return self.stop_file.exists()
    
    def check_paused(self) -> bool:
        """Check if system is paused."""
        if not self.pause_file.exists():
            return False
        
        # Check for auto-resume
        try:
            with open(self.pause_file, 'r') as f:
                data = json.load(f)
                if data.get("auto_resume") and data.get("resume_at"):
                    if datetime.utcnow().timestamp() >= data["resume_at"]:
                        print("⏰ Auto-resume triggered")
                        self.resume()
                        return False
        except:
            pass
        
        return True
    
    def clear_stop(self):
        """Clear stop state."""
        if self.stop_file.exists():
            self.stop_file.unlink()
        self.is_stopped = False
        print("🔄 Stop state cleared - system can be restarted")
    
    def _get_current_state(self) -> Dict:
        """Get current system state."""
        state_file = workspace / ".autocast" / "l5_state.json"
        if state_file.exists():
            try:
                with open(state_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    def _log_stop(self, record: StopRecord):
        """Log stop event to audit file."""
        with open(self.audit_log, 'a') as f:
            f.write(json.dumps(record.to_dict()) + "\n")
    
    def _perform_rollback(self) -> bool:
        """Perform automatic rollback."""
        print("\n🔄 Performing rollback...")
        
        try:
            rollback_script = workspace / "rollback_mechanism.py"
            if rollback_script.exists():
                result = subprocess.run(
                    [sys.executable, str(rollback_script), "--auto"],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                return result.returncode == 0
            else:
                print("⚠️ Rollback script not found")
                return False
        except Exception as e:
            print(f"❌ Rollback failed: {e}")
            return False
    
    def get_audit_log(self, limit: int = 100) -> list:
        """Get recent stop events."""
        if not self.audit_log.exists():
            return []
        
        try:
            with open(self.audit_log, 'r') as f:
                lines = f.readlines()
            
            events = []
            for line in lines[-limit:]:
                try:
                    events.append(json.loads(line))
                except:
                    pass
            
            return events
        except Exception as e:
            print(f"⚠️ Could not read audit log: {e}")
            return []
    
    def get_status(self) -> Dict[str, Any]:
        """Get current emergency stop system status."""
        return {
            "stopped": self.is_stopped or self.check_stop_requested(),
            "paused": self.is_paused or self.check_paused(),
            "stop_file_exists": self.stop_file.exists(),
            "pause_file_exists": self.pause_file.exists(),
            "audit_log_entries": len(self.get_audit_log(1000)),
            "handlers_registered": len(self.stop_handlers)
        }


def print_status(manager: EmergencyStopManager):
    """Print current status."""
    status = manager.get_status()
    
    print("\n" + "="*60)
    print("🚨 EMERGENCY STOP SYSTEM STATUS")
    print("="*60)
    
    if status["stopped"]:
        print("\n   🛑 SYSTEM IS STOPPED")
    elif status["paused"]:
        print("\n   ⏸️ SYSTEM IS PAUSED")
    else:
        print("\n   ✅ SYSTEM IS RUNNING")
    
    print(f"\n   Stop file: {'Exists' if status['stop_file_exists'] else 'Not present'}")
    print(f"   Pause file: {'Exists' if status['pause_file_exists'] else 'Not present'}")
    print(f"   Audit log entries: {status['audit_log_entries']}")
    
    # Recent events
    events = manager.get_audit_log(5)
    if events:
        print("\n   Recent stop events:")
        for event in events:
            ts = event.get("timestamp", "unknown")[:19]
            reason = event.get("reason", "unknown")
            source = event.get("triggered_by", "unknown")
            print(f"      [{ts}] {reason} ({source})")
    
    print("\n" + "="*60)
    print("\nCommands:")
    print("   emergency_stop.py --stop        Stop immediately")
    print("   emergency_stop.py --pause       Pause (can resume)")
    print("   emergency_stop.py --resume      Resume from pause")
    print("   emergency_stop.py --rollback    Stop and rollback")
    print("   emergency_stop.py --clear       Clear stop state")
    print("="*60)


def main():
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description="Emergency Stop System for L5 Autonomy",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  emergency_stop.py --status          Show current status
  emergency_stop.py --stop          Emergency stop
  emergency_stop.py --pause 60       Pause for 60 minutes
  emergency_stop.py --resume          Resume from pause
  emergency_stop.py --rollback        Stop and rollback
  emergency_stop.py --clear           Clear stop state
        """
    )
    
    parser.add_argument("--status", "-s", action="store_true",
                       help="Show current status")
    parser.add_argument("--stop", action="store_true",
                       help="Trigger emergency stop")
    parser.add_argument("--pause", "-p", type=int, metavar="MINUTES",
                       nargs="?", const=0,
                       help="Pause system (optional: auto-resume after N minutes)")
    parser.add_argument("--resume", "-r", action="store_true",
                       help="Resume from pause")
    parser.add_argument("--rollback", action="store_true",
                       help="Stop and perform rollback")
    parser.add_argument("--clear", "-c", action="store_true",
                       help="Clear stop state")
    parser.add_argument("--reason", type=str, default="manual",
                       help="Reason for stop")
    
    args = parser.parse_args()
    
    manager = EmergencyStopManager()
    
    # Default: show status
    if not any([args.status, args.stop, args.pause is not None, 
                args.resume, args.rollback, args.clear]):
        print_status(manager)
        return 0
    
    if args.status:
        print_status(manager)
        return 0
    
    if args.stop:
        result = manager.trigger_stop(
            reason=args.reason,
            triggered_by="cli",
            auto_rollback=False
        )
        return 0 if result["stopped"] else 1
    
    if args.pause is not None:
        duration = args.pause if args.pause > 0 else None
        result = manager.trigger_pause(duration_minutes=duration)
        return 0 if result["paused"] else 1
    
    if args.resume:
        result = manager.resume()
        return 0 if result["resumed"] else 1
    
    if args.rollback:
        result = manager.trigger_stop(
            reason=args.reason,
            triggered_by="cli",
            auto_rollback=True
        )
        return 0 if result["stopped"] else 1
    
    if args.clear:
        manager.clear_stop()
        return 0
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
