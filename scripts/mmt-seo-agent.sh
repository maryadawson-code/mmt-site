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

  # Use python3 for reliable HTML parsing (stdlib only)
  AUDIT_DATA=$(python3 - "$HTML" "$PAGE" <<'PYAUDIT'
import sys, re, json

html = sys.argv[1]
page = sys.argv[2]

# Title
m = re.search(r'<title>([^<]+)</title>', html)
title = m.group(1).strip() if m else ""

# Meta description
m = re.search(r'<meta\s[^>]*name="description"[^>]*content="([^"]*)"', html)
if not m:
    m = re.search(r'<meta\s[^>]*content="([^"]*)"[^>]*name="description"', html)
desc = m.group(1).strip() if m else ""

# Canonical
m = re.search(r'<link\s[^>]*rel="canonical"[^>]*href="([^"]*)"', html)
if not m:
    m = re.search(r'<link\s[^>]*href="([^"]*)"[^>]*rel="canonical"', html)
canonical = m.group(1).strip() if m else ""

# H1
h1s = re.findall(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL)
h1_count = len(h1s)
h1_text = re.sub(r'<[^>]+>', '', h1s[0]).strip() if h1s else ""

# OG tags
og_title = 1 if re.search(r'property="og:title"', html) else 0
og_desc = 1 if re.search(r'property="og:description"', html) else 0
og_url = 1 if re.search(r'property="og:url"', html) else 0
og_image = 1 if re.search(r'property="og:image"', html) else 0
og_complete = og_title >= 1 and og_desc >= 1 and og_url >= 1 and og_image >= 1

# Schema
schema_count = len(re.findall(r'application/ld\+json', html))

# Image alt text
imgs = re.findall(r'<img\s[^>]*>', html)
img_total = len(imgs)
img_no_alt = sum(1 for img in imgs if 'alt=' not in img)
alt_cov = int((img_total - img_no_alt) * 100 / img_total) if img_total > 0 else 100

# Internal links to canonical pages
canonical_pages = ["/", "/about", "/podcast", "/newsletter", "/resources"]
internal_links = 0
for target in canonical_pages:
    if target == page:
        continue
    internal_links += len(re.findall(r'href="' + re.escape(target) + r'(\.html)?"', html))

result = {
    "title": title, "title_length": len(title),
    "description": desc, "description_length": len(desc),
    "canonical": canonical,
    "h1_count": h1_count, "h1_text": h1_text,
    "og_title": og_title, "og_desc": og_desc, "og_url": og_url, "og_image": og_image,
    "og_complete": og_complete,
    "schema_count": schema_count,
    "img_total": img_total, "img_no_alt": img_no_alt, "alt_coverage": alt_cov,
    "internal_links_out": internal_links
}
print(json.dumps(result))
PYAUDIT
  )

  TITLE=$(echo "$AUDIT_DATA" | jq -r '.title')
  TITLE_LEN=$(echo "$AUDIT_DATA" | jq -r '.title_length')
  DESC=$(echo "$AUDIT_DATA" | jq -r '.description')
  DESC_LEN=$(echo "$AUDIT_DATA" | jq -r '.description_length')
  CANONICAL=$(echo "$AUDIT_DATA" | jq -r '.canonical')
  H1_COUNT=$(echo "$AUDIT_DATA" | jq -r '.h1_count')
  H1_TEXT=$(echo "$AUDIT_DATA" | jq -r '.h1_text')
  OG_TITLE=$(echo "$AUDIT_DATA" | jq -r '.og_title')
  OG_DESC=$(echo "$AUDIT_DATA" | jq -r '.og_desc')
  OG_URL=$(echo "$AUDIT_DATA" | jq -r '.og_url')
  OG_IMAGE=$(echo "$AUDIT_DATA" | jq -r '.og_image')
  OG_COMPLETE=$(echo "$AUDIT_DATA" | jq -r '.og_complete')
  SCHEMA_COUNT=$(echo "$AUDIT_DATA" | jq -r '.schema_count')
  ALT_COV=$(echo "$AUDIT_DATA" | jq -r '.alt_coverage')
  INTERNAL_LINKS=$(echo "$AUDIT_DATA" | jq -r '.internal_links_out')

  # In sitemap?
  if [ -z "${SITEMAP_HTML:-}" ]; then
    SITEMAP_HTML=$(curl -s "$SITE/sitemap.xml")
  fi
  PAGE_IN_SITEMAP="false"
  PAGE_BARE=$(echo "$PAGE" | sed 's/^\///')
  if echo "$SITEMAP_HTML" | grep -qE "${PAGE_BARE}\.html|${PAGE_BARE}/"; then
    PAGE_IN_SITEMAP="true"
  fi
  # Homepage special case
  [ "$PAGE" = "/" ] && echo "$SITEMAP_HTML" | grep -q "missionmeetstech.com/<" 2>/dev/null && PAGE_IN_SITEMAP="true"
  [ "$PAGE" = "/" ] && echo "$SITEMAP_HTML" | grep -q "missionmeetstech.com/</loc>" 2>/dev/null && PAGE_IN_SITEMAP="true"

  # Grade
  SCORE=0
  [ -n "$TITLE" ] && [ "$TITLE" != "null" ] && [ "$TITLE_LEN" -ge 20 ] && SCORE=$((SCORE + 2))
  [ -n "$DESC" ] && [ "$DESC" != "null" ] && [ "$DESC_LEN" -ge 100 ] && SCORE=$((SCORE + 2))
  [ -n "$CANONICAL" ] && [ "$CANONICAL" != "null" ] && SCORE=$((SCORE + 1))
  [ "$H1_COUNT" -eq 1 ] && SCORE=$((SCORE + 1))
  ([ "$OG_COMPLETE" = "true" ] || [ "$OG_COMPLETE" = "True" ]) && SCORE=$((SCORE + 2))
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

  # Normalize booleans to lowercase for JSON
  OG_COMPLETE_JSON=$(echo "$OG_COMPLETE" | tr '[:upper:]' '[:lower:]')

  AUDIT_JSON="$AUDIT_JSON{\"page\":\"$PAGE\",\"status\":$STATUS,\"grade\":\"$GRADE\",\"score\":$SCORE,\"title\":\"$TITLE_ESC\",\"title_length\":$TITLE_LEN,\"description\":\"$DESC_ESC\",\"description_length\":$DESC_LEN,\"canonical\":\"$CANONICAL_ESC\",\"h1_count\":$H1_COUNT,\"h1_text\":\"$H1_ESC\",\"og_complete\":$OG_COMPLETE_JSON,\"schema_count\":$SCHEMA_COUNT,\"alt_coverage\":$ALT_COV,\"internal_links_out\":$INTERNAL_LINKS,\"in_sitemap\":$PAGE_IN_SITEMAP}"
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
