#!/bin/zsh
# MMT Sentinel Content Freshness Monitor
# Checks how recently content was published on missionmeetstech.com
# Usage: bash scripts/mmt-content-freshness.sh [--json]
set -euo pipefail

SITE="https://missionmeetstech.com"
TIMESTAMP=$(date -u +%FT%TZ)

# Parse flags
JSON_OUTPUT=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true ;;
  esac
done

# Strategy: Check sitemap for most recent lastmod date
SITEMAP=$(curl -s --max-time 10 "$SITE/sitemap.xml" 2>/dev/null || echo "")

if [ -z "$SITEMAP" ]; then
  if $JSON_OUTPUT; then
    echo '{"error": "Could not fetch sitemap", "status": "unknown"}'
  else
    echo "ERROR: Could not fetch sitemap"
  fi
  exit 1
fi

# Extract all lastmod dates and find the most recent
LATEST_DATE=$(echo "$SITEMAP" | grep -oE '<lastmod>[^<]+</lastmod>' | sed 's/<[^>]*>//g' | sort -r | head -1)

if [ -z "$LATEST_DATE" ]; then
  # Fallback: check RSS feed
  FEED=$(curl -s --max-time 10 "$SITE/feed.xml" 2>/dev/null || echo "")
  LATEST_DATE=$(echo "$FEED" | grep -oE '<pubDate>[^<]+</pubDate>' | head -1 | sed 's/<[^>]*>//g')

  if [ -z "$LATEST_DATE" ]; then
    if $JSON_OUTPUT; then
      echo '{"error": "Could not determine last publication date", "status": "unknown"}'
    else
      echo "ERROR: Could not determine last publication date"
    fi
    exit 1
  fi

  # Convert RSS date to YYYY-MM-DD
  LATEST_DATE=$(date -j -f "%a, %d %b %Y %T %z" "$LATEST_DATE" "+%Y-%m-%d" 2>/dev/null || echo "$LATEST_DATE")
fi

# Calculate days since publication
LATEST_EPOCH=$(date -j -f "%Y-%m-%d" "$LATEST_DATE" "+%s" 2>/dev/null || date -d "$LATEST_DATE" "+%s" 2>/dev/null || echo "0")
NOW_EPOCH=$(date +%s)

if [ "$LATEST_EPOCH" = "0" ]; then
  DAYS_SINCE=999
else
  DAYS_SINCE=$(( (NOW_EPOCH - LATEST_EPOCH) / 86400 ))
fi

# Determine status
if [ "$DAYS_SINCE" -lt 14 ]; then
  STATUS="fresh"
elif [ "$DAYS_SINCE" -lt 30 ]; then
  STATUS="warning"
else
  STATUS="stale"
fi

# Output
if $JSON_OUTPUT; then
  cat <<ENDJSON
{
  "timestamp": "$TIMESTAMP",
  "last_article_date": "$LATEST_DATE",
  "days_since_publication": $DAYS_SINCE,
  "status": "$STATUS"
}
ENDJSON
else
  echo "=== MMT Content Freshness ==="
  echo "Last content update: $LATEST_DATE"
  echo "Days since update: $DAYS_SINCE"
  echo "Status: $STATUS"
  if [ "$STATUS" = "warning" ]; then
    echo "WARNING: No new content in ${DAYS_SINCE} days. Consider publishing."
  elif [ "$STATUS" = "stale" ]; then
    echo "ALERT: Content is stale (${DAYS_SINCE} days). Publish new content."
  fi
fi
