# Determinism Audit — mmt-site Ecosystem

**Sprint:** Determinism Sprint
**Doctrine:** Deterministic by default. Reasoning by exception. Auditable by design.
**Status:** Sprint 0 in progress. This is a read-only audit. No workflows change until Sprint 2.

## The 7-Level Framework (reference)

| Level | Category | Use When |
|---|---|---|
| 1 | Deterministic script (no LLM) | Same inputs, same steps, same outputs |
| 2 | Script + one targeted LLM call | One fuzzy step, rest is deterministic |
| 3 | No-code agent builder (n8n agent, Dify) | Light branching, prebuilt connectors |
| 4 | Hand-rolled agentic loop (50-150 LOC) | Real agent behavior, 3-5 custom tools |
| 5 | Code-first framework (LangGraph, CrewAI) | Multi-agent, complex state |
| 6 | Terminal AI agent (Claude Code) on-demand | Open-ended, human-summoned |
| 7 | Autonomous always-on agent (OpenClaw) | Cross-domain, persistent, scheduled improvisation |

Multiple sequential LLM calls in a fixed pipeline are still Level 2. It is deterministic orchestration with fuzzy steps.

---

## Netlify Functions — mmt-site (91 handlers)

Source: `~/Projects/mmt-site/netlify/functions/`. Every handler read top-of-file through the core logic branch. Classification follows the rule: if the task is a fixed sequence of steps, it is Level 1.

| function_name | trigger | apis | decision_points | current_level | target_level | downgrade_opportunity |
|---|---|---|---|---|---|---|
| agent-bridge | HTTP POST/GET | Supabase | Task dedup, approval routing, status enum transitions | 3 | 1 | Y |
| ai-image | HTTP POST | OpenAI, Google AI | Provider selection (enum) | 2 | 2 | N |
| ai-research | HTTP POST | Anthropic, OpenAI, Google | Multi-LLM parallelization | 2 | 2 | N |
| approval-api | HTTP GET/POST | Supabase | 5 views + 6 actions | 1 | 1 | N |
| ask-mmt-submit | HTTP POST | Supabase, Resend | Premium gating, quota, delivery | 2 | 2 | N |
| backup-db | Scheduled daily | Supabase | Table iteration, retention math | 1 | 1 | N |
| billing-api | HTTP GET/POST | Supabase | 7-view routing, filters | 1 | 1 | N |
| billing-sync | Scheduled daily | Stripe, Anthropic, Netlify, Resend, Render, Gmail | Sequential collectors | 1 | 1 | N |
| check-tier | HTTP POST | Supabase, Buttondown | Enum-based tier detection | 1 | 1 | N |
| collect-feedback-background | HTTP POST | Supabase | Threshold pattern (3+ negatives/30d) | 1 | 1 | N |
| command-center-api | HTTP GET/POST | Supabase | Dashboard + 12 ops actions | 1 | 1 | N |
| competitive-scan | Scheduled weekly | Claude, web_search | Research + keyword matching for alert type | 2 | 1 | Y |
| compliance-check | HTTP POST | Supabase | 4 deterministic checks (CHPL, SCA, PubMed, docs) | 1 | 1 | N |
| contract-intel-refresh-background | HTTP POST | Claude Sonnet (7 passes), Supabase, federal APIs | Multi-pass pipeline with web_search | 5 | 2 | Y |
| contract-intel-refresh | Scheduled 8am ET | HTTP POST to background | Thin relay | 1 | 1 | N |
| contract-intel | HTTP GET | Supabase | NAME_ALIASES lookup | 1 | 1 | N |
| cost-api | HTTP GET/POST | Supabase | 5 GET + 2 POST views | 1 | 1 | N |
| cost-rollup | Scheduled daily | Supabase | Aggregation, 7d rolling avg, anomaly thresholds | 1 | 1 | N |
| create-checkout | HTTP POST | Stripe, Supabase | Email validation, tier check, session creation | 1 | 1 | N |
| create-premium-checkout | HTTP POST | Stripe, Supabase | Subscription plans, dedup | 1 | 1 | N |
| create-subscription-checkout | HTTP POST | Stripe, Supabase | 3-tier enum routing | 1 | 1 | N |
| create-tactical-brief-checkout | HTTP POST | Stripe, Supabase | One-time payment, metadata | 1 | 1 | N |
| creative-api | HTTP GET/POST | Supabase | Project/image/prompt CRUD | 1 | 1 | N |
| customer-api | HTTP GET/POST | Supabase | Health score formula, churn enum | 1 | 1 | N |
| customer-auth | HTTP POST | Supabase | Magic link token, session validation | 1 | 1 | N |
| customer-health-rollup | Scheduled daily | Supabase | Health score recalc | 1 | 1 | N |
| daily-stats-rollup | Scheduled daily | Supabase | Activity count aggregations | 1 | 1 | N |
| dashboard-auth | HTTP POST/GET | Supabase | bcrypt + magic link state machine | 1 | 1 | N |
| engagement-brief | HTTP POST | Claude (optional) | Hardcoded topics + optional email | 2 | 1 | Y |
| fact-check | HTTP POST | Claude Sonnet, web_search | Rate limit, JSON extraction | 2 | 2 | N |
| feedback-click | HTTP GET | Supabase | Rating 1-5 update + HTML | 1 | 1 | N |
| finance-api | HTTP GET/POST | Supabase | 7-view cost + inventory + alerts | 1 | 1 | N |
| finance-rollup | Scheduled daily | Supabase | Rolling avg, anomaly, deadlines, decay | 1 | 1 | N |
| founding-count | HTTP GET | Stripe | Active sub count + env fallback | 1 | 1 | N |
| generate-tactical-brief-background | HTTP POST | Perplexity, Claude (Haiku+Sonnet), federal APIs, Resend | 7-pass research + synthesis | 5 | 2 | Y |
| gold-team-review-background | HTTP POST | Claude (2 calls, 12k+6k tokens) | Sequential rewrite + review | 2 | 2 | N |
| google-oauth | HTTP POST | Google OAuth, Supabase | OAuth callback, token exchange | 1 | 1 | N |
| health-check | Scheduled 6h | Anthropic, Resend, Supabase, Stripe | Deterministic health suite | 1 | 1 | N |
| health | HTTP GET | Supabase, Stripe, Resend, Sentry | 7-service probe | 1 | 1 | N |
| issues-api | HTTP GET/POST | Supabase, Sentry | State machine (6 views + 5 actions) | 1 | 1 | N |
| learning-api | HTTP GET/POST | Supabase | Learnings CRUD (5 GET + 3 POST) | 1 | 1 | N |
| marketpulse-gateway | HTTP POST | Supabase, Stripe | Free-tier gate, checkout redirect | 1 | 1 | N |
| member-auth | HTTP POST | Supabase, Stripe | Email + tier + signed token | 1 | 1 | N |
| member-preferences | HTTP GET/POST | Supabase, Buttondown | Preference storage + tag sync | 1 | 1 | N |
| member-read-state | HTTP GET/POST | Supabase | Read entry CRUD | 1 | 1 | N |
| member-watchlist | HTTP GET/POST | Supabase | Watchlist CRUD | 1 | 1 | N |
| monthly-brief-send | Scheduled 1st/month 6am | Supabase, Resend | Fetch + extract + send | 1 | 1 | N |
| newsletter-research-background | Scheduled Mon/Thu 7am ET | Claude Sonnet, web_search | 5-category research + HTML + email | 2 | 2 | N |
| newsletter-research | Scheduled Mon/Thu 7am ET | HTTP POST to background | Thin trigger | 1 | 1 | N |
| newsletter-send | HTTP POST | Buttondown, Supabase | Digest build + dedup by subject | 1 | 1 | N |
| newsletter-sync | Scheduled Tue/Fri 6pm ET | Claude, web_search, GitHub, Netlify | Article sync + keyword tagging | 2 | 1 | Y |
| opportunity-feed | HTTP GET | Supabase | 6-filter query + sort | 1 | 1 | N |
| opportunity-radar-background | HTTP POST | Claude, web_search, SAM.gov | Three sequential searches + extraction | 2 | 2 | N |
| opportunity-radar | Scheduled 7am ET | HTTP POST to background | Thin trigger | 1 | 1 | N |
| ops-dashboard | HTTP GET | Supabase | Health + workflow + circuit breaker queries | 1 | 1 | N |
| ops-health-check | Scheduled every 15min | Supabase | Stuck job + critical event detection | 1 | 1 | N |
| ops-pattern-detector | Scheduled daily 1pm UTC | Supabase | Error signature grouping, escalation | 1 | 1 | N |
| predictive-signals-background | Scheduled Wed 6am ET | Supabase | Pattern match on KNOWN_FACTS + digest | 1 | 1 | N |
| premium-brief-send | Scheduled Fri 6am ET | Supabase, Resend | Fetch + extract + batch send | 1 | 1 | N |
| premium-chat | HTTP POST | Supabase, Claude, federal APIs | Premium gate + answer + quota | 2 | 2 | N |
| premium-digest-send | Scheduled daily 6:30am ET | Supabase, Resend | Preference-based digest | 1 | 1 | N |
| projects-api | HTTP GET/POST | Supabase | Project/sprint/task CRUD | 1 | 1 | N |
| protest-monitor-background | Scheduled daily 8am ET | Claude Sonnet, web_search | Case status monitoring | 2 | 2 | N |
| protest-monitor | Scheduled daily 8am ET | HTTP POST to background | Thin trigger | 1 | 1 | N |
| pursuit-score | HTTP POST | Claude, Supabase | Premium gate + cache + quota | 2 | 2 | N |
| qa-api | HTTP GET/POST | Supabase | Test results + regression + baseline | 1 | 1 | N |
| quality-drift-check-background | Scheduled Mon 8am ET | Supabase | Stuck order + freshness + alerts | 1 | 1 | N |
| rebuild-trigger | Scheduled every 4h | Netlify, Supabase | Rebuild hook call | 1 | 1 | N |
| release-held-emails | HTTP POST | Supabase, Resend | Batch release from degraded mode | 1 | 1 | N |
| resend-webhook | HTTP POST | Supabase | Webhook log + bounce suppression | 1 | 1 | N |
| review-action | HTTP GET | Supabase | Query-param action enum + update | 1 | 1 | N |
| review-queue-digest-background | Scheduled daily 7am ET | Supabase, Resend | Unreviewed digest with action links | 1 | 1 | N |
| roadmap-api | HTTP GET/POST | Supabase | Roadmap CRUD + log | 1 | 1 | N |
| roadmap-health-check | Scheduled daily 6am ET | Supabase | Feature health HTTP probes | 1 | 1 | N |
| sb-vehicle-radar-background | HTTP POST | Claude, USASpending.gov, Supabase | 5 queries + vehicle classification | 2 | 2 | N |
| sb-vehicle-radar | Scheduled 8am ET | HTTP POST to background | Thin trigger | 1 | 1 | N |
| score-cleanup | Scheduled every 10min | Supabase | Stuck score (5min) + retrigger | 1 | 1 | N |
| score-deck-background | HTTP POST | Claude, Supabase | 8k-token evaluation | 3 | 2 | Y |
| score-deck | HTTP POST | Supabase | Gateway: extract + store + usage | 1 | 1 | N |
| score-status | HTTP GET | Supabase | HMAC verify + status poll | 1 | 1 | N |
| sentry-sync | Scheduled every 30min | Sentry, Supabase | Issue sync + auto-issue + link | 1 | 1 | N |
| signal-chain-subscribe | HTTP POST/DELETE | Supabase | Premium gate + monitor upsert | 1 | 1 | N |
| signal-chain | HTTP GET/POST | Federal APIs, Congress, ClinicalTrials, PubMed, USAJobs, Supabase | 5-layer scoring | 2 | 2 | N |
| stripe-webhook | HTTP POST | Stripe, Supabase | Sig verify + idempotency + feature grant | 1 | 1 | N |
| submit-feedback | HTTP POST | Supabase | HMAC verify + 1-5 validation | 1 | 1 | N |
| subscriber-context | HTTP GET/POST/DELETE | Supabase | Admin CRUD (email, UEI, vehicles) | 1 | 1 | N |
| support-agent | HTTP POST | Claude Haiku, Resend | KB Q&A + low-confidence escalation | 2 | 2 | N |
| sync-learnings | HTTP POST | Supabase | Learnings export/import/diff | 1 | 1 | N |
| tactical-brief-cleanup | Scheduled every 15min | Supabase, Stripe | Stuck order (15min) + retrigger + refund | 1 | 1 | N |
| tactical-brief-webhook | HTTP POST (Stripe) | Stripe, Supabase, HTTPS | Sig verify + background trigger | 1 | 1 | N |
| view-report | HTTP GET | Supabase | HMAC verify + HTML retrieval | 1 | 1 | N |
| weekly-report | Scheduled Mon 9am ET | Supabase, Resend | Weekly usage digest | 1 | 1 | N |

### Level distribution (Netlify functions, current state)

| Level | Count | % |
|---|---|---|
| 1 | 70 | 77% |
| 2 | 18 | 20% |
| 3 | 2 | 2% |
| 5 | 2 | 2% |
| **Total** | **91** | 100% |

**Functions flagged for downgrade: 7.**

---

## Downgrade Notes (7 candidates)

Each note describes the Level 1/2 version.

**1. agent-bridge.js (3 → 1)**
Current: hand-rolled agent bridging with approval loops, status enum, dedup.
Level 1 version: HTTP relay with a database state machine. Orchestration is pure routing on known enums. Approval flow moves to `approval-api.js` which already handles this pattern deterministically.

**2. competitive-scan.js (2 → 1)**
Current: weekly Claude + web_search scan with keyword matching on alert type.
Level 1 version: RSS feeds from competitor newsletters + deterministic keyword tagging (pricing, funding, product, contract, partnership). No reasoning step needed when the keyword list is fixed.

**3. contract-intel-refresh-background.js (5 → 2)**
Current: 7-pass Claude Sonnet pipeline with web_search cross-validation.
Level 2 version: deterministic federal API enrichment (SAM.gov, USASpending.gov, Federal Register) plus one Claude synthesis call. Drop web_search from serverless (unreliable). Drop cross-validation loops.

**4. engagement-brief.js (2 → 1)**
Current: hardcoded topic list with an optional Claude call.
Level 1 version: SQL aggregations over `signal_chain`, `opportunity_radar`, `contract_intel` tables into a Handlebars template. The LLM is not doing work the counts don't already expose.

**5. generate-tactical-brief-background.js (5 → 2)**
Current: 7-pass Perplexity + Claude (Haiku + Sonnet) research pipeline.
Level 2 version: Pass 0 is deterministic federal API enrichment; Pass 1 is a single Claude Sonnet synthesis. Replace Perplexity research with direct API calls (USASpending.gov, Federal Register, SAM.gov Opportunities).

**6. newsletter-sync.js (2 → 1)**
Current: Claude + web_search for article ingestion + tagging, then GitHub commit + Netlify rebuild.
Level 1 version: Substack RSS parser + deterministic keyword tagging. GitHub commit and rebuild trigger are already deterministic; only the ingestion step uses the LLM unnecessarily.

**7. score-deck-background.js (3 → 2)**
Current: 8k-token Claude Sonnet evaluation across full proposal.
Level 2 version: rubric-based scoring with deterministic keyword presence and thresholds for routine checks, single Haiku call for the genuinely fuzzy sections (3 critical sections, not full deck). Drop the `_pending` intermediate state.

---

## Provisional cost impact (for DET-004 ranking)

Ranked by estimated annual token spend (qualitative until DET-401 pulls the Anthropic console):

1. `generate-tactical-brief-background` (heaviest, Sonnet x multiple passes per brief)
2. `contract-intel-refresh-background` (7 Sonnet passes on schedule)
3. `score-deck-background` (8k-token Sonnet per scoring)
4. `newsletter-sync` (Claude + web_search twice weekly)
5. `competitive-scan` (Claude + web_search weekly)
6. `engagement-brief` (low volume, optional call)
7. `agent-bridge` (no LLM cost, architectural simplification only)

---

## Pending sections

- **n8n Workflows** — populated by DET-002
- **OpenClaw Agents and Cron** — populated by DET-003
- **Ecosystem Summary** — populated by DET-004
