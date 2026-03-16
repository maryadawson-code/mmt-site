#!/bin/bash
# ============================================================
# Context Hub (chub) — One-Shot Setup for Mary's Mac
# Run: bash setup-chub.sh
# ============================================================

set -e

echo "=== Context Hub Setup ==="
echo ""

# 1. Install chub CLI globally
echo "[1/4] Installing chub CLI..."
if command -v chub &>/dev/null; then
    echo "  ✓ chub already installed ($(chub --cli-version))"
else
    npm install -g @aisuite/chub
    echo "  ✓ chub installed ($(chub --cli-version))"
fi

# 2. Update the registry
echo "[2/4] Updating registry..."
chub update
echo "  ✓ Registry updated"

# 3. Install the Claude Code skill
echo "[3/4] Installing Claude Code skill..."
SKILL_DIR="$HOME/.claude/skills/get-api-docs"
mkdir -p "$SKILL_DIR"

cat > "$SKILL_DIR/SKILL.md" << 'SKILL_EOF'
---
name: get-api-docs
description: >
  MANDATORY for any coding task involving third-party libraries, SDKs, or APIs.
  Before generating code that imports or requires an external package, fetch current
  documentation from Context Hub (chub CLI). This prevents hallucinated parameters,
  deprecated methods, and outdated API patterns. Run automatically — do not wait
  for the user to ask.
---

# Get API Docs via chub

When you need to write code using any third-party library, SDK, or API, fetch the
documentation with `chub` before generating a solution. Do this automatically —
do not ask permission or wait to be told.

## Step 1 — Detect External Dependencies

Scan the task for any third-party package. If you see an `import`, `require`,
`pip install`, `npm install`, or reference to an external service, proceed to Step 2.

## Step 2 — Search the Registry

```bash
chub search "<library name>" --json
```

Pick the best-matching `id` from the results. If nothing matches, try a broader
search term. If the library is not in the registry, proceed with your training
knowledge but note the gap.

## Step 3 — Fetch the Docs

```bash
chub get <id> --lang py    # or --lang js, --lang ts
```

Omit `--lang` if only one language variant exists.

For multiple dependencies in one task:
```bash
chub get <id1> <id2> --lang py
```

## Step 4 — Code from the Docs

Read the fetched documentation. Use it — not training memory — for:
- Package names and versions
- Initialization patterns
- Method signatures and parameters
- Error handling patterns
- Authentication setup

**If your training knowledge conflicts with the docs, the docs win.** Add a comment
in the code noting the discrepancy.

## Step 5 — Annotate Discoveries

After the task, if you found a gotcha, workaround, or version quirk not in the
docs, save it for future sessions:

```bash
chub annotate <id> "Brief, actionable note about what you discovered"
```

Annotations persist locally and appear on future `chub get` calls.

## Step 6 — Feedback (Optional)

If the docs worked well or had issues:

```bash
chub feedback <id> up
chub feedback <id> down --label outdated
```

Ask the user before sending feedback.

## Quick Reference

| Goal                     | Command                                    |
|--------------------------|--------------------------------------------|
| Find a doc               | `chub search "stripe"`                     |
| Fetch Python docs        | `chub get stripe/api --lang py`            |
| Fetch JS docs            | `chub get openai/chat --lang js`           |
| Fetch multiple           | `chub get openai/chat stripe/api --lang py`|
| Save a note              | `chub annotate stripe/api "needs raw body"`|
| List notes               | `chub annotate --list`                     |
| Rate a doc               | `chub feedback stripe/api up`              |

## When to Skip

- Standard library only (Python builtins, Node.js core)
- Pure algorithm / data structure work
- Conceptual discussions with no code output
SKILL_EOF

echo "  ✓ Skill installed to $SKILL_DIR/SKILL.md"

# 4. Verify everything works
echo "[4/4] Verifying..."
echo "  Registry entries: $(chub search --limit 999 --json 2>/dev/null | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["results"]))' 2>/dev/null || echo 'check manually')"
echo "  Skill location:  $SKILL_DIR/SKILL.md"
echo "  Skill size:      $(wc -c < "$SKILL_DIR/SKILL.md") bytes"
echo ""
echo "=== Setup Complete ==="
echo ""
echo "What's configured:"
echo "  • chub CLI installed globally (npm)"
echo "  • Registry index updated"
echo "  • Claude Code skill at ~/.claude/skills/get-api-docs/SKILL.md"
echo ""
echo "Claude Code will now automatically check chub before writing"
echo "code that uses third-party libraries."
echo ""
echo "Test it: open Claude Code and ask it to 'use the Stripe API'"
echo "— it should run chub search + chub get before generating code."
