# Manual Subscriber Smoke Checklist

Run this after every production deploy. The automated tests cover schema, route resolution, and entitlement logic. This checklist covers the things that require a real browser and a real account.

Time required: ~10 minutes.

## Setup

You need:
- A free anonymous browser session (Incognito).
- A test premium-tier account, OR willingness to use Mary's account.
- The deploy URL (default: https://missionmeetstech.com).

## Public-user pass (Incognito)

Visit each route and verify it loads (200) and looks intentional:

- [ ] `/pursuit-score` → redirects to `/premium/pursuit-score.html`, then to `/dashboard.html` sign-in form
- [ ] `/pursuit-calendar` → redirects to `/premium/calendar.html`, then to `/dashboard.html` sign-in form
- [ ] `/askmtt` → redirects to `/premium/ask-mmt.html`, then to `/dashboard.html` sign-in form
- [ ] `/ask-mtt` → same
- [ ] `/compliance-check` → redirects to `/premium/compliance-check.html`, then to `/dashboard.html` sign-in form
- [ ] `/signal-chain` → redirects to `/premium/signal-chain.html`, then to `/dashboard.html` sign-in form
- [ ] `/capture-corner` → 200, locked teaser visible, **primary CTA `Read this week's issue` points to `/capture-corner/latest`** (not the old `/intel/...` route), no `████` blocks
- [ ] `/capture-corner/latest` → 302 → resolves to a real Capture Intelligence page with current month/issue label
- [ ] `/contract-tracker` → 200, vendor/value/NAICS show "Premium" placeholders, scanner shows last-scan date OR honest "no scan yet" message
- [ ] `/idiq-tracker` → 200, "28 vehicles" gate card visible (not empty), no `████`
- [ ] `/tools` → 200, every premium tool listed with a working link, RFP Shredder card carries `PRIVATE BETA` chip
- [ ] `/rfp-shredder` → 200, "Private Beta" status block visible, page does NOT claim live analysis runs on this domain
- [ ] `/help` → 200
- [ ] `/pricing` → 200, three Stripe Payment Links work (don't actually purchase)
- [ ] `/dashboard` → sign-in form
- [ ] `/latest` → newest source-of-truth article (from `content/newsletter/`) appears at top of main archive list, not just in editor's-picks tiles
- [ ] `/pursuit-calendar` (after sign-in) → page title is `Pursuit Calendar — 90-Day Deadline Tracker — MMT Premium` (NOT `Premium Dashboard`); RFI / Industry Day / Final RFP / Proposal Due / Recompete / Award all visible as category labels; freshness banner present
- [ ] `/premium/briefings` (after sign-in) → H1 is `The Friday Brief`; no raw `<!-- BUILD:BRIEF_ARCHIVE -->` markers; ≥1 archive card; title is NOT `Monthly Briefs`
- [ ] All premium pages render with **exactly one sidebar** — if you see two side-by-side sidebars, the double-sidebar regression is back; check `injectDashShell` in `build.js`
- [ ] Homepage `Choose a Tool` CTA href is `/tools` (not `/resources#paid-tools`) — verify by hovering on desktop and inspecting on mobile

## Founding/Premium pass

Sign in as a premium account, then verify:

- [ ] `/dashboard.html` → premium dashboard renders, sidebar shows all tools
- [ ] `/premium/pursuit-score.html` → BETA badge, score form loads, scoring against profile works (try keyword "VA Infrastructure Operations Franchise Fund Support Services" — verdict should be QUALIFY/MONITOR/CAPTURE_VALIDATION, not auto NO-BID)
- [ ] `/premium/profile.html` → loads existing profile, save round-trips correctly
- [ ] `/premium/ask-mmt.html` → form submits, confirmation email received within 2 min
- [ ] `/premium/calendar.html` → renders deadlines OR honest empty state with "last refreshed" timestamp
- [ ] `/premium/compliance-check.html` → form submits with sample SOW, BETA badge visible
- [ ] `/premium/signal-chain.html` → query returns layered scores with last-updated timestamp, BETA badge visible
- [ ] An article published in last 7 days → Capture Corner module visible at the bottom

## Founding-Member specific

Sign in as a Founding Member and verify:

- [ ] Ask MMT submission shows tier "Founding Member" in the confirmation email
- [ ] Ask MMT cap is 2/month (not 1/month — that was the 2026-04-27 bug)
- [ ] `/premium/dashboard.html` shows Founding chip if implemented

## Data freshness

Open the deployed Contract Tracker and verify:

- [ ] Opportunity Radar shows "Last scan: <date>" or "No scan yet"
- [ ] Vehicle Scanner shows "Last scan: <date>" or "No scan yet"
- [ ] Neither says "initializing" indefinitely
- [ ] If `age_hours > 48`, a stale-data note is visible

## Telemetry

After running the above:

- [ ] No new errors in Sentry within 5 min
- [ ] `ops_events.event_type = 'entitlement_mismatch'` count for the last hour is 0 (or only the cases you intentionally tested)

## Rollback criteria

Roll back the deploy if:

- Any marketed `/<route>` returns 404
- Founding/Premium account gets `NOT_SIGNED_IN` or `FREE_TIER` 403
- Pursuit Score returns auto NO-BID for the VA Franchise Fund test query
- `████` blocks appear on any page
- Scanner shows "initializing" indefinitely after data should be present
- Sentry error rate >2× baseline
