-- Migration: MissionPulse / ProposalPulse Tables
-- Fixes ProposalPulse "Account error" and "Usage check failed" errors

CREATE TABLE IF NOT EXISTS mp_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT,
  tier TEXT DEFAULT 'free',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mp_feature_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES mp_users(id),
  feature TEXT NOT NULL,
  uses_remaining INTEGER DEFAULT 3,
  uses_total INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, feature)
);

CREATE TABLE IF NOT EXISTS mp_scoring_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES mp_users(id),
  feature TEXT,
  file_name TEXT,
  file_type TEXT,
  document_type TEXT,
  scores JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mp_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE mp_feature_usage DISABLE ROW LEVEL SECURITY;
ALTER TABLE mp_scoring_history DISABLE ROW LEVEL SECURITY;
