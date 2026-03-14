-- Migration 004: Add top_fix column to mp_scoring_history
-- markError() writes verdict="ERROR" + top_fix=errorMessage
-- Scorecard updates write top_fix=scorecard.top_fix
-- score-status reads top_fix to display error to user
-- Without this column ALL DB updates fail silently and row stays "processing"
ALTER TABLE mp_scoring_history
  ADD COLUMN IF NOT EXISTS top_fix TEXT;
