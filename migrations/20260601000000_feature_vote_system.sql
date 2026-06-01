-- ============================================================
-- 20260601000000_feature_vote_system.sql
--
-- Autonomous feature-vote system: flag state + release queue.
-- See FEATURE_VOTE_SYSTEM_SPEC.md §3 (new components 1 + 6).
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING seed.
-- Safe to re-run via apply-pending-migrations.js.
--
-- NOTE: `feature_flags` here is the Supabase render-state table read by
-- build.js (lib/vote-flags.js getEnabledFlags). It is unrelated to
-- netlify/functions/lib/feature-flags.js (env-var product flags) and to
-- the existing product_roadmap / product_roadmap_log tables (admin CRUD
-- roadmap, roadmap-api.js). Different concern, different name.
-- ============================================================

-- Render state: which vote features are live. build.js reads this at
-- build start and gates each feature's markup/JS include on enabled=true.
CREATE TABLE IF NOT EXISTS feature_flags (
  key          TEXT PRIMARY KEY,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  source       TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The ranked release queue. Rank 1 = winner (ships immediately on tally);
-- ranks 2-10 get ship_at = winner_ship + (rank-1) * ROADMAP_INTERVAL_DAYS.
-- feature-roadmap-release.js ships exactly one due row per hourly run.
CREATE TABLE IF NOT EXISTS feature_roadmap (
  id          BIGSERIAL PRIMARY KEY,
  vote_cycle  TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  rank        INTEGER NOT NULL,
  ship_at     TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued | shipped | skipped
  shipped_at  TIMESTAMPTZ,
  attempts    INTEGER NOT NULL DEFAULT 0,       -- build-fail retry counter
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Release-selection query: earliest queued row that is due, by rank.
CREATE INDEX IF NOT EXISTS idx_feature_roadmap_due
  ON feature_roadmap (status, ship_at, rank);

-- One feature_key may not appear twice in the same cycle (idempotency anchor).
CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_roadmap_cycle_key
  ON feature_roadmap (vote_cycle, feature_key);

-- Seed all 10 flags disabled. Keys are namespaced `vote_feature.<key>`
-- per spec §2. ON CONFLICT keeps any already-activated flag untouched.
INSERT INTO feature_flags (key, enabled, source) VALUES
  ('vote_feature.vendor_watch',        false, 'seed'),
  ('vote_feature.teaming_signals',     false, 'seed'),
  ('vote_feature.tracker_filters',     false, 'seed'),
  ('vote_feature.csv_export',          false, 'seed'),
  ('vote_feature.tracker_api',         false, 'seed'),
  ('vote_feature.custom_watchlists',   false, 'seed'),
  ('vote_feature.recompete_alerts',    false, 'seed'),
  ('vote_feature.teaming_finder',      false, 'seed'),
  ('vote_feature.recompete_timeline',  false, 'seed'),
  ('vote_feature.proposalpulse_tiein', false, 'seed')
ON CONFLICT (key) DO NOTHING;
