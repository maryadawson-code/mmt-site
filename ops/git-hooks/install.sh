#!/bin/bash
# Install MMT git hooks
HOOKS_DIR="$(git rev-parse --show-toplevel)/.git/hooks"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cp "$SCRIPT_DIR/pre-push" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"

echo "Git hooks installed."
echo "   Pre-push: blocks direct main pushes, checks deploy queue + conflicts"
