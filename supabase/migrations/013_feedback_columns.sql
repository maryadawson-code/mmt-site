-- Migration 013: Add direct feedback columns to order tables
-- Supplements the JSONB _feedback in scores column with queryable columns.

ALTER TABLE marketpulse_orders
  ADD COLUMN IF NOT EXISTS feedback_rating INTEGER,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

ALTER TABLE mp_scoring_history
  ADD COLUMN IF NOT EXISTS feedback_rating INTEGER,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;
