-- ============================================================
-- 20260516000000_subscriber_context_v2.sql
--
-- Subscriber Context v2 — adds position_history, jv_partnerships,
-- agency_relationships, editorial_calendar JSONB columns so the
-- Pursuit Score 2.0 state engine (Sprint 9a Phase B) can classify
-- recommendation states like SUB_TO_INCUMBENT, JV_TEAMING,
-- EDITORIAL_TARGET.
--
-- ADDITIVE ONLY + IDEMPOTENT. Every column is nullable with a
-- '[]'::jsonb default so v1 readers (those still expecting only the
-- 008 columns) stay green. v2 readers fall back to empty arrays
-- when the column is absent.
--
-- Spec: ~/Downloads/sprint-9a-pursuit-score-phase-a-b.md
-- Companion: pursuit-score-2.0-completion-spec.md, subscriber-context-v2.md
--
-- DO NOT APPLY TO PRODUCTION FROM THE WORKTREE. Mary runs this in
-- Supabase SQL Editor per the overnight runbook migration gate.
-- ============================================================

-- Position history: roles held under prior contracts, especially
-- relevant for SUB_TO_INCUMBENT classification.
-- Element shape:
--   {
--     "contract_number": "HT0011-23-D-...",          (string|null)
--     "agency": "DHA",                                (string)
--     "program": "VA SCM DSO (HELM)",                 (string)
--     "role": "sub|prime|jv_partner|teaming_partner", (enum)
--     "prime_company": "Accenture Federal Services",  (string|null when self-prime)
--     "scope": "Free-text scope summary",             (string)
--     "start_date": "2024-06-01",                     (ISO date)
--     "end_date": "2027-05-31"                        (ISO date|null when active)
--   }
ALTER TABLE subscriber_context
  ADD COLUMN IF NOT EXISTS position_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- JV / mentor-protégé partnerships. Drives JV_TEAMING state.
-- Element shape:
--   {
--     "partner_company": "Accenture Federal Services",
--     "type": "sba_mentor_protege|jv_agreement|teaming_agreement",
--     "uei": "ABCD12345678",                          (string|null)
--     "start_date": "2024-01-15",
--     "end_date": "2027-01-14",                       (ISO date|null)
--     "scope_keywords": ["VA EHRM", "imaging", "MHS GENESIS"],
--     "programs_in_scope": ["VA EHRM Restart", "VA Imaging Portfolio"]
--   }
ALTER TABLE subscriber_context
  ADD COLUMN IF NOT EXISTS jv_partnerships jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Agency-level relationships separate from prior contracts (alumni,
-- advisory board seats, FACA, customer-of-record, etc.). Drives
-- INSIDER_ACCESS scoring boost.
-- Element shape:
--   {
--     "agency": "VA",
--     "relationship_type": "alumni|advisory_board|faca|customer_of_record",
--     "subject": "Veterans Health Administration OIT",
--     "since": "2018-01-01",
--     "active_through": null,                         (ISO date|null)
--     "notes": "Free text"
--   }
ALTER TABLE subscriber_context
  ADD COLUMN IF NOT EXISTS agency_relationships jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Editorial calendar — programs Mary covers as journalist/analyst.
-- Drives EDITORIAL_TARGET state in platform-mode Pursuit Score so
-- the engine doesn't recommend "bid on this" for an article topic.
-- Element shape:
--   {
--     "program": "MHS GENESIS Wave 2",
--     "agency": "DHA",
--     "next_coverage_date": "2026-06-15",
--     "coverage_type": "newsletter|capture_corner|monthly_brief|podcast"
--   }
ALTER TABLE subscriber_context
  ADD COLUMN IF NOT EXISTS editorial_calendar jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Indexes — JSONB GIN indexes for the fields we filter on most often.
-- All idempotent.
CREATE INDEX IF NOT EXISTS subscriber_context_position_history_gin
  ON subscriber_context USING GIN (position_history);
CREATE INDEX IF NOT EXISTS subscriber_context_jv_partnerships_gin
  ON subscriber_context USING GIN (jv_partnerships);

-- Schema documentation. `oci_exclusions` already exists in 008;
-- v2 tightens the expected element shape via comment only (no
-- breaking schema change).
COMMENT ON COLUMN subscriber_context.position_history IS
  'v2: array of position records {contract_number, agency, program, role, prime_company, scope, start_date, end_date}. Role enum: sub|prime|jv_partner|teaming_partner. Drives SUB_TO_INCUMBENT classification in Pursuit Score 2.0.';
COMMENT ON COLUMN subscriber_context.jv_partnerships IS
  'v2: array of JV / mentor-protégé records {partner_company, type, uei, start_date, end_date, scope_keywords[], programs_in_scope[]}. Type enum: sba_mentor_protege|jv_agreement|teaming_agreement. Drives JV_TEAMING state.';
COMMENT ON COLUMN subscriber_context.agency_relationships IS
  'v2: array of agency relationship records {agency, relationship_type, subject, since, active_through, notes}. Type enum: alumni|advisory_board|faca|customer_of_record.';
COMMENT ON COLUMN subscriber_context.editorial_calendar IS
  'v2: array of editorial coverage records {program, agency, next_coverage_date, coverage_type}. Drives EDITORIAL_TARGET state in platform mode.';
COMMENT ON COLUMN subscriber_context.oci_exclusions IS
  'v2-tightened: array of OCI records. Element shape: {blocking_contract, blocked_scope, expires (ISO date|null), notes, agency (optional), program_scope (optional)}. No schema change in v2 — comment-only documentation.';

-- Bump context_version on every row so the engine knows v2 fields
-- are available. Idempotent — only fires once because the column
-- already triggers via subscriber_context_version_trigger.
-- This intentionally produces NO writes; the migration relies on
-- the existing trigger to maintain context_version going forward.

-- Rollback (manual, for reference only — do not run unless reverting):
--   ALTER TABLE subscriber_context DROP COLUMN IF EXISTS position_history;
--   ALTER TABLE subscriber_context DROP COLUMN IF EXISTS jv_partnerships;
--   ALTER TABLE subscriber_context DROP COLUMN IF EXISTS agency_relationships;
--   ALTER TABLE subscriber_context DROP COLUMN IF EXISTS editorial_calendar;
--   DROP INDEX IF EXISTS subscriber_context_position_history_gin;
--   DROP INDEX IF EXISTS subscriber_context_jv_partnerships_gin;
