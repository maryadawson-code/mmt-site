#!/bin/bash
# ============================================================
# n8n Setup Script for Mission Meets Tech
#
# Prerequisites: Docker Desktop running
# Usage: bash n8n-workflows/setup.sh
# ============================================================

set -e

echo "=== MMT n8n Setup ==="
echo ""

# Generate password
N8N_PASSWORD=$(openssl rand -base64 16)

echo "Creating n8n data volume..."
docker volume create n8n_data 2>/dev/null || true

echo "Starting n8n container..."
docker rm -f n8n 2>/dev/null || true

docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=mary \
  -e "N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}" \
  -e GENERIC_TIMEZONE=America/New_York \
  -e N8N_DEFAULT_BINARY_DATA_MODE=filesystem \
  n8nio/n8n

echo ""
echo "============================================"
echo "  n8n Credentials (SAVE THESE)"
echo "============================================"
echo "  URL:      http://localhost:5678"
echo "  User:     mary"
echo "  Password: ${N8N_PASSWORD}"
echo "============================================"
echo ""

# Wait for n8n to be healthy
echo "Waiting for n8n to start..."
for i in {1..30}; do
  if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
    echo "n8n is running!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: n8n did not start within 60 seconds"
    echo "Check: docker logs n8n"
    exit 1
  fi
  sleep 2
done

echo ""
echo "Next steps:"
echo "  1. Open http://localhost:5678 in your browser"
echo "  2. Log in with the credentials above"
echo "  3. Run: bash n8n-workflows/deploy-workflows.sh"
echo ""
