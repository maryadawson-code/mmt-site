-- Migration 015: intelligence_signals — cross-product intelligence flywheel
-- Stores signals extracted from user interactions (ProposalPulse submissions,
-- MarketPulse research, contract intel changes) to inform other products.

CREATE TABLE IF NOT EXISTS intelligence_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_type TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  signal_value JSONB DEFAULT '{}',
  source_product TEXT NOT NULL,
  weight NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_key
  ON intelligence_signals(signal_key, created_at);
CREATE INDEX IF NOT EXISTS idx_signals_type
  ON intelligence_signals(signal_type, created_at);
CREATE INDEX IF NOT EXISTS idx_signals_product
  ON intelligence_signals(source_product, created_at);
