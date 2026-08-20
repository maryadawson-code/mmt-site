-- Lifecycle column for the Opportunity Radar dead-link sweep.
--
-- opportunity-radar-url-recheck.js HEADs each radar row's source_url and marks
-- rows whose notice is gone (404 / 410 / dead DNS) as status='archived';
-- lib/radar-hygiene.js isArchived() then drops them from the subscriber feed.
--
-- Both sides shipped referencing opportunity_radar.status, but NO migration ever
-- created that column. Discovered live 2026-08-20: every url-recheck run failed
-- with `column opportunity_radar.status does not exist` (returned HTTP 500 while
-- the scheduled-fn wrapper still logged *_RUN_OK / severity info, so it was
-- invisible in ops for its entire life). Net effect: the dead-link sweep has
-- never archived a single row, and archived-filtering on read is inert
-- (filtered_out.archived is always 0 on /opportunity-feed).
--
-- This is NOT review_status. review_status is the P2 REVIEW QUEUE
-- (published | needs_review, migration 20260529000000). status is the
-- LIFECYCLE (active | archived). They are independent: a row can be
-- review_status='published' and status='archived'. Do not conflate them.
--
-- Idempotent. DEFAULT 'active' so every existing row stays visible — archiving
-- is opt-in per row and only ever written by the recheck sweep after a real
-- HEAD/GET check. Never blanket-archive on a schema change.
--
-- Not yet applied to production (Mary-approved migrations only).

ALTER TABLE opportunity_radar
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_opportunity_radar_status
  ON opportunity_radar (status);

COMMENT ON COLUMN opportunity_radar.status IS
  'Lifecycle: active | archived. archived = source_url confirmed dead (404/410/DNS) by opportunity-radar-url-recheck.js; hidden from the subscriber feed by lib/radar-hygiene.js. Distinct from review_status (P2 review queue).';

-- Rollback (do NOT run unless reverting):
-- DROP INDEX IF EXISTS idx_opportunity_radar_status;
-- ALTER TABLE opportunity_radar DROP COLUMN IF EXISTS status;
