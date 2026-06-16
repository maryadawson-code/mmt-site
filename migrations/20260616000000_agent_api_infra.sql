-- ============================================================================
-- Agent API infrastructure (Phase 1 — data model + RLS)
-- Branch: feat/agent-api · Authored 2026-06-16
--
-- Source of truth: docs/agent-access-schema.sql ("THIS FILE WINS"), ADAPTED to
-- mmt-site's real identity model per Mary's decision 2026-06-16:
--   - mmt-site has NO Supabase Auth. Subscribers are email-keyed in mp_users
--     (id uuid PK, email text unique). There is no auth.uid() session.
--   - Therefore: user_id FK targets mp_users(id), NOT auth.users(id).
--   - Therefore: RLS is ON for defense-in-depth but carries NO permissive
--     policy. All access is via the service-role client inside Netlify
--     functions (lib/), which bypasses RLS and enforces per-owner scoping in
--     code with explicit .eq() filters — identical to every existing paid tool
--     (entitlement.js, score-deck.js, etc.). The anon/PostgREST path sees
--     NOTHING (fail-closed), which is exactly what we want for token_hash.
--
-- GATED: do NOT `supabase db push` this. Mary applies it manually after review
-- (repo convention — every prior sprint gates migrations on her approval).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. api_tokens  (spec §6) — one row per personal access token (PAT)
--    Raw token is NEVER stored. token_hash = SHA-256 hex; token_prefix = first
--    8 chars for display. Revoke = set revoked_at (instant kill).
-- ----------------------------------------------------------------------------
create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.mp_users(id) on delete cascade,
  name          text not null,
  token_hash    text not null unique,                  -- SHA-256 hex; NEVER raw token
  token_prefix  text not null,                          -- first 8 chars, display only
  scopes        text[] not null default '{opportunities:read}',
  last_used_at  timestamptz,
  expires_at    timestamptz,                            -- nullable = no expiry
  revoked_at    timestamptz,                            -- non-null = instant kill
  created_at    timestamptz not null default now(),
  constraint api_tokens_scopes_not_empty check (array_length(scopes, 1) >= 1)
);
create index if not exists api_tokens_user_id_idx    on public.api_tokens(user_id);
create index if not exists api_tokens_token_hash_idx on public.api_tokens(token_hash);
-- Partial index: the hot path is "active tokens for this user" (CRUD list +
-- max-5 enforcement). revoked_at IS NULL = live.
create index if not exists api_tokens_user_active_idx
  on public.api_tokens(user_id) where revoked_at is null;

-- ----------------------------------------------------------------------------
-- 2. api_audit_log  (spec §6 + hardening §5) — immutable, append-only.
--    Written server-side via service role on EVERY agent request.
-- ----------------------------------------------------------------------------
create table if not exists public.api_audit_log (
  id             uuid primary key default gen_random_uuid(),
  token_id       uuid references public.api_tokens(id) on delete set null,
  user_id        uuid not null references public.mp_users(id) on delete cascade,
  endpoint       text not null,
  method         text not null,
  status_code    integer not null,
  ip             inet,
  user_agent     text,
  session_id     uuid,                                  -- hardening §2b / §5
  llm_model      text,                                   -- model the router picked, null if no LLM
  cache_hit      boolean not null default false,         -- hardening §5
  cost_usd       numeric(12,6) not null default 0,       -- USD dollars — hardening §2a/§5
  response_bytes bigint not null default 0,              -- hardening §5 (harvest detection)
  created_at     timestamptz not null default now()
);
create index if not exists api_audit_log_token_id_idx  on public.api_audit_log(token_id);
create index if not exists api_audit_log_user_id_idx    on public.api_audit_log(user_id);
create index if not exists api_audit_log_created_at_idx on public.api_audit_log(created_at);
create index if not exists api_audit_log_session_id_idx on public.api_audit_log(session_id);

-- ----------------------------------------------------------------------------
-- 3. api_cost_ledger  (hardening §2a) — per-token budget gate, read pre-call.
--    One row per (token, window_kind, window_start) bucket.
-- ----------------------------------------------------------------------------
create table if not exists public.api_cost_ledger (
  id             uuid primary key default gen_random_uuid(),
  token_id       uuid not null references public.api_tokens(id) on delete cascade,
  user_id        uuid not null references public.mp_users(id) on delete cascade,
  window_kind    text not null check (window_kind in ('day','month')),
  window_start   timestamptz not null,
  spend_usd      numeric(12,6) not null default 0,
  budget_usd     numeric(12,6) not null,
  call_count     integer not null default 0,
  updated_at     timestamptz not null default now(),
  unique (token_id, window_kind, window_start)
);
create index if not exists api_cost_ledger_token_idx
  on public.api_cost_ledger(token_id, window_kind, window_start);

-- ----------------------------------------------------------------------------
-- 4. recommended_cache  (hardening §2e) — pre-computed go/no-go scores.
--    Written by the nightly batch job; /api/v1/recommended only READS this.
-- ----------------------------------------------------------------------------
create table if not exists public.recommended_cache (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.mp_users(id) on delete cascade,
  opportunity_id  text not null,
  fit_score       numeric(5,2) not null,
  rationale       text,
  data_class      text not null default 'public' check (data_class in ('public','sensitive')),
  scored_model    text,
  scored_at       timestamptz not null default now(),
  expires_at      timestamptz,
  unique (user_id, opportunity_id)
);
create index if not exists recommended_cache_user_score_idx
  on public.recommended_cache(user_id, fit_score desc);
create index if not exists recommended_cache_expires_idx
  on public.recommended_cache(expires_at);

-- ----------------------------------------------------------------------------
-- 5. idempotency_keys  (hardening §4) — built now; used by Phase 2+ writes.
-- ----------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  id              uuid primary key default gen_random_uuid(),
  token_id        uuid not null references public.api_tokens(id) on delete cascade,
  user_id         uuid not null references public.mp_users(id) on delete cascade,
  idempotency_key text not null,
  response_body   jsonb,
  status_code     integer,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  unique (token_id, idempotency_key)
);
create index if not exists idempotency_keys_expires_idx on public.idempotency_keys(expires_at);

-- ============================================================================
-- ROW LEVEL SECURITY — ON for all five, fail-closed (no permissive policy).
-- Rationale (adaptation): no Supabase Auth = no auth.uid() to scope by, and
-- no anon/authenticated client ever touches these tables. Enabling RLS with
-- zero policies means PostgREST (anon/authenticated keys) returns nothing,
-- while the service-role client used by Netlify functions bypasses RLS. Owner
-- scoping is enforced in lib/agent-auth.js with explicit user_id filters.
-- This is strictly MORE restrictive than the as-delivered owner_select(auth.uid())
-- policies, which on this stack would always evaluate false anyway.
-- ============================================================================
alter table public.api_tokens        enable row level security;
alter table public.api_audit_log      enable row level security;
alter table public.api_cost_ledger    enable row level security;
alter table public.recommended_cache  enable row level security;
alter table public.idempotency_keys   enable row level security;

-- Belt-and-suspenders: explicitly revoke the PostgREST roles so even if a
-- future permissive policy is added by mistake, these roles have no table
-- privilege. service_role (used by our functions) is unaffected.
revoke all on public.api_tokens,
              public.api_audit_log,
              public.api_cost_ledger,
              public.recommended_cache,
              public.idempotency_keys
  from anon, authenticated;

-- ============================================================================
-- VERIFY AFTER PUSH (Mary, manual):
--   select relname, relrowsecurity from pg_class
--     where relname in ('api_tokens','api_audit_log','api_cost_ledger',
--                        'recommended_cache','idempotency_keys');   -- all true
--   -- no plaintext token column:
--   select column_name from information_schema.columns
--     where table_name='api_tokens';   -- token_hash + token_prefix only, no 'token'
--   -- uniqueness:
--   \d public.api_tokens   -- token_hash UNIQUE present
-- ============================================================================
