# Entitlement Spec — Mission Meets Tech

Canonical source: `netlify/functions/lib/entitlement.js`. This doc explains the contract that file enforces. If the doc and code disagree, the code wins — but file an issue and update this doc the same day.

## Tier enum (canonical)

| `tier` value     | Meaning                              | How it's set                            |
|------------------|--------------------------------------|-----------------------------------------|
| `admin`          | Mary or staff override               | `mp_users.tier = 'admin'`               |
| `institutional`  | $2,500–5,000/yr team plan            | `subscription_tier = 'institutional'` + active|
| `founding`       | $199 Founding Member                 | `subscription_tier = 'premium'` (or `mmt_premium_founding`) + active + `founding_member = true` |
| `premium`        | $29/mo or $249/yr Premium            | `subscription_tier = 'premium'` + active |
| `free`           | Has account, no paid sub             | row exists, no active sub               |
| `anonymous`      | No mp_users row                      | lookup returns null                     |

## Canonical column names (mp_users)

- `subscription_tier` — string. Allowed values: `premium`, `institutional`, `mmt_premium_founding` (legacy from Stripe Payment Link metadata that did not propagate cleanly), or null.
- `subscription_status` — string. `active` or `trialing` count as paid. `canceled`/`past_due`/`incomplete`/`unpaid` do NOT.
- `founding_member` — boolean. **Canonical.** Older code using `is_founding_member` is wrong (broke Founding Member access for Danielle Applegate on 2026-04-27). The regression test in `tests/unit/entitlement-matrix.test.js` blocks reintroduction.
- `tier` — legacy string. `admin` and `paid` still grant access for backwards compat.
- `email` — text. Stored lowercased by the canonical write path (`reconcile-premium-subscribers.js`), but historical rows may be mixed-case. The helper uses `.ilike()` to handle both.

## Tool-by-tool entitlement matrix

| Tool             | `entitlement.ok` required? | Monthly cap (premium / founding / institutional / admin) |
|------------------|----------------------------|----------------------------------------------------------|
| Ask MMT          | yes                        | 1 / 2 / 3 / 99                                           |
| Pursuit Score    | yes                        | 20 / 20 / 100 / 999                                      |
| Compliance Check | yes                        | 15 / 15 / 75 / 999                                       |
| Signal Chain     | yes                        | unlimited (cache-driven)                                 |
| Capture Corner (full module) | yes            | unlimited                                                |
| Pursuit Calendar | yes                        | unlimited                                                |
| ProposalPulse    | no (free trial + pay-as-you-go) | 1 free, then $19.99 (Premium $14.99)                |
| MarketPulse      | no (free trial + pay-as-you-go) | 1 free, then $50 (Premium $35)                      |
| Contract Tracker | partial (headlines public, intel premium) | n/a                                       |
| IDIQ Tracker     | partial (preview public, full data premium) | n/a                                     |
| Dashboard        | yes (full)                 | n/a                                                      |

## Fail-open vs fail-closed

- Premium-tool gates **fail closed**: when in doubt, return 403 with a reason code.
- Public marketing previews **fail open**: gated content is hidden but the page still renders; non-data sections always show.
- Email + cron paths **fail closed by tier first**, then **fail closed by quota** — never silently send to a free user.

## 403 reason codes (returned by `blockMessageFor`)

- `NOT_SIGNED_IN` — `entitlement.tier === "anonymous"`. Show subscribe + sign-in CTA.
- `SUBSCRIPTION_INACTIVE` — paid sub on file but `subscription_status !== "active"`. Show "update billing" CTA. **Do not** treat the same as anonymous.
- `FREE_TIER` — has free account; no paid sub. Show subscribe CTA.
- `LOOKUP_FAILED` — Supabase blip. Suggest retry + email mary@.

## Logging

Every blocked access logs to `ops_events.event_type = 'entitlement_mismatch'` with the tool, observed tier, observed reason, and request meta. No PII beyond email. Used by the trust-dashboard rollup.

## How to add a new paid feature

1. Add it to `docs/member-features.json`.
2. In the function's first lines: `const entitlement = await loadEntitlement(supabase, email);`
3. If `!entitlement.ok`, return 403 with `blockMessageFor(entitlement)`.
4. Log via `logEntitlementMismatch`.
5. Use `entitlement.tier` for tier-scoped caps.
6. Add the tool's monthly cap to `entitlement.js` (`*_LIMITS` constants) and surface it on `entitlement.<tool>MonthlyCap`.
7. Add a row to `tests/unit/entitlement-matrix.test.js` covering the new feature.
8. Add a route entry in `netlify.toml` if it's marketed.
9. Update this doc.

## Founding Member 2026-04-22 audit — known follow-ups

10 of the 11 founding-member subscriptions had `founding_member = false` because the Stripe Payment Link metadata did not propagate to `customer.subscription.created`. Reconcile script available; production approval required. The entitlement helper accepts these as `tier='premium'` so they're not blocked from tools, but their Ask MMT cap reads as 1/mo instead of 2/mo until `founding_member=true` is backfilled.

Reconciliation steps live in `reports/founding-member-audit-20260422.md`.
