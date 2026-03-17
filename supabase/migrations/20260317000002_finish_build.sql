-- Finish Build Migration
-- Adds retrigger_count to marketpulse_orders for tactical-brief-cleanup.

ALTER TABLE marketpulse_orders
  ADD COLUMN IF NOT EXISTS retrigger_count INTEGER DEFAULT 0;
