// ============================================================
// evals/dup_rate.js
//
// A runaway fetcher (same solicitation pulled many times, or a paging
// bug) shows up as a high duplicate ratio. Gate the publish on it so a
// fetcher loop never floods the staged table.
// ============================================================

async function run(ctx, config) {
  const maxDup = config.max_dup_rate ?? 0.4;
  const d = ctx.data.dedupe || {};
  const dupRate = Number(d.dupRate || 0);
  return {
    passed: dupRate <= maxDup,
    score: Number(dupRate.toFixed(3)),
    threshold: maxDup,
    details: { raw: d.rawCount || 0, unique: d.uniqueCount || 0, dup_rate: Number(dupRate.toFixed(3)) },
  };
}

module.exports = { run };
