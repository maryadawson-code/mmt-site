#!/bin/bash
# e2e-smoke.sh — Comprehensive E2E smoke tests for missionmeetstech.com
# Usage: ./scripts/e2e-smoke.sh [base_url]

BASE_URL="${1:-https://missionmeetstech.com}"
PASS=0
FAIL=0
WARN=0
RESULTS=""

log_result() {
  local status="$1" desc="$2" details="$3"
  RESULTS="${RESULTS}\n| ${status} | ${desc} | ${details} |"
  if [ "$status" = "PASS" ]; then PASS=$((PASS + 1));
  elif [ "$status" = "FAIL" ]; then FAIL=$((FAIL + 1));
  else WARN=$((WARN + 1)); fi
  echo "${status}: ${desc} — ${details}"
}

check_page() {
  local desc="$1" path="$2" min_size="${3:-1000}"
  local response status size
  response=$(curl -s -o /dev/null -w "%{http_code} %{size_download}" "${BASE_URL}${path}" 2>/dev/null)
  status=$(echo "$response" | awk '{print $1}')
  size=$(echo "$response" | awk '{print $2}')

  if [ "$status" != "200" ]; then
    log_result "FAIL" "$desc" "HTTP ${status} (expected 200)"
  elif [ "$size" -lt "$min_size" ]; then
    log_result "FAIL" "$desc" "${size} bytes (expected >${min_size})"
  else
    log_result "PASS" "$desc" "HTTP ${status}, ${size} bytes"
  fi
}

check_api() {
  local desc="$1" path="$2" expect_status="$3"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${path}" 2>/dev/null)
  if echo "$expect_status" | grep -q "$status"; then
    log_result "PASS" "$desc" "HTTP ${status}"
  elif [ "$status" = "404" ] || [ "$status" = "500" ]; then
    log_result "FAIL" "$desc" "HTTP ${status} (expected ${expect_status})"
  else
    log_result "WARN" "$desc" "HTTP ${status} (expected ${expect_status})"
  fi
}

check_redirect() {
  local desc="$1" from_path="$2" expect_location="$3"
  local status location
  status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${from_path}" 2>/dev/null)
  location=$(curl -sI "${BASE_URL}${from_path}" 2>/dev/null | grep -i "^location:" | sed 's/location: *//i' | tr -d '\r')
  if [ "$status" = "301" ] || [ "$status" = "302" ] || [ "$status" = "308" ]; then
    if echo "$location" | grep -qi "$expect_location"; then
      log_result "PASS" "$desc" "HTTP ${status} → ${location}"
    else
      log_result "WARN" "$desc" "HTTP ${status} → ${location} (expected ${expect_location})"
    fi
  elif [ "$status" = "200" ]; then
    log_result "PASS" "$desc" "HTTP 200 (rewrite, not redirect)"
  else
    log_result "FAIL" "$desc" "HTTP ${status} (expected redirect)"
  fi
}

echo "============================================"
echo "E2E Smoke Tests: ${BASE_URL}"
echo "Date: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "============================================"
echo ""

# === 2A: Static Pages ===
echo "--- Static Pages ---"
check_page "Homepage" "/" 50000
check_page "Newsletter" "/newsletter.html"
check_page "Resources" "/resources.html"
check_page "ProposalPulse" "/proposal-pulse.html" 10000
check_page "MarketPulse" "/marketpulse.html" 10000
check_page "Glossary" "/glossary.html" 10000
check_page "Contract Tracker" "/contract-tracker.html"
check_page "News Wire" "/newswire.html"
check_page "Podcast" "/podcast.html"
check_page "Topics" "/topics.html"
check_page "Getting Started" "/getting-started.html"
check_page "About" "/about.html" 10000
check_page "Events" "/events.html"
check_page "Security" "/security.html"
check_page "Privacy" "/privacy.html"
check_page "Terms" "/terms.html"
check_api "404 Page" "/nonexistent-xyz-404" "404"
echo ""

# === 2B: API/Function Endpoints ===
echo "--- API Endpoints ---"
check_api "Health (direct)" "/.netlify/functions/health" "200"
check_api "Health (rewrite)" "/health" "200"
check_api "Score Deck (GET)" "/.netlify/functions/score-deck" "405 400"
check_api "MarketPulse Gateway (GET)" "/.netlify/functions/marketpulse-gateway" "405 400"
check_api "Agent Bridge (no auth)" "/.netlify/functions/agent-bridge" "401"
check_api "Stripe Webhook (no payload)" "/.netlify/functions/stripe-webhook" "400 405"
echo ""

# === 2C: Redirects ===
echo "--- Redirects ---"
check_redirect "Market Pulse redirect" "/market-pulse.html" "marketpulse"
check_redirect "Newsletter archive redirect" "/newsletter-archive.html" "newsletter"
check_redirect "Community redirect" "/community.html" "/"
echo ""

# === 2D: Security Headers ===
echo "--- Security Headers ---"
HEADERS=$(curl -sI "${BASE_URL}/" 2>/dev/null)

check_header() {
  local name="$1" expected="$2"
  local value
  value=$(echo "$HEADERS" | grep -i "^${name}:" | head -1 | sed "s/^${name}: *//i" | tr -d '\r')
  if [ -n "$value" ]; then
    log_result "PASS" "Header: ${name}" "${value:0:60}"
  else
    log_result "FAIL" "Header: ${name}" "MISSING"
  fi
}

check_header "x-frame-options" "SAMEORIGIN"
check_header "x-content-type-options" "nosniff"
check_header "strict-transport-security" ""
check_header "content-security-policy" ""
check_header "referrer-policy" ""
check_header "permissions-policy" ""
echo ""

# === 2E: SSL/TLS ===
echo "--- SSL/TLS ---"
ssl_status=$(curl -s -o /dev/null -w "%{http_code}" "https://missionmeetstech.com" 2>/dev/null)
if [ "$ssl_status" = "200" ]; then
  log_result "PASS" "HTTPS loads" "HTTP ${ssl_status}"
else
  log_result "FAIL" "HTTPS loads" "HTTP ${ssl_status}"
fi

http_status=$(curl -s -o /dev/null -w "%{http_code}" "http://missionmeetstech.com" 2>/dev/null)
http_redirect=$(curl -sI "http://missionmeetstech.com" 2>/dev/null | grep -i "^location:" | head -1)
if [ "$http_status" = "301" ] || [ "$http_status" = "302" ] || [ "$http_status" = "308" ]; then
  log_result "PASS" "HTTP→HTTPS redirect" "HTTP ${http_status}"
else
  log_result "WARN" "HTTP→HTTPS redirect" "HTTP ${http_status}"
fi
echo ""

# === 2F: Performance ===
echo "--- Performance ---"
load_time=$(curl -s -o /dev/null -w "%{time_total}" "${BASE_URL}/" 2>/dev/null)
if [ "$(echo "$load_time < 2.0" | bc 2>/dev/null)" = "1" ]; then
  log_result "PASS" "Homepage load time" "${load_time}s (<2s)"
else
  log_result "WARN" "Homepage load time" "${load_time}s (target <2s)"
fi

homepage_size=$(curl -s -o /dev/null -w "%{size_download}" "${BASE_URL}/" 2>/dev/null)
log_result "PASS" "Homepage size" "${homepage_size} bytes"
echo ""

# === Summary ===
echo "============================================"
echo "RESULTS: ${PASS} pass, ${FAIL} fail, ${WARN} warn"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
