# MMT Team plan

One product for every team account. A company buys N seats on one yearly
Stripe subscription; every seat gets Premium (the `institutional` tier) plus
Agent Access included. Nothing about a team is custom: the seat price is one
number in `netlify/functions/data/team-pricing.json`, every team is created by
the same script, and activation, renewal and cancellation are automatic.

Code: `netlify/functions/lib/team-plan.js` (the only place that writes seat
rows), `netlify/functions/team-seats.js` (member seat page API),
`premium/team.html` (the page), `scripts/stripe-setup-team.js` (Stripe
product, price, webhook event), `scripts/team-invoice.js` (start a team).
Tests: `tests/unit/team-plan.test.js`, `tests/unit/stripe-webhook-team.test.js`.

## Where a team lives

No new tables. Stripe is the source of truth and existing `mp_users`
columns carry the seats.

| Thing | Where |
|---|---|
| Seat price | `team-pricing.json`, mirrored to the Stripe price found by lookup key `mmt_team_seat_year` (never an env var) |
| Seats bought | the subscription item's `quantity` |
| Seat emails | subscription `metadata.mmt_seats`, comma-separated |
| Billing contact | subscription `metadata.billing_email` (falls back to the customer's email) |
| Company | subscription `metadata.company` |
| A seat's access | `mp_users` row: `subscription_tier = institutional`, `subscription_status = active`, `grant_reason = team_seat`, `granted_by = billing email`, `stripe_subscription_id = the team's sub id`, `expires_at = current period end` |

The rows of one team are the rows whose `stripe_subscription_id` is that
subscription. `expires_at` is informational; Stripe's status is what
deactivates.

## When seats turn on and off

`syncTeamSeats()` is idempotent and makes the rows match the subscription:

- A team is **live** when its Stripe status is `active` or `trialing` AND
  Stripe holds at least one **paid** invoice for it. Team invoices go out on
  30-day terms, so the subscription is `active` before anyone has paid; status
  alone never activates anyone.
- While live, every email in `mmt_seats` (up to the bought quantity) is
  institutional/active. Extra emails past the quantity are reported in the
  `TEAM_SEATS_SYNCED` ops event and not activated.
- Any row on this subscription that is no longer listed, or any row at all
  when the team is not live (unpaid, past due, unpaid, canceled), becomes
  free/canceled.
- A newly activated seat gets one welcome email (`team-seat-welcome.js`),
  recorded in `customer_events` as `welcome_sent` / `mmt_team`.

It runs from the webhook on `customer.subscription.created|updated|deleted`
and `invoice.paid`, from the hourly `stripe-subscriber-sync` for every live
team plus any seat row whose subscription Stripe no longer lists as active
(the backstop for a missed webhook), and from `team-seats.js` after a seat
change.

Renewal: Stripe issues the renewal invoice on the same 30-day terms; the
subscription stays `active` until the due date passes, then Stripe marks it
`past_due` and the next sync turns the seats off until it is paid.

## Replacing a personal plan

When a seat holder already pays for their own Premium, `team-invoice.js
--credit-from <email>` credits the unused part of what they paid, by whole
days, as a one-time coupon on the team's first invoice, and records the old
subscription in `metadata.replaces_subscription`. Once the team invoice is
paid, the webhook cancels that personal subscription immediately with no
refund (the credit already covered it) and stamps
`metadata.replaced_canceled_at` so it never repeats.

The cancellation's `customer.subscription.deleted` event does not take the
seat down: the webhook (and the admin reconcile) skip a row that is live on a
different subscription (`rowBelongsToAnotherSubscription`).

## Runbook

Start a team (dry run first, then `--apply`):

```
netlify dev:exec -- node scripts/team-invoice.js --company "Acme" --billing-email ap@acme.com --seats 4 --seat-emails a@acme.com,b@acme.com --apply
```

It prints the hosted invoice link to send. The billing email is always a seat
so the billing contact can sign in and manage seats at `/premium/team/`.

Invoices to an accounts-payable inbox: Stripe mails only the customer's own
address and its API cannot add recipients, so a team carries
`metadata.ap_email`. Pass `--ap-email` when starting the team, or later:

```
netlify dev:exec -- node scripts/team-billing-contact.js --subscription sub_xxx --ap-email ap@acme.com --apply
```

It emails the open invoice there now (`lib/team-plan.js sendInvoiceNotice`,
once per invoice, `customer_events invoice_sent / mmt_team`) and the
webhook's `invoice.finalized` handler sends every later invoice. To have
Stripe's own emails copy AP as well, add the address under the customer's
"Emails to CC" in the Stripe dashboard (dashboard only).

Paid by ACH, wire or check: Stripe never sees the money, and seats only turn
on when Stripe holds a paid invoice. Once the bank shows it:

```
netlify dev:exec -- node scripts/team-invoice-paid.js --invoice in_xxx --reference "ACH trace 123" --apply
```

That marks the invoice paid out of band, which fires `invoice.paid`; the
webhook activates the seats and cancels a replaced personal plan. Never hand
edit `mp_users` to let a team in early. The hosted invoice page takes cards,
Link and wallets; ACH debit on the page is a Stripe account setting, Mary's
call.

Add or remove a seat: the billing contact does it on `/premium/team/`, or
Mary edits `mmt_seats` on the subscription in the Stripe dashboard (the
metadata change fires `customer.subscription.updated`).

Change the number of seats: update the subscription item quantity in Stripe
(Stripe prorates). More seats than `mmt_seats` lists is fine; fewer turns the
overflow off at the next sync.

Change the seat price: edit `team-pricing.json`, deploy, then
`netlify dev:exec -- node scripts/stripe-setup-team.js --apply`. Existing
subscriptions keep their price until moved.

Agent Access: institutional seats get unlimited agents (no add-on), but an
institutional agent cannot be billed per-call overage, so it pauses at the
monthly allowance in `agent-pricing.json` unless listed in
`overage_limit_overrides`.

## Ops events

`TEAM_SEATS_SYNCED` (every sync, with activated/deactivated/failed lists),
`TEAM_SYNC_FAILED` (webhook path threw; the hourly sync repairs),
`TEAM_REPLACED_SUBSCRIPTION_CANCELED`, `TEAM_INVOICE_NOTICE_FAILED` (the AP copy of an
invoice did not send; rerun `scripts/team-billing-contact.js --resend`).
