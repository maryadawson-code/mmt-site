-- ============================================================
-- 20260517000000_pursuit_score_runs.sql
--
-- Pursuit Score 2.0 Phase E — run history table. Stores every
-- score envelope so the delta engine can compute "what changed
-- since last run" on re-scores. Without this, every Pursuit
-- Score call is a cold start with no context about which
-- dimensions moved, which signals appeared, or which acquisition
-- state changed.
--
-- ADDITIVE ONLY + IDEMPOTENT. Reads gated by PURSUIT_SCORE_RUN_HISTORY
-- env var (default off); table can sit empty without affecting v1
-- or v2-without-history behavior.
--
-- Spec: ~/Downloads/sprint-9c-pursuit-score-phase-e.md §"Phase E"
--
-- DO NOT APPLY TO PRODUCTION FROM THE WORKTREE. Mary runs this in
-- Supabase SQL Editor per the overnight runbook migration gate.
-- ============================================================

CREATE TABLE IF NOT EXISTS pursuit_score_runs (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz NOT NULL DEFAULT now(),
  email               text NOT NULL,
  keyword             text NOT NULL,
  agency              text,
  envelope            jsonb NOT NULL,
  composite           integer,
  recommendation_state text,
  acquisition_state   text
);

-- Lookup index — exact match on (email, lowercased keyword,
-- coalesced agency), most recent first. Matches the delta engine's
-- prior-run lookup pattern.
CREATE INDEX IF NOT EXISTS idx_pursuit_runs_lookup
  ON pursuit_score_runs (email, lower(keyword), coalesce(agency, ''), created_at DESC);

-- TTL index — created_at descending. Retention policy is on the
-- operator (keep 12 months, prune older). Defers cleanup to a
-- separate cron rather than a CHECK constraint.
CREATE INDEX IF NOT EXISTS idx_pursuit_runs_created_at
  ON pursuit_score_runs (created_at DESC);

-- Row-level security — only the service role writes; v2 reads
-- through the engine, which uses SUPABASE_SERVICE_KEY. No subscriber
-- reads this table directly.
ALTER TABLE pursuit_score_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pursuit_score_runs_service_key_all
  ON pursuit_score_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE pursuit_score_runs IS
  'Pursuit Score 2.0 run history. Stores every score envelope so the delta engine can compute "what changed" across re-runs. Reads gated by PURSUIT_SCORE_RUN_HISTORY env var. See Sprint 9c.';
COMMENT ON COLUMN pursuit_score_runs.envelope IS
  'The full Pursuit Score response envelope at run time (jsonb). Includes layers, recommendation, monday_move, acquisition_state, signals — everything the engine emitted.';
COMMENT ON COLUMN pursuit_score_runs.composite IS
  'Composite score 0-100 at run time. Denormalized for fast delta queries.';
COMMENT ON COLUMN pursuit_score_runs.recommendation_state IS
  'v2 recommendation state at run time (PRIME_DIRECT / SUB_TO_INCUMBENT / etc). Denormalized from envelope.recommendation.state.';
COMMENT ON COLUMN pursuit_score_runs.acquisition_state IS
  'v2 acquisition state at run time (RFI_OPEN / RFI_CLOSED_RECENT / DRAFT_RFP / etc). Denormalized from envelope.acquisition_state.state.';

-- Rollback (manual, for reference only — do not run unless reverting):
--   DROP INDEX IF EXISTS idx_pursuit_runs_created_at;
--   DROP INDEX IF EXISTS idx_pursuit_runs_lookup;
--   DROP TABLE IF EXISTS pursuit_score_runs;
