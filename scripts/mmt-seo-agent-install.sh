#!/bin/zsh
set -euo pipefail

PLIST_SRC="$(cd "$(dirname "$0")" && pwd)/com.mmt.seo-agent.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.mmt.seo-agent.plist"

echo "Installing MMT SEO Intelligence Agent..."

which claude || { echo "ERROR: claude CLI not in PATH. Install Claude Code first."; exit 1; }
which jq    || { echo "ERROR: jq not installed. Run: brew install jq"; exit 1; }
which python3 || { echo "ERROR: python3 not in PATH."; exit 1; }

mkdir -p "$(dirname "$0")/../.seo-agent/logs"

cp "$PLIST_SRC" "$PLIST_DST"
launchctl load "$PLIST_DST"

echo ""
echo "MMT SEO Agent installed."
echo "  Runs every Monday at 8am local time."
echo "  Logs: .seo-agent/logs/"
echo "  Status: launchctl list | grep mmt.seo-agent"
echo "  Manual run: bash scripts/mmt-seo-runner.sh"
echo "  Audit only: bash scripts/mmt-seo-agent.sh --audit"
echo "  Uninstall: bash scripts/mmt-seo-agent-uninstall.sh"
