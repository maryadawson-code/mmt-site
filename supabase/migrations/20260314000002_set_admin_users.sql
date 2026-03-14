-- Migration: Set admin tier for owner accounts
-- Admin tier bypasses the 3-free-assessment gate in score-deck.js
-- (gate checks: user.tier === "free" && uses_remaining <= 0)

-- Upsert maryadawson@gmail.com as admin tier
INSERT INTO mp_users (email, source, tier)
VALUES ('maryadawson@gmail.com', 'admin', 'admin')
ON CONFLICT (email)
DO UPDATE SET tier = 'admin';

-- Upsert mary@missionmeetstech.com as admin tier
INSERT INTO mp_users (email, source, tier)
VALUES ('mary@missionmeetstech.com', 'admin', 'admin')
ON CONFLICT (email)
DO UPDATE SET tier = 'admin';
