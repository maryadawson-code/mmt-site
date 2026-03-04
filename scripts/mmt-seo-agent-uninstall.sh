#!/bin/zsh
PLIST="$HOME/Library/LaunchAgents/com.mmt.seo-agent.plist"
[ -f "$PLIST" ] && launchctl unload "$PLIST" && rm "$PLIST" && echo "MMT SEO Agent uninstalled." || echo "Not installed."
