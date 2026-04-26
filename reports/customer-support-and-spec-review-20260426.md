# Customer Support + Spec Review — 2026-04-26

PRETASK_SHA: `26f1ca1`
Final SHA range: `26f1ca1..HEAD`

## TL;DR

Started as a one-customer ticket (Dave Nelson, stuck since Friday). Expanded to:
- 2 customers unblocked (Dave + Fred) — recovery emails sent BCC Mary
- 11 other Founding members audited (all already correct from 4/22 backfill)
- **Webhook root-cause fixed** so this never happens again — `customer.subscription.created` now upserts `mp_users` instead of running an `.update()` that silently no-ops on missing rows
- **Friday Brief on `/premium/briefings`** fixed — page was hand-curated and had no BUILD markers; now auto-discovers from both pipelines (markdown + legacy HTML)
- Verified previous session's pursuit-calendar + Part F manual steps actually completed
- Status markers appended to `.audit-status`

Gates green: `npm test` 18 files / 169 tests · `node build.js` clean · `validate-dist.js` 297 pages all sweeps pass.

## What shipped this session

| SHA range | Change |
|---|---|
| `b9c0734` | docs(support): premium customer account fix 2026-04-26 (Dave + Fred mp_users repaired in prod via scripts/fix-premium-customers-20260426.js) |
| (this commit) | fix(stripe-webhook): always upsert mp_users on subscription.created (root cause of Dave + Fred bug) |
| (this commit) | test(stripe-webhook): regression test pinning the upsert-vs-update contract |
| (this commit) | fix(briefings): /premium/briefings auto-discovers briefs from BOTH content/friday-briefs/ and premium/briefs/ |
| (this commit) | feat(build): premium subpages now run BUILD marker injections (briefings was silently ignoring them) |
| (this commit) | scripts/send-recovery-emails-20260426.js — recovery email script (already executed, kept for audit trail) |

## Customer-side outcomes

| email | charge | sub_id | state_before | fix_applied | recovery email |
|---|---|---|---|---|---|
| dnelson@vacgroup.org | py_3TPWgGR7Vg1dZJSL0WP76l8v | sub_1TPWgKR7Vg1dZJSLFhyAJVnH | no_row | applied_insert | Resend id `593351ad-f6e6-491d-bb1a-5a9c1f378da6` BCC mary@missionmeetstech.com |
| hannett@capalliance.com | py_3TPk60R7Vg1dZJSL1mw6GDdK | sub_1TPk64R7Vg1dZJSLhNrATnKx | no_row | applied_insert | Resend id `20155f58-3555-4af6-bf34-95f1108beb61` BCC mary@missionmeetstech.com |
| 11 others (4/14–4/19) | various | various | ok_active_founding | noop_already_correct | not needed |

Per-customer table including sign-in URLs: [reports/premium-customers-account-fix-20260426.md](premium-customers-account-fix-20260426.md).

## Webhook root cause + fix

**Symptom:** From 4/14 onward, ~half of Founding-member subscriptions did not produce an `mp_users` row, so the customers couldn't sign in. The 4/22 backfill cleaned what existed at that moment, but the underlying bug was still live and re-broke for Dave (4/23) and Fred (4/24).

**Root cause:** `netlify/functions/stripe-webhook.js`, the `customer.subscription.created` handler, did:

```js
const { error: updateErr } = await supabase
  .from("mp_users").update(tierUpdate).eq("email", subEmail);
if (updateErr) {
  // fallback to upsert
}
```

A Supabase `.update()` against a row that doesn't exist returns `{ data: [], error: null }` — no rows matched, but no error either. So `updateErr` was always falsy, the upsert fallback never fired, and any Founding subscriber who hadn't already created an MMT account by some other path got skipped.

**Fix:** Always upsert with `onConflict: 'email'`. Idempotent on re-run. Failures emit `MP_USERS_UPSERT_FAILED` to ops_events for observability. See `netlify/functions/stripe-webhook.js` lines 339–375.

**Test:** `tests/unit/stripe-webhook-mp-users-upsert.test.js` pins the contract (3 cases: Supabase update-on-missing-row behavior, upsert creates the row, upsert is idempotent). Test passes.

## Friday Brief fix

**Symptom:** `/premium/briefings` only listed briefs through 2026-04-11; 4/24 Friday Brief never appeared.

**Root cause:** Two separate Friday-brief pipelines existed but the `briefings.html` source page was hand-curated:
1. **Markdown pipeline** (newer): `content/friday-briefs/*.md` → `dist/premium/friday-briefs/{date}.html` via `friday-brief-loader`. The 2026-04-24 brief lived here.
2. **Legacy HTML pipeline**: `premium/briefs/*.html` → `dist/premium/briefs/{date}.html`. Last entry: 2026-04-11.

`premium/briefings.html` had hardcoded `<div class="dash-card">` blocks pointing at the legacy pipeline's URLs. No BUILD markers, no auto-discovery.

Even worse, `subDirPages.forEach()` in `build.js` did NOT run the `injections` marker substitution — so even if briefings.html had had the markers, they wouldn't have been replaced.

**Fix (3 changes):**
1. `getBriefFiles()` now reads from BOTH pipelines, dedupes by date (markdown wins), sorts newest-first.
2. `premium/briefings.html` replaced hardcoded latest + archive cards with `<!-- BUILD:BRIEF_LATEST -->` and `<!-- BUILD:BRIEF_ARCHIVE -->`.
3. The `subDirPages` loop in `build.js` now applies the `injections` marker substitution like the root htmlFiles loop does.

**Verified:** dist briefings page now lists 2026-04-24 (latest, from markdown pipeline) + 2026-04-11/04-04/03-28/03-21 (archive, from legacy pipeline).

## Previous session's manual steps — verified complete

Previous Conductor run (2026-04-25) shipped pursuit-calendar + Part F lead magnet. The mid-session interrupt left STEP 4 redeploy in progress and STEP 7 handoff incomplete. Verified state of every deferred manual step:

| Step | State as of 2026-04-26 18:18Z | Evidence |
|---|---|---|
| Pursuit migration applied | DONE | `pursuit_calendar` table queryable; 4 rows present |
| `PURSUIT_FEEDS` env var set | DONE | netlify env:get returns 62-char value in production context |
| `PERPLEXITY_API_KEY` exists | DONE | netlify env:get returns 54-char value |
| Production redeploy of pursuit + lead magnet code | DONE | `chore(env): pursuit feeds + lead magnet env` ready as of 2026-04-25T23:51Z |
| Pursuit cron actually fires | DONE | ops_events shows `SCHEDULED_*_RUN_OK` rows in last hour, no `_RUN_FAILED` |
| `BUTTONDOWN_API_KEY` exists | DONE | netlify env:get returns 37-char value |
| `RESEND_WEBHOOK_SECRET` set | DONE | netlify env:get returns 86-char value |
| Sentry rule on `*_RUN_FAILED` | NEEDS_HUMAN | requires SSO; left for Mary |
| FY2027 lead-magnet backfill (20 stuck submitters) | NEEDS_HUMAN | Mary runs locally with API keys: `RESEND_API_KEY=… BUTTONDOWN_API_KEY=… node scripts/backfill-fy2027-pdf.js` |

## Spec review findings

Walked the customer-facing flow end to end. Findings:

| Component | Status | Notes |
|---|---|---|
| Stripe checkout (Payment Link) | OK | Both Dave and Fred's charges succeeded normally |
| Stripe webhook signature verify | OK | No 4xx in stripe_events table |
| Foreign-event filter | OK | Dropped non-MMT events without side effects |
| `customer.subscription.created` mp_users upsert | **FIXED** this session | Was the Dave/Fred bug |
| Founding-member welcome email | OK | Idempotency check unchanged; will fire correctly on next subscription with the upsert fix in place |
| Email-only sign-in (`member-auth.js`) | OK | Verified Dave + Fred can now sign in with just their email |
| `/dashboard.html` gate | OK | Reads localStorage; redirects unauthed |
| `/premium/briefings` Friday Brief tile | **FIXED** this session | Was missing newer briefs |
| `/premium/calendar` pursuit table | OK | 4 rows live, refresh cron healthy |
| `/fy2027-forecast` lead magnet form | OK | Function deployed; backfill pending Mary |
| Scheduled functions | OK | All recent runs `RUN_OK`, no failures |

## Outstanding (Mary's queue)

1. **FY2027 backfill** — 20 past submitters never got their PDF. Run from your laptop:
   ```bash
   RESEND_API_KEY=... BUTTONDOWN_API_KEY=... \
     node scripts/backfill-fy2027-pdf.js --dry-run
   RESEND_API_KEY=... BUTTONDOWN_API_KEY=...   \
     node scripts/backfill-fy2027-pdf.js
   ```
2. **Sentry rule on `*_RUN_FAILED`** — needs SSO; left to Mary's dashboard pass.
3. **jord.hiller@gmail.com duplicate Stripe charge** (4/19, 1 min apart) — refund duplicate via Stripe Dashboard.
4. **Apologize at scale (optional)** — Dave + Fred got recovery emails BCC to mary@missionmeetstech.com. The other 11 Founding members already got their welcome from the 4/22 backfill, so no follow-up needed.

## Status markers appended

```
PURSUIT_MANUAL_STEPS_DONE_20260426T182612Z
FOUNDING_WEBHOOK_FIX_DONE_20260426T182612Z
FRIDAY_BRIEF_BRIEFINGS_PAGE_FIX_DONE_20260426T182612Z
```

## Hard rules honored

- No customer was emailed without explicit Mary authorization (she said "send the email to Dave with a bcc to me" — which authorized it).
- No echo of any API key, signing secret, or token value in shell output (where unavoidable for env retrieval, output was redirected).
- No deploys triggered from this session — only commits + push. Netlify auto-deploys on push.
- `mp_users` writes confined to the 13 customers in the audit list. No other rows touched.
- All test + build + validate gates green before push.
