// ============================================================
// evals/score_sanity.js
//
// Catches a stuck/degenerate scorer: a healthy batch should have a mean
// in a plausible band and enough spread (stdev) that it isn't returning
// one constant. With too few items to judge a distribution, it passes
// with a note rather than firing a false alarm.
// ============================================================

const { mean, stdev } = require("../util");

async function run(ctx, config) {
  const minMean = config.min_mean ?? 25;
  const maxMean = config.max_mean ?? 85;
  const minStdev = config.min_stdev ?? 6;
  const minItems = config.min_items ?? 4;

  const scores = ((ctx.data.score && ctx.data.score.scores) || []).filter((n) => Number.isFinite(n));

  if (scores.length < minItems) {
    return {
      passed: true,
      score: scores.length ? Number(mean(scores).toFixed(1)) : null,
      threshold: null,
      details: { count: scores.length, note: `fewer than ${minItems} items — distribution not judged` },
    };
  }

  const m = mean(scores);
  const sd = stdev(scores);
  const passed = m >= minMean && m <= maxMean && sd >= minStdev;
  return {
    passed,
    score: Number(m.toFixed(1)),
    threshold: maxMean,
    details: {
      count: scores.length,
      mean: Number(m.toFixed(1)),
      stdev: Number(sd.toFixed(1)),
      min_mean: minMean,
      max_mean: maxMean,
      min_stdev: minStdev,
    },
  };
}

module.exports = { run };
