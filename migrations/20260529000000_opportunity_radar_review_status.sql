-- S-P2: review queue for the Opportunity Radar.
--
-- Low-confidence radar items (relevance < 50) are routed to review_status
-- 'needs_review' instead of being dropped, so nothing the scan surfaced
-- silently vanishes. The public feed (opportunity-feed.js) hides needs_review
-- rows unless ?include_review=1.
--
-- Idempotent. DEFAULT 'published' so every existing row stays visible.
--
-- APPLICATION ORDER (important — schema law): apply this migration FIRST, then
-- set RADAR_REVIEW_QUEUE=true. The writer (opportunity-radar-background.js) and
-- the feed only reference review_status when RADAR_REVIEW_QUEUE=true; flipping
-- the flag before this column exists would kill every radar write / 500 the
-- feed. Not yet applied to production (Mary-approved migrations only).

ALTER TABLE opportunity_radar
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'published';

CREATE INDEX IF NOT EXISTS idx_opportunity_radar_review_status
  ON opportunity_radar (review_status);

COMMENT ON COLUMN opportunity_radar.review_status IS
  'P2 review queue: published | needs_review. needs_review = low-confidence (<50 relevance) items hidden from the public feed unless ?include_review=1. Written/read only when RADAR_REVIEW_QUEUE=true.';

-- Rollback (do NOT run unless reverting):
-- DROP INDEX IF EXISTS idx_opportunity_radar_review_status;
-- ALTER TABLE opportunity_radar DROP COLUMN IF EXISTS review_status;
