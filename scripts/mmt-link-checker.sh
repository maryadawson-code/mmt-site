#!/bin/zsh
# MMT Sentinel Broken Link Checker
# Crawls missionmeetstech.com and checks all links for 404s/errors
# Usage: bash scripts/mmt-link-checker.sh [--internal-only] [--json]
set -euo pipefail

SITE="https://missionmeetstech.com"
DOMAIN="missionmeetstech.com"
TIMESTAMP=$(date -u +%FT%TZ)

# Parse flags
JSON_OUTPUT=false
INTERNAL_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true ;;
    --internal-only) INTERNAL_ONLY=true ;;
  esac
done

# Temp files
LINKS_FILE=$(mktemp)
RESULTS_FILE=$(mktemp)
trap 'rm -f "$LINKS_FILE" "$RESULTS_FILE"' EXIT

# Seed pages to crawl
SEED_PAGES=("/" "/about" "/podcast" "/newsletter" "/resources" "/latest" "/events" "/proposal-pulse" "/topics" "/newswire" "/contract-tracker")

echo "Crawling $SITE for links..." >&2

# Extract all href links from seed pages
for page in "${SEED_PAGES[@]}"; do
  HTML=$(curl -s --max-time 10 "$SITE$page" 2>/dev/null || echo "")
  # Extract href values
  echo "$HTML" | grep -oE 'href="[^"]*"' | sed 's/href="//;s/"$//' | while read -r link; do
    # Normalize
    case "$link" in
      \#*|mailto:*|tel:*|javascript:*) continue ;;  # Skip anchors, mailto, tel, js
      //*) echo "https:$link" ;;                      # Protocol-relative
      /*) echo "$SITE$link" ;;                         # Absolute path
      https://*|http://*) echo "$link" ;;              # Full URL
    esac
  done >> "$LINKS_FILE"
done

# Deduplicate
sort -u "$LINKS_FILE" -o "$LINKS_FILE"

TOTAL_LINKS=$(wc -l < "$LINKS_FILE" | tr -d ' ')
echo "Found $TOTAL_LINKS unique links to check" >&2

# Filter if internal-only
if $INTERNAL_ONLY; then
  grep "$DOMAIN" "$LINKS_FILE" > "${LINKS_FILE}.tmp" || true
  mv "${LINKS_FILE}.tmp" "$LINKS_FILE"
  TOTAL_LINKS=$(wc -l < "$LINKS_FILE" | tr -d ' ')
  echo "Checking $TOTAL_LINKS internal links" >&2
fi

# Check each link
CHECKED=0
BROKEN_COUNT=0
BROKEN_JSON=""

while IFS= read -r url; do
  [ -z "$url" ] && continue
  CHECKED=$((CHECKED + 1))

  # Use HEAD request with timeout, follow redirects
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --head --max-time 10 -L "$url" 2>/dev/null || echo "000")

  # Some servers reject HEAD, try GET
  if [ "$STATUS" = "405" ] || [ "$STATUS" = "000" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -L "$url" 2>/dev/null || echo "000")
  fi

  if [ "$STATUS" -ge 400 ] 2>/dev/null || [ "$STATUS" = "000" ]; then
    BROKEN_COUNT=$((BROKEN_COUNT + 1))
    # Find which source page contained this link
    SOURCE="unknown"
    for page in "${SEED_PAGES[@]}"; do
      if curl -s --max-time 5 "$SITE$page" 2>/dev/null | grep -qF "$url"; then
        SOURCE="$page"
        break
      fi
    done

    if ! $JSON_OUTPUT; then
      echo "  BROKEN [$STATUS] $url (found on $SOURCE)" >&2
    fi

    # Build JSON entry
    [ -n "$BROKEN_JSON" ] && BROKEN_JSON="$BROKEN_JSON,"
    ESCAPED_URL=$(echo "$url" | sed 's/"/\\"/g')
    BROKEN_JSON="$BROKEN_JSON{\"url\": \"$ESCAPED_URL\", \"status\": \"$STATUS\", \"source\": \"$SOURCE\"}"
  fi

  # Progress
  if ! $JSON_OUTPUT && [ $((CHECKED % 20)) -eq 0 ]; then
    echo "  Checked $CHECKED / $TOTAL_LINKS..." >&2
  fi
done < "$LINKS_FILE"

# Output
if $JSON_OUTPUT; then
  cat <<ENDJSON
{
  "timestamp": "$TIMESTAMP",
  "site": "$DOMAIN",
  "total_links": $TOTAL_LINKS,
  "checked": $CHECKED,
  "broken_count": $BROKEN_COUNT,
  "broken": [$BROKEN_JSON]
}
ENDJSON
else
  echo ""
  echo "=== MMT Link Check Complete ==="
  echo "Total links: $TOTAL_LINKS"
  echo "Checked: $CHECKED"
  echo "Broken: $BROKEN_COUNT"
fi

# Exit code: 0 if no broken links, 1 if broken links found
[ "$BROKEN_COUNT" -eq 0 ] && exit 0 || exit 1
