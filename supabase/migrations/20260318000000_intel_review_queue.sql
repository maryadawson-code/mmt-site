-- Intel Review Queue: holds AI-generated data that needs human review
-- before publication (low confidence, value changes >20%, etc.)
CREATE TABLE IF NOT EXISTS intel_review_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  proposed_value TEXT,
  current_value TEXT,
  confidence TEXT CHECK (confidence IN ('LOW', 'UNVERIFIED')),
  source TEXT,
  source_url TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed BOOLEAN DEFAULT FALSE,
  review_action TEXT CHECK (review_action IN ('approved', 'rejected', 'corrected')),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_review_queue_contract ON intel_review_queue(contract_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_pending ON intel_review_queue(reviewed, created_at) WHERE reviewed = FALSE;
