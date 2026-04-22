-- ============================================================
-- 20260422000000_stripe_events.sql
--
-- Stripe webhook idempotency ledger. Referenced by
-- netlify/functions/stripe-webhook.js lines 50-68 — the handler
-- currently swallows "table missing" errors in a try/catch and
-- proceeds without dedup, which means every event we process during
-- a Stripe retry would double-fire the tier grant + welcome email.
-- This table closes the gap.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Safe to apply against any current state.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text,
  payload jsonb
);

CREATE INDEX IF NOT EXISTS stripe_events_event_type_idx
  ON public.stripe_events (event_type, received_at DESC);

CREATE INDEX IF NOT EXISTS stripe_events_received_at_idx
  ON public.stripe_events (received_at DESC);

-- Service role has implicit full access; RLS left off intentionally since
-- only the webhook function writes here and its JWT is service_role.
