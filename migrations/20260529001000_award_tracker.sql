-- S-P3: award_tracker — recent federal contract awards (health-IT agencies/NAICS).
--
-- Populated by netlify/functions/award-tracker-background.js from
-- USASpending.gov (no key) and SAM.gov Contract Awards (system key). Entirely
-- separate from opportunity_radar — no shared columns, no shared writer.
--
-- Idempotent. Not yet applied to production (Mary-approved migrations only).
-- The award-tracker function is dormant until AWARD_TRACKER_ENABLED=true, and
-- only writes here once this table exists — apply this migration FIRST, then
-- flip the flag.

CREATE TABLE IF NOT EXISTS award_tracker (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id         text UNIQUE NOT NULL,
  recipient        text,
  agency           text,
  naics            text,
  value            text,
  action_date      text,
  description      text,
  source_url       text,
  contract_vehicle text,
  scan_date        date,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_award_tracker_action_date ON award_tracker (action_date DESC);
CREATE INDEX IF NOT EXISTS idx_award_tracker_agency ON award_tracker (agency);

ALTER TABLE award_tracker ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY award_tracker_service_key_all ON award_tracker
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE award_tracker IS
  'P3 award tracking. Recent federal contract awards from USASpending.gov + SAM.gov Contract Awards, deduped by award_id. Written only by award-tracker-background.js when AWARD_TRACKER_ENABLED=true. Independent of opportunity_radar.';

-- Rollback (do NOT run unless reverting):
-- DROP TABLE IF EXISTS award_tracker;
