#!/bin/zsh
# MMT Sentinel Cron Runner
# Uses -l flag to preserve login shell PATH and Node.js versions
set -euo pipefail

PROJECT_DIR="$HOME/mmt-site"
LOG_DIR="$PROJECT_DIR/.sentinel/logs"
LOCK_FILE="$PROJECT_DIR/.sentinel/sentinel.lock"

mkdir -p "$LOG_DIR"

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCK_FILE") ))
  if [ "$LOCK_AGE" -lt 300 ]; then
    echo "$(date -u +%FT%TZ) MMT Sentinel already running. Skipping." >> "$LOG_DIR/sentinel.log"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi

trap 'rm -f "$LOCK_FILE"' EXIT
touch "$LOCK_FILE"

LOGFILE="$LOG_DIR/mmt-sentinel-$(date -u +%Y%m%d-%H%M%S).json"

cd "$PROJECT_DIR"

# Capture session output including session_id for potential resume
RESULT=$(claude -p \
  --output-format json \
  --max-turns 10 \
  --max-budget-usd 0.25 \
  --allowedTools "Read,Grep,Glob,Bash(curl *),Bash(jq *),Bash(openssl *),Bash(scripts/mmt-health-check.sh *)" \
  "You are MMT Sentinel monitoring missionmeetstech.com.
1. Run scripts/mmt-health-check.sh --json
2. Analyze results using the decision tree in agent_docs/sentinel-runbook.md
3. Classify as L0/L1/L2/L3 per CLAUDE.md autonomy levels
4. For L2: fix only pre-approved patterns (broken internal links, typos)
5. Output full monitoring report in Sentinel JSON format
6. If critical issues found, include alert details for GitHub issue creation
7. Never push, never modify _headers or _redirects, never exceed your tool allowlist" \
  2>&1)

echo "$RESULT" > "$LOGFILE"

# Extract session_id for potential resume
SESSION_ID=$(echo "$RESULT" | jq -r '.[].session_id // ""' 2>/dev/null || echo "")
if [ -n "$SESSION_ID" ]; then
  echo "$SESSION_ID" > "$LOG_DIR/last-session-id.txt"
fi

echo "$(date -u +%FT%TZ) Health check complete. Log: $LOGFILE" >> "$LOG_DIR/sentinel.log"

# Prune logs older than 30 days
find "$LOG_DIR" -name "mmt-sentinel-*.json" -mtime +30 -delete 2>/dev/null || true
