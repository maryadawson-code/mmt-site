#!/usr/bin/env node
// GATE 8: customer-delivered report sanitization.
// Two fixtures:
//   A) Tier B flags fired — Verification Notes appears in customer voice
//   B) No Tier B flags — Verification Notes section absent entirely
// Assert every stripped pattern is gone; Source Table remains exactly once;
// numeric citations preserved.

const {
  sanitizeCustomerSynthesis,
  renderCustomerVerificationNotes,
} = require("../netlify/functions/lib/customer-sanitizer");

const results = [];
function assert(label, ok, detail) {
  results.push({ label, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// Build a "fully-populated finalSynthesis" containing all internal elements
// the orchestrator could possibly append.
function buildFullSynthesis() {
  return [
    "> **Research Score: 90/100** — SourceQuality 30/30 · PrimaryRatio 20/20 · VerificationDepth 20/20 · IssueCoverage 15/15 · SubscriberRelevance 15/15",
    "> Subscriber: WAIVED (generic run) · Topic: RHRP · Date: 2026-04-20",
    "",
    "> ⚠️ **GENERIC RUN — WAIVED.** No subscriber context loaded (WAIVE_CONTEXT=true). This report is generic market intelligence. No opportunity tagging, no IN-FLIGHT detection, no OCI-aware capture advice. Mode defaulted to \"generic\".",
    "",
    "MARKETPULSE v4 ACTIVE — DEEP RESEARCH LOOP ENGAGED",
    "SUBSCRIBER STATUS: NOT LOADED (generic mode)",
    "ACKNOWLEDGMENT: MARKETPULSE v4 ACTIVE",
    "",
    "## Executive Thesis",
    "RHRP-4 is the binding recompete vector [4][6][10]. [inference] Incumbent defense expected.",
    "",
    "## Program Overview",
    "History and policy authority [CONTEXT].",
    "",
    "## 4.1 Performance",
    "Metric confirmed [4].",
    "",
    "## 4.2 Procurement/contracting",
    "Task order flow [6].",
    "",
    "## 4.3 Structural",
    "Governance noted [10].",
    "",
    "## 4.4 Readiness outcomes",
    "Readiness figures dated [11].",
    "",
    "## 4.5 Transition/execution",
    "Transition plan [12].",
    "",
    "## 4.6 Oversight/compliance",
    "Oversight [13].",
    "",
    "## Readiness Outcomes",
    "- 80% uptime FY2025 [4]",
    "- 18% growth 2024-2025 [5]",
    "- $340M saved 2024-03-14 [6]",
    "",
    "## Capture Strategy",
    "- Friday Brief angle [landscape]",
    "- Monthly Brief feature [speculative]",
    "",
    "## Forward Catalysts",
    "- Industry day 2026-06-15 [RHRP checklist]",
    "",
    "## Not Found / Null-Result Register",
    "- None.",
    "",
    "## Source Table",
    "",
    "| # | URL | Tier | Date | Claim Supported |",
    "|---|---|---|---|---|",
    "| 1 | https://sam.gov/opp/x | T1 | — | — |",
    "| 2 | https://reddit.com/r/x [sentiment-source] | T3 | — | [sentiment-source] |",
    "",
    "## AUDIT BLOCK",
    "",
    "**Checks passed:** 15/18",
    "",
    "| # | Check | Result | Evidence |",
    "|---|---|---|---|",
    "| 2 | Dollar citation | **FAIL** | 3 unsourced |",
    "| 16 | Fabrication | **FAIL** | 1 uncited quote |",
    "",
    "## REMEDIATION PLAN",
    "",
    "Lift source quality by 2 pts.",
    "",
    "## Verification Notes",
    "",
    "This report met all structural delivery gates...",
    "- **#2 Dollar citation** — 3 unsourced",
    "- **#16 Fabrication** — 1 uncited quote",
    "",
    "_For a stricter audit, the operator can set `MARKETPULSE_STRICT_AUDIT=on` to block delivery on any audit failure._",
  ].join("\n");
}

const FULL = buildFullSynthesis();

// ---- Fixture A: Tier B flags fire (#2, #3, #16 — customer-surfaced;
// #8, #15 — internal only, should NOT appear in customer notes) ----
console.log("\n[A] Tier B flags fired — customer Verification Notes expected\n");
{
  const softFlags = [
    { id: 2,  label: "Dollar citation", evidence: "3 unsourced" },
    { id: 3,  label: "PIID",            evidence: "2 unverified" },
    { id: 8,  label: "Tier 3 labeled",  evidence: "4 unlabeled" }, // SHOULD NOT surface
    { id: 15, label: "Hedge words",     evidence: "2 undated" },    // SHOULD NOT surface
    { id: 16, label: "Fabrication",     evidence: "1 uncited quote" },
  ];
  const out = sanitizeCustomerSynthesis(FULL, softFlags);

  // Banned patterns
  assert("A: no 'Research Score: N/100'", !/Research Score:\s*\d+\/100/.test(out), "");
  assert("A: no 'MARKETPULSE v4 ACTIVE'", !/MARKETPULSE v4 ACTIVE/.test(out), "");
  assert("A: no 'SUBSCRIBER STATUS:'", !/SUBSCRIBER STATUS:/.test(out), "");
  assert("A: no '## AUDIT BLOCK'", !/##\s*AUDIT BLOCK/.test(out), "");
  assert("A: no bare 'AUDIT BLOCK' header text", !/\nAUDIT BLOCK\b/.test(out) && !/^AUDIT BLOCK\b/.test(out), "");
  assert("A: no 'REMEDIATION PLAN'", !/REMEDIATION PLAN/.test(out), "");
  assert("A: no 'GENERIC RUN — WAIVED'", !/GENERIC RUN — WAIVED/.test(out), "");
  assert("A: no '[inference]' token", !/\[inference\]/i.test(out), "");
  assert("A: no '[Context]' / '[CONTEXT]' token", !/\[(?:Context|CONTEXT)\]/.test(out), "");
  assert("A: no '[RHRP checklist]' token", !/\[RHRP[^\]]*\]/.test(out), "");
  assert("A: no '[sentiment-source]' token", !/\[sentiment-source\]/i.test(out), "");
  assert("A: no '[landscape]' token", !/\[landscape\]/i.test(out), "");
  assert("A: no '[speculative]' token", !/\[speculative(?::[^\]]*)?\]/i.test(out), "");
  assert("A: no 'MARKETPULSE_STRICT_AUDIT'", !/MARKETPULSE_STRICT_AUDIT/.test(out), "");
  assert("A: no 'ACKNOWLEDGMENT:'", !/ACKNOWLEDGMENT:/.test(out), "");

  // Keep-list checks
  assert("A: Executive Thesis retained", /## Executive Thesis/.test(out), "");
  assert("A: all 6 issue subsections retained", /4\.1 Performance/.test(out) && /4\.2 Procurement/.test(out) && /4\.3 Structural/.test(out) && /4\.4 Readiness/.test(out) && /4\.5 Transition/.test(out) && /4\.6 Oversight/.test(out), "");
  assert("A: Readiness Outcomes heading retained", /## Readiness Outcomes/.test(out), "");
  assert("A: Capture Strategy heading retained", /## Capture Strategy/.test(out), "");
  assert("A: Forward Catalysts retained", /## Forward Catalysts/.test(out), "");
  assert("A: Null-Result Register retained", /## Not Found \/ Null-Result Register/.test(out), "");
  const sourceTableCount = (out.match(/^##\s*Source Table\s*$/gm) || []).length;
  assert("A: Source Table heading appears exactly once", sourceTableCount === 1, `count=${sourceTableCount}`);
  assert("A: numeric citations preserved", /\[4\]/.test(out) && /\[6\]/.test(out) && /\[10\]/.test(out), "");

  // Customer Verification Notes
  assert("A: Verification Notes section present", /## Verification Notes/.test(out), "");
  assert("A: #2 surfaced in customer voice", /dollar figures.*SAM\.gov\/USAspending/i.test(out), "");
  assert("A: #3 surfaced in customer voice", /contract identifiers.*Tier 1 federal source/i.test(out), "");
  assert("A: #16 surfaced in customer voice", /quoted statement.*direct source link/i.test(out), "");
  assert("A: #8 NOT surfaced (internal hygiene)", !/Tier 3 labeled/.test(out) && !/sentiment-source/i.test(out), "");
  assert("A: #15 NOT surfaced (stylistic)", !/Hedge words/.test(out) && !/hedge-without-date/i.test(out), "");
  assert("A: strict-audit env hint NOT in customer copy", !/MARKETPULSE_STRICT_AUDIT/.test(out) && !/For a stricter audit/i.test(out), "");
}

// ---- Fixture B: no Tier B flags — Verification Notes absent entirely ----
console.log("\n[B] No Tier B flags — Verification Notes section absent\n");
{
  const out = sanitizeCustomerSynthesis(FULL, []);
  assert("B: Verification Notes section absent", !/## Verification Notes/.test(out), "");
  // Also confirm strips still worked
  assert("B: audit block still stripped", !/## AUDIT BLOCK/.test(out), "");
  assert("B: score banner still stripped", !/Research Score:\s*\d+\/100/.test(out), "");
  assert("B: inference token still stripped", !/\[inference\]/i.test(out), "");
  const sourceTableCount = (out.match(/^##\s*Source Table\s*$/gm) || []).length;
  assert("B: Source Table heading appears exactly once", sourceTableCount === 1, `count=${sourceTableCount}`);
}

// ---- Fixture C: only internal-only flags (#8, #15) fired — Verification Notes still absent ----
console.log("\n[C] Only internal-only flags (#8, #15) fired — Verification Notes still absent\n");
{
  const softFlags = [
    { id: 8,  label: "Tier 3 labeled", evidence: "2 unlabeled" },
    { id: 15, label: "Hedge words",    evidence: "1 undated" },
  ];
  const out = sanitizeCustomerSynthesis(FULL, softFlags);
  assert("C: Verification Notes section absent (no surfaceable flags)", !/## Verification Notes/.test(out), "");
}

// ---- Fixture D: renderCustomerVerificationNotes direct tests ----
console.log("\n[D] renderCustomerVerificationNotes direct unit tests\n");
{
  assert("D: empty softFlags → empty string", renderCustomerVerificationNotes([]) === "", "");
  assert("D: null softFlags → empty string", renderCustomerVerificationNotes(null) === "", "");
  const notes = renderCustomerVerificationNotes([{ id: 2, label: "x", evidence: "y" }]);
  assert("D: starts with '## Verification Notes'", /^## Verification Notes/.test(notes), "");
  assert("D: has customer-voice #2 line", /dollar figures.*SAM\.gov\/USAspending/i.test(notes), "");
}

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log(`\nGATE 8: PASS (${results.length}/${results.length})`);
} else {
  console.log(`\nGATE 8: FAIL — ${failed.length}/${results.length}`);
  for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
