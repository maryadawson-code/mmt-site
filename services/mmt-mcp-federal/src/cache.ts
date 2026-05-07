// Supabase-backed 24h cache for federal-data tool calls.
// Keyed on (tool, params hash). Tools wrap the cache via withCache().
//
// Schema (apply once via supabase/migrations/2026XXXXXX_mcp_federal_cache.sql):
//   create table if not exists mcp_federal_cache (
//     tool text not null,
//     params_hash text not null,
//     payload jsonb not null,
//     stored_at timestamptz not null default now(),
//     primary key (tool, params_hash)
//   );
//   create index on mcp_federal_cache(stored_at);
//
// DM-104 (Sprint A1, 2026-05-07).

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const TTL_MS = 24 * 60 * 60 * 1000;
const TABLE = "mcp_federal_cache";

let _client: SupabaseClient | null = null;
function client(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function paramsHash(tool: string, params: unknown): string {
  return createHash("sha256")
    .update(tool + ":" + JSON.stringify(params ?? null))
    .digest("hex");
}

// Wraps a tool fetcher with a 24h Supabase cache. The fetcher returns
// { data, source_url } — withCache adds retrieved_at and cache_hit.
export async function withCache<T>(
  tool: string,
  params: unknown,
  fetcher: () => Promise<{ data: T; source_url: string }>
): Promise<{ data: T; source_url: string; retrieved_at: string; cache_hit: boolean }> {
  const sb = client();
  const hash = paramsHash(tool, params);
  const now = new Date();

  if (sb) {
    const { data: row } = await sb
      .from(TABLE)
      .select("payload, stored_at")
      .eq("tool", tool)
      .eq("params_hash", hash)
      .maybeSingle();
    if (row && row.stored_at) {
      const age = now.getTime() - new Date(row.stored_at).getTime();
      if (age < TTL_MS) {
        const cached = row.payload as { data: T; source_url: string };
        return {
          data: cached.data,
          source_url: cached.source_url,
          retrieved_at: new Date(row.stored_at).toISOString(),
          cache_hit: true,
        };
      }
    }
  }

  const fresh = await fetcher();
  const retrieved_at = now.toISOString();

  if (sb) {
    sb.from(TABLE)
      .upsert({
        tool,
        params_hash: hash,
        payload: fresh as object,
        stored_at: retrieved_at,
      })
      .then(({ error }) => {
        if (error) console.warn(`[cache] upsert failed for ${tool}: ${error.message}`);
      });
  }

  return { ...fresh, retrieved_at, cache_hit: false };
}
