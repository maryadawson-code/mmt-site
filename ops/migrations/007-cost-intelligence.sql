-- Cost event log — every API call gets a row
CREATE TABLE IF NOT EXISTS cost_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  function_name text NOT NULL,
  product text NOT NULL,
  order_id uuid,
  provider text NOT NULL,
  model text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost_cents integer DEFAULT 0,
  latency_ms integer,
  status text DEFAULT 'success',
  cache_hit boolean DEFAULT false,
  error_message text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_cost_events_created ON cost_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_product ON cost_events(product, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_provider ON cost_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_function ON cost_events(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_order ON cost_events(order_id) WHERE order_id IS NOT NULL;

-- Daily cost rollups
CREATE TABLE IF NOT EXISTS cost_daily_rollup (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  product text NOT NULL,
  provider text NOT NULL,
  function_name text NOT NULL,
  model text,
  call_count integer DEFAULT 0,
  total_input_tokens bigint DEFAULT 0,
  total_output_tokens bigint DEFAULT 0,
  total_cost_cents bigint DEFAULT 0,
  avg_latency_ms integer DEFAULT 0,
  error_count integer DEFAULT 0,
  cache_hit_count integer DEFAULT 0,
  UNIQUE(date, product, provider, function_name)
);

CREATE INDEX IF NOT EXISTS idx_cost_rollup_date ON cost_daily_rollup(date DESC);
CREATE INDEX IF NOT EXISTS idx_cost_rollup_product ON cost_daily_rollup(product, date DESC);

-- Cost baselines — learned over time
CREATE TABLE IF NOT EXISTS cost_baselines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  updated_at timestamptz DEFAULT now(),
  product text NOT NULL,
  provider text NOT NULL,
  function_name text NOT NULL,
  model text,
  avg_cost_cents_per_call numeric(10,2),
  avg_tokens_per_call numeric(10,2),
  avg_latency_ms numeric(10,2),
  avg_calls_per_day numeric(10,2),
  avg_daily_cost_cents numeric(10,2),
  alert_threshold_multiplier numeric(4,2) DEFAULT 2.0,
  auto_action_threshold numeric(4,2) DEFAULT 3.0,
  human_override boolean DEFAULT false,
  sample_days integer DEFAULT 0,
  last_anomaly_at timestamptz,
  anomaly_count integer DEFAULT 0,
  UNIQUE(product, provider, function_name)
);

-- Cost alerts
CREATE TABLE IF NOT EXISTS cost_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  alert_type text NOT NULL,
  severity text NOT NULL,
  product text,
  provider text,
  function_name text,
  title text NOT NULL,
  description text NOT NULL,
  recommended_action text,
  auto_actionable boolean DEFAULT false,
  auto_acted boolean DEFAULT false,
  auto_action_taken text,
  human_decision text,
  human_notes text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_unresolved ON cost_alerts(created_at DESC) WHERE resolved_at IS NULL;

-- Rate card
CREATE TABLE IF NOT EXISTS cost_rate_card (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  updated_at timestamptz DEFAULT now(),
  provider text NOT NULL,
  model text NOT NULL,
  input_cost_per_1k_cents numeric(10,4),
  output_cost_per_1k_cents numeric(10,4),
  per_call_cost_cents numeric(10,4),
  per_email_cost_cents numeric(10,4),
  notes text,
  UNIQUE(provider, model)
);

-- Seed rate card
INSERT INTO cost_rate_card (provider, model, input_cost_per_1k_cents, output_cost_per_1k_cents, notes) VALUES
  ('anthropic', 'claude-sonnet-4-20250514', 0.3, 1.5, 'Sonnet 4 — primary scoring model'),
  ('anthropic', 'claude-haiku-4-5-20251001', 0.08, 0.4, 'Haiku 4.5 — shadow scoring'),
  ('anthropic', 'claude-opus-4', 1.5, 7.5, 'Opus 4 — editorial agent'),
  ('perplexity', 'sonar-pro', 0.0, 0.0, 'Sonar Pro — tactical brief research'),
  ('openai', 'gpt-4o', 0.25, 1.0, 'ChatGPT research queries'),
  ('openai', 'dall-e-3', 0.0, 0.0, '$0.04-0.12 per image'),
  ('google', 'gemini-2.5-pro', 0.125, 0.5, 'Gemini research'),
  ('google', 'imagen-3', 0.0, 0.0, '$0.03-0.06 per image'),
  ('resend', 'transactional', 0.0, 0.0, 'Free tier: 3000/month')
ON CONFLICT (provider, model) DO NOTHING;

UPDATE cost_rate_card SET per_call_cost_cents = 0.5 WHERE provider = 'perplexity' AND per_call_cost_cents IS NULL;
UPDATE cost_rate_card SET per_call_cost_cents = 8.0 WHERE model = 'dall-e-3' AND per_call_cost_cents IS NULL;
UPDATE cost_rate_card SET per_call_cost_cents = 4.0 WHERE model = 'imagen-3' AND per_call_cost_cents IS NULL;

-- RLS + grants
ALTER TABLE cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_daily_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_rate_card ENABLE ROW LEVEL SECURITY;
GRANT ALL ON cost_events TO service_role;
GRANT ALL ON cost_daily_rollup TO service_role;
GRANT ALL ON cost_baselines TO service_role;
GRANT ALL ON cost_alerts TO service_role;
GRANT ALL ON cost_rate_card TO service_role;
