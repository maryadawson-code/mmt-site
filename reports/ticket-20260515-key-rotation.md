# Ticket — Rotate Stripe + Supabase + MarketPulse internal keys after transcript leaks

Filed: 2026-05-15 (Stripe + Supabase); appended 2026-05-19 (MARKETPULSE_INTERNAL_SECRET)
Status: open
Severity: high (production credentials in conversation transcript)
Owner: Mary (manual, dashboard only — do not automate)

## Problem

Two separate transcript-leak incidents:

**2026-05-15** — An agent ran `netlify env:list --plain` inside the
active shell, which prints the **values** of every environment
variable (not just the names) to stdout. Affected:
`STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_KEY`.

**2026-05-19** — During verification of the `MARKETPULSE_INTERNAL_SECRET`
gate (commit `a1fc099`), Mary pasted the literal value of
`MARKETPULSE_INTERNAL_SECRET` into the chat to confirm setup. The
secret is now in the same conversation/log surface as the May 15 leak.

Three keys must be rotated:

1. **`STRIPE_SECRET_KEY`** — full Stripe write access (creates
   customers, subscriptions, charges; access to all payment data).
2. **`SUPABASE_SERVICE_KEY`** — service-role key, bypasses RLS on
   every table (subscriber PII, billing data, ops events).

Both were valid at time of leak. Assume compromise until rotated.

## Why this is dashboard-only

This ticket explicitly does **not** authorize any CLI-driven
rotation. CLI rotation creates the same exposure surface that
caused the leak. Do every step in the official dashboard UIs and
the Netlify dashboard UI. Do not paste new key values into any
chat, transcript, or shared terminal.

## Rotation steps (manual)

### Stripe (rotate first — payment system)

1. Sign in to **dashboard.stripe.com** as Mary's account owner.
2. Top-right account menu → **Developers** → **API keys**.
3. Locate the current **Secret key** (begins `sk_live_…`).
4. Click **Roll key** → confirm the prompt. Stripe will:
   - Generate a new `sk_live_…` value.
   - Mark the old key for expiration in 12 hours (default — extend
     to 24h if needed to give Netlify deploys time to propagate).
5. Copy the **new** secret key to clipboard from the Stripe modal.
   Close the modal — Stripe will not show it again.
6. Open **app.netlify.com** → site `curious-pony-0dec76` (MMT) →
   **Site configuration** → **Environment variables**.
7. Find `STRIPE_SECRET_KEY` → **Options** → **Edit value**.
8. Paste the new key. Save. Netlify will start propagating to
   functions within 30s; force a redeploy if you need it faster
   (Deploys → Trigger deploy → Deploy site).
9. Within the 12–24h grace window, monitor the Stripe Dashboard →
   **Developers** → **Logs** for any `Unauthorized` errors from
   the old key. If none, let the old key expire on schedule. If
   you see errors, find the lagging function and redeploy it.
10. After expiration, confirm via Stripe Logs that no requests
    using the old key arrived in the past 4 hours.

### Supabase (rotate second)

1. Sign in to **supabase.com/dashboard** as Mary.
2. Open project `djuviwarqdvlbgcfuupa` (per `MEMORY.md`).
3. Left rail → **Project Settings** → **API**.
4. Under **Service role key (secret)** → **Reset service role
   key**. Confirm the prompt. Supabase will:
   - Generate a new `service_role` JWT.
   - Immediately invalidate the old one (Supabase does NOT offer a
     grace window for service keys — plan a 5-minute outage).
5. Copy the new value.
6. Open Netlify env editor (same path as step 6 above) →
   `SUPABASE_SERVICE_KEY` → **Edit value** → paste → save.
7. Trigger a redeploy (Deploys → Trigger deploy → Deploy site)
   so every function picks up the new value immediately. Without
   a redeploy, in-flight function instances will continue to use
   the old key until they're recycled.
8. Verify by hitting one entitlement-gated endpoint (e.g.
   `curl https://missionmeetstech.com/.netlify/functions/check-tier`
   with a known premium email). 200 response = good. 500/401 =
   redeploy hasn't propagated yet; wait 60s and retry.

### MARKETPULSE_INTERNAL_SECRET (rotate third — appended 2026-05-19)

This secret protects `netlify/functions/generate-tactical-brief-background.js`
from direct unauthenticated POSTs that would otherwise drive
Perplexity + Claude + Resend work without payment. The leak happened
during gate verification — Mary pasted the literal value into the
agent chat to confirm setup.

1. **app.netlify.com/projects/curious-pony-0dec76** → **Site
   configuration** → **Environment variables**.
2. Locate `MARKETPULSE_INTERNAL_SECRET`. Click **Options** → **Edit value**.
3. Paste a NEW random 64+ char string. Do not paste the new value into
   any chat, terminal, or document afterward. Generate it locally with
   `openssl rand -hex 32` or your password manager's secure-string
   feature, then copy → paste → save → clear clipboard.
4. **Deploys** → **Trigger deploy** → **Deploy site**. Required: warm
   function instances cache `process.env` per-instance, so the new
   value only reaches the runtime after a redeploy spawns fresh
   workers. Verified empirically 2026-05-19: live function continued
   to operate in open-mode after env-var add until the next deploy.
5. Wait for the deploy to reach `ready`. After it lands, the gate is
   strict-mode again and any direct unauthenticated POST to
   `/.netlify/functions/generate-tactical-brief-background` will be
   rejected before any Perplexity/Claude/email work.
6. Behavioral verification (no real spend): POST without the header
   to the background function with a `.invalid` TLD email and a
   `session_id=verify_gate_strict_*` label. Expected outcome:
   - HTTP 202 to caller (background-fn contract, doesn't reflect inner result)
   - NO row inserted into `marketpulse_orders` (gate fires before
     order-create)
   - NO Perplexity API call counted
7. Old secret value is invalidated automatically — no grace window
   needed because all in-tree callers (`marketpulse-gateway`,
   `tactical-brief-webhook`, `replay-tactical-brief-background`,
   `scripts/mp-rescue-and-archive.js`) read the env at invocation,
   so they pick up the new value on the same deploy.

### Post-rotation cleanup

- Run `node integrity-audit.js` — expect `SUCCESS/SYNCED`.
- Spot-check `premium-digest-send`, `stripe-webhook`, and
  `stripe-subscriber-sync` cron schedules in Netlify → Functions
  → Schedule. All should show their last-run timestamp within the
  expected window for their cron expression.
- Add an `ops_events` row manually documenting the rotation:

  ```
  event_type: 'keys_rotated'
  signature: 'stripe_supabase_rotation_20260515'
  details: { reason: 'env_list_leak_in_transcript', rotated_keys: ['STRIPE_SECRET_KEY','SUPABASE_SERVICE_KEY'] }
  ```

  This gives future audits a paper trail for when the old keys
  stopped being valid.

## Do not

- Do not print, log, or echo the new key values anywhere.
- Do not paste them into any shared terminal, chat, or AI tool.
- Do not commit them to git (env vars live in Netlify, never in
  the repo — there's nothing in source to update).
- Do not run `netlify env:list --plain` again from this or any
  shell whose output is being captured.

## Why this is not an automation script

Every dashboard step above is irreversible from the CLI side
(rolling Stripe keys, resetting Supabase service keys). The
correct authorization signal is "Mary clicked the button," not
"a token did." Automating this would re-create the leak surface
we're closing.
