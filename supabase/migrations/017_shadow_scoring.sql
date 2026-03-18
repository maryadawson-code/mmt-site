-- Migration 017: shadow_scoring — dual-model consensus columns
-- Stores the shadow model's scorecard and consensus analysis
-- alongside the primary scorecard for quality assurance.

ALTER TABLE mp_scoring_history
  ADD COLUMN IF NOT EXISTS shadow_scorecard JSONB,
  ADD COLUMN IF NOT EXISTS consensus JSONB,
  ADD COLUMN IF NOT EXISTS shadow_model TEXT;
