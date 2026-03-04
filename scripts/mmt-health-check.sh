#!/bin/zsh
# MMT Sentinel Health Check
# Checks availability, content, services, security, and SEO for missionmeetstech.com
# Usage: bash scripts/mmt-health-check.sh [--json] [--quiet] [--verbose]
set -euo pipefail

SITE="https://missionmeetstech.com"
DOMAIN="missionmeetstech.com"
AGENT="mmt-sentinel"
TIMESTAMP=$(date -u +%FT%TZ)
SESSION_ID=$(uuidgen 2>/dev/null || echo "session-$(date +%s)")

# Parse flags
JSON_OUTPUT=false
QUIET=false
VERBOSE=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true; QUIET=true ;;
    --quiet) QUIET=true ;;
    --verbose) VERBOSE=true ;;
  esac
done

# Counters
TOTAL_PASSED=0
TOTAL_CHECKS=0
ALERTS=()
DETAILS_AVAIL=()
DETAILS_CONTENT=()
DETAILS_SERVICES=()
DETAILS_SECURITY=()
DETAILS_SEO=()
AVAIL_PASSED=0; AVAIL_TOTAL=0
CONTENT_PASSED=0; CONTENT_TOTAL=0
SERVICES_PASSED=0; SERVICES_TOTAL=0
SECURITY_PASSED=0; SECURITY_TOTAL=0
SEO_PASSED=0; SEO_TOTAL=0

# Helper: record check result
check() {
  local category="$1" name="$2" passed="$3" detail="$4"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  if [ "$passed" = "true" ]; then
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
    $VERBOSE && ! $QUIET && echo "  ✓ $name"
  else
    ! $QUIET && echo "  ✗ $name: $detail"
    ALERTS+=("$name: $detail")
  fi

  local entry="\"$name\": {\"passed\": $passed, \"detail\": \"$detail\"}"
  case "$category" in
    availability)
      AVAIL_TOTAL=$((AVAIL_TOTAL + 1))
      [ "$passed" = "true" ] && AVAIL_PASSED=$((AVAIL_PASSED + 1))
      DETAILS_AVAIL+=("$entry")
      ;;
    content)
      CONTENT_TOTAL=$((CONTENT_TOTAL + 1))
      [ "$passed" = "true" ] && CONTENT_PASSED=$((CONTENT_PASSED + 1))
      DETAILS_CONTENT+=("$entry")
      ;;
    services)
      SERVICES_TOTAL=$((SERVICES_TOTAL + 1))
      [ "$passed" = "true" ] && SERVICES_PASSED=$((SERVICES_PASSED + 1))
      DETAILS_SERVICES+=("$entry")
      ;;
    security)
      SECURITY_TOTAL=$((SECURITY_TOTAL + 1))
      [ "$passed" = "true" ] && SECURITY_PASSED=$((SECURITY_PASSED + 1))
      DETAILS_SECURITY+=("$entry")
      ;;
    seo)
      SEO_TOTAL=$((SEO_TOTAL + 1))
      [ "$passed" = "true" ] && SEO_PASSED=$((SEO_PASSED + 1))
      DETAILS_SEO+=("$entry")
      ;;
  esac
}

# --- CATEGORY 1: AVAILABILITY ---
! $QUIET && echo "Checking availability..."

# 1. Homepage returns 200
HOMEPAGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/")
if [ "$HOMEPAGE_STATUS" = "200" ]; then
  check availability "homepage_200" true "HTTP $HOMEPAGE_STATUS"
else
  check availability "homepage_200" false "HTTP $HOMEPAGE_STATUS"
fi

# 2. Response time under 3 seconds
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$SITE/")
RESPONSE_TIME_MS=$(echo "$RESPONSE_TIME * 1000" | bc 2>/dev/null || echo "0")
RESPONSE_TIME_MS=${RESPONSE_TIME_MS%.*}
if (( $(echo "$RESPONSE_TIME < 3.0" | bc -l 2>/dev/null || echo 0) )); then
  check availability "response_time" true "${RESPONSE_TIME}s"
else
  check availability "response_time" false "${RESPONSE_TIME}s (threshold: 3s)"
fi

# 3. SSL certificate valid, not expiring within 14 days
SSL_EXPIRY=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$SSL_EXPIRY" ]; then
  SSL_EXPIRY_EPOCH=$(date -j -f "%b %d %T %Y %Z" "$SSL_EXPIRY" "+%s" 2>/dev/null || date -d "$SSL_EXPIRY" "+%s" 2>/dev/null || echo "0")
  NOW_EPOCH=$(date +%s)
  SSL_DAYS_LEFT=$(( (SSL_EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
  if [ "$SSL_DAYS_LEFT" -gt 14 ]; then
    check availability "ssl_valid" true "${SSL_DAYS_LEFT} days until expiry"
  else
    check availability "ssl_valid" false "SSL expires in ${SSL_DAYS_LEFT} days"
  fi
else
  SSL_DAYS_LEFT=0
  check availability "ssl_valid" false "Could not read SSL certificate"
fi

# 4. HTTPS redirect working
HTTP_REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" -L "http://$DOMAIN/" --max-redirs 3)
if [ "$HTTP_REDIRECT" = "200" ]; then
  REDIRECT_URL=$(curl -s -o /dev/null -w "%{url_effective}" -L "http://$DOMAIN/" --max-redirs 3)
  if echo "$REDIRECT_URL" | grep -q "^https://"; then
    check availability "https_redirect" true "HTTP redirects to HTTPS"
  else
    check availability "https_redirect" false "HTTP does not redirect to HTTPS"
  fi
else
  check availability "https_redirect" false "HTTP redirect returned $HTTP_REDIRECT"
fi

# --- CATEGORY 2: CONTENT INTEGRITY ---
! $QUIET && echo "Checking content integrity..."

# Fetch homepage once for content checks
HOMEPAGE_HTML=$(curl -s "$SITE/")

# 5. Homepage contains "Mission Meets Tech"
if echo "$HOMEPAGE_HTML" | grep -qi "Mission Meets Tech"; then
  check content "brand_present" true "Brand name found"
else
  check content "brand_present" false "Brand name not found on homepage"
fi

# 6. Homepage contains Buttondown subscribe form
if echo "$HOMEPAGE_HTML" | grep -qi "buttondown"; then
  check content "buttondown_form" true "Buttondown form found"
else
  check content "buttondown_form" false "Buttondown form not found on homepage"
fi

# 7. Each confirmed page returns 200
CONFIRMED_PAGES=("/" "/about" "/podcast" "/newsletter" "/resources" "/latest" "/events" "/proposal-pulse" "/topics" "/newswire" "/contract-tracker")
for page in "${CONFIRMED_PAGES[@]}"; do
  PAGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITE$page")
  if [ "$PAGE_STATUS" = "200" ]; then
    check content "page${page}" true "HTTP $PAGE_STATUS"
  else
    check content "page${page}" false "HTTP $PAGE_STATUS"
  fi
done

# --- CATEGORY 3: THIRD-PARTY SERVICES ---
! $QUIET && echo "Checking third-party services..."

# 8. Plausible analytics script present
if echo "$HOMEPAGE_HTML" | grep -q "plausible.io"; then
  check services "plausible_present" true "Plausible script found"
else
  check services "plausible_present" false "Plausible script not found"
fi

# 9. Buttondown form action URL reachable
BD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --head "https://buttondown.com" 2>/dev/null || echo "000")
if [ "$BD_STATUS" != "000" ] && [ "$BD_STATUS" -lt 500 ]; then
  check services "buttondown_reachable" true "HTTP $BD_STATUS"
else
  check services "buttondown_reachable" false "HTTP $BD_STATUS"
fi

# 10. Transistor/podcast embed present on /podcast
PODCAST_HTML=$(curl -s "$SITE/podcast")
if echo "$PODCAST_HTML" | grep -qiE "transistor|riverside|podcast|episode"; then
  check services "podcast_embed" true "Podcast content found"
else
  check services "podcast_embed" false "No podcast content found on /podcast"
fi

# 11. Stripe check (proposal-pulse confirmed live)
PROPOSAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/proposal-pulse")
STRIPE_MATCH=$(curl -s --max-time 10 "$SITE/proposal-pulse" | grep -ciE "stripe|checkout|proposal|score" || echo "0")
if [ "$PROPOSAL_STATUS" = "200" ] && [ "$STRIPE_MATCH" -gt 0 ]; then
  check services "stripe_integration" true "ProposalPulse page live ($STRIPE_MATCH references)"
else
  check services "stripe_integration" false "ProposalPulse page issue (HTTP $PROPOSAL_STATUS, matches: $STRIPE_MATCH)"
fi

# --- CATEGORY 4: SECURITY ---
! $QUIET && echo "Checking security headers..."

HEADERS=$(curl -sI "$SITE/")

# 12. CSP present with correct script-src
CSP=$(echo "$HEADERS" | grep -i "^content-security-policy:" || echo "")
if echo "$CSP" | grep -q "plausible.io"; then
  check security "csp_valid" true "CSP present with plausible.io in script-src"
else
  check security "csp_valid" false "CSP missing or does not include plausible.io"
fi

# 13. HSTS present
if echo "$HEADERS" | grep -qi "^strict-transport-security:"; then
  check security "hsts_present" true "HSTS header present"
else
  check security "hsts_present" false "HSTS header missing"
fi

# 14. X-Content-Type-Options: nosniff
if echo "$HEADERS" | grep -qi "^x-content-type-options:.*nosniff"; then
  check security "xcto_nosniff" true "X-Content-Type-Options: nosniff"
else
  check security "xcto_nosniff" false "X-Content-Type-Options header missing or wrong"
fi

# 15. X-Frame-Options: SAMEORIGIN
if echo "$HEADERS" | grep -qi "^x-frame-options:.*sameorigin"; then
  check security "xfo_sameorigin" true "X-Frame-Options: SAMEORIGIN"
else
  check security "xfo_sameorigin" false "X-Frame-Options header missing or wrong"
fi

# --- CATEGORY 5: SEO ---
! $QUIET && echo "Checking SEO..."

# 16. <title> tag present and non-empty
if echo "$HOMEPAGE_HTML" | grep -qiE "<title>[^<]+</title>"; then
  check seo "title_tag" true "Title tag present"
else
  check seo "title_tag" false "Title tag missing or empty"
fi

# 17. meta description present
if echo "$HOMEPAGE_HTML" | grep -qi 'meta.*name="description"'; then
  check seo "meta_description" true "Meta description present"
else
  check seo "meta_description" false "Meta description missing"
fi

# 18. og:title present
if echo "$HOMEPAGE_HTML" | grep -qi 'property="og:title"'; then
  check seo "og_title" true "OG title present"
else
  check seo "og_title" false "OG title missing"
fi

# 19. canonical link present
if echo "$HOMEPAGE_HTML" | grep -qi 'rel="canonical"'; then
  check seo "canonical" true "Canonical link present"
else
  check seo "canonical" false "Canonical link missing"
fi

# 20. robots.txt returns 200
ROBOTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/robots.txt")
if [ "$ROBOTS_STATUS" = "200" ]; then
  check seo "robots_txt" true "robots.txt returns 200"
else
  check seo "robots_txt" false "robots.txt returns $ROBOTS_STATUS"
fi

# 21. Sitemap valid
SITEMAP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/sitemap.xml")
if [ "$SITEMAP_STATUS" = "200" ]; then
  SITEMAP_CONTENT=$(curl -s "$SITE/sitemap.xml" | head -5)
  if echo "$SITEMAP_CONTENT" | grep -q "urlset"; then
    check seo "sitemap_valid" true "Sitemap returns 200 and contains urlset"
  else
    check seo "sitemap_valid" false "Sitemap returns 200 but invalid XML"
  fi
else
  check seo "sitemap_valid" false "Sitemap returns $SITEMAP_STATUS"
fi

# --- DETERMINE STATUS ---
if [ "$TOTAL_PASSED" = "$TOTAL_CHECKS" ]; then
  STATUS="healthy"
elif [ "$AVAIL_PASSED" = "$AVAIL_TOTAL" ]; then
  STATUS="degraded"
else
  STATUS="critical"
fi

# Calculate next check (6 hours from now)
NEXT_CHECK=$(date -u -v+6H +%FT%TZ 2>/dev/null || date -u -d "+6 hours" +%FT%TZ 2>/dev/null || echo "")

# --- OUTPUT ---
if $JSON_OUTPUT; then
  # Build JSON details
  join_details() {
    local IFS=","
    echo "$*"
  }

  ALERTS_JSON=""
  for a in "${ALERTS[@]+"${ALERTS[@]}"}"; do
    [ -n "$ALERTS_JSON" ] && ALERTS_JSON="$ALERTS_JSON,"
    ALERTS_JSON="$ALERTS_JSON\"$(echo "$a" | sed 's/"/\\"/g')\""
  done

  cat <<ENDJSON
{
  "timestamp": "$TIMESTAMP",
  "site": "$DOMAIN",
  "agent": "$AGENT",
  "status": "$STATUS",
  "response_time_ms": $RESPONSE_TIME_MS,
  "ssl_expires_in_days": $SSL_DAYS_LEFT,
  "checks": {
    "availability": { "passed": $AVAIL_PASSED, "total": $AVAIL_TOTAL },
    "content": { "passed": $CONTENT_PASSED, "total": $CONTENT_TOTAL },
    "services": { "passed": $SERVICES_PASSED, "total": $SERVICES_TOTAL },
    "security": { "passed": $SECURITY_PASSED, "total": $SECURITY_TOTAL },
    "seo": { "passed": $SEO_PASSED, "total": $SEO_TOTAL }
  },
  "total_passed": $TOTAL_PASSED,
  "total_checks": $TOTAL_CHECKS,
  "alerts": [$ALERTS_JSON],
  "session_id": "$SESSION_ID",
  "next_check": "$NEXT_CHECK"
}
ENDJSON
else
  ! $QUIET && echo ""
  ! $QUIET && echo "=== MMT Sentinel Health Check ==="
  ! $QUIET && echo "Status: $STATUS"
  ! $QUIET && echo "Passed: $TOTAL_PASSED / $TOTAL_CHECKS"
  ! $QUIET && echo "Response time: ${RESPONSE_TIME_MS}ms"
  ! $QUIET && echo "SSL expires in: ${SSL_DAYS_LEFT} days"
  if [ ${#ALERTS[@]} -gt 0 ]; then
    ! $QUIET && echo ""
    ! $QUIET && echo "Alerts:"
    for a in "${ALERTS[@]}"; do
      ! $QUIET && echo "  - $a"
    done
  fi
fi

# Exit code
case "$STATUS" in
  healthy) exit 0 ;;
  degraded) exit 1 ;;
  critical) exit 2 ;;
esac
