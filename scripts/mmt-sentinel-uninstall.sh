#!/bin/zsh
PLIST="$HOME/Library/LaunchAgents/com.mmt.sentinel.plist"
if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST"
  rm "$PLIST"
  echo "MMT Sentinel uninstalled."
else
  echo "MMT Sentinel not installed."
fi
