# Sprint 2026-10-19: end-to-end freshness pass on every intel surface

Mary: "run a complete e2e on every page of intel on the site for freshness
and accuracy. if it's wrong fix it. I see a lot of outdated content
surfacing ... include full testing suite as well. then integrity pulse."

## What was wrong

- `validate-data-freshness` flagged 14 stale rows: nine agency profiles
  (May to July reads), the capture sheet, the calendar seed, two vehicle
  notes, and the GAO Sustain tracker (one entry, 166 days old).
- The GAO tracker's only entry, `content/gao-sustain/2026-05.md`, described
  a protest GAO **denied** (Salient CRGT, B-423283.3, 2025-12-05) as a
  sustain, cited a Washington Technology article as the decision, and named
  the wrong buyer and vehicle. PR #217 had found this on 2026-09-18 and never
  merged (it conflicted with main).
- The October capture sheet (`capture-intelligence.json`, published
  2026-10-05) still said "RMADA 3 (about $5B) is likewise unposted" three
  months after CMS awarded 17 RMADA 3 IDIQs (2026-07-08, $3.5B ceiling).
- `contracts.json` carried DHA Data Governance as an open WOSB set-aside
  (awarded 2026-02-25, total small business, HT001126CE015), NIH Scientific
  and Technical Support Services as active with a 9/15/2026 start (NIH
  cancelled the RFP 2026-08-26 after the LJR sustain), and RMADA 3 as
  "vendor TBD" while marked awarded.
- `data/idiq-vehicles.json` carried PEO DHMS Deployment Solutions as
  "Solicitation-stage, proposals due Apr 21 2026" (awarded Aug 2026, 12
  primes), 8(a) STARS III ending 2026-07-01 (ordering runs to 2029-07-01),
  and nine forecast windows that had passed.
- `data/cso-aois.json` said no AoI had posted under the DHA enterprise CSO
  (AOI0001 AWACS posted 2026-08-14); a third DHA CSO (PARATUS,
  HT003826SC004) had no tracker row at all.
- Key people: OASD-HA Principal Deputy had turned over (Ferrara to Dr.
  Vincent Lee Ball), ARPA-H Scalable Solutions listed a director the People
  page no longer names, VBA gained a Deputy Under Secretary for Field
  Operations, CDC an Acting Chief of Staff (Mina Zadeh), FDA no longer
  publishes a CIO.
- `cr-deadlines.json` said all twelve FY2026 bills were enacted in one act
  (eleven across P.L. 119-37, 119-74, 119-75; DHS ran on a stopgap) and
  named the wrong CR divisions for the VA extensions.
- `events.json` had one upcoming event and a false AMSUS date (the 2026
  meeting was in March); HLTH 2026 was dated a month early.
- Glossary said CIO-SP3 was "extended through April 2027"; the dataset says
  last new order 2026-10-29, orders end by 2028-12-31.
- Pricing and help pages claimed "200+ terms" and "86+ articles"; neither
  number came from code.
- `premium/fpds-migration.html` described FPDS as "being decommissioned"
  eight months after it was, with a Q3 ATOM sunset date no source gives.
- `scripts/validate-routes.js` compared a UTC midnight to `Date.now()`, so
  from 8 PM ET it counted the next day's staged issue as published while
  `build.js` (correctly, through `scripts/lib/publish-gate.js`) held it.
  The Netlify chain would have failed on any rebuild in that window.

## What shipped

Six research agents (key people and org charts; appropriations; contracts
and vehicles; agency profiles and policy pages; forecast, GAO and reference
data; site-wide copy and events) each re-read the official sources for one
disjoint file set and bumped a verified date only where a current source was
in hand. Where hhs.gov, nih.gov and gao.gov answered 403 to scripts, the
browser pane or the `leadership-roster-snapshot` Action's committed page
text (branch `roster-snapshot`, read 2026-10-19 17:03 UTC) was the source.

- 11 org charts, `data/key-people.json` (every block verified 2026-10-19),
  `data/orgcharts/hhs.json`.
- All nine stale agency profiles re-verified today and merged three-way with
  main's 2026-10-09 rewrite so neither pass's facts were lost.
- `contracts.json`: 6 rows corrected, 1 added (`dha-paratus-cso-ht003826sc004`,
  registered in `validate-contract-tracker.js`); `cso-aois.json` 4 CSOs, 7 AoIs;
  `idiq-vehicles.csv` 16 rows; `known-vehicles.js` 8 notes.
- GAO tracker: the denial removed; `2026-07.md` (DAS Federal, B-424464, CMS,
  8(a) STARS III, sustained 2026-07-31) written from the decision text;
  `2026-10.md` re-sourced to the decision and the NIH cancellation.
- `cr-deadlines.json` and `budget-signals.json` re-verified line by line
  (30 budget lines matched their documents; ARPA-H and ONC lines added).
- `forecast-pipeline.json` CMS rows re-pulled from the 1 October workbook;
  portals re-opened; `content/forecast-delta/2026-10.md` written.
- `data/reference/{state-procurement,authorization-paths,compliance-rules}.json`
  re-verified (Byrd threshold now $200,000 per FAC 2026-01).
- `events.json`: 5 corrected, 8 added with official pages, 9 upcoming.
- Copy: glossary, contracting, contract-tracker, idiq-tracker (count from
  `BUILD:STAT_IDIQ`), latest, resources, tools, pricing, help,
  monthly-briefs, fpds-migration, single-bidder, dhits-2026 generator.
- Three validators ported from PR #217 and wired into the `netlify.toml`
  command: `validate-idiq-vehicles.js`, `validate-capture-intelligence.js`
  (adapted to the October sheet's per-signal sources), `validate-gao-sustain.js`,
  each with a unit test. `csv-to-idiq-json.js` now refuses a row whose field
  count does not match the header.
- `validate-routes.js` reads the publish gate. `build-content-corpus.js`
  dates a forecast row by its own agency's pull (`_schema.reverified`).

## Verification

- `node build.js`, `validate-dist` (762 pages), `validate-routes` (39
  features), every validator in the `netlify.toml` chain, `validate-links`
  (762 files): all pass. `validate-data-freshness`: 0 stale (was 14).
- `npx vitest run`: 1527 passed. `npx playwright test`: 52 passed.
- `integrity-audit.js` after the production deploy: see the PR.

## Still open (not fixable from here)

- `contracts.json`: 44 of 67 rows are past the 45-day window; the daily
  `contract-tracker-reverify` job re-checks four a day. Rows not reached
  today are listed in the PR.
- `forecast-pipeline.json` VA, GSA, IHS, FDA, NIH and HHS-OS rows are the
  2026-09-10 pull: the FCO tool and SBCX export are browser-only.
- `data/premium/agency-profiles/agencies.json` `va.keyContacts` (43 va.gov
  emails) and `onc.keyContacts` look like carried exports. They never reach
  dist; deleting them is Mary's call.
- IHS DAP and OMS pages disagree on the DAP Deputy Director (Johnston vs
  Sean Long, Acting); the chart keeps Johnston per the DAP page and says so.
- HHS HCA roster stamp is still 2026-04-27; the ARPA-H HCA designation
  (Bryant Acting per HHS, Stevens BID Director per ARPA-H) waits on HHS.
- NASPO ValuePoint pharmacy benefit services expires 2026-10-28 with no
  renewal posted.
- The `leadership-roster-snapshot` Action cannot open its weekly PR until
  the repository setting allows Actions to create pull requests.

## Rule

- A GAO Sustain entry's `decision_url` is the gao.gov permalink of a
  sustained decision; trade-press coverage is not the decision and a denial
  never goes in the tracker (`scripts/validate-gao-sustain.js` gates the
  build). A partial forecast re-pull records `_schema.reverified` so each
  row is dated by its own pull.
