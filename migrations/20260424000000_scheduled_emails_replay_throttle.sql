-- scheduled_emails: add columns to support (1) replay audit trail and
-- (2) 429-aware partial-retry in scheduled-email-worker.
--
-- replayed_recipients: jsonb array of {email, resend_id, replayed_at} rows
--   written by scripts/replay-stranded-recipients.js when a one-shot replay
--   successfully reaches a recipient that was missed on the original send.
--   Status column is NOT mutated by the replay — this field is the only
--   trace on the row itself; ops_events also logs per-recipient.
--
-- successful_recipients: text array of emails that have been confirmed
--   delivered (HTTP 2xx from Resend). Used by the worker's retry loop:
--   on a re-entry of a queued row, the worker filters these out of the
--   recipient list so it only re-sends to the unsent tail (typically the
--   4 addresses throttled by Resend's 5 rps cap).
--
-- Both columns are additive, nullable, and idempotent to apply.

ALTER TABLE public.scheduled_emails
  ADD COLUMN IF NOT EXISTS replayed_recipients jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS successful_recipients text[] DEFAULT NULL;

COMMENT ON COLUMN public.scheduled_emails.replayed_recipients IS
  'Audit trail for one-shot replay sends (scripts/replay-stranded-recipients.js). Array of {email, resend_id, replayed_at}.';

COMMENT ON COLUMN public.scheduled_emails.successful_recipients IS
  'Emails confirmed delivered by Resend 2xx. Worker filters these out on retry so throttled (429) recipients receive the send without re-delivering to subscribers who already got it.';
