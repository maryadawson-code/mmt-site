// ============================================================
// registry.js — static id -> module map for loop step/eval functions.
//
// The runner resolves a spec's `step.fn` / `eval.fn` string (e.g.
// "fetchers/sam_gov") through this table. We use STATIC requires on
// purpose: Netlify's esbuild bundler follows static requires, so every
// referenced module is included in the loop-runner function bundle.
// A dynamic require(variablePath) would silently drop modules from the
// bundle and fail at runtime in production.
//
// Every module exports `{ run(ctx, config) }`.
//   - step modules return a value stored at ctx.data[step.id]
//   - eval modules return { passed, score, threshold, details, drift? }
// ============================================================

const REGISTRY = {
  // --- L1: opportunity_discovery ---
  "fetchers/sam_gov": require("./fetchers/sam_gov"),
  "transforms/dedupe": require("./transforms/dedupe"),
  "enrichers/usaspending_incumbents": require("./enrichers/usaspending_incumbents"),
  "scorers/pursuit_score": require("./scorers/pursuit_score"),
  "publishers/opportunity_upsert": require("./publishers/opportunity_upsert"),
  "evals/freshness": require("./evals/freshness"),
  "evals/score_sanity": require("./evals/score_sanity"),
  "evals/scan_pii": require("./evals/scan_pii"),
  "evals/dup_rate": require("./evals/dup_rate"),

  // --- L3: contract_tracker_freshness ---
  "fetchers/api_health": require("./fetchers/api_health"),
  "publishers/status_snapshot": require("./publishers/status_snapshot"),
  "evals/lag_thresholds": require("./evals/lag_thresholds"),

  // --- contract_intel_freshness (intel-coverage watchdog) ---
  "fetchers/contract_intel_coverage": require("./fetchers/contract_intel_coverage"),
  "publishers/intel_coverage_snapshot": require("./publishers/intel_coverage_snapshot"),
  "evals/intel_coverage": require("./evals/intel_coverage"),

  // NOTE: L4 (agency drift) is intentionally NOT a loop. The existing
  // netlify/functions/org-chart-monitor.js already hashes the canonical
  // agency leadership pages and emails Mary on change (weekly, no
  // auto-edit). A second drift loop would just double-notify. The future
  // enhancement is to port org-chart-monitor INTO this framework and add
  // budget-delta tracking — not to run two parallel change-detectors.
};

function resolve(fnId) {
  const mod = REGISTRY[fnId];
  if (!mod || typeof mod.run !== "function") {
    throw new Error(`loop registry: no module with a run() for "${fnId}"`);
  }
  return mod.run;
}

module.exports = { REGISTRY, resolve };
