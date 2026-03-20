-- ═══════════════════════════════════════
-- 010-hitl-framework.sql
-- Universal Human-in-the-Loop approval system
-- Every agent action that needs human review goes here
-- ═══════════════════════════════════════

-- Approval Queue: central table for all human decisions
CREATE TABLE IF NOT EXISTS approval_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- What needs approval
  title text NOT NULL,
  description text,
  category text NOT NULL,

  -- Who decides
  target_role text NOT NULL,       -- 'cto', 'coo', 'editor', 'customer', 'partner'
  target_email text,               -- for customer/partner: which specific user

  -- Who submitted
  submitted_by text NOT NULL,      -- agent ID or human name
  submitted_by_type text DEFAULT 'agent',  -- 'agent', 'human', 'system'

  -- The payload (what the human reviews)
  payload_type text NOT NULL,      -- 'content', 'code', 'spend', 'config', 'outreach', 'report', 'data'
  payload jsonb NOT NULL DEFAULT '{}',
  context jsonb DEFAULT '{}',      -- background info, agent reasoning

  -- Preview (rendered version for display)
  preview_html text,

  -- Decision
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'modified', 'expired', 'auto-approved'
  decision_by text,
  decision_at timestamptz,
  decision_notes text,
  modifications jsonb,             -- if human modified payload before approving

  -- Execution
  executed boolean DEFAULT false,
  executed_at timestamptz,
  execution_result text,
  execution_error text,

  -- Expiry
  expires_at timestamptz,

  -- Links
  related_issue_id uuid,
  related_task_id uuid,
  related_order_id uuid,

  -- Conversation
  comment_count integer DEFAULT 0,

  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_approval_pending ON approval_queue(target_role, status, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approval_customer ON approval_queue(target_email, status) WHERE target_role = 'customer';
CREATE INDEX IF NOT EXISTS idx_approval_recent ON approval_queue(created_at DESC);

-- Approval comments (conversation thread per approval item)
CREATE TABLE IF NOT EXISTS approval_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  approval_id uuid NOT NULL REFERENCES approval_queue(id),

  author text NOT NULL,
  author_type text NOT NULL DEFAULT 'human',  -- 'agent', 'human', 'system'

  content text NOT NULL,

  -- Optional attachments
  attachment_type text,           -- 'diff', 'preview', 'data', 'link'
  attachment_data text,

  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_approval_comments ON approval_comments(approval_id, created_at);

-- Category Registry: what each role approves
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

INSERT INTO approval_categories (category, target_role, display_name, description, icon, expiry_hours, requires_preview, sort_order) VALUES
  -- CTO approvals
  ('deploy', 'cto', 'Deploy to Production', 'Code changes ready to deploy', '🚀', 24, true, 10),
  ('architecture', 'cto', 'Architecture Decision', 'Infrastructure or architecture changes', '🏗️', 72, false, 20),
  ('schema-change', 'cto', 'Database Schema Change', 'New tables, columns, or index changes', '🗄️', 24, true, 15),
  ('dependency', 'cto', 'New Dependency', 'Adding a new npm package or API integration', '📦', 48, false, 25),

  -- COO approvals
  ('spend-approval', 'coo', 'Spend Approval', 'Purchases, subscriptions, or budget changes over $50', '💰', 24, false, 10),
  ('service-change', 'coo', 'Service Change', 'Cancel, upgrade, or downgrade a service subscription', '🔄', 48, false, 15),
  ('customer-outreach', 'coo', 'Customer Outreach', 'Email or message to send to a customer', '📧', 24, true, 20),
  ('sprint-change', 'coo', 'Sprint/Priority Change', 'Reorder backlog, change sprint scope, reassign work', '📋', 48, false, 25),
  ('hire-contract', 'coo', 'Hiring/Contract Decision', 'New contractor, freelancer, or vendor engagement', '🤝', 72, false, 30),
  ('process-change', 'coo', 'Process Change', 'New workflow, automation rule, or operational procedure', '⚙️', 72, false, 35),

  -- Editor approvals
  ('newsletter-draft', 'editor', 'Newsletter Draft', 'Full newsletter ready for review and publish', '📰', 12, true, 10),
  ('linkedin-post', 'editor', 'LinkedIn Post', 'LinkedIn post draft ready for review', '💼', 6, true, 15),
  ('research-brief', 'editor', 'Research Brief', 'Completed research brief for review', '🔍', 24, true, 20),
  ('topic-pitch', 'editor', 'Topic Pitch', 'Agent recommending a newsletter topic with reasoning', '💡', 48, false, 25),
  ('editorial-correction', 'editor', 'Editorial Correction', 'Agent flagging a factual issue in published content', '⚠️', 12, false, 12),
  ('glossary-entry', 'editor', 'New Glossary Entry', 'Proposed new term for the glossary', '📖', 72, true, 30),

  -- Customer approvals/interactions
  ('report-review', 'customer', 'Report Ready for Review', 'Your MarketPulse or ProposalPulse report is ready', NULL, 168, true, 10),
  ('score-dispute', 'customer', 'Score Dispute', 'Customer disputes a ProposalPulse score', NULL, 72, false, 20),
  ('rerun-request', 'customer', 'Re-run Available', 'An improved version of your report can be generated', NULL, 168, false, 15),
  ('feedback-request', 'customer', 'Feedback Request', 'How was your experience? Help us improve.', NULL, 336, false, 25),
  ('upsell-offer', 'customer', 'Upgrade Recommendation', 'Based on your usage, you might benefit from...', NULL, 336, false, 30)
ON CONFLICT (category) DO NOTHING;

-- Customer Portal: auth sessions
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

-- Customer notification preferences
CREATE TABLE IF NOT EXISTS customer_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,

  notify_report_ready boolean DEFAULT true,
  notify_product_updates boolean DEFAULT true,
  notify_feedback_requests boolean DEFAULT true,
  notify_upsell boolean DEFAULT false,

  preferred_format text DEFAULT 'email',  -- 'email', 'sms', 'both'

  metadata jsonb DEFAULT '{}'
);
