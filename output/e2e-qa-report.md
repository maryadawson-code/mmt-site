# E2E QA Report — March 21, 2026

## API Health

| Endpoint | Status | Data | Notes |
|----------|--------|------|-------|
| roadmap-api (summary) | OK (200) | 45 features | Works correctly |
| roadmap-api (list) | **BROKEN (500)** | 0 | `health_endpoint` column doesn't exist in product_roadmap table — **fixed in this PR** |
| roadmap-api (detail) | OK (200) | n/a | Uses `select(*)`, no column mismatch |
| roadmap-api (dependencies) | OK (200) | 45 features | `depends_on` column exists (mostly null) |
| get_deploys | OK (200) | 0 deploys | `NETLIFY_SITE_ID_MMT` env var not set yet — returns graceful message |
| get_prs | OK (200) | Real data | Returns PRs from both repos correctly |
| qa-api (summary) | OK (200) | 4 products | No test runs logged yet (expected — QA system is new) |
| issues-api (stats) | OK (200) | 7 open issues | All severity:high/medium, all status:detected |
| agent-bridge | OK (200) | n/a | Auth works, task dispatch works |
| command-center-api (dashboard) | OK (200) | Full data | All dashboard data loads correctly |

## UI Rendering

| View | Renders? | Interactive? | Bugs |
|------|----------|-------------|------|
| Roadmap detail | **NO** — blank | N/A | Root cause: `roadmap-api?view=list` returns 500 because `health_endpoint` column doesn't exist. Fixed by removing non-existent columns from select. |
| Roadmap tile | YES | N/A | Summary data loads correctly, tile shows counts |
| Engineering detail | YES | YES | Deploy history empty (env var not set), PRs load correctly, tech debt loads from roadmap |
| QA detail | YES | YES | Shows 4 products, no test runs yet (expected), action buttons render |
| Agent Fleet detail | YES | YES | Cards render, steering buttons work, dispatch form works |
| Issues detail | YES | YES | 7 issues, full lifecycle, approval flow |
| Products detail | YES | YES | Orders, deliveries, recent reports section |
| COO Console | YES | YES | Approval queue, ops metrics |
| Editorial | YES | YES | Newsletter pipeline, signals |
| Site Health | YES | YES | Ops events, circuit breakers, feature flags |
| Security | YES | YES | CMMC posture, findings |
| Cost Intelligence | YES | YES | API costs, trends |

## Root Cause: Roadmap Blank

**File:** `netlify/functions/roadmap-api.js`, line 136
**Bug:** The `view=list` select included `health_endpoint` and `file_map` columns that don't exist in the `product_roadmap` table.
**Error:** `column product_roadmap.health_endpoint does not exist` (HTTP 500)
**Impact:** Roadmap detail view fails to load features — shows "Loading features..." forever, then "No features found."
**Fix:** Replaced explicit column list with actual columns: removed `depends_on, file_map, health_endpoint`, added `notes`.

## MissionPulse Roadmap

The `/roadmap` page on missionpulse.ai uses `select('*')` via `lib/actions/product-roadmap.ts`, so it doesn't have the column mismatch issue. It reads from the same Supabase table (djuviwarqdvlbgcfuupa) and should render 45 features. No code fix needed — if it appears blank, it's likely a deployment or auth issue (user must be logged in).

## Fixes Applied

1. `netlify/functions/roadmap-api.js:136` — Removed `depends_on, file_map, health_endpoint` from list view select, added `notes`

## Remaining Manual Steps

1. Set `NETLIFY_SITE_ID_MMT=df450efb-dc54-4016-9905-6e884f0b31bd` in Netlify env vars
2. Set `NETLIFY_TOKEN` in Netlify env vars
3. Deploy after this PR merges (auto-deploy on main push)
4. Hard refresh command center to see roadmap features
