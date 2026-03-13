#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$ROOT_DIR/scripts/uninstall.sh"

if [ ! -f "$SCRIPT" ]; then
    echo "ERROR: $SCRIPT not found."
    read -p "Press Enter to exit..."
    exit 1
fi

chmod +x "$SCRIPT"
"$SCRIPT"
