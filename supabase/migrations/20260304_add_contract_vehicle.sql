-- ============================================================
-- Add contract_vehicle column to opportunity_radar
-- Supports the SB Vehicle Radar scanner which tags opportunities
-- with their specific contract vehicle (OASIS+, CIO-SP4, etc.)
-- ============================================================

alter table opportunity_radar
  add column if not exists contract_vehicle text default null;

create index if not exists idx_opportunity_radar_vehicle
  on opportunity_radar (contract_vehicle)
  where contract_vehicle is not null;
