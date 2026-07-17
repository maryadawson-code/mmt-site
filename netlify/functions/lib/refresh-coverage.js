// ============================================================
// refresh-coverage.js — self-observing coverage math for the
// contract-intel refresh loop.
//
// WHY THIS EXISTS (the "durable loop" / Orchestrator idea, applied):
// contract-intel-refresh-background.js is already a resumable loop —
// last_updated is its persisted checkpoint and it processes the roster
// STALEST-FIRST, so every run picks up exactly the rows the previous
// (budget-killed) run didn't reach. That self-heals as long as the
// loop's throughput keeps pace with the roster. The ONE failure mode
// the stalest-first ordering does NOT prevent is the roster GROWING
// faster than a 13-min budget can cycle it: rows then age past their
// SLA and the only detector today is the WEEKLY intel-quality-report —
// a lagging indicator by up to 7 days.
//
// computeCoverage() turns that into a PER-RUN leading indicator: the
// loop measures how much of its own roster is fresh and whether the
// oldest row has drifted past the SLA, so "the loop is falling behind"
// surfaces the same day, in the ops ledger, not a week later.
//
// Pure: no I/O, no Date.now() capture inside (caller passes `now`), so
// it is fully deterministic and unit-testable offline.
// ============================================================

const MS_PER_HOUR = 3_600_000;

// A refreshed row older than this is counted "stale" for coverage %.
const STALE_HOURS_DEFAULT = 48;
// The oldest *refreshed* row drifting past this ⇒ the loop is cycling
// too slowly (throughput < roster). 72h = three daily runs missed.
const BEHIND_HOURS_DEFAULT = 72;
// Fraction of the roster that may be never-refreshed before we call the
// loop "behind" on that signal alone. A couple of freshly-added
// contracts are EXPECTED to be never-refreshed for a run or two (they
// sort first and get picked up), so a single add must not trip the
// alarm — only a large untouched fraction means the budget genuinely
// can't get around the roster.
const NEVER_REFRESHED_FRACTION_DEFAULT = 0.15;

/**
 * Measure how well the stalest-first refresh loop is keeping up.
 *
 * @param {string[]} rosterNames   canonical contract names in the roster
 * @param {Map<string,string|null>} lastUpdatedMap  name -> last_updated ISO
 *        (or null/absent when the row has never been refreshed)
 * @param {object} [opts]
 * @param {number} [opts.now=Date.now()]  reference epoch ms
 * @param {number} [opts.staleHours=48]
 * @param {number} [opts.behindHours=72]
 * @param {number} [opts.neverRefreshedFraction=0.15]
 * @returns {{
 *   total:number, covered:number, staleCount:number, neverRefreshed:number,
 *   coveragePct:number, oldestHours:(number|null), staleHours:number,
 *   behindHours:number, behind:boolean, behindReason:(string|null)
 * }}
 */
function computeCoverage(rosterNames, lastUpdatedMap, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const staleHours = opts.staleHours ?? STALE_HOURS_DEFAULT;
  const behindHours = opts.behindHours ?? BEHIND_HOURS_DEFAULT;
  const neverFraction = opts.neverRefreshedFraction ?? NEVER_REFRESHED_FRACTION_DEFAULT;

  const names = Array.isArray(rosterNames) ? rosterNames : [];
  const map = lastUpdatedMap instanceof Map ? lastUpdatedMap : new Map();

  const total = names.length;
  let neverRefreshed = 0;
  let staleCount = 0;
  let maxFiniteAge = 0;

  for (const name of names) {
    const lu = map.get(name);
    const t = lu ? new Date(lu).getTime() : NaN;
    if (!Number.isFinite(t)) {
      // never refreshed (or an unparseable timestamp) — counts as stale
      neverRefreshed++;
      staleCount++;
      continue;
    }
    const age = (now - t) / MS_PER_HOUR;
    if (age > staleHours) staleCount++;
    if (age > maxFiniteAge) maxFiniteAge = age;
  }

  const coveragePct = total ? Math.round(((total - staleCount) / total) * 100) : 100;

  // "Behind" = the loop cannot keep the roster inside SLA. Two signals:
  //   1. the oldest row that HAS been refreshed drifted past behindHours
  //      (throughput < roster even for rows it already reached), or
  //   2. a large fraction of the roster has NEVER been refreshed (the
  //      budget can't even get around to the never-seen rows). A lone
  //      new add stays under the fraction and does not trip this.
  let behind = false;
  let behindReason = null;
  if (total > 0 && maxFiniteAge > behindHours) {
    behind = true;
    behindReason = `oldest refreshed row is ${Math.round(maxFiniteAge)}h old (SLA ${behindHours}h)`;
  } else if (total > 0 && neverRefreshed / total > neverFraction) {
    behind = true;
    behindReason = `${neverRefreshed}/${total} contracts never refreshed (> ${Math.round(neverFraction * 100)}% of roster)`;
  }

  return {
    total,
    covered: total - staleCount,
    staleCount,
    neverRefreshed,
    coveragePct,
    oldestHours: neverRefreshed > 0 ? null : Math.round(maxFiniteAge),
    staleHours,
    behindHours,
    behind,
    behindReason,
  };
}

module.exports = {
  computeCoverage,
  STALE_HOURS_DEFAULT,
  BEHIND_HOURS_DEFAULT,
  NEVER_REFRESHED_FRACTION_DEFAULT,
};
