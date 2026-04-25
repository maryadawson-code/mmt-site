-- Pursuit Calendar — table backing /premium/calendar.
--
-- Refreshed every 6h by netlify/functions/pursuit-calendar-refresh.js
-- (polls SAM.gov + agency RSS feeds, upserts on (title, event_date, agency)).
-- Daily 06:00 UTC, pursuit-calendar-sweep.js flips past-date rows to
-- status='expired'; rows expired >30d ago go to status='archived'.
-- build.js buildPursuitCalendarStatic() renders status='active' rows to
-- dist/premium/calendar/index.html.
--
-- Mary applies via Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.pursuit_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  event_date date NOT NULL,
  end_date date,
  agency text,
  vehicle text,
  category text NOT NULL,
    -- 'proposal_due' | 'intel_release' | 'event' | 'industry_day' | 'award' | 'deadline'
  status text NOT NULL DEFAULT 'active',
    -- 'active' | 'expired' | 'archived'
  source_url text,
  source_system text,
    -- 'sam.gov' | 'manual' | 'rss:<feed>' | 'agency-rss'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expired_at timestamptz,
  UNIQUE (title, event_date, agency)
);

CREATE INDEX IF NOT EXISTS idx_pursuit_calendar_active_date
  ON public.pursuit_calendar (status, event_date);

COMMENT ON TABLE public.pursuit_calendar IS
  'Federal pursuit calendar — proposal deadlines, industry days, intel releases. Refreshed every 6h by pursuit-calendar-refresh; expired daily by pursuit-calendar-sweep.';

-- Optional pg_notify trigger (pair with rebuild-trigger when wired).
-- Uncomment to enable build-on-change:
-- CREATE OR REPLACE FUNCTION public.notify_pursuit_change()
--   RETURNS trigger AS $$
-- BEGIN
--   PERFORM pg_notify('rebuild', 'pursuit_calendar');
--   RETURN NULL;
-- END;
-- $$ LANGUAGE plpgsql;
-- DROP TRIGGER IF EXISTS pursuit_calendar_changed ON public.pursuit_calendar;
-- CREATE TRIGGER pursuit_calendar_changed
--   AFTER INSERT OR UPDATE ON public.pursuit_calendar
--   FOR EACH STATEMENT EXECUTE FUNCTION public.notify_pursuit_change();

-- Backfill from current /premium/calendar (uncomment + run once after table create).
-- INSERT INTO public.pursuit_calendar
--   (title, event_date, end_date, agency, vehicle, category, status, source_url, source_system, notes)
-- VALUES
--   ('CCN Next Gen — Proposals due', '2026-04-17', NULL,
--    'Department of Veterans Affairs', 'Community Care Network Next Gen',
--    'proposal_due', 'expired', 'https://sam.gov/opp/36C10G26R0003',
--    'manual', 'Solicitation 36C10G26R0003. Multi-region IDIQ.'),
--
--   ('DHP BJB — Intel release', '2026-04-21', NULL,
--    'Defense Health Agency', 'DHP Budget Justification Book',
--    'intel_release', 'expired', NULL, 'manual',
--    'FY27 budget justification posted; review for program-line shifts.'),
--
--   ('GovHealth IT Summit', '2026-04-28', '2026-04-29',
--    NULL, NULL, 'event', 'expired',
--    'https://www.govhealthit.com/summit', 'manual',
--    'Two-day summit; DHA + VA + ARPA-H program leads on stage.'),
--
--   ('DHA Industry Day', '2026-05-20', NULL,
--    'Defense Health Agency', NULL, 'industry_day', 'active',
--    NULL, 'manual', 'OMNIBUS IV / HCDS pre-solicitation industry day.'),
--
--   ('ARPA-H ADVOCATE — Award expected', '2026-06-30', NULL,
--    'ARPA-H', 'ADVOCATE', 'award', 'active', NULL, 'manual',
--    'Per ARPA-H program officer brief Feb 2026.'),
--
--   ('HCDS — Capability statement deadline', '2026-08-30', NULL,
--    'Defense Health Agency', 'Health Care Delivery Solutions (HCDS)',
--    'deadline', 'active', 'https://sam.gov/opp/HT003826X0000', 'sam.gov',
--    'RFI close. Capability statement window for the MHS GENESIS follow-on.');
