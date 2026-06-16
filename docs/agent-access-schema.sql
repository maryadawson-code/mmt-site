-- ============================================================================
-- CANONICAL SCHEMA — AI Agent Access for Mission Meets Tech
-- Owner: Mary Womack · Companion to mmt_agent_access_spec.md + _hardening.md
-- This is the AUTHORITATIVE data model. Claude Code: COPY this. Do NOT invent
-- columns, types, or policies. If something here conflicts with the prose specs,
-- THIS FILE WINS. Apply via `supabase db push`.
--
-- Tables: api_tokens, api_audit_log, api_cost_ledger, recommended_cache,
--         idempotency_keys. RLS ON all five. Owner reads via user_id = auth.uid().
--         audit/ledger/cache/idempotency: writes via service_role only.
--
-- ⚠️ REPO-REALITY NOTE (added 2026-06-16, feat/agent-api):
-- mmt-site does NOT use Supabase Auth. Subscribers are keyed by EMAIL in
-- mp_users; there is no auth.users session and auth.uid() is always NULL on an
-- agent request. The `references auth.users(id)` FK + `auth.uid()` RLS below are
-- therefore NOT directly buildable here without a decision (bridge to Supabase
-- Auth vs. adapt identity to mp_users). The authored migration in migrations/
-- reflects Mary's chosen path; this file is preserved AS DELIVERED for the record.
-- ============================================================================

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. api_tokens  (spec §6 — full canonical form)
-- ----------------------------------------------------------------------------
create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  token_hash    text not null unique,                 -- SHA-256 hex; NEVER raw token
  token_prefix  text not null,                         -- first 8 chars, display only
  scopes        text[] not null default '{opportunities:read}',
  last_used_at  timestamptz,
  expires_at    timestamptz,                           -- nullable = no expiry
  revoked_at    timestamptz,                           -- non-null = instant kill
  created_at    timestamptz not null default now(),
  constraint api_tokens_scopes_not_empty check (array_length(scopes, 1) >= 1)
);
create index if not exists api_tokens_user_id_idx    on public.api_tokens(user_id);
create index if not exists api_tokens_token_hash_idx on public.api_tokens(token_hash);

-- ----------------------------------------------------------------------------
-- 2. api_audit_log  (spec §6 base + hardening §5 cost/attribution columns)
--    Immutable, append-only. No client update/delete.
-- ----------------------------------------------------------------------------
create table if not exists public.api_audit_log (
  id             uuid primary key default gen_random_uuid(),
  token_id       uuid references public.api_tokens(id) on delete set null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  endpoint       text not null,
  method         text not null,
  status_code    integer not null,
  ip             inet,
  user_agent     text,
  session_id     uuid,                                 -- hardening §2b / §5
  llm_model      text,                                  -- model the router picked, null if no LLM call
  cache_hit      boolean not null default false,        -- hardening §5
  cost_usd       numeric(12,6) not null default 0,      -- USD, not cents — hardening §2a/§5
  response_bytes bigint not null default 0,             -- hardening §5 (harvest detection)
  created_at     timestamptz not null default now()
);
create index if not exists api_audit_log_token_id_idx   on public.api_audit_log(token_id);
create index if not exists api_audit_log_user_id_idx     on public.api_audit_log(user_id);
create index if not exists api_audit_log_created_at_idx  on public.api_audit_log(created_at);
create index if not exists api_audit_log_session_id_idx  on public.api_audit_log(session_id);

-- ----------------------------------------------------------------------------
-- 3. api_cost_ledger  (hardening §2a — per-key budget gate, pre-call)
--    One row per token per sliding window bucket. Read BEFORE any LLM call.
-- ----------------------------------------------------------------------------
create table if not exists public.api_cost_ledger (
  id             uuid primary key default gen_random_uuid(),
  token_id       uuid not null references public.api_tokens(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  window_kind    text not null check (window_kind in ('day','month')),  -- 24h sliding + month
  window_start   timestamptz not null,                 -- bucket start (sliding window anchor)
  spend_usd      numeric(12,6) not null default 0,      -- running USD this window
  budget_usd     numeric(12,6) not null,                -- cap for this window/tier
  call_count     integer not null default 0,
  updated_at     timestamptz not null default now(),
  unique (token_id, window_kind, window_start)
);
create index if not exists api_cost_ledger_token_idx on public.api_cost_ledger(token_id, window_kind, window_start);

-- ----------------------------------------------------------------------------
-- 4. recommended_cache  (hardening §2e — pre-computed go/no-go scores)
--    Written by nightly Batch job. /api/v1/recommended READS this; NO live LLM.
-- ----------------------------------------------------------------------------
create table if not exists public.recommended_cache (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  opportunity_id  text not null,                        -- source opp identifier (SAM.gov etc.)
  fit_score       numeric(5,2) not null,                -- 0.00–100.00, higher = better fit
  rationale       text,                                  -- short model-generated justification
  data_class      text not null default 'public' check (data_class in ('public','sensitive')),
  scored_model    text,                                  -- which model produced the score
  scored_at       timestamptz not null default now(),
  expires_at      timestamptz,                           -- re-score after this; nullable
  unique (user_id, opportunity_id)
);
create index if not exists recommended_cache_user_score_idx on public.recommended_cache(user_id, fit_score desc);
create index if not exists recommended_cache_expires_idx     on public.recommended_cache(expires_at);

-- ----------------------------------------------------------------------------
-- 5. idempotency_keys  (hardening §4 — build now, used by Phase 2 writes)
-- ----------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  id              uuid primary key default gen_random_uuid(),
  token_id        uuid not null references public.api_tokens(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  response_body   jsonb,
  status_code     integer,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  unique (token_id, idempotency_key)
);
create index if not exists idempotency_keys_expires_idx on public.idempotency_keys(expires_at);

-- ============================================================================
-- ROW LEVEL SECURITY — enable on all five tables
-- ============================================================================
alter table public.api_tokens        enable row level security;
alter table public.api_audit_log      enable row level security;
alter table public.api_cost_ledger    enable row level security;
alter table public.recommended_cache  enable row level security;
alter table public.idempotency_keys   enable row level security;

-- api_tokens: owner full self-service (the settings UI runs as the user session)
create policy api_tokens_owner_select on public.api_tokens
  for select using (user_id = auth.uid());
create policy api_tokens_owner_insert on public.api_tokens
  for insert with check (user_id = auth.uid());
create policy api_tokens_owner_update on public.api_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy api_tokens_owner_delete on public.api_tokens
  for delete using (user_id = auth.uid());

-- api_audit_log: owner may READ own rows; inserts/updates/deletes via service_role only
-- (no client INSERT/UPDATE/DELETE policy = append happens server-side with service key,
--  which bypasses RLS; clients get read-only of their own rows). Immutable to clients.
create policy api_audit_log_owner_select on public.api_audit_log
  for select using (user_id = auth.uid());

-- api_cost_ledger: owner READ-ONLY (so UI can show usage); writes via service_role only
create policy api_cost_ledger_owner_select on public.api_cost_ledger
  for select using (user_id = auth.uid());

-- recommended_cache: owner READ-ONLY; nightly Batch job writes via service_role
create policy recommended_cache_owner_select on public.recommended_cache
  for select using (user_id = auth.uid());

-- idempotency_keys: NO client policy — service_role only (internal write-dedup table).
-- RLS enabled with zero policies = clients see nothing; server uses service key.

-- ============================================================================
-- NOTES FOR THE BUILD AGENT
-- - Agent read API (lib/agent-auth.js) sets request context to the token's user_id
--   so the owner_select policies scope every read. NEVER use service_role for agent reads.
-- - service_role is used ONLY for: writing audit rows, updating the cost ledger,
--   writing recommended_cache (nightly Batch), and idempotency dedup. Never on a read path.
-- - cost_usd / spend_usd / budget_usd are NUMERIC USD (dollars), never cents.
-- - Verify after push: every table has rowsecurity = true in pg_tables; no plaintext
--   token column exists; api_tokens.token_hash is unique.
-- ============================================================================
