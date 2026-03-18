-- Held emails for degraded mode (kill switch)
CREATE TABLE IF NOT EXISTS held_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ,
  released BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_held_emails_unreleased
  ON held_emails(created_at)
  WHERE released = FALSE;
