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
  // v4 deep research loop (docs/marketpulse-v4-system-prompt.md). Default
  // "off" until validated on staging; flip to "on" to route through
  // v4 prompt + self-audit + decomposed research score + BLOCKED gate.
  MARKETPULSE_V4: "off",
  // Premium Tools v2 — Pursuit Score / Compliance Check / Signal Chain
  // rebuild using the shared intelligence core (docs/premium-tools-master-sprint.md).
  // Default "off"; flip to "on" to wrap legacy tool output in the v2 ToolEnvelope,
  // add subscriber profile gate, mode dispatcher, evidence panel, Monday Move.
  PREMIUM_TOOLS_V2: "off",
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
