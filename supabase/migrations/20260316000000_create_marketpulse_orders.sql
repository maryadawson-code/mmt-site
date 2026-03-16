-- Migration: MarketPulse Orders Tracking Table
-- Tracks the full lifecycle of MarketPulse report requests

CREATE TABLE IF NOT EXISTS marketpulse_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  topic TEXT NOT NULL,
  audience TEXT,
  amount_paid INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  error_message TEXT,
  pdf_size_kb INTEGER,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE marketpulse_orders DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_marketpulse_orders_email ON marketpulse_orders(email);
CREATE INDEX idx_marketpulse_orders_status ON marketpulse_orders(status);
