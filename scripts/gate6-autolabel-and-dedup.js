#!/usr/bin/env node
// GATE 6: harden dedup (www / path case / http-https) and auto-label Tier 3.

const {
  canonicalizeUrl,
  dedupeCitations,
  buildSourceTable,
  autoLabelTier3,
} = require("../netlify/functions/lib/source-tiering");

const results = [];
function assert(label, ok, detail) {
  results.push({ label, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("\n[1] Hardened canonicalization\n");
assert(
  "www/non-www collapse",
  canonicalizeUrl("https://www.foo.com/bar") === canonicalizeUrl("https://foo.com/bar"),
  `${canonicalizeUrl("https://www.foo.com/bar")} vs ${canonicalizeUrl("https://foo.com/bar")}`
);
assert(
  "path case collapse",
  canonicalizeUrl("https://foo.com/Bar/Baz") === canonicalizeUrl("https://foo.com/bar/baz"),
  canonicalizeUrl("https://foo.com/Bar/Baz")
);
assert(
  "http → https normalization",
  canonicalizeUrl("http://foo.com/bar") === canonicalizeUrl("https://foo.com/bar"),
  canonicalizeUrl("http://foo.com/bar")
);
assert(
  "combined www + path case + http → one key",
  canonicalizeUrl("http://www.foo.com/BAR") === canonicalizeUrl("https://foo.com/bar"),
  canonicalizeUrl("http://www.foo.com/BAR")
);
assert(
  "utm strip still works",
  canonicalizeUrl("https://foo.com/bar?utm_source=x") === canonicalizeUrl("https://foo.com/bar"),
  ""
);

console.log("\n[2] dedup www/non-www/path case\n");
{
  const raw = [
    "https://www.foo.com/Bar",
    "https://foo.com/bar",
    "http://www.foo.com/BAR/",
    "https://foo.com/bar?utm_source=newsletter",
  ];
  const unique = dedupeCitations(raw);
  assert("4 equivalent inputs collapse to 1 row", unique.length === 1, `got ${unique.length}`);
  assert("first original preserved", unique[0] === "https://www.foo.com/Bar", unique[0]);
}

console.log("\n[3] buildSourceTable Tier 3 rows auto-tagged in Claim column\n");
{
  const mixed = [
    "https://sam.gov/opp/a",                  // T1
    "https://www.usaspending.gov/award/b",    // T1
    "https://www.govtribe.com/opportunity/c", // T2
    "https://reddit.com/r/govcontracts/x",    // T3
    "https://example.com/blog/rambling",      // T3 (default)
  ];
  const table = buildSourceTable(mixed);
  const lines = table.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l));
  const t3Rows = lines.filter((l) => l.includes("[sentiment-source]"));
  const t1Rows = lines.filter((l) => / T1 /.test(l));
  assert("Tier 3 rows carry [sentiment-source] in Claim column", t3Rows.length === 2, `got ${t3Rows.length}`);
  assert("Tier 1 rows do NOT carry [sentiment-source]", t1Rows.every((l) => !l.includes("[sentiment-source]")), "");
}

console.log("\n[4] autoLabelTier3 inserts marker next to inline Tier 3 URLs\n");
{
  const citations = [
    "https://sam.gov/opp/a",
    "https://reddit.com/r/contracts/1",
  ];
  const raw = `Key Findings
https://sam.gov/opp/a confirms the award.
A community post at https://reddit.com/r/contracts/1 suggests otherwise.
`;
  const { text, labeled } = autoLabelTier3(raw, citations);
  assert("labeled exactly 1 inline Tier 3 occurrence", labeled === 1, `labeled=${labeled}`);
  assert("reddit URL now followed by [sentiment-source]", /reddit\.com\/r\/contracts\/1 \[sentiment-source\]/.test(text), "");
  assert("sam.gov URL NOT labeled (Tier 1)", !/sam\.gov\/opp\/a \[sentiment-source\]/.test(text), "");
}

console.log("\n[5] autoLabelTier3 is idempotent\n");
{
  const citations = ["https://reddit.com/r/x/1"];
  const pass1 = autoLabelTier3("See https://reddit.com/r/x/1 for context.", citations);
  const pass2 = autoLabelTier3(pass1.text, citations);
  assert("pass 1 inserts one marker", pass1.labeled === 1, `labeled=${pass1.labeled}`);
  assert("pass 2 inserts zero markers", pass2.labeled === 0, `labeled=${pass2.labeled}`);
  assert(
    "text only has one marker after two passes",
    (pass2.text.match(/\[sentiment-source\]/g) || []).length === 1,
    ""
  );
}

console.log("\n[6] autoLabelTier3 respects pre-existing labels within window\n");
{
  const citations = ["https://reddit.com/r/x/2"];
  const text = "Commentary [sentiment-source] at https://reddit.com/r/x/2 discusses the protest.";
  const { labeled } = autoLabelTier3(text, citations);
  assert("marker already in window → no new label", labeled === 0, `labeled=${labeled}`);
}

console.log("\n[7] audit #8 compatibility simulation\n");
{
  // Simulate what runSelfAudit's checkTier3Labels sees after auto-label
  const citations = [
    "https://reddit.com/r/x/1",
    "https://linkedin.com/post/xyz",
  ];
  const raw = "Post at https://reddit.com/r/x/1 and reaction at https://linkedin.com/post/xyz.";
  const { text } = autoLabelTier3(raw, citations);

  const missing = citations.filter((url) => {
    const idx = text.indexOf(url);
    if (idx < 0) return false;
    const window = text.slice(Math.max(0, idx - 120), idx + url.length + 120);
    return !/\[sentiment-source\]/i.test(window);
  });
  assert("audit #8 would find 0 unlabeled Tier 3 inline", missing.length === 0, `${missing.length} missing`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log(`\nGATE 6: PASS (${results.length}/${results.length})`);
} else {
  console.log(`\nGATE 6: FAIL — ${failed.length}/${results.length}`);
  for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
