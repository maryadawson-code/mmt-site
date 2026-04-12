// ============================================================
// regulatory-flags.js — Post-scoring regulatory compliance flags
//
// Scans scored documents for regulatory compliance gaps based on
// current federal acquisition rules. Returns flags that are merged
// into the scorecard output without changing scoring architecture.
//
// Current checks:
//   1. GSA MAS Refresh 31 / TDR compliance (April 2026)
//   2. FAR Modernization / Reps & Certs update (March 2026)
//
// Sources:
//   - GSA MAS Refresh 31 (Mass Mod A914), April 2, 2026
//   - SAM.gov Modernized FAR/DFARS Reps & Certs, March 24, 2026
// ============================================================

// ─── TDR / MAS REFRESH 31 PATTERNS ─────────────────────────────

const TDR_INDICATORS = [
  /transactional\s+data\s+reporting/i,
  /\bTDR\b/,
  /I-FSS-600/i,
  /552\.238/i,
];

const MAS_INDICATORS = [
  /\bMAS\b/,
  /multiple\s+award\s+schedule/i,
  /\bGSA\s+schedule/i,
  /\bGSA\s+MAS\b/i,
  /\bSIN\b/,
  /special\s+item\s+number/i,
  /FSS\s+contract/i,
];

const PRC_LEGACY_INDICATORS = [
  /price\s+reduction\s+clause/i,
  /\bPRC\b/,
  /most\s+favored\s+customer/i,
  /\bMFC\b/,
  /CSP[\s-]*1/i,
  /commercial\s+sales\s+practices/i,
];

const AI_GOVERNANCE_INDICATORS = [
  /\bAI\s+governance/i,
  /artificial\s+intelligence\s+governance/i,
  /M-25-22/i,
  /OMB\s+memorandum.*AI/i,
  /American\s+AI/i,
];

// ─── FAR MODERNIZATION PATTERNS ────────────────────────────────

const REPS_CERTS_INDICATORS = [
  /representations?\s+and\s+certifications?/i,
  /\bSection\s+K\b/i,
  /52\.204-8/i,
  /annual\s+representations/i,
  /reps\s+(&|and)\s+certs/i,
];

const OBSOLETE_REPS_PATTERNS = [
  /EO\s*11246/i,
  /executive\s+order\s+11246/i,
  /affirmative\s+action\s+program.*women.*minorities/i,
  /equal\s+opportunity\s+clause.*previous\s+contracts/i,
];

const CMMC_INDICATORS = [
  /\bCMMC\b/,
  /cybersecurity\s+maturity\s+model/i,
  /DFARS\s+252\.204-7012/i,
  /NIST\s+SP\s+800-171/i,
  /NIST\s+800-171/i,
  /controlled\s+unclassified\s+information/i,
  /\bCUI\b/,
];

// ─── FLAG GENERATOR ────────────────────────────────────────────

/**
 * Scan document text and scorecard for regulatory compliance gaps.
 *
 * @param {string} documentText - Extracted text from the proposal
 * @param {object} scorecard - The scored scorecard from Claude
 * @param {string} documentType - pitch_deck, rfp_response, etc.
 * @returns {object} { flags: [], warnings: [], info: [] }
 */
function checkRegulatoryCompliance(documentText, scorecard, documentType) {
  const text = (documentText || "").toLowerCase();
  const fullText = documentText || "";
  const flags = [];
  const warnings = [];
  const info = [];

  const isMasRelated = MAS_INDICATORS.some(p => p.test(fullText));
  const isPricing = documentType === "pricing_volume";
  const isRfp = documentType === "rfp_response";
  const isWhitePaper = documentType === "white_paper";
  const isDefenseHealth = /\bDHA\b|\bMHS\b|\bMHS\s+GENESIS\b|\bdefense\s+health/i.test(fullText)
    || /\bVA\b.*health|\bveterans?\s+(affairs|health)/i.test(fullText);

  // ──────────────────────────────────────────────────────────────
  // CHECK 1: GSA MAS Refresh 31 / TDR Compliance
  // ──────────────────────────────────────────────────────────────

  if (isMasRelated) {
    // 1a: TDR awareness check
    const hasTdrLanguage = TDR_INDICATORS.some(p => p.test(fullText));
    if (!hasTdrLanguage) {
      flags.push({
        category: "GSA_MAS_TDR",
        severity: "high",
        title: "Missing TDR compliance language (GSA MAS Refresh 31)",
        detail: "This MAS-related proposal does not reference Transactional Data Reporting (TDR). As of Refresh 31 (April 2026), TDR is mandatory for all SINs. Proposals should address TDR reporting capability, including monthly submission of 12 mandatory data fields via the FAS Sales Reporting Portal.",
        recommendation: "Add a section addressing TDR compliance: monthly reporting cadence, data field capture (Contract Number, SIN, Description, Unit Price, Quantity, etc.), and systems/processes for timely submission within 30 calendar days of month-end.",
        source: "GSA MAS Solicitation Refresh 31 (Mass Mod A914), April 2, 2026",
      });
    }

    // 1b: Legacy PRC language check (should be removed)
    const hasLegacyPrc = PRC_LEGACY_INDICATORS.some(p => p.test(fullText));
    if (hasLegacyPrc) {
      flags.push({
        category: "GSA_MAS_TDR",
        severity: "high",
        title: "Obsolete PRC/CSP-1 language detected",
        detail: "This proposal references the Price Reduction Clause (PRC), Most Favored Customer pricing, or CSP-1 Commercial Sales Practices. These requirements were eliminated in Refresh 31. Referencing them signals the proposal was not updated for current MAS requirements and may be evaluated as non-compliant.",
        recommendation: "Remove all PRC, MFC, and CSP-1 references. Replace pricing narrative with TDR-aligned transactional data reporting language. Pricing should be structured around TDR data fields, not commercial discount tiers.",
        source: "GSA MAS Solicitation Refresh 31 (Mass Mod A914), April 2, 2026",
      });
    }

    // 1c: AI governance for AI-related MAS offers
    const mentionsAi = /\bartificial\s+intelligence\b|\b(?:AI|ML)\s+(?:system|service|product|solution|platform)/i.test(fullText);
    if (mentionsAi) {
      const hasAiGovernance = AI_GOVERNANCE_INDICATORS.some(p => p.test(fullText));
      if (!hasAiGovernance) {
        flags.push({
          category: "GSA_MAS_AI_GOVERNANCE",
          severity: "medium",
          title: "Missing AI governance language for MAS AI offering",
          detail: "This MAS proposal describes AI products or services but does not address AI governance requirements introduced in Refresh 31. Contractors offering AI under MAS must comply with OMB M-25-22 requirements, including use of American AI systems, government data ownership, and transparency/risk-management disclosures.",
          recommendation: "Add an AI governance section addressing: (1) compliance with OMB M-25-22, (2) confirmation AI systems are American-made, (3) government ownership of data outputs and custom AI developments, (4) risk management and transparency framework.",
          source: "GSA MAS Solicitation Refresh 31, AI Requirements per OMB M-25-22",
        });
      }
    }
  }

  // 1d: Pricing volume TDR structure check
  if (isPricing && isMasRelated) {
    const hasTdrDataFields = /unit\s+(?:measure|price)|quantity|manufacturer\s+(?:name|part)/i.test(fullText)
      && /contract\s+(?:number|\/BPA)/i.test(fullText);
    if (!hasTdrDataFields) {
      warnings.push({
        category: "GSA_MAS_TDR",
        severity: "medium",
        title: "Pricing narrative may not align with TDR data structure",
        detail: "TDR requires monthly reporting of 12 mandatory fields (Contract Number, SIN, Description, Manufacturer Name, Manufacturer Part Number, Unit Measure, Quantity, UPC, Price Paid Per Unit, Total Price, etc.). The pricing narrative should demonstrate the offeror's ability to produce these data points.",
        recommendation: "Structure pricing tables to map directly to TDR data fields. Include a compliance narrative explaining how transactional data will be captured and reported monthly.",
        source: "GSA TDR Reporting Requirements, gsa.gov",
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // CHECK 2: FAR Modernization / Reps & Certs (March 2026)
  // ──────────────────────────────────────────────────────────────

  if (isRfp || isWhitePaper || isPricing) {
    // 2a: Obsolete affirmative action references
    const hasObsoleteReps = OBSOLETE_REPS_PATTERNS.some(p => p.test(fullText));
    if (hasObsoleteReps) {
      flags.push({
        category: "FAR_REPS_CERTS",
        severity: "high",
        title: "Obsolete FAR representation detected (EO 11246 / affirmative action)",
        detail: "This proposal references EO 11246 affirmative action requirements that were revoked by EO 14173 (January 2025) and removed from SAM.gov FAR representations as of December 2025. Including revoked requirements signals the proposal is using outdated templates and may trigger evaluator concern about overall compliance currency.",
        recommendation: "Remove all references to EO 11246, affirmative action programs for women and minorities, and related compliance reports. Note that Section 503 (Rehabilitation Act) and VEVRAA obligations for disability and veterans remain in effect.",
        source: "SAM.gov FAR/DFARS Modernized Reps & Certs, March 24, 2026; EO 14173",
      });
    }

    // 2b: Reps & Certs structure awareness
    const hasRepsCerts = REPS_CERTS_INDICATORS.some(p => p.test(fullText));
    if (hasRepsCerts) {
      // Check for Type 2/3 references that are now solicitation-level only
      const hasTypeReferences = /Type\s+[23]\s+(?:representation|certification)/i.test(fullText)
        || /solicitation-level\s+(?:representation|certification)/i.test(fullText);
      if (hasTypeReferences) {
        info.push({
          category: "FAR_REPS_CERTS",
          severity: "low",
          title: "FAR Reps & Certs structure has changed",
          detail: "As of March 24, 2026, SAM.gov only collects Type 1 (entity-level) representations. Types 2 and 3 are now collected per-solicitation. If this proposal references the old three-type structure, it should be updated.",
          source: "SAM.gov Modernized FAR/DFARS Reps & Certs, March 24, 2026",
        });
      }
    }
  }

  // 2c: Defense health IT CMMC check
  if (isDefenseHealth && (isRfp || isWhitePaper)) {
    const hasCmmc = CMMC_INDICATORS.some(p => p.test(fullText));
    if (!hasCmmc) {
      warnings.push({
        category: "DFARS_CMMC",
        severity: "medium",
        title: "Defense health IT proposal missing CMMC/NIST 800-171 language",
        detail: "This proposal targets DHA, VA, or MHS programs but does not reference CMMC, DFARS 252.204-7012, or NIST SP 800-171. In 2026, cybersecurity maturity is a primary evaluation differentiator for defense health IT procurements. Missing this signals the offeror may not understand current CUI protection requirements.",
        recommendation: "Add a cybersecurity compliance section referencing CMMC level (target Level 2 for CUI), NIST 800-171 Rev 2 compliance status, System Security Plan, and Plan of Action & Milestones (POA&M) if applicable.",
        source: "DFARS 252.204-7012; CMMC Program Rule, 32 CFR Part 170",
      });
    }
  }

  return { flags, warnings, info };
}

module.exports = { checkRegulatoryCompliance };
