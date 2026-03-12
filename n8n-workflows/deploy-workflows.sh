#!/bin/bash
# ============================================================
# n8n Workflow Deployment Script for Mission Meets Tech
#
# Prerequisites:
#   - n8n running at http://localhost:5678
#   - Run setup.sh first to get credentials
#
# Usage: bash n8n-workflows/deploy-workflows.sh
# ============================================================

set -e

N8N_URL="http://localhost:5678"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== MMT n8n Workflow Deployment ==="
echo ""

# Check n8n is running
if ! curl -s "${N8N_URL}/healthz" > /dev/null 2>&1; then
  echo "ERROR: n8n is not running at ${N8N_URL}"
  echo "Run: bash n8n-workflows/setup.sh"
  exit 1
fi

echo "n8n is running."
echo ""

# Get n8n credentials
read -p "n8n username (default: mary): " N8N_USER
N8N_USER=${N8N_USER:-mary}
read -sp "n8n password: " N8N_PASS
echo ""
echo ""

AUTH=$(echo -n "${N8N_USER}:${N8N_PASS}" | base64)
AUTH_HEADER="Authorization: Basic ${AUTH}"

# Test auth
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${N8N_URL}/api/v1/workflows")
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Authentication failed (HTTP ${HTTP_CODE}). Check your n8n password."
  exit 1
fi
echo "Authenticated with n8n API."
echo ""

# ============================================================
# Step 1: Create credentials
# ============================================================

echo "=== Creating API Credentials ==="
echo ""
echo "I need your API keys. These are stored securely in n8n."
echo "(They're the same keys from your Netlify environment.)"
echo ""

create_credential() {
  local name="$1"
  local header_name="$2"
  local header_value="$3"

  local payload=$(cat <<EOF
{
  "name": "${name}",
  "type": "httpHeaderAuth",
  "data": {
    "name": "${header_name}",
    "value": "${header_value}"
  }
}
EOF
)

  local result=$(curl -s -X POST \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "${payload}" \
    "${N8N_URL}/api/v1/credentials")

  local cred_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -z "$cred_id" ]; then
    echo "  WARNING: Could not create '${name}'. It may already exist."
    echo "  Response: ${result}"
    # Try to find existing
    cred_id=$(curl -s -H "${AUTH_HEADER}" "${N8N_URL}/api/v1/credentials" | \
      python3 -c "import sys,json; creds=json.load(sys.stdin).get('data',[]); print(next((c['id'] for c in creds if c['name']=='${name}'), ''))" 2>/dev/null)
    if [ -n "$cred_id" ]; then
      echo "  Found existing credential: ${cred_id}"
    fi
  else
    echo "  Created '${name}': ${cred_id}"
  fi

  echo "$cred_id"
}

# Perplexity
read -sp "PERPLEXITY_API_KEY: " PERPLEXITY_KEY
echo ""
PERPLEXITY_CRED_ID=$(create_credential "Perplexity API" "Authorization" "Bearer ${PERPLEXITY_KEY}")

# Anthropic
read -sp "ANTHROPIC_API_KEY: " ANTHROPIC_KEY
echo ""
ANTHROPIC_CRED_ID=$(create_credential "Anthropic API" "x-api-key" "${ANTHROPIC_KEY}")

# Resend
read -sp "RESEND_API_KEY: " RESEND_KEY
echo ""
RESEND_CRED_ID=$(create_credential "Resend API" "Authorization" "Bearer ${RESEND_KEY}")

# Supabase
read -sp "SUPABASE_SERVICE_KEY: " SUPABASE_KEY
echo ""
SUPABASE_CRED_ID=$(create_credential "Supabase API" "apikey" "${SUPABASE_KEY}")

# Get Supabase URL
read -p "SUPABASE_URL (e.g., https://xxx.supabase.co): " SUPABASE_URL

echo ""
echo "Credential IDs:"
echo "  Perplexity: ${PERPLEXITY_CRED_ID}"
echo "  Anthropic:  ${ANTHROPIC_CRED_ID}"
echo "  Resend:     ${RESEND_CRED_ID}"
echo "  Supabase:   ${SUPABASE_CRED_ID}"
echo ""

# ============================================================
# Step 2: Deploy workflows (substitute credential IDs)
# ============================================================

echo "=== Deploying Workflows ==="
echo ""

deploy_workflow() {
  local file="$1"
  local name="$2"

  # Read and substitute credential IDs and Supabase URL
  local json=$(cat "$file" | \
    sed "s/PERPLEXITY_CRED_ID/${PERPLEXITY_CRED_ID}/g" | \
    sed "s/ANTHROPIC_CRED_ID/${ANTHROPIC_CRED_ID}/g" | \
    sed "s/RESEND_CRED_ID/${RESEND_CRED_ID}/g" | \
    sed "s/SUPABASE_CRED_ID/${SUPABASE_CRED_ID}/g")

  local result=$(curl -s -X POST \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d "${json}" \
    "${N8N_URL}/api/v1/workflows")

  local wf_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -z "$wf_id" ]; then
    echo "  ERROR creating '${name}':"
    echo "  ${result}" | head -c 200
    echo ""
  else
    echo "  Created '${name}': ${wf_id}"

    # Activate the workflow
    curl -s -X PATCH \
      -H "${AUTH_HEADER}" \
      -H "Content-Type: application/json" \
      -d '{"active": true}' \
      "${N8N_URL}/api/v1/workflows/${wf_id}" > /dev/null

    echo "  Activated '${name}'"
  fi

  echo "$wf_id"
}

WF1_ID=$(deploy_workflow "${SCRIPT_DIR}/workflow-newsletter-draft.json" "Newsletter Draft Writer")
WF2_ID=$(deploy_workflow "${SCRIPT_DIR}/workflow-sam-scanner.json" "SAM.gov Opportunity Scanner")
WF3_ID=$(deploy_workflow "${SCRIPT_DIR}/workflow-fact-check-rewrite.json" "Fact-Check + Rewrite")

# ============================================================
# Step 3: Set Supabase URL as n8n environment variable
# ============================================================

echo ""
echo "NOTE: Set SUPABASE_URL as an n8n environment variable:"
echo "  1. Open ${N8N_URL}/settings/environments"
echo "  2. Add: SUPABASE_URL = ${SUPABASE_URL}"
echo ""
echo "  (The n8n API doesn't support setting env vars directly."
echo "   Alternatively, stop the container and restart with:"
echo "   -e SUPABASE_URL=${SUPABASE_URL})"
echo ""

# ============================================================
# Summary
# ============================================================

echo "============================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo "  n8n URL:    ${N8N_URL}"
echo "  User:       ${N8N_USER}"
echo ""
echo "  Workflows:"
echo "    1. Newsletter Draft Writer    (ID: ${WF1_ID}) — Mon/Thu 8am ET"
echo "    2. SAM.gov Opportunity Scanner (ID: ${WF2_ID}) — Daily 6:30am ET"
echo "    3. Fact-Check + Rewrite       (ID: ${WF3_ID}) — Webhook"
echo ""
echo "  Credentials:"
echo "    Perplexity: ${PERPLEXITY_CRED_ID}"
echo "    Anthropic:  ${ANTHROPIC_CRED_ID}"
echo "    Resend:     ${RESEND_CRED_ID}"
echo "    Supabase:   ${SUPABASE_CRED_ID}"
echo ""
echo "  Fact-Check Webhook URL:"
echo "    POST ${N8N_URL}/webhook/fact-check-rewrite"
echo "    Body: {\"content\": \"text to check\", \"context\": \"optional\"}"
echo ""
echo "  Architecture:"
echo "    Netlify (cloud, 24/7):  protest-monitor, newsletter-research, fact-check"
echo "    n8n (local, additive):  Claude draft writing, SAM.gov scanning, fact-check+rewrite"
echo ""
echo "============================================"
