#!/bin/bash
# setup-routing.sh — Bootstrap local model routing for OpenClaw
#
# Run once on your local machine to set up Ollama + Penny Pincher.
# After this, local dev (netlify dev) routes eligible tasks to Ollama
# and Penny Pincher monitors all inference calls.
#
# Usage:
#   bash ops/setup-routing.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== OpenClaw Model Routing Setup ==="
echo ""

# ─── 1. Check Ollama ────────────────────────────────────────────
echo "1. Checking Ollama..."
if command -v ollama &>/dev/null; then
  echo "   Ollama installed: $(ollama --version 2>/dev/null || echo 'ok')"
else
  echo "   Ollama not found. Install from https://ollama.com"
  echo "   macOS: brew install ollama"
  echo "   Linux: curl -fsSL https://ollama.com/install.sh | sh"
  exit 1
fi

# ─── 2. Pull required models ────────────────────────────────────
echo ""
echo "2. Pulling required Ollama models..."

for MODEL in gemma3:27b gemma3:12b; do
  if ollama list 2>/dev/null | grep -q "$MODEL"; then
    echo "   $MODEL: already available"
  else
    echo "   Pulling $MODEL (this may take a while)..."
    ollama pull "$MODEL"
  fi
done

# ─── 3. Start Ollama if not running ─────────────────────────────
echo ""
echo "3. Checking Ollama server..."
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "   Ollama server running"
else
  echo "   Starting Ollama server..."
  ollama serve &
  sleep 3
  if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "   Ollama server started"
  else
    echo "   Failed to start Ollama. Try: ollama serve"
    exit 1
  fi
fi

# ─── 4. Test inference ──────────────────────────────────────────
echo ""
echo "4. Testing gemma3:27b inference..."
RESPONSE=$(ollama run gemma3:27b "Respond with only the word VERIFIED" 2>/dev/null)
if echo "$RESPONSE" | grep -qi "VERIFIED"; then
  echo "   gemma3:27b inference: VERIFIED"
else
  echo "   gemma3:27b returned: $RESPONSE"
  echo "   Model works but gave unexpected response (acceptable)"
fi

# ─── 5. Set up OpenClaw workspace ───────────────────────────────
echo ""
echo "5. Setting up OpenClaw workspace..."
OPENCLAW_DIR="$HOME/.openclaw"
mkdir -p "$OPENCLAW_DIR/workspace/agents" "$OPENCLAW_DIR/logs" "$OPENCLAW_DIR/backups"

cp "$SCRIPT_DIR/openclaw/openclaw.json" "$OPENCLAW_DIR/openclaw.json"
cp "$SCRIPT_DIR/openclaw/providers.yaml" "$OPENCLAW_DIR/providers.yaml"
cp "$SCRIPT_DIR/openclaw/agent-audit.json" "$OPENCLAW_DIR/workspace/agent-audit.json"

# Copy agent configs if they exist
if [ -d "$SCRIPT_DIR/openclaw/agents" ]; then
  cp "$SCRIPT_DIR/openclaw/agents/"*.json "$OPENCLAW_DIR/workspace/agents/" 2>/dev/null || true
fi

touch "$OPENCLAW_DIR/logs/inference.jsonl"
echo "   OpenClaw workspace: $OPENCLAW_DIR"

# ─── 6. Set up Penny Pincher ────────────────────────────────────
echo ""
echo "6. Setting up Penny Pincher..."
PP_DIR="$HOME/Projects/penny-pincher"
mkdir -p "$PP_DIR/reports"
cp "$SCRIPT_DIR/penny-pincher/penny_pincher.py" "$PP_DIR/penny_pincher.py"
cp "$SCRIPT_DIR/penny-pincher/requirements.txt" "$PP_DIR/requirements.txt"

# Test Penny Pincher
echo "   Running dry-run..."
python3 "$PP_DIR/penny_pincher.py" --dry-run 2>&1 | grep -E "Penny Pincher|VIOLATION|Complete"
echo ""

# ─── 7. Install service ─────────────────────────────────────────
echo "7. Installing service..."
if [[ "$(uname)" == "Darwin" ]]; then
  # macOS: launchd
  cp "$SCRIPT_DIR/penny-pincher/com.maryd.pennypincher.plist" ~/Library/LaunchAgents/
  # Update paths to actual home directory
  sed -i '' "s|/Users/maryd|$HOME|g" ~/Library/LaunchAgents/com.maryd.pennypincher.plist
  echo "   Installed: ~/Library/LaunchAgents/com.maryd.pennypincher.plist"
  echo "   Start: launchctl load ~/Library/LaunchAgents/com.maryd.pennypincher.plist"
else
  # Linux: systemd
  mkdir -p ~/.config/systemd/user
  cp "$SCRIPT_DIR/penny-pincher/penny-pincher.service" ~/.config/systemd/user/
  sed -i "s|/root|$HOME|g" ~/.config/systemd/user/penny-pincher.service
  echo "   Installed: ~/.config/systemd/user/penny-pincher.service"
  echo "   Start: systemctl --user enable --now penny-pincher"
fi

# ─── 8. Environment variable ────────────────────────────────────
echo ""
echo "8. Environment setup"
echo "   Add to your shell profile or .env:"
echo "   export OLLAMA_BASE_URL=http://localhost:11434"
echo ""
echo "   For netlify dev, add to .env:"
echo "   OLLAMA_BASE_URL=http://localhost:11434"

# ─── Done ────────────────────────────────────────────────────────
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Routing status:"
echo "  Local-eligible tasks (14 agents) → Ollama gemma3:27b/12b"
echo "  Anthropic-required tasks (9 agents) → claude-sonnet-4-5"
echo "  Penny Pincher → monitoring inference.jsonl"
echo ""
echo "To verify: OLLAMA_BASE_URL=http://localhost:11434 netlify dev"
