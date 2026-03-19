-- ops_ledger: Centralized operations event table with failure taxonomy
-- Event types: MODEL_FAILURE, HARNESS_FAILURE, CONFIG_FAILURE, INFRA_FAILURE,
--              DATA_FAILURE, OPERATOR_FAILURE, QUALITY_FAILURE, DELIVERY_FAILURE
-- Severity: info, warn, error, critical

CREATE TABLE IF NOT EXISTS ops_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  event_type text NOT NULL,
  source_function text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  signature text,
  affected_entity text,
  details jsonb DEFAULT '{}',
  resolution text,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ops_ledger_created ON ops_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_ledger_severity ON ops_ledger(severity) WHERE severity IN ('error', 'critical');
CREATE INDEX IF NOT EXISTS idx_ops_ledger_type ON ops_ledger(event_type);
