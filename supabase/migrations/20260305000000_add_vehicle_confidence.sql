-- Add AI confidence predictions to opportunity_radar
ALTER TABLE opportunity_radar
  ADD COLUMN IF NOT EXISTS vehicle_confidence integer,
  ADD COLUMN IF NOT EXISTS vehicle_reasoning text DEFAULT '';
