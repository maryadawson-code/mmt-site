# Market-entry coverage: buyers, routes, authorization paths, state Medicaid, innovation doors, compliance rules

**Status:** Active. **Owner:** Mary Womack. **Written:** 2026-09-20. **Branch:** `claude/agency-content-coverage-expansion-7egskp`.

## 1. Why this exists

The Echelon Health engagement proposal (v2.0, 2026-09-20) sells a federal
entry system that runs on the MMT data subscription and the Agent Access
add-on. Its modules need facts MMT does not serve today:

- buying routes with vehicle ordering-period status and a retrieval date on every route;
- security authorization sequencing (FedRAMP, CMS Rapid Cloud Review, DoD impact levels, VA, ONC certification, state programs);
- state Medicaid coverage: cooperative purchasing routes and the federal enhanced-funding conditions;
- innovation and pilot pathways, with the two vendor traps the proposal names (CMS does not require full FedRAMP for low-risk SaaS; an HHS SBIR Phase III is not a purchase route);
- compliance flags for FAR contingent fees, organizational conflicts of interest, the Lobbying Disclosure Act and procurement-sensitive information.

Echelon is one buyer of this. Every Premium member who sells into VA, DHA,
HHS or a state Medicaid agency needs the same reference, and every agent
connected through `/api/v1` or `/api/mcp` should be able to pull it.

This spec is the contract for what was built. `docs/sprints/2026-09-20-market-entry-coverage.md`
records how it went.

## 2. What existed on 2026-09-20 and what was missing

| Proposal need | MMT before this sprint | Gap |
|---|---|---|
| Opportunity and contract tracking | `opportunity_radar` through `/api/v1/opportunities`; `contracts.json` (64 rows) on the site | None for opportunities. Contracts not in the API. |
| IDIQ and vehicle status with retrieval date | `data/idiq-vehicles.json` (35 rows, dataset-level `generated_at`), `known-vehicles.js` (16 dated baselines), IDIQ Tracker page | Not in the API or MCP. No derived ordering status. Two CSV rows had shifted columns (MSS status read `614000000`, DLA MSPV read `TBD`). |
| Org charts for DHA, VA, HHS, ASTP/ONC, ARPA-H, CMS | 11 Premium chart pages, one JSON (`data/orgcharts/hhs.json`), `data/key-people.json` | No machine-readable index of chart pages and their as-of dates. |
| Agency coverage: VA, DHA/MHS, CMS, ASTP/ONC, NIH, CDC, HRSA, IHS, ARPA-H, ASPR/BARDA, state Medicaid | 27 federal agencies in `lib/federal-agencies.js`; 11 agency profiles (no HRSA, no ASPR/BARDA); zero state coverage | HRSA and ASPR/BARDA profiles. Everything about states. |
| Security authorization planning | Scattered mentions of FedRAMP and IL5 in articles and profiles | No structured dataset. Zero hits for Rapid Cloud Review, GovRAMP, MARS-E. |
| Innovation pathways | `data/cso-aois.json` (DHA CSO), SBIR mentioned in articles | No dataset for SBIR/STTR status, ARPA-H ISOs, BARDA BAAs, MTEC, VA Pathfinder, CMS Innovation Center models. |
| Compliance controls | `lib/regulatory-flags.js` (GSA MAS TDR, FAR reps and certs, CMMC) | Zero hits for FAR 3.4, FAR 9.5, Lobbying Disclosure Act, Procurement Integrity Act, Byrd Amendment. |
| Cited research answers | Ask MMT with 25 catalogued sources | No state Medicaid source. Web fallback domain list lacked medicaid.gov, fedramp.gov, sbir.gov, acquisition.gov. |

## 3. Design rules

1. **Every record is dated and sourced.** Each dataset carries `_schema.last_verified`; each record carries `verified` (YYYY-MM-DD), `sources[]` with `url` and `label`, and `confidence` (`high` for regulation text, statute, or an official page whose facts a search returned verbatim; `medium` for a secondary source or a search summary of an official page; `low` is not published). Research for this sprint ran through web search because the session's egress proxy blocks direct fetches of every external domain; the sprint note says so and every `sources[]` entry names the URL the fact came from.
2. **A gap is visible, never filled.** A field the research did not verify is `null` and listed in the record's `pending[]` with a note. `source_pending` is a value, not a guess. No placeholder strings.
3. **One official fact, every dataset.** A vehicle's status lives in `data/idiq-vehicles.json`; `buying-routes.json` and `buyers.json` reference it by `vehicle_id` and never restate it. The API derives `ordering_status` at request time from that one row.
4. **Read-only, no new credentials, no cron.** The reference layer is hand-maintained JSON under `data/reference/`, bundled into the functions through `netlify.toml` `included_files`, aged by `lib/data-freshness.js` (100-day warn, quarterly cadence). Nothing here calls an upstream API at request time.
5. **The API stamps retrieval.** Every list or item response carries `retrieved_at` (server time) and `dataset: { as_of, last_verified, source }` so a consumer can put the proposal's "status and date checked" on every claim without a second call.
6. **Public JSON, gated pages, scoped API.** The JSON files ship to `dist/data/reference/` the way `key-people.json` and `cr-deadlines.json` already do, the Premium pages sit behind the `mmt_premium` gate, and the API requires a token carrying the new `reference:read` scope (Premium plus the Agent Access add-on). Nothing in these files is subscriber data or a named private contact.
7. **Voice.** Reference copy is factual and short. Banned words, em dashes and exclamation points fail the unit test. Proper nouns that contain a banned word (a program named "Health Technology Ecosystem") are allowed only in `name` and `program` fields.

## 4. Datasets (`data/reference/`)

### 4.1 `buyers.json`

One row per buyer the proposal names, plus the HHS operating divisions the
registry already carries and the state Medicaid segment.

```
{ "_schema": { "version": "1.0", "last_verified": "2026-09-20", "note": "..." },
  "buyers": [ {
    "code": "CMS",                       // matches lib/federal-agencies.js code, or "STATE_MEDICAID"
    "name": "Centers for Medicare & Medicaid Services",
    "segment": "federal" | "state",
    "parent": "HHS" | null,
    "entry_characteristics": ["..."],    // the proposal's section 8, expanded and sourced
    "authorization_paths": ["fedramp_rev5", "cms_rcr", ...],   // ids in authorization-paths.json
    "buying_routes": ["agency_idiq_task_order", ...],          // ids in buying-routes.json
    "innovation_pathways": ["cms_innovation_center_models"],   // ids in innovation-pathways.json
    "vehicles": ["cms-sparc"],           // vehicle_id in data/idiq-vehicles.json
    "profile_url": "/agencies/cms/",     // null when no profile
    "org_chart": { "url": "/premium/org-charts/cms", "as_of": "2026-08-25" } | null,
    "key_people_code": "DHA" | null,     // agency_code in data/key-people.json
    "watch": ["..."],                    // dated facts that change an entry plan
    "sources": [{ "label": "...", "url": "https://...", "retrieved": "2026-09-20" }],
    "verified": "2026-09-20", "confidence": "high" | "medium", "pending": ["..."]
  } ] }
```

Buyers: VA, DHA, CMS, ONC (ASTP), NIH, CDC, HRSA, IHS, ARPA-H, ASPR (BARDA), FDA, SAMHSA, AHRQ, HHS (department), GSA and NASA (vehicle owners, not health buyers), STATE_MEDICAID (segment row pointing at `state-medicaid.json`).

### 4.2 `authorization-paths.json`

```
{ "id": "cms_rcr", "name": "CMS Rapid Cloud Review", "type": "agency_alternative",
  "owner": "CMS ISPG SaaS Governance", "applies_to": ["CMS"],
  "data_types": ["SaaS handling CMS data without a current FedRAMP authorization"],
  "requirement": "...", "process": ["..."], "duration": "2 to 3 weeks to a CMS provisional ATO; continuous monitoring review after 90 days",
  "cost": null, "key_dates": [{ "date": "2024-06", "event": "IS2P2 update adds clause CMS-CLD-1.1" }],
  "relevance_to_entry_plan": "...", "sources": [...], "verified": "...", "confidence": "...", "pending": [...] }
```

Types: `federal_program` (FedRAMP Rev5 agency authorization; FedRAMP 20x Low and Moderate), `agency_alternative` (CMS RCR), `dod_overlay` (IL2, IL4, IL5 under the CC SRG), `agency_ato` (VA), `certification` (ONC Health IT Certification Program), `state_program` (GovRAMP, TX-RAMP), `cms_state_systems` (MARS-E for state E&E systems), `legal_baseline` (HIPAA Security Rule, cited from eCFR 45 CFR Part 164 Subpart C).

Cost ranges: GAO-24-106591 found estimates "from tens of thousands to millions of dollars" with actual cost data limited. That is what the dataset says. No MMT-invented ranges.

### 4.3 `state-medicaid.json`

```
{ "_schema": {...},
  "federal_funding_rules": [ { "id": "ffp_ddi_90", "citation": "42 CFR 433.15(b)(3); 433.112", ... } ],
  "certification": { "smc": {...}, "obc": {...}, "mes_modules": [...], "t_msis": {...}, "mars_e": {...} },
  "cooperative_purchasing": [ { "id": "naspo_valuepoint_cloud_software_2026", ... }, { "id": "gsa_cooperative_purchasing", ... } ],
  "demand_signals": [ { "id": "cms_0057_f", "dates": [...] }, { "id": "obbba_medicaid", ... } ],
  "agencies": [ { "code": "CA", "state": "California", "agency": "Department of Health Care Services (DHCS)",
                  "program_name": "Medi-Cal", "url": "https://www.dhcs.ca.gov/",
                  "medicaid_gov_profiles": "https://www.medicaid.gov/state-overviews/state-profiles",
                  "expansion_status": "adopted" | "not_adopted", "expansion_source": "KFF tracker, read 2026-09-20",
                  "govramp": { "participating_entity_in_state": true, "formal_program": false, "note": "..." },
                  "statewide_cloud_program": "TX-RAMP" | null,
                  "procurement_portal_url": null, "mes_modernization": null,
                  "work_requirements_status": null,
                  "sources": [...], "verified": "2026-09-20", "confidence": "high",
                  "pending": ["procurement_portal_url", "mes_modernization", "work_requirements_status"] } ] }
```

56 jurisdictions: 50 states, DC, Puerto Rico, US Virgin Islands, Guam, American Samoa, Northern Mariana Islands. Agency name and official URL are verified for all 56 (official state domains returned by search on 2026-09-20). Procurement portal, MES modernization status and work-requirement implementation are `null` with `pending` for every row; the research agent fills them state by state with a source and a date, the way `data/research-agent/idiq-vehicles.csv` is maintained.

### 4.4 `innovation-pathways.json`

SBIR/STTR (statutory lapse 2025-10-01, reauthorized 2026-04-13 through 2031-09-30; Phase III definition and the HHS caveat), ARPA-H (Open BAA, four Mission Office ISOs by solicitation number, Sprint for Women's Health, ARPANET-H hubs, other transaction authority 42 U.S.C. 290c, FY2027 request $945M against $1.5B FY2026), BARDA (BAA on SAM.gov, DRIVe EZ-BAA under $750K, other transaction authority 42 U.S.C. 247d-7e(c)(5)), DHA CSO (cross-reference to `data/cso-aois.json`), MTEC (OTA W81XWH-15-9-0001; DHA participates), VA Pathfinder and VHA Innovation Ecosystem, CMS Innovation Center models (WISeR, 2026-01-01, six states, six named technology vendors), unsolicited proposals (FAR 15.6, status under the FAR overhaul noted).

### 4.5 `compliance-rules.json`

FAR Subpart 3.4 contingent fees (52.203-5 warranty; bona fide employee or agency exception; RFO proposed rule of 2026-06-23 retains the contingent-fee provisions), FAR Subpart 9.5 OCI (in force; the 2025-01-15 proposed rule would move OCI coverage to Part 3; FAR Case 2023-006 still open on the 2026-09-11 open-cases list), Lobbying Disclosure Act (thresholds $3,500 per client per quarter for lobbying firms and $16,000 per quarter for organizations with in-house lobbyists, effective 2025-01-01; 20 percent of time test; LD-1 within 45 days; LD-2 within 20 days of quarter end; LD-203; next adjustment 2029-01-01), Procurement Integrity Act (41 U.S.C. 2101 to 2107; FAR 3.104; the $10 million compensation-ban trigger), Byrd Amendment (31 U.S.C. 1352; FAR 3.8; 52.203-11 and 52.203-12; $150,000 in 52.203-12(g)). Each rule carries `trigger_signals[]` (phrases in an engagement or partner arrangement that should raise the flag) and `action` ("flag for principal review; not legal advice").

### 4.6 `buying-routes.json`

Route archetypes with authority, thresholds (SAT $350,000 and micro-purchase $15,000 effective 2025-10-01; 8(a) sole source $5.5M, $8.5M manufacturing), prerequisites, the buyers they apply to, the `vehicle_id`s they run on, and `status_check` instructions. Includes a `disqualified_or_closing` group: CIO-SP4 (cancelled), CIO-SP3 and CIO-CS (no new orders after 2026-10-29), SPARC (no new orders after 2027-02-20; CMS says no replacement is planned), FDA Enterprise IT App Dev BPA (cancelled).

### 4.7 Vehicle status derivation (`lib/vehicle-status.js`)

Pure function `orderingStatus(row, today)`:

| Input | `ordering_status` |
|---|---|
| status matches cancelled/canceled | `cancelled` |
| status matches expired/legacy/sunset, or `pop_end` < today | `closed` |
| status matches solicitation/upcoming/market research/evaluation/pending award/source selection | `pre_award` |
| `pop_end` within 180 days | `closing_soon` |
| status matches active/awarded/sustainment/ordering and `pop_end` ≥ today or blank | `open` |
| otherwise | `unknown` |

Also returns `days_to_pop_end` (integer or null) and `status_text` (the dataset's own words). The API never rewrites the dataset's `status`; it adds the derived fields beside it.

## 5. Agent Access surface

New scope `reference:read` (added to `VALID_SCOPES` and `DEFAULT_SCOPES` in `lib/agent-tokens.js`, to `SCOPES` and `DEFAULT_SCOPES` in `lib/oauth-core.js`, to the protected-resource metadata, the OAuth consent labels, the connection wizard and the setup guide). A token minted before this sprint lacks the scope until it is re-minted; the discovery catalog says so.

### 5.1 REST (`netlify/functions/agent-reference.js`, GET, bearer auth, same audit and rate limits as the other endpoints)

| Path | Filters | Returns |
|---|---|---|
| `/api/v1/agencies` | `segment` | buyers |
| `/api/v1/agencies/{code}` | | one buyer with its resolved routes, paths, pathways and vehicles |
| `/api/v1/vehicles` | `agency`, `status` (derived), `q` | `data/idiq-vehicles.json` rows with `ordering_status`, `days_to_pop_end`, `as_of`, `source_url` |
| `/api/v1/vehicles/{vehicle_id}` | | one vehicle |
| `/api/v1/authorization-paths` | `buyer`, `type` | paths |
| `/api/v1/authorization-paths/{id}` | | one path |
| `/api/v1/states` | `expansion`, `govramp` | state Medicaid agencies, plus `rules`, `certification`, `cooperative_purchasing`, `demand_signals` in a `context` block on the list response |
| `/api/v1/states/{code}` | | one jurisdiction |
| `/api/v1/innovation-pathways` | `buyer` | pathways |
| `/api/v1/compliance-rules` | | rules |
| `/api/v1/buying-routes` | `buyer` | routes |
| `/api/v1/org-charts` | | chart pages with `as_of` and key-people counts |

Envelope: the existing list envelope (`data`, `total_count`, `has_more`, `limit`, `offset`) plus `retrieved_at` and `dataset`. Item: `{ data, retrieved_at, dataset }`. Unknown id: 404 `NOT_FOUND`. Bad filter or paging: 400 `BAD_REQUEST`.

### 5.2 MCP tools (`agent-mcp.js`, scope `reference:read`, all read-only)

`mmt_list_buyers`, `mmt_get_buyer`, `mmt_list_vehicles`, `mmt_get_vehicle`, `mmt_list_authorization_paths`, `mmt_list_state_medicaid`, `mmt_get_state_medicaid`, `mmt_list_innovation_pathways`, `mmt_list_compliance_rules`, `mmt_list_buying_routes`, `mmt_list_org_charts`. The `initialize` instructions tell the connector to carry `as_of` or `verified` and `retrieved_at` into any claim it makes.

### 5.3 Discovery

`agent-discovery.js` lists every new endpoint in the catalog and the OpenAPI document. A unit test asserts every catalog path has a `[[redirects]]` rule in `netlify.toml`.

## 6. Ask MMT

- `lib/reference-context.js`: `detectReferenceTopics(question)` returns any of `state_medicaid`, `authorization`, `innovation`, `compliance`, `routes`; `formatReferenceContext(topics)` renders dated baseline blocks (each record with its `verified` date and source URLs) capped per topic. Wired into `premium-assistant.js` beside `formatVehiclesContext`, and surfaced as a source (`id: "mmt_reference"`, mode `index`) so the answer's receipts show it.
- `lib/question-shape.js`: new shape `market_entry`; `OPTIONAL_SYSTEMS.mmt_reference` routes on it, so `/ask/sources` says when it is consulted.
- `lib/acronyms.js`: MES, MMIS, APD, PAPD, IAPD, APDU, FFP, SMC, OBC, MITA, MCO, FFS, E&E, EVV, T-MSIS, MARS-E, NASPO, GovRAMP, TX-RAMP, RCR, P-ATO, CC SRG, CSP, 3PAO, LDA, OCI, PIA, MTEC, ISO (ARPA-H), EZ-BAA, DRIVe, WISeR, CMMI (already present), OBBBA.
- `lib/web-federal-search.js`: allowlist adds medicaid.gov, fedramp.gov, sbir.gov, acquisition.gov, hrsa.gov, cdc.gov, fda.gov, ihs.gov, samhsa.gov, aspr.hhs.gov, dodcio.defense.gov and public.cyber.mil. The `web_federal` catalog note lists the same domains.

## 7. Site surfaces

- `premium/state-medicaid.html`: 56-row table (search, expansion and GovRAMP filters), the funding rules, certification framework, cooperative purchasing routes and demand signals. Content-only page; `injectDashShell()` owns the shell.
- `premium/market-entry.html`: tabs for Buyers, Routes, Authorization paths, Innovation doors, Compliance rules, rendered client-side from `/data/reference/*.json`, with a dated "verified" stamp on every card and a pending list where a field is not yet covered.
- Registered in `build.js` (`dashPageMap`, `subDirPages`, both nav link arrays under Reference), `docs/member-features.json`, and `netlify.toml` (`/state-medicaid`, `/market-entry`, `/agencies/states`). `build.js` copies `data/reference/*.json` to `dist/data/reference/`.

## 8. Agency profiles

`data/premium/agency-profiles/agencies.json` gains `hrsa` and `aspr` with every field the generator and validators require (public fields, `budget.key_programs`, `key_vehicles`, `key_offices`, `upcoming_signals`, `role`, `sources[]`, `contractorRead`, `premiumModules`, one premium module with a `source_id`, `watchNext[]`). `scripts/validate-agency-profiles.js` `EXPECTED_SLUGS` grows to 13. The landing grid regenerates from the JSON. Neither agency has an org chart page yet; `ORG_CHART_AGENCIES` is unchanged.

## 9. Validators and tests

- `scripts/validate-reference-data.js` (added to the `netlify.toml` build command): schema, cross-references (`vehicle_id`, path, route and pathway ids), dates not in the future, https sources, 56 unique state codes, voice rules.
- `tests/unit/reference-data.test.js`, `tests/unit/vehicle-status.test.js` (pinned dates), `tests/unit/agent-reference.test.js` (loaders, filters, paging, 404, envelope), `tests/unit/reference-context.test.js`, `tests/unit/agent-discovery.test.js` (catalog to redirects parity), updates to `agent-mcp.test.js`, `oauth-core.test.js`, `data-freshness.test.js` fixtures.
- Build chain: `node build.js`, `validate-dist`, `validate-routes`, `validate-agency-parity`, `validate-agency-profiles`, `validate-data-freshness`, `validate-reference-data`, `npx vitest run tests/unit`. Corpus rebuilt after the IDIQ CSV fix.

## 10. Maintenance

- Cadence: quarterly re-verification of every `data/reference/*.json` (`lib/data-freshness.js` warns at 100 days). Vehicle facts keep their monthly cadence through the CSV.
- Filling a `pending` field: add the value, a `sources[]` entry with the URL and `retrieved` date, remove the field from `pending`, bump the record's `verified`. Never bump without a current source.
- When a route's vehicle changes status, change `data/idiq-vehicles.csv`, run `node scripts/csv-to-idiq-json.js`, run `node scripts/build-content-corpus.js`. `buying-routes.json` needs no edit unless the route itself closes.
- Statuses the sprint left honestly stale: DLA MSPV Gen VI reads "In Evaluation" with a forecast window that has passed. The column shift was fixed; the fact was not changed because no current source was checked.

## 11. Acceptance tests (mirroring the proposal's section 11)

| Test | Pass condition | How this sprint meets it |
|---|---|---|
| Vehicle currency | Any vehicle named carries ordering-period status and the date checked | `/api/v1/vehicles` returns `status`, `ordering_status`, `pop_end`, `as_of`, `retrieved_at`, `source_url` on every row |
| Evidence discipline | A deliverable with missing inputs names the gap | Every record's `pending[]`; `null` fields; `confidence` |
| Coverage point 1 | CMS entry plans account for Rapid Cloud Review | `authorization-paths.json` `cms_rcr` with the IS2P2 clause, the 2 to 3 week P-ATO timing and the 90-day review |
| Coverage point 2 | An HHS SBIR Phase III is not treated as a purchase route | `innovation-pathways.json` `sbir_sttr` carries the Phase III definition, the sole-source rule and the HHS caveat with its source |
| State Medicaid | Cooperative purchasing routes and enhanced-funding conditions are in the route logic | `state-medicaid.json` `federal_funding_rules`, `cooperative_purchasing`; `buying-routes.json` `state_cooperative_contract`, `state_competitive_procurement` |
| Compliance flags | FAR 3.4, FAR 9.5, LDA and procurement-sensitive information are flaggable | `compliance-rules.json` with `trigger_signals[]` and thresholds |
| Independence | The data is usable without the system | Public JSON in dist; the pages render from the same files |

## 12. Out of scope, flagged for later

- Entitlement-gating the JSON itself (the `idiq-fields.js` pattern) if Mary decides the reference layer should not be public.
- Per-state procurement portals, MES module vendors and incumbents, work-requirement implementation dates: 56 rows of `pending`, one research pass each.
- FedRAMP cost and duration ranges beyond GAO's statement: no official range exists to cite.
- Org-chart JSON for the ten agencies that only have HTML charts; HRSA and ASPR/BARDA chart pages.
- Contracts (`contracts.json`) through the API. It is the next obvious resource and shares this envelope.
- Ask MMT live clients for data.medicaid.gov and the CMS MES certification repository.

## 13. Source log

Retrieval method for every entry: web search on 2026-09-20 returning the page's own statements; direct fetch was blocked by the session proxy. The dataset `sources[]` fields carry the same URLs.

- CMS Rapid Cloud Review: https://security.cms.gov/learn/rapid-cloud-review-rcr and https://security.cms.gov/posts/what-is2p2s-new-rapid-cloud-review-rcr-requirement-means-you
- CMS SPARC: https://www.cms.gov/data-research/cms-information-technology/sparc and https://www.cms.gov/Research-Statistics-Data-and-Systems/CMS-Information-Technology/SPARC/FAQ
- FedRAMP 20x and Consolidated Rules 2026: https://www.fedramp.gov/20x, https://www.fedramp.gov/2025-12-10-announcing-the-initial-20x-phase-2-pilot-participants/, https://www.crowell.com/en/insights/client-alerts/time-for-a-change-fedramp-fundamentally-revamps-program-with-consolidated-rules-for-2026
- GAO on FedRAMP cost: https://www.gao.gov/products/gao-24-106591
- DoD CC SRG impact levels: https://public.cyber.mil/dccs/, https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-dod-il5
- VA cloud policy: https://www.va.gov/vapubs/viewPublication.asp?Pub_ID=1602&FType=2 (VA Notice 25-06), https://www.va.gov/vapubs/viewPublication.asp?Pub_ID=853&FType=2 (Handbook 6517)
- ONC HTI-4 and HTI-5: https://healthit.gov/regulations/hti-rules/hti-4-final-rule/, https://www.federalregister.gov/documents/2025/12/29/2025-23896/health-data-technology-and-interoperability-astponc-deregulatory-actions-to-unleash-prosperity
- GovRAMP: https://govramp.org/participating-governments/, https://govramp.org/news/govramp-advances-2026-modernization-and-national-adoption
- TX-RAMP: https://dir.texas.gov/information-security/texas-risk-and-authorization-management-program-tx-ramp
- MARS-E: https://www.medicaid.gov/faq/what-applicability-of-minimum-acceptable-risk-standards-for-exchanges-mars-e-20-states-medicaid-management-information-systems-mmis/index.html, https://www.cms.gov/files/document/mars-e-v2-2-vol-1final-signed08032021-1.pdf
- 42 CFR 433 Subpart C: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-433/subpart-C
- 45 CFR 95.611: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-95/subpart-F/subject-group-ECFR8ea7e78ba47a262/section-95.611
- SMC (SMDL 22-001): https://www.medicaid.gov/federal-policy-guidance/2022-04-14/134796, https://www.medicaid.gov/sites/default/files/2022-04/smc-certification-guidance.pdf
- MES certification repository: https://cmsgov.github.io/CMCS-DSG-DSS-Certification/
- T-MSIS: https://www.medicaid.gov/medicaid/data-systems/medicaid-and-chip-business-information-solution/transformed-medicaid-statistical-information-system-t-msis
- NASPO ValuePoint Cloud and Software Solutions: https://www.naspovaluepoint.org/portfolios/cloud-and-software-solutions/, https://www.naspovaluepoint.org/portfolios/cloud-solutions-2016-2026/
- GSA Cooperative Purchasing: https://www.gsa.gov/buy-through-us/purchasing-programs/programs-for-state-and-local-governments/cooperative-purchasing-program
- CMS-0057-F: https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-prior-authorization-final-rule-cms-0057-f
- Medicaid provisions of H.R. 1 (2025): https://www.americanprogress.org/article/the-implementation-timeline-of-the-one-big-beautiful-bill-act/, https://www.chcs.org/resource/a-summary-of-national-medicaid-work-requirements/
- Medicaid expansion status: https://www.kff.org/medicaid/status-of-state-medicaid-expansion-decisions/
- SBIR/STTR reauthorization: https://www.govtrack.us/congress/bills/119/s3971, https://www.crowell.com/en/insights/client-alerts/sbirsttr-programs-reauthorized-after-six-month-lapse, https://www.sbir.gov/about/policies
- HHS SBIR Phase III caveat: https://seed.nih.gov/sites/default/files/HHS-SBIR-Contract-Solicitation-Webinar-PHS-2023-1-Transcript.pdf (cited by the Echelon proposal; not re-fetched)
- ARPA-H: https://arpa-h.gov/research-and-funding/open-baa, https://arpa-h.gov/explore-funding/open-funding-opportunities, https://uscode.house.gov/view.xhtml?req=granuleid%3AUSC-prelim-title42-section290c&num=0&edition=prelim, https://cra.org/govaffairs/blog/2026/05/nist-nih-nasa-fy2027-pbr/
- BARDA: https://medicalcountermeasures.gov/barda/partnering, https://drive.hhs.gov/ezbaa.html, https://sam.gov/opp/8cdd54823bce4db5814e0b9a0fe63fac/view, https://uscode.house.gov/view.xhtml?req=42+USC+247d-7e
- MTEC: https://mtec-sc.org/, https://mrdc.health.mil/index.cfm/collaborate/doing_business_with_us/partner
- VA Pathfinder: https://news.va.gov/press-room/va-launches-pathfinder-a-virtual-concierge-to-streamline-procurement-and-innovation/
- CMS WISeR model: https://www.dlapiper.com/en/insights/publications/2026/01/cms-wiser-model, https://medicare.chir.georgetown.edu/new-cms-wiser-model-revives-concerns-of-prior-authorization-and-artificial-intelligence/
- FAR overhaul Parts 3 and 49 proposed rule: https://www.federalregister.gov/documents/2026/06/23/2026-12562/federal-acquisition-regulation-revolutionary-federal-acquisition-regulation-overhaul-parts-3-and-49; FAR 3.4 text: https://www.ecfr.gov/current/title-48/chapter-1/subchapter-A/part-3/subpart-3.4/
- FAR 9.5 and the OCI proposed rule: https://www.acquisition.gov/far/subpart-9.5, https://www.federalregister.gov/documents/2025/01/15/2024-31561/federal-acquisition-regulation-preventing-organizational-conflicts-of-interest-in-federal, https://www.acq.osd.mil/dpap/dars/opencases/farcasenum/far.pdf
- FAR thresholds effective 2025-10-01: https://www.federalregister.gov/documents/2025/08/27/2025-16412/federal-acquisition-regulation-inflation-adjustment-of-acquisition-related-thresholds
- LDA thresholds: https://www.senate.gov/legislative/Public_Disclosure/new_thresholds.htm, https://www.govinfo.gov/content/pkg/FR-2025-01-30/html/2025-01941.htm, https://lda.congress.gov/Guidance/ldaguidance.pdf
- Procurement Integrity Act: https://www.acquisition.gov/far/3.104-3, https://www.justice.gov/jmd/procurement-integrity
- Byrd Amendment: https://www.federalregister.gov/documents/2007/08/17/07-3807/federal-acquisition-regulation-far-case-2005-035-changes-to-lobbying-restrictions
- HHS reorganization and FY2026 appropriations: https://www.congress.gov/crs_external_products/LSB/HTML/LSB11311.web.html, https://www.astho.org/advocacy/federal-government-affairs/leg-alerts/2026/summary-fy26-lhhs-bill-january-2026/, https://www.hhs.gov/sites/default/files/fy-2027-aha-cj.pdf
- HRSA: https://www.hhs.gov/about/leadership/thomas-engels.html, https://www.hrsa.gov/optn-modernization/updates/january-2026, https://www.hrsa.gov/optn-modernization/updates/february-2026, https://www.hrsa.gov/optn-modernization/updates/july-2026
- ASPR and BARDA: https://www.aspr.gov/, https://aspr.hhs.gov/AboutASPR/ProgramOffices/BARDA/Pages/default.aspx, https://www.acep.org/news/acep-newsroom-articles/2-3-26-2026-hhs-funding-update, https://www.cidrap.umn.edu/biosecurity-issues/federal-health-agencies-say-they-need-big-funding-bump-prepare-future
- State Medicaid agencies: one official state domain per jurisdiction, recorded in `state-medicaid.json` `agencies[].sources`.
