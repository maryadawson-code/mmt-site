#!/bin/zsh
# MMT SEO Intelligence Agent — Shell Audit Script
# Reads knowledge base → audits site → records findings
#
# Usage:
#   bash scripts/mmt-seo-agent.sh           # full run (human-readable)
#   bash scripts/mmt-seo-agent.sh --audit   # audit only, no fixes
#   bash scripts/mmt-seo-agent.sh --json    # structured JSON output
#
# Dependencies: curl, jq, python3 (stdlib only)
set -euo pipefail

SITE="https://missionmeetstech.com"
AGENT_DIR="seo-agent"
KNOWLEDGE_DIR="$AGENT_DIR/knowledge"
AUDIT_ONLY=false
JSON_OUTPUT=false

for arg in "$@"; do
  case $arg in
    --audit) AUDIT_ONLY=true ;;
    --json) JSON_OUTPUT=true ;;
  esac
done

# ─── STEP 1: Read run context ───

RUN_COUNT=$(python3 -c "
import json
try:
    d = json.load(open('$KNOWLEDGE_DIR/page-state.json'))
    print(d.get('run_count', 0) + 1)
except:
    print(1)
")

TIMESTAMP=$(date -u +%FT%TZ)
! $JSON_OUTPUT && echo "MMT SEO Agent — Run #$RUN_COUNT — $TIMESTAMP"

# ─── STEP 2: Audit all canonical pages ───

PAGES=("/" "/about" "/podcast" "/newsletter" "/resources")
AUDIT_JSON="["
FIRST=true

for PAGE in "${PAGES[@]}"; do
  HTML=$(curl -s --max-time 15 "$SITE$PAGE")
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITE$PAGE")

  # Title
  TITLE=$(echo "$HTML" | grep -oE '<title>[^<]+</title>' | sed 's/<[^>]*>//g' | head -1)
  TITLE=${TITLE:-""}
  TITLE_LEN=${#TITLE}

  # Meta description
  DESC=$(echo "$HTML" | grep -oE 'name="description"[[:space:]]+content="[^"]*"' | sed 's/.*content="//;s/"$//' | head -1)
  if [ -z "$DESC" ]; then
    DESC=$(echo "$HTML" | grep -oE 'content="[^"]*"[[:space:]]+name="description"' | sed 's/content="//;s/"[[:space:]].*//' | head -1)
  fi
  DESC=${DESC:-""}
  DESC_LEN=${#DESC}

  # Canonical
  CANONICAL=$(echo "$HTML" | grep -oE 'rel="canonical"[[:space:]]+href="[^"]*"' | sed 's/.*href="//;s/"$//' | head -1)
  if [ -z "$CANONICAL" ]; then
    CANONICAL=$(echo "$HTML" | grep -oE 'href="[^"]*"[[:space:]]+rel="canonical"' | sed 's/href="//;s/"[[:space:]].*//' | head -1)
  fi
  CANONICAL=${CANONICAL:-""}

  # H1
  H1_COUNT=$(echo "$HTML" | grep -c '<h1' || echo "0")
  H1_TEXT=$(echo "$HTML" | grep -oE '<h1[^>]*>[^<]+' | sed 's/<h1[^>]*>//' | head -1)
  H1_TEXT=${H1_TEXT:-""}

  # OG tags
  OG_TITLE=$(echo "$HTML" | grep -c 'property="og:title"' || echo "0")
  OG_DESC=$(echo "$HTML" | grep -c 'property="og:description"' || echo "0")
  OG_URL=$(echo "$HTML" | grep -c 'property="og:url"' || echo "0")
  OG_IMAGE=$(echo "$HTML" | grep -c 'property="og:image"' || echo "0")
  OG_COMPLETE="false"
  [ "$OG_TITLE" -ge 1 ] && [ "$OG_DESC" -ge 1 ] && [ "$OG_URL" -ge 1 ] && [ "$OG_IMAGE" -ge 1 ] && OG_COMPLETE="true"

  # Schema (JSON-LD)
  SCHEMA_COUNT=$(echo "$HTML" | grep -c 'application/ld+json' || echo "0")

  # Image alt text coverage
  IMG_TOTAL=$(echo "$HTML" | grep -c '<img' || echo "0")
  IMG_NO_ALT=$(echo "$HTML" | grep '<img' | grep -cv 'alt=' || echo "0")
  ALT_COV=100
  [ "$IMG_TOTAL" -gt 0 ] && ALT_COV=$(( (IMG_TOTAL - IMG_NO_ALT) * 100 / IMG_TOTAL ))

  # Internal links out (links to other canonical pages)
  INTERNAL_LINKS=0
  for TARGET in "${PAGES[@]}"; do
    [ "$TARGET" = "$PAGE" ] && continue
    LINK_COUNT=$(echo "$HTML" | grep -cE "href=\"$TARGET(\.html)?\"" || echo "0")
    INTERNAL_LINKS=$((INTERNAL_LINKS + LINK_COUNT))
  done

  # In sitemap?
  SITEMAP_HTML=$(curl -s "$SITE/sitemap.xml")
  PAGE_IN_SITEMAP="false"
  if echo "$SITEMAP_HTML" | grep -q "${PAGE}.html\|${PAGE}/\|${PAGE}<"; then
    PAGE_IN_SITEMAP="true"
  fi

  # Grade
  SCORE=0
  [ -n "$TITLE" ] && [ "$TITLE_LEN" -ge 20 ] && SCORE=$((SCORE + 2))
  [ -n "$DESC" ] && [ "$DESC_LEN" -ge 100 ] && SCORE=$((SCORE + 2))
  [ -n "$CANONICAL" ] && SCORE=$((SCORE + 1))
  [ "$H1_COUNT" -eq 1 ] && SCORE=$((SCORE + 1))
  [ "$OG_COMPLETE" = "true" ] && SCORE=$((SCORE + 2))
  [ "$SCHEMA_COUNT" -ge 1 ] && SCORE=$((SCORE + 1))
  [ "$ALT_COV" -ge 100 ] && SCORE=$((SCORE + 1))

  if [ "$SCORE" -ge 9 ]; then GRADE="A"
  elif [ "$SCORE" -ge 7 ]; then GRADE="B"
  elif [ "$SCORE" -ge 5 ]; then GRADE="C"
  else GRADE="F"; fi

  ! $JSON_OUTPUT && echo "  $PAGE → Grade $GRADE (score $SCORE/10) | title:$TITLE_LEN desc:$DESC_LEN h1:$H1_COUNT og:$OG_COMPLETE schema:$SCHEMA_COUNT alt:$ALT_COV%"

  # Build JSON entry
  $FIRST && FIRST=false || AUDIT_JSON="$AUDIT_JSON,"

  # Escape strings for JSON
  TITLE_ESC=$(echo "$TITLE" | sed 's/"/\\"/g' | tr -d '\n')
  DESC_ESC=$(echo "$DESC" | sed 's/"/\\"/g' | tr -d '\n')
  H1_ESC=$(echo "$H1_TEXT" | sed 's/"/\\"/g' | tr -d '\n')
  CANONICAL_ESC=$(echo "$CANONICAL" | sed 's/"/\\"/g' | tr -d '\n')

  AUDIT_JSON="$AUDIT_JSON{\"page\":\"$PAGE\",\"status\":$STATUS,\"grade\":\"$GRADE\",\"score\":$SCORE,\"title\":\"$TITLE_ESC\",\"title_length\":$TITLE_LEN,\"description\":\"$DESC_ESC\",\"description_length\":$DESC_LEN,\"canonical\":\"$CANONICAL_ESC\",\"h1_count\":$H1_COUNT,\"h1_text\":\"$H1_ESC\",\"og_complete\":$OG_COMPLETE,\"schema_count\":$SCHEMA_COUNT,\"alt_coverage\":$ALT_COV,\"internal_links_out\":$INTERNAL_LINKS,\"in_sitemap\":$PAGE_IN_SITEMAP}"
done

AUDIT_JSON="$AUDIT_JSON]"

# ─── STEP 3: Plausible traffic data ───

PLAUSIBLE_JSON="null"
if [ -n "${PLAUSIBLE_API_KEY:-}" ]; then
  PLAUSIBLE_JSON=$(curl -s \
    "https://plausible.io/api/v1/stats/breakdown?site_id=missionmeetstech.com&period=30d&property=event:page&limit=20" \
    -H "Authorization: Bearer $PLAUSIBLE_API_KEY" 2>/dev/null || echo "null")
  ! $JSON_OUTPUT && echo "Plausible data fetched."
else
  ! $JSON_OUTPUT && echo "PLAUSIBLE_API_KEY not set — skipping traffic data."
fi

# ─── STEP 4: Update page-state.json ───

python3 - "$AUDIT_JSON" <<'PYEOF'
import json, sys, datetime

audit = json.loads(sys.argv[1])
try:
    state = json.load(open('seo-agent/knowledge/page-state.json'))
except:
    state = {"run_count": 0, "pages": {}}

for entry in audit:
    page = entry["page"]
    old = state.get("pages", {}).get(page, {})
    last_grade = old.get("grade", "")
    new_grade = entry["grade"]
    regression = last_grade != "" and new_grade < last_grade

    state.setdefault("pages", {})[page] = {
        "title": entry["title"],
        "title_length": entry["title_length"],
        "description": entry["description"],
        "description_length": entry["description_length"],
        "canonical": entry["canonical"],
        "h1_count": entry["h1_count"],
        "h1_text": entry["h1_text"],
        "og_complete": entry["og_complete"],
        "schema_present": entry["schema_count"] > 0,
        "schema_types": [],
        "alt_text_coverage": entry["alt_coverage"],
        "internal_links_out": entry["internal_links_out"],
        "in_sitemap": entry["in_sitemap"],
        "grade": new_grade,
        "last_grade": last_grade,
        "regression": regression
    }

state["last_updated"] = datetime.datetime.utcnow().isoformat()
state["run_count"] = state.get("run_count", 0) + 1

with open('seo-agent/knowledge/page-state.json', 'w') as f:
    json.dump(state, f, indent=2)
PYEOF

# ─── STEP 5: Output ───

if $JSON_OUTPUT; then
  cat <<ENDJSON
{
  "timestamp": "$TIMESTAMP",
  "run_number": $RUN_COUNT,
  "audit_only": $AUDIT_ONLY,
  "plausible_available": $([ -n "${PLAUSIBLE_API_KEY:-}" ] && echo "true" || echo "false"),
  "pages": $AUDIT_JSON,
  "plausible": $PLAUSIBLE_JSON
}
ENDJSON
else
  echo ""
  echo "=== SEO Audit Complete — Run #$RUN_COUNT ==="
  echo "Audit mode: $( $AUDIT_ONLY && echo 'audit only' || echo 'full run')"
fi
