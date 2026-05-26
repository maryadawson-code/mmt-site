// tests/unit/intel-notes-sanitizer.test.js
//
// Locks the contract for netlify/functions/lib/intel-notes-sanitizer.js.
// Triggered by the 2026-05-26 CGI subscriber complaint where Claude's
// chain-of-thought ("I could not verify the notice from the provided
// results") was rendered to a paid subscriber inside the Verification
// Notes block.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isStaleNote,
  sanitizeNotes,
  hasStaleNotes,
  strippedNotes,
  STALE_NOTE_PATTERNS,
  CONTRADICTED_PREFIX,
} = require("../../netlify/functions/lib/intel-notes-sanitizer");

test("isStaleNote: CONTRADICTED: prefix is stripped", () => {
  assert.equal(isStaleNote("CONTRADICTED: claim X — what evidence shows Y"), true);
  assert.equal(isStaleNote("contradicted: lowercase variant"), true);
});

test("isStaleNote: chain-of-thought phrases stripped", () => {
  assert.equal(isStaleNote("I could not verify the notice directly in SAM.gov."), true);
  assert.equal(isStaleNote("The prior statement is out of date."), true);
  assert.equal(isStaleNote("from the provided results, the exact text was not available"), true);
  assert.equal(isStaleNote("partially unconfirmed because no notice was retrieved"), true);
  assert.equal(isStaleNote("I was unable to retrieve the SAM listing during this pass"), true);
});

test("isStaleNote: customer-facing summary lines pass through", () => {
  assert.equal(isStaleNote("Confirmed by SAM.gov listing posted 2026-01-28."), false);
  assert.equal(isStaleNote("Award value of $390M is contextual; not directly tied to this requirement."), false);
  assert.equal(isStaleNote("Corrected from earlier research: the SAM notice is live and viewable."), false);
});

test("isStaleNote: non-string and empty inputs are stripped", () => {
  assert.equal(isStaleNote(""), true);
  assert.equal(isStaleNote("   "), true);
  assert.equal(isStaleNote(null), true);
  assert.equal(isStaleNote(undefined), true);
  assert.equal(isStaleNote(42), true);
  assert.equal(isStaleNote({ note: "x" }), true);
});

test("sanitizeNotes: removes mixed bad + keeps good", () => {
  const input = [
    "I could not verify the notice directly in SAM.gov.",
    "Confirmed by SAM.gov listing posted 2026-01-28.",
    "CONTRADICTED: claim X — what evidence shows Y.",
    "Award value of $390M is contextual; not directly tied to this requirement.",
    "  ",
    "Corrected from earlier research: the SAM notice is live and viewable.",
  ];
  const out = sanitizeNotes(input);
  assert.deepEqual(out, [
    "Confirmed by SAM.gov listing posted 2026-01-28.",
    "Award value of $390M is contextual; not directly tied to this requirement.",
    "Corrected from earlier research: the SAM notice is live and viewable.",
  ]);
});

test("sanitizeNotes: non-array input returns []", () => {
  assert.deepEqual(sanitizeNotes(null), []);
  assert.deepEqual(sanitizeNotes(undefined), []);
  assert.deepEqual(sanitizeNotes("a single string"), []);
  assert.deepEqual(sanitizeNotes({ notes: [] }), []);
});

test("sanitizeNotes: does not mutate input", () => {
  const input = ["I could not verify it.", "Confirmed by SAM.gov."];
  const before = JSON.stringify(input);
  sanitizeNotes(input);
  assert.equal(JSON.stringify(input), before);
});

test("hasStaleNotes: true when any line matches", () => {
  assert.equal(hasStaleNotes(["Clean line.", "I could not verify."]), true);
  assert.equal(hasStaleNotes(["Clean line.", "Another clean line."]), false);
  assert.equal(hasStaleNotes([]), false);
  assert.equal(hasStaleNotes(null), false);
});

test("strippedNotes: returns the lines that would be removed", () => {
  const input = [
    "Confirmed by SAM.gov listing posted 2026-01-28.",
    "I could not verify the notice directly in SAM.gov.",
    "CONTRADICTED: claim X — what evidence shows Y.",
  ];
  const stripped = strippedNotes(input);
  assert.deepEqual(stripped, [
    "I could not verify the notice directly in SAM.gov.",
    "CONTRADICTED: claim X — what evidence shows Y.",
  ]);
});

test("Exports: STALE_NOTE_PATTERNS and CONTRADICTED_PREFIX are regex", () => {
  assert.ok(Array.isArray(STALE_NOTE_PATTERNS));
  STALE_NOTE_PATTERNS.forEach((re) => assert.ok(re instanceof RegExp));
  assert.ok(CONTRADICTED_PREFIX instanceof RegExp);
});

test("Regression: Danielle's exact reported strings are stripped", () => {
  // Pulled verbatim from the May 26 CGI complaint thread.
  const reported = [
    'I could not verify the notice directly in SAM.gov Contract Opportunities from the provided results, so the exact current status remains partially unconfirmed.',
    'The best available open-source evidence shows the market notice was issued 2026-01-28 with a response deadline of 2026-02-12... but I could not verify the notice directly in SAM.gov.',
    'CONTRADICTED: "I could not verify the notice directly in SAM.gov Contract Opportunities from the provided results, so the exact current status remains partially unconfirmed." — The Health Services DevSecOps notice is directly available and viewable in SAM.gov.',
    'The prior statement that the SAM.gov notice could not be verified is out of date; the opportunity is clearly visible and should be treated as the primary authoritative source for this requirement\'s pre-award status.',
  ];
  reported.forEach((note) => {
    assert.equal(isStaleNote(note), true, `should strip: ${note.slice(0, 80)}...`);
  });
  assert.deepEqual(sanitizeNotes(reported), []);
});
