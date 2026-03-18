-- Workflow state machine for ProposalPulse (mp_scoring_history)
ALTER TABLE mp_scoring_history
  ADD COLUMN IF NOT EXISTS workflow_state TEXT DEFAULT 'upload_received',
  ADD COLUMN IF NOT EXISTS state_updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state_history JSONB DEFAULT '[]'::jsonb;

-- Index for stuck order detection
CREATE INDEX IF NOT EXISTS idx_scoring_workflow_state
  ON mp_scoring_history(workflow_state, state_updated_at)
  WHERE workflow_state NOT IN ('delivered', 'failed_terminal');

-- Backfill existing records
UPDATE mp_scoring_history
  SET workflow_state = 'delivered', state_updated_at = created_at
  WHERE workflow_state = 'upload_received' AND status IS NOT NULL;
