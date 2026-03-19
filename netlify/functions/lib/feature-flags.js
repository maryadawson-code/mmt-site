// ============================================================
// feature-flags.js — Env-var-based feature flags for rollback
//
// Reads from Netlify env vars with sensible defaults.
// Single entry point for all feature flag checks.
// ============================================================

const FLAG_DEFAULTS = {
  FEATURE_PDF_RENDERER: "html",
  FEATURE_PWIN_MODEL: "weighted",
  FEATURE_ENTITY_GUARD: "on",
  FEATURE_COMPLIANCE_MAPPING: "on",
  FEATURE_CIRCUIT_BREAKERS: "on",
};

let _logged = false;

/**
 * Get a feature flag value.
 * @param {string} name - Flag name (e.g., "FEATURE_PDF_RENDERER")
 * @returns {string} Current value
 */
function getFlag(name) {
  const value = process.env[name] || FLAG_DEFAULTS[name] || "on";

  if (!_logged) {
    _logged = true;
    console.log("[feature-flags] Flags:", JSON.stringify(getAllFlags()));
  }

  return value;
}

/**
 * Get all feature flag values.
 * @returns {Object} { flag: value }
 */
function getAllFlags() {
  const flags = {};
  for (const [name, defaultVal] of Object.entries(FLAG_DEFAULTS)) {
    flags[name] = process.env[name] || defaultVal;
  }
  return flags;
}

module.exports = { getFlag, getAllFlags, FLAG_DEFAULTS };
