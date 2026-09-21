# Sprint 2026-09-21: Agent Access pricing confirmed, metering migration applied, overage billed through Stripe

Trigger: after PR #221 shipped the agent platform, Mary said to apply the
migration, set the allowance and overage rate, and do the Stripe update.
Authoritative description: `docs/agent-platform-spec.md` section 2.5.

## Done

- **Migration applied.** `migrations/20260920000000_agent_metering.sql` went to
  production through the Supabase Management API (CLI token from the keychain,
  project ref checked against `SUPABASE_URL` before any DDL). Verified: 5
  columns, 2 indexes, the 5 existing `api_audit_log` rows untouched, PostgREST
  sees the columns.
- **Pricing set.** 5,000 calls per agent per month, then $0.01 per call, in
  `netlify/functions/data/agent-pricing.json` with who confirmed it and when.
  A bundled file, not env: env sat at about 3.4KB of the 4KB Lambda cap, and an
  env change does not reach a function until its bundle changes.
- **Stripe.** Live objects created by `scripts/stripe-setup-agent-overage.js`
  (meter, product, a monthly and a yearly metered price at 1 cent, found by
  lookup key). `agent-overage-report` runs daily and bills the difference
  between the member's statement and Stripe's own meter summary.
- **Disclosure.** Pricing card, access guide (`#allowance`) and member page,
  all injected from the pricing file through `lib/agent-allowance-copy.js`.

## What review caught (each would have bitten in production)

1. **`request_id` is a `uuid` column and the code echoed any 8 to 64 character
   `X-Request-Id`.** Applying the migration armed it: a caller sending
   `client-req-0001` would get a 22P02 on the audit insert, `isMissingColumn`
   says no, and the row is dropped. No metering, no rate limit count, no
   statement line. Mary's own acceptance test used that exact shape. Now only a
   UUID is echoed; anything else is replaced.
2. **Every audited call counted against the allowance**, including 401, 403 and
   429. With billing attached, a looping agent on a revoked token would have
   run up a bill for calls that returned nothing. A billable call is now one
   that returned data (status below 400), in the statement, the alert counter
   and the Stripe report alike.
3. **The allowance alerts passed Resend tags as bare strings.** Resend's schema
   is `{name, value}` objects, so the 80 percent and overage emails would have
   been rejected at exactly the moment a member crossed a line. Confirming the
   pricing is what armed them.
4. **Usage before the numbers existed is never billed.** `billing_starts_month`
   is 2026-10; September is counted on the statement and nothing more.

All four guards, plus the rate check, the billing floor and the subtraction of
what Stripe already holds, were mutation-tested: removed, watched fail, restored.

## Verified

- `npm test`, `node build.js`, the 15 validators in the `netlify.toml` command.
- The setup script run twice against live Stripe: the second run created nothing.
- `scripts/agent-overage-dry-run.js` against live Stripe and production: 0
  add-on subscriptions, 0 to bill, months `[]` today and `["2026-10","2026-11"]`
  as of 2026-11-02.

## Honest gap

No customer held the add-on on 2026-09-21 (0 subscriptions on either add-on
price, ever; 0 agent calls in 7 days), and the account has no Stripe test key
in env. So the path from a real subscription to a real invoice line has not
run. It is covered by 21 unit tests over a fake Stripe client, by the live
configuration check the daily run makes, and by the dry runs above. The first
real subscriber is the first end-to-end run: read that day's
`AGENT_OVERAGE_REPORT` row in `ops_events`.

Rule worth keeping: before money moves on a count, decide what a countable
thing is, and use that one definition in the statement, the alert and the bill.
