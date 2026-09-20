-- ============================================================================
-- Agent Access metering columns (docs/agent-platform-spec.md sections 2 and 6)
-- Authored 2026-09-20 on branch claude/agency-content-coverage-expansion-7egskp
--
-- Every agent call already writes one api_audit_log row. This adds the fields
-- the platform spec's metering and usage statement need:
--   request_id       the id every response carries (X-Request-Id and, on an
--                    error, the body's request_id) so a caller's report maps to
--                    exactly one log row
--   client_ref       the caller-supplied X-MMT-Client-Ref header. OPAQUE to
--                    MMT: a grouping key on the monthly statement, never parsed
--                    and never treated as identifying data
--   tool             the MCP tool name or REST endpoint
--   scope            the scope the call required
--   records_returned rows in the response's data[]
--
-- The code degrades until this is applied: lib/agent-auth.js retries the
-- insert with the legacy column set when PostgREST reports a missing column,
-- and lib/agent-usage.js reads the legacy columns. Statements before the
-- migration therefore have no client_ref breakdown.
--
-- GATED: do NOT `supabase db push` this. Mary applies it through the Supabase
-- Management API after review (repo convention).
-- ============================================================================

alter table public.api_audit_log
  add column if not exists request_id       uuid,
  add column if not exists client_ref       text,
  add column if not exists tool             text,
  add column if not exists scope            text,
  add column if not exists records_returned integer;

comment on column public.api_audit_log.client_ref is
  'Caller-supplied X-MMT-Client-Ref. Opaque to MMT: a grouping key for the usage statement only, never identifying data.';

-- The statement reads one token's rows for one month, in order.
create index if not exists api_audit_log_token_created_idx
  on public.api_audit_log(token_id, created_at);
-- A caller's request_id maps to one row.
create index if not exists api_audit_log_request_id_idx
  on public.api_audit_log(request_id) where request_id is not null;

-- ============================================================================
-- VERIFY AFTER APPLY (Mary, manual):
--   select column_name from information_schema.columns
--     where table_name = 'api_audit_log'
--       and column_name in ('request_id','client_ref','tool','scope','records_returned');  -- 5 rows
-- ============================================================================
