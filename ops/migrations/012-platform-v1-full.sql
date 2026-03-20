-- ═══════════════════════════════════════════════════════════════
-- 012-platform-v1-full.sql
-- CONSOLIDATED: All Platform V1 tables, indexes, seed data, RLS
-- Safe to run multiple times (IF NOT EXISTS + ON CONFLICT DO NOTHING)
--
-- Run in Supabase SQL Editor: paste and execute.
-- ═══════════════════════════════════════════════════════════════

-- ============================================================
-- COST INTELLIGENCE (from 007)
-- ============================================================

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

-- Deduplicate existing data before adding unique constraints
DELETE FROM competitors a USING competitors b WHERE a.id > b.id AND a.name = b.name;
DELETE FROM cost_rate_card a USING cost_rate_card b WHERE a.id > b.id AND a.provider = b.provider AND a.model = b.model;
DELETE FROM service_inventory a USING service_inventory b WHERE a.id > b.id AND a.service_name = b.service_name;
DELETE FROM approval_categories a USING approval_categories b WHERE a.id > b.id AND a.category = b.category;
DELETE FROM customer_profiles a USING customer_profiles b WHERE a.id > b.id AND a.email = b.email;
DELETE FROM sentry_errors a USING sentry_errors b WHERE a.id > b.id AND a.sentry_id = b.sentry_id;

-- Add unique constraints (skip if already exist)
DO $$ BEGIN
  ALTER TABLE cost_rate_card ADD CONSTRAINT cost_rate_card_provider_model_key UNIQUE (provider, model);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE service_inventory ADD CONSTRAINT service_inventory_service_name_key UNIQUE (service_name);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE customer_profiles ADD CONSTRAINT customer_profiles_email_key UNIQUE (email);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE customer_preferences ADD CONSTRAINT customer_preferences_email_key UNIQUE (email);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sentry_errors ADD CONSTRAINT sentry_errors_sentry_id_key UNIQUE (sentry_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE approval_categories ADD CONSTRAINT approval_categories_category_key UNIQUE (category);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE competitors ADD CONSTRAINT competitors_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- Seed rate card
INSERT INTO cost_rate_card (provider, model, input_cost_per_1k_cents, output_cost_per_1k_cents, notes) VALUES
  ('anthropic', 'claude-sonnet-4-20250514', 0.3, 1.5, 'Sonnet 4 — primary scoring model'),
  ('anthropic', 'claude-haiku-4-5-20251001', 0.08, 0.4, 'Haiku 4.5 — shadow scoring'),
  ('anthropic', 'claude-haiku-3.5', 0.08, 0.4, 'Haiku 3.5 — legacy'),
  ('anthropic', 'claude-opus-4', 1.5, 7.5, 'Opus 4 — editorial agent'),
  ('perplexity', 'sonar-pro', 0.0, 0.0, 'Sonar Pro — tactical brief research'),
  ('perplexity', 'sonar', 0.0, 0.0, '$5/1000 searches'),
  ('openai', 'gpt-4o', 0.25, 1.0, 'ChatGPT research queries'),
  ('openai', 'dall-e-3', 0.0, 0.0, '$0.04-0.12 per image'),
  ('google', 'gemini-2.5-pro', 0.125, 0.5, 'Gemini research'),
  ('google', 'imagen-3', 0.0, 0.0, '$0.03-0.06 per image'),
  ('resend', 'transactional', 0.0, 0.0, 'Free tier: 3000/month')
ON CONFLICT (provider, model) DO NOTHING;

UPDATE cost_rate_card SET per_call_cost_cents = 0.5 WHERE provider = 'perplexity' AND per_call_cost_cents IS NULL;
UPDATE cost_rate_card SET per_call_cost_cents = 8.0 WHERE model = 'dall-e-3' AND per_call_cost_cents IS NULL;
UPDATE cost_rate_card SET per_call_cost_cents = 4.0 WHERE model = 'imagen-3' AND per_call_cost_cents IS NULL;
UPDATE cost_rate_card SET per_email_cost_cents = 0.0 WHERE provider = 'resend' AND per_email_cost_cents IS NULL;

-- ============================================================
-- SERVICE INVENTORY (from 008)
-- ============================================================

CREATE TABLE IF NOT EXISTS service_inventory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  service_name text NOT NULL UNIQUE,
  category text NOT NULL,
  sub_category text,
  monthly_cost_cents integer DEFAULT 0,
  annual_cost_cents integer DEFAULT 0,
  billing_cycle text,
  billing_account text,
  status text NOT NULL DEFAULT 'active',
  priority text DEFAULT 'keep',
  action_required text,
  action_deadline date,
  confirmed_via text,
  last_verified date,
  receipt_ref text,
  notes text,
  agent_recommendation text,
  human_decision text,
  decision_date date,
  is_business boolean DEFAULT true,
  is_tax_deductible boolean DEFAULT false,
  platform text
);

CREATE INDEX IF NOT EXISTS idx_service_deadline ON service_inventory(action_deadline) WHERE action_deadline IS NOT NULL;

-- Seed all 36 services
INSERT INTO service_inventory (service_name, category, sub_category, monthly_cost_cents, billing_cycle, billing_account, status, priority, action_required, action_deadline, confirmed_via, last_verified, notes, is_business, is_tax_deductible) VALUES
('Netlify', 'infrastructure', 'hosting', 1070, 'monthly', 'maryadawson@gmail.com', 'active', 'monitor', NULL, NULL, 'Receipt SBXBMW-00020', '2026-03-07', 'Paid plan $10.70/mo.', true, true),
('Plausible Analytics', 'infrastructure', 'analytics', 900, 'monthly', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Known', '2026-03-07', 'Privacy-first. $9/mo.', true, true),
('Buttondown', 'infrastructure', 'email', 0, 'free', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Known', '2026-03-07', 'Newsletter. Free.', true, false),
('Render', 'infrastructure', 'hosting', 2500, 'monthly', 'maryadawson@gmail.com', 'active', 'monitor', NULL, NULL, 'Receipt #2233-6965', '2026-03-04', 'MissionPulse API $25/mo.', true, true),
('Supabase', 'infrastructure', 'database', 0, 'free', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Known', '2026-03-07', 'Free tier.', true, false),
('Anthropic API', 'infrastructure', 'ai-api', 10000, 'usage', 'maryadawson@gmail.com', 'active', 'monitor', 'Set budget alert', NULL, 'Receipts FQBRUNWE-0019/0022', '2026-03-05', 'Auto-recharge ~$50. SEPARATE from Claude Max.', true, true),
('Resend', 'infrastructure', 'email', 2000, 'monthly', 'maryadawson@gmail.com', 'active', 'monitor', NULL, NULL, 'Receipt #2827-1237', '2026-03-04', 'Transactional Pro $20/mo.', true, true),
('SerpAPI', 'infrastructure', 'seo', 0, 'unknown', 'maryadawson@gmail.com', 'active', 'verify', 'Confirm plan at serpapi.com/billing', NULL, NULL, '2026-03-07', 'GitHub Actions. May be free.', true, true),
('Riverside.fm', 'infrastructure', 'podcast', 0, 'annual', 'maryadawson@gmail.com', 'active', 'verify', 'Add annual cost from CC', NULL, 'Email Jan 22 2026', '2026-01-22', 'Renews Jan 22 2027.', true, true),
('Stripe', 'infrastructure', 'payments', 0, 'per-txn', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Confirmed', '2026-03-07', '2.9% + $0.30.', true, true),
('Sentry', 'infrastructure', 'monitoring', 0, 'free', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, NULL, '2026-03-07', 'Free tier.', true, false),
('GitHub', 'infrastructure', 'code', 0, 'free', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, NULL, '2026-03-07', 'Free CI/CD.', true, false),
('Google Workspace', 'infrastructure', 'email', 1400, 'monthly', 'mary@missionmeetstech.com', 'active', 'decide', 'DECIDE: keep or cancel by Apr 1', '2026-04-01', 'Known', '2026-03-07', 'Trial $14/mo starts Apr 1.', true, true),
('Gamma AI', 'infrastructure', 'presentations', 0, 'usage', 'maryadawson@gmail.com', 'active', 'monitor', NULL, NULL, 'Receipt #2368-8879', '2026-03-03', 'Credit-based.', true, true),
('missionmeetstech.com', 'domains', 'domain', 0, 'annual', 'maryadawson@gmail.com', 'active', 'verify-urgent', 'Find registrar + renewal date', NULL, 'Bluehost DNS', '2026-03-07', 'REGISTRAR UNKNOWN. RISK.', true, true),
('missionpulse.ai', 'domains', 'domain', 0, 'annual', 'maryadawson@gmail.com', 'active', 'verify-urgent', 'Find registrar + renewal date', NULL, 'Confirmed', '2026-03-07', '.ai TLD. REGISTRAR UNKNOWN.', true, true),
('Bluehost', 'domains', 'hosting-dns', 1919, 'monthly', 'maryadawson@gmail.com', 'active', 'verify', 'Cancel hosting if domain-only', NULL, 'Known', '2026-03-07', 'Acct #154257576. $19.19/mo.', true, true),
('Claude Max', 'ai-tools', 'llm', 0, 'monthly', 'maryadawson@gmail.com', 'active', 'verify', 'Find monthly cost', NULL, NULL, '2026-03-07', 'SEPARATE from API.', true, true),
('Ask Sage', 'ai-tools', 'govcon-ai', 18000, 'monthly', 'maryadawson@gmail.com', 'active', 'evaluate', 'Evaluate vs Claude Max', NULL, 'Known', '2026-03-07', '$180/mo. HIGHEST AI ITEM.', true, true),
('Google AI Pro', 'ai-tools', 'ai-storage', 2131, 'monthly', 'maryadawson@gmail.com', 'active', 'evaluate', 'Downgrade to storage-only?', NULL, 'Known', '2026-03-07', 'Gemini + 2TB. $21.31/mo.', true, true),
('Genspark Plus', 'ai-tools', 'ai-research', 2499, 'monthly', 'maryadawson@gmail.com', 'active', 'evaluate', 'Cancel if redundant', NULL, 'Stripe Jan 10 2026', '2026-01-10', '$24.99/mo.', true, true),
('Grok SuperGrok', 'ai-tools', 'llm', 3000, 'monthly', 'maryadawson@gmail.com', 'active', 'evaluate', 'Cancel if redundant', NULL, 'Apple Feb 2026', '2026-02-10', '$30/mo via Apple.', false, false),
('Perplexity MAX', 'ai-tools', 'ai-research', 2000, 'monthly', 'maryadawson@gmail.com', 'active', 'evaluate', 'Keep if used for intel', NULL, 'Apple Mar 2026', '2026-03-04', '$20/mo.', true, true),
('LinkedIn Premium', 'productivity', 'network', 6999, 'monthly', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Apple Feb 23 2026', '2026-02-23', '$69.99/mo.', true, true),
('Piktochart', 'productivity', 'design', 2586, 'annual', 'maryadawson@gmail.com', 'active', 'evaluate', 'Canva may cover this', '2026-03-07', 'Known', '2026-03-07', '~$31/mo annual.', true, true),
('Cue AI', 'productivity', 'notes', 0, 'weekly', 'maryadawson@gmail.com', 'cancelled', 'resolved', NULL, NULL, 'Known', '2026-03-19', 'CANCELLED Mar 19.', false, false),
('Otter.ai', 'productivity', 'transcription', 0, 'unknown', 'maryadawson@gmail.com', 'active', 'verify', 'Confirm plan + cost', NULL, NULL, '2026-03-07', 'Replacing Cue AI.', true, true),
('Hulu Live TV Bundle', 'personal', 'streaming', 9999, 'monthly', 'maryadawson@gmail.com', 'active', 'evaluate', 'Live TV justified?', NULL, 'Oct 2025', '2025-10-01', '$99.99/mo.', false, false),
('YouTube Premium', 'personal', 'streaming', 1899, 'monthly', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Apple Nov 2025', '2025-11-23', '$18.99/mo.', false, false),
('War on the Rocks', 'personal', 'news', 2200, 'monthly', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Jan+Mar 2026', '2026-03-04', '$22/mo.', true, true),
('Tucker Carlson Network', 'personal', 'media', 600, 'annual', 'maryadawson@gmail.com', 'active', 'keep', NULL, '2026-08-30', 'Aug 30 2025', '2025-08-30', '$72/yr.', false, false),
('Better Homes & Gardens', 'personal', 'magazine', 0, 'annual', 'maryadawson@gmail.com', 'active', 'cancel', 'Cancel by Mar 31', '2026-03-31', 'Known', '2026-03-07', NULL, false, false),
('Heart Beat App', 'personal', 'health', 0, 'unknown', 'maryadawson@gmail.com', 'active', 'cancel', 'Cancel in App Store', NULL, NULL, '2026-03-07', NULL, false, false),
('ClassDojo Plus', 'family', 'education', 699, 'monthly', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Apple Jan 8 2026', '2026-01-08', '$6.99/mo.', false, false),
('Roblox Premium 450', 'family', 'gaming', 499, 'monthly', 'maryadawson@gmail.com', 'active', 'keep', NULL, NULL, 'Apple Feb 23 2026', '2026-02-23', '$4.99/mo Dani.', false, false),
('Transistor', 'cancelled', 'podcast', 0, 'cancelled', 'maryadawson@gmail.com', 'cancelled', 'resolved', NULL, NULL, 'Account UI', '2026-03-19', 'Migrated to Riverside.', true, false)
ON CONFLICT (service_name) DO NOTHING;

-- ============================================================
-- FINANCE ALERTS
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  alert_type text NOT NULL,
  severity text NOT NULL,
  source text NOT NULL DEFAULT 'cost_intelligence',
  title text NOT NULL,
  description text NOT NULL,
  recommended_action text,
  auto_actionable boolean DEFAULT false,
  auto_acted boolean DEFAULT false,
  human_decision text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_finance_alerts_unresolved ON finance_alerts(created_at DESC) WHERE resolved_at IS NULL;

-- ============================================================
-- CUSTOMER INTELLIGENCE
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  email text NOT NULL UNIQUE,
  name text,
  company text,
  role text,
  first_seen_at timestamptz DEFAULT now(),
  signup_source text,
  stripe_customer_id text,
  proposalpulse_count integer DEFAULT 0,
  proposalpulse_last_at timestamptz,
  marketpulse_count integer DEFAULT 0,
  marketpulse_last_at timestamptz,
  newsletter_subscriber boolean DEFAULT false,
  total_revenue_cents integer DEFAULT 0,
  last_payment_at timestamptz,
  health_score integer DEFAULT 50,
  health_signals jsonb DEFAULT '[]',
  churn_risk text DEFAULT 'unknown',
  last_contacted_at timestamptz,
  contact_notes text,
  next_action text,
  next_action_date date,
  tags text[] DEFAULT '{}',
  lifecycle_stage text DEFAULT 'lead'
);

CREATE INDEX IF NOT EXISTS idx_customer_email ON customer_profiles(email);
CREATE INDEX IF NOT EXISTS idx_customer_health ON customer_profiles(health_score);

CREATE TABLE IF NOT EXISTS customer_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  customer_id uuid REFERENCES customer_profiles(id),
  email text NOT NULL,
  event_type text NOT NULL,
  product text,
  amount_cents integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_customer_events_email ON customer_events(email, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL,
  is_valid boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_email ON customer_sessions(email, is_valid) WHERE is_valid = true;
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at) WHERE is_valid = true;

CREATE TABLE IF NOT EXISTS customer_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  notify_report_ready boolean DEFAULT true,
  notify_product_updates boolean DEFAULT true,
  notify_feedback_requests boolean DEFAULT true,
  notify_upsell boolean DEFAULT false,
  preferred_format text DEFAULT 'email',
  metadata jsonb DEFAULT '{}'
);

-- Seed founder profile
INSERT INTO customer_profiles (email, name, company, first_seen_at, signup_source, proposalpulse_count, marketpulse_count, total_revenue_cents, lifecycle_stage, health_score, tags)
SELECT 'maryadawson@gmail.com', 'Mary Womack', 'Mission Meets Tech LLC', '2026-03-17', 'founder', 10, 3, 15000, 'active', 100, ARRAY['founder','vip']
WHERE NOT EXISTS (SELECT 1 FROM customer_profiles WHERE email = 'maryadawson@gmail.com');

-- ============================================================
-- PROJECTS / SPRINTS / TASKS
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL,
  description text,
  platform text NOT NULL,
  status text DEFAULT 'active',
  owner text,
  priority text DEFAULT 'normal',
  start_date date,
  target_date date,
  completed_date date,
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sprints (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  project_id uuid REFERENCES projects(id),
  name text NOT NULL,
  goal text,
  status text DEFAULT 'planned',
  start_date date,
  end_date date,
  tasks_total integer DEFAULT 0,
  tasks_done integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  project_id uuid REFERENCES projects(id),
  sprint_id uuid REFERENCES sprints(id),
  title text NOT NULL,
  description text,
  status text DEFAULT 'backlog',
  priority text DEFAULT 'normal',
  assignee text,
  reporter text,
  estimate_hours numeric(5,1),
  actual_hours numeric(5,1),
  started_at timestamptz,
  completed_at timestamptz,
  github_pr text,
  type text DEFAULT 'task',
  platform text,
  tags text[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON project_tasks(assignee) WHERE status NOT IN ('done','cancelled');

-- Seed projects (skip if already seeded)
INSERT INTO projects (name, description, platform, status, owner, priority, start_date)
SELECT 'MMT Launch Stabilization', 'Post-launch fixes, QA, cost optimization', 'mmt', 'active', 'mary', 'critical', '2026-03-19'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'MMT Launch Stabilization');
INSERT INTO projects (name, description, platform, status, owner, priority, start_date)
SELECT 'MissionPulse GTM', 'Revenue blockers: Stripe, AI, pricing', 'missionpulse', 'active', 'coo', 'critical', NULL
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'MissionPulse GTM');
INSERT INTO projects (name, description, platform, status, owner, priority, start_date)
SELECT 'Newsletter Operations', 'Tue/Fri pipeline', 'mmt', 'active', 'ops-editorial', 'high', '2026-03-19'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Newsletter Operations');
INSERT INTO projects (name, description, platform, status, owner, priority, start_date)
SELECT 'Agent Fleet Buildout', 'All operational agents', 'ops', 'active', 'mary', 'high', '2026-03-19'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Agent Fleet Buildout');
INSERT INTO projects (name, description, platform, status, owner, priority, start_date)
SELECT 'Cost Optimization', 'API costs + service inventory', 'cross-platform', 'active', 'ops-finance', 'high', '2026-03-19'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Cost Optimization');

-- Seed tasks (skip if already seeded)
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, completed_at)
SELECT 'ProposalPulse A++ overhaul', 'done', 'critical', 'ops-code', 'feature', 'mmt', '2026-03-19T17:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'ProposalPulse A++ overhaul');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, completed_at)
SELECT 'MarketPulse A++ overhaul', 'done', 'critical', 'ops-code', 'feature', 'mmt', '2026-03-19T17:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'MarketPulse A++ overhaul');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, completed_at)
SELECT 'Site QA 21 fixes', 'done', 'critical', 'ops-code', 'bug', 'mmt', '2026-03-19T19:30:00Z'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'Site QA 21 fixes');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, completed_at)
SELECT 'Dashboard restructure', 'done', 'high', 'ops-code', 'feature', 'mmt', '2026-03-19T20:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'Dashboard restructure');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, completed_at)
SELECT 'Agent bridge + 7 tools', 'done', 'high', 'ops-code', 'feature', 'ops', '2026-03-19T19:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'Agent bridge + 7 tools');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, completed_at)
SELECT '6-agent fleet', 'done', 'high', 'ops-code', 'feature', 'ops', '2026-03-19T20:15:00Z'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = '6-agent fleet');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, completed_at)
SELECT 'Contract intel seeding', 'done', 'high', 'ops-editorial', 'task', 'mmt', '2026-03-19T19:45:00Z'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'Contract intel seeding');

INSERT INTO project_tasks (title, status, priority, assignee, type, platform, description)
SELECT 'Fix contract intel display', 'ready', 'high', 'ops-code', 'bug', 'mmt', 'JS sends slug, API expects display name'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'Fix contract intel display');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, description)
SELECT 'Customer portal', 'backlog', 'high', 'ops-code', 'feature', 'mmt', 'Order history + report downloads'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'Customer portal');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, description)
SELECT 'E2E test suite', 'backlog', 'high', 'ops-code', 'task', 'mmt', 'Zero test coverage'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'E2E test suite');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, description)
SELECT 'MissionPulse Stripe', 'backlog', 'critical', 'coo', 'feature', 'missionpulse', 'Revenue = $0 until this ships'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'MissionPulse Stripe');
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, description)
SELECT 'NanoClaw migration', 'backlog', 'normal', 'ops-code', 'task', 'ops', 'Target Mar 22. Wait for stability.'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE title = 'NanoClaw migration');

-- ============================================================
-- QA / SLA
-- ============================================================

CREATE TABLE IF NOT EXISTS qa_test_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  product text NOT NULL,
  test_type text NOT NULL,
  status text DEFAULT 'running',
  test_input jsonb DEFAULT '{}',
  duration_seconds integer,
  result_grade text,
  result_summary text,
  checks_total integer DEFAULT 0,
  checks_passed integer DEFAULT 0,
  checks_failed integer DEFAULT 0,
  failed_checks jsonb DEFAULT '[]',
  baseline_grade text,
  is_regression boolean DEFAULT false,
  regression_details text,
  cost_cents integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_qa_runs_product ON qa_test_runs(product, created_at DESC);

CREATE TABLE IF NOT EXISTS qa_baselines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  updated_at timestamptz DEFAULT now(),
  product text NOT NULL,
  test_type text NOT NULL,
  avg_grade text,
  avg_duration_seconds integer,
  avg_checks_passed_pct numeric(5,2),
  sample_count integer DEFAULT 0,
  UNIQUE(product, test_type)
);

CREATE TABLE IF NOT EXISTS sla_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  date date NOT NULL,
  product text NOT NULL,
  orders_total integer DEFAULT 0,
  orders_delivered integer DEFAULT 0,
  orders_failed integer DEFAULT 0,
  avg_delivery_seconds integer,
  p95_delivery_seconds integer,
  delivery_sla_target_seconds integer DEFAULT 3600,
  sla_met_count integer DEFAULT 0,
  sla_breached_count integer DEFAULT 0,
  uptime_pct numeric(5,2),
  UNIQUE(date, product)
);

-- ============================================================
-- ISSUES / SENTRY / DEPLOYMENTS (from 009)
-- ============================================================

CREATE TABLE IF NOT EXISTS issues (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT 'bug',
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  product text,
  status text NOT NULL DEFAULT 'detected',
  status_history jsonb DEFAULT '[]',
  affected_files text[],
  error_logs text,
  root_cause text,
  suggested_fix text,
  fix_complexity text,
  estimated_minutes integer,
  fix_branch text,
  fix_diff text,
  fix_commit text,
  fix_pr_url text,
  assigned_agent text,
  assigned_human text,
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  verification_result text,
  related_task_id uuid,
  related_alert_id uuid,
  sentry_url text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status) WHERE status NOT IN ('closed', 'wont-fix');
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity, created_at DESC) WHERE status NOT IN ('closed', 'wont-fix');
CREATE INDEX IF NOT EXISTS idx_issues_product ON issues(product, status);
CREATE INDEX IF NOT EXISTS idx_issues_assigned ON issues(assigned_agent) WHERE status NOT IN ('closed', 'wont-fix');

CREATE TABLE IF NOT EXISTS issue_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  issue_id uuid NOT NULL REFERENCES issues(id),
  author text NOT NULL,
  author_type text NOT NULL DEFAULT 'agent',
  content text NOT NULL,
  code_diff text,
  code_file text,
  code_language text,
  action text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments(issue_id, created_at);

CREATE TABLE IF NOT EXISTS sentry_errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  sentry_id text NOT NULL UNIQUE,
  title text NOT NULL,
  culprit text,
  level text,
  first_seen timestamptz,
  last_seen timestamptz,
  event_count integer DEFAULT 1,
  platform text,
  stack_trace text,
  affected_function text,
  affected_file text,
  linked_issue_id uuid REFERENCES issues(id),
  is_resolved boolean DEFAULT false,
  is_ignored boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sentry_errors_unresolved ON sentry_errors(last_seen DESC) WHERE is_resolved = false AND is_ignored = false;

CREATE TABLE IF NOT EXISTS deployments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  branch text NOT NULL,
  commit_sha text,
  commit_message text,
  deploy_type text DEFAULT 'production',
  triggered_by text,
  netlify_deploy_id text,
  deploy_url text,
  status text DEFAULT 'pending',
  homepage_status integer,
  homepage_size integer,
  verification_notes text,
  fixes_issues uuid[],
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_deployments_date ON deployments(created_at DESC);

-- Seed known issues (skip if already seeded)
INSERT INTO issues (title, severity, category, source, product, status, root_cause, suggested_fix, fix_complexity, estimated_minutes, affected_files)
SELECT 'Contract intel display bug — JS sends slug, API expects display name', 'high', 'bug', 'manual', 'site', 'detected', 'The contract detail page JavaScript constructs the API URL using the page slug but the contract-intel API expects the display name.', 'Add a slug-to-name mapping in the client JS, or modify the API to accept slugs.', 'small', 15, ARRAY['js/contract-detail.js', 'netlify/functions/contract-intel-api.js']
WHERE NOT EXISTS (SELECT 1 FROM issues WHERE title LIKE 'Contract intel display bug%');
INSERT INTO issues (title, severity, category, source, product, status, root_cause, suggested_fix, fix_complexity, estimated_minutes)
SELECT 'No automated tests — zero coverage', 'high', 'tech-debt', 'manual', 'mmt', 'detected', 'No test framework configured.', 'Add Vitest. Start with unit tests for cost-tracker, customer-sync, email-templates.', 'large', 480
WHERE NOT EXISTS (SELECT 1 FROM issues WHERE title LIKE 'No automated tests%');
INSERT INTO issues (title, severity, category, source, product, status, root_cause, suggested_fix, fix_complexity, estimated_minutes)
SELECT 'Domain registrars unknown — renewal risk', 'high', 'security', 'manual', 'infra', 'detected', 'Neither missionmeetstech.com nor missionpulse.ai has a confirmed registrar or renewal date.', 'Check WHOIS for both domains. Log registrar, renewal date, and auto-renew status.', 'trivial', 15
WHERE NOT EXISTS (SELECT 1 FROM issues WHERE title LIKE 'Domain registrars unknown%');
INSERT INTO issues (title, severity, category, source, product, status, root_cause, suggested_fix, fix_complexity, estimated_minutes)
SELECT 'API keys missing from LaunchAgent plist', 'medium', 'bug', 'agent', 'ops', 'detected', 'BRAVE_API_KEY and PERPLEXITY_API_KEY are not in the OpenClaw gateway LaunchAgent plist.', 'Add ALL API keys from .env to plist.', 'trivial', 5
WHERE NOT EXISTS (SELECT 1 FROM issues WHERE title LIKE 'API keys missing%');

-- ============================================================
-- APPROVAL QUEUE (from 010)
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  title text NOT NULL,
  description text,
  category text NOT NULL,
  target_role text NOT NULL,
  target_email text,
  submitted_by text NOT NULL,
  submitted_by_type text DEFAULT 'agent',
  payload_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  context jsonb DEFAULT '{}',
  preview_html text,
  status text NOT NULL DEFAULT 'pending',
  decision_by text,
  decision_at timestamptz,
  decision_notes text,
  modifications jsonb,
  executed boolean DEFAULT false,
  executed_at timestamptz,
  execution_result text,
  execution_error text,
  expires_at timestamptz,
  related_issue_id uuid,
  related_task_id uuid,
  related_order_id uuid,
  comment_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_approval_pending ON approval_queue(target_role, status, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approval_customer ON approval_queue(target_email, status) WHERE target_role = 'customer';
CREATE INDEX IF NOT EXISTS idx_approval_recent ON approval_queue(created_at DESC);

CREATE TABLE IF NOT EXISTS approval_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  approval_id uuid NOT NULL REFERENCES approval_queue(id),
  author text NOT NULL,
  author_type text NOT NULL DEFAULT 'human',
  content text NOT NULL,
  attachment_type text,
  attachment_data text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_approval_comments ON approval_comments(approval_id, created_at);

CREATE TABLE IF NOT EXISTS approval_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL UNIQUE,
  target_role text NOT NULL,
  display_name text NOT NULL,
  description text,
  icon text,
  auto_approve_rules jsonb DEFAULT '{}',
  expiry_hours integer DEFAULT 72,
  requires_preview boolean DEFAULT false,
  sort_order integer DEFAULT 100
);

-- Seed 21 approval categories
INSERT INTO approval_categories (category, target_role, display_name, description, icon, expiry_hours, requires_preview, sort_order) VALUES
  ('deploy', 'cto', 'Deploy to Production', 'Code changes ready to deploy', '🚀', 24, true, 10),
  ('architecture', 'cto', 'Architecture Decision', 'Infrastructure or architecture changes', '🏗️', 72, false, 20),
  ('schema-change', 'cto', 'Database Schema Change', 'New tables, columns, or index changes', '🗄️', 24, true, 15),
  ('dependency', 'cto', 'New Dependency', 'Adding a new npm package or API integration', '📦', 48, false, 25),
  ('spend-approval', 'coo', 'Spend Approval', 'Purchases, subscriptions, or budget changes over $50', '💰', 24, false, 10),
  ('service-change', 'coo', 'Service Change', 'Cancel, upgrade, or downgrade a service subscription', '🔄', 48, false, 15),
  ('customer-outreach', 'coo', 'Customer Outreach', 'Email or message to send to a customer', '📧', 24, true, 20),
  ('sprint-change', 'coo', 'Sprint/Priority Change', 'Reorder backlog, change sprint scope, reassign work', '📋', 48, false, 25),
  ('hire-contract', 'coo', 'Hiring/Contract Decision', 'New contractor, freelancer, or vendor engagement', '🤝', 72, false, 30),
  ('process-change', 'coo', 'Process Change', 'New workflow, automation rule, or operational procedure', '⚙️', 72, false, 35),
  ('newsletter-draft', 'editor', 'Newsletter Draft', 'Full newsletter ready for review and publish', '📰', 12, true, 10),
  ('linkedin-post', 'editor', 'LinkedIn Post', 'LinkedIn post draft ready for review', '💼', 6, true, 15),
  ('research-brief', 'editor', 'Research Brief', 'Completed research brief for review', '🔍', 24, true, 20),
  ('topic-pitch', 'editor', 'Topic Pitch', 'Agent recommending a newsletter topic with reasoning', '💡', 48, false, 25),
  ('editorial-correction', 'editor', 'Editorial Correction', 'Agent flagging a factual issue in published content', '⚠️', 12, false, 12),
  ('glossary-entry', 'editor', 'New Glossary Entry', 'Proposed new term for the glossary', '📖', 72, true, 30),
  ('report-review', 'customer', 'Report Ready for Review', 'Your report is ready', NULL, 168, true, 10),
  ('score-dispute', 'customer', 'Score Dispute', 'Customer disputes a ProposalPulse score', NULL, 72, false, 20),
  ('rerun-request', 'customer', 'Re-run Available', 'An improved version of your report can be generated', NULL, 168, false, 15),
  ('feedback-request', 'customer', 'Feedback Request', 'How was your experience? Help us improve.', NULL, 336, false, 25),
  ('upsell-offer', 'customer', 'Upgrade Recommendation', 'Based on your usage, you might benefit from...', NULL, 336, false, 30)
ON CONFLICT (category) DO NOTHING;

-- ============================================================
-- SELF-LEARNING ENGINE (from 011)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_learnings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  agent text NOT NULL,
  category text NOT NULL,
  domain text,
  rule text NOT NULL,
  context text,
  source text NOT NULL DEFAULT 'self',
  source_approval_id uuid,
  source_issue_id uuid,
  times_applied integer DEFAULT 0,
  last_applied_at timestamptz,
  prevented_errors integer DEFAULT 0,
  is_active boolean DEFAULT true,
  superseded_by uuid,
  expires_at timestamptz,
  confidence numeric(3,2) DEFAULT 0.80,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_learnings_agent ON agent_learnings(agent, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_learnings_domain ON agent_learnings(domain, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON agent_learnings(confidence DESC) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS learning_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  learning_id uuid NOT NULL REFERENCES agent_learnings(id),
  agent text NOT NULL,
  event_type text NOT NULL,
  context text,
  outcome text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_learning_feedback ON learning_feedback(learning_id, created_at DESC);

-- ============================================================
-- COMPETITIVE INTELLIGENCE (from 011)
-- ============================================================

CREATE TABLE IF NOT EXISTS competitors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL UNIQUE,
  website text,
  description text,
  products jsonb DEFAULT '[]',
  target_market text,
  company_size text,
  funding text,
  overlap_score integer DEFAULT 0,
  strengths text,
  weaknesses text,
  differentiation text,
  last_researched_at timestamptz,
  research_notes text,
  pricing_history jsonb DEFAULT '[]',
  news jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS competitive_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  competitor_id uuid REFERENCES competitors(id),
  competitor_name text NOT NULL,
  alert_type text NOT NULL,
  title text NOT NULL,
  description text,
  source_url text,
  impact text,
  recommended_action text,
  reviewed boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_competitive_alerts_unreviewed ON competitive_alerts(created_at DESC) WHERE reviewed = false;

-- Seed competitors
INSERT INTO competitors (name, website, description, target_market, overlap_score, products) VALUES
  ('Lohfeld Consulting', 'https://lohfeldconsulting.com', 'GovCon capture/proposal consulting', 'govcon', 60, '[{"name":"Proposal Review","pricing":"$5,000-25,000"}]'),
  ('Shipley Associates', 'https://shipleywins.com', 'Proposal methodology + training', 'govcon', 50, '[{"name":"Training","pricing":"$2,000-5,000/person"}]'),
  ('GovWin (Deltek)', 'https://iq.govwin.com', 'Federal market intelligence', 'govcon', 40, '[{"name":"GovWin IQ","pricing":"$10,000-50,000/yr"}]'),
  ('Bloomberg Government', 'https://about.bgov.com', 'Government intelligence platform', 'govcon', 35, '[{"name":"BGOV","pricing":"$6,000-15,000/yr"}]'),
  ('GovTribe', 'https://govtribe.com', 'Federal contracting data', 'govcon', 45, '[{"name":"Pro","pricing":"$600-2,400/yr"}]'),
  ('Ask Sage', 'https://asksage.ai', 'GovCon AI assistant, FedRAMP', 'govcon', 55, '[{"name":"Ask Sage","pricing":"$180/mo"}]'),
  ('Govly', 'https://govly.com', 'AI opportunity discovery', 'govcon', 50, '[{"name":"Govly","pricing":"Free+paid"}]')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- RLS + SERVICE ROLE GRANTS (all tables)
-- ============================================================

ALTER TABLE cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_daily_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_rate_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentry_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_alerts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON cost_events TO service_role;
GRANT ALL ON cost_daily_rollup TO service_role;
GRANT ALL ON cost_baselines TO service_role;
GRANT ALL ON cost_rate_card TO service_role;
GRANT ALL ON service_inventory TO service_role;
GRANT ALL ON finance_alerts TO service_role;
GRANT ALL ON customer_profiles TO service_role;
GRANT ALL ON customer_events TO service_role;
GRANT ALL ON customer_sessions TO service_role;
GRANT ALL ON customer_preferences TO service_role;
GRANT ALL ON projects TO service_role;
GRANT ALL ON sprints TO service_role;
GRANT ALL ON project_tasks TO service_role;
GRANT ALL ON qa_test_runs TO service_role;
GRANT ALL ON qa_baselines TO service_role;
GRANT ALL ON sla_metrics TO service_role;
GRANT ALL ON issues TO service_role;
GRANT ALL ON issue_comments TO service_role;
GRANT ALL ON sentry_errors TO service_role;
GRANT ALL ON deployments TO service_role;
GRANT ALL ON approval_queue TO service_role;
GRANT ALL ON approval_comments TO service_role;
GRANT ALL ON approval_categories TO service_role;
GRANT ALL ON agent_learnings TO service_role;
GRANT ALL ON learning_feedback TO service_role;
GRANT ALL ON competitors TO service_role;
GRANT ALL ON competitive_alerts TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- DONE. 27 tables created, indexes built, seed data inserted.
-- All IF NOT EXISTS / ON CONFLICT — safe to re-run.
-- ═══════════════════════════════════════════════════════════════
