#!/bin/bash
# AutoCast - macOS Uninstall Script

echo ""
echo "======================================"
echo " AutoCast Uninstaller"
echo "======================================"
echo ""

TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/AutoCast"

if [ -d "$TARGET" ]; then
    rm -rf "$TARGET"
    echo "[OK] Removed: $TARGET"
else
    echo "[INFO] AutoCast is not installed."
fi

echo ""
read -p "Disable debug mode for CSXS 11/12/13 as well? (y/n): " DISABLE_DEBUG
if [ "$DISABLE_DEBUG" = "y" ] || [ "$DISABLE_DEBUG" = "Y" ]; then
    for ver in 11 12 13; do
        defaults delete com.adobe.CSXS.${ver} PlayerDebugMode 2>/dev/null || true
    done
    echo "[OK] Debug mode keys removed."
else
    echo "[INFO] Debug mode unchanged."
fi

echo ""
echo "Restart Premiere Pro to complete uninstallation."
echo ""
read -p "Press Enter to exit..."
