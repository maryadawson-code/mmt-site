-- Migration 014: Cost tracking and timing metrics on ops_events
-- Enables per-function cost analysis and performance monitoring.

ALTER TABLE ops_events
  ADD COLUMN IF NOT EXISTS cost_estimate NUMERIC,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
