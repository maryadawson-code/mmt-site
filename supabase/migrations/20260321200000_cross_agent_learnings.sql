-- Cross-Agent Learning Loop — Schema Migration
-- Extends agent_learnings for cross-agent knowledge sharing
-- Adds learning_sync_log for tracking agent sync state

-- === 1. Extend agent_learnings table ===

-- applies_to: array of agent IDs this learning is relevant to (or ["all"])
ALTER TABLE agent_learnings ADD COLUMN IF NOT EXISTS applies_to TEXT[] DEFAULT ARRAY['all'];

-- source_agent: which agent/system created this learning (distinct from "agent" which is the owning agent)
ALTER TABLE agent_learnings ADD COLUMN IF NOT EXISTS source_agent TEXT DEFAULT 'unknown';

-- verified: has a human confirmed this learning
ALTER TABLE agent_learnings ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- supersedes: ID of a prior learning this replaces
ALTER TABLE agent_learnings ADD COLUMN IF NOT EXISTS supersedes UUID REFERENCES agent_learnings(id) ON DELETE SET NULL;

-- Backfill: set source_agent = agent for existing rows where source_agent is default
UPDATE agent_learnings SET source_agent = agent WHERE source_agent = 'unknown' AND agent IS NOT NULL;

-- Backfill: set applies_to = ARRAY[agent] for agent-specific learnings (non-generic)
-- Leave as ['all'] for learnings that don't target a specific agent

-- Index for applies_to filtering (GIN for array contains)
CREATE INDEX IF NOT EXISTS idx_agent_learnings_applies_to ON agent_learnings USING GIN (applies_to);

-- Index for supersedes chain lookups
CREATE INDEX IF NOT EXISTS idx_agent_learnings_supersedes ON agent_learnings (supersedes) WHERE supersedes IS NOT NULL;

-- Index for verified filter
CREATE INDEX IF NOT EXISTS idx_agent_learnings_verified ON agent_learnings (verified) WHERE verified = true;


-- === 2. Create learning_sync_log table ===

CREATE TABLE IF NOT EXISTS learning_sync_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id TEXT NOT NULL,
  sync_direction TEXT NOT NULL CHECK (sync_direction IN ('export', 'import')),
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  learnings_synced INTEGER NOT NULL DEFAULT 0,
  sync_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast agent + direction lookups
CREATE INDEX IF NOT EXISTS idx_learning_sync_log_agent ON learning_sync_log (agent_id, sync_direction);

-- Enable RLS on both tables
ALTER TABLE learning_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS policy: service_role can do everything (matches agent-bridge auth pattern)
-- No anon access — all access goes through authenticated Netlify functions
CREATE POLICY "Service role full access on learning_sync_log"
  ON learning_sync_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Verify agent_learnings has RLS enabled (should already be set)
ALTER TABLE agent_learnings ENABLE ROW LEVEL SECURITY;
