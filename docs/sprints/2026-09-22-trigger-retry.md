# Sprint 2026-09-22 — one bad connection no longer fails a scheduled trigger

The 2026-09-22 pre-digest QA listed one ops_ledger failure in the last 24
hours: `award_tracker_trigger — AWARD_TRACKER_TRIGGER_RUN_FAILED ·
run_failed_status_500 · 2026-09-21T15:01:08Z`. Mary: "look into this and
fix it."

**What happened (from the ledger, not the logs, which are live-only):**
- 15:00:56Z the award-tracker trigger started and called its own
  background worker with one bare `fetch`. The connection never completed;
  undici gave up with "fetch failed" after 11,876 ms (its 10 s connect
  timeout plus overhead). The trigger returned 500 and the wrapper recorded
  the failure. Correctly: a returned 5xx is a failure.
- 15:02:55Z Netlify's at-least-once schedule ran the trigger again. It was
  accepted (202) in 1,039 ms and the worker logged AWARD_TRACKER_RUN_OK at
  15:03:29Z. The tracker itself was never unhealthy and no scan was lost.
- Every other thin trigger (opportunity-radar, contract-intel-refresh,
  ebuy-open-radar, newsletter-research, protest-monitor, sb-vehicle-radar,
  usaspending-prewarm) was the same copy-pasted bare fetch. This was the
  only failure across 340 trigger runs since 2026-08-20, and it will recur
  on whichever trigger draws the next bad connection.

**The fix:** `netlify/functions/lib/trigger-background.js`. One helper
fires the worker with two bounded attempts (8 s each, jittered pause of at
most 500 ms, under 17 s worst case against the 30 s scheduled limit) and
treats 202 as the only success: a 5xx from the edge retries, a 4xx or a
200 fails at once with the reason. All eight triggers are now three lines
around `makeTriggerHandler()`; the ops-wrapped ones still return 500 on a
total miss so the ledger records it and Netlify retries. A test reads each
trigger's source and fails on any bare `await fetch(`.

**Budget evidence (ops_ledger run_ok rows, 2026-08-20 to 2026-09-22):**
a successful 202 takes about 1 s at p50, up to 10 s at p99, 14.8 s at the
worst (opportunity_radar). A worker accepted twice re-runs an idempotent
upsert, which Netlify's own retry already causes.

**Not changed:** newsletter-research and protest-monitor still run without
`withOpsLogging`, so a total miss on those two returns 500 without a
ledger row, as before. Wrapping them is a separate decision (two new
event types in the ledger).

Also this session: the post-merge checks the agent platform PR (#221)
listed but the sandbox could not run were run from the desktop. Integrity
audit SUCCESS/SYNCED, 40 routes, 0 drift. `/api/v1` and `openapi.json`
read live with the state tools listed. Unauthenticated `/api/v1/states`
and `/api/v1/opportunities` return 401 with a UUID request id in the
header and body; a non-UUID `X-Request-Id` is replaced, a UUID one is
echoed.
