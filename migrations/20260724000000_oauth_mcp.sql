-- ============================================================================
-- OAuth 2.1 for the Agent Access MCP connector (click-to-connect)
-- Authored 2026-07-24.
--
-- Lets Claude Desktop / Claude.ai / ChatGPT add the MCP server as a connector
-- with a "Sign in" button (no pasted token). The flow mints a normal
-- api_tokens row as the access token, so lib/agent-auth validates it unchanged
-- and it appears as a revocable connection in /premium/ai-integrations.
--
-- Identity model (same as the rest of Agent Access): no Supabase Auth. RLS is
-- ON with NO permissive policy — only the service-role client (Netlify
-- functions) touches these tables; the anon/PostgREST path sees nothing.
--
-- GATED: do NOT `supabase db push`. Mary applies this manually after review,
-- per repo convention. The OAuth endpoints 503 until the tables exist.
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Registered OAuth clients (RFC 7591 Dynamic Client Registration).
--    Public clients (PKCE) — no client secret stored.
create table if not exists public.oauth_clients (
  client_id      text primary key,
  client_name    text not null default 'MCP client',
  redirect_uris  text[] not null,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

-- 2. In-flight authorization requests. Carries the OAuth params across the
--    member sign-in round trip (keyed by a short `id` so nothing sensitive is
--    round-tripped through the magic-link URL). user_id is stamped once the
--    member proves their email; the Approve step reads it server-side.
create table if not exists public.oauth_auth_requests (
  id                    text primary key,
  client_id             text not null references public.oauth_clients(client_id) on delete cascade,
  redirect_uri          text not null,
  code_challenge        text not null,
  code_challenge_method text not null default 'S256',
  scope                 text not null,
  state                 text,
  resource              text,
  login_token_hash      text,
  login_expires_at      timestamptz,
  user_id               uuid references public.mp_users(id) on delete cascade,
  email                 text,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null
);
create index if not exists oauth_auth_requests_expires_idx on public.oauth_auth_requests(expires_at);

-- 3. Authorization codes (single-use, ~60s). Bound to client + redirect_uri +
--    PKCE challenge + the resolved member.
create table if not exists public.oauth_auth_codes (
  code_hash       text primary key,
  client_id       text not null references public.oauth_clients(client_id) on delete cascade,
  redirect_uri    text not null,
  code_challenge  text not null,
  user_id         uuid not null references public.mp_users(id) on delete cascade,
  scope           text not null,
  used            boolean not null default false,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);
create index if not exists oauth_auth_codes_expires_idx on public.oauth_auth_codes(expires_at);

-- 4. Refresh tokens. Rotated on each use; each maps to the api_tokens row it
--    keeps alive, so revoking a connection (or the refresh) stops access.
create table if not exists public.oauth_refresh_tokens (
  token_hash    text primary key,
  client_id     text not null references public.oauth_clients(client_id) on delete cascade,
  user_id       uuid not null references public.mp_users(id) on delete cascade,
  api_token_id  uuid references public.api_tokens(id) on delete set null,
  scope         text not null,
  revoked       boolean not null default false,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists oauth_refresh_tokens_user_idx on public.oauth_refresh_tokens(user_id);
create index if not exists oauth_refresh_tokens_expires_idx on public.oauth_refresh_tokens(expires_at);

-- ---- RLS: ON, fail-closed (no policy), revoke PostgREST roles --------------
alter table public.oauth_clients          enable row level security;
alter table public.oauth_auth_requests    enable row level security;
alter table public.oauth_auth_codes        enable row level security;
alter table public.oauth_refresh_tokens    enable row level security;

revoke all on public.oauth_clients,
              public.oauth_auth_requests,
              public.oauth_auth_codes,
              public.oauth_refresh_tokens
  from anon, authenticated;

-- ============================================================================
-- VERIFY AFTER PUSH (Mary, manual):
--   select relname, relrowsecurity from pg_class
--     where relname like 'oauth_%';                    -- all true
--   -- no client secret column:
--   select column_name from information_schema.columns
--     where table_name='oauth_clients';                 -- no 'client_secret'
-- ============================================================================
