-- Migration 003: MarketPulse Tables
-- Run in Supabase SQL Editor: Settings > SQL Editor
-- Run AFTER migrations/002

CREATE TABLE IF NOT EXISTS marketpulse_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  reports_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE marketpulse_usage DISABLE ROW LEVEL SECURITY;
