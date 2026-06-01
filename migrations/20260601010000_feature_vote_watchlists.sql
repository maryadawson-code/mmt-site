-- ============================================================
-- 20260601010000_feature_vote_watchlists.sql
--
-- Feature-vote heavy feature F (custom_watchlists) + G (recompete_alerts).
-- Criteria-based watchlists: a member saves a SEARCH (criteria JSONB) and
-- the daily watchlist-alert cron emails new matches. Distinct from the
-- existing `mmt_watchlist` table (entry-based "follow this one contract").
--
-- IDEMPOTENT. Applied by apply-pending-migrations.js.
-- ============================================================

CREATE TABLE IF NOT EXISTS vote_watchlists (
  id              BIGSERIAL PRIMARY KEY,
  user_email      TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT 'My watchlist',
  -- criteria: { q?, agency?, naics?, status?, platform?, sb? } — same facet
  -- vocabulary the tracker filter uses. Matched against contracts at alert time.
  criteria        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- recompete_alerts (G): lead time in days before a tracked expiry to alert.
  lead_time_days  INTEGER NOT NULL DEFAULT 90,
  active          BOOLEAN NOT NULL DEFAULT true,
  last_alerted_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vote_watchlists_active
  ON vote_watchlists (active, user_email);
