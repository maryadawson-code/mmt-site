/**
 * contract-validator.js — Validation and confidence scoring engine.
 *
 * Validates contract, opportunity, and vehicle data before publication.
 * Applies stale pattern detection, known-fact overrides, and confidence
 * scoring with source reliability weighting.
 *
 * @module contract-validator
 */

const { KNOWN_FACTS, CANCELLED_VEHICLES, ACTIVE_VEHICLES, STALE_PATTERNS } = require("./contract-facts");

const VALID_STATUSES = ["Active", "Upcoming", "Awarded", "Protested", "Bridge", "Cancelled", "Resuming"];
const VALID_STATUSES_LOWER = VALID_STATUSES.map((s) => s.toLowerCase());

/**
 * Check text for stale/outdated patterns.
 * @param {string} text - Text to scan
 * @returns {{ stale: boolean, matches: string[], corrections: string[] }}
 */
function checkStalePatterns(text) {
  if (!text) return { stale: false, matches: [], corrections: [] };
  const matches = [];
  const corrections = [];
  for (const { pattern, correction } of STALE_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(pattern.source);
      corrections.push(correction);
    }
  }
  return { stale: matches.length > 0, matches, corrections };
}

/**
 * Validate a contract data object.
 * @param {Object} data - Contract data
 * @returns {{ valid: boolean, errors: string[], warnings: string[], corrected: Object }}
 */
function validateContract(data) {
  const errors = [];
  const warnings = [];
  const corrected = { ...data };

  // Required fields
  if (!data.name) errors.push("Missing required field: name");
  if (!data.agency) errors.push("Missing required field: agency");
  if (!data.status) errors.push("Missing required field: status");

  // Status validation
  if (data.status && !VALID_STATUSES_LOWER.includes(data.status.toLowerCase())) {
    errors.push(`Invalid status: "${data.status}". Must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  // Stale pattern check
  const textToCheck = JSON.stringify(data);
  const staleResult = checkStalePatterns(textToCheck);
  if (staleResult.stale) {
    for (let i = 0; i < staleResult.matches.length; i++) {
      warnings.push(`Stale pattern detected: ${staleResult.matches[i]} → ${staleResult.corrections[i]}`);
    }
    // Auto-correct known stale references in name
    if (data.name && /T-5 BPA/i.test(data.name)) {
      corrected.name = data.name.replace(/T-5 BPA/gi, "T4NG / T4NG2");
      errors.push("Contract name contains stale reference 'T-5 BPA'");
    }
  }

  // Check against cancelled vehicles
  if (data.name && CANCELLED_VEHICLES.some((v) => data.name.includes(v))) {
    errors.push(`Contract references cancelled vehicle: ${data.name}`);
  }

  // Dollar value sanity
  if (data.value) {
    const numMatch = data.value.match(/\$([0-9,.]+)\s*(B|M|T)/i);
    if (numMatch) {
      const num = parseFloat(numMatch[1].replace(/,/g, ""));
      const unit = numMatch[2].toUpperCase();
      const inBillions = unit === "T" ? num * 1000 : unit === "B" ? num : num / 1000;
      if (inBillions < 0) errors.push("Negative dollar value");
      if (inBillions > 100) warnings.push(`Unusually large value: $${inBillions}B — verify`);
    }
  }

  // Vendor check
  if (data.vendor !== undefined && data.vendor !== null && data.vendor.trim() === "") {
    warnings.push("Empty vendor field");
  }

  return { valid: errors.length === 0, errors, warnings, corrected };
}

/**
 * Validate an opportunity data object.
 * @param {Object} data - Opportunity data
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateOpportunity(data) {
  const errors = [];
  const warnings = [];

  if (!data.title && !data.name) errors.push("Missing required field: title/name");
  if (!data.agency) errors.push("Missing required field: agency");

  // Filter cancelled vehicles
  if (data.contract_vehicle && CANCELLED_VEHICLES.includes(data.contract_vehicle)) {
    errors.push(`References cancelled vehicle: ${data.contract_vehicle}`);
  }

  // Stale check
  const textToCheck = JSON.stringify(data);
  const staleResult = checkStalePatterns(textToCheck);
  if (staleResult.stale) {
    for (let i = 0; i < staleResult.matches.length; i++) {
      warnings.push(`Stale pattern: ${staleResult.matches[i]} → ${staleResult.corrections[i]}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a vehicle data object.
 * @param {Object} data - Vehicle data
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateVehicle(data) {
  const errors = [];
  const warnings = [];

  if (!data.name) errors.push("Missing required field: name");

  // Reject cancelled vehicles
  if (data.name && CANCELLED_VEHICLES.includes(data.name)) {
    errors.push(`Vehicle cancelled: ${data.name}`);
  }

  // Only allow active vehicles
  if (data.name && !ACTIVE_VEHICLES.includes(data.name) && !CANCELLED_VEHICLES.includes(data.name)) {
    warnings.push(`Unknown vehicle: ${data.name} — not in active or cancelled list`);
  }

  // Stale check
  const textToCheck = JSON.stringify(data);
  const staleResult = checkStalePatterns(textToCheck);
  if (staleResult.stale) {
    for (let i = 0; i < staleResult.matches.length; i++) {
      warnings.push(`Stale pattern: ${staleResult.matches[i]} → ${staleResult.corrections[i]}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Score confidence based on base score and source reliability.
 * @param {number} baseScore - AI confidence (0-1)
 * @param {string} sourceDomain - Source domain name
 * @param {number} sourceReliability - Source reliability score (0-1)
 * @returns {{ level: string, score: number }}
 */
function scoreConfidence(baseScore, sourceDomain, sourceReliability) {
  const effectiveConfidence = baseScore * sourceReliability;
  const rounded = Math.round(effectiveConfidence * 1000) / 1000;

  let level;
  if (rounded >= 0.85) level = "HIGH";
  else if (rounded >= 0.70) level = "MEDIUM";
  else if (rounded >= 0.50) level = "LOW";
  else level = "UNVERIFIED";

  return { level, score: rounded };
}

/**
 * Determine if data should be auto-published based on confidence score.
 * @param {number} score - Effective confidence score (0-1)
 * @returns {boolean}
 */
function shouldAutoPublish(score) {
  return score >= 0.70;
}

module.exports = {
  validateContract,
  validateOpportunity,
  validateVehicle,
  checkStalePatterns,
  scoreConfidence,
  shouldAutoPublish,
  VALID_STATUSES,
};
