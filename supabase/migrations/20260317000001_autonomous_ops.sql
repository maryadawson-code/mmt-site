-- Autonomous Operations Migration
-- Adds ops_events ledger and bounce suppression.

-- 1. Operations event ledger
CREATE TABLE IF NOT EXISTS ops_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  event_type TEXT NOT NULL,
  source_function TEXT,
  scoring_id UUID,
  order_id UUID,
  user_email TEXT,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  auto_resolved BOOLEAN DEFAULT false,
  resolution TEXT,
  details JSONB DEFAULT '{}',
  error_signature TEXT
);

CREATE INDEX IF NOT EXISTS idx_ops_events_type ON ops_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_ops_events_source ON ops_events(source_function, created_at);
CREATE INDEX IF NOT EXISTS idx_ops_events_email ON ops_events(user_email, created_at);
CREATE INDEX IF NOT EXISTS idx_ops_events_severity ON ops_events(severity) WHERE severity IN ('error', 'critical');
CREATE INDEX IF NOT EXISTS idx_ops_events_unresolved ON ops_events(auto_resolved, created_at) WHERE auto_resolved = false;
CREATE INDEX IF NOT EXISTS idx_ops_events_signature ON ops_events(error_signature, created_at);

-- 2. Bounce suppression list
CREATE TABLE IF NOT EXISTS bounce_suppression (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  reason TEXT,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounce_suppression_email ON bounce_suppression(email);
