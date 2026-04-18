# MMT Platform — Deploy Handoff Checklist

**Last updated:** 2026-04-17 (autonomous execution pass)
**Owner:** Mary Womack

> **Status legend:** ✅ done · ⏳ waiting on external · 🔴 requires user action

## Completed this autonomous pass (2026-04-17)

- ✅ **Supabase migrations** (008 subscriber_context + 009 signal_monitors) applied to production via Supabase Management API
- ✅ **Mary's rockITdata seed** loaded → `subscriber_context` v1 in production
- ✅ **Stripe products** — 7 live-mode products + prices created, all price IDs set in Netlify env:
  - `STRIPE_COMPLIANCE_STANDALONE_ID` → `price_1TNKwTR7Vg1dZJSLmy2tCQnQ` ($49.99 one-time)
  - `STRIPE_COMPLIANCE_TEAM_ID` → `price_1TNKwUR7Vg1dZJSLUINe8O1B` ($199/mo)
  - `STRIPE_PURSUIT_STANDALONE_ID` → `price_1TNKwVR7Vg1dZJSLPBfTSBCw` ($29.99 one-time)
  - `STRIPE_PURSUIT_TEAM_ID` → `price_1TNKwVR7Vg1dZJSLhqUVRFMK` ($149/mo)
  - `STRIPE_SIGNAL_ADDON_ID` → `price_1TNKwWR7Vg1dZJSLgYRXeXMJ` ($49/mo)
  - `STRIPE_SIGNAL_PRO_ID` → `price_1TNKwXR7Vg1dZJSL5PMa2o5u` ($149/mo)
  - `STRIPE_SIGNAL_ENT_ID` → `price_1TNKwYR7Vg1dZJSLAJbPrO3u` ($399/mo)
- ✅ **api.data.gov key** — `CONGRESS_API_KEY` set in Netlify (unlocks Congress.gov v3 + GovInfo)
- ✅ **NCBI API key** — `NCBI_API_KEY` set in Netlify (raises PubMed rate limit to 10/s)
- ✅ **Launch article audit** (see `docs/launch-article-audit.md`) — every promise from the 2026-04-17 "Capture Gap" article reconciled against production. Drift fixed: Ask MMT tier quotas, Contract Tracker GO/WATCH/PASS verdicts on all 32 entries, Institutional Quarterly Briefings, Founding Member personal-reply language.

## Waiting on external

- ⏳ **USAJobs API key** — registration submitted 2026-04-17 under maryadawson@gmail.com. USAJobs reviews manually (up to 1 business day). When approved, the `Authorization-Key` token arrives by email. Set via `netlify env:set USAJOBS_API_KEY <token>` then:
  ```
  netlify env:set USAJOBS_USER_EMAIL maryadawson@gmail.com
  ```

## Requires user action (cannot be done autonomously)

- 🔴 **SAM.gov System Account application** for `SAM_SYSTEM_ACCOUNT_API_KEY`.
  SAM.gov's Terms of Use explicitly prohibit third-party credential access:
  *"Using another person's email address and password to access SAM.gov is
  prohibited."* The autonomous run cancelled at the ToU dialog because
  clicking Agree under the user's session would be a false certification.

  **Mary needs to do this herself**:
  1. Go to <https://sam.gov/workspace> signed in as the rockITdata entity admin
  2. Click "System Accounts" widget
  3. Request System Account with permission scope = "Contract Data → Read Public"
  4. Provide the IP whitelist (Netlify's egress IPs — their docs have the current list)
  5. Approval takes 2–4 weeks
  6. When the key arrives: `netlify env:set SAM_SYSTEM_ACCOUNT_API_KEY <key>`

  Until this lands, `lib/sam-contract-awards.js` returns `configured: false`
  and USASpending v2 remains the canonical awards source. No downstream code breaks.

- 🔴 **BLS API key** — registration form has a CAPTCHA. CLAUDE operating rules
  prohibit CAPTCHA solving. Optional — raises quota from 25/day to 500/day.
  Mary can complete at <https://data.bls.gov/registrationEngine/> in under 60s.

- 🔴 **Premium subscription price decision** — recommended $79/mo (Session Review)
  vs current live $29/mo (Stripe). I did NOT change this. It's a business call
  about price positioning that should be made deliberately. The 7 new-tool Stripe
  products are live-ready; flipping the base Premium price is a separate action.

## Database

| Migration | Status |
|---|---|
| `migrations/008_subscriber_context.sql` | ✅ applied 2026-04-17 via `supabase db query --linked` |
| `migrations/009_signal_monitors.sql` | ✅ applied 2026-04-17 |

## Seed data

| Seed | Status |
|---|---|
| `data/subscriber-context/mary-womack-seed.json` → `subscriber_context` | ✅ loaded; `mary@missionmeetstech.com → rockITdata LLC (v1)` live in production |

---

## Historical (pre-this-pass) — see `docs/api-integration-roadmap.md`

This tracks the steps needed to make each piece of the recent platform work fully live in production. Things already applied are marked ✅. Things waiting on Mary are marked ⏳ with the external action required.

---

## Database

| Migration | Status | Notes |
|---|---|---|
| `migrations/008_subscriber_context.sql` | ✅ applied 2026-04-17 | Applied via `supabase db query --linked`; table confirmed in `pg_tables`. |
| `migrations/009_signal_monitors.sql` | ✅ applied 2026-04-17 | Same. |

## Seed data

| Seed | Status | Notes |
|---|---|---|
| `data/subscriber-context/mary-womack-seed.json` → `subscriber_context` | ✅ loaded 2026-04-17 | `mary@missionmeetstech.com → rockITdata LLC (v1)` upserted. Re-run `node scripts/seed-subscriber-context.js` after editing the JSON. |

## Stripe Product IDs (required before non-Premium purchase paths go live)

All three new tools have a standalone / team / add-on SKU. They're already referenced
from `netlify/functions/lib/mmt-pricing.js` via env vars; create the products in
Stripe Dashboard and set the resulting price IDs on Netlify:

```
STRIPE_COMPLIANCE_STANDALONE_ID   ⏳  ($49.99/check)
STRIPE_COMPLIANCE_TEAM_ID         ⏳  ($199/mo, 50 checks, 3 seats)
STRIPE_PURSUIT_STANDALONE_ID      ⏳  ($29.99/score)
STRIPE_PURSUIT_TEAM_ID            ⏳  ($149/mo, 75 scores, 5 seats)
STRIPE_SIGNAL_ADDON_ID            ⏳  ($49/mo add-on, 5 programs)
STRIPE_SIGNAL_PRO_ID              ⏳  ($149/mo, 20 programs)
STRIPE_SIGNAL_ENT_ID              ⏳  ($399/mo, unlimited)
```

Set each with:
```sh
netlify env:set STRIPE_COMPLIANCE_STANDALONE_ID price_xxxx
```

## External API keys

Premium tools degrade gracefully when these are unset (log a warning, skip that
layer). Set whatever is ready; the rest can be filled in as they arrive.

| Env var | Where to get | Notes |
|---|---|---|
| `CONGRESS_API_KEY` | <https://api.data.gov/signup/> | Instant. Same key works for GovInfo. |
| `NCBI_API_KEY` | <https://www.ncbi.nlm.nih.gov/account/> | Optional — raises PubMed rate limit from 3/s to 10/s. |
| `USAJOBS_API_KEY` | <https://developer.usajobs.gov/> | Instant. |
| `USAJOBS_USER_EMAIL` | any | Required header by USAJobs API. |
| `BLS_API_KEY` | <https://www.bls.gov/developers/> | Optional — 25/day → 500/day with key. |
| `SAM_SYSTEM_ACCOUNT_API_KEY` | <https://sam.gov/workspace> → System Accounts | ⏳ 2–4 week approval window. USASpending v2 remains the canonical awards source until this lands. |

Verify state:
```sh
netlify env:list --plain | grep -iE '^(CONGRESS|NCBI|USAJOBS|BLS|SAM_SYSTEM|STRIPE_COMPLIANCE|STRIPE_PURSUIT|STRIPE_SIGNAL)'
```

## MarketPulse v2 verification

After deploy, trigger a MarketPulse run on a subscriber with a loaded
`subscriber_context` record (e.g., Mary). Expected:
- Each pipeline opportunity carries a tag (`[NEW]` / `[IN-FLIGHT]` /
  `[INCUMBENT-RECOMPETE]` / `[PREVIOUSLY-PASSED]` / `[OCI-BLOCKED]` / `[OFF-LANE]`)
- HT001126RE011 specifically renders as `[IN-FLIGHT]`, NOT as a fresh opportunity
- No "X% odds uncontested" fabricated-precision language survives the
  post-generation validator (violations log to `ops_events` as
  `SUBSCRIBER_CONTEXT_VIOLATION`)

If a subscriber has no context record, the report renders a `⚠ No subscriber context loaded` banner at the top and proceeds as generic market intelligence.

## Signal Chain v2 monitoring (queued)

Monitor table + subscribe endpoint are live. Still TODO:
- Weekly cron that re-scores each active `signal_monitors` row
- Capture Alert email template + delivery via Resend when a monitor's
  `last_score` crosses `alert_threshold` (default 75)

Until this ships, the "Watch this topic" subscribe button on
`/premium/signal-chain` stores the monitor but nothing triggers the alert email.

## Feature smoke tests (run after deploys settle)

```sh
# MarketPulse v2 tagging
# Trigger a brief for mary@missionmeetstech.com on a topic that includes
# HT001126RE011 and confirm the report tags it [IN-FLIGHT].

# Pursuit Score + Compliance Check + Signal Chain
# Hit each endpoint with a valid subscriber email:
curl -X POST https://missionmeetstech.com/.netlify/functions/pursuit-score \
  -H "Content-Type: application/json" \
  -d '{"email":"mary@missionmeetstech.com","keyword":"MHS GENESIS","agency":"DHA"}'

curl https://missionmeetstech.com/.netlify/functions/signal-chain?email=mary@missionmeetstech.com&topic=CCN+Next+Gen&agency=VA

# Live site drift
node integrity-audit.js     # should emit === SUCCESS/SYNCED ===
```

## Notes

- `proposal-pulse-demo.html` orphan is a pre-existing validate-dist warning
  unrelated to this work; safe to delete if not needed for a demo.
- Signal Chain PubMed queries now filter by affiliation — queries like
  "DHA telehealth" will no longer return muscle-physiology papers. The
  affiliation filter lives in `netlify/functions/lib/signal-chain-query-builder.js`.
