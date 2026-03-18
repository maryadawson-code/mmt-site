-- Add failure classification to ops_events
ALTER TABLE ops_events
  ADD COLUMN IF NOT EXISTS failure_class TEXT
  CHECK (failure_class IN (
    'MODEL_FAILURE',
    'HARNESS_FAILURE',
    'CONFIG_FAILURE',
    'INFRA_FAILURE',
    'DATA_FAILURE',
    'OPERATOR_FAILURE'
  ));

CREATE INDEX IF NOT EXISTS idx_ops_events_failure_class
  ON ops_events(failure_class, created_at)
  WHERE failure_class IS NOT NULL;
