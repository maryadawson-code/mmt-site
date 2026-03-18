-- Migration 016: predictive_signals — anticipatory intelligence
-- Stores predictions about upcoming opportunities, option exercises,
-- recompetes, and budget-driven signals.

CREATE TABLE IF NOT EXISTS predictive_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_type TEXT NOT NULL
    CHECK (prediction_type IN (
      'option_exercise', 'recompete', 'budget_driven', 'pattern_interest'
    )),
  contract_key TEXT,
  prediction TEXT NOT NULL,
  confidence TEXT DEFAULT 'MEDIUM'
    CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  evidence JSONB DEFAULT '{}',
  predicted_date DATE,
  actual_outcome TEXT,
  outcome_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictive_type
  ON predictive_signals(prediction_type, created_at);
CREATE INDEX IF NOT EXISTS idx_predictive_outcome
  ON predictive_signals(actual_outcome)
  WHERE actual_outcome IS NOT NULL;
