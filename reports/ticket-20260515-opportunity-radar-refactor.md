# Ticket — Refactor opportunity_radar off Anthropic web_search

Filed: 2026-05-15
Status: open
Severity: medium (silent data starvation, not a customer-visible outage)
Owner: TBD

## Problem

`netlify/functions/opportunity-radar-background.js` has inserted **0
rows** into the `opportunity_radar` Supabase table since
**2026-04-13** — 32 days as of filing. The scheduled trigger
(`opportunity-radar.js`, cron `0 */4 * * *`) continues to fire on
schedule and `ops_events.OPPORTUNITY_RADAR_RUN_OK` is logged every
4 hours, so the failure is invisible to existing health monitoring.

## Evidence

```sql
-- Most recent row
SELECT id, scan_date, title, created_at
  FROM opportunity_radar
  ORDER BY created_at DESC LIMIT 1;

-- → id=985, scan_date=2026-04-13, created_at=2026-04-13T16:03Z
```

```sql
-- Trigger still firing
SELECT event_type, created_at
  FROM ops_events
  WHERE event_type LIKE 'OPPORTUNITY_RADAR%'
  ORDER BY created_at DESC LIMIT 4;

-- → OPPORTUNITY_RADAR_RUN_OK 2026-05-15T12:02Z (and every 4h prior)
```

## Root cause (high confidence)

`opportunity-radar-background.js` runs three Claude calls that each use
the `web_search_20260209` tool (Anthropic web_search). `CLAUDE.md`
sprint note 2026-04-15 explicitly documents that
`web_search_20260209` is **unreliable from serverless** — intermittent
`502 Bad Gateway` and `fetch failed` from both Netlify functions and
local Node. The same instability forced MarketPulse off Anthropic
web_search and onto Perplexity `sonar-pro` (see
`netlify/functions/generate-tactical-brief-background.js`).

In `opportunity-radar-background.js`, each scan is wrapped in a
try/catch (lines 282–314) that logs `Scan N failed:` and continues.
When all 3 scans fail, `allOpportunities = []`, the dedup/filter
loop produces `filtered = []`, the for-loop at line 359 doesn't
execute, and the function returns `200 { scanned: 0, filtered: 0,
upserted: 0, errors: 0 }`. The trigger wrapper records
`OPPORTUNITY_RADAR_RUN_OK` because the function returned 200.

## Customer impact

- Premium digest "New Solicitations" section permanently empty for
  any subscriber with `notifications.solicitations = true`.
- `/contract-tracker.html` Opportunity Radar module reads from the
  same `opportunity_radar` table — the user-facing freshness label
  on the Contract Tracker page is showing data from 2026-04-13.
- Net: a documented premium-tier feature has been silently dead
  for 5 weeks.

## Fix path

Port the scanner to Perplexity `sonar-pro` the same way MarketPulse
was ported. Reference implementation pattern:

- `netlify/functions/generate-tactical-brief-background.js` —
  Perplexity research calls (Passes 1–2) + Claude synthesis (Pass 3)
- `PERPLEXITY_API_KEY` env var already set in Netlify config

Rough scope:

1. Replace each `fetch('https://api.anthropic.com/v1/messages')` call
   that uses `web_search_20260209` with a Perplexity `sonar-pro`
   call. Keep the same prompt structure; Perplexity returns sources
   inline so the JSON-extraction pass at lines 197–204 still applies.
2. Keep the Claude scoring pass (relevance, validation) — that
   doesn't need web_search.
3. Add `OPPORTUNITY_RADAR_EMPTY_INSERT` ops_events log when
   `filtered.length === 0` so future starvation surfaces in
   `ops-health-rollup.json` instead of hiding behind `RUN_OK`.
4. Backfill: trigger the refactored function once on deploy to
   repopulate the table.

## Why this isn't being fixed inline

Same surface area and risk profile as the MarketPulse migration —
needs its own diagnose → port → backfill → verify cycle, not a
"while we're at it" change.

## Gate

- `opportunity_radar` table receives ≥10 rows per daily cron run
  for 7 consecutive days after deploy.
- `OPPORTUNITY_RADAR_EMPTY_INSERT` ops_event fires 0 times in the
  same window.
- Premium digest "New Solicitations" section renders for at least
  one subscriber on the day after deploy.

## Related

- `CLAUDE.md` § "Anthropic web_search is unreliable from serverless"
  (2026-04-15)
- `reports/contract-intel-diagnosis-20260425.md` — same root cause
  in `contract-intel-refresh-background.js`. Worth fixing together
  if scope allows.
