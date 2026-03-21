-- stripe_events table for idempotent webhook handling
-- Prevents duplicate processing of Stripe webhook events

CREATE TABLE IF NOT EXISTS stripe_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB
);

-- Index for fast lookups by event_id
CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_events (event_id);

-- Enable RLS (defense-in-depth)
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- Cleanup: remove events older than 90 days (run periodically)
-- DELETE FROM stripe_events WHERE processed_at < NOW() - INTERVAL '90 days';
