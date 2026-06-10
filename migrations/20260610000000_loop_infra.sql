-- ============================================================
-- 20260610000000_loop_infra.sql — MMT Loop System v1 shared schema
--
-- Adds the run ledger + eval store + per-loop config that the loop
-- runner (netlify/functions/lib/loops/runner.js) writes to, plus the
-- ISOLATED output tables for the three loops shipped in v1:
--   L1 opportunity_discovery  -> loop_opportunities  (staged, NOT the
--                                live opportunity_radar table — loops
--                                stage data, a human promotes it)
--   L3 contract_tracker_freshness -> loop_status     (source health +
--                                lag, served at /status.json)
--
-- (Agency drift detection is intentionally NOT included: the existing
--  org-chart-monitor.js already hashes agency leadership pages and
--  alerts Mary on change. No second change-detector / table is added.)
--
-- GATED: do NOT apply to production until Mary approves. Idempotent
-- (create-if-not-exists), no destructive statements, safe to re-run.
-- ============================================================

-- One row per loop execution -------------------------------------------------
create table if not exists loop_runs (
  id          uuid primary key default gen_random_uuid(),
  loop_name   text not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  status      text not null check (status in ('running','pass','fail','drift','skipped')),
  trigger     text,                       -- 'cron' | 'webhook' | 'manual'
  input_hash  text,                       -- idempotency key (hash of fetched input)
  output_ref  text,                       -- storage path or row id of produced output
  cost_usd    numeric(10,4) default 0,
  error       text
);
create index if not exists idx_loop_runs_name_started on loop_runs(loop_name, started_at desc);
create index if not exists idx_loop_runs_input_hash    on loop_runs(loop_name, input_hash);

-- One row per eval inside a run (a run may have N evals) ----------------------
create table if not exists loop_evals (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid references loop_runs(id) on delete cascade,
  eval_name  text not null,
  passed     boolean,
  score      numeric,
  threshold  numeric,
  details    jsonb default '{}'::jsonb
);
create index if not exists idx_loop_evals_run on loop_evals(run_id);

-- Loop config (disable / retune a loop without a code deploy) -----------------
create table if not exists loop_config (
  loop_name    text primary key,
  enabled      boolean not null default true,
  cron_expr    text,
  alert_email  text default 'mary@missionmeetstech.com',
  max_cost_usd numeric(10,4) not null default 1.00,
  notes        text,
  updated_at   timestamptz default now()
);

-- L1 staged output. Deliberately separate from opportunity_radar so a
-- loop bug can never corrupt the live premium tracker. Mary/an importer
-- promotes reviewed rows; the loop only ever upserts here.
create table if not exists loop_opportunities (
  notice_id        text primary key,
  title            text,
  solicitation_number text,
  type             text,
  agency           text,
  naics            text,
  set_aside        text,
  posted_date      timestamptz,
  response_deadline timestamptz,
  sam_url          text,
  incumbents       jsonb default '[]'::jsonb,   -- top USASpending incumbents on NAICS+agency
  pursuit_score    numeric,
  pursuit_verdict  text,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  source_run_id    uuid references loop_runs(id) on delete set null
);
create index if not exists idx_loop_opps_score on loop_opportunities(pursuit_score desc nulls last);

-- L3 source-health snapshot. /status.json reads the newest row per source.
create table if not exists loop_status (
  id           uuid primary key default gen_random_uuid(),
  checked_at   timestamptz not null default now(),
  source       text not null,             -- sam_gov | usaspending | fpds | gao
  http_status  integer,
  latency_ms   integer,
  lag_hours    numeric,                   -- now - max(updated_at) of that source's rows
  healthy      boolean,
  run_id       uuid references loop_runs(id) on delete set null
);
create index if not exists idx_loop_status_source_checked on loop_status(source, checked_at desc);

-- Seed config for the two v1 loops (idempotent upsert).
insert into loop_config (loop_name, enabled, cron_expr, max_cost_usd, notes) values
  ('opportunity_discovery',     true, '0 12 * * *', 0.75, 'L1 — SAM.gov daily discovery + dedupe + incumbent enrich + quota-safe heuristic score'),
  ('contract_tracker_freshness',true, '0 * * * *',  0.05, 'L3 — hourly source health + lag, served at /status.json')
on conflict (loop_name) do nothing;
