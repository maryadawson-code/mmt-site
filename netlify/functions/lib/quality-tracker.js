// ============================================================
// quality-tracker.js — Quality metrics tracking and drift detection
//
// Tracks per-product quality scores over time. Detects drift by
// comparing recent (7-day) vs baseline (30-day) averages.
// ============================================================

/**
 * Track a quality measurement.
 *
 * @param {Object} supabase
 * @param {Object} data
 * @param {string} data.product - "proposalpulse" | "marketpulse"
 * @param {string} [data.orderId]
 * @param {string} [data.grade] - Letter grade (A, B+, etc.)
 * @param {number} [data.score] - Numeric score
 * @param {Object} [data.factors] - Breakdown factors
 */
async function trackQuality(supabase, { product, orderId, grade, score, factors = {} }) {
  if (!supabase) return;

  try {
    await supabase.from("quality_metrics").insert({
      product,
      order_id: orderId || null,
      grade: grade || null,
      score: score != null ? score : null,
      factors,
    });
  } catch (err) {
    console.error("quality-tracker: failed to track:", err.message);
  }
}

/**
 * Get quality trend over time windows.
 *
 * @param {Object} supabase
 * @param {Object} opts
 * @param {string} opts.product
 * @param {number} [opts.days=30]
 * @returns {Promise<{avg_7d: number|null, avg_30d: number|null, count_7d: number, count_30d: number, fail_rate_7d: number, fail_rate_30d: number}>}
 */
async function getQualityTrend(supabase, { product, days = 30 }) {
  if (!supabase) return null;

  try {
    const since30d = new Date(Date.now() - days * 86400000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86400000).toISOString();

    const { data: all30d } = await supabase
      .from("quality_metrics")
      .select("score, grade, created_at")
      .eq("product", product)
      .gte("created_at", since30d)
      .order("created_at", { ascending: false });

    if (!all30d || all30d.length === 0) {
      return { avg_7d: null, avg_30d: null, count_7d: 0, count_30d: 0, fail_rate_7d: 0, fail_rate_30d: 0 };
    }

    const recent7d = all30d.filter(r => r.created_at >= since7d);

    const avg = (arr) => {
      const scored = arr.filter(r => r.score != null);
      return scored.length > 0 ? scored.reduce((s, r) => s + Number(r.score), 0) / scored.length : null;
    };

    const failRate = (arr) => {
      if (arr.length === 0) return 0;
      const fails = arr.filter(r => r.grade === "FAIL" || r.grade === "F" || r.grade === "D");
      return Math.round((fails.length / arr.length) * 100);
    };

    return {
      avg_7d: avg(recent7d),
      avg_30d: avg(all30d),
      count_7d: recent7d.length,
      count_30d: all30d.length,
      fail_rate_7d: failRate(recent7d),
      fail_rate_30d: failRate(all30d),
    };
  } catch (err) {
    console.error("quality-tracker: getQualityTrend failed:", err.message);
    return null;
  }
}

/**
 * Detect quality drift by comparing recent vs baseline.
 * Flags drift if avg drops >10 points or fail rate increases >20%.
 *
 * @param {Object} supabase
 * @param {Object} opts
 * @param {string} opts.product
 * @returns {Promise<{drifting: boolean, reason?: string, trend?: Object}>}
 */
async function detectDrift(supabase, { product }) {
  const trend = await getQualityTrend(supabase, { product });
  if (!trend || trend.count_30d < 5) {
    return { drifting: false, reason: "insufficient_data", trend };
  }

  const reasons = [];

  if (trend.avg_7d != null && trend.avg_30d != null) {
    const drop = trend.avg_30d - trend.avg_7d;
    if (drop > 10) {
      reasons.push(`Score dropped ${drop.toFixed(1)} points (30d avg: ${trend.avg_30d.toFixed(1)}, 7d avg: ${trend.avg_7d.toFixed(1)})`);
    }
  }

  const failRateIncrease = trend.fail_rate_7d - trend.fail_rate_30d;
  if (failRateIncrease > 20) {
    reasons.push(`Fail rate increased ${failRateIncrease}% (30d: ${trend.fail_rate_30d}%, 7d: ${trend.fail_rate_7d}%)`);
  }

  return {
    drifting: reasons.length > 0,
    reason: reasons.join("; ") || undefined,
    trend,
  };
}

module.exports = { trackQuality, getQualityTrend, detectDrift };
