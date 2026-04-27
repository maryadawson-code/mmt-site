-- ============================================================
-- 010_subscriber_context_alignment.sql
--
-- Pursuit Score company alignment fields.
--
-- The Pursuit Score engine reads these to score opportunity *fit
-- against the subscriber's company*, not as a generic market signal.
-- Without these, every score is a generic preliminary read and the
-- engine deliberately refuses to issue a "no-bid."
--
-- Triggered by: 2026-04-27 incident where a clean opportunity (VA
-- Infrastructure Operations Franchise Fund Support Services) returned
-- NO-BID purely because USASpending and Congress.gov returned thin
-- data — with no company profile to anchor the read.
-- ============================================================

ALTER TABLE subscriber_context
  ADD COLUMN IF NOT EXISTS target_agencies      text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS capabilities         text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS naics_codes          text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS psc_codes            text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS past_performance     jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clearance_levels     text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS compliance_posture   text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS geography            text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS no_go_criteria       text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS capture_priorities   text[]  DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN subscriber_context.target_agencies     IS 'Agencies the company actively pursues. Boosts company-fit score when an opp matches.';
COMMENT ON COLUMN subscriber_context.capabilities        IS 'Service lines / technical capabilities (e.g., "EHR modernization", "data governance"). Token-matched against the opp keyword.';
COMMENT ON COLUMN subscriber_context.naics_codes         IS 'NAICS the company is registered under (e.g., 541512). Used for hard-eligibility check against the opp NAICS.';
COMMENT ON COLUMN subscriber_context.psc_codes           IS 'PSC/FSC codes the company supports.';
COMMENT ON COLUMN subscriber_context.past_performance    IS 'JSONB array of relevant past performance entries: { customer, scope, value, period, role }.';
COMMENT ON COLUMN subscriber_context.clearance_levels    IS 'Available facility/personnel clearances (e.g., "Secret", "TS/SCI").';
COMMENT ON COLUMN subscriber_context.compliance_posture  IS 'CMMC level, ATO posture, FedRAMP status, etc.';
COMMENT ON COLUMN subscriber_context.geography           IS 'Geographic footprint (e.g., "CONUS", "DC Metro", "OCONUS").';
COMMENT ON COLUMN subscriber_context.no_go_criteria      IS 'Free-text rules the company will not pursue (e.g., "no clinical labs", "no overseas").';
COMMENT ON COLUMN subscriber_context.capture_priorities  IS 'Top capture priorities this fiscal year (e.g., "VA OIT Franchise Fund recompetes", "FY27 EHRM task orders").';
