// ============================================================
// lib/run-budget.js — time-box the items of a background loop so the loop
// always reaches its completion log.
//
// Netlify background functions are hard-killed at 15 minutes with no
// exception and no log line. contract-intel-refresh-background checked a
// 13-minute budget between contracts, but one contract is two Perplexity
// calls of up to 120 s each, three attempts apiece: a slow upstream makes a
// single contract run twelve minutes, the check never fires, the platform
// kills the worker, and the Friday report reads "last ran 10 days ago" with
// nothing in the ledger (2026-11-17 to 2026-11-27). The fix is to give each
// item its own deadline that ends before the wall, and to stop the loop
// when what is left cannot hold a useful item.
// ============================================================

const DEFAULTS = Object.freeze({
  hardWallMs: 14 * 60 * 1000 + 30 * 1000, // 30 s inside the 15-minute kill
  perItemMaxMs: 4 * 60 * 1000,
  minItemMs: 90 * 1000,
});

/**
 * Pure. Decide whether the next item may start and how long it gets.
 * @param {number} elapsedMs  since the run started
 * @param {object} [opts]     hardWallMs, perItemMaxMs, minItemMs
 * @returns {{ stop: boolean, allowMs: number, remainingMs: number }}
 */
function planSlot(elapsedMs, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const remainingMs = Math.max(0, cfg.hardWallMs - Math.max(0, Number(elapsedMs) || 0));
  if (remainingMs < cfg.minItemMs) return { stop: true, allowMs: 0, remainingMs };
  return { stop: false, allowMs: Math.min(cfg.perItemMaxMs, remainingMs), remainingMs };
}

/**
 * Run `fn(signal)` with an AbortSignal that fires after allowMs. The
 * promise rejects with a DeadlineError when the signal fires first, so a
 * caller's catch counts the item as failed and moves on.
 */
async function withDeadline(allowMs, fn, { label = "item" } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DeadlineError(`${label} exceeded its ${allowMs} ms time-box`)), allowMs);
  try {
    return await Promise.race([
      fn(ac.signal),
      new Promise((_, reject) => ac.signal.addEventListener("abort", () => reject(ac.signal.reason), { once: true })),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class DeadlineError extends Error {
  constructor(message) { super(message); this.name = "DeadlineError"; this.code = "DEADLINE"; }
}

module.exports = { DEFAULTS, planSlot, withDeadline, DeadlineError };
