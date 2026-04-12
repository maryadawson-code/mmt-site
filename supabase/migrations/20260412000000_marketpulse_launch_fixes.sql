-- 20260412000000_marketpulse_launch_fixes.sql
-- Launch week fixes for MarketPulse + mp_users table

-- Add missing columns to marketpulse_orders that the background function
-- and cleanup function expect but the original schema omitted
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS amount_paid INTEGER;
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS additional_context TEXT;

-- Backfill company from company_name for any existing rows
UPDATE marketpulse_orders SET company = company_name WHERE company IS NULL AND company_name IS NOT NULL;

-- Ensure mp_users table exists (referenced by gateway, score-deck, and other functions)
CREATE TABLE IF NOT EXISTS mp_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  tier TEXT DEFAULT 'free',
  source TEXT,
  stripe_customer_id TEXT,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_users_email ON mp_users(email);
CREATE INDEX IF NOT EXISTS idx_mp_users_tier ON mp_users(tier);

ALTER TABLE mp_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_full_access_mp_users" ON mp_users
  FOR ALL USING (true) WITH CHECK (true);
