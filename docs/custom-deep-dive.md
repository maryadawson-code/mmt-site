# Custom Deep Dive — full setup state

End-to-end flow for the $50 Custom Deep Dive product. Self-serve pay → webhook notifies Mary → Mary delivers PDF.

## Live configuration (as of 2026-05-19)

| Piece | Value |
|---|---|
| Payment Link | `https://buy.stripe.com/6oUdRb2NEaQI3uM6KL4c803` |
| Payment Link ID | `plink_1TYqQtR7Vg1dZJSLyEyCCvgG` |
| Price ID | `price_1TYqNLR7Vg1dZJSL9mp3PLsj` (env: `STRIPE_DEEPDIVE_PRICE_ID`) |
| Amount | $50.00 USD |
| Webhook endpoint | `https://missionmeetstech.com/.netlify/functions/stripe-deepdive-webhook` |
| Webhook endpoint ID | `we_1TYqW5R7Vg1dZJSLXn5fmxN2` |
| Webhook events | `checkout.session.completed` |
| Webhook secret env var | `STRIPE_DEEPDIVE_WEBHOOK_SECRET` (set in Netlify) |
| Custom fields | `deep_dive_topic` (required, 5-250 chars), `target_agency` (optional, ≤100), `delivery_email` (optional, ≤100) |

## Flow

1. Buyer clicks Payment Link from Capture Corner / pricing page / Mary's outreach.
2. Buyer fills custom fields (topic, optional agency, optional delivery email different from billing), pays $50.
3. Stripe fires `checkout.session.completed` → `netlify/functions/stripe-deepdive-webhook.js`:
   - Verifies signature with `STRIPE_DEEPDIVE_WEBHOOK_SECRET`.
   - Retrieves session with `expand=[line_items, line_items.data.price, customer_details]`.
   - Confirms line item price matches `STRIPE_DEEPDIVE_PRICE_ID`.
   - Dedups via `stripe_events` table.
   - Sends Email A (Mary internal — buyer details + topic) and Email B (buyer confirmation).
4. Mary writes the memo, then delivers via the CLI.

## Delivery CLI

```
RESEND_API_KEY=... STRIPE_SECRET_KEY=... STRIPE_DEEPDIVE_PRICE_ID=... \
  node scripts/send-deepdive.js \
    --to <buyer-email> \
    --name <first-name> \
    --pdf /abs/path/to/memo.pdf \
    --topic "<topic>" \
    [--note "<custom paragraph 2>"] \
    [--comp "<reason>"]
```

**Payment gate (default ON).** The CLI refuses to send unless it finds a paid Custom Deep Dive checkout session for `--to` in the last 30 days. Override only when there's a real reason (comp, manual invoice, off-Stripe payment) by passing `--comp "<short reason>"` — that gets logged in the send output.

History: gate added 2026-05-19 after two paid-product sends went out before payment was received. The fix is the gate, not human discipline.

## Local webhook test

```
stripe trigger checkout.session.completed \
  --override checkout_session:line_items.data.0.price.id=$STRIPE_DEEPDIVE_PRICE_ID \
  --forward-to localhost:8888/.netlify/functions/stripe-deepdive-webhook
```

Expect 200 + Mary internal email + buyer confirmation.

## Things only Mary can do via Stripe Dashboard

- Rotate `STRIPE_DEEPDIVE_WEBHOOK_SECRET` if compromised (delete `we_1TYqW5R7Vg1dZJSLXn5fmxN2` and recreate; Stripe shows the new secret once at creation).
- Adjust price (currently $50) — update product `prod_UXwFYyYZfOjA9A`.
- Adjust custom-field labels (or add more) — these are managed on the Payment Link.

## Things that update automatically when the webhook code changes

- The internal/buyer email templates (`netlify/functions/stripe-deepdive-webhook.js`).
- The helpers (`netlify/functions/lib/stripe-deepdive.js`).
- The CLI gate behavior (`scripts/send-deepdive.js`).
