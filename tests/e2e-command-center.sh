#!/usr/bin/env bash
# E2E tests for mmt-site Command Center API
# Usage: API_KEY=your-key bash tests/e2e-command-center.sh
# Exit 0 on all-pass, 1 on any failure

set -euo pipefail

BASE_URL="${BASE_URL:-https://missionmeetstech.com}"
API_KEY="${API_KEY:-${COMMAND_CENTER_KEY:-}}"

if [ -z "$API_KEY" ]; then
  echo "ERROR: API_KEY or COMMAND_CENTER_KEY env var required"
  exit 1
fi

PASS=0
FAIL=0
RESULTS=()

pass() { PASS=$((PASS + 1)); RESULTS+=("✅ PASS: $1"); }
fail() { FAIL=$((FAIL + 1)); RESULTS+=("❌ FAIL: $1 — $2"); }

# Helper: GET request, check status and JSON shape
test_get() {
  local name="$1" url="$2" expected_key="$3"
  local status body
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 15)
  if [ "$status" != "200" ]; then
    fail "$name" "HTTP $status"
    return
  fi
  body=$(curl -s "$url" --max-time 15)
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$expected_key' in d" 2>/dev/null; then
    pass "$name"
  else
    fail "$name" "Missing key '$expected_key' in response"
  fi
}

# Helper: POST request
test_post() {
  local name="$1" url="$2" payload="$3" expected_key="$4"
  local status body
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" \
    -H "Content-Type: application/json" -d "$payload" --max-time 15)
  if [ "$status" != "200" ]; then
    fail "$name" "HTTP $status"
    return
  fi
  body=$(curl -s -X POST "$url" -H "Content-Type: application/json" -d "$payload" --max-time 15)
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$expected_key' in d" 2>/dev/null; then
    pass "$name"
  else
    fail "$name" "Missing key '$expected_key' in response"
  fi
}

echo "🧪 E2E Tests: Command Center API"
echo "   Base: $BASE_URL"
echo "   Time: $(date)"
echo ""

# ============================================================
# 1. Auth Tests
# ============================================================
echo "--- Auth Tests ---"

# Test: Reject no key
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/.netlify/functions/command-center-api" --max-time 10)
if [ "$status" = "401" ]; then pass "Auth: reject missing key"; else fail "Auth: reject missing key" "HTTP $status"; fi

# Test: Reject wrong key
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/.netlify/functions/command-center-api?key=wrong-key-12345" --max-time 10)
if [ "$status" = "401" ]; then pass "Auth: reject wrong key"; else fail "Auth: reject wrong key" "HTTP $status"; fi

# Test: Accept valid key
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" --max-time 15)
if [ "$status" = "200" ]; then pass "Auth: accept valid key"; else fail "Auth: accept valid key" "HTTP $status"; fi

# ============================================================
# 2. Dashboard GET (main view)
# ============================================================
echo "--- Dashboard Views ---"

test_get "Dashboard: main view" \
  "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  "health"

# ============================================================
# 3. POST Actions — Read-only views
# ============================================================
echo "--- POST Actions (views) ---"

test_post "Action: list_tasks" \
  "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  '{"action":"list_tasks"}' \
  "tasks"

test_post "Action: list_agents" \
  "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  '{"action":"list_agents"}' \
  "agents"

test_post "Action: agent_status" \
  "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  '{"action":"agent_status"}' \
  "agents"

test_post "Action: ciso_posture" \
  "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  '{"action":"ciso_posture"}' \
  "score"

test_post "Action: penny_dashboard" \
  "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  '{"action":"penny_dashboard"}' \
  "summary"

# ============================================================
# 4. Auxiliary APIs
# ============================================================
echo "--- Auxiliary APIs ---"

test_get "Cost API: summary" \
  "$BASE_URL/.netlify/functions/cost-api?key=$API_KEY&view=summary" \
  "total_cost"

test_get "Billing API: summary" \
  "$BASE_URL/.netlify/functions/billing-api?key=$API_KEY&view=summary" \
  "revenue"

test_get "Finance API: services-summary" \
  "$BASE_URL/.netlify/functions/finance-api?key=$API_KEY&view=services-summary" \
  "services"

test_get "Customer API: summary" \
  "$BASE_URL/.netlify/functions/customer-api?key=$API_KEY&view=summary" \
  "total"

test_get "Projects API: dashboard" \
  "$BASE_URL/.netlify/functions/projects-api?key=$API_KEY&view=dashboard" \
  "openTasks"

test_get "QA API: summary" \
  "$BASE_URL/.netlify/functions/qa-api?key=$API_KEY&view=summary" \
  "total"

test_get "Issues API: stats" \
  "$BASE_URL/.netlify/functions/issues-api?key=$API_KEY&view=stats" \
  "total"

test_get "Approval API: badge-counts" \
  "$BASE_URL/.netlify/functions/approval-api?key=$API_KEY&view=badge-counts" \
  "pending"

test_get "Roadmap API: summary" \
  "$BASE_URL/.netlify/functions/roadmap-api?key=$API_KEY&view=summary" \
  "total"

test_get "Roadmap API: list" \
  "$BASE_URL/.netlify/functions/roadmap-api?key=$API_KEY&view=list" \
  "features"

# ============================================================
# 5. Input Validation Tests
# ============================================================
echo "--- Input Validation ---"

# Missing action in POST
body=$(curl -s -X POST "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  -H "Content-Type: application/json" -d '{}' --max-time 10)
if echo "$body" | grep -q "error"; then
  pass "Validation: reject missing action"
else
  fail "Validation: reject missing action" "No error returned"
fi

# Invalid action
body=$(curl -s -X POST "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  -H "Content-Type: application/json" -d '{"action":"nonexistent_action_xyz"}' --max-time 10)
if echo "$body" | grep -q "error\|unknown"; then
  pass "Validation: reject unknown action"
else
  fail "Validation: reject unknown action" "No error returned"
fi

# dispatch_task with missing fields
body=$(curl -s -X POST "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  -H "Content-Type: application/json" -d '{"action":"dispatch_task"}' --max-time 10)
if echo "$body" | grep -q "error\|required\|missing"; then
  pass "Validation: dispatch_task requires fields"
else
  fail "Validation: dispatch_task requires fields" "No validation error"
fi

# ============================================================
# 6. Write Action Test (dispatch → verify → complete)
# ============================================================
echo "--- Write Action Lifecycle ---"

# Dispatch a test task
DISPATCH_RESULT=$(curl -s -X POST "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"dispatch_task","agent":"ops-code","task":"E2E test task — safe to delete","priority":"low"}' \
  --max-time 15)

TASK_ID=$(echo "$DISPATCH_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task_id',''))" 2>/dev/null || echo "")
if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "None" ]; then
  pass "Write: dispatch_task returns task_id"

  # Verify it appears in list
  sleep 2
  LIST_RESULT=$(curl -s -X POST "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
    -H "Content-Type: application/json" -d '{"action":"list_tasks"}' --max-time 15)
  if echo "$LIST_RESULT" | grep -q "$TASK_ID"; then
    pass "Write: task appears in list_tasks"
  else
    fail "Write: task appears in list_tasks" "Task $TASK_ID not found in list"
  fi

  # Complete the task
  COMPLETE_RESULT=$(curl -s -X POST "$BASE_URL/.netlify/functions/command-center-api?key=$API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"complete_task\",\"task_id\":\"$TASK_ID\",\"result\":\"E2E test completed\"}" \
    --max-time 15)
  if echo "$COMPLETE_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok') or 'updated' in str(d).lower() or 'success' in str(d).lower()" 2>/dev/null; then
    pass "Write: complete_task succeeds"
  else
    fail "Write: complete_task succeeds" "Unexpected response: $COMPLETE_RESULT"
  fi
else
  fail "Write: dispatch_task returns task_id" "No task_id in response: $DISPATCH_RESULT"
fi

# ============================================================
# 7. Health Endpoint
# ============================================================
echo "--- Health ---"

status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/.netlify/functions/health" --max-time 10)
if [ "$status" = "200" ]; then pass "Health: endpoint returns 200"; else fail "Health: endpoint returns 200" "HTTP $status"; fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================"
echo "  E2E Test Results"
echo "============================================"
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo ""
echo "  PASSED: $PASS"
echo "  FAILED: $FAIL"
echo "  TOTAL:  $((PASS + FAIL))"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then exit 1; else exit 0; fi
