-- ============================================================
-- 008_subscriber_context.sql
--
-- MarketPulse v2 subscriber-context integration.
--
-- Adds a per-subscriber research context record. The MarketPulse
-- research agent loads this record before every run and uses it
-- to tag pipeline opportunities and constrain strategic
-- recommendations. Without this, reports contradict the
-- subscriber's ground truth (see 4/17/26 HT001126RE011 failure).
--
-- Spec: MarketPulse v2 — Subscriber Context Integration (Mary Womack)
-- Status: v2 seed; admin import via POST /.netlify/functions/subscriber-context
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriber_context (
  subscriber_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text UNIQUE NOT NULL,
  entity_name         text NOT NULL,
  uei                 text,
  set_aside_certifications text[] DEFAULT ARRAY[]::text[],
  lanes               jsonb DEFAULT '[]'::jsonb,
  active_pursuits     jsonb DEFAULT '[]'::jsonb,
  incumbent_positions jsonb DEFAULT '[]'::jsonb,
  no_go_list          jsonb DEFAULT '[]'::jsonb,
  teaming_preferred   text[] DEFAULT ARRAY[]::text[],
  teaming_no_fly      text[] DEFAULT ARRAY[]::text[],
  oci_exclusions      jsonb DEFAULT '[]'::jsonb,
  vehicle_holdings    jsonb DEFAULT '[]'::jsonb,
  context_version     int NOT NULL DEFAULT 1,
  last_updated        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriber_context_email_idx
  ON subscriber_context (lower(email));

-- context_version bumps on every update so the research agent can
-- detect staleness if the context is cached anywhere downstream.
CREATE OR REPLACE FUNCTION subscriber_context_bump_version()
RETURNS trigger AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.context_version = COALESCE(OLD.context_version, 0) + 1;
    NEW.last_updated = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriber_context_version_trigger ON subscriber_context;
CREATE TRIGGER subscriber_context_version_trigger
  BEFORE UPDATE ON subscriber_context
  FOR EACH ROW EXECUTE FUNCTION subscriber_context_bump_version();

-- Row-level security: the function uses the service key, so RLS on
-- this table can stay permissive. The admin import endpoint is the
-- only write path and it gates on SUPABASE_SERVICE_KEY.
ALTER TABLE subscriber_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriber_context_service_key_all
  ON subscriber_context FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE subscriber_context IS 'Per-subscriber research context loaded by MarketPulse v2 before every run. Drives opportunity tagging and strategic recommendation constraints. See MarketPulse v2 spec 2026-04-17.';
