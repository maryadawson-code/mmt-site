#!/usr/bin/env node
// GATE 5: tiered delivery gating — hard stop on Tier A, soft warn on
// Tier B when score ≥ 85, strict mode restores legacy binary behavior.

const {
  checkStopConditions,
  renderVerificationNotes,
  TIER_A_CHECK_IDS,
  SOFT_DELIVERY_SCORE_THRESHOLD,
} = require("../netlify/functions/lib/self-audit-v4");

const results = [];
function assert(label, ok, detail) {
  results.push({ label, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function buildAudit(failingIds) {
  const allIds = Array.from({ length: 18 }, (_, i) => i + 1);
  const checks = allIds.map((id) => ({
    id,
    label: `check ${id}`,
    passed: !failingIds.includes(id),
    evidence: failingIds.includes(id) ? `sim-fail-${id}` : "ok",
  }));
  const passedCount = checks.filter((c) => c.passed).length;
  return { checks, passedCount, failedCount: 18 - passedCount, allPassed: passedCount === 18 };
}
function scoreObj(total) {
  return { total, band: total >= 70 ? "deliver" : total >= 50 ? "remediate" : "stop", dimensions: {} };
}

console.log("\n[1] Tier A definition\n");
assert(
  "Tier A contains exactly {1, 5, 10, 11, 13, 14, 17}",
  [...TIER_A_CHECK_IDS].sort((a, b) => a - b).join(",") === "1,5,10,11,13,14,17",
  [...TIER_A_CHECK_IDS].sort((a, b) => a - b).join(",")
);
assert(
  "Soft-delivery threshold is 85",
  SOFT_DELIVERY_SCORE_THRESHOLD === 85,
  String(SOFT_DELIVERY_SCORE_THRESHOLD)
);

console.log("\n[2] All-clean audit delivers with no flags\n");
{
  const r = checkStopConditions({
    audit: buildAudit([]),
    score: scoreObj(92),
    hasSubscriberContext: true,
    waived: false,
  });
  assert("clean audit, high score → deliver", r.stop === false, `stop=${r.stop}`);
  assert("no soft flags on clean audit", r.softFlags.length === 0, `softFlags=${r.softFlags.length}`);
}

console.log("\n[3] Tier A failure hard-stops regardless of score\n");
for (const tierAId of [1, 5, 10, 11, 13, 14, 17]) {
  const r = checkStopConditions({
    audit: buildAudit([tierAId]),
    score: scoreObj(95),
    hasSubscriberContext: true,
    waived: false,
  });
  assert(
    `#${tierAId} failing at score 95 → hard stop`,
    r.stop === true && r.reasons.some((x) => x.includes(`#${tierAId}`)),
    `stop=${r.stop}`
  );
}

console.log("\n[4] Tier B failure + score ≥ 85 → soft delivery\n");
{
  const r = checkStopConditions({
    audit: buildAudit([2, 3, 4, 8, 16]),
    score: scoreObj(88),
    hasSubscriberContext: true,
    waived: false,
  });
  assert("Tier B only + score 88 → deliver (no stop)", r.stop === false, `stop=${r.stop}`);
  assert(
    "softFlags contains all 5 Tier B failures",
    r.softFlags.length === 5 && r.softFlags.map((f) => f.id).sort((a, b) => a - b).join(",") === "2,3,4,8,16",
    r.softFlags.map((f) => f.id).join(",")
  );
}

console.log("\n[5] Tier B failure + score < 85 → hard stop\n");
{
  const r = checkStopConditions({
    audit: buildAudit([2]),
    score: scoreObj(80),
    hasSubscriberContext: true,
    waived: false,
  });
  assert("Tier B only + score 80 → stop", r.stop === true, `stop=${r.stop}`);
  assert("reasons mention TIER B + score <85", r.reasons.some((x) => /TIER B.*<85/.test(x)), r.reasons[0] || "");
}

console.log("\n[6] Tier A + Tier B together → hard stop (Tier A wins)\n");
{
  const r = checkStopConditions({
    audit: buildAudit([5, 2]),
    score: scoreObj(90),
    hasSubscriberContext: true,
    waived: false,
  });
  assert("Tier A + Tier B failing at 90 → stop", r.stop === true, `stop=${r.stop}`);
  assert("reason mentions Tier A #5", r.reasons.some((x) => /TIER A.*#5/.test(x)), "");
}

console.log("\n[7] Score floor < 50 always stops\n");
{
  const r = checkStopConditions({
    audit: buildAudit([]),
    score: scoreObj(45),
    hasSubscriberContext: true,
    waived: false,
  });
  assert("clean audit + score 45 → stop (floor)", r.stop === true, `stop=${r.stop}`);
  assert("reason mentions floor 50", r.reasons.some((x) => /below floor \(50\)/.test(x)), "");
}

console.log("\n[8] Missing subscriber context + not waived → stop\n");
{
  const r = checkStopConditions({
    audit: buildAudit([]),
    score: scoreObj(95),
    hasSubscriberContext: false,
    waived: false,
  });
  assert("no context + not waived → stop", r.stop === true, `stop=${r.stop}`);
  assert("reason mentions subscriber context", r.reasons.some((x) => /Subscriber context missing/.test(x)), "");
}

console.log("\n[9] Strict mode preserves legacy binary behavior\n");
{
  const r = checkStopConditions({
    audit: buildAudit([2]),
    score: scoreObj(95),
    hasSubscriberContext: true,
    waived: false,
    strict: true,
  });
  assert("strict + any Tier B failure at 95 → stop", r.stop === true, `stop=${r.stop}`);
  assert("strict reason prefix [STRICT]", r.reasons.some((x) => /\[STRICT/.test(x)), "");
}

console.log("\n[10] Verification Notes footnote\n");
{
  const notes = renderVerificationNotes([
    { id: 2, label: "Dollar citation", evidence: "3 unsourced" },
    { id: 16, label: "Fabrication", evidence: "1 quote uncited" },
  ]);
  assert("starts with ## Verification Notes", /^## Verification Notes/.test(notes), "");
  assert("lists #2 and #16 items", /#2 Dollar citation/.test(notes) && /#16 Fabrication/.test(notes), "");
  assert("mentions strict-mode toggle", /MARKETPULSE_STRICT_AUDIT/.test(notes), "");
}
assert(
  "renderVerificationNotes with empty flags returns empty string",
  renderVerificationNotes([]) === "" && renderVerificationNotes(null) === "",
  ""
);

const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log(`\nGATE 5: PASS (${results.length}/${results.length})`);
} else {
  console.log(`\nGATE 5: FAIL — ${failed.length}/${results.length}`);
  for (const f of failed) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
