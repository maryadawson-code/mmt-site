-- Migration: Create missing tables referenced by command center stack
-- These tables may already exist in production; using IF NOT EXISTS for safety.

-- mp_scoring_history — ProposalPulse scoring records
CREATE TABLE IF NOT EXISTS mp_scoring_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT,
  feature TEXT DEFAULT 'lethality_test',
  file_name TEXT,
  file_type TEXT,
  document_type TEXT,
  extracted_text TEXT,
  scores JSONB,
  scorecard JSONB,
  avg_score NUMERIC,
  overall_grade TEXT,
  verdict TEXT,
  top_fix TEXT,
  red_flags JSONB,
  model_used TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  report_html TEXT,
  report_url TEXT,
  redteam_report_url TEXT,
  shadow_scorecard JSONB,
  shadow_model TEXT,
  consensus JSONB,
  feedback_rating INTEGER,
  feedback_at TIMESTAMPTZ,
  workflow_state TEXT DEFAULT 'pending',
  state_updated_at TIMESTAMPTZ DEFAULT now(),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_scoring_history_workflow ON mp_scoring_history(workflow_state, state_updated_at);
CREATE INDEX IF NOT EXISTS idx_mp_scoring_history_created ON mp_scoring_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_scoring_history_email ON mp_scoring_history(email);

ALTER TABLE mp_scoring_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_full_access_scoring" ON mp_scoring_history
  FOR ALL USING (true) WITH CHECK (true);

-- marketpulse_orders — MarketPulse report orders
CREATE TABLE IF NOT EXISTS marketpulse_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  email TEXT,
  topic TEXT,
  company_name TEXT,
  company_context TEXT,
  status TEXT DEFAULT 'pending',
  workflow_state TEXT DEFAULT 'pending',
  state_updated_at TIMESTAMPTZ DEFAULT now(),
  retry_count INTEGER DEFAULT 0,
  retrigger_count INTEGER DEFAULT 0,
  report_url TEXT,
  report_html TEXT,
  model_used TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  error_message TEXT,
  feedback_rating INTEGER,
  feedback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketpulse_orders_workflow ON marketpulse_orders(workflow_state, state_updated_at);
CREATE INDEX IF NOT EXISTS idx_marketpulse_orders_created ON marketpulse_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketpulse_orders_email ON marketpulse_orders(email);

ALTER TABLE marketpulse_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_full_access_mp_orders" ON marketpulse_orders
  FOR ALL USING (true) WITH CHECK (true);

-- contract_intel — AI-generated contract intelligence
CREATE TABLE IF NOT EXISTS contract_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_name TEXT UNIQUE NOT NULL,
  intel JSONB,
  black_hat JSONB,
  sources TEXT[],
  last_updated TIMESTAMPTZ DEFAULT now(),
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_intel_name ON contract_intel(contract_name);

ALTER TABLE contract_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_full_access_contract_intel" ON contract_intel
  FOR ALL USING (true) WITH CHECK (true);

-- customer_interactions — Customer interaction tracking
CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  channel TEXT,
  subject TEXT,
  summary TEXT,
  sentiment TEXT,
  agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_interactions_email ON customer_interactions(customer_email);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_created ON customer_interactions(created_at DESC);

ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_full_access_interactions" ON customer_interactions
  FOR ALL USING (true) WITH CHECK (true);

-- learning_sync_log — Agent learning sync audit trail
CREATE TABLE IF NOT EXISTS learning_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  learnings_synced INTEGER DEFAULT 0,
  learnings_pruned INTEGER DEFAULT 0,
  errors TEXT[],
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_sync_log_agent ON learning_sync_log(agent);
CREATE INDEX IF NOT EXISTS idx_learning_sync_log_created ON learning_sync_log(created_at DESC);

ALTER TABLE learning_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_full_access_learning_sync" ON learning_sync_log
  FOR ALL USING (true) WITH CHECK (true);
