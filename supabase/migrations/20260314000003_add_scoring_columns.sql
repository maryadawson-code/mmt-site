-- Migration 003: Add missing columns to mp_scoring_history
-- Background function tries to update verdict, overall_grade, model_used
-- but these columns were not in the original CREATE TABLE.
-- Without these columns Supabase rejects the UPDATE and function crashes silently.

ALTER TABLE mp_scoring_history
  ADD COLUMN IF NOT EXISTS verdict TEXT,
  ADD COLUMN IF NOT EXISTS overall_grade TEXT,
  ADD COLUMN IF NOT EXISTS model_used TEXT;
