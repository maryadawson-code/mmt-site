# mmt-mcp-federal

MCP server for federal data sources. Streamable HTTP, deployed on Fly.io.

## Tools (9 named, count varies by gate-check definition)

| Name | Source | Auth |
|---|---|---|
| `sam_search_opportunities` | SAM.gov Opportunities API | `SAM_GOV_API_KEY` |
| `sam_search_awards` | USASpending v2 (SAM.gov Contract Data API was decommissioned 2026-02-24) | none |
| `usaspending_naics_summary` | USASpending v2 | none |
| `usaspending_recipient_awards` | USASpending v2 | none |
| `fedreg_search` | FederalRegister.gov v1 | none |
| `fedreg_document` | FederalRegister.gov v1 | none |
| `congress_search_bills` | Congress.gov v3 | `CONGRESS_GOV_API_KEY` |
| `grants_search_opportunities` | Grants.gov v1 | none |
| `gao_recent_decisions` | GAO RSS | none |

## Capability card

`GET /.well-known/mcp-server-card.json` lists every tool with current status.

## Local dev

```bash
cd services/mmt-mcp-federal
npm install
npm run dev
# server on :3001

# In another shell:
curl http://localhost:3001/.well-known/mcp-server-card.json | jq
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"sam_search_opportunities","arguments":{"keyword":"DHA","limit":3}}}'
```

## Deploy (Fly.io)

See top of `fly.toml`.

## Conventions

- Every tool returns `{success, data, source_url, retrieved_at, cache_hit, latency_ms}`. The `source_url` is the inline citation Digital Mary surfaces in answers.
- No tool returns more than 25 results. Pagination via `limit` + (future) cursor.
- 24h Supabase-backed cache keyed on `(tool, sha256(params))`.
- SAM.gov rate limit (900 req/hr) enforced via internal token bucket; over-budget calls throw `RateLimitError` rather than 429 the upstream.
