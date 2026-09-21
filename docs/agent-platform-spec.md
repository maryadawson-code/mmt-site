# MMT Platform: Agent Support Build Spec

**Purpose.** Everything Mission Meets Tech exposes so an external agent (first run: Echelon Health) can operate on MMT data at API cost. This document merges Mary's *MMT Platform: Agent Support Build Spec* (2026-09-20) with the data-layer spec written the same day (`docs/market-entry-coverage-spec.md`, which stays as the detail for the reference datasets). Where the two differed, this file wins. The consumer side is the *Echelon Health GovCon Agent Build Spec*; this is the provider side.

**Owner:** Mary Womack. **Builder:** coding agent. **Date:** 2026-09-20. **Branch:** `claude/agency-content-coverage-expansion-7egskp`.

**Status legend.** *Built* means code, tests and validators are in the repo. *Built, gated* means the code is in and something outside the repo (a migration, a pricing decision) has to happen before it is fully live. *Pending* means not built, with the reason and the path.

## 1. Delivery order

| # | Capability | Needed by | Status |
|---|---|---|---|
| 1 | Per-agent API credentials, scopes, metering, cost ledger | before any client goes live | Built; metering columns gated on the migration (§2.4) |
| 2 | Record contract (source URL and retrieved_at on every record) | same | Built (§3) |
| 3 | State procurement coverage: data, endpoints, MCP tools | before Week 3 of the Echelon build | Built with honest coverage: ten states in detail, no live portal feed yet (§4) |
| 4 | Org chart, vehicle-status and signal endpoints reachable through MCP | Week 2 | Built (§5) |
| 5 | Overage pass-through reporting | first invoice cycle | Built as a statement; Stripe invoicing pending (§2.5) |

## 2. Entitlements, credentials, metering

Everything rides the existing `/api/mcp` OAuth 2.1 surface and the same bearer tokens. There is no second auth path.

### 2.1 Membership and the add-on

Already in place before this sprint and unchanged: an active Premium tier grants platform access; API access is the Agent Access add-on, priced per connected agent ($39 the first, $29 each additional; institutional plans are unlimited). `stripe-webhook` writes the seat count to `mp_users.agent_seats`; `lib/agent-entitlement.js` says whether a token may read; `lib/agent-auth.js` checks it on every call, so a lapsed add-on stops every agent at once. *Built (pre-existing).*

### 2.2 Per-agent credentials

One credential per connected agent, not per user. The spec's field names map onto `api_tokens` as follows, and `POST /api/tokens/list` now returns both names:

| Spec field | Column | Note |
|---|---|---|
| `agent_id` | `id` | the rate limit and the allowance are keyed on it |
| `member_id` | `user_id` | the membership the agent belongs to |
| `label` | `name` | |
| `scopes[]` | `scopes` | |
| `created_at`, `revoked_at` | same | revocation is immediate (`revoked_at` set); siblings are untouched (acceptance test 1) |

*Built.*

### 2.3 Scopes

Read-only only; no write scope exists.

| Scope | Covers | Default on a new token |
|---|---|---|
| `opportunities:read` | live opportunities, the Pursuit Calendar | yes |
| `tracker:read` | the member's own pipeline | no |
| `intel:read` | the member's recommendations; Ask MMT, Pursuit Score and Compliance Check run for the member | no (PAT), yes (OAuth) |
| `reference:read` | the market-entry reference layer and the Contract Tracker | yes |
| `states:read` | state Medicaid agencies and state MES procurement coverage | yes |
| `orgcharts:read` | agency org charts, key people, the DHA internal-vetting flag | yes |
| `signals:read` | the Signal Chain engine | no (it spends upstream API quota, SAM.gov included) |

Mary's spec named `states:read`, `orgcharts:read` and `signals:read`; the earlier data-layer spec had folded states and org charts under `reference:read`. This file adopts Mary's names. A token minted before 2026-09-20 needs re-minting to carry any of the four new scopes. Scope tables agree in `lib/agent-tokens.js`, `lib/oauth-core.js`, `agent-oauth.js`, `agent-discovery.js`, `agent-mcp.js` and the AI integrations page; `tests/unit/agent-discovery.test.js` fails if they drift. *Built.*

### 2.4 Metering

Every call already wrote one `api_audit_log` row. Each row now also records:

| Field | Source |
|---|---|
| `request_id` | minted per request (or the caller's well-formed `X-Request-Id`, echoed); returned as `X-Request-Id` on every response and as `request_id` in every error body and every REST success body |
| `client_ref` | the caller's `X-MMT-Client-Ref` header (1 to 64 chars of letters, digits, `. _ : @ / + -`). Opaque to MMT: a grouping key on the statement, never parsed, never treated as identifying data. A malformed value is dropped, not rejected |
| `tool` | the MCP tool name or REST endpoint |
| `scope` | the scope the call required |
| `records_returned` | rows in `data[]` |
| `status_code`, `cost_usd`, `response_bytes`, `session_id` | as before |

MCP now audits one row per tool call inside a POST (a batch of ten calls is ten rows), so the statement and the rate limits count what the agent actually did.

The five new columns ship in `migrations/20260920000000_agent_metering.sql`, gated on Mary as every migration is. Until it is applied, `lib/agent-auth.js` retries the insert with the legacy column set on the first missing-column error (one warning per Lambda instance, never a lost row) and the statement reads the legacy columns, so it has no `client_ref` breakdown yet. `docs/agent-access-schema.sql` carries the addendum. *Built, gated.*

### 2.5 Allowance and overage

Each credential carries a monthly call allowance. Calls past it are never cut off (the budget, session and rate gates in `lib/agent-auth.js` are the only hard stops); they are priced at the published per-call rate and appear on the monthly statement.

- **Numbers.** `lib/agent-config.js` `ALLOWANCE`: `AGENT_ALLOWANCE_CALLS_MONTH` (default 5000) and `AGENT_OVERAGE_USD_PER_CALL` (default 0.01). These defaults are placeholders nobody chose. Until Mary sets the numbers and flips `AGENT_ALLOWANCE_CONFIRMED=true`, no surface quotes them: the `/api/v1` catalog publishes `null` with `pricing_confirmed: false` (`allowanceBlock()` in `agent-discovery.js`), the member's Usage panel counts calls with no allowance and no dollars, and the alert emails do not send (2026-09-21; an email cannot be recalled). The statement JSON still carries the math with `pricing_confirmed: false` so the panel can switch over the moment the flag flips. Netlify's 4KB function-env cap applies; the three variables are small.
- **Statement.** `POST /api/tokens/usage` `{ sessionToken, tokenId, month? }` (member session, owner-scoped) returns calls against the allowance, overage calls and dollars, error calls, records returned, compute cost, and the breakdown by `client_ref` (calls, errors, records, overage attributed in call order) and by tool. `lib/agent-usage.js` reads the month in 1000-row pages. The AI integrations page shows it under each connection's **Usage** button.
- **Alerts.** The month's count comes from the `api_cost_ledger` month bucket, which now increments on every call, not only costed ones. On the exact crossing of 80 percent and of the first overage call, the member is emailed (`sendEmail`, result checked) once per agent, month and alert, with a Netlify Blobs marker so an at-least-once caller cannot send twice. `sendAllowanceAlerts()` sends nothing, and sets no marker, while the pricing is unconfirmed; a crossing that happened before confirmation is not replayed.
- **Invoicing.** The statement is the pass-through report the spec asks for at the first invoice cycle. Charging the overage through Stripe (a metered price on the add-on subscription) is *pending*: it needs Mary's pricing decision first, then a Stripe metered price and a monthly usage-record push from the ledger.

*Built, gated on the pricing decision: counting and the statement are live, every quoted number and every alert email waits for `AGENT_ALLOWANCE_CONFIRMED=true`. Stripe metered billing pending.*

## 3. Record contract

Applies to every record every endpoint and tool returns (`lib/record-contract.js`).

| Field | Rule |
|---|---|
| `source_url` | the primary public source, not an MMT page. For MMT's own output (a score, a derived status, an engine card) it is `null` and `gap` names the provenance instead |
| `retrieved_at` | ISO 8601, when MMT last read the source |
| `confidence` | `verified`: primary source read inside the window with high confidence. `reported`: a secondary account, a medium-confidence read, or no read date. `stale`: `retrieved_at` older than the type's window |
| `as_of` | when the underlying fact is effective, where that differs from the read |
| `gap[]` | `{ field, reason }` for what MMT does not have. A gap is never filled with an inferred value |

Also present: `record_type`, `freshness_window_days`, and on hand-maintained records `mmt_confidence` (the dataset's own high or medium). Every list envelope carries `confidence_summary { verified, reported, stale }`.

**Freshness windows (days).** The spec's six, plus MMT's own types mapped onto the same rule:

| Type | Window | Applies to |
|---|---|---|
| opportunity | 1 | opportunity_radar rows (from `scan_date`) |
| vehicle_status | 7 | IDIQ and GWAC rows; `retrieved_at` is the dataset's generation date, also returned as `date_checked` |
| contract_award | 7 | reserved for a live award feed (USASpending) |
| org_chart | 30 | chart pages and key people |
| state_procurement | 7 | state solicitations, module landscape, participating addenda |
| statutory | 90 | funding conditions, authorization paths, innovation pathways, compliance rules |
| curated_intel | 45 | Contract Tracker rows (the tracker's own stale threshold in `scripts/validate-contract-tracker.js`) |
| reference_directory | 90 | buyers, buying routes, state agency directory, cooperative vehicles |
| calendar_event | 7 | Pursuit Calendar rows |
| engine_result | 3 | Signal Chain, Pursuit Score, Compliance Check, Ask MMT results (the engines cache 72 hours) |
| member_data | 1 | the member's own tracker and recommendation rows |

A consequence to say out loud: MMT's hand-maintained sets will often read `stale` (the DHA chart, verified 2026-07-09, reads stale today). That is the spec's intent: the consuming agent reports staleness and re-verifies instead of answering from it. Stale is not wrong; it is a check-first signal.

*Built. Acceptance tests 3 and 4.*

## 4. State procurement coverage

Scope: state Medicaid enterprise systems (MES) and the routes into them. Not general state IT.

### 4.1 Entities (`data/reference/state-procurement.json`)

| Entity | Fields | Rows on 2026-09-20 |
|---|---|---|
| `state_agency` | code, state, Medicaid agency and URL, program name, agency type, sister agencies, CIO office, procurement portal, Medicaid procurement page, spending rank | 56 (portal and CIO office for the ten highest-spending states) |
| `state_solicitation` | state, agency, title, module, type (RFP, RFI, ITN, sole source), posted, due, status (open, closed, planned, unknown), award, portal URL | 8 dated notices across CA, NY, TX, FL, IL, WA |
| `mes_module` | state, module, incumbent, contract id, contract end, certification status, status, note | 32 across the ten states |
| `coop_vehicle` | name, lead state, portfolio URL, solicitation, award date, term, module scope, awarded suppliers with master agreement numbers, participating states | 5 (NASPO ValuePoint provider services, claims processing, third party liability, pharmacy benefit services; Cloud and Software Solutions 2026) |
| `participating_addendum` | state, coop vehicle, supplier, status (executed, in_process, intent, none, unknown), effective, expires, reference | 14 |
| `funding_condition` | id, CEF number, name, citation, requirement, applies_to (modules, procurement types, funding), vendor obligation, evidence reviewed | 26: the 22 conditions of 42 CFR 433.112(b), 433.116, 433.119, 45 CFR 95.617, the SMC process |

Every record carries `sources[]` with retrieval dates, `verified`, `confidence` and `pending[]`; the API adds the record contract. Unread fields are `null` and listed in `pending`; nothing was inferred. Research ran through web search snippets only (page fetches were blocked in the build environment), and `_schema.research_method` says so. Official state, CMS, eCFR and NASPO ValuePoint pages are high confidence; vendor announcements, trade press and third-party listings are medium.

### 4.2 Sources

- NASPO ValuePoint MES portfolios: provider services module (lead Montana, 2018-06-01 to 2028-05-31, renewals in progress as of 2025-05-05), claims processing and management services (Montana, 2021-01-04 to 2028-01-03), third party liability (Georgia, 2022-02-01 to 2031-12-31), pharmacy benefit services (Georgia, master agreements effective 2025-10-29), and Cloud and Software Solutions 2026 to 2036 (Utah). No EVV, data and analytics, eligibility or care management portfolio was found.
- CMS conditions for enhanced funding: 42 CFR 433.112(b)(1) through (22) as read on eCFR, the CMS certification site's CEF pages (the CEF number equals the paragraph number; the site's own short-name table was not read, so short names are MMT's), 433.116 and 433.119, 45 CFR 95.617, SMD 22-001 (2022-04-14), SHO 25-003 (2025-08-06), the MES templates required from 2026-07-01.
- MACPAC issue brief *State Medicaid Enterprise Systems* (July 2026): FY2025 MES spending $9.0 billion (about 20 percent of Medicaid administrative spending), just under 82 percent ($7.4 billion) to contractors, about two-thirds MMIS-related, 32 percent DDI and 65 percent O&M. Sizing context only, never a live feed; carried in `_schema.market_context`.
- The ten highest-spending states (KFF FY2023 order as reported by U.S. News: CA, NY, TX, PA, FL, IL, OH, WA, MA, MI; USAFacts FY2024 totals beside them): each state's Medicaid agency, central IT office and procurement portal, and the module incumbents that appeared on official or dated pages (Gainwell in CA, FL, PA, OH; CSRA in NY; Accenture and Deloitte in TX; Acentra Health in IL, WA, MI; Maximus PNM in OH; Magellan pharmacy in CA; Optum POS in WA). Contract end dates were found for FL (2027-12-31), WA (June 2026) and MI (2026-09-30) only.

### 4.3 Coverage object

`coverage.states` has one row per jurisdiction (56) with `status` (live, partial, not_covered), `entities` (the six statuses), `last_refresh` and `reasons`. `scripts/validate-reference-data.js` fails the build when a status disagrees with the rows on file, so a hand edit cannot leave coverage lying.

**The rule.** A query that names a state whose coverage for the requested entity is `not_covered` returns `409 COVERAGE_GAP` (REST) or a `COVERAGE_GAP` tool error (MCP) carrying that state's coverage row, never an empty list. `partial` returns the rows on file with the coverage row beside them. Today every state is `partial` overall: the national entities (cooperative vehicles, funding conditions) are live for all, the directory is live for the ten and partial for the rest, and no state has a live solicitation feed.

### 4.4 Endpoints and MCP tools

| Spec tool | MMT tool | REST | Returns |
|---|---|---|---|
| `states.coverage` | `mmt_states_coverage` | `GET /api/v1/states/coverage` | live, partial, uncovered per state and entity, each with last refresh |
| (directory) | `mmt_states_agencies` | `GET /api/v1/states/agencies` | CIO office, portal, Medicaid procurement page, spending rank |
| `states.search_solicitations` | `mmt_states_search_solicitations` | `GET /api/v1/states/solicitations` | filters: state, module, status, date window |
| `states.module_landscape` | `mmt_states_module_landscape` | `GET /api/v1/states/modules` | incumbents, contract ends, certification status per module and state |
| `states.coop_routes` | `mmt_states_coop_routes` | `GET /api/v1/states/coop-routes` | cooperative vehicles with module scope; `state_participates` when a state is named |
| `states.addendum_status` | `mmt_states_addendum_status` | `GET /api/v1/states/addenda` | participating addendum status by supplier and state |
| `states.funding_conditions` | `mmt_states_funding_conditions` | `GET /api/v1/states/funding-conditions` | conditions by module or procurement type, with citations |

The 56-agency directory with funding rules and certification context stays at `GET /api/v1/states` and `/states/{code}` (`mmt_list_state_medicaid`, `mmt_get_state_medicaid`); the item form now carries the state's `procurement` detail and `procurement_coverage` row.

### 4.5 What is pending, and the path

- **Live solicitations.** Portals are heterogeneous and the build environment could not fetch them. The entity, endpoint, tool and coverage rule are built; rows are dated notices from the research pass. Path: a staging-only loop (`lib/loops`, data only, never a publishable directory, per CLAUDE.md) that reads the ten portals on a schedule into `state_solicitations` with `retrieved_at`, flipping each state's `state_solicitation` coverage to live as it lands. Until then `feed_status` on every response says there is no live feed.
- **Module landscape completeness.** Contract end dates and certification status are mostly unread; each is a gap on the row. Path: read each state's contract record or APD summary and fill `contract_end` and `certification_status` with a source.
- **The other 46 states' portals and CIO offices.** Pending per row.

## 5. Federal endpoints through MCP

Every one below is exposed as an MCP tool with the record contract applied.

| Spec tool | MMT tool | Backed by | Status |
|---|---|---|---|
| `opportunities.search` | `mmt_list_opportunities`, `mmt_get_opportunity` | Opportunity Radar (`opportunity_radar`) | Built; rows now carry the contract (opportunity, 24h from `scan_date`) |
| `contracts.awards` | `mmt_list_contracts`, `mmt_get_contract` (`GET /api/v1/contracts[/{slug}]`) | Contract Tracker (`contracts.json`) | Built; curated_intel, 45 days; a bare `https://sam.gov` or a malformed SAM permalink is never a `source_url` |
| `idiq.status` | `mmt_list_vehicles`, `mmt_get_vehicle` | IDIQ Tracker (`data/idiq-vehicles.json`) | Built; derived `ordering_status` |
| `vehicles.scan` | same | Vehicle Scanner | Built; `ordering_status`, `ordering_end`, `date_checked` and `retrieved_at` on every row (acceptance test 6) |
| `orgcharts.get` | `mmt_get_org_chart`, `mmt_list_org_charts` (`GET /api/v1/org-charts[/{agency}]`) | Agency Org Charts (DHA, VA, HHS, ASTP/ONC, ARPA-H, CMS, IHS, CDC, FDA, NIH/NITAAC, GSA) | Built; `internally_maintained: true` for DHA; HHS carries the structured contracting roster; key people for the agencies MMT profiles |
| `signals.list` | `mmt_signals_list` | Signal Chain (`signal-chain.js`, run for the member) | Built; scope `signals:read`, opt-in |
| `calendar.pursuits` | `mmt_list_calendar` (`GET /api/v1/calendar`) | Pursuit Calendar (`pursuit_calendar`, seed fallback) | Built |
| `score.pursuit` | `mmt_score_pursuit` | Pursuit Score (`pursuit-score.js`, run for the member) | Built; counts against the member's allowance |
| `compliance.check` | `mmt_compliance_check` | Compliance Check (`compliance-check.js`, run for the member) | Built; counts against the member's allowance |
| `intel.ask` | `mmt_ask` | Ask MMT (`premium-chat.js` through `makeHandler`) | Built; `sources[]` passes through unmodified (acceptance test 10) |

The engines run through their own handlers with a synthetic request, so entitlement checks, monthly caps, caching, `ops_events` logging and turn ids are exactly the web product's. For Ask MMT a one-time bridge token stands in for the subscriber token and resolves to the member's email inside the handler; nothing else can use it. Engine results are MMT-derived records (`source_url: null`, provenance in `gap`; per-claim sources sit inside the card).

**Org charts and the internal-vetting flag.** DHA org content is Mary-vetted. `lib/agent-federal.js` `mergeOrgChartRefresh()` refuses a public-source refresh of an `internally_maintained` chart without an explicit revalidation request (acceptance test 9). Today no code refreshes charts automatically (`org-chart-monitor` only flags drift), so the guard is the rule any future refresh must go through. DHA's nodes are published as a page, not structured data; the tool returns the page, the as-of date, the key people and the flag, and says so in `gap`.

## 6. Errors and limits

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | invalid, expired or revoked credential (non-enumerating, as before) |
| 403 | `FORBIDDEN_SCOPE` | scope missing; `required_scope` names it (REST and MCP) |
| 403 | `AGENT_ACCESS_REQUIRED` | the membership or the add-on lapsed |
| 404 | `NOT_FOUND` | no record |
| 409 | `COVERAGE_GAP` | state not covered for the entity; body carries the `coverage` object |
| 429 | `RATE_LIMITED`, `DAILY_LIMIT`, `SESSION_LIMIT`, `BUDGET_EXCEEDED` | with `Retry-After`; per credential (`agent_id`), so one agent's burst cannot starve a sibling |
| 429 | `MEMBER_ALLOWANCE` (MCP engines) | the member's own monthly allowance for that engine is used up |

Every response carries `X-Request-Id`; every error body carries `request_id`; the same id is on the audit row. *Built.*

## 7. Acceptance tests

All ten run in `tests/unit/agent-acceptance.test.js` against the real libraries, with hand-rolled stubs where a database or a model would be needed.

| # | Test | Pass condition | Where |
|---|---|---|---|
| 1 | Revoke one agent credential | 401 for that agent; sibling continues | `authenticateAgent` with two credentials on one membership |
| 2 | Call a tool without its scope | 403 naming the required scope | REST body and header; MCP tool error |
| 3 | Any record from any tool | `source_url` and `retrieved_at` present | every list and item tool with bundled data |
| 4 | Force a record past its freshness window | `confidence: "stale"` | vehicles listed at generation date plus ten days |
| 5 | Query an uncovered state | 409 with coverage detail | Guam module landscape |
| 6 | Vehicle status call | ordering status and date checked both returned | CMS SPARC |
| 7 | 100 calls with two `client_ref` values | statement splits them | `summarizeRows` |
| 8 | Cross the allowance threshold | 80 percent alert fires once; overage at the published rate | `alertsCrossed`, `sendAllowanceAlerts`, `allowanceState` |
| 9 | Refresh org charts from public sources | DHA content unchanged | `mergeOrgChartRefresh` |
| 10 | Ask MMT through MCP | citations identical to the web product | `askMmt` with a stubbed handler |

Supporting suites: `record-contract`, `agent-usage`, `state-procurement`, `agent-federal`, `agent-reference`, `agent-mcp`, `agent-discovery`, `agent-auth`, `reference-data` (validator mutation tests).

## 8. Not in scope

- Any write or action scope. The API is read-only.
- General state IT procurement outside Medicaid enterprise systems.
- Per-query pricing for reports; MarketPulse and ProposalPulse stay in the web product.
- Storing anything client-identifying from a consuming agent. `client_ref` stays opaque.

## 9. Decisions and follow-ups for Mary

1. **Pricing numbers.** Set `AGENT_ALLOWANCE_CALLS_MONTH` and `AGENT_OVERAGE_USD_PER_CALL`, then `AGENT_ALLOWANCE_CONFIRMED=true`, and redeploy a function bundle that requires `lib/agent-config.js` so the Lambdas pick them up (an env change alone does not). Nothing quotes an allowance or a rate to a member or in the public catalog until that flag is `true`.
2. **Apply the metering migration** (`migrations/20260920000000_agent_metering.sql`) through the Management API. Until then statements have no `client_ref` breakdown.
3. **Default scopes.** New tokens default to `opportunities:read`, `reference:read`, `states:read`, `orgcharts:read`. Narrow or widen in `lib/agent-tokens.js` and `lib/oauth-core.js`.
4. **Stripe metered billing** for overage, once the numbers are set.
5. **Portal ingestion loop** for live state solicitations (§4.5).
6. **Signal Chain through agents** spends SAM.gov quota through `lib/sam-quota.js`; it stays opt-in for that reason.

## 10. Files

- Libraries: `netlify/functions/lib/record-contract.js`, `agent-usage.js`, `state-procurement.js`, `agent-federal.js`; changed: `agent-auth.js`, `agent-config.js`, `agent-tokens.js`, `oauth-core.js`, `agent-reference.js`, `agent-data.js`, `data-freshness.js`.
- Functions: `agent-reference.js` (REST), `agent-mcp.js`, `agent-discovery.js`, `tokens-usage.js` (new), `tokens-list.js`.
- Data: `data/reference/state-procurement.json` (registered in `lib/data-freshness.js` and `netlify.toml` `included_files`, with `data/orgcharts/**` and the calendar seed).
- Migration: `migrations/20260920000000_agent_metering.sql`; `docs/agent-access-schema.sql` addendum.
- Routing: `netlify.toml` redirects for `/api/v1/contracts[/:slug]`, `/api/v1/calendar`, `/api/v1/org-charts/:agency`, `/api/tokens/usage` (state sub-resources ride `/api/v1/states/:code`).
- Member surfaces: `premium/ai-integrations.html` (scope choices, header hints, usage panel), `agent-access-guide.html` (record contract, state coverage, request ids, engines).
- Validators: `scripts/validate-reference-data.js` (coverage consistency, entity schemas, the 22 CEF rows).
