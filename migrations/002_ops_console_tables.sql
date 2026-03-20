-- Migration 002: Ops Console tables and columns
-- Date: 2026-03-20

-- 1. Agent approvals table (Feature 2)
CREATE TABLE IF NOT EXISTS agent_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  action_detail TEXT,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  status TEXT CHECK (status IN ('pending', 'approved', 'denied', 'expired')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  task_id UUID,
  context JSONB
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON agent_approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_agent ON agent_approvals(agent_id);

-- 2. Task queue additions (Feature 3)
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS status_detail TEXT;

-- 3. Signal triage additions (Feature 5)
ALTER TABLE intel_signals ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'new' CHECK (triage_status IN ('new', 'newsletter', 'dismissed', 'pinned'));
ALTER TABLE intel_signals ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;
