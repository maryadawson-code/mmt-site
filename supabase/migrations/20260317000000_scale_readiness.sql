-- Scale Readiness Migration
-- Adds subscription lifecycle, webhook idempotency, rate limiting,
-- usage analytics, and performance indexes.

-- 1. Subscription lifecycle table
CREATE TABLE IF NOT EXISTS mp_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES mp_users(id) NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'professional', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_subscriptions_user ON mp_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_subscriptions_stripe ON mp_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_mp_subscriptions_status ON mp_subscriptions(status);

-- 2. Webhook idempotency table
CREATE TABLE IF NOT EXISTS mp_processed_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_events_date ON mp_processed_events(processed_at);

-- 3. Rate limiting table
CREATE TABLE IF NOT EXISTS mp_rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON mp_rate_limits(window_start);

-- 4. Usage analytics rollup table
CREATE TABLE IF NOT EXISTS mp_daily_stats (
  date DATE NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER DEFAULT 0,
  PRIMARY KEY (date, metric)
);

-- 5. Performance indexes on existing tables
CREATE INDEX IF NOT EXISTS idx_scoring_pending ON mp_scoring_history(verdict, created_at)
  WHERE verdict IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_email ON mp_users(email);

CREATE INDEX IF NOT EXISTS idx_feature_usage_user_feature ON mp_feature_usage(user_id, feature);

CREATE INDEX IF NOT EXISTS idx_scoring_user_date ON mp_scoring_history(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_marketpulse_usage_email ON marketpulse_usage(email);
