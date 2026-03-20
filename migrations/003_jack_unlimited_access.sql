-- Migration: Grant jackyang2326@gmail.com unlimited access to ProposalPulse and MarketPulse
-- Date: 2026-03-20
-- Safe: Does not affect existing users. Upserts only.

-- 1. Upsert mp_users record with admin tier
INSERT INTO mp_users (email, source, tier)
VALUES ('jackyang2326@gmail.com', 'admin_grant', 'admin')
ON CONFLICT (email) DO UPDATE SET tier = 'admin';

-- 2. Ensure mp_feature_usage record exists with high remaining uses
INSERT INTO mp_feature_usage (user_id, feature, uses_remaining, uses_total)
SELECT id, 'lethality_test', 9999, 0
FROM mp_users WHERE email = 'jackyang2326@gmail.com'
ON CONFLICT (user_id, feature) DO UPDATE SET uses_remaining = 9999;

-- 3. Verify Mary's admin access is intact
-- SELECT email, tier FROM mp_users WHERE email IN ('maryadawson@gmail.com', 'mary@missionmeetstech.com', 'jackyang2326@gmail.com');
