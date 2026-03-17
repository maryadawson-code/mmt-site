-- Resend Webhook Event Ledger
-- Stores all Resend webhook events for email deliverability monitoring.

CREATE TABLE IF NOT EXISTS resend_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resend_email_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  svix_id TEXT UNIQUE,
  recipient TEXT,
  sender TEXT,
  subject TEXT,
  bounce_type TEXT,
  bounce_message TEXT,
  complaint_type TEXT,
  click_url TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resend_created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_resend_events_type ON resend_events(event_type);
CREATE INDEX IF NOT EXISTS idx_resend_events_created ON resend_events(created_at);
CREATE INDEX IF NOT EXISTS idx_resend_events_recipient ON resend_events(recipient);
CREATE INDEX IF NOT EXISTS idx_resend_events_bounce ON resend_events(event_type) WHERE event_type IN ('email.bounced', 'email.complained');
