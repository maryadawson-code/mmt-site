-- ============================================================
-- 011_mp_users_columns_documented.sql
--
-- IDEMPOTENT — safe to apply against production with no behavior change.
-- Documents and adds (if missing) the columns the entitlement helper
-- and every paid-tool function reads from mp_users. The 2026-04-27
-- incident showed each function had its own ad-hoc shape and one of
-- them (ask-mmt-submit.js) referenced a non-existent column
-- (`is_founding_member`).
--
-- This migration:
--   1. Adds any missing column with the expected type and default.
--   2. Adds COMMENT ON COLUMN annotations so the canonical contract is
--      in the database itself.
--   3. Adds a permissive CHECK constraint on subscription_tier listing
--      the values the entitlement helper accepts (premium / institutional /
--      mmt_premium_founding). Any other value is treated as free, so
--      enforcing the enum here is purely a regression guard.
--   4. Adds a CHECK constraint on tier (legacy column) listing the
--      values that grant paid access (admin / paid).
--
-- Safe to apply repeatedly. Does not modify any existing rows.
-- Rolls forward only — no destructive change.
--
-- Spec: docs/entitlement-spec.md (canonical contract).
-- Status: prepared 2026-04-27; production application gated on Mary approval.
-- ============================================================

-- ---- 1. Add missing columns -----------------------------------------------
ALTER TABLE mp_users
  ADD COLUMN IF NOT EXISTS subscription_tier   text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS founding_member     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier                text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id  text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS expires_at          timestamptz,
  ADD COLUMN IF NOT EXISTS created_at          timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();

-- ---- 2. Document column intent --------------------------------------------
COMMENT ON COLUMN mp_users.subscription_tier IS
  'Canonical paid-tier enum: premium | institutional | mmt_premium_founding (legacy from Stripe Payment Link metadata) | null. See docs/entitlement-spec.md.';

COMMENT ON COLUMN mp_users.subscription_status IS
  'Stripe subscription status. Values active and trialing count as paid; canceled/past_due/incomplete/unpaid do not.';

COMMENT ON COLUMN mp_users.founding_member IS
  'CANONICAL column for Founding Member boolean. Older code referenced is_founding_member which does NOT exist — see 2026-04-27 incident, ask-mmt-submit.js typo.';

COMMENT ON COLUMN mp_users.tier IS
  'Legacy access column. Values admin and paid still grant access. Prefer subscription_tier + founding_member for new code.';

COMMENT ON COLUMN mp_users.email IS
  'Stored lowercased by reconcile-premium-subscribers.js. Older rows may be mixed-case. The entitlement helper uses .ilike() for case-insensitive lookup.';

-- ---- 3. Permissive CHECKs (regression guard) ------------------------------
-- subscription_tier values not in the allowed set are silently treated as free
-- by the entitlement helper, so this is a soft guard. Wrapped in DO block so
-- repeat applications don't error.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mp_users_subscription_tier_chk'
  ) THEN
    ALTER TABLE mp_users
      ADD CONSTRAINT mp_users_subscription_tier_chk
      CHECK (
        subscription_tier IS NULL
        OR subscription_tier IN ('premium', 'institutional', 'mmt_premium_founding')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mp_users_tier_chk'
  ) THEN
    ALTER TABLE mp_users
      ADD CONSTRAINT mp_users_tier_chk
      CHECK (
        tier IS NULL
        OR tier IN ('admin', 'paid', 'subscriber', 'free')
      );
  END IF;
END $$;

-- ---- 4. Helpful indexes ---------------------------------------------------
CREATE INDEX IF NOT EXISTS mp_users_email_lower_idx ON mp_users (lower(email));
CREATE INDEX IF NOT EXISTS mp_users_subscription_tier_idx ON mp_users (subscription_tier);
CREATE INDEX IF NOT EXISTS mp_users_founding_member_idx  ON mp_users (founding_member) WHERE founding_member = true;

-- ---- 5. Updated-at trigger (soft idempotent) ------------------------------
CREATE OR REPLACE FUNCTION mp_users_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mp_users_touch_updated_at_trigger ON mp_users;
CREATE TRIGGER mp_users_touch_updated_at_trigger
  BEFORE UPDATE ON mp_users
  FOR EACH ROW EXECUTE FUNCTION mp_users_touch_updated_at();

COMMENT ON TABLE mp_users IS
  'User + subscription state. Canonical tier contract: docs/entitlement-spec.md. Helper: netlify/functions/lib/entitlement.js.';
