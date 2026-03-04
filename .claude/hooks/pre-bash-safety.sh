#!/bin/zsh
# Pre-Bash safety hook — blocks dangerous commands from running autonomously
# Read the command from stdin (Claude Code passes tool input as JSON)
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.command // ""')

# Hard blocks — commands that must never run autonomously
BLOCKED_PATTERNS=(
  "rm -rf"
  "git push"
  "git checkout main"
  "DROP DATABASE"
  "DELETE FROM"
  "curl.*-X DELETE"
  "curl.*-X PUT"
  "curl.*-X POST"
  "netlify.*--prod"
  "chmod.*777"
)

for PATTERN in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qiE "$PATTERN"; then
    echo "HOOK BLOCKED: Command matches blocked pattern '$PATTERN'" >&2
    echo "Command was: $CMD" >&2
    exit 2
  fi
done

exit 0
