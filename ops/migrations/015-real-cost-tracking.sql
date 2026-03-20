-- ═══════════════════════════════════════
-- 015: Real Cost Tracking
-- billing_records, billing_sync_status, monthly_cost_summary, oauth_tokens
-- ═══════════════════════════════════════

-- ═══════════════════════════════════════
-- BILLING RECORDS (every charge we find)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS billing_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  -- What service
  service_name text NOT NULL,                -- matches service_inventory.service_name
  service_id uuid,                           -- FK to service_inventory if matched

  -- Charge details
  charge_date date NOT NULL,
  amount_cents integer NOT NULL,             -- always positive, in USD cents
  currency text DEFAULT 'USD',
  description text,                          -- "Claude API auto-recharge", "LinkedIn Premium monthly"

  -- Source of truth
  source text NOT NULL,                      -- 'anthropic_api', 'stripe_billing', 'gmail_receipt', 'apple_export', 'netlify_api', 'resend_api', 'manual', 'plausible_api', 'render_api', 'supabase_api'
  source_ref text,                           -- receipt ID, email message ID, Stripe charge ID, etc.
  source_url text,                           -- link to receipt/invoice

  -- Categorization
  category text,                             -- 'infrastructure', 'ai-tools', 'productivity', 'personal', 'family', 'domains'
  is_business boolean DEFAULT true,
  is_tax_deductible boolean DEFAULT false,

  -- Matching
  matched_to_inventory boolean DEFAULT false, -- did we find this in service_inventory?
  confidence text DEFAULT 'high',            -- 'high' (API/receipt), 'medium' (pattern match), 'low' (fuzzy)
  needs_review boolean DEFAULT false,        -- flag for manual verification
  reviewed boolean DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,

  -- Dedup
  dedup_key text,                            -- composite key to prevent double-counting

  metadata jsonb DEFAULT '{}',

  UNIQUE(dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_billing_date ON billing_records(charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_service ON billing_records(service_name, charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_source ON billing_records(source, charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_review ON billing_records(needs_review) WHERE needs_review = true AND reviewed = false;
CREATE INDEX IF NOT EXISTS idx_billing_unmatched ON billing_records(matched_to_inventory) WHERE matched_to_inventory = false;

-- ═══════════════════════════════════════
-- BILLING SYNC STATUS (per-source tracking)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS billing_sync_status (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL UNIQUE,               -- 'anthropic_api', 'gmail', 'stripe_billing', etc.
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  records_synced integer DEFAULT 0,
  sync_cursor text,                          -- page token, last email ID, last charge date, etc.
  is_enabled boolean DEFAULT true,
  config jsonb DEFAULT '{}',                 -- source-specific config (API key env var name, etc.)
  metadata jsonb DEFAULT '{}'
);

-- Seed sync sources
INSERT INTO billing_sync_status (source, is_enabled, config) VALUES
  ('anthropic_api', true, '{"env_key": "ANTHROPIC_API_KEY", "endpoint": "https://api.anthropic.com/v1/billing", "notes": "Check if billing API exists — may need to scrape console"}'),
  ('stripe_billing', true, '{"env_key": "STRIPE_SECRET_KEY", "notes": "Our own Stripe charges + fees"}'),
  ('gmail_receipts', false, '{"env_key": "GOOGLE_SERVICE_ACCOUNT_KEY", "notes": "Needs Google OAuth setup"}'),
  ('netlify_api', true, '{"env_key": "NETLIFY_AUTH_TOKEN", "endpoint": "https://api.netlify.com/api/v1", "notes": "Check billing endpoint"}'),
  ('resend_api', true, '{"env_key": "RESEND_API_KEY", "notes": "Check usage/billing endpoint"}'),
  ('render_api', false, '{"notes": "Check if Render has billing API"}'),
  ('plausible_api', false, '{"notes": "Check if Plausible has billing API"}'),
  ('supabase_api', true, '{"env_key": "SUPABASE_URL", "notes": "Usage endpoint at /rest/v1/rpc or management API"}'),
  ('apple_export', false, '{"notes": "Manual CSV upload — Apple has no billing API for consumers"}'),
  ('manual', true, '{"notes": "Always enabled — manual entries"}')
ON CONFLICT (source) DO NOTHING;

-- ═══════════════════════════════════════
-- MONTHLY COST SUMMARY (reconciliation view)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS monthly_cost_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month date NOT NULL,                       -- first of month: 2026-03-01

  -- Totals
  total_cents integer DEFAULT 0,
  business_cents integer DEFAULT 0,
  personal_cents integer DEFAULT 0,
  tax_deductible_cents integer DEFAULT 0,

  -- By category
  infrastructure_cents integer DEFAULT 0,
  ai_tools_cents integer DEFAULT 0,
  productivity_cents integer DEFAULT 0,
  domains_cents integer DEFAULT 0,
  personal_subs_cents integer DEFAULT 0,
  family_cents integer DEFAULT 0,

  -- Coverage
  sources_synced text[] DEFAULT '{}',        -- which sources contributed
  records_count integer DEFAULT 0,
  unmatched_count integer DEFAULT 0,         -- charges not in service_inventory
  needs_review_count integer DEFAULT 0,

  -- Reconciliation
  reconciled boolean DEFAULT false,
  reconciled_by text,
  reconciled_at timestamptz,
  reconciliation_notes text,

  UNIQUE(month)
);

-- ═══════════════════════════════════════
-- GOOGLE OAUTH TOKENS (for Gmail access)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  provider text NOT NULL,                    -- 'google'
  account_email text NOT NULL,               -- 'maryadawson@gmail.com'

  access_token text,                         -- encrypted in production; plaintext for MVP
  refresh_token text,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz,
  scopes text[],                             -- ['https://www.googleapis.com/auth/gmail.readonly']

  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  last_error text,

  UNIQUE(provider, account_email)
);
