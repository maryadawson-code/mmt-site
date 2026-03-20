#!/bin/bash
# Wrapper for starting Claude Code sessions with auto-registration
# Usage: ./ops/claude-code-wrapper.sh "description of work"

REPO=$(basename $(git rev-parse --show-toplevel))
BRANCH=$(git rev-parse --abbrev-ref HEAD)
USER="${MMT_USER:-$(whoami)}"
DESC="${1:-Claude Code session}"
API="https://missionmeetstech.com/.netlify/functions/dev-workflow-api"
KEY="${COMMAND_CENTER_KEY}"

echo "Pre-flight check..."

# Check if we can work
PREFLIGHT=$(curl -s -X GET "${API}?view=can-i-work&repo=${REPO}&user=${USER}&branch=${BRANCH}&key=${KEY}" 2>/dev/null)

if echo "$PREFLIGHT" | grep -q '"allowed":false'; then
  echo "BLOCKED: Another session has an exclusive lock."
  echo "$PREFLIGHT" | python3 -m json.tool 2>/dev/null || echo "$PREFLIGHT"
  echo ""
  echo "Options:"
  echo "  1. Wait for the other session to finish"
  echo "  2. Ask the other developer to pause"
  echo "  3. Work on a different branch/area"
  exit 1
fi

if echo "$PREFLIGHT" | grep -q '"warnings":\[.\+\]'; then
  echo "WARNINGS:"
  echo "$PREFLIGHT" | python3 -c "import sys,json; [print('  -', w.get('message','')) for w in json.load(sys.stdin).get('warnings',[])]" 2>/dev/null
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 0; fi
fi

# Register session
echo "Registering session..."
SESSION=$(curl -s -X POST "${API}?key=${KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"start_session\",\"user\":\"${USER}\",\"userType\":\"human\",\"repo\":\"${REPO}\",\"branch\":\"${BRANCH}\",\"description\":\"${DESC}\",\"lockLevel\":\"warn\"}" 2>/dev/null)

SESSION_ID=$(echo "$SESSION" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session',{}).get('id',''))" 2>/dev/null)

if [ -z "$SESSION_ID" ]; then
  echo "Could not register session (API may be down). Continuing anyway."
else
  echo "Session registered: ${SESSION_ID}"

  # Start heartbeat in background
  (while true; do
    sleep 300
    FILES=$(git diff --name-only HEAD 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    if [ -n "$FILES" ]; then
      FILE_JSON=$(echo "$FILES" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')
    else
      FILE_JSON=""
    fi
    curl -s -X POST "${API}?key=${KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"heartbeat_session\",\"sessionId\":\"${SESSION_ID}\",\"files\":[${FILE_JSON}]}" > /dev/null 2>&1
  done) &
  HEARTBEAT_PID=$!

  # Trap exit to clean up
  trap "kill $HEARTBEAT_PID 2>/dev/null; curl -s -X POST '${API}?key=${KEY}' -H 'Content-Type: application/json' -d '{\"action\":\"end_session\",\"sessionId\":\"${SESSION_ID}\",\"status\":\"completed\"}' > /dev/null 2>&1; echo 'Session ended.'" EXIT
fi

echo ""
echo "Starting Claude Code..."
echo "   Session will auto-end when you exit."
echo ""
