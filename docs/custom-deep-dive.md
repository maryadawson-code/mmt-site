# Custom Deep Dive — webhook + delivery

**Env vars:** `STRIPE_DEEPDIVE_WEBHOOK_SECRET`, `STRIPE_DEEPDIVE_PRICE_ID`, `RESEND_API_KEY`.

**Stripe webhook test (local netlify dev):**
`stripe trigger checkout.session.completed --override checkout_session:line_items.data.0.price.id=$STRIPE_DEEPDIVE_PRICE_ID --forward-to localhost:8888/.netlify/functions/stripe-deepdive-webhook` — expect 200 + Mary internal email + buyer confirmation.

**Delivery CLI:**
`RESEND_API_KEY=... node scripts/send-deepdive.js --to buyer@example.com --name First --pdf /abs/path/Memo.pdf --topic "Topic line" [--note "Custom para 2"]` — attaches the PDF, returns Resend message id on success.
