// ============================================================
// fetchers/contract_intel_coverage.js (contract_intel_freshness step "coverage")
//
// Reads the contract_intel table + the refresh roster (contracts.json)
// and computes coverage with the SAME pure computeCoverage() the nightly
// refresh uses inline. The point of doing it here, in the loop framework,
// is that this observes the refresh from the OUTSIDE:
//
//   - The inline coverage guard in contract-intel-refresh-background.js
//     only fires WHEN the refresh runs. A dead/disabled cron logs nothing,
//     so "the refresh stopped entirely" is invisible to it.
//   - This loop runs on its own cron. It measures the same coverage AND a
//     liveness signal (age of the newest contract_intel row anywhere): if
//     the refresh cron has stalled, every row ages and newestRowAgeHours
//     climbs past the expected daily gap — caught here within one loop tick.
//
// No LLM, no external API — one Supabase read. Pure logic lives in
// lib/refresh-coverage.js (unit-tested); this is just the I/O shell.
// ============================================================

const { getRefreshRoster } = require("../../refresh-roster");
const { computeCoverage } = require("../../refresh-coverage");
const { hoursSince } = require("../util");

async function run(ctx, config) {
  const roster = getRefreshRoster();
  const names = roster.map((c) => c.name);

  let rows = [];
  if (ctx.supabase) {
    try {
      const { data, error } = await ctx.supabase
        .from("contract_intel")
        .select("contract_name, last_updated");
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      // Table unreadable (e.g. pre-migration). Treat as "no data": coverage
      // math then reports every roster row as never-refreshed, which the
      // eval surfaces as drift rather than crashing the loop.
      ctx.log?.warn?.(`contract_intel_coverage: read failed (${e.message})`);
      rows = [];
    }
  }

  const lastUpdatedMap = new Map(rows.map((r) => [r.contract_name, r.last_updated || null]));
  const coverage = computeCoverage(names, lastUpdatedMap, {
    staleHours: config.stale_hours,
    behindHours: config.behind_hours,
    neverRefreshedFraction: config.never_refreshed_fraction,
  });

  // Liveness: hours since the MOST RECENT contract_intel write anywhere.
  // Small = the refresh ran recently; large = the whole pipeline has stalled.
  // null when the table is empty/unreadable (can't distinguish stalled from
  // never-populated, so we don't guess).
  let newestRowAgeHours = null;
  for (const r of rows) {
    const h = hoursSince(r.last_updated);
    if (Number.isFinite(h) && (newestRowAgeHours == null || h < newestRowAgeHours)) {
      newestRowAgeHours = Number(h.toFixed(1));
    }
  }
  const maxRefreshGapHours = config.max_refresh_gap_hours ?? 26; // daily cron + margin
  const refreshStalled = newestRowAgeHours != null && newestRowAgeHours > maxRefreshGapHours;

  return { coverage, newestRowAgeHours, refreshStalled, maxRefreshGapHours, rosterTotal: names.length };
}

module.exports = { run };
