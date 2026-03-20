-- ═══════════════════════════════════════
-- 014 — Dev Workflow Guardrails
-- Active sessions, deploy queue, file locks, conflict detection, protected files
-- ═══════════════════════════════════════

-- ACTIVE SESSIONS (who's working right now)
CREATE TABLE IF NOT EXISTS dev_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Who
  user_name text NOT NULL,
  user_type text NOT NULL DEFAULT 'human',
  user_email text,

  -- What
  repo text NOT NULL,
  branch text,
  description text,

  -- Files being touched (for conflict detection)
  files_touched text[] DEFAULT '{}',
  directories_touched text[] DEFAULT '{}',

  -- Status
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  last_heartbeat_at timestamptz DEFAULT now(),
  completed_at timestamptz,

  -- Lock level
  lock_level text DEFAULT 'warn',
  lock_reason text,

  -- Deploy info
  deploy_id uuid,
  deploy_status text,

  metadata jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_dev_sessions_active ON dev_sessions(repo, status) WHERE status IN ('active', 'paused', 'deploying');
CREATE INDEX IF NOT EXISTS idx_dev_sessions_user ON dev_sessions(user_name, status) WHERE status = 'active';

-- DEPLOY QUEUE (one at a time)
CREATE TABLE IF NOT EXISTS deploy_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  requested_by text NOT NULL,
  requested_by_type text DEFAULT 'human',
  session_id uuid REFERENCES dev_sessions(id),

  repo text NOT NULL,
  branch text NOT NULL,
  commit_sha text,
  commit_message text,
  deploy_type text DEFAULT 'production',

  status text NOT NULL DEFAULT 'queued',
  position integer,

  pre_checks jsonb DEFAULT '{}',
  pre_check_passed boolean,

  started_at timestamptz,
  completed_at timestamptz,
  netlify_deploy_id text,
  homepage_status integer,
  homepage_size integer,

  post_checks jsonb DEFAULT '{}',
  post_check_passed boolean,

  rolled_back boolean DEFAULT false,
  rollback_reason text,
  rollback_at timestamptz,
  previous_deploy_id text,

  metadata jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_deploy_queue_pending ON deploy_queue(created_at) WHERE status IN ('queued', 'pre-check', 'deploying', 'post-check');

-- FILE LOCKS (explicit file-level locks)
CREATE TABLE IF NOT EXISTS file_locks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  repo text NOT NULL,
  file_path text NOT NULL,

  locked_by text NOT NULL,
  session_id uuid REFERENCES dev_sessions(id),
  lock_type text DEFAULT 'advisory',
  reason text,

  released_at timestamptz,

  UNIQUE(repo, file_path, locked_by)
);
CREATE INDEX IF NOT EXISTS idx_file_locks_active ON file_locks(repo, file_path) WHERE released_at IS NULL;

-- CONFLICT LOG (when conflicts are detected)
CREATE TABLE IF NOT EXISTS conflict_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  repo text NOT NULL,
  file_path text NOT NULL,

  session_a uuid REFERENCES dev_sessions(id),
  user_a text NOT NULL,
  session_b uuid REFERENCES dev_sessions(id),
  user_b text NOT NULL,

  conflict_type text NOT NULL,
  severity text DEFAULT 'warning',

  resolved boolean DEFAULT false,
  resolved_by text,
  resolved_at timestamptz,
  resolution text,

  metadata jsonb DEFAULT '{}'
);

-- PROTECTED FILES (always require review)
CREATE TABLE IF NOT EXISTS protected_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  repo text NOT NULL,
  file_pattern text NOT NULL,
  protection_level text DEFAULT 'review',
  reason text,
  created_by text,
  UNIQUE(repo, file_pattern)
);

-- Seed protected files
INSERT INTO protected_files (repo, file_pattern, protection_level, reason, created_by) VALUES
  ('mmt-site', 'netlify/functions/score-deck-background.js', 'review', 'ProposalPulse scoring engine — every customer depends on this', 'system'),
  ('mmt-site', 'netlify/functions/generate-tactical-brief-background.js', 'review', 'MarketPulse engine — every brief customer depends on this', 'system'),
  ('mmt-site', 'netlify/functions/stripe-webhook.js', 'admin-only', 'Payment processing — break this = no revenue', 'system'),
  ('mmt-site', 'netlify/functions/gold-team-review-background.js', 'review', 'Red Team review engine', 'system'),
  ('mmt-site', 'netlify/functions/lib/email-templates.js', 'review', 'All customer-facing emails', 'system'),
  ('mmt-site', 'build.js', 'review', 'Static site generator — broken build = no pages', 'system'),
  ('mmt-site', '_redirects', 'review', 'URL routing — wrong redirect = lost customers', 'system'),
  ('mmt-site', 'netlify.toml', 'review', 'Deploy config + scheduled functions', 'system'),
  ('mmt-site', 'netlify/functions/agent-bridge.js', 'review', 'Agent communication layer', 'system'),
  ('mmt-site', 'netlify/functions/command-center-api.js', 'review', 'Dashboard API', 'system'),
  ('mmt-site', 'netlify/functions/dashboard-auth.js', 'admin-only', 'Auth system — security critical', 'system')
ON CONFLICT (repo, file_pattern) DO NOTHING;
