-- Friday Brief pipeline — reuse Capture Corner infra.
--
-- New columns on scheduled_emails:
--   stream              — selector for per-product routing in the worker.
--                         'capture_corner' (implicit for existing rows, NULL ok)
--                         'friday_brief'  — Friday brief pipeline
--   target_date         — date (YYYY-MM-DD) the row targets. For friday_brief,
--                         this is the Friday the brief covers. Used by the
--                         partial unique index below for idempotent publish.
--   started_at          — when the worker first began processing the row.
--                         Used by the 6h abort window.
--   total_recipients    — snapshot of the intended audience size at dispatch
--                         time (informational; helpful for partial-retry math).
--
-- successful_recipients and replayed_recipients already exist (added in
-- 20260424000000_scheduled_emails_replay_throttle.sql). Re-declared with
-- IF NOT EXISTS so this file is safe to re-run standalone.
--
-- Partial unique index on (target_date) WHERE stream='friday_brief'
-- enforces one Friday-brief row per calendar date — the publish script is
-- idempotent against double-inserts caused by a re-run or a race between
-- cron ticks.

ALTER TABLE public.scheduled_emails
  ADD COLUMN IF NOT EXISTS stream text,
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_recipients int,
  ADD COLUMN IF NOT EXISTS successful_recipients text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replayed_recipients jsonb DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_emails_friday_brief_unique
  ON public.scheduled_emails (target_date)
  WHERE stream = 'friday_brief';

COMMENT ON COLUMN public.scheduled_emails.stream IS
  'Per-product routing selector: ''friday_brief'' triggers Resend tags + premium_brief_audience. NULL preserves Capture Corner behavior.';

COMMENT ON COLUMN public.scheduled_emails.target_date IS
  'Date the row targets. Partial-unique on (target_date) WHERE stream=''friday_brief'' enforces idempotent Friday-brief publish.';

COMMENT ON COLUMN public.scheduled_emails.started_at IS
  'First time the worker began processing this row. Worker checks this on re-entry and marks status=''aborted'' if the 6h window has elapsed.';

COMMENT ON COLUMN public.scheduled_emails.total_recipients IS
  'Snapshot of intended audience size at dispatch time. Informational — does not gate sends.';
