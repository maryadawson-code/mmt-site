#!/usr/bin/env node
// GATE 7: strip model-emitted Source Table before appending canonical.
// Exercises the REAL audit regex from self-audit-v4.js:296 — not just
// heading-occurrence counts.
//
// Two fixture cases:
//   (a) Source Table is the LAST section of finalSynthesis
//   (b) Source Table is MID-BODY, followed by another ## section
// Both must pass: heading appears once, audit rows === v4Citations.length,
// audit unique === rows.

const { buildSourceTable } = require("../netlify/functions/lib/source-tiering");
const { runSelfAudit } = require("../netlify/functions/lib/self-audit-v4");

const STRIP_REGEX = /\n?##\s*Source Table[\s\S]*?(?=\n##\s|$)/gi;

const results = [];
function assert(label, ok, detail) {
  results.push({ label, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function stubScore() {
  return {
    total: 90,
    band: "deliver",
    dimensions: {
      source_quality: { score: 30, max: 30, detail: "" },
      primary_ratio: { score: 20, max: 20, detail: "" },
      verification_depth: { score: 20, max: 20, detail: "" },
      issue_coverage: { score: 15, max: 15, detail: "" },
      subscriber_relevance: { score: 15, max: 15, detail: "" },
    },
  };
}

function runCase(caseName, modelSynthesis, v4Citations) {
  console.log(`\n[${caseName}] pre-fix orchestrator behavior (naive append, no strip)\n`);

  // Pre-fix: orchestrator appends its canonical table WITHOUT stripping the
  // model's emitted one. Audit #13 should double-count and fail.
  const naiveFinal = modelSynthesis + "\n\n## Source Table\n\n" + buildSourceTable(v4Citations);
  const preAudit = runSelfAudit({
    reportText: naiveFinal,
    citations: v4Citations,
    hasSubscriberContext: true,
    waived: false,
    isBidder: false,
    nullQueryCount: 0,
    fetchCount: v4Citations.length,
    refinementPasses: 4,
    score: stubScore(),
  });
  const preC13 = preAudit.checks.find((c) => c.id === 13);
  const expectedDoubledRows = v4Citations.length * 2;
  assert(
    `[${caseName}] audit #13 FAILS under naive append (rows=${expectedDoubledRows})`,
    !preC13.passed && preC13.evidence.includes(`rows=${expectedDoubledRows}`),
    preC13.evidence
  );

  // Apply the orchestrator transform: strip, then append canonical.
  let finalSynthesis = modelSynthesis.replace(STRIP_REGEX, "");
  finalSynthesis += "\n\n## Source Table\n\n" + buildSourceTable(v4Citations);

  console.log(`\n[${caseName}] after-strip state\n`);

  // Heading appears exactly once
  const headingCount = (finalSynthesis.match(/^##\s*Source Table\s*$/gim) || []).length;
  assert(
    `[${caseName}] '## Source Table' heading appears exactly once`,
    headingCount === 1,
    `headings=${headingCount}`
  );

  // Run audit on the stripped+reappended body — the real post-orchestrator shape
  const postAudit = runSelfAudit({
    reportText: finalSynthesis,
    citations: v4Citations,
    hasSubscriberContext: true,
    waived: false,
    isBidder: false,
    nullQueryCount: 0,
    fetchCount: v4Citations.length,
    refinementPasses: 4,
    score: stubScore(),
  });
  const c13 = postAudit.checks.find((c) => c.id === 13);

  // Re-derive the audit's row + unique counts via the real regex
  const tableMatch = finalSynthesis.match(/\|\s*#\s*\|\s*URL\s*\|\s*Tier\s*\|[\s\S]*/i);
  const rows = tableMatch ? tableMatch[0].split(/\n/).filter((l) => /^\|\s*\d+/.test(l)) : [];
  const urls = rows.map((r) => r.split("|").map((p) => p.trim())[2] || "");
  const unique = new Set(urls).size;

  assert(
    `[${caseName}] audit-regex rows === v4Citations.length`,
    rows.length === v4Citations.length,
    `rows=${rows.length}, expected=${v4Citations.length}`
  );
  assert(
    `[${caseName}] audit-regex unique === rows`,
    unique === rows.length,
    `unique=${unique}, rows=${rows.length}`
  );
  assert(
    `[${caseName}] audit #13 passes end-to-end`,
    c13.passed,
    c13.evidence
  );
}

// ---- Fixture A: Source Table is the LAST section ----
{
  const citations = Array.from({ length: 25 }, (_, i) => `https://sam.gov/opp/${i}`);
  const modelRows = citations.map((u, i) => `| ${i + 1} | ${u} | T1 | 2026-01-01 | thesis |`);
  const synth = [
    "## Executive Thesis",
    "Stub thesis.",
    "",
    "## Pipeline Intelligence",
    "CONTRACT/OPPORTUNITY: Stub",
    "",
    "## Source Table",
    "",
    "| # | URL | Tier | Date | Claim Supported |",
    "|---|---|---|---|---|",
    ...modelRows,
  ].join("\n");
  runCase("A: last-section", synth, citations);
}

// ---- Fixture B: Source Table MID-BODY, followed by another ## section ----
{
  const citations = Array.from({ length: 25 }, (_, i) => `https://sam.gov/opp/${i}`);
  const modelRows = citations.map((u, i) => `| ${i + 1} | ${u} | T1 | 2026-01-01 | thesis |`);
  const synth = [
    "## Executive Thesis",
    "Stub thesis.",
    "",
    "## Source Table",
    "",
    "| # | URL | Tier | Date | Claim Supported |",
    "|---|---|---|---|---|",
    ...modelRows,
    "",
    "## Forward Catalysts",
    "- Something 2026-06-15",
    "",
    "## Not Found / Null-Result Register",
    "- none",
  ].join("\n");
  runCase("B: mid-body", synth, citations);
}

// ---- Extra sanity: the audit WOULD fail without the strip (baseline from the investigation) ----
console.log("\n[baseline] Confirm the bug existed\n");
{
  const citations = Array.from({ length: 25 }, (_, i) => `https://sam.gov/opp/${i}`);
  const modelRows = citations.map((u, i) => `| ${i + 1} | ${u} | T1 | 2026-01-01 | thesis |`);
  const modelTable = [
    "## Source Table",
    "",
    "| # | URL | Tier | Date | Claim Supported |",
    "|---|---|---|---|---|",
    ...modelRows,
  ].join("\n");
  const appended = "\n\n## Source Table\n\n" + buildSourceTable(citations);
  const doubled = modelTable + "\n\n## Forward Catalysts\n- stub\n" + appended;
  const audit = runSelfAudit({
    reportText: doubled,
    citations,
    hasSubscriberContext: true,
    waived: false,
    isBidder: false,
    nullQueryCount: 0,
    fetchCount: citations.length,
    refinementPasses: 4,
    score: stubScore(),
  });
  const c13 = audit.checks.find((c) => c.id === 13);
  assert(
    "without-strip scenario: audit #13 FAILS with rows=50",
    !c13.passed && /rows=50/.test(c13.evidence),
    c13.evidence
  );
}

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log(`\nGATE 7: PASS (${results.length}/${results.length})`);
} else {
  console.log(`\nGATE 7: FAIL — ${failed.length}/${results.length}`);
  for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
