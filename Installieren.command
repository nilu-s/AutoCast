#!/bin/bash
# AutoCast – macOS Installer
# Einfach doppelklicken im Finder!

clear
echo ""
echo "  ======================================"
echo "   AutoCast Installer"
echo "   Premiere Pro Podcast Auto-Ducking"
echo "  ======================================"
echo ""
echo "  Installiere AutoCast fuer Premiere Pro..."
echo ""

# --- 1. Enable unsigned extensions ---
for ver in 11 12 13; do
    defaults write com.adobe.CSXS.${ver} PlayerDebugMode 1 2>/dev/null
done
echo "  [OK] Premiere Erweiterungen aktiviert."

# --- 2. Find source folder (where this script lives) ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/CSXS/manifest.xml" ]; then
    SOURCE="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/AutoCast/CSXS/manifest.xml" ]; then
    SOURCE="$SCRIPT_DIR/AutoCast"
else
    echo ""
    echo "  FEHLER: Kann den AutoCast-Ordner nicht finden."
    echo "  Stelle sicher dass diese Datei im AutoCast-Ordner liegt."
    echo ""
    read -p "  Druecke Enter zum Beenden..."
    exit 1
fi

# --- 3. Copy to extensions folder ---
TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/AutoCast"

if [ -d "$TARGET" ]; then
    echo "  Entferne alte Version..."
    rm -rf "$TARGET"
fi

mkdir -p "$TARGET"
cp -R "$SOURCE/" "$TARGET/"

echo "  [OK] Plugin installiert."

# --- Done ---
echo ""
echo "  ======================================"
echo ""
echo "   Installation erfolgreich!"
echo ""
echo "   So gehts weiter:"
echo "     1. Premiere Pro starten (oder neustarten)"
echo "     2. Oben im Menue: Fenster > Erweiterungen > AutoCast"
echo ""
echo "  ======================================"
echo ""
read -p "  Druecke Enter zum Beenden..."
