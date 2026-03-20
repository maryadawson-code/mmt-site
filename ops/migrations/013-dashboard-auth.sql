-- Dashboard users — humans who can log into the command center
CREATE TABLE IF NOT EXISTS dashboard_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'admin',

  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  login_count integer DEFAULT 0,

  default_view text DEFAULT 'all',
  notification_email boolean DEFAULT true,
  notification_telegram boolean DEFAULT false,
  telegram_id text,

  metadata jsonb DEFAULT '{}'
);

-- Login sessions
CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,

  user_id uuid NOT NULL REFERENCES dashboard_users(id),
  email text NOT NULL,

  token_hash text NOT NULL,
  is_valid boolean DEFAULT true,

  ip_address text,
  user_agent text,

  revoked_at timestamptz,
  revoked_reason text
);
CREATE INDEX IF NOT EXISTS idx_dash_sessions_valid ON dashboard_sessions(email, is_valid) WHERE is_valid = true;
CREATE INDEX IF NOT EXISTS idx_dash_sessions_expiry ON dashboard_sessions(expires_at) WHERE is_valid = true;

-- Magic link tokens (short-lived, used once)
CREATE TABLE IF NOT EXISTS dashboard_magic_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,

  email text NOT NULL,
  token_hash text NOT NULL,

  used boolean DEFAULT false,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON dashboard_magic_links(email, used) WHERE used = false;

-- Audit log — every login, logout, failed attempt
CREATE TABLE IF NOT EXISTS dashboard_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  email text NOT NULL,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_log_email ON dashboard_audit_log(email, created_at DESC);

-- Seed admin users
INSERT INTO dashboard_users (email, name, role) VALUES
  ('maryadawson@gmail.com', 'Mary Womack', 'admin'),
  ('mary@missionmeetstech.com', 'Mary Womack', 'admin')
ON CONFLICT (email) DO NOTHING;
