# Sprint 2026-09-20: market-entry coverage (buyers, routes, authorization paths, state Medicaid, innovation doors, compliance rules)

Trigger: the Echelon Health Federal Entry System proposal (v2.0, 2026-09-20)
sells an AI-agent system that runs on the MMT subscription and the Agent
Access add-on. Its route maps, authorization sequencing, state Medicaid logic
and compliance flags need facts MMT did not serve. Mary asked for everything
the proposal names that the site did not cover to be built in, so an agent
pulling from the API gets the whole picture, state coverage included.

Spec: `docs/market-entry-coverage-spec.md` (written first, built against).

## What was found

- The Agent Access API and MCP served four things: opportunities, one
  opportunity, the member's tracker, recommendations. No vehicles, agencies,
  org charts, authorization paths, states, pathways or compliance rules.
- Zero repo hits for NASPO, Rapid Cloud Review, GovRAMP, StateRAMP, MARS-E,
  FAR 3.4, contingent fee, FAR 9.5, Lobbying Disclosure, cooperative
  purchasing, enhanced funding, Advance Planning Document, T-MSIS, SMC.
- HRSA and ASPR/BARDA had registry rows but no agency profile.
- Two IDIQ CSV rows had shifted columns: DHA MSS read status `614000000`
  (its obligation figure) and DLA MSPV Gen VI read `TBD`. One missing and one
  extra comma. Fixed in the CSV, JSON regenerated.
- SPARC contradiction: `data/idiq-vehicles.json` and the CMS profile said the
  period ended 2026-06-07 and a recompete was coming; `contracts.json` (since
  2026-08-17) and CMS's own FAQ say the ordering period runs 2017-02-21 to
  2027-02-20 with no plan to replace the IDIQ. Fixed the CSV row, the CMS
  profile (mmtRead, current_read, signals, a new sourced watchNext) and added
  a dated SPARC baseline to `known-vehicles.js`. One official fact everywhere.

## Research

Every external fact came from web search on 2026-09-20; the session proxy
blocked direct fetch of every outside domain (fedramp.gov, cms.gov, ecfr.gov,
medicaid.gov, acquisition.gov, govramp.org, naspovaluepoint.org, all of
them). So `confidence` is `high` only where the fact is regulation or statute
text or an official page's statement returned verbatim, `medium` where a
secondary summary carried it. Each record's `sources[]` names the URL. The
spec's section 13 is the full source log. Facts worth knowing:

- CMS Rapid Cloud Review: IS2P2 clause CMS-CLD-1.1 (June 2024), P-ATO in
  about 2 to 3 weeks, 90-day review. SPARC: ordering ends 2027-02-20, no
  successor planned.
- FedRAMP: Rev5 intake closes 2027-06-11; Rev5 sunset planned 2028-12-31;
  Consolidated Rules for 2026 launched 2026-06-25; 20x Moderate pilot ran with
  14 providers.
- SBIR/STTR lapsed 2025-10-01, reauthorized 2026-04-13 through 2031-09-30.
- LDA thresholds $3,500 and $16,000 per quarter since 2025-01-01; next
  adjustment 2029-01-01. SAT $350,000 and micro-purchase $15,000 since
  2025-10-01; 8(a) sole source $5.5M.
- FAR OCI rule (FAR Case 2023-006) still open on the 2026-09-11 open-cases
  list; the RFO Parts 3 and 49 proposed rule (2026-06-23) keeps contingent-fee
  and procurement-integrity provisions.
- GovRAMP: 73 entities in 33 states as of August 2026; formal programs in ten.
- HHS reorganization: Congress's FY2026 Labor-HHS bill rejected the
  Administration for a Healthy America merger; the FY2027 request proposes it
  again. ASPR got $3.7B including $1B for BARDA (secondary reporting).
- All 56 Medicaid jurisdictions: agency name and official domain verified per
  jurisdiction. Procurement portal, MES modernization and work-requirement
  status are `null` and listed in `pending` on every row.

## Shipped

- `data/reference/`: `buyers.json` (17), `authorization-paths.json` (13),
  `state-medicaid.json` (56 agencies plus funding rules, certification,
  cooperative purchasing, demand signals), `innovation-pathways.json` (8),
  `compliance-rules.json` (5), `buying-routes.json` (16). Registered in
  `lib/data-freshness.js` (100-day warn) and `netlify.toml` included_files.
- `lib/vehicle-status.js`: `ordering_status` derived from a row and a pinned
  date, reading a "last new order <date>" in the status text as the ordering
  end (CIO-SP3 reads closing_soon until 2026-10-29, then closed).
- `lib/agent-reference.js` and `netlify/functions/agent-reference.js`:
  twelve `/api/v1` routes under the new `reference:read` scope; every response
  carries `retrieved_at` and `dataset { as_of, last_verified, source }`.
  Redirects in `netlify.toml`; list routes are query-free so filters pass.
- `agent-mcp.js`: eleven reference tools; `_badRequest` handling; scope list.
- `agent-discovery.js`: catalog and OpenAPI for all sixteen endpoints, a
  `scopes` block (older tokens need re-minting for `reference:read`).
- Scope added to `agent-tokens.js` (also default), `oauth-core.js`,
  `agent-oauth.js`, the connection wizard and `agent-access-guide.html`.
- Ask MMT: `lib/reference-context.js` renders dated blocks for state
  Medicaid, authorization, innovation, compliance and route questions; routed
  through a new `market_entry` shape and `OPTIONAL_SYSTEMS.mmt_reference`;
  catalog row `mmt_reference`; 40 acronyms; federal web search allowlist
  gains medicaid.gov, acquisition.gov, fedramp.gov, sbir.gov and the HHS
  operating division hosts.
- Agency profiles: `hrsa` and `aspr` (13 profiles now; validator slug list
  updated; registry hints for 340B, Ryan White, medical countermeasures).
- Pages: `premium/market-entry.html` (six tabs) and
  `premium/state-medicaid.html` (56-row table with filters), content-only
  under `injectDashShell`, registered in `build.js`, `member-features.json`,
  the dashboard nav and `netlify.toml` (`/market-entry`, `/state-medicaid`,
  `/agencies/states`). `build.js` copies `data/reference/*.json` to dist.
- `scripts/validate-reference-data.js` in the build chain (schema, dates,
  https sources, cross-references, 56 unique states, voice, pending-field
  honesty), with a mutation test.
- Tests: `vehicle-status`, `reference-data`, `agent-reference`,
  `reference-context`, `agent-discovery` (catalog to redirects parity);
  `agent-mcp`, `oauth-core` and `data-freshness` updated.

## Left honestly open

- DLA MSPV Gen VI still reads "In Evaluation" with a forecast window that has
  passed; the column shift was fixed, the fact was not re-verified.
- Per-state procurement portals, MES vendors and work-requirement dates:
  56 rows of `pending`, one research pass each.
- FedRAMP cost and duration ranges beyond GAO-24-106591's statement.
- HRSA and ASPR org chart pages; org chart JSON for the ten HTML-only charts.
- `contracts.json` through the API (same envelope, next resource).
- The reference JSON is public in dist, the way `key-people.json` is. Gate it
  behind entitlement (the `idiq-fields.js` pattern) if Mary wants it paid-only.
