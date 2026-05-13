# Government API Integration Audit

**Status as of 2026-05-13.** This document is the source of truth for which government APIs and data feeds the Mission Meets Tech codebase already integrates, which are missing, and what the recommended order is for the next wave. The codebase already has substantial backend integration depth — sixteen `netlify/functions/lib/*.js` modules cover roughly 21 federal data domains. The gaps are in: (a) a single discoverable registry, (b) a status-probe command (`npm run gov:check`), (c) a small set of remaining Tier 1 sources (CISA KEV, NVD, SAM PSC, Acquisition Gateway / FCO validation), and (d) `.env.example` documentation of the government keys that already exist in production.

## Frontend exposure: clean

Grep across `js/`, `agencies/`, `premium/`, `demos/`, and root `*.html` returned:

- 0 hardcoded `api_key=` query parameters.
- 0 direct browser fetches against `api.sam.gov`, `api.regulations.gov`, or any other key-protected federal endpoint.
- 0 SAM or Regulations.gov tokens in committed code.

Every key-protected federal call is proxied through `netlify/functions/*` with credentials loaded from `process.env`. No remediation required for frontend exposure.

## Found integrations

| Library (path under `netlify/functions/lib/`) | Domains | Auth | Consumers |
|---|---|---|---|
| `federal-data-apis.js` | USASpending awards/spending; SAM.gov Opportunities; SAM.gov Entity Management; Federal Register; GAO Reports | `SAM_GOV_API_KEY` (SAM only; USAS/FR/GAO public) | `premium-assistant.js`, `signal-chain.js`, `compliance-check.js`, `generate-tactical-brief-background.js`, `pursuit-score-engine.js` |
| `regulations-gov.js` | Regulations.gov v4 dockets, documents, open comment periods | `REGULATIONS_GOV_API_KEY` (fallback `DEMO_KEY`) | `premium-assistant.js` |
| `ecfr-api.js` | eCFR search + section fetch; FAR/DFARS/HIPAA/VA Regs title hints | none (public) | `premium-assistant.js` |
| `calc-rates.js` | GSA CALC+ labor-rate ceilings (search + enrich) | none (public) | `premium-assistant.js` |
| `govinfo-api.js` | GovInfo (Congressional reports, CFR packages, hearings, bills) | `CONGRESS_API_KEY` (shared key with Congress API) | (helpers; expand consumers as MMT needs grow) |
| `grants-api.js` | Grants.gov opportunities | none | (helpers) |
| `congress-api.js` | Congress.gov bills/members/committees | `CONGRESS_API_KEY` | `signal-chain.js` (legislative layer) |
| `usajobs-api.js` | USAJOBS listings | `USAJOBS_API_KEY` + `USAJOBS_USER_EMAIL` | (helpers) |
| `sam-wage-determinations.js` | SAM.gov Wage Determinations | `SAM_GOV_API_KEY` | (helpers) |
| `sam-contract-awards.js` | SAM.gov Contract Awards | `SAM_SYSTEM_ACCOUNT_API_KEY` (distinct from `SAM_GOV_API_KEY`) | (helpers) |
| `cms-provider-data.js` | CMS provider data | none | (helpers) |
| `bls-api.js` | Bureau of Labor Statistics | (per BLS) | (helpers) |
| `clinicaltrials-api.js` | ClinicalTrials.gov | none | (helpers) |
| `onc-chpl-api.js` | ONC Certified Health IT Product List | none | (helpers) |
| `onc-healthit-api.js` | ONC health IT data | none | (helpers) |
| `pubmed-api.js` | PubMed | none | (helpers) |
| `sec-edgar-api.js` | SEC EDGAR | none | (helpers) |
| `it-dashboard-api.js` | Federal IT Dashboard | none | (helpers) |
| `sam-assistance.js` | SAM.gov Assistance Listings (CFDA) | `SAM_GOV_API_KEY` | (helpers) |

**Scheduled refresh functions** (cron from `netlify.toml`):

| Function | Schedule (UTC) | Source |
|---|---|---|
| `contract-intel-refresh` | daily 11:00 | Claude + web search per contract |
| `opportunity-radar` | every 4h | SAM.gov Opportunities (operator-curated) |
| `refresh-single-bidder` | monthly 1st 11:00 | USASpending (extent_competed_codes B/C/E/G) |
| `protest-monitor` | daily 12:00 | GAO bid-protest case checks |
| `sb-vehicle-radar` | daily 13:00 | small-business vehicles |
| `pursuit-calendar-refresh` | every 6h | curated PURSUIT_FEEDS |
| `sam-key-expiration-reminder` | daily 14:00 | SAM key expiration (currently 2026-07-28) |
| `org-chart-monitor` | weekly Mon 11:00 | DHA + VA leadership pages |
| `stripe-subscriber-sync` | hourly | Stripe (not federal, listed for completeness) |

**Citation hygiene.** All four core libraries (`federal-data-apis`, `regulations-gov`, `ecfr-api`, `calc-rates`) preserve primary-source URLs on the returned objects (usaspending.gov/award/ID, sam.gov entity links, federalregister.gov/documents/ID, ecfr.gov/current/title-X/section-Y, regulations.gov/document/ID). CALC is the one exception — the CALC endpoint isn't user-friendly to link directly, so no per-row source URL is preserved.

**Timeouts and pagination.** Newer libraries (`calc-rates`, `ecfr-api`, `regulations-gov`) use an 8s `AbortController` timeout; `federal-data-apis` relies on Node's default. All libraries support `limit` parameters; SAM.gov also handles `offset` paginations. No formal retry wrapper exists today — callers handle `{ matched: false, error: ... }` shape per CLAUDE.md's "premium-tool/Ask MMT enrichment helper must return cleanly on upstream failure" rule.

## Missing integrations (priority)

| Tier | Source | Why MMT needs it | Endpoint | Auth | Notes |
|---|---|---|---|---|---|
| **1** | CISA KEV | Known-exploited-vulnerability list. Federal IT modernization posture; AMANDA capture; ATO conversations. | github.com/cisagov/kev-data (canonical JSON) | none | Add fetcher + scheduled daily probe. |
| **1** | NVD | CVE / CPE / vuln metadata; pair with KEV for cyber-risk context. | nvd.nist.gov/developers (REST v2) | optional `NVD_API_KEY` (higher limits) | Add fetcher; optional key. |
| **1** | SAM PSC Public API | PSC taxonomy normalization; opportunity tagging consistency. | open.gsa.gov/api/PSC-Public-API | `SAM_GOV_API_KEY` | Small lookup; pairs with existing SAM Opps integration. |
| **1** | Acquisition Gateway | Listings + documents (per OFPP FCO memo references). | api.gsa.gov/acquisitiongateway/api/v4.0 | `x-api-key` (per docs; status uncertain) | **Probe-only**. GSA Open page contradicts itself (says no APIs + describes v4.0 endpoint). DEMO_KEY documents endpoint returned 404 in prior testing. Mark `configured=false` or `endpoint_unavailable` until GSA confirms. |
| **1** | Federal Procurement Forecasting (FCO) | Forward-looking opportunity / agency forecast signal. | acquisitiongateway.gov forecast pages | unknown for public read | Treat as high-value but verify; the OFPP 2025 memo describes API integration for *agency upload*, not necessarily public read. **Probe-only**. |
| **2** | Data.gov Catalog | Dataset discovery and metadata search. | catalog.data.gov | varies | Discovery layer; not a primary data source. |
| **2** | Simpler.Grants.gov | Newer Grants.gov API (health funding signals). | simpler.grants.gov/developers | `SIMPLER_GRANTS_API_KEY` | Pairs with existing `grants-api.js`. |
| **2** | SBIR / STTR Awards | Small-business R&D, emerging vendors. | sbir.gov/api (awards, solicitation, company) | none documented | Add three sub-endpoints. |
| **2** | SBA APIs | Size standards, small-business reference data. | developer.sba.gov | varies | Pair with company enrichment. |
| **2** | NIH RePORTER | NIH grants, projects, publications (biomedical research priorities). | api.reporter.nih.gov | none | Add fetcher; high-value for federal health R&D context. |
| **2** | HealthData.gov | HHS / health datasets. | healthdata.gov | varies | Discovery layer. |
| **2** | VA Forms / VA Lighthouse | VA form metadata (low priority unless site needs it). | developer.va.gov | VA Lighthouse key | Skip unless explicit need. |
| **2** | USPTO | Trademark / patent / IP research (AMANDA, brand, vendor IP). | developer.uspto.gov | varies | Out of immediate scope. |
| **3** | VA OIG Reports | VA oversight findings, program risks, audits, pain points. | vaoig.gov/reports/all (no public API confirmed) | n/a | Manual research or RSS/scrape only if allowed. |
| **3** | GAO Reports + Protests | Oversight, bid-protests, congressional watchdog findings. | gao.gov (no official public API) | n/a | Use GAO site search/RSS or manual. Paid third-party protest APIs exist; bill-justified only. |
| **3** | Oversight.gov | Cross-IG audits. | oversight.gov (no API confirmed) | n/a | Site search/RSS/scrape only if allowed. |
| **3** | Acquisition.gov Procurement Forecasts | Agency recurring procurement forecasts. | acquisition.gov/procurement-forecasts | no API | Treat as structured page target. |
| **3** | GSA eBuy / eLibrary | RFQs / quote activity; schedule-holder data. | (no public API) | n/a | Do not automate authenticated access. |
| **3** | NASA SEWP | Contract-holder and product ecosystem. | (no public API) | n/a | Public pages or downloadables only if permitted. |
| **3** | FPDS Legacy | Procurement detail gaps not in USAspending. | FPDS SOAP/XML | varies | Prefer USAspending and SAM Contract Data first. FPDS was decommissioned 2026-02-24 per CLAUDE.md sprint note; the legacy API is effectively retired. |

## Frontend exposure risks

None identified in this audit pass. All government-API calls are server-side. The CSP in `netlify.toml` does not allow `api.sam.gov` or `api.regulations.gov` in `connect-src` for the browser, which matches the pattern.

## Recommended implementation order

1. **Documentation + registry** *(this commit)*. Write this audit doc; add `lib/gov-sources/registry.js` that catalogs every existing fetcher + the new Tier 1 additions in a single declarative form with `{id, label, domain, base_url, auth_env, function_lib, status}`.
2. **`gov:check` health command** *(this commit)*. Add `scripts/gov-check.js` and `netlify/functions/gov-source-check.js`. Local CLI reports each source as `configured`, `missing_credentials`, `endpoint_unavailable`, or `not_implemented`. The Netlify function exposes the same as a JSON endpoint for ops monitoring. **No actual data pulls** — just key presence + 1-byte HEAD probes against public endpoints.
3. **Tier 1 fetchers added** *(this commit)*. CISA KEV (no auth), NVD (optional key), SAM PSC (reuses SAM key), Acquisition Gateway probe (returns `endpoint_unavailable` until validated), FCO probe (returns `not_implemented` with notes).
4. **`.env.example` populated** *(this commit)*. Document every gov key in use plus the new optional ones, with setup notes and the rotation cadence for `SAM_GOV_API_KEY` (90 days).
5. *(Next sprint)* Wire CISA KEV / NVD into a `cyber-risk-context.js` enrichment layer for premium tools.
6. *(Next sprint)* Add Tier 2 — NIH RePORTER and SBIR — after the Tier 1 probes are stable. NIH RePORTER is high-value for federal health R&D context; SBIR for emerging-vendor discovery.
7. *(Next sprint)* Add a `gov_source_runs` Supabase table to log every scheduled refresh with `{source_id, started_at, finished_at, status, records_seen, records_new, error_code}` — already implied by the cron pattern but not currently logged uniformly. Today's logging goes through `ops_events` ad-hoc.
8. *(Backlog)* Tier 3 — manual research monitors. Do not automate without confirmed API terms.

## Credential matrix (env vars in use)

| Env var | Source | Where read | Auth pattern |
|---|---|---|---|
| `SAM_GOV_API_KEY` | SAM.gov Opportunities / Entity / PSC / Wage Determinations / Assistance | `federal-data-apis.js`, `sam-wage-determinations.js`, `sam-assistance.js`, `sam-key-expiration-reminder.js` | `?api_key=` query parameter. **Rotates every 90 days.** Current expiry **2026-07-28**. |
| `SAM_SYSTEM_ACCOUNT_API_KEY` | SAM.gov Contract Awards | `sam-contract-awards.js` | System account; distinct from `SAM_GOV_API_KEY`. |
| `REGULATIONS_GOV_API_KEY` | Regulations.gov v4 | `regulations-gov.js` | `?api_key=`. Falls back to `DEMO_KEY` (rate-limited) if unset. |
| `CONGRESS_API_KEY` | Congress.gov + GovInfo (shared) | `congress-api.js`, `govinfo-api.js` | per-API. |
| `USAJOBS_API_KEY` + `USAJOBS_USER_EMAIL` | USAJOBS | `usajobs-api.js` | API-Key header + User-Agent email. |
| `NVD_API_KEY` *(new, optional)* | NVD CVE API | *(new fetcher)* | API key for higher rate limits. |

## QA checklist

- [x] No API keys or secrets in `src/`, static assets, client bundles, or committed source files.
- [ ] `.env.example` includes placeholders + setup notes for every supported source. *(this commit adds them)*
- [ ] `npm run gov:check` exists and reports every source. *(this commit adds it)*
- [x] Existing fetchers handle pagination via `limit`/`offset`.
- [x] Existing fetchers preserve primary-source URLs on returned objects.
- [x] Existing fetchers return `{ matched: false, error: ... }` (or equivalent) on upstream failure, never throw into Ask MMT.
- [x] Site-facing endpoints return normalized data; never echo upstream auth headers.
- [ ] Claude-facing exports as deterministic Markdown / JSON. *(future sprint — current pattern is Supabase + cron + on-demand assistant context)*
