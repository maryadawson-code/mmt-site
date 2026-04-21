#!/usr/bin/env node
// GATE 2: deterministic wiring asserts for commit 2.
// Verifies call order + content in the v4 block of
// netlify/functions/generate-tactical-brief-background.js, and runs the
// audit + scorer against a simulated finalSynthesis to prove #13, #14,
// and subscriber_relevance pass under the new wiring.

const fs = require("fs");
const path = require("path");

const { scoreReportV4, renderScoreBanner } = require("../netlify/functions/lib/research-score-v4");
const { runSelfAudit } = require("../netlify/functions/lib/self-audit-v4");
const { buildSourceTable } = require("../netlify/functions/lib/source-tiering");
const { waivedContextBanner } = require("../netlify/functions/lib/subscriber-context");

const orchestratorPath = path.join(__dirname, "..", "netlify/functions/generate-tactical-brief-background.js");
const src = fs.readFileSync(orchestratorPath, "utf8");

const results = [];
function assert(label, ok, detail) {
  results.push({ label, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// --- Source-code order asserts ---
console.log("\n[1] Source-code order checks\n");

const v4BlockStart = src.indexOf("=== v4 SANITIZER + SCORE + SELF-AUDIT ===");
const v4BlockEnd = src.indexOf("// === QUALITY GATE ===");
const v4Block = src.slice(v4BlockStart, v4BlockEnd);

const idxWaivedBanner = v4Block.indexOf("waivedContextBanner()");
const idxScoreReportV4 = v4Block.indexOf("scoreReportV4(");
const idxRenderScoreBanner = v4Block.indexOf("renderScoreBanner(v4Score");
const idxBuildSourceTable = v4Block.indexOf("buildSourceTable(allPassCitations)");
const idxRunSelfAudit = v4Block.indexOf("runSelfAudit(");

assert(
  "waivedContextBanner() appears before scoreReportV4() in v4 block",
  idxWaivedBanner > -1 && idxScoreReportV4 > -1 && idxWaivedBanner < idxScoreReportV4,
  `waived@${idxWaivedBanner}, score@${idxScoreReportV4}`
);
assert(
  "renderScoreBanner(v4Score) appears after scoreReportV4() and before runSelfAudit()",
  idxRenderScoreBanner > idxScoreReportV4 && idxRenderScoreBanner < idxRunSelfAudit,
  `banner@${idxRenderScoreBanner}, audit@${idxRunSelfAudit}`
);
assert(
  "buildSourceTable(allPassCitations) appears before runSelfAudit()",
  idxBuildSourceTable > -1 && idxBuildSourceTable < idxRunSelfAudit,
  `table@${idxBuildSourceTable}, audit@${idxRunSelfAudit}`
);

// --- Line 1487-era HTML injection is guarded ---
console.log("\n[2] HTML-level banner guard checks\n");

const htmlInjectionRegion = src.slice(src.indexOf("if (!subscriberContext) {", v4BlockEnd));
assert(
  "HTML-level banner injection is guarded by if (V4_ON)",
  /if\s*\(V4_ON\)\s*\{[\s\S]{0,400}markdown banner handled pre-scoring/.test(htmlInjectionRegion),
  "V4_ON branch skips HTML-level injection"
);
assert(
  "Legacy HTML-level injection still runs when V4_ON is off",
  /else\s*\{[\s\S]{0,600}reportHtmlContent\s*=\s*reportHtmlContent\.replace\(\/\(<body/.test(htmlInjectionRegion),
  "non-v4 path still injects"
);
assert(
  "V4_ON+v4Waived no longer triggers the old dual-branch inline banner at the HTML layer",
  !/V4_ON && v4Waived[\s\S]{0,200}GENERIC RUN — WAIVED\.<\/strong>/.test(htmlInjectionRegion),
  "previous V4+waived HTML branch removed"
);

// --- Functional simulation: synthesize a v4 finalSynthesis and run audit/scorer ---
console.log("\n[3] Functional simulation with simulated v4 output\n");

// Simulate a plausible Pass 3 v4 output (the model would produce richer text
// in reality; this is just enough for the checks to fire).
const simulatedPass3 = `## Executive Thesis
VA telehealth is transitioning from infrastructure to optimization. [1]

## Methodology & Limitations
Searched SAM.gov, USASpending, GAO, CourtListener, Federal Register, Congress.gov. [1][2]
Refinement passes: 4.

## Program Overview
COMPACT Act and MISSION Act drive current requirements. Budget $2.1B FY2025 (per VA FY2027 Budget in Brief) [1][2].

## Issues Facing the Program

### 4.1 Performance
Wait times and patient throughput metrics published 2024-11-12 show variance across VISNs [1][2].

### 4.2 Procurement/contracting
T4NG2 bridge awarded 2024-06-15 [1][2].

### 4.3 Structural
Governance shift from OEHRM to OIT noted 2024-08 [1][2].

### 4.4 Readiness outcomes
80% telehealth uptime target FY2025. Veteran enrollment grew 18% 2024-2025. Cost avoidance $340M per 2024-03-14 OIG report [1][2].

### 4.5 Transition/execution
Transition plan published 2024-09-10 [1][2].

### 4.6 Oversight/compliance
GAO report 2024-07-22 [1][2].

## Readiness Outcomes
- Throughput: 4.2M visits FY2024 (per VHA 2024-10-01) [1]
- Cost avoidance: $340M (per OIG 2024-03-14) [2]
- Uptime: 99.1% FY2024 Q4 (per VA OIT 2024-12-01) [3]

## Capture Strategy — PLATFORM / INTEL MODE
- Editorial angle — Friday Brief section on VA telehealth recompete window, LinkedIn newsletter post tied to COMPACT Act expansion
- Intel product — Monthly Brief feature on T4NG2 bridge, Capture Intelligence row for Leidos incumbent defense
- Sponsorship relevance — FedRAMP High vendors would want a podcast segment tied to this signal
- Referral play — alert MMT audience subscribers tracking VA telehealth pipeline
- Watch-this trigger — industry day 2026-06-15, RFP drop Q2 FY2027, award date expected Q4 FY2027

## Pipeline Intelligence

CONTRACT/OPPORTUNITY: VA Telehealth Modernization
Agency: Department of Veterans Affairs
Contract #: VA118-24-R-0123
NAICS: 541512
Set-Aside: Full and Open
Estimated Value: $250M
Incumbent: Leidos
Status: Recompete
Timeline: RFP Q2 FY2027
Source: https://sam.gov/opp/xyz
Strategic Significance: Opens AI-native entrant window.

## Not Found / Null-Result Register
No nulls.
`;

// Use a realistic set of 28 citations, with a healthy Tier 1 share so
// primary_ratio hits its 40% floor.
const citations = [
  "https://sam.gov/opp/xyz",
  "https://www.usaspending.gov/award/12345",
  "https://www.gao.gov/products/gao-24-106789",
  "https://www.congress.gov/bill/118th/hr/1234",
  "https://www.federalregister.gov/documents/2024/11/12/xyz",
  "https://www.va.gov/budget/docs/fy2027-budget.pdf",
  "https://www.courtlistener.com/docket/abc",
  "https://www.crs.gov/report/R48000",
  "https://www.cbo.gov/publication/60500",
  "https://www.rand.org/pubs/research_reports/RRA0000-1.html",
  "https://dodig.mil/reports/2024-xyz",
  "https://www.federalregister.gov/documents/2024/09/10/xyz2",
  "https://www.gao.gov/products/gao-24-106790",
  "https://www.va.gov/oig/pubs/VAOIG-24-12345.pdf",
  "https://www.govtribe.com/opportunity/abc",
  "https://www.highergov.com/contract/xyz",
  "https://www.fedscoop.com/va-telehealth-2024",
  "https://www.washingtontechnology.com/xyz",
  "https://breakingdefense.com/2024/va-xyz",
  "https://www.defenseone.com/xyz",
  "https://www.govconwire.com/xyz",
  "https://www.reuters.com/world/us/xyz",
  "https://www.nytimes.com/2024/11/xyz",
  "https://www.wsj.com/articles/xyz",
  "https://www.ft.com/content/xyz",
  "https://techcrunch.com/xyz",
  "https://www.forbes.com/xyz",
  "https://www.healthcareitnews.com/xyz",
];

// --- Step 1: Simulate the v4 orchestrator path, generic run (no subscriberContext, waived) ---
let finalSynthesis = simulatedPass3;

// EDIT 1: prepend waived banner before scoring
finalSynthesis = waivedContextBanner() + finalSynthesis;

const subscriberRelevanceInputBeforeScore = /no subscriber context loaded|generic market intelligence|WAIVED|generic run/i.test(finalSynthesis);
assert(
  "scoreSubscriberRelevance sees banner text before scoring",
  subscriberRelevanceInputBeforeScore,
  "banner substring matches the scorer regex"
);

// Score
const opportunityCount = (finalSynthesis.match(/CONTRACT\/OPPORTUNITY:/g) || []).length;
const v4Score = scoreReportV4({
  reportText: finalSynthesis,
  citations,
  hasSubscriberContext: false,
  opportunityCount,
});

assert(
  "subscriber_relevance awarded full 15/15 under WAIVED run (banner present)",
  v4Score.dimensions.subscriber_relevance.score === 15,
  `got ${v4Score.dimensions.subscriber_relevance.score}/15, detail=${v4Score.dimensions.subscriber_relevance.detail}`
);

// EDIT 2: prepend decomposed score banner BEFORE audit
const scoreBannerMd = renderScoreBanner(v4Score, {
  subscriberStatus: "WAIVED (generic run)",
  topic: "VA telehealth",
  date: "2026-04-20",
});
finalSynthesis = scoreBannerMd + "\n\n" + finalSynthesis;

// EDIT 3: append source table BEFORE audit
finalSynthesis += "\n\n## Source Table\n\n" + buildSourceTable(citations);

// Audit
const v4Audit = runSelfAudit({
  reportText: finalSynthesis,
  citations,
  hasSubscriberContext: false,
  waived: true,
  isBidder: false,
  nullQueryCount: 0,
  fetchCount: citations.length,
  refinementPasses: 4,
  score: v4Score,
});

const check13 = v4Audit.checks.find((c) => c.id === 13);
const check14 = v4Audit.checks.find((c) => c.id === 14);
const check5 = v4Audit.checks.find((c) => c.id === 5);
const check10 = v4Audit.checks.find((c) => c.id === 10);
const check11 = v4Audit.checks.find((c) => c.id === 11);
const check1 = v4Audit.checks.find((c) => c.id === 1);

assert(
  "Audit #13 (Source Table) passes under new wiring",
  check13 && check13.passed,
  check13 ? check13.evidence : "check-missing"
);
assert(
  "Audit #14 (Decomposed Score) passes under new wiring",
  check14 && check14.passed,
  check14 ? check14.evidence : "check-missing"
);
assert(
  "Audit #1 (subscriber context loaded OR waived) passes",
  check1 && check1.passed,
  check1 ? check1.evidence : "check-missing"
);
assert(
  "Audit #5 (Issue Coverage) passes on simulated v4 output",
  check5 && check5.passed,
  check5 ? check5.evidence : "check-missing"
);
assert(
  "Audit #10 (Readiness Metrics) passes on simulated v4 output",
  check10 && check10.passed,
  check10 ? check10.evidence : "check-missing"
);
assert(
  "Audit #11 (Capture Strategy / MMT plays or generic) passes",
  check11 && check11.passed,
  check11 ? check11.evidence : "check-missing"
);

// Summary
console.log(`\n[4] Simulated audit totals: ${v4Audit.passedCount}/${v4Audit.checks.length} passed, score=${v4Score.total}/100 band=${v4Score.band}`);

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log("\nGATE 2 WIRING CHECK: PASS");
  console.log("All 12 asserts passed. The commit 2 wiring is correct.");
  console.log("\nNOTE: this is a deterministic wiring simulation, not a live pipeline run.");
  console.log("A real v4 order run (against Perplexity + Anthropic) is needed to confirm");
  console.log("model-dependent checks (#2 dollar cites, #4 cross-verify, #15 hedges, etc.).");
} else {
  console.log(`\nGATE 2 WIRING CHECK: FAIL — ${failed.length}/${results.length} asserts failed:`);
  for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
