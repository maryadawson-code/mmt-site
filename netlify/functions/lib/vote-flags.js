// ============================================================
// vote-flags.js — Supabase `feature_flags` reader for the autonomous
// feature-vote system.
//
// DISTINCT from lib/feature-flags.js (env-var product flags for
// MarketPulse / Pursuit Score / premium tools). This module reads the
// Supabase `feature_flags` table written by feature-vote-tally.js and
// feature-roadmap-release.js. Each row: { key, enabled, activated_at,
// source }. build.js calls getEnabledFlags() at build start and gates
// each vote-feature's markup/JS include on membership in the returned
// Set. Flag OFF (or any read failure) → feature emits NOTHING.
// ============================================================

// The 10 vote features, namespaced per FEATURE_VOTE_SYSTEM_SPEC.md §2.
// Order is the canonical A–J letter order used by the tally.
const VOTE_FEATURE_KEYS = [
  "vote_feature.vendor_watch", // A
  "vote_feature.teaming_signals", // B
  "vote_feature.tracker_filters", // C
  "vote_feature.csv_export", // D
  "vote_feature.tracker_api", // E
  "vote_feature.custom_watchlists", // F
  "vote_feature.recompete_alerts", // G
  "vote_feature.teaming_finder", // H
  "vote_feature.recompete_timeline", // I
  "vote_feature.proposalpulse_tiein", // J
];

// Letter (A–J) → flag key, for the tally's ranking output.
const LETTER_TO_KEY = VOTE_FEATURE_KEYS.reduce((acc, key, i) => {
  acc[String.fromCharCode(65 + i)] = key;
  return acc;
}, {});

/**
 * Read enabled vote-feature flags from Supabase.
 * Fails closed: any error returns an empty Set so dormant stays dormant.
 *
 * @param {object} supabase  @supabase/supabase-js client (or null)
 * @returns {Promise<Set<string>>} set of enabled flag keys
 */
async function getEnabledFlags(supabase) {
  const enabled = new Set();
  if (!supabase) return enabled;
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("key, enabled");
    if (error) {
      console.warn(`[vote-flags] read warning: ${error.message}`);
      return enabled;
    }
    for (const row of data || []) {
      if (row && row.enabled) enabled.add(row.key);
    }
  } catch (err) {
    console.warn(`[vote-flags] read failed: ${err && err.message}`);
  }
  return enabled;
}

/**
 * Runtime check for a single flag — used by Netlify functions (the API
 * endpoint, the alert cron) to stay dormant until the roadmap-release
 * scheduler flips their flag live. Fails closed (false) on any error.
 *
 * @param {object} supabase  client (or null)
 * @param {string} key       e.g. "vote_feature.tracker_api"
 * @returns {Promise<boolean>}
 */
async function isFlagEnabled(supabase, key) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    if (error) return false;
    return !!(data && data.enabled);
  } catch {
    return false;
  }
}

/**
 * Global autopilot kill switch. VOTE_AUTOPILOT=off halts all autonomous
 * activation + roadmap releases + alert sends. Default on.
 */
function autopilotOn() {
  return String(process.env.VOTE_AUTOPILOT || "on").toLowerCase() !== "off";
}

module.exports = { getEnabledFlags, isFlagEnabled, autopilotOn, VOTE_FEATURE_KEYS, LETTER_TO_KEY };
