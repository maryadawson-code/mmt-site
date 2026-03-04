#!/bin/zsh
# Post-Bash verify hook — logs all bash tool calls for audit trail
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.command // ""')

# Ensure log directory exists
LOG_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")/.sentinel/logs"
mkdir -p "$LOG_DIR"

echo "$(date -u +%FT%TZ) BASH_TOOL: $CMD" >> "$LOG_DIR/tool-audit.log"
exit 0
