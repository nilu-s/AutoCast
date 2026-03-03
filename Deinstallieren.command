#!/bin/bash
# AutoCast – macOS Deinstallieren

clear
echo ""
echo "  AutoCast wird deinstalliert..."
echo ""

TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/AutoCast"

if [ -d "$TARGET" ]; then
    rm -rf "$TARGET"
    echo "  [OK] AutoCast wurde entfernt."
else
    echo "  AutoCast ist nicht installiert."
fi

echo ""
echo "  Bitte Premiere Pro neustarten."
echo ""
read -p "  Drücke Enter zum Beenden..."
