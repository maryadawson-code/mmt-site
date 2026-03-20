-- 016-penny-pincher.sql — Penny Pincher Agent: Cost & Efficiency Sentinel
-- Created: 2026-03-20

-- Token Usage Tracking
CREATE TABLE IF NOT EXISTS penny_token_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_key TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  estimated_cost_usd NUMERIC(10,6),
  task_type TEXT,
  task_id UUID,
  trigger TEXT,
  quality_required TEXT CHECK (quality_required IN ('high', 'medium', 'low')) DEFAULT 'medium',
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_agent ON penny_token_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_token_model ON penny_token_usage(model);
CREATE INDEX IF NOT EXISTS idx_token_date ON penny_token_usage(recorded_at);
CREATE INDEX IF NOT EXISTS idx_token_task_type ON penny_token_usage(task_type);

-- Model Pricing Reference
CREATE TABLE IF NOT EXISTS penny_model_pricing (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model TEXT NOT NULL UNIQUE,
  input_per_mtok NUMERIC(10,4) NOT NULL,
  output_per_mtok NUMERIC(10,4) NOT NULL,
  cached_per_mtok NUMERIC(10,4) DEFAULT 0,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT
);

INSERT INTO penny_model_pricing (model, input_per_mtok, output_per_mtok, cached_per_mtok, notes) VALUES
  ('claude-opus-4', 15.00, 75.00, 1.50, 'Anthropic Opus 4 — editorial voice, complex analysis only'),
  ('claude-sonnet-4', 3.00, 15.00, 0.30, 'Anthropic Sonnet 4 — code, research, general tasks'),
  ('claude-haiku-3.5', 0.25, 1.25, 0.025, 'Anthropic Haiku 3.5 — monitoring, simple checks, routing'),
  ('sonar', 1.00, 1.00, 0, 'Perplexity Sonar — quick research'),
  ('sonar-pro', 3.00, 15.00, 0, 'Perplexity Sonar Pro — deep research with citations')
ON CONFLICT (model) DO NOTHING;

-- Efficiency Findings
CREATE TABLE IF NOT EXISTS penny_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_type TEXT NOT NULL CHECK (finding_type IN (
    'model_overuse', 'payload_bloat', 'idle_agent', 'duplicate_work',
    'heartbeat_waste', 'cache_miss', 'prompt_bloat', 'tool_misroute',
    'dead_feature', 'api_excess'
  )),
  severity TEXT CHECK (severity IN ('high', 'medium', 'low')) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_agent TEXT,
  estimated_daily_waste_usd NUMERIC(10,4),
  estimated_monthly_waste_usd NUMERIC(10,4),
  recommendation TEXT NOT NULL,
  auto_fixable BOOLEAN DEFAULT FALSE,
  status TEXT CHECK (status IN ('open', 'approved', 'implemented', 'rejected', 'deferred')) DEFAULT 'open',
  implemented_at TIMESTAMPTZ,
  savings_verified_usd NUMERIC(10,4),
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_penny_findings_status ON penny_findings(status);
CREATE INDEX IF NOT EXISTS idx_penny_findings_type ON penny_findings(finding_type);

-- Daily Cost Summary
CREATE TABLE IF NOT EXISTS penny_daily_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  summary_date DATE NOT NULL UNIQUE,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  cost_by_agent JSONB,
  cost_by_task_type JSONB,
  cost_by_model JSONB,
  heartbeat_cycles INTEGER,
  productive_cycles INTEGER,
  waste_ratio NUMERIC(5,4),
  findings_opened INTEGER DEFAULT 0,
  savings_implemented_usd NUMERIC(10,4) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_penny_daily_date ON penny_daily_summary(summary_date);

-- Model Routing Rules
CREATE TABLE IF NOT EXISTS penny_routing_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  required_model TEXT NOT NULL,
  reason TEXT NOT NULL,
  override_allowed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, task_type)
);

INSERT INTO penny_routing_rules (agent_id, task_type, required_model, reason, override_allowed) VALUES
  ('ops-editorial', 'content', 'claude-opus-4', 'Editorial voice requires Opus quality', FALSE),
  ('ops-editorial', 'heartbeat', 'claude-haiku-3.5', 'Heartbeat is a checklist, not creative work', FALSE),
  ('ops-editorial', 'research', 'sonar-pro', 'Perplexity for research, not Opus reasoning', FALSE),
  ('ops-code', 'code', 'claude-sonnet-4', 'Sonnet handles code tasks well', TRUE),
  ('ops-code', 'heartbeat', 'claude-haiku-3.5', 'Heartbeat is a checklist', FALSE),
  ('ops-research', 'research', 'sonar-pro', 'Research agent should use Perplexity', FALSE),
  ('ops-research', 'heartbeat', 'claude-haiku-3.5', 'Heartbeat is a checklist', FALSE),
  ('ops-monitor', 'monitoring', 'claude-haiku-3.5', 'Monitoring is pattern matching, not reasoning', FALSE),
  ('ops-monitor', 'heartbeat', 'claude-haiku-3.5', 'Cheapest possible', FALSE),
  ('ops-newsletter', 'content', 'claude-sonnet-4', 'Newsletter formatting does not need Opus', TRUE),
  ('ops-newsletter', 'heartbeat', 'claude-haiku-3.5', 'Heartbeat is a checklist', FALSE),
  ('ops-social', 'content', 'claude-sonnet-4', 'Social post formatting is mechanical', TRUE),
  ('ops-social', 'heartbeat', 'claude-haiku-3.5', 'Heartbeat is a checklist', FALSE),
  ('ops-ciso', 'scanning', 'claude-haiku-3.5', 'Security scans are rule-based checks', FALSE),
  ('ops-ciso', 'heartbeat', 'claude-haiku-3.5', 'Heartbeat is a checklist', FALSE),
  ('ops-ciso', 'analysis', 'claude-sonnet-4', 'Compliance analysis needs reasoning but not Opus voice', TRUE),
  ('ops-penny', 'analysis', 'claude-haiku-3.5', 'Cost agent must be the cheapest agent in the stack', FALSE),
  ('ops-penny', 'heartbeat', 'claude-haiku-3.5', 'Cheapest possible', FALSE)
ON CONFLICT (agent_id, task_type) DO NOTHING;

-- RLS: service role only
ALTER TABLE penny_token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE penny_routing_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access" ON penny_token_usage FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON penny_model_pricing FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON penny_findings FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON penny_daily_summary FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON penny_routing_rules FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Register ops-penny in agent_registry
INSERT INTO agent_registry (id, name, status, sort_order, icon, color, platform, description, domain)
VALUES ('ops-penny', 'Penny Pincher', 'idle', 70, '💰', '#22c55e', 'openclaw', 'Cost & efficiency watchdog — monitors token spend, enforces model routing, auto-fixes waste', 'cost-optimization')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
