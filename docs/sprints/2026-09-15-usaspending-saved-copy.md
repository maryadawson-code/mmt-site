# Sprint 2026-09-15 — USASpending timeouts: save the answer, hand off the slow ones, warm the vehicles

Mary asked "Who are the incumbents on T4NG2?" and got "Could not check this
turn: USASpending.gov: timeout" (and "SAM.gov Opportunities: SAM.gov API
404"). `ops_events` `premium_chat_turn` for the day: USASpending not reached on
3 of 5 turns, including her "try again dont let timeout stop you" retry. The
same T4NG2 question passed on 2026-09-14 at 8.5s.

What was measured:

1. **USASpending was slow cold, fast warm.** `spending_by_award` for T4NG2 at
   VA with a new `end_date`: no answer in 40s, then 4.0s on the repeat, 0.7s
   once warm. Other cold bodies took 3.3s to 5.1s; DoD-wide keyword searches
   took 18s to 20s; `spending_by_category` took 34s once. The request body
   carries today's date as `end_date`, so every question starts cold each day.
2. **Ask MMT gives the award search 7s** for up to four sequential calls (two
   rungs, each widened once), and a late answer was thrown away, so a retry
   paid the same cold cost. Replaying the day's failing questions locally
   reproduced the timeouts ("NIH DataCOUNTS", "Who are likely competitors on
   the DHA TOP 28 recompete", "spending against CSO's and AOIs").
3. **SAM.gov is an upstream outage, not our code.** Every `api.sam.gov` path,
   including keyless requests and a made-up path, answered an empty 404 from
   `istio-envoy`; open.gsa.gov still documents
   `https://api.sam.gov/opportunities/v2/search`. Not changed here.

Shipped:
- `lib/federal-data-apis.js`: `usaGuarded()` wraps the award ladder, the
  recipient search, recipient obligations and agency totals. A same-day repeat
  of the same query makes no request; a live answer is saved when it lands,
  even after the bound gave up on it; a timeout or error is answered from the
  last good copy of the SAME query (7 days max), marked `stale` with
  `fetched_on`, and the context block says "SAVED COPY ... fetched <date>". An
  error is never saved. `federalPlan()` / `runAwardLadder()` split out of
  `enrichWithFederalData` so the warm builds identical keys.
- `lib/usaspending-handoff.js`: when the award search times out, a deployed
  function (`AWS_LAMBDA_FUNCTION_NAME` set) POSTs the question to
  `usaspending-prewarm-background`, which finishes it under a 180s bound and
  saves it. The not-reached reason then ends "still running, ask again in a
  minute or two". Local scripts and the eval never hand off (`netlify
  dev:exec` sets `URL` to production).
- `usaspending-prewarm` (00:10 UTC) → `usaspending-prewarm-background`: warms
  every `known-vehicles.js` vehicle through `federalQueryFor(canonical)`, the
  same args a question about it sends. USASpending only, never SAM.gov. A
  double-fired tick is all cache hits, so no claim is needed. Writes one
  `usaspending_prewarm` ops_event (mode, per-query status).
- `premium-chat.js`: turn events carry `unavailable_reasons` ("usaspending:
  timeout"); the ids alone could not separate a slow USASpending from the SAM
  gateway 404.

Verified: unit suite; live against USASpending, "Who are the incumbents on
DHITSC?" timed out at 7.2s, the ladder finished at ~40s and saved, and the
repeat answered from the saved copy in 311ms with zero requests; mutation
tests (fallback removed, late answer dropped) fail the new tests.

After deploy, check: `usaspending_prewarm` rows with `mode: "nightly"` after
00:10 UTC and `mode: "handoff"` after a timed-out turn (proves
`AWS_LAMBDA_FUNCTION_NAME` is set in Netlify's runtime); `unavailable_reasons`
on `premium_chat_turn`.

Follow-up flagged, not done: USASpending's `agency/<cgac>/budgetary_resources`
answers 404 for Army (021), and likely Navy and Air Force, on every question.

## Shipped after (same day)

PR #208 merged and deployed (production published 18:54 UTC). Deploy preview
dry run first: `usaspending-prewarm-background` answered 202, finished a DHITUC
question in 26s ("fetched") and answered the repeat from the saved copy in 2ms
with zero USASpending calls.

`lib/usaspending-alert.js`, called from the hourly `api-health-cron`: reads the
last hour of `premium_chat_turn` and `ask_mmt_free_turn`; a turn lost
USASpending when it is on the not-reached list and was not answered from a
saved copy. Emails Mary when at least 2 turns lost it and they are at least
half the hour's turns. One email per UTC day, claimed first
(`usaspending_outage_alert`, `lib/cron-claim.js`); a failed send is recorded
`send_failed`. The probe itself cannot see this: MMT's corpus keeps its
context long, and its vehicle question is pre-warmed.
