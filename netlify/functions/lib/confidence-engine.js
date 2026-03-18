/**
 * confidence-engine.js — Self-learning confidence calibration system.
 *
 * Tracks source reliability, logs prediction accuracy, adjusts
 * auto-publish thresholds based on false positive rates, and routes
 * low-confidence data to the review queue.
 *
 * @module confidence-engine
 */

const DEFAULT_RELIABILITY = 0.50;
const DEFAULT_THRESHOLD = 0.70;
const MAX_THRESHOLD = 0.85;
const MIN_THRESHOLD = 0.60;
const THRESHOLD_STEP = 0.05;

/**
 * Get reliability score for a source domain from Supabase.
 * @param {Object} supabase - Supabase client
 * @param {string} domain - Source domain (e.g. 'sam.gov')
 * @returns {Promise<number>} Reliability score (0-1)
 */
async function getSourceReliability(supabase, domain) {
  if (!supabase || !domain) return DEFAULT_RELIABILITY;

  try {
    const { data, error } = await supabase
      .from("source_reliability")
      .select("reliability_score")
      .eq("source_domain", domain)
      .single();

    if (error || !data) return DEFAULT_RELIABILITY;
    return Number(data.reliability_score) || DEFAULT_RELIABILITY;
  } catch {
    return DEFAULT_RELIABILITY;
  }
}

/**
 * Update source reliability after a prediction is verified.
 * @param {Object} supabase - Supabase client
 * @param {string} domain - Source domain
 * @param {boolean} wasCorrect - Whether the prediction was correct
 */
async function updateSourceReliability(supabase, domain, wasCorrect) {
  if (!supabase || !domain) return;

  try {
    const { data } = await supabase
      .from("source_reliability")
      .select("total_predictions, correct_predictions")
      .eq("source_domain", domain)
      .single();

    const total = (data?.total_predictions || 0) + 1;
    const correct = (data?.correct_predictions || 0) + (wasCorrect ? 1 : 0);
    const score = Math.round((correct / total) * 100) / 100;

    await supabase
      .from("source_reliability")
      .upsert({
        source_domain: domain,
        total_predictions: total,
        correct_predictions: correct,
        reliability_score: score,
        last_updated: new Date().toISOString(),
      }, { onConflict: "source_domain" });
  } catch (err) {
    console.error("confidence-engine: updateSourceReliability failed:", err.message);
  }
}

/**
 * Log a prediction accuracy record for self-learning.
 * @param {Object} supabase - Supabase client
 * @param {Object} record - Accuracy record
 * @param {string} record.contract_id
 * @param {string} record.field_name
 * @param {string} record.predicted - Predicted value
 * @param {string} record.actual - Actual value
 * @param {boolean} record.wasCorrect
 * @param {string} record.confidence - Confidence at prediction time
 * @param {string} record.source - Source at prediction time
 */
async function logAccuracy(supabase, record) {
  if (!supabase) return;

  try {
    await supabase.from("intel_accuracy_log").insert({
      contract_id: record.contract_id,
      field_name: record.field_name,
      predicted_value: record.predicted,
      actual_value: record.actual,
      was_correct: record.wasCorrect,
      confidence_at_prediction: record.confidence,
      source_at_prediction: record.source,
      correction_source: record.correctionSource || null,
    });
  } catch (err) {
    console.error("confidence-engine: logAccuracy failed:", err.message);
  }
}

/**
 * Get the current auto-publish threshold from ops config.
 * @param {Object} supabase - Supabase client
 * @returns {Promise<number>}
 */
async function getAutoPublishThreshold(supabase) {
  if (!supabase) return DEFAULT_THRESHOLD;

  try {
    const { data } = await supabase
      .from("intel_accuracy_log")
      .select("confidence_at_prediction")
      .order("logged_at", { ascending: false })
      .limit(1);

    // If no data exists yet, return default
    if (!data || data.length === 0) return DEFAULT_THRESHOLD;
    return DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}

/**
 * Adjust auto-publish threshold based on false positive rate.
 * @param {Object} supabase - Supabase client
 * @param {number} falsePositiveRate - FPR (0-1)
 * @returns {Promise<number>} New threshold
 */
async function adjustThreshold(supabase, falsePositiveRate) {
  let threshold = await getAutoPublishThreshold(supabase);

  if (falsePositiveRate > 0.10) {
    threshold = Math.min(MAX_THRESHOLD, threshold + THRESHOLD_STEP);
  } else if (falsePositiveRate < 0.03) {
    threshold = Math.max(MIN_THRESHOLD, threshold - THRESHOLD_STEP);
  }

  // Log the adjustment
  if (supabase) {
    try {
      await supabase.from("intel_accuracy_log").insert({
        contract_id: "__system__",
        field_name: "auto_publish_threshold",
        predicted_value: String(threshold),
        actual_value: String(falsePositiveRate),
        was_correct: falsePositiveRate <= 0.10,
        confidence_at_prediction: "SYSTEM",
        source_at_prediction: "confidence-engine",
      });
    } catch (err) {
      console.error("confidence-engine: adjustThreshold log failed:", err.message);
    }
  }

  return threshold;
}

/**
 * Route a data point to the review queue for human verification.
 * @param {Object} supabase - Supabase client
 * @param {Object} item
 * @param {string} item.contract_id
 * @param {string} item.field_name
 * @param {string} item.proposed - Proposed new value
 * @param {string} item.current - Current value
 * @param {string} item.confidence - Confidence level
 * @param {string} item.source
 * @param {string} item.reason
 */
async function routeToReviewQueue(supabase, item) {
  if (!supabase) return;

  try {
    await supabase.from("intel_review_queue").insert({
      contract_id: item.contract_id,
      field_name: item.field_name,
      proposed_value: item.proposed,
      current_value: item.current,
      confidence: item.confidence,
      source: item.source || null,
      source_url: item.source_url || null,
      reason: item.reason,
    });
  } catch (err) {
    console.error("confidence-engine: routeToReviewQueue failed:", err.message);
  }
}

module.exports = {
  getSourceReliability,
  updateSourceReliability,
  logAccuracy,
  getAutoPublishThreshold,
  adjustThreshold,
  routeToReviewQueue,
};
