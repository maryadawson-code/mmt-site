// ============================================================
// radar-normalize.js — safe coercion for model-returned radar fields
//
// The radar scans (opportunity-radar-background, ebuy-open-radar-
// background) normalize JSON returned by a web-search LLM. That JSON's
// field TYPES are not guaranteed: a solicitation number can come back
// as a bare number (1810815 instead of "RFQ1810815"), value_estimate as
// 2500000, etc. Calling .toLowerCase()/.substring() directly on such a
// field throws a TypeError that aborts the whole scan (the 2026-09-07
// EBUY_SCAN_FAILED). Route every model-returned field through toStr()
// before any string method.
// ============================================================

/**
 * Coerce any model-returned value to a string without ever throwing.
 * null/undefined become ""; numbers/booleans stringify; objects/arrays
 * JSON-stringify (honest, bounded by maxLen). Never returns non-string.
 *
 * @param {*} value - Field from parsed LLM JSON (any type)
 * @param {number} [maxLen] - Optional cap, applied via substring
 * @returns {string}
 */
function toStr(value, maxLen) {
  let s;
  if (value == null) {
    s = "";
  } else if (typeof value === "string") {
    s = value;
  } else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    s = String(value);
  } else {
    try {
      s = JSON.stringify(value);
    } catch {
      s = "";
    }
    if (typeof s !== "string") s = "";
  }
  return typeof maxLen === "number" ? s.substring(0, maxLen) : s;
}

/**
 * Lowercased dedupe key for a radar opportunity: solicitation_number
 * first, title as fallback. Returns null when neither yields text.
 *
 * @param {Object} opp - Raw opportunity from parsed LLM JSON
 * @returns {string|null}
 */
function dedupeKey(opp) {
  if (!opp || typeof opp !== "object") return null;
  const key = toStr(opp.solicitation_number).trim() || toStr(opp.title).trim();
  return key ? key.toLowerCase() : null;
}

module.exports = { toStr, dedupeKey };
