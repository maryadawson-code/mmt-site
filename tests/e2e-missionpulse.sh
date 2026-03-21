#!/usr/bin/env bash
# E2E tests for MissionPulse frontend
# Usage: bash tests/e2e-missionpulse.sh
# Exit 0 on all-pass, 1 on any failure

set -euo pipefail

MP_DIR="${MP_DIR:-$HOME/Projects/missionpulse-frontend}"

if [ ! -d "$MP_DIR" ]; then
  echo "ERROR: MissionPulse directory not found at $MP_DIR"
  exit 1
fi

cd "$MP_DIR"

PASS=0
FAIL=0
RESULTS=()

pass() { PASS=$((PASS + 1)); RESULTS+=("✅ PASS: $1"); }
fail() { FAIL=$((FAIL + 1)); RESULTS+=("❌ FAIL: $1 — $2"); }

echo "🧪 E2E Tests: MissionPulse Frontend"
echo "   Dir: $MP_DIR"
echo "   Time: $(date)"
echo ""

# ============================================================
# 1. TypeScript Compilation
# ============================================================
echo "--- TypeScript Check ---"

if npx tsc --noEmit 2>/tmp/mp-tsc-errors.txt; then
  pass "TypeScript: compiles without errors"
else
  ERRORS=$(wc -l < /tmp/mp-tsc-errors.txt)
  fail "TypeScript: compiles without errors" "$ERRORS error lines (see /tmp/mp-tsc-errors.txt)"
fi

# ============================================================
# 2. Build Check
# ============================================================
echo "--- Build Check ---"

if npm run build > /tmp/mp-build-output.txt 2>&1; then
  pass "Build: succeeds"

  # Check for warnings
  WARNINGS=$(grep -ci "warn" /tmp/mp-build-output.txt 2>/dev/null || echo "0")
  if [ "$WARNINGS" -gt 0 ]; then
    fail "Build: no warnings" "$WARNINGS warnings found (see /tmp/mp-build-output.txt)"
  else
    pass "Build: no warnings"
  fi
else
  fail "Build: succeeds" "Build failed (see /tmp/mp-build-output.txt)"
fi

# ============================================================
# 3. Dead Import Check
# ============================================================
echo "--- Dead Imports ---"

DEAD_IMPORTS=0
# Check for imports of files that don't exist
while IFS= read -r file; do
  # Extract relative imports
  grep -oE "from ['\"](\./|\.\./)[^'\"]+['\"]" "$file" 2>/dev/null | while IFS= read -r import; do
    # Extract path
    path=$(echo "$import" | sed "s/from ['\"]//;s/['\"]//")
    dir=$(dirname "$file")
    resolved="$dir/$path"

    # Check if file exists (with common extensions)
    found=false
    for ext in "" ".ts" ".tsx" ".js" ".jsx" "/index.ts" "/index.tsx"; do
      if [ -f "${resolved}${ext}" ]; then
        found=true
        break
      fi
    done

    if [ "$found" = false ]; then
      echo "  ⚠️  Dead import in $file: $path"
      DEAD_IMPORTS=$((DEAD_IMPORTS + 1))
    fi
  done
done < <(find app components lib -name "*.ts" -o -name "*.tsx" 2>/dev/null | head -200)

if [ "$DEAD_IMPORTS" -eq 0 ]; then
  pass "Dead imports: none found (sampled 200 files)"
else
  fail "Dead imports: none found" "$DEAD_IMPORTS dead imports detected"
fi

# ============================================================
# 4. Deleted Component References
# ============================================================
echo "--- Deleted Component Refs ---"

# Check for Creative Studio references (removed in PR #28)
CREATIVE_REFS=$(grep -rn "CreativeStudio\|creative-studio\|creative_studio" app/ components/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "_archive" | grep -v "node_modules" | wc -l)
if [ "$CREATIVE_REFS" -eq 0 ]; then
  pass "Deleted refs: no Creative Studio references"
else
  fail "Deleted refs: no Creative Studio references" "$CREATIVE_REFS references found"
fi

# ============================================================
# 5. Console.log Check (production code)
# ============================================================
echo "--- Console.log Check ---"

CONSOLE_LOGS=$(grep -rn "console\.log(" app/ components/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "__tests__" | grep -v ".test." | grep -v "node_modules" | grep -v "// DEBUG" | wc -l)
if [ "$CONSOLE_LOGS" -eq 0 ]; then
  pass "Console.log: none in production code"
else
  fail "Console.log: none in production code" "$CONSOLE_LOGS console.log statements found"
fi

# ============================================================
# 6. TODO/FIXME/HACK Check
# ============================================================
echo "--- TODO/FIXME/HACK ---"

TODOS=$(grep -rn "TODO\|FIXME\|HACK\|XXX" app/ components/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" | grep -v "__tests__" | wc -l)
if [ "$TODOS" -eq 0 ]; then
  pass "TODOs: none found"
else
  fail "TODOs: $TODOS found" "See grep output for locations"
  echo "  Top 10 TODOs:"
  grep -rn "TODO\|FIXME\|HACK\|XXX" app/ components/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" | grep -v "__tests__" | head -10 | sed 's/^/    /'
fi

# ============================================================
# 7. Hardcoded URL Check
# ============================================================
echo "--- Hardcoded URLs ---"

HARDCODED=$(grep -rn "http://localhost\|https://.*\.supabase\.co\|https://.*\.netlify\.app" app/ components/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" | grep -v "__tests__" | grep -v ".example" | grep -v "// " | wc -l)
if [ "$HARDCODED" -eq 0 ]; then
  pass "Hardcoded URLs: none found"
else
  fail "Hardcoded URLs: $HARDCODED found" "Should use env vars"
  grep -rn "http://localhost\|https://.*\.supabase\.co\|https://.*\.netlify\.app" app/ components/ lib/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "node_modules" | grep -v "__tests__" | grep -v ".example" | grep -v "// " | head -5 | sed 's/^/    /'
fi

# ============================================================
# 8. Existing Test Suite
# ============================================================
echo "--- Existing Tests ---"

if grep -q '"test"' package.json 2>/dev/null; then
  if npm test -- --run 2>/tmp/mp-test-output.txt 2>&1; then
    pass "Test suite: passes"
  else
    fail "Test suite: passes" "See /tmp/mp-test-output.txt"
  fi
else
  echo "  ℹ️  No test script configured in package.json"
  pass "Test suite: N/A (not configured)"
fi

# ============================================================
# 9. Dashboard Agent Components
# ============================================================
echo "--- Dashboard Agent Components ---"

# Check that the 5 restored agent components exist
AGENT_COMPONENTS=("AgentFleetStatus" "AgentTaskStream" "SmartChatInterface" "AgentApprovalQueue" "AgentCards")
for comp in "${AGENT_COMPONENTS[@]}"; do
  if grep -rq "$comp" components/ 2>/dev/null; then
    pass "Component exists: $comp"
  else
    fail "Component exists: $comp" "Not found in components/"
  fi
done

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================"
echo "  E2E Test Results: MissionPulse"
echo "============================================"
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo ""
echo "  PASSED: $PASS"
echo "  FAILED: $FAIL"
echo "  TOTAL:  $((PASS + FAIL))"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then exit 1; else exit 0; fi
