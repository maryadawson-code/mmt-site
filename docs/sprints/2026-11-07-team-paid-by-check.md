# 2026-11-07 — Team plan paid outside Stripe

FHAS paid the team invoice by check, not through the hosted invoice link, so
nothing fired `invoice.paid` and the four seats stayed off. The seat gate
(`teamIsPaid` in `lib/team-plan.js`) reads a paid Stripe invoice, and Stripe's
out-of-band payment keeps the invoice as the record, so the fix is a recorded
payment, not a bypass.

Shipped `scripts/team-mark-paid.js`: finds the team by billing email, merges
any seat emails into `metadata.mmt_seats` within the seats bought, marks the
open invoice paid out of band with the method and reference on its metadata,
runs `syncTeamSeats` so the seats are live before it exits, and cancels a
replaced personal plan. Re-running with more seat emails adds seats; a paid
invoice is left alone. Runbook in `docs/team-plan-spec.md`.

Rule worth keeping: a payment that bypasses Stripe still gets recorded in
Stripe, so renewals, the seat gate and the statement all read one ledger.
