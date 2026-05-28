-- ============================================================
-- 20260528193000_opportunity_radar_source_column.sql
--
-- Adds a `source` column to opportunity_radar so eBuy Open RFQs can be
-- distinguished from the default radar scan. Existing rows default to
-- 'radar'; the eBuy scanner stamps 'ebuy_open'.
--
-- Idempotent. Apply via the Supabase SQL Editor — migrations do not
-- self-apply. Apply BEFORE the ebuy-open-radar scanner runs and before
-- the Tracker's ?source= filter is used in production.
-- ============================================================

ALTER TABLE opportunity_radar ADD COLUMN IF NOT EXISTS source text DEFAULT 'radar';
CREATE INDEX IF NOT EXISTS idx_opportunity_radar_source ON opportunity_radar(source);
