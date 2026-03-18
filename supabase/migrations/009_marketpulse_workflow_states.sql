-- Workflow state machine for MarketPulse (marketpulse_orders)
ALTER TABLE marketpulse_orders
  ADD COLUMN IF NOT EXISTS workflow_state TEXT DEFAULT 'order_received',
  ADD COLUMN IF NOT EXISTS state_updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state_history JSONB DEFAULT '[]'::jsonb;

-- Index for stuck order detection
CREATE INDEX IF NOT EXISTS idx_marketpulse_workflow_state
  ON marketpulse_orders(workflow_state, state_updated_at)
  WHERE workflow_state NOT IN ('delivered', 'failed_terminal');

-- Backfill existing records
UPDATE marketpulse_orders
  SET workflow_state = 'delivered', state_updated_at = created_at
  WHERE workflow_state = 'order_received' AND status = 'delivered';
