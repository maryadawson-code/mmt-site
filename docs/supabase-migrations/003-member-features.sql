-- Migration: Member features (Watchlist, Read State, Preferences)
-- Run in Supabase SQL Editor for project djuviwarqdvlbgcfuupa
-- Date: April 13, 2026

-- 1. Member Preferences
CREATE TABLE IF NOT EXISTS mmt_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  agencies JSONB DEFAULT '[]'::jsonb,
  role TEXT DEFAULT '',
  naics JSONB DEFAULT '[]'::jsonb,
  notifications JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mmt_preferences_email ON mmt_preferences(email);

-- 2. Member Watchlist
CREATE TABLE IF NOT EXISTS mmt_watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  entry_title TEXT DEFAULT '',
  entry_url TEXT DEFAULT '',
  saved_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_mmt_watchlist_email ON mmt_watchlist(email);

-- 3. Member Read State
CREATE TABLE IF NOT EXISTS mmt_read_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_mmt_read_state_email ON mmt_read_state(email);

-- Enable Row Level Security
ALTER TABLE mmt_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE mmt_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE mmt_read_state ENABLE ROW LEVEL SECURITY;

-- Service role policies (functions use service key)
CREATE POLICY "Service role full access" ON mmt_preferences FOR ALL USING (true);
CREATE POLICY "Service role full access" ON mmt_watchlist FOR ALL USING (true);
CREATE POLICY "Service role full access" ON mmt_read_state FOR ALL USING (true);
