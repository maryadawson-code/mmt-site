-- Intel Accuracy Log: tracks prediction accuracy for self-learning
-- confidence calibration. Feeds source_reliability updates.
CREATE TABLE IF NOT EXISTS intel_accuracy_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  predicted_value TEXT,
  actual_value TEXT,
  was_correct BOOLEAN,
  confidence_at_prediction TEXT,
  source_at_prediction TEXT,
  correction_source TEXT,
  logged_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accuracy_contract ON intel_accuracy_log(contract_id, logged_at);
