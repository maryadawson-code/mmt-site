-- Cache table for the mmt-mcp-federal MCP server.
-- Tools wrap their fetchers in withCache() (services/mmt-mcp-federal/src/cache.ts);
-- entries TTL after 24h.
--
-- DM-104 (Sprint A1, 2026-05-07).

create table if not exists mcp_federal_cache (
  tool        text        not null,
  params_hash text        not null,
  payload     jsonb       not null,
  stored_at   timestamptz not null default now(),
  primary key (tool, params_hash)
);

create index if not exists mcp_federal_cache_stored_at_idx
  on mcp_federal_cache (stored_at);

-- Optional housekeeping: a job that prunes rows > 7 days old.
-- We don't enforce it here; cache reads already check 24h TTL.
