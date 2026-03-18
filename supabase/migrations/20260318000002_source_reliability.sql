-- Source Reliability: tracks per-domain accuracy for confidence weighting.
-- Contract Events: audit trail for field-level changes detected by pipeline.
CREATE TABLE IF NOT EXISTS source_reliability (
  source_domain TEXT PRIMARY KEY,
  total_predictions INT DEFAULT 0,
  correct_predictions INT DEFAULT 0,
  reliability_score DECIMAL(3,2) DEFAULT 0.50,
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- Seed initial reliability scores based on source authority
INSERT INTO source_reliability (source_domain, reliability_score, total_predictions, correct_predictions) VALUES
  ('sam.gov', 0.95, 100, 95),
  ('usaspending.gov', 0.95, 100, 95),
  ('health.mil', 0.90, 50, 45),
  ('va.gov', 0.90, 50, 45),
  ('fehrm.gov', 0.90, 20, 18),
  ('govtribe.com', 0.80, 50, 40),
  ('orangeslices.ai', 0.75, 40, 30),
  ('govconwire.com', 0.75, 40, 30),
  ('highergov.com', 0.75, 40, 30),
  ('meritalk.com', 0.70, 30, 21),
  ('nextgov.com', 0.70, 30, 21),
  ('fedscoop.com', 0.65, 20, 13),
  ('washingtontechnology.com', 0.65, 20, 13),
  ('ai-inference', 0.40, 10, 4)
ON CONFLICT (source_domain) DO NOTHING;

CREATE TABLE IF NOT EXISTS contract_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id TEXT NOT NULL,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT,
  confidence TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contract_events_id ON contract_events(contract_id, detected_at);
