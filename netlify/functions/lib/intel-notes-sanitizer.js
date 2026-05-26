// ============================================================
// intel-notes-sanitizer.js — single source of truth for what is
// allowed to appear in customer-facing intel.verification_notes.
//
// Background (2026-05-26): CGI Federal subscriber Danielle Applegate
// flagged that the May 26 MMT Digest surfaced a contract_intel row
// (VA Health Services DevSecOps) whose verification_notes carried
// Claude's chain-of-thought reasoning — Pass 1 said "I could not
// verify the notice from the provided results" and Pass 2 said
// "the prior statement is out of date; the opportunity is clearly
// visible." Both ended up rendered side by side in front of a paid
// subscriber.
//
// The verification_notes field is customer-facing. It is the
// SUMMARY of what the verification pass found — not the reasoning
// trace. This module enforces that boundary at every entry point:
//   1. contract-intel-refresh-background.js writes through sanitizeNotes
//      before persisting to Supabase.
//   2. intel-quality-report.js scans existing rows and alerts when
//      stale-pattern notes slip through (regression detector).
//   3. js/contract-detail.js applies an equivalent regex at render
//      time as a final safety net for rows persisted before this
//      module landed. Keep the client-side regex in sync with
//      STALE_NOTE_PATTERNS below.
//
// Hard rule: if a future refactor adds a new entry point that writes
// to intel.verification_notes, it MUST go through sanitizeNotes.
// tests/unit/intel-notes-sanitizer.test.js asserts this contract.
// ============================================================

// Lines containing any of these phrases are LLM reasoning trace, not
// customer-facing intelligence. Stripped before persistence and at
// render time. Patterns are case-insensitive whole-word matches.
const STALE_NOTE_PATTERNS = [
  /\bcould not verify\b/i,
  /\bout of date\b/i,
  /\bprior statement\b/i,
  /\bpartially unconfirmed\b/i,
  /\bfrom the provided results\b/i,
  /\bI could not\b/i,
  /\bI was unable\b/i,
  /\bin the provided results\b/i,
];

// Internal contradiction marker that used to be prefixed by the
// verification merge. Replaced with the subscriber-safe "Corrected
// from earlier research:" phrasing in the persistence layer; this
// pattern catches any legacy rows that still carry the old tag.
const CONTRADICTED_PREFIX = /^CONTRADICTED:/i;

/**
 * Returns true if a single string note should be stripped before render.
 * @param {string} note
 * @returns {boolean}
 */
function isStaleNote(note) {
  if (typeof note !== "string") return true;
  if (!note.trim()) return true;
  if (CONTRADICTED_PREFIX.test(note)) return true;
  return STALE_NOTE_PATTERNS.some((re) => re.test(note));
}

/**
 * Filter the chain-of-thought / contradiction-trace lines out of a
 * verification_notes array. Returns a new array; never mutates input.
 * @param {unknown} notes
 * @returns {string[]}
 */
function sanitizeNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.filter((n) => !isStaleNote(n));
}

/**
 * Returns true if any note in the array matches a stale pattern. Used
 * by intel-quality-report.js to alert when rows in the live DB carry
 * chain-of-thought leakage even though the persistence layer should
 * be filtering it.
 * @param {unknown} notes
 * @returns {boolean}
 */
function hasStaleNotes(notes) {
  if (!Array.isArray(notes)) return false;
  return notes.some((n) => isStaleNote(n));
}

/**
 * Returns the list of stripped notes — used for ops_events logging
 * when the sanitizer fires in production so we can see what the LLM
 * tried to push through.
 * @param {unknown} notes
 * @returns {string[]}
 */
function strippedNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.filter((n) => isStaleNote(n));
}

module.exports = {
  STALE_NOTE_PATTERNS,
  CONTRADICTED_PREFIX,
  isStaleNote,
  sanitizeNotes,
  hasStaleNotes,
  strippedNotes,
};
