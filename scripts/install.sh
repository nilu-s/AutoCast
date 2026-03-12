#!/bin/bash
# AutoCast – macOS Install Script
#
# Installs the AutoCast plugin into Premiere Pro's extensions folder.
#
# Usage: chmod +x install.sh && ./install.sh

echo ""
echo "═══════════════════════════════════════"
echo "  AutoCast Installer v1.0 (Beta)"
echo "  Premiere Pro Podcast Auto-Cutting"
echo "═══════════════════════════════════════"
echo ""

# --- 1. Determine source path ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$SOURCE_DIR/CSXS/manifest.xml" ]; then
    echo "ERROR: Could not find CSXS/manifest.xml"
    echo "Make sure this script is in the AutoCast/scripts/ folder."
    exit 1
fi

echo "[1/3] Source: $SOURCE_DIR"

# --- 2. Enable unsigned CEP extensions ---
echo "[2/3] Enabling unsigned CEP extensions..."

for ver in 11 12 13; do
    defaults write com.adobe.CSXS.${ver} PlayerDebugMode 1 2>/dev/null
    echo "  Set PlayerDebugMode=1 for CSXS.${ver}"
done
echo "  Done."

# --- 3. Copy to extensions directory ---
EXTENSIONS_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET_DIR="$EXTENSIONS_DIR/AutoCast"

echo "[3/3] Installing to: $TARGET_DIR"

# Create extensions directory if needed
mkdir -p "$EXTENSIONS_DIR"

# Remove old version
if [ -d "$TARGET_DIR" ]; then
    echo "  Removing previous version..."
    rm -rf "$TARGET_DIR"
fi

# Copy plugin files (exclude dev files)
mkdir -p "$TARGET_DIR"
rsync -a \
    --exclude='test/' \
    --exclude='packages/analyzer/test/' \
    --exclude='scripts/' \
    --exclude='.git/' \
    --exclude='node_modules/' \
    --exclude='*.md' \
    --exclude='.gitignore' \
    "$SOURCE_DIR/" "$TARGET_DIR/"

# Copy .debug for development
cp "$SOURCE_DIR/.debug" "$TARGET_DIR/.debug" 2>/dev/null || true

echo "  Copied plugin files."

# --- Done ---
echo ""
echo "═══════════════════════════════════════"
echo "  Installation complete!"
echo "═══════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. (Re)start Adobe Premiere Pro"
echo "  2. Go to: Window > Extensions > AutoCast"
echo ""
echo "Installed to: $TARGET_DIR"
