#!/usr/bin/env node
// GATE 3: buildSourceTable must dedupe by canonical URL.
// 10 inputs, 4 pairs of near-dupes → expected 6 unique rows.

const { buildSourceTable, dedupeCitations, canonicalizeUrl } = require("../netlify/functions/lib/source-tiering");

const fixture = [
  // Pair 1: same URL, one with utm params
  "https://sam.gov/opp/abc123",
  "https://sam.gov/opp/abc123?utm_source=newsletter&utm_medium=email",
  // Pair 2: trailing slash vs no trailing slash
  "https://www.gao.gov/products/gao-24-106789",
  "https://www.gao.gov/products/gao-24-106789/",
  // Pair 3: case differences in hostname + fragment
  "https://Www.USAspending.gov/award/12345",
  "https://www.usaspending.gov/award/12345#summary",
  // Pair 4: ref tracking param vs fbclid param on the same base URL
  "https://www.va.gov/budget/docs/fy2027-budget.pdf?ref=twitter",
  "https://www.va.gov/budget/docs/fy2027-budget.pdf?fbclid=IwAR123",
  // Unique #1
  "https://www.congress.gov/bill/118th/hr/1234",
  // Unique #2
  "https://www.federalregister.gov/documents/2024/11/12/xyz",
];

const results = [];
function assert(label, ok, detail) {
  results.push({ label, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("\n[1] canonicalizeUrl sanity\n");
assert(
  "utm params stripped",
  canonicalizeUrl("https://sam.gov/opp/abc?utm_source=x&utm_medium=y") === "https://sam.gov/opp/abc",
  canonicalizeUrl("https://sam.gov/opp/abc?utm_source=x&utm_medium=y")
);
assert(
  "trailing slash stripped",
  canonicalizeUrl("https://gao.gov/products/foo/") === "https://gao.gov/products/foo",
  canonicalizeUrl("https://gao.gov/products/foo/")
);
assert(
  "hostname lowercased + www stripped",
  canonicalizeUrl("https://Www.USAspending.gov/award/1") === "https://usaspending.gov/award/1",
  canonicalizeUrl("https://Www.USAspending.gov/award/1")
);
assert(
  "fragment dropped",
  canonicalizeUrl("https://va.gov/page#section") === "https://va.gov/page",
  canonicalizeUrl("https://va.gov/page#section")
);
assert(
  "ref/fbclid/gclid stripped",
  canonicalizeUrl("https://va.gov/page?ref=twitter&fbclid=abc&gclid=xyz") === "https://va.gov/page",
  canonicalizeUrl("https://va.gov/page?ref=twitter&fbclid=abc&gclid=xyz")
);

console.log("\n[2] dedupeCitations fixture (10 inputs, 4 dupe pairs → 6 unique)\n");
const unique = dedupeCitations(fixture);
assert(
  "dedupeCitations returns 6 rows",
  unique.length === 6,
  `got ${unique.length}`
);
assert(
  "dedupeCitations preserves first occurrence (sam.gov w/o utm)",
  unique[0] === "https://sam.gov/opp/abc123",
  unique[0]
);

console.log("\n[3] buildSourceTable output\n");
const table = buildSourceTable(fixture);
const lines = table.split("\n");
const dataRows = lines.filter((l) => /^\|\s*\d+\s*\|/.test(l));
assert(
  "buildSourceTable emits header + separator + 6 data rows",
  dataRows.length === 6,
  `got ${dataRows.length} data rows`
);

// Row numbering sanity: 1..6 sequential
const nums = dataRows.map((r) => parseInt(r.split("|")[1].trim(), 10));
assert(
  "row numbers are 1..6 sequential",
  JSON.stringify(nums) === JSON.stringify([1, 2, 3, 4, 5, 6]),
  JSON.stringify(nums)
);

// Table shape
assert(
  "header row present",
  lines[0] === "| # | URL | Tier | Date | Claim Supported |",
  lines[0]
);

// Audit-compat check: replicate checkSourceTable logic
console.log("\n[4] self-audit #13 compat check\n");
const rowUrls = dataRows.map((r) => r.split("|").map((p) => p.trim())[2]);
const uniqueUrls = new Set(rowUrls).size;
const expected = unique.length; // what runSelfAudit would receive
const passed13 = dataRows.length > 0 && dataRows.length >= Math.floor(expected * 0.9) && uniqueUrls === rowUrls.length;
assert(
  "checkSourceTable would pass with deduped citations as expected",
  passed13,
  `rows=${dataRows.length}, expected≈${expected}, unique=${uniqueUrls}`
);

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log(`\nGATE 3: PASS (${results.length}/${results.length})`);
} else {
  console.log(`\nGATE 3: FAIL — ${failed.length}/${results.length}`);
  for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
