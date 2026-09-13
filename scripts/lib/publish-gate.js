// Publish-date gate shared by build.js.
//
// One clock for every date-gated file: America/New_York. build.js holds a
// future-dated newsletter article and a future-dated Capture Corner brief
// until their date arrives, and both must read the SAME clock. Until
// 2026-09-13 the article gate compared Date.now() against the frontmatter
// date parsed as UTC midnight, while the brief gate compared the filename
// date against todayET(). An issue staged ahead of its date therefore went
// live in two halves: the public article at 00:00 UTC (8 PM Eastern the
// evening before, in EDT) and the companion brief four hours later, with
// /capture-corner/latest 302ing to a 404 in between. This helper is the
// article gate's compare; it is pure so the rule can be unit-tested with
// pinned dates instead of the real clock.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Returns "YYYY-MM-DD" for `at` (default: now) in America/New_York.
function todayET(at = new Date()) {
  return at.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// True when `isoDate` (YYYY-MM-DD) is later than `todayEt` (YYYY-MM-DD).
// A missing or malformed publish date is never held: an undated article is
// treated as already published, which is what build.js did before this
// helper existed (it only ever held dates it could parse).
function isFutureDated(isoDate, todayEt) {
  if (typeof isoDate !== "string" || !ISO_DAY.test(isoDate)) return false;
  if (typeof todayEt !== "string" || !ISO_DAY.test(todayEt)) {
    throw new Error(`isFutureDated: todayEt must be YYYY-MM-DD, got ${JSON.stringify(todayEt)}`);
  }
  return isoDate > todayEt;
}

module.exports = { isFutureDated, todayET };
