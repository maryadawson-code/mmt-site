-- ============================================================
-- Opportunity Radar table
-- Stores AI-discovered federal health IT procurement opportunities.
-- Written by: opportunity-radar-background.js (daily scan)
-- Read by: opportunity-feed.js (GET endpoint for frontend)
-- ============================================================

create table if not exists opportunity_radar (
  id              bigint generated always as identity primary key,
  title           text not null,
  solicitation_number text,
  agency          text not null default 'Unknown',
  description     text default '',
  value_estimate  text default '',
  response_deadline text,                -- ISO 8601 date string from AI; kept as text for flexibility
  set_aside_type  text default '',
  naics_codes     jsonb default '[]'::jsonb,
  source_url      text default '',
  relevance_score integer default 50,
  opportunity_type text default 'solicitation',
  small_business_eligible boolean default false,
  ai_summary      text default '',
  scan_date       date not null default current_date,
  model_used      text,
  created_at      timestamptz default now()
);

-- Unique constraint on solicitation_number for upsert (onConflict: "solicitation_number")
-- NULLs are not considered duplicates in PostgreSQL, so opportunities
-- without a solicitation number are handled by the title unique index below.
alter table opportunity_radar
  add constraint opportunity_radar_solicitation_number_key
  unique (solicitation_number);

-- Unique index on title for deduplication of opportunities without solicitation numbers.
-- The code catches error 23505 on insert and skips silently.
create unique index if not exists opportunity_radar_title_key
  on opportunity_radar (title);

-- Query indexes matching opportunity-feed.js filters and ordering
create index if not exists idx_opportunity_radar_scan_date
  on opportunity_radar (scan_date desc);

create index if not exists idx_opportunity_radar_relevance
  on opportunity_radar (relevance_score desc);

create index if not exists idx_opportunity_radar_set_aside
  on opportunity_radar (set_aside_type)
  where set_aside_type != '';

create index if not exists idx_opportunity_radar_small_biz
  on opportunity_radar (small_business_eligible)
  where small_business_eligible = true;

-- Enable RLS (service key bypasses it, but good practice)
alter table opportunity_radar enable row level security;

-- Allow service role full access (Netlify functions use SUPABASE_SERVICE_KEY)
-- No anon/public policies needed — data is served through Netlify functions, not direct client access.
