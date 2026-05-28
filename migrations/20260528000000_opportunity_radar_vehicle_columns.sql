-- ============================================================
-- 20260528000000_opportunity_radar_vehicle_columns.sql
--
-- IDEMPOTENT — safe to apply against production with no behavior change
-- to existing rows. Adds the two columns sb-vehicle-radar-background.js
-- writes on every classification but that were never present in the
-- production opportunity_radar table.
--
-- ROOT CAUSE (diagnosed 2026-05-28): sb-vehicle-radar-background.js
-- builds each opportunity_radar row with `vehicle_confidence` and
-- `vehicle_reasoning`. PostgREST rejects the ENTIRE row with PGRST204
-- ("Could not find the 'vehicle_confidence' column ... in the schema
-- cache") because neither column exists on the table. Every Phase 1
-- upsert AND every Phase 2 update failed — errors=96 per scan, 0 rows
-- written — so the SB Vehicle Radar has been frozen at its last good
-- scan (2026-03-03) for ~85 days while the cron fired daily and logged
-- SB_VEHICLE_SCAN_EMPTY.
--
-- Both columns are CONSUMED downstream:
--   * netlify/functions/opportunity-feed.js orders + filters by
--     vehicle_confidence.
--   * js/contract-tracker.js renders a confidence badge and the
--     vehicle_reasoning sentence.
-- So the correct fix is to add the columns, not to stop writing them.
--
-- Same failure shape as the historical `company_name` incident
-- (see project memory): one unknown column silently kills every write.
--
-- Safe to apply repeatedly. Adds nullable columns with no default, so
-- no table rewrite and no lock of consequence. Does not modify any
-- existing rows.
-- ============================================================

ALTER TABLE public.opportunity_radar
  ADD COLUMN IF NOT EXISTS vehicle_confidence integer;

ALTER TABLE public.opportunity_radar
  ADD COLUMN IF NOT EXISTS vehicle_reasoning text;

COMMENT ON COLUMN public.opportunity_radar.vehicle_confidence IS
  'SB Vehicle Radar: 0-100 confidence that the award maps to contract_vehicle. Written by sb-vehicle-radar-background.js. Consumed by opportunity-feed.js (sort/filter) and contract-tracker.js (badge).';

COMMENT ON COLUMN public.opportunity_radar.vehicle_reasoning IS
  'SB Vehicle Radar: one-sentence rationale for the contract_vehicle classification. Written by sb-vehicle-radar-background.js. Rendered by contract-tracker.js.';

-- Optional sanity check (read-only): confirms both columns now resolve.
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'opportunity_radar'
--     AND column_name IN ('vehicle_confidence','vehicle_reasoning');
