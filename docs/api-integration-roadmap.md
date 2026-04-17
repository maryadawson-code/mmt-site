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

**Queued (no implementation yet):**
- `lib/signal-engine.js` + Signal Chain dashboard (Spec §3.4)
- `lib/sam-contract-awards.js` as a distinct module (Spec §2.1) — currently
  we use USASpending v2 as the canonical awards source. Blocked on SAM.gov
  System Account approval.
- Redis/in-memory cache (`services/cache.js`) — Spec §4. Today every
  enrichment call hits the upstream API fresh; under load this will need TTL caching.
- DB schemas for `tracked-programs`, `signal-events`, `pursuit-scores`,
  `compliance-reports` (Spec §6). Today we persist runs via `ops_events`
  which is fine for audit but not for the dashboard queries the spec
  assumes.
- `/api/programs/track` + `/api/alerts` endpoints (Spec §5.4 / §5.5)

## Reference

- Canonical full spec: [docs/MMT-Technical-Spec.md](MMT-Technical-Spec.md)
- Original roadmap write-up: see chat log 2026-04-17
- Migration guide for FPDS → SAM.gov Contract Awards: <https://open.gsa.gov>
- api.data.gov signup: <https://api.data.gov/signup>
