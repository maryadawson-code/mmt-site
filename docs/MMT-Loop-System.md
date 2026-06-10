# MMT Loop System — v1 (shipped)

A loop is: **trigger → fetch → reason → eval → write → alert**. Each loop is
declared in one JSON spec; a single shared runner executes any spec. Adding a
loop is a JSON file plus the small fn modules it references — no new
orchestration code.

This doc describes what actually shipped in v1, which is a deliberate subset of
the original `MMT_LOOP_SYSTEM_v1.md` architecture proposal, translated to this
repo's reality (static-HTML site + Netlify scheduled functions + Supabase, not
the GitHub-Actions/`lib/loops` stack the proposal assumed).

## Editorial boundary (non-negotiable)

No loop writes to `content/newsletter/`, `content/podcast/`,
`content/friday-briefs/`, or `content/capture-corner/`. **Loops detect and
stage DATA only; Mary owns all editorial output and all sends.** The runner has
no path to a publishable directory.

## What shipped vs. what was skipped

| Loop | Status | Why |
|---|---|---|
| **L1 Opportunity Discovery** | ✅ shipped | Daily SAM.gov discovery, staged for review |
| **L3 Contract Tracker Freshness** | ✅ shipped | Hourly data-trust guard + public `/status.json` |
| L2 Pursuit Score QA | ⏸ deferred | Needs Mary's 50-row hand-graded golden set; fabricating it would violate the repo's no-fabricated-fixtures rule. Fast-follow once the golden set exists. |
| L4 Agency Drift | ❌ dropped | `netlify/functions/org-chart-monitor.js` already hashes agency leadership pages and emails Mary on change. A second detector would just double-notify. Future: port org-chart-monitor into this framework + add budget-delta. |
| L5 Newsletter QA | ❌ out of scope | Mary handles newsletter content independently. |
| L6 Friday Brief Integrity | ❌ out of scope | Pauses Mary's premium send pipeline — her sends, her call. |
| L7 Podcast Pipeline | ❌ out of scope | Mary handles podcast content independently. |
| L8 Agent Regression | ⏸ deferred | Larger (agent registry + admin dashboard + LLM judge); lower near-term ROI. |

## Architecture (as built)

```
Netlify cron ──▶ loop-opportunity-discovery.js   (0 12 * * *)
Netlify cron ──▶ loop-contract-freshness.js       (0 * * * *)
manual/CI ─────▶ loop-runner.js  (secret-gated, ?key=LOOP_RUNNER_SECRET)
                        │
                        ▼
        netlify/functions/lib/loops/runner.js  ── loads specs/<name>.json
                        │                          resolves step/eval fns via registry.js
        steps ─▶ evals ─▶ (gated) publish ─▶ loop_runs + loop_evals + ops_ledger
                        │
                        ▼  on fail/drift
                   Resend → mary@missionmeetstech.com
```

- **Reasoning lives in `netlify/functions/lib/loops/`** (runner, registry,
  specs, fetchers, transforms, enrichers, scorers, publishers, evals). The
  Netlify functions are thin HTTP/cron entry points only.
- **`registry.js` uses static `require`s** so Netlify's esbuild bundles every
  step/eval module. A dynamic `require(varPath)` would drop modules from the
  bundle.
- **Evals gate the publish step.** A step marked `"publish": true` only runs
  when every eval passes. On fail/drift the publish is skipped and Mary is
  alerted; the run is still recorded.

## Database

`migrations/20260610000000_loop_infra.sql` (**GATED — apply only after Mary
approves**, per repo convention). Idempotent, non-destructive:

- `loop_runs` — one row per execution (status, trigger, input_hash, cost, error)
- `loop_evals` — one row per eval per run (passed, score, threshold, details)
- `loop_config` — enable/disable + retune a loop without a code deploy
- `loop_opportunities` — L1 staged output (separate from live `opportunity_radar`)
- `loop_status` — L3 source-health snapshots (served by `/status.json`)

## L1 — Opportunity Discovery

`specs/opportunity_discovery.json`. Daily 12:00 UTC.

`fetch` (SAM.gov, 5 health-IT queries) → `dedupe` (by notice_id, dup-rate) →
`enrich` (top-3 USASpending incumbents per agency) → `score` (quota-safe
heuristic) → **`publish`** (upsert `loop_opportunities`, gated on evals).

Evals: `freshness` (newest ≤ 72h), `score_distribution` (mean 25–85, stdev ≥ 6),
`no_pii_leak` (zero customer emails / Stripe ids), `dup_rate` (≤ 0.4).

**Why a heuristic scorer, not the premium `scorePursuit()` engine:** that engine
hits SAM.gov on every call, and `SAM_GOV_API_KEY` has a **small shared daily
quota** (CLAUDE.md hard rule). Scoring ~15 opportunities/day through it would
exhaust the pool and break the on-demand tools. The L1 scorer
(`scorers/pursuit_score.js`) scores from data already in hand — SAM metadata +
the unauthenticated USASpending incumbent set — so it makes **zero** extra SAM
calls, costs $0, and is deterministic. It's a triage signal to prioritize
Mary's review of staged rows, not a published bid/no-bid verdict.

L1 output lands in `loop_opportunities` for review. Nothing auto-promotes to the
live tracker.

## L3 — Contract Tracker Freshness

`specs/contract_tracker_freshness.json`. Hourly.

`health` (ping unauthenticated upstreams + measure Supabase row-lag per source)
→ `snapshot` (write `loop_status`). Eval `lag_thresholds` marks any
reachable-but-stale or non-2xx source as **drift** → alerts Mary.

- **SAM.gov is not live-pinged hourly** (would burn the daily quota). SAM-backed
  freshness is observed via row lag of the tables its crons populate.
- Unknown lag (table/column unresolved) is treated as "unknown", never a false
  STALE (see the CLAUDE.md false-STALE sprint).
- `/status.json` serves the newest row per source for an uptime badge.

## Running locally

```bash
# Plan a loop without touching the network or DB:
node netlify/functions/lib/loops/runner.js --loop opportunity_discovery --dry-run

# Unit tests:
npx vitest run tests/unit/loops.test.js
```

On-demand in production (secret-gated):

```bash
curl -X POST "$SITE/.netlify/functions/loop-runner?key=$LOOP_RUNNER_SECRET" \
  -H 'content-type: application/json' \
  -d '{"loop_name":"contract_tracker_freshness"}'
```

## Operating the loops

- **Disable without a deploy:** `update loop_config set enabled=false where loop_name='...'`.
- **Retune cost cap:** `update loop_config set max_cost_usd=... where loop_name='...'`.
- **Audit:** every run writes a `loop_runs` row (even dry-run/skipped), with its
  evals in `loop_evals` and a `LOOP_PASS`/`LOOP_FAIL`/`LOOP_DRIFT` event in
  `ops_ledger`.

## Env vars (Mary sets in Netlify)

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — already set.
- `SAM_GOV_API_KEY` — already set (L1 fetch; daily-quota shared).
- `LOOP_RUNNER_SECRET` — **new**, gates the on-demand `loop-runner` endpoint.
- `LOOPS_ENABLED` — **new**, must be `true` for the scheduled crons to run.
  Off by default so the crons no-op (no failure alerts) until the gated
  migration is applied. The manual `loop-runner` endpoint ignores this flag,
  so you can test a loop before flipping it on.

## Deploy checklist

1. Apply `migrations/20260610000000_loop_infra.sql` to production (gated).
2. Set `LOOP_RUNNER_SECRET` in Netlify.
3. (Optional) Smoke-test via the manual endpoint while the crons are still off:
   `curl -X POST "$SITE/.netlify/functions/loop-runner?key=$LOOP_RUNNER_SECRET" -d '{"loop_name":"contract_tracker_freshness"}'`
4. Set `LOOPS_ENABLED=true` to turn on the scheduled crons.
5. Deploy. The two scheduled functions self-register from `netlify.toml`.
6. Verify `/status.json` returns JSON after the first L3 run.
