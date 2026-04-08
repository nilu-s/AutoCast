#!/usr/bin/env python3
"""Start script for AutoCast Orchestrator.

Starts the orchestrator daemon that runs continuously,
processing workflows and dispatching tasks.
"""

import argparse
import logging
import signal
import sys
import time
from pathlib import Path

# Add workspace to path
workspace = Path(__file__).parent
sys.path.insert(0, str(workspace))

from orchestrator.orchestrator import Orchestrator


def setup_logging(verbose: bool = False, log_file: Optional[str] = None):
    """Setup logging configuration."""
    level = logging.DEBUG if verbose else logging.INFO
    
    handlers = [logging.StreamHandler()]
    
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_file))
    
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=handlers
    )


def main():
    parser = argparse.ArgumentParser(
        description="AutoCast Orchestrator - Workflow Management Daemon"
    )
    parser.add_argument(
        "--interval", "-i",
        type=float,
        default=5.0,
        help="Poll interval in seconds (default: 5.0)"
    )
    parser.add_argument(
        "--dispatch-method", "-m",
        choices=["mock", "subprocess", "openclaw"],
        default="mock",
        help="Task dispatch method (default: mock)"
    )
    parser.add_argument(
        "--log-file", "-l",
        help="Log file path"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose logging"
    )
    parser.add_argument(
        "--daemon", "-d",
        action="store_true",
        help="Run as daemon (background process)"
    )
    parser.add_argument(
        "--pid-file",
        default="/tmp/autocast_orchestrator.pid",
        help="PID file location"
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(verbose=args.verbose, log_file=args.log_file)
    logger = logging.getLogger(__name__)
    
    # Write PID file if daemon mode
    if args.daemon:
        pid_path = Path(args.pid_file)
        pid_path.write_text(str(os.getpid()))
    
    # Create and start orchestrator
    logger.info("=" * 60)
    logger.info("AutoCast Orchestrator Starting")
    logger.info("=" * 60)
    logger.info(f"Dispatch method: {args.dispatch_method}")
    logger.info(f"Poll interval: {args.interval}s")
    
    try:
        orchestrator = Orchestrator(
            dispatch_method=args.dispatch_method
        )
        
        # Setup signal handlers
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}, shutting down...")
            orchestrator.stop()
        
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
        
        # Start the main loop
        orchestrator.run(interval_seconds=args.interval)
        
    except Exception as e:
        logger.exception("Orchestrator failed")
        return 1
    finally:
        if args.daemon and 'pid_path' in locals():
            pid_path.unlink(missing_ok=True)
    
    logger.info("Orchestrator stopped")
    return 0


if __name__ == "__main__":
    import os
    from typing import Optional
    
    sys.exit(main())
