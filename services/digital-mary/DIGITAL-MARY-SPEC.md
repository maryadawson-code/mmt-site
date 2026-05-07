# Digital Mary — Full Executable Spec

**Date:** May 6, 2026
**Source:** DIGITAL-MARY-PLAN-V2.md (architecture decisions ratified there).
**Format:** Single MD package. 13 sprints across 4 phases. One PR per sprint. Each sprint ≤ 60 lines per `prompt-sizing` rules.
**Hand to:** Claude Code, executes in order.

---

## Master Run Order

| # | Phase | Sprint | Tickets | Theme | Duration |
|---|---|---|---|---|---|
| 0 | 0 — Eval | P0-1 | DM-001 → DM-004 | Langfuse + 100 golden prompts + LLM-as-judge | 1 week |
| 1 | 1 — Foundation | A1 | DM-101 → DM-104 | MCP server `mmt-mcp-federal` | 1 week |
| 2 | 1 — Foundation | A2 | DM-201 → DM-204 | Knowledge graph + entity resolver + canonical cache | 1 week |
| 3 | 1 — Foundation | A3 | DM-301 → DM-304 | Agentic retrieval loop + Cohere Rerank + topic taxonomy | 1 week |
| 4 | 1 — Foundation | A4 | DM-401 → DM-404 | System prompt + capability manifest + voice library + 8 GenUI components | 1 week |
| 5 | 2 — Platform | B1 | DM-501 → DM-504 | MCP server `mmt-mcp-platform` | 1 week |
| 6 | 2 — Platform | B2 | DM-601 → DM-604 | 4-type memory + personalization | 1 week |
| 7 | 2 — Platform | B3 | DM-701 → DM-704 | Action layer (alerts, briefs, calendar, email) | 1 week |
| 8 | 2 — Platform | B4 | DM-801 → DM-803 | Capture brief generator (GenUI component) | 1 week |
| 9 | 3 — Stickiness | C1 | DM-901 → DM-904 | Capture coaching mode (5-step interactive flow) | 2 weeks |
| 10 | 3 — Stickiness | C2 | DM-1001 → DM-1003 | Proposal narrative drafting | 2 weeks |
| 11 | 3 — Stickiness | C3 | DM-1101 → DM-1104 | Multi-channel: Slack + email-in + voice | 2 weeks |
| 12 | 3 — Stickiness | C4 | DM-1201 → DM-1203 | Public MCP endpoint for institutional buyers | 1 week |

**Total: 15 weeks of focused execution.** Phases run sequentially; sprints within a phase run sequentially.

---

## Pre-flight (run once at session start)

```
cd ~/Projects/mmt-site
git status && git branch --show-current  # must be clean + on main
git pull origin main
node --version  # ≥ 20
npm --version
```

If branch ≠ main or working tree dirty: stash with `cross-agent-wip`, do not pop. Report to Mary.

## Architecture (target end-state)

```
┌─────────────────────────────────────────────────────────────┐
│ 10. Generative UI — AG-UI components rendered inline         │
│ 9.  Memory — working / semantic / episodic / procedural      │
│ 8.  Personalization — Plausible + Buttondown signals         │
│ 7.  Action — saved alerts, briefs, calendar, email           │
│ 6.  Reasoning — Claude Sonnet 4.6 agentic loop               │
│ 5.  Hybrid retrieval — graph + vector + rerank + canonical   │
│ 4.  MCP servers — mmt-mcp-federal, mmt-mcp-platform          │
│ 3.  Entity resolver + alias map                              │
│ 2.  Auth & tier gate (Supabase + Stripe)                     │
│ 1.  Eval & observability (Langfuse + golden set)             │
└─────────────────────────────────────────────────────────────┘
```

## Out of scope (do not touch)

- Any article in `/intelligence/`, `/topics/`, `/latest/`, `/newswire/`
- Newsletter archive content
- Pricing page copy (covered by paywall enrichment sprints)
- ProposalPulse or MissionPulse code unless a sprint explicitly names it

## Cross-sprint conventions

- All new server code in `services/` directory at repo root (parallel to `netlify/`)
- All new client code in `client/ask-mmt/`
- Database changes via Supabase migrations in `supabase/migrations/`
- Each sprint ends with a single squashed commit + PR

---

# PHASE 0 — Eval Scaffold

**Why first:** Without baseline measurement, every later sprint is guessing whether it improved anything. Phase 0 takes 1 week and saves rework downstream.

---

## SPRINT P0-1 — Langfuse + Golden Set + LLM-as-Judge

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Stand up eval infra before any feature work.

## Read first
- `package.json` (current deps)
- `netlify/functions/` (existing function pattern)
- Mary's article corpus path (likely `content/articles/` — verify)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-001 | `services/langfuse/docker-compose.yml` (new); `services/langfuse/README.md` (new); `.env.example` (edit) | Self-host Langfuse on Fly.io. Compose file + deploy script + env vars (LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST). Mary deploys via `fly launch` once. |
| DM-002 | `eval/golden-set.jsonl` (new, 100 entries); `eval/README.md` (new) | 100 golden prompts: 30 entity lookups, 30 capture questions, 20 platform actions, 20 traps. Each row: {id, prompt, ideal_answer, category, scoring_rubric}. Mary writes ideal_answer for 30; Claude Code drafts the other 70 from existing MMT articles for Mary review. |
| DM-003 | `eval/llm-judge.js` (new); `eval/run-eval.js` (new); `eval/scoring.js` (new) | LLM-as-judge: 4 scorers (faithfulness, voice-match, action-correctness, latency). Judge model = Claude Opus 4.7. `run-eval.js` runs all 100 prompts against current Ask MMT, writes scores to Langfuse. |
| DM-004 | `.github/workflows/nightly-eval.yml` (new); `eval/baseline.md` (new) | GitHub Action runs eval nightly at 03:00 UTC, posts summary to Slack via webhook. baseline.md captures today's score before any V2 work — the floor everything must beat. |

## Details
- **Langfuse self-host:** use official compose. Fly.io tier ~$5/mo. Postgres backed by Supabase or Fly volume.
- **Golden set categories (exact distribution):**
  - 30 entity lookups: OASIS+, T4NG2, MHS GENESIS, HCDS, DHA OMNIBUS IV, RHRP-4, HOPSS, etc.
  - 30 capture questions: "best IDIQ for WOSB in health IT", "what's coming on DHA Q3 2026", multi-hop relationship queries
  - 20 platform actions: "save alert for SAM postings on data governance", "generate 1-pager on HCDS"
  - 20 traps: ambiguous ("its genesis"), capability-claims ("you can search SAM"), hallucination bait ("$510M Joint Data IDIQ"), off-scope ("legal advice on protests")
- **Scoring rubric per row:** 1-10 on each axis. Trap rows score 10 only if helper *correctly refuses or disambiguates*.
- **Voice-match scorer prompt:** "Does this answer sound like Mary Womack writing for federal health IT capture professionals? Score 1-10. Penalize: corporate hedging, generic AI tone, missing 'what to do' close, leaked scaffolding terms like 'verified facts block.'"
- Do NOT touch existing Ask MMT code yet. This sprint only measures.

```
git add -A && git commit -m "feat(eval): Phase 0 — Langfuse + 100-prompt golden set + nightly LLM-as-judge"
```

## GATE CHECK
```
test -f services/langfuse/docker-compose.yml && test -f eval/golden-set.jsonl
wc -l eval/golden-set.jsonl  # expect 100
node eval/run-eval.js --dry-run  # exits 0
test -f .github/workflows/nightly-eval.yml
test -f eval/baseline.md  # baseline scores recorded
```

---

# PHASE 1 — Foundation (Sprints A1–A4)

**Goal:** All 8 transcript failures fixed. Eval scores improve measurably over baseline.

---

## SPRINT A1 — MCP Server `mmt-mcp-federal`

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Build standalone MCP server for federal data sources.

## Read first
- https://modelcontextprotocol.io/specification/server (spec)
- `services/` directory (created in P0-1)
- Existing federal API code if any (`netlify/functions/` for SAM/USASpending wrappers)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-101 | `services/mmt-mcp-federal/package.json` (new); `services/mmt-mcp-federal/server.ts` (new); `services/mmt-mcp-federal/src/transport.ts` (new) | Bootstrap MCP server using `@modelcontextprotocol/sdk` Streamable HTTP transport. Stateless, deployable to Fly.io. Exposes `.well-known/mcp-server-card.json`. |
| DM-102 | `services/mmt-mcp-federal/src/tools/sam-gov.ts` (new); `services/mmt-mcp-federal/src/tools/usaspending.ts` (new); `services/mmt-mcp-federal/src/tools/federal-register.ts` (new) | Three tools: `sam_search_opportunities`, `sam_search_awards`, `usaspending_naics_summary`, `usaspending_recipient_awards`, `fedreg_search`, `fedreg_document`. Each is an MCP tool with strict JSON schema. |
| DM-103 | `services/mmt-mcp-federal/src/tools/congress.ts` (new); `services/mmt-mcp-federal/src/tools/grants.ts` (new); `services/mmt-mcp-federal/src/tools/gao.ts` (new) | Three more tools: `congress_search_bills`, `grants_search_opportunities`, `gao_recent_decisions`. GAO via RSS feed since no public API. |
| DM-104 | `services/mmt-mcp-federal/src/cache.ts` (new); `services/mmt-mcp-federal/fly.toml` (new); `services/mmt-mcp-federal/Dockerfile` (new) | Supabase-backed 24h cache keyed on (tool, params hash). Fly.io deploy config. Dockerfile multi-stage build. |

## Details
- **All API keys** stored as Fly secrets; never hardcoded. Server reads from env at boot.
- **Rate limit guard:** SAM.gov 900 req/hr — internal token bucket; refuse rather than 429.
- **Tool response format:** every tool returns `{success, data, source_url, retrieved_at, cache_hit}`. The `source_url` field becomes the inline citation in Digital Mary's answers.
- **No tool returns more than 25 results.** Pagination via cursor. Long lists summarize counts and offer `limit`/`offset` params.
- **Capability card** at `/.well-known/mcp-server-card.json` lists every tool, its description, and current status (live | rate_limited | down). This is what Layer 4 of the architecture reads.

```
git add -A && git commit -m "feat(mcp): mmt-mcp-federal — 8 federal data tools (SAM, USASpending, FedReg, Congress, Grants, GAO)"
```

## GATE CHECK
```
cd services/mmt-mcp-federal && npm run build  # compiles
node dist/server.js --check  # boots, lists 8 tools, exits 0
curl http://localhost:3001/.well-known/mcp-server-card.json | jq '.tools | length'  # 8
curl -X POST http://localhost:3001/mcp -d '{"method":"tools/call","params":{"name":"sam_search_opportunities","arguments":{"keyword":"DHA","limit":3}}}' | jq '.result.data | length'  # 1-3
```

---

## SPRINT A2 — Knowledge Graph + Entity Resolver + Canonical Cache

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Build the relationship layer that makes multi-hop reasoning work.

## Read first
- `supabase/migrations/` (existing migration pattern)
- DM-101 capability card (tools available for graph enrichment)
- Mary's article corpus (entities to extract)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-201 | `supabase/migrations/2026XXXXXX_graph_schema.sql` (new) | Graph schema in Postgres: tables `gx_node` (id, type, canonical_name, properties jsonb, embedding vector(1536)), `gx_edge` (from, to, relation, properties jsonb, weight). Uses pgvector for hybrid search. Indexes: btree on canonical_name, ivfflat on embedding, btree on (from, relation). |
| DM-202 | `data/entity-aliases.json` (new, ≥200 entities); `services/mmt-mcp-content/src/resolver.ts` (new); `services/mmt-mcp-content/src/tools/resolve-entity.ts` (new) | Alias resolver: flat alias→canonical_id map. Levenshtein ≤ 2 for typos. Returns top 3 candidates with confidence scores. Exposed as MCP tool `resolve_entity`. |
| DM-203 | `data/canonical-answers/` (new dir, 50 JSON files); `scripts/generate-canonical.js` (new); `scripts/refresh-canonical.js` (new) | 50 canonical answer files for top entities. Schema: {entity_id, summary, body, last_updated, sources[], related_entities[], next_action, watch_signals[]}. `generate-canonical.js` seeds from existing articles + federal API enrichment. `refresh-canonical.js` runs nightly. |
| DM-204 | `scripts/build-graph.js` (new); `services/mmt-mcp-content/src/tools/graph-traverse.ts` (new) | One-time graph builder: extract entities from articles using Claude Haiku, populate gx_node/gx_edge. MCP tool `graph_traverse(start_entity, relation_chain, max_hops)` for multi-hop queries. |

## Details
- **Node types:** Vehicle, Agency, Contractor, Person, Article, Topic, Solicitation, Program.
- **Edge relations:** incumbent_of, awarded_to, covers_naics, mentions, succeeds, competes_with, leads, manages, parent_company, subcontracts.
- **Seed entities (must exist in alias map after this sprint):** OASIS+, T4NG2, MHS GENESIS, HCDS, DHA OMNIBUS IV, RHRP-4, HOPSS, CIO-SP4, SEWP VI, GSA MAS, VETS 2, T4NG, EIDS, JOMIS, plus all agencies (DHA, VA, HHS, ARPA-H, CMS, ONC, FDA, NIH, CDC), plus 50+ contractors.
- **Aliases per entity:** average 4 (e.g., "OMNIBUS 4" / "OMNIBUS IV" / "DHA OMNIBUS" / "HT001122" all → `dha-omnibus-iv`).
- **Graph extraction prompt** uses Claude Haiku 4.5 — cheap, fast. Run async; takes ~30 min for 73 articles, ~$2 in API.
- **Canonical answers** must each include `last_updated` and `next_action`. These are non-negotiable schema fields.

```
git add -A && git commit -m "feat(graph): knowledge graph schema + alias resolver + 50 canonical answers"
```

## GATE CHECK
```
psql $SUPABASE_DB -c "SELECT count(*) FROM gx_node WHERE type='Vehicle'"  # ≥ 14
psql $SUPABASE_DB -c "SELECT count(*) FROM gx_edge"  # ≥ 200
ls data/canonical-answers/*.json | wc -l  # ≥ 50
node -e "const a=require('./data/entity-aliases.json'); process.exit(Object.keys(a).length>=200?0:1)"
node scripts/test-resolver.js "OMNIBUS 4"  # returns dha-omnibus-iv with confidence ≥ 0.95
node scripts/test-graph.js "DHA" "incumbent_of" 2  # returns ≥ 5 incumbents within 2 hops
```

---

## SPRINT A3 — Agentic Retrieval Loop + Rerank + Topic Taxonomy

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Replace flat retrieval with agentic plan→retrieve→reflect loop.

## Read first
- DM-201 graph schema
- DM-104 cache implementation
- Cohere Rerank 3.5 docs: https://docs.cohere.com/reference/rerank

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-301 | `data/topics.json` (new, ~40 topics); `scripts/tag-articles.js` (new); `supabase/migrations/2026XXXXXX_article_topics.sql` (new) | Topic taxonomy: 40 topics covering federal health IT scope. Backfill tag every existing article (1-3 topics each). New articles tagged on publish via OpenClaw hook. |
| DM-302 | `services/digital-mary/src/retrieval.ts` (new); `services/digital-mary/src/rerank.ts` (new) | Hybrid retrieval: 1) graph traversal for entity-anchored queries, 2) vector search via Supabase pgvector for topic queries, 3) Cohere Rerank 3.5 on combined results, 4) canonical answer cache as fast-path before any of the above. |
| DM-303 | `services/digital-mary/src/agent-loop.ts` (new); `services/digital-mary/src/planner.ts` (new); `services/digital-mary/src/reflector.ts` (new) | Agentic loop: planner uses Claude Sonnet 4.6 extended thinking to decide which MCP tools to call; reflector checks if results are sufficient, retries with adjusted plan if not. Max 3 iterations per turn to bound cost. |
| DM-304 | `services/digital-mary/src/turn.ts` (new); `services/digital-mary/src/types.ts` (new) | `handleTurn(userId, message, threadId)` orchestrates: auth → resolve entities → plan → retrieve → answer → log to Langfuse. Returns structured turn result with sources, confidence, suggested follow-ups. |

## Details
- **Topic list (anchor 10, balance 30 around them):** small-business-setasides, 8a-program, data-governance, cybersecurity, cloud-modernization, ehr, telehealth, ai-clinical, interoperability, regulatory-far.
- **Retrieval cascade order:** canonical (fastest) → graph (entity-anchored) → vector (topic) → federal API (live data) → web search (last resort).
- **Cohere Rerank** on top of combined graph+vector results before passing to LLM. Top 8 chunks max.
- **Agent loop budget:** plan = 1 LLM call, retrieve = 1-5 tool calls, reflect = 1 LLM call, answer = 1 LLM call. Worst case ~$0.10/turn; typical ~$0.05.
- **Reflection trigger:** reflector outputs JSON `{sufficient: bool, gaps: [], suggested_followups: []}`. If not sufficient AND iteration < 3, re-plan with gap-filling tools.

```
git add -A && git commit -m "feat(agent): agentic retrieval loop + Cohere Rerank + topic taxonomy"
```

## GATE CHECK
```
psql $SUPABASE_DB -c "SELECT count(DISTINCT article_id) FROM article_topics"  # ≥ 73
node scripts/test-retrieval.js "what did mary cover on small business set-asides"  # returns ≥ 3 articles tagged small-business-setasides
node scripts/test-agent.js "compare OASIS+ and CIO-SP4 for a WOSB"  # multi-hop, completes in ≤ 3 iterations
node eval/run-eval.js --suite=phase1-mid  # score improves over P0-1 baseline by ≥ 15%
```

---

## SPRINT A4 — System Prompt + Capability Manifest + Voice Library + 8 GenUI Components

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Lock voice + render generative UI. Phase 1 ships at end of this sprint.

## Read first
- `paste.txt` (transcript — voice anti-patterns to enforce against)
- 50 canonical answers from DM-203 (voice exemplars)
- AG-UI spec: https://docs.ag-ui.dev

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-401 | `services/digital-mary/prompts/system.md` (new); `services/digital-mary/prompts/capability-manifest.json` (new); `services/digital-mary/prompts/voice-rules.md` (new) | System prompt with hard voice rules: never write "verified facts block," every answer ends with action line OR clarifying question, today-aware (`{{today}}` interpolated), refuse claims not in capability manifest. Manifest auto-generated from MCP server cards at boot. |
| DM-402 | `data/voice-exemplars.jsonl` (new, 50 entries); `services/digital-mary/src/few-shot.ts` (new) | 50 Mary-authored gold answers. Few-shot retriever picks 3 most relevant exemplars per turn, injects as assistant-role examples. Sourced from canonical answers + best transcript exemplars (HCDS/Capture Corner/OASIS+ "with intel"). |
| DM-403 | `client/ask-mmt/components/` (new dir): CaptureCard.tsx, DeadlineTimeline.tsx, AlertBuilder.tsx, CompareView.tsx, SourcePreview.tsx, BriefProgress.tsx, ActionConfirm.tsx, HotList.tsx | 8 React components following AG-UI declarative spec. Agent picks which to render via tool call `render_ui({component, props})`. |
| DM-404 | `client/ask-mmt/AskMMTChat.tsx` (new); `client/ask-mmt/streaming.ts` (new); `client/ask-mmt/index.html` (edit) | Chat UI with streaming responses, follow-up suggestion chips (3 from each turn's reflector output), thread history sidebar, generative-UI render slot. Replaces existing Ask MMT input box. |

## Details
- **Voice rules (enforced in system prompt — verbatim):**
  - No internal scaffolding terms ever leak
  - Lead with the answer; caveats at end
  - Every answer ends with: a "what to do" line OR a "what to watch" line OR ONE clarifying question
  - Date awareness: if `last_updated > 30d`, prefix "As of [date] — want me to refresh?"
  - Capability honesty: only claim tools listed in the manifest
  - Refusal pattern: if no data, pivot to "what's hot this week" — never apologize in more than one sentence
- **Few-shot selection** uses same vector retrieval as content but over `voice-exemplars.jsonl`.
- **GenUI components** are declarative — agent returns JSON spec, frontend renders. No agent-generated HTML.
- **Hot list** powered by `data/this-week.json` refreshed Mondays at 06:00 UTC.

```
git add -A && git commit -m "feat(ui): system prompt + voice library + 8 GenUI components + chat UI"
```

## GATE CHECK
```
node services/digital-mary/test-voice.js  # voice eval ≥ 8/10 vs baseline 5/10
ls client/ask-mmt/components/*.tsx | wc -l  # 8
grep -c "verified facts block\|verified data block" services/digital-mary/prompts/system.md  # 0 (banned phrase not in prompt)
node eval/run-eval.js --suite=phase1-final  # all 4 scorers improve over P0-1 baseline
curl http://localhost:3000/api/ask-mmt -d '{"message":"OMNIBUS 4"}' | jq '.entity_resolved'  # "dha-omnibus-iv"
curl http://localhost:3000/api/ask-mmt -d '{"message":"OASIS+"}' | jq '.answer' | head -c 200  # consistent with canonical
```

**END OF PHASE 1 GATE:** All 8 transcript failures must be eliminated. Run `eval/run-eval.js --transcript-suite` — score on the original 17 transcript turns ≥ 8/10 average.

---

# PHASE 2 — Platform Interface (Sprints B1–B4)

**Goal:** Digital Mary does work — saves alerts, generates briefs, knows what each subscriber has read.

---

## SPRINT B1 — MCP Server `mmt-mcp-platform`

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. MCP server for MMT internal systems.

## Read first
- DM-101 mmt-mcp-federal as pattern
- `supabase/migrations/` (current schema)
- Stripe + Buttondown + Resend + Plausible API docs

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-501 | `services/mmt-mcp-platform/` (new server, mirrors mmt-mcp-federal structure) | Bootstrap second MCP server. Same Streamable HTTP, same capability-card pattern, deployed alongside federal one on Fly.io. |
| DM-502 | `services/mmt-mcp-platform/src/tools/supabase.ts` (new); `services/mmt-mcp-platform/src/tools/stripe.ts` (new) | Tools: `subscriber_lookup`, `subscriber_tier`, `pursuit_calendar_read`, `pursuit_calendar_write`, `contract_tracker_read`, `stripe_subscription_status`. Read-only on Stripe. |
| DM-503 | `services/mmt-mcp-platform/src/tools/buttondown.ts` (new); `services/mmt-mcp-platform/src/tools/resend.ts` (new); `services/mmt-mcp-platform/src/tools/plausible.ts` (new) | Tools: `newsletter_archive_search`, `newsletter_subscriber_open_history`, `email_send` (gated by confirmation), `analytics_user_pageviews`. |
| DM-504 | `services/mmt-mcp-platform/src/tools/content.ts` (new); `services/mmt-mcp-platform/src/tools/podcast.ts` (new) | Tools: `mmt_article_search`, `mmt_article_get`, `podcast_transcript_search`. Pulls from repo content + Otter.ai/Riverside transcript exports. |

## Details
- **Auth boundary:** mmt-mcp-platform requires Bearer token from Digital Mary's service account; subscriber identity passed in tool-call params. Tools validate the subscriber owns the requested data.
- **Write tools (`pursuit_calendar_write`, `email_send`, future `alert_save`)** all return a `confirmation_token` first. Caller must call again with token to commit. Prevents accidental writes from agent reflection.
- **Plausible tool** anonymizes — returns aggregate counts and last-N article slugs, never exposes other users' data even to admin queries.

```
git add -A && git commit -m "feat(mcp): mmt-mcp-platform — Supabase, Stripe, Buttondown, Resend, Plausible, content, podcast tools"
```

## GATE CHECK
```
cd services/mmt-mcp-platform && npm run build
curl http://localhost:3002/.well-known/mcp-server-card.json | jq '.tools | length'  # ≥ 12
node services/mmt-mcp-platform/test-write-gate.js  # write without confirmation token returns 400
node eval/run-eval.js --suite=platform-tools  # platform-action prompts now resolve correctly
```

---

## SPRINT B2 — 4-Type Memory + Personalization

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Replace "last 10 turns" with proper memory architecture.

## Read first
- DM-501-504 platform tools (memory uses Plausible + Buttondown for personalization signals)
- Mem0 docs: https://docs.mem0.ai (reference architecture; we self-host the pattern in Supabase)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-601 | `supabase/migrations/2026XXXXXX_memory_schema.sql` (new) | 4 tables: `mem_working` (thread_id, messages jsonb, ttl), `mem_semantic` (user_id, fact, confidence, source_turn_id, created_at), `mem_episodic` (user_id, summary, turn_range, embedding), `mem_procedural` (user_id, pattern, trigger, response_template). |
| DM-602 | `services/digital-mary/src/memory/working.ts` (new); `services/digital-mary/src/memory/semantic.ts` (new); `services/digital-mary/src/memory/episodic.ts` (new); `services/digital-mary/src/memory/procedural.ts` (new) | One module per memory type. Each: read(userId), write(userId, item), summarize(userId). Episodic uses pgvector for "what did we discuss in March." |
| DM-603 | `netlify/functions/scheduled/consolidate-memory.js` (new) | Nightly cron: episodic → semantic consolidation. For each user with ≥10 new turns, summarize via Claude Haiku, extract durable facts, write to mem_semantic with confidence scores. |
| DM-604 | `services/digital-mary/src/personalization.ts` (new); `services/digital-mary/src/turn.ts` (edit) | Personalization context builder: pulls tier (Stripe), recent reads (Plausible), newsletter engagement (Buttondown), saved alerts. Injected as system message: "User: tier=premium-annual, agency_focus=DHA, set_aside=WOSB, last_read=[HCDS, OASIS+], alerts=[data-governance]." |

## Details
- **Working memory:** sliding 20-turn buffer, ~8k tokens. Cleared after 30 days inactive.
- **Semantic memory facts** must include `confidence` (0-1) and `source_turn_id`. Below 0.7 confidence = ignored at retrieval time.
- **Episodic summarization** runs only if user has ≥10 turns in last 24h, to bound cost. Summary ≤ 200 words.
- **Procedural patterns** seeded with 5 starter rules (e.g., "if user is WOSB, lead with WOSB-relevant set-asides"). Learned patterns added by reflection over 30+ days of episodic data.
- **Privacy:** user can `forget_me` via API endpoint → truncates all 4 memory tables. Mary holds the procedural patterns (anonymized aggregate) for product improvement.

```
git add -A && git commit -m "feat(memory): 4-type memory architecture + personalization context"
```

## GATE CHECK
```
psql $SUPABASE_DB -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'mem_%'"  # 4 rows
node scripts/test-memory-consolidate.js  # episodic→semantic flow works
node eval/run-eval.js --suite=personalized  # personalization eval set scores ≥ 8/10
curl http://localhost:3000/api/forget-me -X POST -H "Auth: $TEST_USER"  # 200, all mem_* rows for user gone
```

---

## SPRINT B3 — Action Layer (Alerts, Briefs, Calendar, Email)

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Helper performs writes, not just reads.

## Read first
- DM-403 ActionConfirm.tsx (UX for write confirmation)
- DM-501 platform tools confirmation token flow
- `paywall enrichment` Sprint 4 (data sources for alerts)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-701 | `supabase/migrations/2026XXXXXX_alerts.sql` (new); `services/digital-mary/src/actions/save-alert.ts` (new); `netlify/functions/scheduled/check-alerts.js` (new) | Saved-search alerts. User says "alert me when DHA posts data governance" → agent calls `save_alert` action → ActionConfirm component → user confirms → row in `user_alerts`. Nightly cron runs each alert against SAM.gov, matches → Resend email. |
| DM-702 | `services/digital-mary/src/actions/calendar.ts` (new) | Pursuit calendar writes: agent suggests "add T4NG2 RFP to your pursuit calendar?" → confirm → writes to existing pursuit calendar table. Reuses Sprint B1 `pursuit_calendar_write` MCP tool. |
| DM-703 | `services/digital-mary/src/actions/email.ts` (new); `services/digital-mary/src/actions/forward.ts` (new) | Email actions: `email_send` (digest emails), `forward_to_team` (subscriber forwards a Digital Mary answer to teammate). Both gated by ActionConfirm. |
| DM-704 | `services/digital-mary/src/actions/registry.ts` (new); `services/digital-mary/src/turn.ts` (edit) | Action registry: 6 actions (save_alert, add_to_calendar, generate_brief, email_send, forward_to_team, log_capture_decision). Each declares: tier_required, confirm_required, rate_limit. Agent can only invoke registered actions. |

## Details
- **ActionConfirm UX:** when agent emits an action tool call, frontend renders ActionConfirm component inline showing exact action params; user clicks Approve or Modify before commit.
- **Tier gates:** `save_alert` = Premium+; `forward_to_team` = Pro/Institutional; `log_capture_decision` = Pro/Institutional.
- **Rate limits:** save_alert max 20/user; generate_brief 3/month Premium, 25/month Pro, unlimited Institutional.
- **Audit log:** every action writes to `action_log` table with user_id, action, params, result, timestamp.

```
git add -A && git commit -m "feat(actions): 6-action layer with tier gates, confirmation, audit log"
```

## GATE CHECK
```
psql $SUPABASE_DB -c "SELECT count(*) FROM action_log"  # works
node scripts/test-action-gate.js  # free-tier user trying save_alert → 403
node eval/run-eval.js --suite=actions  # action-correctness scorer ≥ 9/10
test -f netlify/functions/scheduled/check-alerts.js
```

---

## SPRINT B4 — Capture Brief Generator (GenUI)

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 3 tickets, single PR. Premium feature — interactive 1-pager generator.

## Read first
- DM-403 CaptureCard.tsx + BriefProgress.tsx components
- DM-704 actions registry (`generate_brief` action)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-801 | `services/digital-mary/src/brief/builder.ts` (new); `services/digital-mary/src/brief/sections.ts` (new) | Brief builder: takes entity_id, assembles sections (canonical summary, market context, competitive landscape, recent activity, deadlines, your fit, recommended actions). Each section is a structured object, not free text. |
| DM-802 | `client/ask-mmt/components/CaptureBrief.tsx` (new); `client/ask-mmt/components/BriefSection.tsx` (new) | Interactive brief component: collapsible sections, hover-for-source, click-to-add-to-calendar, "share" button (forwards via Resend), "expand this section" pulls deeper data via agent. |
| DM-803 | `services/digital-mary/src/brief/export.ts` (new); `netlify/functions/brief-pdf.js` (new) | PDF export via @react-pdf/renderer for users who want a static version. Watermarked with subscriber email + generation timestamp. |

## Details
- **Section order (fixed):** Summary → Market Context → Competitive Landscape → Recent Activity → Upcoming Deadlines → Your Fit (personalized) → Recommended Actions.
- **"Your Fit" section** uses personalization context (tier, set-aside status, NAICS focus) to score the opportunity 1-10 and explain.
- **Generation cost** ~$0.30 per brief (multiple agent loops, multi-section synthesis). Rate limit prevents abuse.
- **PDF export** is opt-in second step; default UX is the interactive component which has more value (calendar add, share, expand).

```
git add -A && git commit -m "feat(brief): interactive capture brief generator + PDF export"
```

## GATE CHECK
```
node scripts/test-brief.js HCDS  # generates 7 sections, ≤ 30s
test -f client/ask-mmt/components/CaptureBrief.tsx
curl http://localhost:3000/api/brief-pdf?entity=hcds  # returns PDF with watermark
node eval/run-eval.js --suite=brief-quality  # voice + faithfulness ≥ 8/10
```

**END OF PHASE 2 GATE:** Digital Mary does platform actions correctly. Premium subscribers see new capabilities. Eval scores ≥ 8/10 across all 4 axes.

---

# PHASE 3 — Stickiness (Sprints C1–C4)

**Goal:** Subscribers open Digital Mary daily. Standalone Pro tier launches. Institutional MCP endpoint goes live.

---

## SPRINT C1 — Capture Coaching Mode (5-Step Flow)

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Multi-turn guided capture decision workflow. Pro/Institutional only.

## Read first
- Capture Corner archive (your existing 5-point capture audit framework)
- DM-803 brief builder (coaching reuses brief data)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-901 | `services/digital-mary/src/modes/coaching/state-machine.ts` (new); `services/digital-mary/src/modes/coaching/steps.ts` (new) | 5-step state machine: 1) Market fit, 2) Incumbent vulnerability, 3) Vehicle access, 4) Competitive intel, 5) Win-theme draft. Each step has prerequisites, prompts, and exit conditions. |
| DM-902 | `client/ask-mmt/components/CoachingFlow.tsx` (new); `client/ask-mmt/components/CoachingStep.tsx` (new) | Visual step indicator + per-step inputs. Step transitions are agent-controlled but user can revisit any step. State persists per user_id + opportunity_id. |
| DM-903 | `services/digital-mary/src/modes/coaching/output.ts` (new); `supabase/migrations/2026XXXXXX_capture_decisions.sql` (new) | Output: capture decision document (entity, fit-score, vulnerabilities, recommended actions, win themes). Stored in `capture_decisions` table; emailed as PDF via Resend. |
| DM-904 | `services/digital-mary/src/modes/coaching/win-themes.ts` (new); `data/win-theme-library.json` (new) | Win-theme library: 30+ Mary-authored win themes mapped to vehicle/agency combos. Step 5 retrieves relevant themes; user selects/edits 3-5. |

## Details
- **Entry:** "coach me through HOPSS" or button in CaptureCard. Free tier sees teaser; Pro+ enters full flow.
- **Step gating:** can't advance until current step has minimum data. Helper guides.
- **Time budget:** typical full flow = 12-15 minutes of subscriber time. Helper saves state if they leave.
- **The 5-point audit framework comes from your existing Capture Corner content** — coaching mode operationalizes it.

```
git add -A && git commit -m "feat(coaching): 5-step capture coaching mode for Pro/Institutional tiers"
```

## GATE CHECK
```
node scripts/test-coaching-flow.js  # full flow completes in ≤ 15 min simulated
psql $SUPABASE_DB -c "SELECT count(*) FROM capture_decisions"  # writes work
curl -X POST http://localhost:3000/api/coaching/start -d '{"entity":"hopss"}' -H "tier: pro"  # 200
curl -X POST http://localhost:3000/api/coaching/start -d '{"entity":"hopss"}' -H "tier: free"  # 402 with upgrade CTA
```

---

## SPRINT C2 — Proposal Narrative Drafting

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 3 tickets, single PR. Pro+ only. Rate-limited 5/month per user.

## Read first
- ProposalPulse codebase if drafting infrastructure exists; otherwise build fresh
- DM-904 win-theme library (drafts use these)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-1001 | `services/digital-mary/src/modes/narrative/builder.ts` (new); `services/digital-mary/src/modes/narrative/templates.ts` (new) | Takes SOW text + user capability statement → drafts 2-page narrative response. Template per work type (R&D, professional services, software, integration). |
| DM-1002 | `client/ask-mmt/components/NarrativeDraft.tsx` (new) | UI: paste SOW + capabilities → progress indicator → editable draft → "regenerate section" buttons. |
| DM-1003 | `services/digital-mary/src/modes/narrative/eval.ts` (new); `data/narrative-gold-set.jsonl` (new, 10 entries) | LLM-as-judge specifically for narrative quality: technical fit, compliance, win-theme integration, voice. Mary writes 10 gold narratives for eval baseline. |

## Details
- **SOW input** capped at 20k tokens (≈ 50 pages). Anything longer requires user to highlight relevant sections.
- **Output is always a draft.** UI has a giant "Mary did not write this — review before submission" banner.
- **Voice match** uses Phase 1 voice library; narrative voice is more formal than chat voice — separate exemplar set.
- **Cost per narrative:** ~$0.80 (longer context, multiple section calls). Rate limit + tier gating critical.

```
git add -A && git commit -m "feat(narrative): proposal narrative drafting (Pro+, 5/month gated)"
```

## GATE CHECK
```
node scripts/test-narrative.js < test/fixtures/sample-sow.txt  # ≤ 60s, ≥ 1500 words
node eval/run-narrative-eval.js  # ≥ 7/10 on technical fit and voice
curl -X POST /api/narrative -H "tier: free"  # 402
curl -X POST /api/narrative -H "tier: pro" --repeat 6  # 6th call returns 429
```

---

## SPRINT C3 — Multi-Channel: Slack + Email-In + Voice

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 4 tickets, single PR. Institutional differentiator — Mary anywhere your team works.

## Read first
- Slack Bolt SDK docs
- Resend inbound email docs
- Vapi or Retell voice API docs

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-1101 | `services/mmt-slack-app/` (new) | Slack app: institutional team installs to workspace, mentions @digitalmary, gets answers. Uses same agent loop. Workspace tier verified via Stripe. |
| DM-1102 | `netlify/functions/email-in.js` (new); `services/digital-mary/src/channels/email.ts` (new) | digitalmary@missionmeetstech.com inbound: forward agency notice → Digital Mary replies with capture analysis within 5 min. Resend inbound webhook + DKIM. |
| DM-1103 | `services/mmt-voice/` (new); voice config | Vapi-backed phone line for Institutional. User calls, voice agent answers federal health IT questions. Same agent loop, voice in/out via Vapi. |
| DM-1104 | `services/digital-mary/src/channels/router.ts` (new) | Channel router normalizes input from web/Slack/email/voice into common turn format. Reply formatter adapts output to channel (Slack blocks, email HTML, voice SSML). |

## Details
- **Slack** = Institutional only ($499/mo). Workspace install = Stripe customer ID required.
- **Email-in** = Pro+ tier. Rate-limited 20 emails/day per user.
- **Voice** = Institutional only. ~$0.10/min cost; pass-through priced.
- **Channel parity:** same agent, same memory, same actions. User who emails about HCDS in morning, asks follow-up in web chat in afternoon — Digital Mary remembers.

```
git add -A && git commit -m "feat(channels): Slack app + email-in + voice — multi-surface Digital Mary"
```

## GATE CHECK
```
test -f services/mmt-slack-app/manifest.json
curl -X POST http://localhost:3000/.netlify/functions/email-in -d @test/fixtures/sample-email.eml  # processes
node services/mmt-voice/test-call.js  # Vapi reaches agent
node scripts/test-channel-memory.js  # email turn appears in web chat thread history
```

---

## SPRINT C4 — Public MCP Endpoint for Institutional Buyers

```
cd ~/Projects/mmt-site && git status && git branch --show-current && git pull origin main
```

# Scope: 3 tickets, single PR. The B2B product flywheel.

## Read first
- DM-101, DM-501 existing MCP servers (we expose a curated subset publicly)

## Changes
| Ticket | Files | Change |
|---|---|---|
| DM-1201 | `services/mmt-mcp-public/` (new) | Public-facing MCP server. Curated subset of mmt-mcp-federal (read-only) + mmt-mcp-content (canonical answers, MMT articles). NO platform tools, NO write actions. |
| DM-1202 | `services/mmt-mcp-public/src/auth.ts` (new); `services/mmt-mcp-public/src/quota.ts` (new) | Per-customer API keys (Stripe-backed). Per-key quotas: Pro 1k calls/mo, Institutional 50k calls/mo. Quota enforcement + Langfuse usage tracking. |
| DM-1203 | `client/ask-mmt/PublicMcpDocs.tsx` (new); `docs/mcp-public.md` (new) | Self-serve docs: how institutional buyers connect Claude/ChatGPT/Cursor to MMT data. Includes example queries, schema, rate limits. Marketing landing on missionmeetstech.com/mcp. |

## Details
- **Why this is the flywheel:** institutional buyer's Claude points at your MCP. Their queries become your `coverage-gaps.json`. Their gaps become your editorial calendar. They pay you to feed your own product.
- **Public MCP exposes:** entity lookup, canonical answers, MMT article search, federal data passthrough (read-only), graph traversal (capped at 3 hops). No actions, no platform tools, no other users' data.
- **Pricing:** included in Institutional tier; Pro tier sold as $99/mo add-on for MCP-only access.
- **Onboarding:** subscriber requests API key via dashboard → Stripe verifies tier → key issued via email. Self-serve.

```
git add -A && git commit -m "feat(public-mcp): institutional MCP endpoint — Digital Mary as B2B data product"
```

## GATE CHECK
```
curl https://mcp.missionmeetstech.com/.well-known/mcp-server-card.json  # public, no auth
curl -X POST https://mcp.missionmeetstech.com/mcp -d '{...}' -H "Authorization: Bearer $KEY"  # 200 with valid key, 401 without
node services/mmt-mcp-public/test-quota.js  # over-quota request returns 429
test -f docs/mcp-public.md
```

**END OF PHASE 3 GATE:** Pro tier launched, Institutional tier sold. Eval scores ≥ 9/10. Public MCP endpoint live. Capture coaching + narrative + multi-channel all in production.

---

# Cross-Phase Verification (run after each phase)

```
# Eval baseline must improve, never regress
node eval/run-eval.js --against-baseline  # all 4 scorers ≥ baseline + threshold

# All MCP servers report healthy
for srv in mmt-mcp-federal mmt-mcp-platform mmt-mcp-public; do
  curl -f http://$srv:300X/.well-known/mcp-server-card.json | jq '.status'  # "live"
done

# No banned phrases in any prompt or response
grep -rn "verified facts block\|verified data block" services/digital-mary/  # 0
node scripts/scan-recent-turns.js --hours 24 --bans verified_block  # 0 hits

# Memory privacy works
node scripts/test-forget-me.js  # full deletion flow passes
```

If anything fails: stop, do not push, report which sprint regressed.

---

# Cost Reality Check

| Phase | Per-turn cost | Monthly infra | Notes |
|---|---|---|---|
| Phase 0 | n/a (eval only) | $5 (Langfuse) | Baseline measurement |
| Phase 1 end | $0.05 | $30 | Sonnet + Cohere + Fly servers |
| Phase 2 end | $0.06 | $50 | + memory writes |
| Phase 3 end | $0.07 | $150 | + Vapi voice when used |

At 5,000 turns/month / 1,000 active users: **~$300-400/mo total infra**. Margin >95% at any tier mix.

---

# What Mary needs to provide

Ranked by blocking-ness:

1. **(blocks P0-1)** 30 ideal-answer texts for golden set — Mary writes; ~3 hours
2. **(blocks A2)** Confirmation of top 50 entities for canonical answers — Mary picks from existing tracker
3. **(blocks A4)** Voice-rules sign-off — Mary reviews `voice-rules.md` draft, edits
4. **(blocks B1)** Buttondown + Resend + Plausible API keys → Fly secrets
5. **(blocks B4)** Brand decisions for capture brief PDF (logo, footer, watermark format)
6. **(blocks C1)** Win-theme library — Mary contributes 30 win themes from existing capture work
7. **(blocks C3)** Stripe price IDs for Pro $99/mo and Institutional $499/mo (create in dashboard)
8. **(blocks C4)** Domain/subdomain decision for public MCP (e.g., mcp.missionmeetstech.com)

Everything else Claude Code can build without further input.
