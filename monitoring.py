#!/usr/bin/env python3
"""
L5 Monitoring & Alerts

Handles notifications for:
- Run completion reports
- Performance alerts
- Safety guard triggers
- Dashboard updates

Supports: Telegram, Discord, Console
"""

import sys
import json
import os
import re
from datetime import datetime
from pathlib import Path
from enum import Enum
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import urllib.request
import urllib.error

workspace = Path(__file__).parent


class NotificationLevel(Enum):
    """Notification severity levels."""
    DEBUG = "debug"
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class Notification:
    """Single notification."""
    level: NotificationLevel
    title: str
    message: str
    timestamp: str
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class NotificationFormatter:
    """Format notifications for different channels."""
    
    @staticmethod
    def emoji_for_level(level: NotificationLevel) -> str:
        """Get emoji for notification level."""
        return {
            NotificationLevel.DEBUG: "🔍",
            NotificationLevel.INFO: "ℹ️",
            NotificationLevel.SUCCESS: "✅",
            NotificationLevel.WARNING: "⚠️",
            NotificationLevel.CRITICAL: "🚨"
        }.get(level, "📢")
    
    @staticmethod
    def format_telegram(notification: Notification) -> str:
        """Format for Telegram."""
        emoji = NotificationFormatter.emoji_for_level(notification.level)
        text = f"{emoji} *{notification.title}*\n\n"
        text += notification.message
        text += f"\n\n_🕐 {notification.timestamp[:19]}_"
        return text
    
    @staticmethod
    def format_discord(notification: Notification) -> Dict:
        """Format for Discord webhook."""
        colors = {
            NotificationLevel.DEBUG: 0x808080,
            NotificationLevel.INFO: 0x3498db,
            NotificationLevel.SUCCESS: 0x2ecc71,
            NotificationLevel.WARNING: 0xf39c12,
            NotificationLevel.CRITICAL: 0xe74c3c
        }
        
        return {
            "embeds": [{
                "title": notification.title,
                "description": notification.message,
                "color": colors.get(notification.level, 0x95a5a6),
                "timestamp": notification.timestamp,
                "footer": {
                    "text": "AutoCast L5"
                }
            }]
        }
    
    @staticmethod
    def format_console(notification: Notification) -> str:
        """Format for console output."""
        emoji = NotificationFormatter.emoji_for_level(notification.level)
        lines = [
            f"\n{'='*60}",
            f"{emoji} {notification.level.value.upper()}: {notification.title}",
            f"{'='*60}",
            notification.message,
            f"\n🕐 {notification.timestamp[:19]}"
        ]
        return "\n".join(lines)


class TelegramNotifier:
    """Send notifications via Telegram."""
    
    def __init__(self, bot_token: Optional[str] = None, chat_id: Optional[str] = None):
        self.bot_token = bot_token or os.getenv("TELEGRAM_BOT_TOKEN")
        self.chat_id = chat_id or os.getenv("TELEGRAM_CHAT_ID")
        self.enabled = bool(self.bot_token and self.chat_id)
    
    def send(self, message: str, parse_mode: str = "Markdown") -> bool:
        """Send message to Telegram."""
        if not self.enabled:
            return False
        
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            data = {
                "chat_id": self.chat_id,
                "text": message,
                "parse_mode": parse_mode
            }
            
            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method='POST'
            )
            
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode())
                return result.get("ok", False)
                
        except Exception as e:
            print(f"⚠️ Telegram send failed: {e}")
            return False


class DiscordNotifier:
    """Send notifications via Discord webhook."""
    
    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or os.getenv("DISCORD_WEBHOOK_URL")
        self.enabled = bool(self.webhook_url)
    
    def send(self, embed: Dict) -> bool:
        """Send embed to Discord webhook."""
        if not self.enabled:
            return False
        
        try:
            req = urllib.request.Request(
                self.webhook_url,
                data=json.dumps(embed).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method='POST'
            )
            
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status == 204
                
        except Exception as e:
            print(f"⚠️ Discord send failed: {e}")
            return False


class MonitoringManager:
    """
    Main monitoring manager for L5 autonomy.
    
    Coordinates notifications across multiple channels.
    """
    
    def __init__(self):
        self.telegram = TelegramNotifier()
        self.discord = DiscordNotifier()
        self.formatter = NotificationFormatter()
        self.notifications: List[Notification] = []
        
        # Dashboard state
        self.dashboard_file = workspace / ".autocast" / "dashboard.json"
        self.dashboard_file.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"📢 Monitoring initialized:")
        print(f"   Telegram: {'✅' if self.telegram.enabled else '❌'}")
        print(f"   Discord: {'✅' if self.discord.enabled else '❌'}")
    
    def send_alert(
        self,
        level: NotificationLevel,
        title: str,
        message: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, bool]:
        """
        Send alert through all configured channels.
        
        Args:
            level: Severity level
            title: Alert title
            message: Alert message
            metadata: Optional metadata
        
        Returns:
            Dict of channel -> success status
        """
        notification = Notification(
            level=level,
            title=title,
            message=message,
            timestamp=datetime.utcnow().isoformat(),
            metadata=metadata
        )
        
        self.notifications.append(notification)
        
        # Always print to console
        print(self.formatter.format_console(notification))
        
        results = {
            "console": True,
            "telegram": False,
            "discord": False,
            "dashboard": False
        }
        
        # Telegram
        if self.telegram.enabled and level in [NotificationLevel.INFO, NotificationLevel.SUCCESS, NotificationLevel.WARNING, NotificationLevel.CRITICAL]:
            telegram_msg = self.formatter.format_telegram(notification)
            results["telegram"] = self.telegram.send(telegram_msg)
        
        # Discord
        if self.discord.enabled and level in [NotificationLevel.WARNING, NotificationLevel.CRITICAL]:
            discord_embed = self.formatter.format_discord(notification)
            results["discord"] = self.discord.send(discord_embed)
        
        # Update dashboard
        results["dashboard"] = self._update_dashboard(notification)
        
        return results
    
    def _update_dashboard(self, notification: Notification) -> bool:
        """Update dashboard file."""
        try:
            dashboard = self.get_dashboard()
            
            # Add to recent alerts
            dashboard["recent_alerts"].insert(0, {
                "level": notification.level.value,
                "title": notification.title,
                "message": notification.message[:200],  # Truncate
                "timestamp": notification.timestamp
            })
            
            # Keep only last 50
            dashboard["recent_alerts"] = dashboard["recent_alerts"][:50]
            dashboard["last_updated"] = datetime.utcnow().isoformat()
            
            with open(self.dashboard_file, 'w') as f:
                json.dump(dashboard, f, indent=2)
            
            return True
        except Exception as e:
            print(f"⚠️ Dashboard update failed: {e}")
            return False
    
    def get_dashboard(self) -> Dict:
        """Get current dashboard state."""
        if self.dashboard_file.exists():
            try:
                with open(self.dashboard_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        
        return {
            "status": "unknown",
            "current_run": 0,
            "total_runs": 0,
            "recent_alerts": [],
            "last_updated": datetime.utcnow().isoformat()
        }
    
    def update_run_status(
        self,
        run_number: int,
        total_runs: int,
        current_improvement: float,
        status: str = "running"
    ):
        """Update dashboard with current run status."""
        try:
            dashboard = self.get_dashboard()
            dashboard.update({
                "status": status,
                "current_run": run_number,
                "total_runs": total_runs,
                "current_improvement": current_improvement,
                "last_updated": datetime.utcnow().isoformat()
            })
            
            with open(self.dashboard_file, 'w') as f:
                json.dump(dashboard, f, indent=2)
                
        except Exception as e:
            print(f"⚠️ Status update failed: {e}")
    
    def send_run_completion_report(
        self,
        run_number: int,
        wer_before: float,
        wer_after: float,
        method_used: str,
        duration_seconds: float
    ):
        """Send detailed run completion report."""
        improvement = wer_before - wer_after
        improvement_pct = (improvement / wer_before) * 100 if wer_before > 0 else 0
        
        emoji = "✅" if improvement > 0 else "⚠️" if improvement == 0 else "❌"
        
        title = f"{emoji} Run #{run_number} Complete"
        
        message = f"📊 **Results:**\n"
        message += f"   WER: `{wer_before:.3f}` → `{wer_after:.3f}`\n"
        message += f"   Change: `{improvement:+.3f}` ({improvement_pct:+.1f}%)\n\n"
        message += f"🔧 **Method:** `{method_used}`\n"
        message += f"⏱️ **Duration:** `{duration_seconds:.1f}s`"
        
        level = NotificationLevel.SUCCESS if improvement > 0 else NotificationLevel.WARNING
        
        return self.send_alert(level, title, message, {
            "run_number": run_number,
            "improvement": improvement,
            "method": method_used
        })
    
    def send_performance_alert(self, current_avg: float, previous_avg: float):
        """Alert when performance changes significantly."""
        change = current_avg - previous_avg
        change_pct = (change / abs(previous_avg)) * 100 if previous_avg != 0 else 0
        
        if change < -0.01:  # Performance dropped
            title = "⚠️ Performance Alert"
            message = f"Average improvement dropped:\n"
            message += f"   Before: `{previous_avg:.4f}`\n"
            message += f"   Now: `{current_avg:.4f}`\n"
            message += f"   Change: `{change:+.4f}` ({change_pct:+.1f}%)\n\n"
            message += "Consider reviewing strategy or triggering rollback."
            
            return self.send_alert(NotificationLevel.WARNING, title, message)
        
        return None
    
    def generate_summary_report(self, stats: Dict) -> str:
        """Generate a summary report."""
        lines = [
            "📊 **AUTOCAST L5 SUMMARY REPORT**",
            "",
            f"🕐 Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            "",
            "📈 **Statistics:**",
            f"   Total Runs: `{stats.get('total_runs', 0)}`",
            f"   Successful: `{stats.get('successful_runs', 0)}`",
            f"   Failed: `{stats.get('total_runs', 0) - stats.get('successful_runs', 0)}`",
            f"   Success Rate: `{stats.get('success_rate', 0):.1f}%`",
            "",
            "🎯 **Performance:**",
            f"   Average Improvement: `{stats.get('avg_improvement', 0):.4f}`",
            f"   Best Run: `{stats.get('best_improvement', 0):.4f}`",
            f"   Recent Trend: `{stats.get('trend', 'stable')}`",
        ]
        
        return "\n".join(lines)
    
    def get_notification_history(self, limit: int = 50) -> List[Notification]:
        """Get recent notification history."""
        return self.notifications[-limit:]


def main():
    """Test the monitoring system."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test L5 Monitoring")
    parser.add_argument("--test", action="store_true", help="Send test notifications")
    parser.add_argument("--dashboard", action="store_true", help="Show dashboard")
    
    args = parser.parse_args()
    
    monitor = MonitoringManager()
    
    if args.test:
        print("Sending test notifications...")
        
        monitor.send_alert(
            NotificationLevel.INFO,
            "🧪 Test Notification",
            "This is a test of the L5 monitoring system.\nIf you see this, notifications are working!"
        )
        
        monitor.send_alert(
            NotificationLevel.SUCCESS,
            "✅ Run #42 Complete",
            "WER: 0.23 → 0.18 (-21.7%)\nMethod: fine_tune_whisper\nDuration: 452s"
        )
        
        monitor.send_alert(
            NotificationLevel.WARNING,
            "⚠️ Performance Declining",
            "Average improvement dropped over last 5 runs.\nConsider reviewing strategy."
        )
        
        print("\n✅ Test notifications sent")
    
    if args.dashboard:
        dashboard = monitor.get_dashboard()
        print("\n📊 Current Dashboard:")
        print(json.dumps(dashboard, indent=2))
    
    if not args.test and not args.dashboard:
        print("Monitoring system ready")
        print(f"Dashboard file: {monitor.dashboard_file}")
        print("\nUse --test to send test notifications")
        print("Use --dashboard to view current state")


if __name__ == "__main__":
    main()
