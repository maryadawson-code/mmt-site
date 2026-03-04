#!/bin/zsh
set -euo pipefail

PLIST_SRC="$(cd "$(dirname "$0")" && pwd)/com.mmt.sentinel.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.mmt.sentinel.plist"

# Confirm claude CLI is accessible
which claude || { echo "ERROR: claude not in PATH. Install Claude Code first."; exit 1; }

echo "Installing MMT Website Sentinel..."
mkdir -p "$(dirname "$0")/../.sentinel/logs"
cp "$PLIST_SRC" "$PLIST_DST"
launchctl load "$PLIST_DST"
echo "MMT Sentinel installed. Health checks every 6 hours."
echo "  Logs: .sentinel/logs/"
echo "  Status: launchctl list | grep mmt.sentinel"
echo "  Uninstall: bash scripts/mmt-sentinel-uninstall.sh"
