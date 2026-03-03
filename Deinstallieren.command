#!/bin/bash
# AutoCast – macOS Deinstallieren

clear
echo ""
echo "  ======================================"
echo "   AutoCast Deinstallieren"
echo "  ======================================"
echo ""

TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/AutoCast"

if [ -d "$TARGET" ]; then
    rm -rf "$TARGET"
    echo "  [OK] AutoCast wurde entfernt."
else
    echo "  AutoCast ist nicht installiert."
fi

echo ""
echo "  Debug-Modus deaktivieren?"
echo "  (Nur noetig wenn du keine anderen Premiere-Plugins im Debug-Modus nutzt)"
echo ""
read -p "  Deaktivieren? (j/n): " RESET_DEBUG

if [ "$RESET_DEBUG" = "j" ] || [ "$RESET_DEBUG" = "J" ]; then
    for ver in 11 12 13; do
        defaults delete com.adobe.CSXS.${ver} PlayerDebugMode 2>/dev/null
    done
    echo "  [OK] Debug-Modus deaktiviert."
else
    echo "  Debug-Modus bleibt aktiv."
fi

echo ""
echo "  Bitte Premiere Pro neustarten."
echo ""
read -p "  Druecke Enter zum Beenden..."
