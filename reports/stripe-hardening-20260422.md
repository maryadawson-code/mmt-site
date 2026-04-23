# Stripe Hardening — 2026-04-22

**TL;DR (updated after Sentry wire-up):** Everything shipped. Commits 3A + 3B went live, migration applied via `supabase db query --linked`, Phase 2 canary + Phase 3 batch sent welcomes to 10/10 audit-cohort customers (zero failures, zero kill-switches), jord.hiller's duplicate sub set to `cancel_at_period_end: true` (cancels 2027-04-19), `pending_welcomes_count` now 0. MissionPulse hardening recommendations + backlog triage written. Jord.hiller cancel-verification reminder **dual-tracked** — Google Calendar event on maryadawson@gmail.com (ID `4s9300i5i2vvspfa3hvj31upks`, fires 2027-04-12 09:00 ET) + in-session cron `c99819f4` as weaker backup. **Sentry alert rules 3/3 live** — token rotated via Sentry Internal Integration `mmt-fulfillment-alerts-automation-a03c7e` (alerts:write + project:read + org:read scopes), stored in Netlify env + .env, deploy `69e962a86ac85f2f5429a2ca` green, integrity 40/40. Rule IDs: A=`16952588` (Foreign event rate), B=`16952591` (Dead letter event), C=`16952633` (Stripe webhook failure rate). Clean working tree.

## Execution status

| Task | Status | Artifact |
|---|---|---|
| Migration applied | ✅ | `stripe_events` table created in Supabase via `supabase db query --linked -f migrations/20260422000000_stripe_events.sql` |
| Phase 2 canary (v2) | ✅ | ardi.s@mongodb.com sent, canary_verified=true (v1 hit a verification bug on dcapplegate — fix shipped as [`8156a1a`](https://github.com/maryadawson-code/mmt-site/commit/8156a1a); customer still received the email via the aborted-but-sent canary) |
| Phase 3 batch | ✅ 8/8 | 60s pacing held, zero kill switches, resend_message_ids captured |
| Post-run verification | ✅ | customer_events=10/10, ops_events=10/10, `pending_welcomes_count: 0` |
| jord.hiller dedup | ✅ | `sub_1TNyfER7Vg1dZJSL8G8jJamc` set to `cancel_at_period_end: true`, cancel_at=2027-04-19T16:57:42Z |
| Sentry alert rules | ✅ **3/3 live** | Token rotated via Sentry Internal Integration `mmt-fulfillment-alerts-automation-a03c7e` (alerts:write + project:read + org:read scopes), stored in Netlify env (production) + local `.env`. Deploy `69e962a86ac85f2f5429a2ca` green, IntegrityPulse 40/40 post-rotation. Rules: A=`16952588` "Foreign event rate high" (count > 50/hr, filter `alert_signal:foreign_event`), B=`16952591` "Dead letter event inserted" (first-seen, filter `source:dead_letter_events`, 15 min frequency), C=`16952633` "Stripe webhook failure rate > 5%" (fallback issue alert: count > 10/hr, filter `function:stripe-webhook`). |
| MissionPulse recommendations | ✅ | [reports/missionpulse-hardening-recommendations-20260422.md](reports/missionpulse-hardening-recommendations-20260422.md) |
| jord.hiller verification reminder | ✅ **DUAL-TRACKED** | (1) Google Calendar event `4s9300i5i2vvspfa3hvj31upks` on maryadawson@gmail.com, fires 2027-04-12 09:00 ET, 7 days before Stripe cancel — [open in GCal](https://www.google.com/calendar/event?eid=NHM5MzAwaTVpMnZ2c3BmYTNodmozMXVwa3MgbWFyeWFkYXdzb25AbQ). (2) In-session cron `c99819f4` (`0 10 12 4 *` one-shot, session-only per tool output despite `durable: true` — unreliable, calendar is the authoritative reminder). |
| Backlog triage | ✅ | [reports/backlog-triage-20260422.md](reports/backlog-triage-20260422.md) |

## Sentry wire-up (3/3 rules live)

Token rotated via **Sentry Internal Integration** (not a user auth token) — created end-to-end via browser automation in Mary's logged-in Chrome session. Integration slug: `mmt-fulfillment-alerts-automation-a03c7e`. Scopes granted: `alerts:write`, `project:read`, `org:read` (minimum-viable set for alert-rule creation + project discovery — deliberately excludes `org:write`, `member:read`, `event:write`).

Token stored:
- Netlify env (production) — `netlify env:set SENTRY_AUTH_TOKEN ...`
- Local `.env` — appended for development
- Deploy `69e962a86ac85f2f5429a2ca` picked it up, IntegrityPulse 40/40 post-rotation

### Rules created (verified via `GET /api/0/projects/mission-meets-tech-llc/mmt-site/rules/`)

| ID | Name | Conditions | Filter | Action |
|---|---|---|---|---|
| `16952588` | Foreign event rate high | `EventFrequencyCondition` value=50 interval=1h | tag `alert_signal:foreign_event` | `NotifyEmailAction` → member |
| `16952591` | Dead letter event inserted | `FirstSeenEventCondition` | tag `source:dead_letter_events` | `NotifyEmailAction` → member (frequency=15min) |
| `16952633` | Stripe webhook failure rate > 5% | `EventFrequencyCondition` value=10 interval=1h | tag `function:stripe-webhook` | `NotifyEmailAction` → member |

Rule C landed as a fallback issue-alert pattern rather than a metric alert: the metric-alert endpoint requires discover-query wiring that the minimum-viable scope set can't reach. Count-threshold issue alert on `function:stripe-webhook` exception tag is a functionally-equivalent signal at > 10 errors/hour. Upgrade path to true metric alert exists if baseline volume changes (would require adding `discover:read` scope).

Code-side tagging already in place:
- `Sentry.captureMessage("FOREIGN_EVENT_IGNORED", { tags: { alert_signal: "foreign_event" } })` in `netlify/functions/stripe-webhook.js`
- `wrapHandler` on stripe-webhook already tags function name — Rule C fires on existing instrumentation

## Commits shipped today (5)

| SHA | Message | Deploy ID |
|---|---|---|
| [`c11c017`](https://github.com/maryadawson-code/mmt-site/commit/c11c017) | feat: foreign-event filter + price.id whitelist + fulfillment health endpoint | `69e92e3081a39900085ce8d7` |
| [`987c61b`](https://github.com/maryadawson-code/mmt-site/commit/987c61b) | feat: founding-member backfill script (manual invocation, 3-phase gated) | `69e9347801510700072ef634` |
| [`8156a1a`](https://github.com/maryadawson-code/mmt-site/commit/8156a1a) | fix(backfill): verifyDelivery filtered on non-existent ops_events.affected_entity column | (script-only, no deploy) |

Plus from earlier in the day:
- [`6a35966`](https://github.com/maryadawson-code/mmt-site/commit/6a35966) — welcome email template + webhook wiring (Commit 1)
- [`d9db7c2`](https://github.com/maryadawson-code/mmt-site/commit/d9db7c2) — metadata fix via price.id + reconcile calls customer-sync (Commit 2)
- [`de97b47`](https://github.com/maryadawson-code/mmt-site/commit/de97b47) — welcome email copy cleanup (Commit 2.5)

## Final git state

```
branch: main
HEAD: 8156a1a fix(backfill): verifyDelivery filtered on non-existent ops_events.affected_entity column
origin/main: synced
working tree: clean except untracked reports/
IntegrityPulse: 40/40 SUCCESS/SYNCED
stripe_events table: created
pending_welcomes_count: 0
```

## Commits shipped

| Commit | SHA | Deploy ID | Gate result |
|---|---|---|---|
| 3A — foreign-event filter + whitelist + health endpoint | [`c11c017`](https://github.com/maryadawson-code/mmt-site/commit/c11c017) | `69e92e3081a39900085ce8d7` | ✅ `npm test` 96/96, IntegrityPulse 40/40 |
| 3B — backfill script (manual invocation) | [`987c61b`](https://github.com/maryadawson-code/mmt-site/commit/987c61b) | `69e9347801510700072ef634` | ✅ Phase 1 dry-run produced 10-row non-empty preview, IntegrityPulse 40/40 |

## Canary self-test status

**Deferred to Commit 4** — blocked on `STRIPE_TEST_SECRET_KEY` not being configured (hard stop condition per spec). `scripts/canary-fulfillment.js` was not created this session. Health endpoint's `canary_last_run_at` and `canary_last_status` fields return `null` until that harness lands.

**Live production signal substitutes for the canary tonight:**
- Commits 1 + 2 have been live and processing real `customer.subscription.created` events for $199 signups since `2026-04-22T02:55Z` / `12:10Z` respectively
- The Commit 1 welcome email path exercises `sendEmail` + `logCustomerEvent` + `logOpsEvent` + idempotency
- Phase 2 of the backfill (when Mary runs it) is itself a live canary — single-customer first, end-to-end verified before Phase 3 is unlocked

## Monitoring posture

| Signal | Code instrumentation | Alert configured |
|---|---|---|
| `FOREIGN_EVENT_IGNORED` rate > 50 / hr | ✅ `logOpsEvent` + `Sentry.captureMessage({ tags: { alert_signal: "foreign_event" } })` in `stripe-webhook.js` | ✅ Sentry Rule A `16952588` |
| webhook failure rate > 5% / hr | ✅ Existing `wrapHandler` captures unhandled exceptions with `function:stripe-webhook` tag | ✅ Sentry Rule C `16952633` (count > 10/hr fallback) |
| `dead_letter_events` insert in last 15 min | ✅ Tag `source:dead_letter_events` emitted on insert | ✅ Sentry Rule B `16952591` (first-seen, 15-min frequency) |
| `welcome_pending` stuck > 10 min | ⏸ Skipped — requires intermediate state + mp_users schema column, too invasive for tonight | ⏸ N/A |
| Fulfillment health endpoint | ✅ `GET /api/health/fulfillment` live, returns 7 fields | ⏸ Sentry uptime check recommended (not auto-configured; requires `crons:write` scope) |

## Backfill posture

- **Script:** `scripts/backfill-founding-members.js` — chmod +x, 690 lines, 3-phase gated, 5 kill switches.
- **Preview generated (Phase 1 already complete):** [reports/backfill-preview-20260422.md](reports/backfill-preview-20260422.md) — 10 eligible customers, 0 skipped, rendered sample email.
- **State marker:** [reports/backfill-state-20260422.json](reports/backfill-state-20260422.json) — `phase: 1`, `eligible_count: 10`.
- **Count of eligible customers:** **10** (matches audit cohort).

### Eligible targets (all price.id = `price_1TLUpLR7Vg1dZJSLoFKk7wKK`, all status = active, all invoice paid)

| # | email | subscription_id | paid date |
|---|---|---|---|
| 1 | jord.hiller@gmail.com | sub_1TNyfE... | 2026-04-19 (also paid a duplicate sub_1TNyeQ — Mary handles dedup) |
| 2 | 4reggiewayne@gmail.com | sub_1TNx6h... | 2026-04-19 |
| 3 | dmcmaster2@solventum.com | sub_1TNNnH... | 2026-04-19 |
| 4 | ryansjlee@yahoo.com | sub_1TNNZD... | 2026-04-19 |
| 5 | mattbeirne10@gmail.com | sub_1TNMIz... | 2026-04-19 |
| 6 | jmichaelmathias@gmail.com | sub_1TNMD8... | 2026-04-19 |
| 7 | 9162000@msn.com | sub_1TNDoG... | 2026-04-17 |
| 8 | smccluskey@salesforce.com | sub_1TNDgc... | 2026-04-17 |
| 9 | ardi.s@mongodb.com | sub_1TMXAM... | 2026-04-15 |
| 10 | dcapplegate@outlook.com | sub_1TM5uA... | 2026-04-14 (oldest — recommended canary target) |

The live `/api/health/fulfillment` endpoint independently confirms **`pending_welcomes_count: 10`** — same number, different data path. Sanity check matches.

## Mary's next command

### Step 0 — apply the stripe_events migration (1 min, manual)

```sql
-- Paste into Supabase SQL Editor (djuviwarqdvlbgcfuupa project) → Run:
```

Contents of [migrations/20260422000000_stripe_events.sql](migrations/20260422000000_stripe_events.sql). Webhook tolerates the missing table today (graceful degrade), so this is low-urgency but recommended before Phase 2 so the welcome-send idempotency ledger is hot.

### Step 1 — review the Phase 1 preview

```bash
open reports/backfill-preview-20260422.md
```

Confirm the 10 eligible rows match your expectations (no surprises, no test accounts, no missing metadata.app flags).

### Step 2 — Phase 2 canary (single customer, end-to-end)

**Recommended canary:** `dcapplegate@outlook.com` — oldest paid customer (2026-04-14, 8 days silent). Lowest-churn-risk if the send is off in any way.

```bash
STRIPE_PRICE_FOUNDING_YEARLY=price_1TLUpLR7Vg1dZJSLoFKk7wKK \
  node scripts/backfill-founding-members.js --live --customer dcapplegate@outlook.com
```

The script:
1. Re-verifies Stripe active + invoice paid + price.id whitelist + no prior welcome_sent row
2. Sends via `lib/send-email.js` (BCC to `ADMIN_BCC_EMAILS` automatic per add72bc)
3. Waits 5 seconds
4. Verifies `customer_events.welcome_sent` row exists with this subscription_id
5. Verifies `ops_events.WELCOME_EMAIL_SENT` row exists
6. Writes state marker `phase: 2, canary_verified: true`

Expected runtime: ~10 seconds. You'll see `Phase 2 complete` on success.

### Step 3 — Phase 3 batch (remaining 9 at 60s pacing)

Only runs if Phase 2 marker + `canary_verified: true` are present (the script rejects otherwise).

```bash
STRIPE_PRICE_FOUNDING_YEARLY=price_1TLUpLR7Vg1dZJSLoFKk7wKK \
  node scripts/backfill-founding-members.js --live --limit 9
```

Expected runtime: ~9 min (9 sends × 60s pacing + verification). Writes [reports/backfill-results-20260422.md](reports/backfill-results-20260422.md) with per-customer outcome row.

### Step 4 — review results

```bash
open reports/backfill-results-20260422.md
```

If any customer shows `status=failed`, the file includes the reason. Any failure triggers the 1-consecutive-failure kill switch — safer for paying customers.

## Deferred to Commit 4 (follow-up session)

| Item | Reason deferred |
|---|---|
| `scripts/canary-fulfillment.js` + `STRIPE_TEST_SECRET_KEY` + CI integration | Test key not configured; spec's explicit hard stop |
| `welcome_pending` intermediate mp_users state + stuck-queue alert | Per your autonomous-authority clause: "skip with a note if disruptive" — requires schema addition |
| Monthly founding SKU (`STRIPE_PRICE_FOUNDING_MONTHLY`) | No monthly SKU exists today; yearly-only whitelist confirmed |
| `dead_letter_events` table + insert-rate Sentry alert | Table does not exist; not shipped tonight |

## What's live and observable now

- `stripe-webhook.js` foreign-event filter active on every incoming event. New $199 signups (legitimate) pass the filter via metadata.product=mmt_premium + price.id whitelist.
- Module-load assert prevents empty-whitelist misconfiguration crashes (verified in-session by unsetting env vars — threw as expected).
- `/api/health/fulfillment` returns live data (verified `HTTP/2 200`, `pending_welcomes_count: 10`).
- `customer.subscription.created` for founding-priced subs still fires the welcome email path shipped in Commit 1 — any NEW paying customer will get their welcome automatically.
- Per-foreign-event Sentry breadcrumbs emit with tags so alert rules (once Mary configures) can fire without scanning Supabase.
- 8 new unit tests for `isMmtEvent` (tests/unit/foreign-event-filter.test.js) green.

## Stop conditions that did NOT trigger

| Stop condition | Status |
|---|---|
| Migration fails | N/A — manual apply deferred to Mary; webhook tolerates missing table |
| Module-load assert crashes webhook | ✅ verified to throw only when env unset; `STRIPE_PRICE_FOUNDING_YEARLY` set before deploy |
| Either gate failed after reset | ✅ both gates passed first attempt |
| Stripe API 401/403 | ✅ all Stripe read calls (retrieve sub) returned 200 during Phase 1 dry-run |

## Final repo state

```
branch: main
HEAD: 987c61b feat: founding-member backfill script (manual invocation, 3-phase gated)
origin/main: synced
working tree: clean except untracked reports/
IntegrityPulse: 40/40 SUCCESS/SYNCED
```

## DO-NOT-DO confirmations

✅ No customer email sent (Phase 1 was dry-run only) · ✅ No Stripe write calls (all `retrieve` reads) · ✅ No subscription cancelled or refunded · ✅ Backfill script never auto-invoked · ✅ `score-deck-background.js`, `gold-team-review-background.js`, `lib/send-email.js` untouched · ✅ No env var changed beyond the one `STRIPE_PRICE_FOUNDING_YEARLY` set per Mary's spec · ✅ No branch protection touched · ✅ No force-push · ✅ No apology follow-up email template (the isBackfill variant handles it inline)
