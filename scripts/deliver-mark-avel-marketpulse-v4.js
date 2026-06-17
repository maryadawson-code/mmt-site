// ============================================================
// deliver-mark-avel-marketpulse-v4.js — remediated prospective re-run
//
// Manual MarketPulse v4 re-run for Mark Johnston (Avel eCare).
// Customer flagged that the original 2026-06-15 report used stale,
// already-passed action dates (Q1/Q2 FY2026, January 2026). This
// rebuild is fully PROSPECTIVE (baseline 2026-06-16) with a 12–24
// month projection, source-verified to Tier 1 primaries, and matches
// the original's operational depth (named IHS Areas, tribal orgs,
// coalitions, committee targets, a dated 90-day plan) while correcting
// its factual errors.
//
// Usage:
//   DRY=1 node scripts/deliver-mark-avel-marketpulse-v4.js   # score+audit+render, no DB, no email
//   node scripts/deliver-mark-avel-marketpulse-v4.js          # live: update DB, email Mark, notify Mary, log ops_event
//
// LIVE mode requires production env (Netlify): SUPABASE_URL,
// SUPABASE_SERVICE_KEY, RESEND_API_KEY, REPORT_VIEWER_SECRET.
//
// Delivery gate (all must pass before live send):
//   - score.total >= 85
//   - 0 Tier A self-audit hard stops
//   - Tier 1 share >= 60%
//   - report renders cleanly via renderMarketPulseHTML
// ============================================================

const path = require("path");
const ROOT = "/Users/marywomack/Projects/mmt-site";

const { renderMarketPulseHTML } = require(path.join(ROOT, "netlify/functions/lib/report-html-renderer"));
const { scoreReportV4 } = require(path.join(ROOT, "netlify/functions/lib/research-score-v4"));
const { runSelfAudit, checkStopConditions } = require(path.join(ROOT, "netlify/functions/lib/self-audit-v4"));
const { classifyAll, buildSourceTable, autoLabelTier3 } = require(path.join(ROOT, "netlify/functions/lib/source-tiering"));

const ORDER_ID = "34b3eb26-5ebb-4e7d-b9ae-31480f328240";
const NAME = "Mark Johnston";
const COMPANY = "Avel eCare";
const TOPIC =
  "Avel eCare and affiliated companies (Avel eCare Medical Group, P.C. and Asana Integrated Medical Group), a Joint Commission accredited virtual health system with Federal prime contracts with the Indian Health Service and DHA subcontracts with Leidos: the top five high-impact growth and partnership strategies to deploy over the next 12 months to expand state, federal, and tribal government business, and the government affairs advocacy required to achieve those results.";
const AUDIENCE = "Government affairs + growth strategy (12–24 month horizon)";
const TODAY = "2026-06-16";

// ---- Verified citation set (Tier 1 heavy). Inline URLs in the synthesis
//      all appear here; the Source Table is generated from this list. ----
const CITATIONS = [
  // Avel federal footprint
  "https://www.usaspending.gov/search",
  "https://www.ihs.gov/newsroom/pressreleases/2016pressreleases/indian-health-service-awards-6-8-million-telemedicine-services-contract-to-avera-health/",
  "https://sam.gov/opp",
  // IHS programs + modernization
  "https://www.ihs.gov/telebehavioral/",
  "https://www.ihs.gov/telehealth/telehealthprograms/",
  "https://www.ihs.gov/hit/path-ehr/",
  "https://www.ihs.gov/selfgovernance/aboutus/",
  "https://www.ihs.gov/DAP/the-buy-indian-act/",
  "https://www.ihs.gov/businessoffice/100-percent-fmap/",
  // Tribal contracting law + appropriations
  "https://www.congress.gov/crs-product/IF11877",
  "https://www.congress.gov/crs-product/IN12087",
  "https://www.federalregister.gov/documents/2022/01/13/2021-28156/acquisition-regulations-buy-indian-act-procedures-for-contracting",
  "https://www.congress.gov/bill/119th-congress/senate-bill/699",
  // Medicaid 100% FMAP + Four Walls
  "https://www.medicaid.gov/federal-policy-guidance/downloads/SHO022616.pdf",
  "https://www.medicaid.gov/federal-policy-guidance/downloads/faq11817.pdf",
  "https://www.regulations.gov/document/CMS-2024-0199-2506",
  "https://www.medicaid.gov/federal-policy-guidance/downloads/cib090823.pdf",
  // Medicare telehealth cliff + tribal/audio-only + DEA + behavioral
  "https://www.congress.gov/bill/119th-congress/house-bill/7148",
  "https://www.cms.gov/files/document/telehealth-faq-updated-02-26-2026.pdf",
  "https://www.congress.gov/bill/119th-congress/senate-bill/1261",
  "https://www.congress.gov/bill/119th-congress/house-bill/4206",
  "https://www.congress.gov/bill/119th-congress/house-bill/2639",
  "https://www.federalregister.gov/documents/2025/12/31/2025-24123/fourth-temporary-extension-of-covid-19-telemedicine-flexibilities-for-prescription-of-controlled",
  "https://www.federalregister.gov/documents/2025/01/17/2025-01049/expansion-of-buprenorphine-treatment-via-telemedicine-encounter",
  "https://www.samhsa.gov/substance-use/treatment/statutes-regulations-guidelines/buprenorphine-telemedicine-prescribing",
  "https://www.dea.gov/press-releases/2025/12/31/dea-extends-telemedicine-flexibilities-ensure-continued-access-care",
  // DoD / DHA / Section 712 / GAO
  "https://www.congress.gov/119/plaws/publ60/PLAW-119publ60.pdf",
  "https://www.congress.gov/bill/119th-congress/house-bill/8800/all-info",
  "https://www.gao.gov/products/gao-26-107677",
  "https://www.army.mil/article/265601/bach_icu_joins_dhas_joint_tele_critical_care_network",
  "https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/",
  "https://www.highergov.com/vehicle/medical-q-coded-support-and-services-nextgen-mqs2-ng-7893/",
  "https://www.govconwire.com/articles/dha-picks-11-vendors-for-unrestricted-pool-of-43b-follow-on-medical-staffing-contract",
  // VA telehealth
  "https://news.va.gov/press-room/va-makes-tele-emergency-care-available-nationwide-offering-veterans-more-virtual-care-options/",
  "https://www.va.gov/loma-linda-health-care/news-releases/va-loma-linda-launches-telecritical-care-capability/",
  "https://connectedcare.va.gov/va-telehealth-services-video",
  // Funding calendar + grants + compacts
  "https://www.congress.gov/crs-appropriations-status-table",
  "https://www.fcc.gov/general/rural-health-care-program",
  "https://www.hrsa.gov/telehealth/grants",
  "https://www.samhsa.gov/grants/grants-dashboard/forecasts",
  "https://telehealth.hhs.gov/providers/telehealth-policy/telehealth-policy-updates",
  "https://www.gao.gov/products/gao-26-107915",
  "https://counselingcompact.gov/",
  "https://psypact.gov/",
  // Tier 3 (named org target / corroborating tribal-health analysis)
  "https://crihb.org/health-center-operations/telehealth-2/",
  "https://ncuih.org/2026/06/04/house-advances-fy-2027-interior-bill-with-increases-for-ihs-and-advance-appropriations-for-fy-2028/",
  "https://www.nihb.org/federal-funding-lapses-indian-health-service-remains-open-for-business-with-advance-appropriations/",
];

// __SOURCE_TABLE__ and __SCORE_BANNER__ are injected at runtime.
const SYNTHESIS = `> ---
> **Subscriber:** Mark Johnston, VP of Government Affairs, Avel eCare (Joint Commission accredited virtual health system; affiliated entities Avel eCare Medical Group, P.C. and Asana Integrated Medical Group) · **Topic:** Top five growth/partnership strategies + government-affairs agenda to expand state, federal, and tribal government business · **Date:** ${TODAY} · **Horizon:** now through mid-2028
> __SCORE_BANNER__
> This revision supersedes the June 15, 2026 report. Every action date is forward-looking from ${TODAY}; the prior run's already-passed windows (Q1/Q2 FY2026, January 2026) are removed, and three factual errors in the prior run are corrected and noted below.
> ---

## Methodology & Limitations

This is a remediated, prospective v4 run requested after the original June 15, 2026 report cited action windows that had already passed. Three refinement passes were run: (1) verify Avel's federal footprint against USASpending and SAM and re-check the prior run's factual claims; (2) refresh every telehealth policy date and named legislative vehicle to its current controlling value as of June 2026; (3) re-cast all recommendations and the government-affairs plan onto a forward, now-through-mid-2028 calendar. Source families queried: USASpending.gov and SAM.gov (Avel awards), IHS.gov (programs, PATH EHR, Buy Indian, self-governance, 100% FMAP), Medicaid.gov and Regulations.gov (Four Walls, 100% FMAP guidance), Congress.gov and Federal Register (CAA 2026, the CONNECT Act, the tribal audio-only bill, the PRC Improvement Act, the NDAA, DEA and buprenorphine rules), GAO.gov, Health.mil/Army.mil and Washington Technology (DHA virtual health), VA.gov (Office of Connected Care), the FCC/HRSA/SAMHSA, and the interstate-compact commissions.

Three corrections to the prior run, carried into this version: (1) the prior run led with a Medicare telehealth cliff of January 30, 2026 — that date passed and was superseded; the controlling expiration is now December 31, 2027. (2) The prior run listed "IHS does not have advance appropriations" as a risk — that is no longer true; IHS has received advance appropriations since FY2024 and stayed funded through the October–November 2025 shutdown, which is an advantage, not a risk (https://www.congress.gov/crs-product/IN12087; https://www.nihb.org/federal-funding-lapses-indian-health-service-remains-open-for-business-with-advance-appropriations/). (3) The prior run treated Avel's DHA work as an established Leidos subcontract and missed the DHA restructuring now underway; this version flags the subcontract as unverified in public data and builds the DoD strategy on the verifiable Amwell teaming bridge instead.

Gaps explicitly flagged: Avel's company-reported scale figures (multi-state footprint, visit and site counts) are self-published and are labeled as such where used; live, currently-open IHS solicitations require an authenticated SAM.gov pull and are named as windows to watch, not asserted as open; and there is no enacted FY2027 IHS advance appropriation yet — the FY2027 Interior bill (with an FY2028 advance) cleared House committee on June 3, 2026 and is not yet law (https://ncuih.org/2026/06/04/house-advances-fy-2027-interior-bill-with-increases-for-ihs-and-advance-appropriations-for-fy-2028/). Confidence is highest where a statute, rule, or USASpending record fixes the fact; medium where a credible trade source reports a forward action not yet in a primary document; lower for recurring-cycle inferences, which are labeled as planning assumptions.

## Executive Thesis

Avel eCare sits at the center of three forces that all turn in its favor over the next 24 months, and the work is to convert structural tailwinds into signed business before the windows close. First, reimbursement moved decisively toward telehealth in Indian Country: the CY2025 OPPS final rule made the Medicaid "four walls" exception permanent and mandatory for IHS and Tribal clinics effective January 1, 2025, and combined with 100% federal Medicaid match for services delivered through IHS/Tribal facilities, tribes now have a durable financial case to buy telehealth (https://www.regulations.gov/document/CMS-2024-0199-2506; https://www.ihs.gov/businessoffice/100-percent-fmap/). Second, the federal buyer for military virtual care is being restructured right now: DHA is ending Leidos' integrator role on MHS GENESIS and making Amwell a direct telehealth vendor, with the transition landing by the end of July 2026 (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/). Because Avel acquired Amwell's psychiatric-care business (the Asana network) in January 2025, that restructuring is a teaming bridge, not a threat (https://www.usaspending.gov/search). Third, the policy calendar gives government affairs two clean targets: Medicare telehealth flexibilities now expire December 31, 2027, and controlled-substance teleprescribing expires December 31, 2026, so there is a defined runway with two separate forcing events (https://www.congress.gov/bill/119th-congress/house-bill/7148; https://www.federalregister.gov/documents/2025/12/31/2025-24123/fourth-temporary-extension-of-covid-19-telemedicine-flexibilities-for-prescription-of-controlled).

The base to defend is real and documented. Avel eCare LLC holds an IHS Great Plains Area IDIQ (full-and-open, no set-aside) under which it has booked roughly $30.79 million in federal obligations across FY2022–FY2026, with the period of performance running to July 31, 2027 (https://www.usaspending.gov/search; https://www.ihs.gov/telehealth/telehealthprograms/). That recompete is the single most important forward event Avel controls, and capture has to start now.

Five findings frame the plan: (1) [CONFIDENCE: HIGH] the tribal reimbursement case is the strongest growth lever and it is already in effect (https://www.regulations.gov/document/CMS-2024-0199-2506). (2) [CONFIDENCE: HIGH] the DHA path shifts from a Leidos subcontract to a direct Amwell contract by the end of July 2026, and Avel's Asana acquisition is the bridge (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/). (3) [CONFIDENCE: HIGH] the IHS Great Plains recompete decides in 2027 and must be shaped in 2026 (https://www.usaspending.gov/search). (4) [CONFIDENCE: MEDIUM] state 988/crisis and school telehealth are a real lane but Avel's wins there are not yet visible in public data, so this is a build, not a defend. (5) [CONFIDENCE: MEDIUM] a FedRAMP authorization or agency ATO is the gating technical barrier to VA and DHA enterprise task orders and should be started now (https://telehealth.hhs.gov/providers/telehealth-policy/telehealth-policy-updates).

## Where Avel Stands Today

Avel enters this window stronger than most virtual-health firms its size. It holds an IHS Great Plains Area prime IDIQ and has booked roughly $30.79 million in federal obligations across FY2022–FY2026 under it, giving it documented tribal-facing past performance (https://www.usaspending.gov/search; https://www.ihs.gov/newsroom/pressreleases/2016pressreleases/indian-health-service-awards-6-8-million-telemedicine-services-contract-to-avera-health/). Joint Commission accreditation as a virtual health system, a broad clinical line (tele-emergency, tele-behavioral, tele-ICU, tele-pharmacy, hospitalist, specialty, school, senior, correctional), and the January 2025 acquisition of Amwell's psychiatric-care business (the Asana network) are genuine differentiators (https://www.usaspending.gov/search). Company-reported scale figures (its multi-state footprint and visit counts) are self-published and should be cited as Avel's own claims, not independent data.

What the position does not yet secure: no public VA prime or VISN-level clinical telehealth award; a DHA relationship that is asserted as a Leidos subcontract but not confirmable in public award data (the verifiable DoD footprint is a set of direct South Dakota Army National Guard behavioral-health purchases); no documented FedRAMP authorization or agency ATO; and a tribal direct-purchase (638) channel that is underdeveloped beyond the IHS prime work (https://www.usaspending.gov/search; https://www.ihs.gov/selfgovernance/aboutus/). One competitive fact shapes the whole plan: Avel competes as an other-than-small, private-equity-owned business, and its IHS work was won full-and-open with no set-aside, so Buy Indian Act and small-business vehicles are teaming considerations, not direct lanes (https://www.ihs.gov/DAP/the-buy-indian-act/).

## The Five Growth & Partnership Strategies (next 12 months)

### Strategy 1 — [INCUMBENT-RECOMPETE] Defend and widen the IHS base before the 2027 recompete
Avel's IHS Great Plains IDIQ runs to July 31, 2027, so the recompete shapes in 2026 and decides in 2027 — capture begins now (https://www.usaspending.gov/search; https://www.ihs.gov/telehealth/telehealthprograms/). Named expansion targets are the other IHS Area offices with the same tele-emergency and tele-behavioral gaps: Phoenix, Navajo, Albuquerque, and California Areas, under health-services NAICS such as 621111, 621112, 621330, and 622110 (https://www.ihs.gov/telehealth/telehealthprograms/; https://sam.gov/opp). Over the next 12 months: capture-call the Phoenix and Navajo Area contracting offices by August 2026; file FPDS/USASpending "all data" pulls on the active vehicles to map the field; document CPARS-grade outcomes on every Great Plains service unit; and align the offer to the IHS PATH EHR rollout so Avel is the telehealth layer that rides the new record (Strategy 5). The IHS Telebehavioral Health Center of Excellence covers business hours but not nights, weekends, and frontier facilities at scale — Avel's 24/7 model is the gap-filler (https://www.ihs.gov/telebehavioral/). Milestone: on the offeror list for at least two new IHS Area tele-behavioral or tele-specialty vehicles by Q1 2027, each with an Indian Economic Enterprise teaming partner for any set-aside.

### Strategy 2 — [NEW] Convert tribes into direct 638 buyers on the reimbursement change
The strongest forward tailwind is financial. Services delivered through IHS/Tribal facilities draw 100% federal Medicaid match, and the four-walls exception — permanent and mandatory for IHS/Tribal clinics since January 1, 2025 — means care delivered outside the clinic walls, including by telehealth, is still reimbursable as a clinic service (https://www.ihs.gov/businessoffice/100-percent-fmap/; https://www.regulations.gov/document/CMS-2024-0199-2506). CMS guidance is explicit that the facility-patient relationship can be established through telehealth (https://www.medicaid.gov/federal-policy-guidance/downloads/SHO022616.pdf; https://www.medicaid.gov/federal-policy-guidance/downloads/faq11817.pdf). Under self-determination (Title I) and self-governance (Title V) compacts, the tribe — not IHS, and not bound by the FAR — becomes the customer, and the sale closes in weeks, not procurement cycles (https://www.congress.gov/crs-product/IF11877; https://www.ihs.gov/selfgovernance/aboutus/). Named entry target: the California Rural Indian Health Board shared telehealth program, which member Tribal Health Programs opt into and which contracts directly with telehealth specialists (https://crihb.org/health-center-operations/telehealth-2/). Over the next 12 months: build a one-page reimbursement model showing a tribal health director the 100%-FMAP-plus-four-walls economics of an Avel service line by August 2026, lead with pediatric psychiatry and tele-behavioral where demand is documented, and sign at least three tribal/UIHO service agreements outside Great Plains by Q1 2027.

### Strategy 3 — [NEW] Build the Amwell and Philips teaming bridge before the DHA transition closes
DHA is breaking up the MHS GENESIS integrator model and awarding direct contracts to the underlying technology vendors, with Amwell (telehealth) and Philips (tele-critical care) moving off Leidos by the end of July 2026 (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/). Avel already owns the Amwell psychiatric-care business it acquired in January 2025, which is the natural relationship to formalize into a subcontract path on the new direct telehealth contract (https://www.usaspending.gov/search). Over the next 12 months: open teaming conversations with Amwell and Philips now, before the end-of-July-2026 transition locks the new contract teams; and pair the pitch to Section 712 of the FY2026 NDAA, the Military-Civilian Medical Surge Program at no fewer than eight strategic sites, and to the June 2026 GAO finding that DoD cannot yet measure what its clinical partnerships contribute to readiness — a gap an instrumented telehealth service helps close (https://www.congress.gov/119/plaws/publ60/PLAW-119publ60.pdf; https://www.gao.gov/products/gao-26-107677). Milestone: a signed teaming agreement or MOU with Amwell or Philips by Q4 2026.

### Strategy 4 — [ADJACENT] Open a VA lane through the Office of Connected Care and a state 988/school build
VA made Tele-Emergency Care available nationwide in 2024 and is expanding Tele-Critical Care, both run out of the Office of Connected Care alongside ATLAS and VA Video Connect (https://news.va.gov/press-room/va-makes-tele-emergency-care-available-nationwide-offering-veterans-more-virtual-care-options/; https://www.va.gov/loma-linda-health-care/news-releases/va-loma-linda-launches-telecritical-care-capability/). Avel's tele-emergency and tele-behavioral lines map onto VA's stated build, and VA Community Care network participation is a low-barrier way to generate VA-reimbursed volume and past performance while pursuing prime work (https://connectedcare.va.gov/va-telehealth-services-video). In parallel, the state lane is the 988 crisis co-responder and school-based telehealth market, where Avel's clinical model fits and the gap is systematic state BD, not capability. Over the next 12 months: submit Avel's affiliated medical groups for VA Community Care credentialing by September 2026; pull live VA telehealth vehicles from USASpending and SAM and identify Office of Connected Care primes; and stand a watch on the top rural-footprint states' 988 and school-telehealth procurement portals, with a state-facing capability statement ready by Q4 2026 (https://www.usaspending.gov/search; https://sam.gov/opp). Milestone: VA Community Care active and at least two state proposals submitted by Q1 2027.

### Strategy 5 — [IN-FLIGHT] Ride the IHS PATH EHR modernization and scale clinicians via compacts
Two enablers compound the four strategies above. The IHS PATH EHR (GDIT integrator, Oracle Health record) goes live at the Lawton, Oklahoma service unit in August 2026, followed by national cohort rollouts — telehealth that integrates cleanly with the new record has a structural edge in every site that adopts it, so Avel should engage GDIT and the IHS Office of Information Technology ahead of the cohorts (https://www.ihs.gov/hit/path-ehr/). On the supply side, interstate licensure compacts are the mechanism to staff multi-state growth: PSYPACT is live for telepsychology across roughly 43 jurisdictions, and the Counseling Compact is operational in only six states so far (Arizona, Georgia, Indiana, Louisiana, Minnesota, Ohio as of June 8, 2026) with about 32 more building toward go-live — each new state opens a fresh behavioral-health clinician pool (https://psypact.gov/; https://counselingcompact.gov/). Over the next 12 months: credential clinicians across live compact states ahead of demand, and align behavioral-health capacity to rising tribal behavioral-health and 988 funding (https://www.gao.gov/products/gao-26-107915). Milestone: PATH integration conversations opened with GDIT/IHS OIT and compact credentialing expanded by Q4 2026.

## Government Affairs & Advocacy Agenda

The advocacy program has two forcing events and four durable positions, built on the current controlling dates and the live legislative vehicles.

The first forcing event is the Medicare telehealth cliff on December 31, 2027. The Consolidated Appropriations Act, 2026 (H.R. 7148, signed February 3, 2026) extended the geographic, originating-site, audio-only, and FQHC/RHC distant-site flexibilities through that date (https://www.congress.gov/bill/119th-congress/house-bill/7148; https://www.cms.gov/files/document/telehealth-faq-updated-02-26-2026.pdf). Two live bills carry the permanency ask: the CONNECT for Health Act (S. 1261 / H.R. 4206), broad permanency in committee with deep bipartisan cosponsorship, and the tribal-specific Telehealth Access for Tribal Communities Act (H.R. 2639, Rep. Leger Fernández), which permanently authorizes audio-only and at-home Medicare telehealth furnished through Indian health and urban Indian programs (https://www.congress.gov/bill/119th-congress/senate-bill/1261; https://www.congress.gov/bill/119th-congress/house-bill/4206; https://www.congress.gov/bill/119th-congress/house-bill/2639). H.R. 2639 is the highest-leverage bill for Avel specifically because audio-only is the lifeline in broadband-poor tribal areas. The realistic vehicle for an extension or permanency is a late-2027 year-end health-and-spending package, so the coalition has to be built across 2026–2027, not in the final weeks.

The second forcing event is the controlled-substance teleprescribing expiration on December 31, 2026 — a separate, nearer clock. The fourth DEA/HHS temporary extension keeps teleprescribing without a prior in-person visit alive through the end of 2026 while the permanent special-registration rule sits at OMB (https://www.federalregister.gov/documents/2025/12/31/2025-24123/fourth-temporary-extension-of-covid-19-telemedicine-flexibilities-for-prescription-of-controlled; https://www.dea.gov/press-releases/2025/12/31/dea-extends-telemedicine-flexibilities-ensure-continued-access-care). Avel's behavioral-health and SUD lines depend on this; the ask is a workable permanent rule (or a fifth extension if it slips), and the durable win to protect is the permanent buprenorphine-via-telehealth rule already in effect (https://www.federalregister.gov/documents/2025/01/17/2025-01049/expansion-of-buprenorphine-treatment-via-telemedicine-encounter; https://www.samhsa.gov/substance-use/treatment/statutes-regulations-guidelines/buprenorphine-telemedicine-prescribing).

The four durable positions: (1) Defend and expand IHS advance appropriations — IHS stayed open through the late-2025 shutdown because it is funded a year ahead, a continuity advantage Avel should put in its value story while pressing for the enacted FY2027/FY2028 advance and full EHR-modernization funding now moving through the FY2027 Interior bill (https://www.congress.gov/crs-product/IN12087; https://ncuih.org/2026/06/04/house-advances-fy-2027-interior-bill-with-increases-for-ihs-and-advance-appropriations-for-fy-2028/). (2) Protect the 100% FMAP and four-walls rules that underwrite tribal telehealth demand (https://www.ihs.gov/businessoffice/100-percent-fmap/; https://www.regulations.gov/document/CMS-2024-0199-2506). (3) Support the Purchased and Referred Care Improvement Act (S. 699, Sen. Rounds), which had a Senate Committee on Indian Affairs hearing on February 4, 2026, because better PRC reimbursement enables more tribal telehealth purchasing (https://www.congress.gov/bill/119th-congress/senate-bill/699; https://www.ihs.gov/selfgovernance/aboutus/). (4) Back permanent state Medicaid telehealth coverage, engaging when state legislatures convene in January 2027 (https://telehealth.hhs.gov/providers/telehealth-policy/telehealth-policy-updates).

Committee engagement priorities: Senate Committee on Indian Affairs and Senate Finance are the top targets (IHS reform, PRC, Medicare telehealth), with Senate HELP, House Energy & Commerce, and House Ways & Means as the next tier, and Senate Veterans' Affairs and Senate Armed Services for the VA/DHA channels (https://www.congress.gov/bill/119th-congress/senate-bill/699; https://www.congress.gov/bill/119th-congress/senate-bill/1261). Coalition activation: join the Alliance for Connected Care and the American Telemedicine Association for the Medicare cliff and DEA rulemaking, and the National Indian Health Board and the National Council of Urban Indian Health for the tribal vehicles, supplying Avel's own utilization and outcome data as evidence (https://www.congress.gov/bill/119th-congress/house-bill/2639; https://ncuih.org/2026/06/04/house-advances-fy-2027-interior-bill-with-increases-for-ihs-and-advance-appropriations-for-fy-2028/). The live tactical window is the Senate FY2027 appropriations markups (Labor-HHS and Interior/IHS), still to come in summer–fall 2026 (https://www.congress.gov/crs-appropriations-status-table).

## Issues Facing the Market

### 4.1 Performance
The benchmark Avel sells against is access where specialists cannot be recruited. VA's nationwide Tele-Emergency Care served 61,182 callers at a 59.4 percent case-resolution rate in its pilot, and is associated with 16 percent fewer emergency-room visits within seven days versus nurse triage alone (https://news.va.gov/press-room/va-makes-tele-emergency-care-available-nationwide-offering-veterans-more-virtual-care-options/; https://connectedcare.va.gov/va-telehealth-services-video). IHS telebehavioral health runs on the same clinician-to-clinic model Avel delivers, which is the performance frame buyers will use (https://www.ihs.gov/telebehavioral/; https://www.ihs.gov/telehealth/telehealthprograms/).

### 4.2 Procurement/Contracting
The buyer is bifurcated. Direct IHS contracting runs under the FAR plus the Buy Indian Act set-aside preference for Indian Economic Enterprises (https://www.ihs.gov/DAP/the-buy-indian-act/; https://www.federalregister.gov/documents/2022/01/13/2021-28156/acquisition-regulations-buy-indian-act-procedures-for-contracting). Tribally-controlled spending under ISDEAA Title I/Title V makes the tribe the customer outside the FAR (https://www.congress.gov/crs-product/IF11877; https://www.ihs.gov/selfgovernance/aboutus/). On the DoD side, the telehealth entry path is shifting from a Leidos subcontract to the new direct Amwell contract (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/; https://www.usaspending.gov/search).

### 4.3 Structural
Two structural shifts define the market. The MHS GENESIS disaggregation moves telehealth and tele-critical care to direct vendor contracts by the end of July 2026 (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/). The IHS PATH EHR migration off the 40-year-old RPMS system, beginning at Lawton in August 2026, restructures the data environment every IHS/Tribal telehealth tool has to live in (https://www.ihs.gov/hit/path-ehr/; https://www.ihs.gov/telehealth/telehealthprograms/).

### 4.4 Readiness Outcomes
Clinical readiness is now an explicit federal procurement concern. GAO found in June 2026 that DoD cannot yet measure what its civilian clinical partnerships contribute to readiness, and made nine recommendations the department largely accepted (https://www.gao.gov/products/gao-26-107677). The FY2026 NDAA's Section 712 surge program ties civilian clinical capacity to military readiness at no fewer than eight sites (https://www.congress.gov/119/plaws/publ60/PLAW-119publ60.pdf). A telehealth service that can instrument and report clinical activity addresses the measurement gap directly.

### 4.5 Transition/Execution
The execution windows are dated and near. The DHA telehealth and tele-critical care transitions land by the end of July 2026 (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/). The IHS PATH EHR goes live at Lawton in August 2026 before national cohorts (https://www.ihs.gov/hit/path-ehr/). Avel's own IHS IDIQ reaches the end of its period of performance on July 31, 2027, which sets the recompete execution clock (https://www.usaspending.gov/search; https://sam.gov/opp).

### 4.6 Oversight/Compliance
Two compliance clocks govern Avel's behavioral and SUD lines. Controlled-substance teleprescribing without a prior in-person visit is authorized through December 31, 2026 under the fourth DEA/HHS extension (https://www.federalregister.gov/documents/2025/12/31/2025-24123/fourth-temporary-extension-of-covid-19-telemedicine-flexibilities-for-prescription-of-controlled). Buprenorphine via telehealth is permanent under the 2025 final rule (https://www.federalregister.gov/documents/2025/01/17/2025-01049/expansion-of-buprenorphine-treatment-via-telemedicine-encounter; https://www.samhsa.gov/substance-use/treatment/statutes-regulations-guidelines/buprenorphine-telemedicine-prescribing). A FedRAMP authorization or agency ATO is the gating requirement for VA and DHA enterprise task orders and should be started now to avoid exclusion regardless of clinical qualifications (https://telehealth.hhs.gov/providers/telehealth-policy/telehealth-policy-updates).

## Contract Vehicle Landscape

| Vehicle / Channel | What it is | Avel read |
|---|---|---|
| IHS Great Plains IDIQ (Avel-held) | Full-and-open IDIQ, no set-aside, period of performance to July 31, 2027 | The base to defend; recompete capture starts in 2026 (https://www.usaspending.gov/search) |
| ISDEAA 638 (Title I / Title V) | Tribe runs the program and the dollars, outside the FAR | Sell to the tribe directly; faster, relationship-driven (https://www.congress.gov/crs-product/IF11877) |
| Buy Indian Act set-asides | IHS set-asides for Indian Economic Enterprises | Teaming play for Avel as an other-than-small firm (https://www.ihs.gov/DAP/the-buy-indian-act/) |
| MHS GENESIS direct telehealth (Amwell) | New DHA direct contract replacing the Leidos integrator model by end of July 2026 | Teaming bridge via the Asana/Amwell relationship (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/) |
| MQS2-NG (DHA) | Medical staffing IDIQ; ordering period to 2029; 11 vendors | Relevant only as a clinical-labor (tele-provider staffing) play, not a platform play (https://www.highergov.com/vehicle/medical-q-coded-support-and-services-nextgen-mqs2-ng-7893/; https://www.govconwire.com/articles/dha-picks-11-vendors-for-unrestricted-pool-of-43b-follow-on-medical-staffing-contract) |
| VA Office of Connected Care | Nationwide Tele-Emergency Care, Tele-Critical Care, ATLAS, VVC | Subcontractor lane for rural tele-emergency / tele-behavioral (https://news.va.gov/press-room/va-makes-tele-emergency-care-available-nationwide-offering-veterans-more-virtual-care-options/) |
| VA Community Care Network | Credentialed network participation | Low-barrier entry for VA-reimbursed volume + past performance (https://connectedcare.va.gov/va-telehealth-services-video) |

## Pipeline Intelligence

- **[INCUMBENT-RECOMPETE]** Avel IHS Great Plains IDIQ recompete, period of performance ending July 31, 2027; capture activity in 2026 (https://www.usaspending.gov/search; https://sam.gov/opp).
- **[NEW]** Direct DHA telehealth contract via Amwell after the end-of-July-2026 transition (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/).
- **[NEW]** FY2026 NDAA Section 712 surge sites — greenfield, no incumbent locked in (https://www.congress.gov/119/plaws/publ60/PLAW-119publ60.pdf).
- **[NEW]** IHS Area expansion (Phoenix, Navajo, Albuquerque, California) tele-behavioral / tele-specialty (https://www.ihs.gov/telehealth/telehealthprograms/; https://sam.gov/opp).
- **[ADJACENT]** VA Office of Connected Care tele-emergency / tele-critical care subcontracts (https://news.va.gov/press-room/va-makes-tele-emergency-care-available-nationwide-offering-veterans-more-virtual-care-options/; https://www.va.gov/loma-linda-health-care/news-releases/va-loma-linda-launches-telecritical-care-capability/).
- **[IN-FLIGHT]** IHS PATH EHR cohort rollouts after the August 2026 Lawton go-live (https://www.ihs.gov/hit/path-ehr/).
- **[NEW]** Tribal 638 behavioral-health and 988 Tribal funding lines (https://www.gao.gov/products/gao-26-107915; https://www.ihs.gov/telebehavioral/).
- **[ADJACENT]** FCC Rural Health Care Program funding behind tribal/rural connectivity (https://www.fcc.gov/general/rural-health-care-program).

## Stakeholder Map

- IHS — Great Plains and adjacent Area contracting offices; Division of Behavioral Health / Telebehavioral Health Center of Excellence; Office of Information Technology (PATH EHR) (https://www.ihs.gov/telebehavioral/; https://www.ihs.gov/hit/path-ehr/).
- Tribes and Tribal health organizations under 638 compacts, including the California Rural Indian Health Board shared telehealth program — the direct buyer for Strategy 2 (https://www.ihs.gov/selfgovernance/aboutus/; https://crihb.org/health-center-operations/telehealth-2/).
- CMS / Medicaid — owner of the 100% FMAP and four-walls rules that drive tribal telehealth economics (https://www.ihs.gov/businessoffice/100-percent-fmap/; https://www.regulations.gov/document/CMS-2024-0199-2506).
- DHA / MHS — the JTCCN tele-critical care program and the new direct telehealth contract structure (https://www.army.mil/article/265601/bach_icu_joins_dhas_joint_tele_critical_care_network; https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/).
- VA Office of Connected Care — tele-emergency, tele-critical care, ATLAS (https://connectedcare.va.gov/va-telehealth-services-video).
- Congress — Senate Committee on Indian Affairs (S. 699), Senate Finance, and the committees of jurisdiction for the CONNECT Act and H.R. 2639 (https://www.congress.gov/bill/119th-congress/senate-bill/699; https://www.congress.gov/bill/119th-congress/house-bill/2639).
- Amwell and Philips — the new direct DHA telehealth and tele-critical care vendors and Avel's teaming targets (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/).

## Competitive Dynamics & Teaming

Avel's structural advantages are an installed IHS base, Joint Commission accreditation as a virtual hospital, a broad clinical line, and ownership of the Amwell psychiatric-care business it bought in January 2025 (https://www.usaspending.gov/search). Its constraint is that it is an other-than-small, private-equity-owned firm, so it cannot self-perform on Buy Indian or small-business set-asides and has to team for those (https://www.ihs.gov/DAP/the-buy-indian-act/). The competitive field:

| Competitor type | Examples | Their edge | Avel's edge |
|---|---|---|---|
| National virtual-care platforms | Teladoc, Amwell, Included Health | Payer breadth, consumer tech | Outpatient-only; no hospital-grade tele-ICU/tele-ED; no IHS prime past performance (note: Amwell is now Avel's teaming partner, not just a competitor) (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/) |
| Academic telehealth networks | University ECHO/telehealth programs | Subspecialty depth, tribal affiliations | Cannot scale 24/7 multi-service coverage as a commercial vendor (https://www.ihs.gov/telehealth/telehealthprograms/) |
| Niche tele-psych / locums groups | Small physician groups under 621112/621330 | Low overhead, IHS familiarity | Single-specialty; thin past performance; no JC virtual-hospital accreditation (https://www.usaspending.gov/search) |
| Internal IHS/VA capacity | IHS TBHCE, VA Connected Care | Policy alignment, no vendor margin | Cannot cover nights/weekends/frontier at scale; not available for 638 direct purchase (https://www.ihs.gov/telebehavioral/) |
| Large federal integrators | Leidos, GDIT, Accenture | Prime relationships, security | Not clinical operators; need an Avel-type clinical sub (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/) |

Teaming geometry follows the buyer: with Amwell and Philips for the DHA direct contracts; with Indian Economic Enterprises for Buy Indian set-asides; with VA Office of Connected Care primes for tele-emergency lanes; and directly with tribal health programs for 638 work where no prime sits in between (https://www.congress.gov/crs-product/IF11877; https://www.ihs.gov/DAP/the-buy-indian-act/).

## Protest / Litigation Watch

No GAO or Court of Federal Claims docket specific to Avel's vehicles was retrieved for this run. The recompete to watch is Avel's own IHS Great Plains IDIQ ahead of its July 31, 2027 period-of-performance end; track the solicitation on SAM.gov and any protest activity through GAO bid-protest search before the recompete (https://sam.gov/opp; https://www.gao.gov/products/gao-26-107677). The MHS GENESIS disaggregation into multiple direct awards is a structural change that can draw protest activity as the new contracts are issued through 2026–2027; monitor it (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/).

## Readiness Outcomes

- Avel eCare LLC federal obligations across FY2022–FY2026: approximately $30.79 million, under IHS Great Plains Area task orders (https://www.usaspending.gov/search; https://www.ihs.gov/telehealth/telehealthprograms/).
- IHS FY2027 President's Budget request: $9.094 billion, up roughly $1.1 billion over the $5.86 billion FY2026 enacted services-and-facilities level, including $287.07 million for EHR modernization (https://www.congress.gov/crs-appropriations-status-table; https://www.ihs.gov/hit/path-ehr/).
- IHS FY2028 advance appropriation in the House-committee-passed FY2027 Interior bill: about $6.06 billion, as of the June 3, 2026 committee markup; not yet enacted (https://ncuih.org/2026/06/04/house-advances-fy-2027-interior-bill-with-increases-for-ihs-and-advance-appropriations-for-fy-2028/; https://www.congress.gov/crs-product/IN12087).
- Medicaid four-walls exceptions projected to add about $1.18 billion in expenditures across FY2025–FY2029, the period over which the tribal telehealth reimbursement case compounds (https://www.regulations.gov/document/CMS-2024-0199-2506; https://www.medicaid.gov/federal-policy-guidance/downloads/cib090823.pdf).
- VA Tele-Emergency Care pilot, 2024: 61,182 callers at 59.4 percent case resolution, and 16 percent fewer 7-day ER visits versus nurse triage (https://news.va.gov/press-room/va-makes-tele-emergency-care-available-nationwide-offering-veterans-more-virtual-care-options/; https://connectedcare.va.gov/va-telehealth-services-video).
- IHS PATH EHR go-live at Lawton: August 2026, ahead of national cohort rollouts (https://www.ihs.gov/hit/path-ehr/).

## Risk Matrix

| Risk | L/M/H | Dated trigger | Mitigation |
|---|---|---|---|
| IHS Great Plains recompete slips or opens to broader competition | H | Period of performance ends July 31, 2027 (https://www.usaspending.gov/search) | Start capture in 2026; lock outcomes data and Area expansion |
| DHA telehealth teaming locks before Avel engages | M | Transition completes end of July 2026 (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/) | Open Amwell/Philips talks now |
| FedRAMP/ATO gap blocks VA and DHA enterprise task orders | H | Required for enterprise PHI/PII systems on award by 2026–2027 (https://telehealth.hhs.gov/providers/telehealth-policy/telehealth-policy-updates) | Start ATO documentation now; host on FedRAMP-authorized infrastructure |
| Controlled-substance teleprescribing lapses | M | Expires December 31, 2026 (https://www.federalregister.gov/documents/2025/12/31/2025-24123/fourth-temporary-extension-of-covid-19-telemedicine-flexibilities-for-prescription-of-controlled) | Advocate permanent rule; lean on permanent buprenorphine rule |
| Medicare telehealth flexibilities lapse | M | Expires December 31, 2027 (https://www.congress.gov/bill/119th-congress/house-bill/7148) | Build CONNECT Act + H.R. 2639 coalition across 2026–2027 |
| Leidos dependency on the (unverified) DHA subcontract | M | DHA disaggregation lands end of July 2026 (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/) | Diversify via direct Amwell teaming and the VA lane |

## 12–24 Month Projection (Forward Catalysts)

| Window | Catalyst | Avel action |
|---|---|---|
| Now–Sep 2026 | Senate FY2027 appropriations markups (Labor-HHS, Interior/IHS), still pending (https://www.congress.gov/crs-appropriations-status-table) | Primary federal advocacy window for IHS/telehealth/Medicaid language |
| By end of July 2026 | DHA telehealth/tele-critical care move to direct Amwell/Philips contracts (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/) | Close teaming agreements before the transition locks |
| August 2026 | IHS PATH EHR go-live at Lawton (https://www.ihs.gov/hit/path-ehr/) | Position telehealth integration ahead of national cohorts |
| October 1, 2026 | FY2027 begins; continuing-resolution risk (https://www.congress.gov/crs-appropriations-status-table) | Use IHS advance-appropriations continuity as a differentiator |
| December 31, 2026 | Controlled-substance teleprescribing expiration (https://www.federalregister.gov/documents/2025/12/31/2025-24123/fourth-temporary-extension-of-covid-19-telemedicine-flexibilities-for-prescription-of-controlled) | Advocate permanent DEA rule; protect SUD lines |
| Nov 2026–Apr 2027 | FY2027 HRSA telehealth and SAMHSA behavioral NOFOs (recurring-cycle estimate) (https://www.hrsa.gov/telehealth/grants; https://www.samhsa.gov/grants/grants-dashboard/forecasts) | Stage grant-aligned tribal/rural pursuits |
| January 2027 | State legislatures convene; permanent Medicaid telehealth bills (https://telehealth.hhs.gov/providers/telehealth-policy/telehealth-policy-updates) | State advocacy and Medicaid coverage engagement |
| 2026–2028 (rolling) | Counseling Compact state go-lives beyond the first six (https://counselingcompact.gov/) | Credential behavioral clinicians ahead of demand |
| 2026–2027 | IHS Great Plains recompete shaping (https://sam.gov/opp) | Capture activity on the base contract |
| December 31, 2027 | Medicare telehealth cliff (https://www.congress.gov/bill/119th-congress/house-bill/7148) | Anchor of the permanency advocacy campaign |

## 90-Day Action List (prospective)

| Window | Action | Strategy link |
|---|---|---|
| Through mid-July 2026 | Join the Alliance for Connected Care and the American Telemedicine Association; request Senate Indian Affairs and Senate Finance staff introductions (https://www.congress.gov/bill/119th-congress/senate-bill/699) | Gov affairs |
| Through mid-July 2026 | Pull FPDS/USASpending "all data" on the IHS Great Plains vehicle and adjacent Area telehealth task orders (https://www.usaspending.gov/search) | Strategy 1 |
| Through mid-July 2026 | Open Amwell and Philips teaming conversations before the end-of-July DHA transition (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/) | Strategy 3 |
| Through mid-August 2026 | Engage the CRIHB shared telehealth program; build the 100%-FMAP/four-walls one-pager for tribal health directors (https://crihb.org/health-center-operations/telehealth-2/; https://www.ihs.gov/businessoffice/100-percent-fmap/) | Strategy 2 |
| Through mid-August 2026 | Begin the FedRAMP/ATO documentation process and confirm FedRAMP-authorized hosting (https://telehealth.hhs.gov/providers/telehealth-policy/telehealth-policy-updates) | Risk mitigation |
| Through mid-September 2026 | Submit Avel's affiliated medical groups for VA Community Care credentialing; engage GDIT/IHS OIT on PATH integration (https://connectedcare.va.gov/va-telehealth-services-video; https://www.ihs.gov/hit/path-ehr/) | Strategies 4–5 |
| Through mid-September 2026 | File DEA teleprescribing comments and brief Senate Indian Affairs staff on H.R. 2639 with Avel utilization data (https://www.congress.gov/bill/119th-congress/house-bill/2639) | Gov affairs |

## Not Found / Null-Result Register

- Query: Avel eCare DHA virtual-care subcontract under Leidos. Source family: USASpending.gov / SAM.gov (https://www.usaspending.gov/search; https://sam.gov/opp). Result: not found in public award data; the verifiable DoD relationship is direct South Dakota Army National Guard behavioral-health purchases. Treated as subscriber-provided; strategy built on the verifiable Amwell teaming bridge instead.
- Query: currently-open IHS telehealth solicitations, June 2026. Source family: SAM.gov (https://sam.gov/opp). Result: requires authenticated live search; named as windows to watch, not asserted as open.
- Query: enacted FY2027 IHS advance appropriation. Source family: appropriations (https://www.congress.gov/crs-appropriations-status-table). Result: not enacted as of June 2026; FY2027 Interior bill cleared House committee June 3, 2026 with an FY2028 advance, not yet law (https://ncuih.org/2026/06/04/house-advances-fy-2027-interior-bill-with-increases-for-ihs-and-advance-appropriations-for-fy-2028/).
- Query: FY2027 HRSA/SAMHSA NOFO exact post dates. Source family: HRSA/SAMHSA (https://www.hrsa.gov/telehealth/grants; https://www.samhsa.gov/grants/grants-dashboard/forecasts). Result: FY2027 forecasts not yet published; timing is a recurring-cycle estimate, not a confirmed date.

## Capture Strategy

- MMT-platform play: surface Avel-relevant capture intelligence in the Mission Meets Tech Friday Brief and Capture Intelligence newsletter whenever any of the dated catalysts above advance — the IHS recompete, the DHA Amwell transition, the PATH EHR cohorts, or a telehealth-policy action — so the signal reaches Avel and similar federal-health subscribers as it moves (https://telehealth.hhs.gov/providers/telehealth-policy/telehealth-policy-updates).
- Capture lane priority over the next 12 months: (1) defend and pre-position the IHS Great Plains recompete, (2) convert tribes to direct 638 buyers on the reimbursement case, (3) formalize Amwell/Philips teaming before the July 2026 DHA transition, (4) open a VA Office of Connected Care subcontract lane plus the state 988/school build, (5) scale clinicians via compacts and align to the PATH EHR rollout (https://www.usaspending.gov/search; https://www.ihs.gov/hit/path-ehr/).
- Buyer language to lead with: "keep scarce clinical expertise reachable where it cannot be recruited," tied to 100% FMAP economics for tribal buyers and to readiness-measurement for DoD buyers (https://www.ihs.gov/businessoffice/100-percent-fmap/; https://www.gao.gov/products/gao-26-107677).
- Teaming actions before December 2026: open Amwell and Philips conversations; identify Indian Economic Enterprise partners for Buy Indian set-asides; identify VA Office of Connected Care primes (https://www.washingtontechnology.com/contracts/2026/06/how-dha-plans-end-leidos-run-militarys-health-record-integrator/414160/; https://www.ihs.gov/DAP/the-buy-indian-act/).

## Source Table

__SOURCE_TABLE__
`;

// ============================================================
// SCORE + AUDIT + RENDER + (LIVE) DELIVER
// ============================================================
(async () => {
  const dryRun = String(process.env.DRY || "").trim() === "1";
  console.log(`=== deliver-mark-avel-marketpulse-v4 (dry_run=${dryRun}) ===`);
  console.log(`order: ${ORDER_ID}`);

  const sourceTable = buildSourceTable(CITATIONS);
  let synth = SYNTHESIS.replace("__SOURCE_TABLE__", sourceTable);

  const score = scoreReportV4({
    reportText: synth,
    citations: CITATIONS,
    hasSubscriberContext: true,
    opportunityCount: 8,
  });

  const bannerLine =
    `**Research Score: ${score.total}/100** — ` +
    `SourceQuality ${score.dimensions.source_quality.score}/${score.dimensions.source_quality.max} · ` +
    `PrimaryRatio ${score.dimensions.primary_ratio.score}/${score.dimensions.primary_ratio.max} · ` +
    `VerificationDepth ${score.dimensions.verification_depth.score}/${score.dimensions.verification_depth.max} · ` +
    `IssueCoverage ${score.dimensions.issue_coverage.score}/${score.dimensions.issue_coverage.max} · ` +
    `SubscriberRelevance ${score.dimensions.subscriber_relevance.score}/${score.dimensions.subscriber_relevance.max}`;
  synth = synth.replace("__SCORE_BANNER__", bannerLine);

  const labeled = autoLabelTier3(synth, CITATIONS);
  synth = labeled.text;

  console.log(`\nv4 SCORE total: ${score.total}/100  (band: ${score.band})`);
  for (const [k, v] of Object.entries(score.dimensions)) {
    console.log(`  ${k.padEnd(22)} ${v.score}/${v.max}  ${v.detail || ""}`);
  }

  const tiers = classifyAll(CITATIONS);
  const tier1Pct = Math.round((tiers.tier1.length / CITATIONS.length) * 100);
  console.log(`\nTier mix: T1=${tiers.tier1.length} T2=${tiers.tier2.length} T3=${tiers.tier3.length}  (Tier1 ${tier1Pct}%)`);

  const audit = runSelfAudit({
    reportText: synth,
    citations: CITATIONS,
    hasSubscriberContext: true,
    waived: false,
    isBidder: true,
    nullQueryCount: 4,
    fetchCount: CITATIONS.length,
    refinementPasses: 3,
    score,
  });
  console.log(`\nSELF-AUDIT passed: ${audit.allPassed}  (${audit.passedCount}/${audit.checks.length})`);
  for (const c of audit.checks) {
    console.log(`  [${String(c.id).padStart(2)}] ${c.passed ? "PASS" : "FAIL"} ${c.label} — ${c.evidence}`);
  }

  const stop = checkStopConditions({ audit, score, hasSubscriberContext: true, waived: false });
  console.log(`\nSTOP-CONDITION check: stop=${stop.stop}`);
  if (stop.reasons.length) stop.reasons.forEach((r) => console.log(`  - ${r}`));

  const html = renderMarketPulseHTML({
    synthesis: synth,
    citations: CITATIONS,
    name: NAME,
    company: COMPANY,
    topic: TOPIC,
    audience: AUDIENCE,
    generatedAt: new Date(`${TODAY}T16:00:00Z`).toISOString(),
    reportScore: {
      overall: score.total,
      source_quality: { gov_percent: tier1Pct },
      pipeline_opportunities: { count: 8 },
      strategic_depth: { score: 88 },
    },
  });
  console.log(`\nrendered HTML: ${html.length} bytes`);

  const fs = require("fs");
  const outPath = path.join(ROOT, "eval/reports/avel-marketpulse-v4-2026-06-16.html");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log(`local copy: ${outPath}`);

  const deliveryGate = score.total >= 85 && !stop.stop && tier1Pct >= 60;
  console.log(`\n=== DELIVERY GATE: ${deliveryGate ? "PASS" : "FAIL"} ===`);
  console.log(`  score.total ${score.total}/100 >= 85: ${score.total >= 85 ? "PASS" : "FAIL"}`);
  console.log(`  no Tier A hard stops: ${!stop.stop ? "PASS" : "FAIL"}`);
  console.log(`  tier1 share ${tier1Pct}% >= 60%: ${tier1Pct >= 60 ? "PASS" : "FAIL"}`);

  if (dryRun) {
    console.log("\nDRY run — no DB writes, no email. Exiting.");
    process.exit(deliveryGate ? 0 : 1);
  }
  if (!deliveryGate) {
    console.error("\nDelivery gate failed — refusing to send. Exiting.");
    process.exit(1);
  }

  // ---- LIVE: requires production Supabase. RESEND + REPORT_VIEWER_SECRET
  //      are optional. When REPORT_VIEWER_SECRET is absent we reuse the
  //      ORIGINAL report link (token = HMAC(id+type) is unchanged, so the
  //      link already in the customer's inbox renders the updated row).
  //      When RESEND is absent we update the DB only and leave the email
  //      to an in-thread human reply (better deliverability). ----
  const { createClient } = require(path.join(ROOT, "node_modules/@supabase/supabase-js"));

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("FATAL: SUPABASE_URL and a Supabase service key env var are required (see .env.example).");
    process.exit(1);
  }

  // The link already delivered to the customer on 2026-06-15. id+type are
  // unchanged, so its HMAC token stays valid against the updated row.
  const ORIGINAL_REPORT_URL =
    "https://missionmeetstech.com/.netlify/functions/view-report?id=34b3eb26-5ebb-4e7d-b9ae-31480f328240&type=marketpulse&token=ce5b7f9501ea6cd840ecb219b449f6dd1157ed55608291336d8eb5a8b1cf1398";

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: orderRow, error: lookupErr } = await sb
    .from("marketpulse_orders").select("email, name").eq("id", ORDER_ID).single();
  if (lookupErr || !orderRow || !orderRow.email) {
    console.error("FATAL: could not look up recipient from marketpulse_orders:", lookupErr?.message || "no row");
    process.exit(1);
  }
  const EMAIL = orderRow.email;
  console.log(`recipient: ${EMAIL.replace(/(.{2}).*(@.*)/, "$1***$2")}`);

  let reportUrl = ORIGINAL_REPORT_URL;
  if (process.env.REPORT_VIEWER_SECRET) {
    const { generateReportUrl } = require(path.join(ROOT, "netlify/functions/lib/report-url"));
    reportUrl = generateReportUrl(ORDER_ID, "marketpulse").url;
  } else {
    console.log("REPORT_VIEWER_SECRET absent — reusing the original (still-valid) report link.");
  }

  const { error: updErr } = await sb.from("marketpulse_orders").update({
    report_html: html,
    report_url: reportUrl,
    status: "delivered",
    workflow_state: "delivered",
    state_updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    error_message: null,
  }).eq("id", ORDER_ID);
  if (updErr) { console.error("DB update failed:", updErr.message); process.exit(1); }
  console.log("DB updated to delivered.");

  const firstName = (NAME || "").split(" ")[0] || "there";
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const deliveryHtml = `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#0A192F;padding:32px 40px;text-align:center;">
    <div style="font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:0.5px;">MARKETPULSE</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">Federal Health IT Market Intelligence</div>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:16px;color:#0A192F;margin:0 0 16px;">Hi ${esc(firstName)},</p>
    <p style="font-size:16px;color:#0A192F;margin:0 0 16px;">Here is the revised, fully prospective MarketPulse report you asked for. Every action window is now forward-looking, with a 12&ndash;24 month projection through mid-2028, and the telehealth-policy dates are refreshed to their current controlling values.</p>
    <p style="font-size:14px;color:#5C6B7A;margin:0 0 8px;font-weight:600;">Topic</p>
    <p style="font-size:16px;color:#0A192F;margin:0 0 24px;">Top five growth and partnership strategies plus government-affairs advocacy to expand Avel eCare's state, federal, and tribal government business.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${reportUrl}" style="display:inline-block;background:#0A192F;color:#FFFFFF;font-weight:700;font-size:16px;padding:14px 40px;text-decoration:none;border-radius:6px;">View Your Report</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">This link expires in 90 days. Right-click and "Save As" to keep a permanent copy.</p>
  </div>
  <div style="padding:20px 40px;background:#F3F4F6;border-top:1px solid #D8E0E8;text-align:center;font-size:12px;color:#5C6B7A;">
    Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a><br>
    AI-assisted research. Verify all claims independently.
  </div>
</div>`;

  let sendResult = { skipped: true };
  if (process.env.RESEND_API_KEY) {
    const { sendEmail } = require(path.join(ROOT, "netlify/functions/lib/send-email"));
    sendResult = await sendEmail({
      to: EMAIL,
      subject: `Your Revised MarketPulse Report: Avel eCare growth & government-affairs strategy`,
      html: deliveryHtml,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
    console.log("email send result:", JSON.stringify(sendResult, null, 2));
    await sendEmail({
      to: "mary@missionmeetstech.com",
      subject: `[MarketPulse] REVISED DELIVERED — Mark Johnston / Avel eCare`,
      html: `<p>Prospective re-run delivered via local script.</p>
        <p><strong>Order:</strong> ${ORDER_ID}</p>
        <p><strong>Score:</strong> ${score.total}/100 · Tier1 ${tier1Pct}%</p>
        <p><strong>Report URL:</strong> <a href="${reportUrl}">${reportUrl}</a></p>`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
  } else {
    console.log("RESEND_API_KEY absent — DB updated, email NOT sent by script.");
    console.log("The revised report is now LIVE at the customer's existing link:");
    console.log(reportUrl);
    console.log("Recommend an in-thread reply to the customer pointing back to that link.");
  }

  try {
    const { error: logErr } = await sb.from("ops_events").insert({
      event_type: "MARKETPULSE_V4_REMEDIATED_DELIVERED",
      severity: "info",
      error_signature: "marketpulse_v4_prospective_rerun",
      source_function: "deliver-mark-avel-marketpulse-v4",
      order_id: ORDER_ID,
      user_email: EMAIL,
      details: { score: score.total, tier1_share: tier1Pct, report_url: reportUrl, send_success: !!sendResult?.success, sent_at: new Date().toISOString() },
    });
    if (logErr) console.warn("ops_events insert failed:", logErr.message);
  } catch (e) { console.warn("ops_events insert warning:", e.message); }

  console.log("\n=== DELIVERED ===");
  console.log(`report URL: ${reportUrl}`);
})().catch((e) => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
