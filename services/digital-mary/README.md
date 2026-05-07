# Digital Mary

**Status: PARTIALLY STAGED. Sprint execution HALTED for missing canonical specs.**

Per `~/Downloads/HANDOFF-PACKAGE.md` (May 6, 2026), Digital Mary V2 is a
13-sprint program building an autonomous capture-coaching agent backed
by three MCP servers, an eval harness, and Stripe-gated tier access at
$99/mo (Pro) and $499/mo (Institutional).

## What's staged in this commit (data laydown only)

The HANDOFF-PACKAGE provides the **data artifacts** for several sprints
but **not the sprint definitions themselves**. The pieces below are
staged so the actual sprint work, when it begins, has its inputs ready.

| File | Source | Purpose |
|---|---|---|
| [`eval/golden-set.jsonl`](../../eval/golden-set.jsonl) | HANDOFF-PACKAGE.md §2 | 100 prompts (30 entity / 30 capture / 20 platform / 20 trap) with ideal answers and scoring rubrics. Drives DM-002 eval baseline. |
| [`data/digital-mary/canonical-entities.json`](../../data/digital-mary/canonical-entities.json) | HANDOFF-PACKAGE.md §3 | 50 canonical entities (20 vehicles, 15 programs, 5 people, 10 frameworks). Drives DM-203 entity-cache pre-compute. |
| [`data/digital-mary/win-themes.json`](../../data/digital-mary/win-themes.json) | HANDOFF-PACKAGE.md §4 | 30 win themes (5 each across Agility, Mission Fit, Tech Diff, Cost & Risk, Team, Outcome). Drives DM-904 capture coaching. |
| [`services/digital-mary/prompts/voice-rules.md`](prompts/voice-rules.md) | HANDOFF-PACKAGE.md §1 | STUB only — pending SOUL.md import. |

## Why execution is halted

Per HANDOFF-PACKAGE.md §, Step 1: *"Read `DIGITAL-MARY-SPEC.md` (in same
directory) — that's the full sprint sequence."*

`DIGITAL-MARY-SPEC.md` is **not present** in `~/Downloads/`. Without it,
the sprint sequence (P0-1 → A1 → A2 → A3 → A4 → B1 → B2 → B3 → B4 →
C1 → C2 → C3 → C4) has no defined deliverables. The HANDOFF-PACKAGE
provides resolved decisions and data artifacts, but not the
sprint-by-sprint architecture.

`~/Projects/openclaw/SOUL.md` is also absent. DM-401 (voice rules import)
is blocked on that file.

## Halt protocol

Per HANDOFF-PACKAGE.md §5, post a one-line halt request:

```
HALT: Digital Mary V2 needs DIGITAL-MARY-SPEC.md and ~/Projects/openclaw/SOUL.md. Pasting blocks resume.
```

When Mary supplies both files, resume with sprint P0-1 (foundation),
following the sequence in DIGITAL-MARY-SPEC.md.

## Final-gate quick reference (from §6)

Do not declare V2 done until:

1. ≥13 sprint commits with the prefix family
   `feat(eval|mcp|graph|agent|ui|memory|actions|brief|coaching|narrative|channels|public-mcp)`
2. `node eval/run-eval.js --against-baseline` beats the baseline.
3. Three MCP servers respond live:
   ```bash
   for srv in federal platform public; do
     curl -f https://mmt-mcp-$srv.fly.dev/.well-known/mcp-server-card.json | jq '.status'
   done
   ```
4. `node eval/run-eval.js --transcript-suite` averages ≥ 8/10.

When all four pass, post:

> Digital Mary V2 SHIPPED. 13 sprints complete. Baseline beat by [X]%. Ready for Mary to flip Pro + Institutional Stripe products live.
