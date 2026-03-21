#!/bin/bash
# smoke-test.sh — Post-deploy smoke tests for missionmeetstech.com
# Usage: ./scripts/smoke-test.sh [base_url]

BASE_URL="${1:-https://missionmeetstech.com}"
PASS=0
FAIL=0

check() {
  local desc="$1" url="$2" expect_status="$3" min_size="${4:-0}"
  local response status size
  response=$(curl -s -o /tmp/smoke-body -w "%{http_code} %{size_download}" "$url" 2>/dev/null)
  status=$(echo "$response" | awk '{print $1}')
  size=$(echo "$response" | awk '{print $2}')

  if [ "$status" != "$expect_status" ]; then
    echo "FAIL: $desc — expected $expect_status, got $status"
    FAIL=$((FAIL + 1))
    return
  fi
  if [ "$min_size" -gt 0 ] && [ "$size" -lt "$min_size" ]; then
    echo "FAIL: $desc — expected >$min_size bytes, got $size"
    FAIL=$((FAIL + 1))
    return
  fi
  echo "PASS: $desc (${status}, ${size} bytes)"
  PASS=$((PASS + 1))
}

echo "=== Smoke Tests: $BASE_URL ==="
echo ""

check "Homepage" "$BASE_URL/" 200 50000
check "Health endpoint" "$BASE_URL/health" 200
check "About page" "$BASE_URL/about.html" 200 10000
check "ProposalPulse page" "$BASE_URL/proposal-pulse.html" 200 10000
check "MarketPulse page" "$BASE_URL/marketpulse.html" 200 10000
check "Resources page" "$BASE_URL/resources.html" 200 10000
check "Podcast page" "$BASE_URL/podcast.html" 200 10000
check "404 page" "$BASE_URL/nonexistent-page-xyz" 404

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
