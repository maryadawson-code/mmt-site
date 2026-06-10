// ============================================================
// transforms/dedupe.js (L1 step "dedupe")
//
// Collapses SAM rows by notice_id (a single solicitation can match more
// than one query), keeps the most-recently-posted instance, computes the
// duplicate rate (the dup_rate eval gates on this — a runaway fetcher
// loop shows up as a high dup rate), and sets ctx.inputHash for run-row
// idempotency.
// ============================================================

const { sha256 } = require("../util");

async function run(ctx) {
  const raw = (ctx.data.fetch && ctx.data.fetch.items) || [];
  const byId = new Map();

  for (const it of raw) {
    const id = it.notice_id || `${it.solicitation_number || it.title}`;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, it);
      continue;
    }
    const a = new Date(it.posted_date || 0).getTime();
    const b = new Date(existing.posted_date || 0).getTime();
    if (a >= b) byId.set(id, it);
  }

  const items = [...byId.values()];
  const rawCount = raw.length;
  const uniqueCount = items.length;
  const dupRate = rawCount > 0 ? (rawCount - uniqueCount) / rawCount : 0;

  // Idempotency key for this run: the sorted set of notice ids.
  ctx.inputHash = sha256(items.map((i) => i.notice_id).sort());

  return { items, rawCount, uniqueCount, dupRate };
}

module.exports = { run };
