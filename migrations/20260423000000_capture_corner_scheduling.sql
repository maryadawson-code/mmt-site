-- Capture Corner Premium release scheduling
-- Two tables: (1) portal CMS rows, (2) scheduled outbound emails.
-- Both are managed by scripts/publish-premium-deliverable.js and the
-- scheduled-portal-publisher + scheduled-email-worker cron functions.

CREATE TABLE IF NOT EXISTS public.premium_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id text NOT NULL,                     -- e.g., "biosurveillance-reframing-playbook"
  slug text NOT NULL UNIQUE,                    -- URL slug, e.g., "/premium/capture-corner/biosurveillance-reframing-playbook"
  title text NOT NULL,
  body_markdown text NOT NULL,
  source_file text,                             -- path to source markdown (provenance only)
  publish_at timestamptz NOT NULL,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  email_subject text,
  preheader text,
  summary_bullets jsonb DEFAULT '[]'::jsonb,
  is_capture_corner_release boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS premium_deliverables_publish_at_idx
  ON public.premium_deliverables (publish_at) WHERE published = false;

CREATE INDEX IF NOT EXISTS premium_deliverables_release_id_idx
  ON public.premium_deliverables (release_id);

CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id text,                              -- links to premium_deliverables.release_id
  subject text NOT NULL,
  from_address text NOT NULL,
  reply_to text,
  bcc jsonb DEFAULT '[]'::jsonb,                -- array of BCC addresses
  html text NOT NULL,
  text_body text,
  recipient_query text,                         -- sql-ish selector tag (e.g., "premium_active")
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',        -- queued | sending | sent | failed | aborted | hold
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  resend_ids jsonb DEFAULT '[]'::jsonb,         -- array of Resend email IDs (one per recipient)
  sent_at timestamptz,
  founding_variant_html text,                   -- optional: body served to founding_member=true users
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_emails_due_idx
  ON public.scheduled_emails (scheduled_at) WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS scheduled_emails_release_id_idx
  ON public.scheduled_emails (release_id);
