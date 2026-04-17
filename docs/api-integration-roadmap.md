# ProposalPulse & MarketPulse — API Integration Roadmap

**Status:** Active · **Owner:** Mary Womack · **Last updated:** 2026-04-17

This spec defines the federal-data API stack for both revenue products
(ProposalPulse + MarketPulse) and the sequence in which new sources are
being integrated. It supersedes ad-hoc source lists in individual prompts.

---

## Current Stack (integrated)

Implemented in [`netlify/functions/lib/federal-data-apis.js`](../netlify/functions/lib/federal-data-apis.js):

| API | Data | Auth | Env var |
|---|---|---|---|
| USASpending.gov v2 | Award spending, NAICS, agency budgets | None | — |
| SAM.gov Opportunities | Active solicitations | API key | `SAM_GOV_API_KEY` |
| SAM.gov Entity Management | Vendor verification, UEI | API key | `SAM_GOV_API_KEY` |
| Federal Register | Regulatory notices, proposed/final rules | None | — |
| GAO Reports | Oversight, audit findings | None | — |

## Deprecation — FPDS

FPDS.gov was decommissioned on 2026-02-24. The FPDS ATOM feed retires
permanently on **2026-07-31**.

**Repo state:** no live FPDS calls exist. The string "FPDS" survives only
in (a) LLM prompt text instructing the model to "search FPDS" and
(b) user-facing copy. Both are being scrubbed as part of this roadmap.

**Replacement:** GSA's SAM.gov Contract Awards API at `open.gsa.gov`.
Requires a SAM.gov System Account with whitelisted IPs. Approval lead
time is 2–4 weeks. This is **pending application** — MarketPulse / IDIQ
intel keeps working on USASpending v2 in the meantime.

## New Integrations (this roadmap)

All modules live in `netlify/functions/lib/` and follow the same pattern
as `federal-data-apis.js` — thin async wrappers returning normalized
JSON, with a combined `enrichWith*` helper for MarketPulse.

### Tier 1 — keyless, high leverage

| Module | File | Product | API key env |
|---|---|---|---|
| Congress.gov API v3 | `congress-api.js` | MarketPulse + ProposalPulse | `CONGRESS_API_KEY` (api.data.gov, same key works for GovInfo) |
| GovInfo.gov | `govinfo-api.js` | MarketPulse | `CONGRESS_API_KEY` |
| PubMed E-utilities | `pubmed-api.js` | Both | none (optional `NCBI_API_KEY` for 10 req/s) |
| Grants.gov | `grants-api.js` | MarketPulse | none |
| SAM.gov Contract Awards | *(in `federal-data-apis.js`, added post–System Account approval)* | Both | `SAM_GOV_SYSTEM_ACCOUNT_KEY` |
| SAM.gov Assistance Listings | `sam-assistance.js` | MarketPulse | none |

### Tier 2 — free with key

| Module | File | Product | API key env |
|---|---|---|---|
| USAJobs | `usajobs-api.js` | MarketPulse | `USAJOBS_API_KEY`, `USAJOBS_USER_EMAIL` |
| BLS Public Data | `bls-api.js` | ProposalPulse | `BLS_API_KEY` (optional, higher quota) |
| SEC EDGAR | `sec-edgar-api.js` | MarketPulse | none (User-Agent required) |
| Federal IT Dashboard | `it-dashboard-api.js` | Both | none |

### Tier 3 — specialized

- **PACER / CourtListener** — COFC bid protests. CourtListener free
  tier first; PACER only if a user-demand signal justifies the freemium fee.
- **PIEE / EDA** — actual DoD contract documents. Requires an approved
  DoD partner certificate. **Not pursued** without a paying enterprise
  customer requiring it.
- **OPM Workforce Data** — attrition, headcount trends. Added only if
  USAJobs hiring-signal feed needs context.

## Product Wiring

### MarketPulse (`generate-tactical-brief-background.js`)

`enrichWithFederalData()` already runs before Pass 1 and injects verified
API context. This roadmap extends it:

```
┌──────────────────────────────────────────────────────────┐
│  Pass 0: disambiguation (Claude Haiku)                   │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  API enrichment layer (parallel)                         │
│                                                           │
│  USASpending v2 · SAM.gov Opps · SAM.gov Entity           │
│  Federal Register · GAO · Congress.gov · GovInfo          │
│  PubMed · Grants.gov · SAM Assistance · USAJobs           │
│  SEC EDGAR · IT Dashboard                                 │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  Pass 1–2: Perplexity sonar-pro (research)               │
│  Pass 3:   Claude Sonnet (synthesis)                     │
│  Pass 4:   Claude Haiku (cross-validation)               │
└──────────────────────────────────────────────────────────┘
```

### ProposalPulse (`score-deck-background.js`)

Two new enrichment passes run **after** text extraction but **before**
the scoring Claude call:

1. **BLS labor-rate check.** Extract labor categories / rates from the
   proposal (regex on common patterns — "Senior Engineer", "$175/hr").
   Query BLS OEWS for the 10/50/90 percentile wages for the closest
   SOC code in the relevant metro. Inject percentiles into the scoring
   prompt so the evaluator persona can flag overpriced/underpriced rates.

2. **PubMed evidence check.** Extract clinical/technical keywords from
   the PWS/SOW section of the document. Query PubMed for recent (last
   5 years) peer-reviewed articles matching those MeSH terms. Inject
   top 5 citations into the scoring prompt so the evaluator can flag
   proposals that fail to cite current evidence base.

Both enrichments are non-blocking — if the API call fails, scoring
proceeds without the enrichment (logged, not thrown).

## Implementation Sequence

**Week 1–2 (this session):**

- [x] Write this spec
- [x] Scrub FPDS references from LLM prompts
- [x] Build Tier 1 keyless modules (Congress, GovInfo, PubMed, Grants, SAM Assistance)
- [x] Build Tier 2 modules (USAJobs, BLS, SEC EDGAR, IT Dashboard)
- [x] Wire new modules into MarketPulse enrichment
- [x] Wire BLS + PubMed into ProposalPulse enrichment
- [ ] Apply for SAM.gov System Account (human action — 2–4 week lead)
- [ ] Register api.data.gov API key (human action — instant)

**Week 3–4 (after keys arrive):**

- [ ] Add keys to Netlify env (`netlify env:set`)
- [ ] Verify each module with live API call in staging
- [ ] Enable Tier 2 modules in MarketPulse enrichment (feature-flag on key presence)

**Week 5+ (after SAM System Account approval):**

- [ ] Add SAM.gov Contract Awards to `federal-data-apis.js`
- [ ] Dual-query against USASpending for consistency audit
- [ ] Retire USASpending fallback once Contract Awards data is verified

## Env Vars Reference

All new env vars are added to Netlify. None are required for the code
to run — every module degrades gracefully when its key is missing
(returns `{ error: "X not configured" }` and the enrichment skips that
source).

| Env var | Used by | Required? | Where to get |
|---|---|---|---|
| `CONGRESS_API_KEY` | congress-api.js, govinfo-api.js | No (modules skip if missing) | api.data.gov |
| `NCBI_API_KEY` | pubmed-api.js | No (higher rate limit) | ncbi.nlm.nih.gov/account |
| `USAJOBS_API_KEY` | usajobs-api.js | No | developer.usajobs.gov |
| `USAJOBS_USER_EMAIL` | usajobs-api.js | Only with key | same |
| `BLS_API_KEY` | bls-api.js | No (25 req/day unregistered) | bls.gov/developers |
| `SAM_GOV_SYSTEM_ACCOUNT_KEY` | federal-data-apis.js (future) | Only for Contract Awards API | sam.gov System Account request |

## Delta vs. Full Technical Implementation Spec

The canonical full platform spec is [`docs/MMT-Technical-Spec.md`](MMT-Technical-Spec.md)
(v1.0, 2026-04-17). What in this roadmap is **landed**, what is **partial**, and
what is **queued** against that spec:

**Landed:**
- All 15 federal-data API library modules from Spec §2
- ProposalPulse enrichment (BLS + PubMed + SCA wage + ONC CHPL) — covers Spec §3.2
  compliance checks except the dedicated standalone endpoint
- Premium chat endpoint + widget with full multi-source enrichment (Spec §5.3)
- Ask MMT AI-assisted draft with corpus search (Spec §5.3 adjacent)
- Pursuit Score Engine library + `/api/pursuit-score` endpoint (Spec §3.3, §5.2)
- MMT content corpus (101 articles + 4 briefs) indexed for assistant context
- Known-vehicles dictionary (16 IDIQs) with canonical search term expansion

**Partial:**
- Compliance checks run inside `score-deck-background.js` rather than a
  standalone `/api/compliance-check` endpoint. Spec §3.2 calls for a dedicated
  endpoint + structured ComplianceReport JSON. To split out, extract the
  enrichment + rollup logic into `lib/compliance-checker.js` and expose as
  `netlify/functions/compliance-check.js`.
- NLP extraction is regex + keyword lookup (`lib/proposal-enrichment.js`);
  Spec §3.1 calls for Claude-driven structured JSON extraction. Worth an
  upgrade once live data proves the current extractor's false-negative rate
  is hurting scoring quality.

**Signal Chain v2 — Refinement (2026-04-17):**
- `lib/signal-chain-query-builder.js` — stopword-filtered keyword
  extraction + agency-gated PubMed affiliation filter. The headline fix
  for the v1 bug where DHA queries returned muscle-physiology papers.
- Full rewrite of `netlify/functions/signal-chain.js`: 5 layers each
  scoring 0–100 (not 0–25), weighted composite (Budget/Contract 25%,
  Legislative 20%, Research/Workforce 15%), verdict bands (CAPTURE
  ALERT 75+ / ACTIVE / BUILDING / EMERGING / QUIET), signal items with
  source tags + clickable URLs + relevance notes per layer instead of
  aggregate counters. SAM.gov Opportunities promoted to primary
  contract source (type-weighted with recency multiplier); Federal
  Register demoted to supplemental and always keyword-filtered.
- UI: quick-fill chips, animated 5-layer loading card, CAPTURE ALERT
  banner with pulse animation, colored source tags per signal item,
  "No signals matched — <reason>" explanations, Watch-this-topic
  subscription form.
- `migrations/009_signal_monitors.sql` + `signal-chain-subscribe.js` —
  persistent monitor table + upsert endpoint. Weekly cron sweep +
  Capture Alert email delivery is queued (v2.1).
- 1-week result cache via ops_events.

**MarketPulse v2 — Subscriber Context Integration (2026-04-17):**
- `migrations/008_subscriber_context.sql` — new `subscriber_context` table (lanes, active_pursuits, incumbent_positions, no_go_list, oci_exclusions, teaming_preferred/no_fly, vehicle_holdings) with auto-bumping `context_version`
- `netlify/functions/lib/subscriber-context.js` — loader + prompt-block
  formatter + system-prompt tagging rules (NEW / IN-FLIGHT / INCUMBENT-RECOMPETE
  / PREVIOUSLY-PASSED / OCI-BLOCKED / OFF-LANE) + post-generation validator
  that catches IN-FLIGHT pursuit recommendations, no-fly teaming, and
  fabricated-precision claims ("18% odds uncontested" etc.)
- Wired into `generate-tactical-brief-background.js`: context loads
  up-front, injects at top of primedContext before any pass, and the
  post-generation validator logs `SUBSCRIBER_CONTEXT_VIOLATION` to
  ops_events for any rule breach. No-context banner appears in the
  rendered report when a run hits a subscriber without a record.
- `netlify/functions/subscriber-context.js` — admin import endpoint
  (POST/GET/DELETE) gated on ADMIN_EMAILS. JSON import is the v2 UX;
  a full UI is v3.
- `data/subscriber-context/mary-womack-seed.json` — Mary's rockITdata
  seed. Load via `node scripts/seed-subscriber-context.js` after
  applying the migration.
- **Open-question answer (ops-code → Mary):** MarketPulse runs
  stateless per query (confirmed by inspection of
  `generate-tactical-brief-background.js` — every invocation reads
  payload, hits Supabase fresh, no session memory). So
  subscriber_context loads on every call. One DB query against a
  ~1KB record is not a concern.

**Landed since last update:**
- `lib/sam-contract-awards.js` — stub-ready FPDS replacement (Spec §2.1).
  Waits on SAM_SYSTEM_ACCOUNT_API_KEY; until then USASpending v2 remains
  the canonical awards source and the module reports `configured: false`.
- `lib/pursuit-score-engine.js` + `/api/pursuit-score` + `/premium/pursuit-score` dashboard page (Spec §3.3, §5.2)
- `/api/compliance-check` + `/premium/compliance-check` dashboard page (Spec §3.2)
  — wraps the `proposal-enrichment` rollup as a standalone endpoint with
  structured ComplianceReport JSON (ONC CHPL, SCA wage, PubMed evidence,
  documentation flags, top-fix stack).
- `/api/signal-chain` + `/premium/signal-chain` dashboard page (Spec §3.4)
  — 5-layer composite monitor (Research, Legislative, Workforce, Budget, Contract)
  with capture-alert banding. Stateless aggregator; persistence is the
  follow-up pass.
- Newsletter-to-Tool deep links: `/premium/pursuit-score.html?keyword=X&agency=Y` and
  `/premium/signal-chain.html?topic=X&agency=Y` auto-run on load.
- Tools section in dashboard sidebar + tool tile row on dashboard home.

**Queued (no implementation yet):**
- Redis/in-memory cache (`services/cache.js`) — Spec §4. Today every
  enrichment call hits the upstream API fresh; under load this will need TTL caching.
- DB schemas for `tracked-programs`, `signal-events`, `pursuit-scores`,
  `compliance-reports` (Spec §6). Today we persist runs via `ops_events`
  which is fine for audit but not for the dashboard queries the spec
  assumes. Blocker for persistent Signal Chain alerts and historical
  pursuit-score trendlines.
- `/api/programs/track` + `/api/alerts` endpoints (Spec §5.4 / §5.5)
- Full Signal Engine event-firing (persist signals, diff against user
  watch list, email when threshold crossed). Today Signal Chain is
  on-demand only.

**A++ Differentiators (Spec §9 — queued, sequenced by dependency):**
- **Editorial Intelligence Layer** — newsletter-derived structured intel
  cards displayed inside tools. Dependency: extend `scripts/build-content-corpus.js`
  to emit per-article structured facts (program names, dollar amounts,
  dates) the tools can filter and cite.
- **COMP/PSCP Live Budget Tracker** — live-tracked FY2027 account-level
  figures tied to newsletter coverage. Dependency: GovInfo API (landed) +
  a scheduled function that parses budget markups.
- **Win-Rate Correlation Engine** — personalizes Pursuit Score weights
  from a firm's actual award outcomes. Dependency: persistent
  `pursuit-scores` table + outcome capture UI. Blocked on DB schemas above.
- **Newsletter-to-Tool Deep Links** — *partial*: Pursuit Score and Signal
  Chain accept query-string deep links. Still queued: editing the newsletter
  template so "Run Signal Chain on this program" buttons are auto-injected
  into relevant articles.
- **Team Collaboration Layer** — shared pursuit lists, compliance reports,
  signal alerts across a BD team. Dependency: multi-seat auth (already in
  institutional tier) + `shared_pursuits` + `team_members` tables.

## Reference

- Canonical full spec: [docs/MMT-Technical-Spec.md](MMT-Technical-Spec.md)
- Original roadmap write-up: see chat log 2026-04-17
- Migration guide for FPDS → SAM.gov Contract Awards: <https://open.gsa.gov>
- api.data.gov signup: <https://api.data.gov/signup>
