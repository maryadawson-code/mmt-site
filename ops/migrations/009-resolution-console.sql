-- ═══════════════════════════════════════
-- 009: Resolution Console — Issues lifecycle, comments, Sentry cache, deployments
-- ═══════════════════════════════════════

-- ISSUES: Unified issue tracker with full lifecycle
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

-- Issue comments (agent + human conversation per issue)
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

-- Sentry error cache
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

-- Deployment log
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

-- Seed known issues
INSERT INTO issues (title, severity, category, source, product, status, root_cause, suggested_fix, fix_complexity, estimated_minutes, affected_files) VALUES
  ('Contract intel display bug — JS sends slug, API expects display name', 'high', 'bug', 'manual', 'site', 'detected', 'The contract detail page JavaScript constructs the API URL using the page slug (e.g. "mhs-genesis-electronic-health-record") but the contract-intel API expects the display name (e.g. "MHS GENESIS (Electronic Health Record)"). The lookup fails silently and the page shows "Intelligence data is being gathered."', 'Add a slug-to-name mapping in the client JS, or modify the API to accept slugs.', 'small', 15, ARRAY['js/contract-detail.js', 'netlify/functions/contract-intel-api.js']),
  ('No automated tests — zero coverage', 'high', 'tech-debt', 'manual', 'mmt', 'detected', 'No test framework configured. No test files exist. Every deploy is untested.', 'Add Jest or Vitest. Start with unit tests for cost-tracker, customer-sync, email-templates.', 'large', 480, NULL),
  ('is_mfa_enabled() function breaks if called', 'high', 'bug', 'manual', 'missionpulse', 'detected', 'The database function is_mfa_enabled() references profiles.mfa_enabled column which does not exist.', 'Drop the function until MFA is implemented.', 'trivial', 10, NULL),
  ('No customer dashboard — users can''t see order history', 'medium', 'tech-debt', 'manual', 'mmt', 'detected', 'Customers have no way to view past scores, download previous reports, or check order status.', 'Build /my-reports page: email-based auth (magic link), list of past orders with download links.', 'medium', 240, NULL),
  ('MarketPulse delivery retry missing', 'medium', 'tech-debt', 'manual', 'marketpulse', 'detected', 'When PDF/email delivery fails, the entire order is marked as error. No way to retry just the delivery step.', 'Add a retry-delivery endpoint that regenerates PDF from existing HTML and re-sends email.', 'small', 60, ARRAY['netlify/functions/generate-tactical-brief-background.js']),
  ('Domain registrars unknown — renewal risk', 'high', 'security', 'manual', 'infra', 'detected', 'Neither missionmeetstech.com nor missionpulse.ai has a confirmed registrar or renewal date.', 'Check WHOIS for both domains. Log registrar, renewal date, and auto-renew status.', 'trivial', 15, NULL),
  ('API keys missing from LaunchAgent plist', 'medium', 'bug', 'agent', 'ops', 'detected', 'BRAVE_API_KEY and PERPLEXITY_API_KEY are not in the OpenClaw gateway LaunchAgent plist.', 'Add ALL API keys from .env to ~/Library/LaunchAgents/ai.openclaw.gateway.plist.', 'trivial', 5, ARRAY['~/Library/LaunchAgents/ai.openclaw.gateway.plist'])
ON CONFLICT DO NOTHING;
