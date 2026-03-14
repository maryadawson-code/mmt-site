-- Migration 005: Add remaining columns needed by score-deck-background.js
-- The UPDATE at line 411 writes all these fields. Missing columns cause silent failure.
ALTER TABLE mp_scoring_history
  ADD COLUMN IF NOT EXISTS avg_score NUMERIC,
  ADD COLUMN IF NOT EXISTS red_flags JSONB,
  ADD COLUMN IF NOT EXISTS tokens_input INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_output INTEGER;
