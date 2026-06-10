// ============================================================
// evals/freshness.js
//
// Gate: the data this run produced must be fresh. Passes if the newest
// posted opportunity is within max_age_hours. An empty batch passes
// vacuously (a quiet news day is not a failure) but is reported in
// details so a sustained run of zeros is visible in the eval history.
// ============================================================

const { hoursSince } = require("../util");

async function run(ctx, config) {
  const maxAge = config.max_age_hours || 72;
  const items = (ctx.data.dedupe && ctx.data.dedupe.items) || [];
  const fetchErrors = (ctx.data.fetch && ctx.data.fetch.errors) || [];

  if (!items.length) {
    return {
      passed: true,
      score: null,
      threshold: maxAge,
      details: { count: 0, note: "no opportunities returned this run", fetch_errors: fetchErrors.length },
    };
  }

  const ages = items.map((i) => hoursSince(i.posted_date));
  const newest = Math.min(...ages);
  return {
    passed: newest <= maxAge,
    score: Number(newest.toFixed(1)),
    threshold: maxAge,
    details: { count: items.length, newest_hours: Number(newest.toFixed(1)), fetch_errors: fetchErrors.length },
  };
}

module.exports = { run };
