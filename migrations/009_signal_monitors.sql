-- ============================================================
-- 009_signal_monitors.sql
--
-- Signal Chain v2 — persistent monitors for premium subscribers.
-- When a subscribed topic's composite score crosses the alert
-- threshold (default 75), a Capture Alert email is sent.
--
-- Spec: signal-chain-refinement-spec.md §4 (Monitoring / Subscription)
-- Re-score cron: netlify/functions/signal-chain-monitor-sweep.js
-- (scheduled weekly Sunday 6am UTC)
-- ============================================================

CREATE TABLE IF NOT EXISTS signal_monitors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  topic            text NOT NULL,
  agency           text,
  alert_threshold  integer NOT NULL DEFAULT 75,
  last_score       integer,
  last_scored_at   timestamptz,
  last_verdict     text,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, topic, agency)
);

CREATE INDEX IF NOT EXISTS signal_monitors_email_idx
  ON signal_monitors (lower(email));

CREATE INDEX IF NOT EXISTS signal_monitors_active_idx
  ON signal_monitors (active) WHERE active = true;

ALTER TABLE signal_monitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY signal_monitors_service_key_all
  ON signal_monitors FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE signal_monitors IS 'Persistent Signal Chain monitors. Weekly cron re-scores each row; fires Capture Alert email when last_score crosses alert_threshold.';
