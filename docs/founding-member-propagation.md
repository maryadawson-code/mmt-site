# Founding Member Propagation — current status + watch list

## What was broken (2026-04-22 audit)

Stripe Payment Links do NOT propagate session metadata to the `customer.subscription.created` event. The original webhook checked `sub.metadata.founding_member === "true"` — that field is always missing on Payment-Link subs, so 10 of 11 founding members ended up with `founding_member=false` in `mp_users`. See `reports/founding-member-audit-20260422.md`.

## What is already fixed in code

`netlify/functions/stripe-webhook.js`:

- Module-load assertion crashes on boot if `FOUNDING_PRICE_IDS` is empty. Safe-failure mode: better to refuse to deploy than silently misclassify every founding payment.
- `isFoundingSubscription(sub)` checks `price.id` membership (not metadata) — works for Payment Link subs.
- `isFounding` is the single source of truth in the `customer.subscription.created` handler.
- Upsert (not update-then-insert), so Payment-Link-only customers still get an `mp_users` row.

`tests/unit/foreign-event-filter.test.js`:
- Mirrors the same `FOUNDING_PRICE_IDS` shape and verifies the price-ID detection path.

## What still requires Mary action (not code)

**Env vars on Netlify production:**

- `STRIPE_PRICE_FOUNDING_YEARLY` — REQUIRED. Must be the live yearly $199 founding price ID.
- `STRIPE_PRICE_FOUNDING_MONTHLY` — optional (no monthly founding SKU exists at time of writing).
- `STRIPE_PRICE_FOUNDING_ANNUAL` — alias, optional.
- `STRIPE_PRICE_FOUNDING` — legacy alias, optional, kept for `founding-count.js`.

If any production Payment Link points to a price ID that is NOT in this whitelist, `isFoundingSubscription` returns false and that customer ends up `founding_member=false`. The fix is to either:
1. Move the Payment Link to use the whitelisted price ID, OR
2. Add the new price ID to the env var.

**Verify with:**

```bash
netlify env:list --plain | grep STRIPE_PRICE_FOUNDING
```

If the list is empty, the next deploy will refuse to boot — that's intentional (the assertion in stripe-webhook.js).

## What still requires production data action

The 10 founding-member backfill (per `reports/founding-member-audit-20260422.md`) is a one-time SQL repair:

```sql
UPDATE mp_users
SET founding_member = true
WHERE email IN (
  'dcapplegate@outlook.com',
  'ardi.s@mongodb.com',
  ...
)
AND subscription_tier = 'premium'
AND subscription_status = 'active';
```

Mary already ran similar fixes on 2026-04-26 (per CLAUDE.md). The audit list should be reconciled and the same fix applied to anyone still flagged false. **Do not run this without Mary's explicit approval.**

## Going forward

- New founding subscriptions via Payment Link → automatically flagged via `isFoundingSubscription` (price-ID match).
- New founding subscriptions via `/.netlify/functions/create-checkout` → flagged via the `metadata.founding_member` route AND price-ID match (defense in depth).
- New customers who subscribe through any other path are caught by the price-ID whitelist.

## Risk matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| New Payment Link uses an unwhitelisted price ID | low (Mary controls) | high (silent founding fail) | Module-load assert; doc this list before any new Payment Link |
| `STRIPE_PRICE_FOUNDING_YEARLY` env var unset on Netlify | very low (deploy refuses) | n/a | Module-load assert |
| Stripe rotates a price ID (rare) | very low | high | Update env var; rerun reconcile script |
| Founding canceled then resubscribes via Payment Link | low | low | Webhook upserts; founding_member sticks |

## Done definition

- ✅ Code path fixed (commit `a30369c` + earlier).
- ✅ Test coverage in `tests/unit/foreign-event-filter.test.js`.
- ✅ Backfill script proposal documented in `reports/founding-member-audit-20260422.md`.
- ⏳ Production backfill of the remaining audited founding members — requires Mary approval.
- ⏳ Periodic reconcile (weekly cron) that re-checks all premium-active mp_users rows against `FOUNDING_PRICE_IDS` and flags any that drift.
