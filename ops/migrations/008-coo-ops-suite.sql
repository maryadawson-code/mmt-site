-- 008-coo-ops-suite.sql — COO Operations Suite tables
-- Tables: service_inventory, finance_alerts, customer_profiles, customer_events,
--         projects, sprints, project_tasks, qa_test_runs, qa_baselines, sla_metrics,
--         issues, issue_comments, sentry_errors, deployments
-- Cost tables (cost_events, cost_daily_rollup, cost_baselines, cost_rate_card, cost_alerts)
-- were created in 007-cost-intelligence.sql

-- ============================================================
-- SERVICE INVENTORY
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

-- Seed all services
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
-- FINANCE ALERTS (broader than cost_alerts — covers services too)
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

-- Seed projects
INSERT INTO projects (name, description, platform, status, owner, priority, start_date) VALUES
  ('MMT Launch Stabilization', 'Post-launch fixes, QA, cost optimization', 'mmt', 'active', 'mary', 'critical', '2026-03-19'),
  ('MissionPulse GTM', 'Revenue blockers: Stripe, AI, pricing', 'missionpulse', 'active', 'coo', 'critical', NULL),
  ('Newsletter Operations', 'Tue/Fri pipeline', 'mmt', 'active', 'ops-editorial', 'high', '2026-03-19'),
  ('Agent Fleet Buildout', 'All operational agents', 'ops', 'active', 'mary', 'high', '2026-03-19'),
  ('Cost Optimization', 'API costs + service inventory', 'cross-platform', 'active', 'ops-finance', 'high', '2026-03-19')
ON CONFLICT DO NOTHING;

-- Seed completed tasks
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, completed_at) VALUES
  ('ProposalPulse A++ overhaul', 'done', 'critical', 'ops-code', 'feature', 'mmt', '2026-03-19T17:00:00Z'),
  ('MarketPulse A++ overhaul', 'done', 'critical', 'ops-code', 'feature', 'mmt', '2026-03-19T17:00:00Z'),
  ('Site QA 21 fixes', 'done', 'critical', 'ops-code', 'bug', 'mmt', '2026-03-19T19:30:00Z'),
  ('Dashboard restructure', 'done', 'high', 'ops-code', 'feature', 'mmt', '2026-03-19T20:00:00Z'),
  ('Agent bridge + 7 tools', 'done', 'high', 'ops-code', 'feature', 'ops', '2026-03-19T19:00:00Z'),
  ('6-agent fleet', 'done', 'high', 'ops-code', 'feature', 'ops', '2026-03-19T20:15:00Z'),
  ('Contract intel seeding', 'done', 'high', 'ops-editorial', 'task', 'mmt', '2026-03-19T19:45:00Z')
ON CONFLICT DO NOTHING;

-- Seed backlog
INSERT INTO project_tasks (title, status, priority, assignee, type, platform, description) VALUES
  ('Fix contract intel display', 'ready', 'high', 'ops-code', 'bug', 'mmt', 'JS sends slug, API expects display name'),
  ('Customer portal', 'backlog', 'high', 'ops-code', 'feature', 'mmt', 'Order history + report downloads'),
  ('E2E test suite', 'backlog', 'high', 'ops-code', 'task', 'mmt', 'Zero test coverage'),
  ('MissionPulse Stripe', 'backlog', 'critical', 'coo', 'feature', 'missionpulse', 'Revenue = $0 until this ships'),
  ('NanoClaw migration', 'backlog', 'normal', 'ops-code', 'task', 'ops', 'Target Mar 22. Wait for stability.')
ON CONFLICT DO NOTHING;

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
-- ISSUES / SENTRY / DEPLOYMENTS
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
  sentry_url text,
  metadata jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status) WHERE status NOT IN ('closed','wont-fix');
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity, created_at DESC) WHERE status NOT IN ('closed','wont-fix');

CREATE TABLE IF NOT EXISTS issue_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  issue_id uuid NOT NULL REFERENCES issues(id),
  author text NOT NULL,
  author_type text NOT NULL DEFAULT 'agent',
  content text NOT NULL,
  code_diff text,
  code_file text,
  action text,
  metadata jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_issue_comments ON issue_comments(issue_id, created_at);

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
  stack_trace text,
  affected_function text,
  affected_file text,
  linked_issue_id uuid REFERENCES issues(id),
  is_resolved boolean DEFAULT false,
  is_ignored boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS deployments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  branch text NOT NULL,
  commit_sha text,
  commit_message text,
  deploy_type text DEFAULT 'production',
  triggered_by text,
  netlify_deploy_id text,
  status text DEFAULT 'pending',
  homepage_status integer,
  homepage_size integer,
  fixes_issues uuid[],
  metadata jsonb DEFAULT '{}'
);

-- Seed known issues
INSERT INTO issues (title, severity, category, source, product, status, root_cause, suggested_fix, affected_files) VALUES
  ('Contract intel display bug', 'high', 'bug', 'manual', 'site', 'detected', 'JS sends slug, API expects display name', 'Add slug-to-name mapping', ARRAY['js/contract-detail.js']),
  ('No automated tests', 'high', 'tech-debt', 'manual', 'mmt', 'detected', 'No test framework', 'Add Vitest + unit tests', NULL),
  ('Domain registrars unknown', 'high', 'security', 'manual', 'infra', 'detected', 'Neither domain confirmed', 'Check WHOIS, transfer to Cloudflare', NULL),
  ('API keys missing from plist', 'medium', 'bug', 'agent', 'ops', 'detected', 'BRAVE + PERPLEXITY not in LaunchAgent', 'Add all keys to plist, reload', NULL)
ON CONFLICT DO NOTHING;

-- Update rate card with any missing entries
INSERT INTO cost_rate_card (provider, model, input_cost_per_1k_cents, output_cost_per_1k_cents, notes) VALUES
  ('anthropic', 'claude-sonnet-4-20250514', 0.3, 1.5, 'Sonnet — primary scoring'),
  ('anthropic', 'claude-haiku-3.5', 0.08, 0.4, 'Haiku — shadow scoring'),
  ('anthropic', 'claude-opus-4', 1.5, 7.5, 'Opus — editorial')
ON CONFLICT (provider, model) DO NOTHING;

INSERT INTO cost_rate_card (provider, model, per_call_cost_cents, notes) VALUES
  ('perplexity', 'sonar', 0.5, '$5/1000 searches'),
  ('perplexity', 'sonar-pro', 0.5, '$5/1000 searches')
ON CONFLICT (provider, model) DO NOTHING;

INSERT INTO cost_rate_card (provider, model, per_email_cost_cents, notes) VALUES
  ('resend', 'transactional', 0.0, 'Free 3000/mo then $1/1000')
ON CONFLICT (provider, model) DO NOTHING;

-- RLS + grants for new tables
ALTER TABLE service_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY;
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

GRANT ALL ON service_inventory TO service_role;
GRANT ALL ON finance_alerts TO service_role;
GRANT ALL ON customer_profiles TO service_role;
GRANT ALL ON customer_events TO service_role;
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
