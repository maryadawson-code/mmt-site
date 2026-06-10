// ============================================================
// util.js — small shared helpers for loop modules.
// No side effects, no network, fully unit-testable.
// ============================================================

const crypto = require("crypto");

// Bounded-concurrency map. Keeps heavy fan-out (e.g. pursuit scoring,
// which itself fans out to ~5 upstream APIs per item) from stampeding
// the upstreams or blowing the function timeout.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length)))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx], idx);
      }
    });
  await Promise.all(workers);
  return results;
}

function sha256(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return crypto.createHash("sha256").update(s).digest("hex");
}

function hoursSince(dateLike) {
  if (!dateLike) return Infinity;
  const t = new Date(dateLike).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 3_600_000;
}

function mean(nums) {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(nums) {
  const xs = nums.filter((n) => Number.isFinite(n));
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

module.exports = { mapLimit, sha256, hoursSince, mean, stdev };
