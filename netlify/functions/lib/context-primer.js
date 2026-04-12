// ============================================================
// context-primer.js — Appendix C current-events context + priming
//
// Spec section 2.3 + Appendix C. Hardcoded current-events
// context injected into every Perplexity system prompt.
// ============================================================

const APPENDIX_C = {
  last_updated: "2026-04-12",
  quarterly_refresh_due: "2026-07-12",
  events: [
    {
      id: "doge_terminations",
      summary: "DOGE contract terminations: 33,701+ actions, $2.51B de-obligated, 26,484 small business contracts closed",
      sources: ["GovSpend", "GovWin IQ"],
      keywords: ["doge", "termination", "cancellation", "de-obligat"],
      date_range: "FY2025",
    },
    {
      id: "sdvosb_goal_miss",
      summary: "SDVOSB FY2025 goal MISSED at 4.7% (first miss since 2011), $2B+ short of 5% target",
      sources: ["GovCon Intelligence"],
      keywords: ["sdvosb", "goal", "5%", "4.7%"],
      date_range: "FY2025",
    },
    {
      id: "fpds_migration",
      summary: "FPDS.gov decommissioned Feb 24, 2026, migrated to SAM.gov",
      sources: ["SAM.gov"],
      keywords: ["fpds", "migration", "sam.gov"],
      date_range: "Feb 2026",
    },
    {
      id: "sdvosb_thresholds",
      summary: "SDVOSB sole-source: $5M non-mfg / $8.5M mfg (FAR 19.1406)",
      sources: ["acquisition.gov"],
      keywords: ["sole source", "threshold", "19.1406"],
      date_range: "current",
    },
    {
      id: "vetcert_processing",
      summary: "VetCert processing ~12 days avg (backlog cleared Nov 2025), 6-month eligibility extension May 2025",
      sources: ["USFCR", "SBA"],
      keywords: ["vetcert", "certification", "processing"],
      date_range: "Nov 2025-current",
    },
    {
      id: "sewp_v_expiration",
      summary: "NASA SEWP V expires April 30, 2026; SEWP VI under evaluation, not yet awarded",
      sources: ["NASA SEWP", "Trident Proposals"],
      keywords: ["sewp", "nasa", "gwac"],
      date_range: "April 2026",
    },
    {
      id: "far_overhaul",
      summary: "Revolutionary FAR Overhaul (RFO) in progress. SAM.gov modernized FAR/DFARS Reps & Certs released March 24, 2026. Type 1 entity-level reps collected in SAM; Types 2/3 now solicitation-level only. EO 11246 affirmative action provisions removed (revoked by EO 14173).",
      sources: ["SAM.gov", "Federal Register", "acquisition.gov"],
      keywords: ["far", "overhaul", "simplification", "reps", "certs", "representations", "certifications", "rfo"],
      date_range: "March 2026-current",
    },
    {
      id: "usaid_terminations",
      summary: "USAID: 83% of contracts terminated (5,200 contracts), tens of billions in value",
      sources: ["NPR", "HigherGov"],
      keywords: ["usaid", "terminated", "canceled"],
      date_range: "Feb-Mar 2025",
    },
    {
      id: "gsa_mas_refresh_31",
      summary: "GSA MAS Solicitation Refresh 31 (Mass Mod A914) released April 2, 2026. TDR mandatory for ALL SINs (112 total). Price Reduction Clause (PRC) and CSP-1 Commercial Sales Practices eliminated. New AI governance requirements per OMB M-25-22: American AI systems required, government owns data outputs. Springboard Program limited to FASt Lane qualifiers. TDR monthly reporting: 12 mandatory data fields via FAS Sales Reporting Portal within 30 calendar days.",
      sources: ["GSA.gov", "buy.gsa.gov", "gormgroup.com"],
      keywords: ["mas", "refresh", "tdr", "transactional data", "prc", "price reduction", "csp-1", "gsa schedule", "ai governance"],
      date_range: "April 2026",
    },
    {
      id: "cmmc_2026",
      summary: "CMMC Level 2 assessments underway for defense contractors handling CUI. DFARS 252.204-7012 and NIST SP 800-171 Rev 2 compliance required for all DoD health IT contracts (DHA, VA, MHS). CMMC Level 2 certification expected as mandatory evaluation criterion for new DHA solicitations in FY2026.",
      sources: ["acq.osd.mil", "acquisition.gov"],
      keywords: ["cmmc", "nist 800-171", "cui", "cybersecurity", "dfars", "dha", "mhs"],
      date_range: "2026-current",
    },
  ],
};

/**
 * Find Appendix C events matching the query context.
 * @param {string|null} event_trigger - Detected event trigger from intent classifier
 * @param {string} topic - User's raw topic
 * @returns {Object[]} Matching event objects from APPENDIX_C
 */
function getRelevantContext(event_trigger, topic) {
  const combined = [event_trigger, topic].filter(Boolean).join(" ").toLowerCase();
  if (!combined) return [];

  return APPENDIX_C.events.filter((event) =>
    event.keywords.some((kw) => combined.includes(kw.toLowerCase()))
  );
}

/**
 * Build a context priming prompt for Perplexity when event_trigger
 * is detected but not fully covered by Appendix C.
 * @param {string} event_trigger - The detected event trigger
 * @param {Object} scope - Scope object from intent classifier
 * @returns {string} Prompt for Perplexity context priming call
 */
function buildContextPrimingPrompt(event_trigger, scope) {
  const parts = [`What is the current status and impact of: ${event_trigger}`];

  if (scope && scope.set_aside_filter) {
    parts.push(`Focus on impact to ${scope.set_aside_filter.toUpperCase()} set-aside contracts.`);
  }
  if (scope && scope.target_entity) {
    parts.push(`Specifically at ${scope.target_entity}.`);
  }

  parts.push("Provide: (1) what happened, (2) when, (3) scale (number of contracts, dollar value), (4) which agencies most affected, (5) what recompete or new-start opportunities this creates.");

  return parts.join(" ");
}

module.exports = { APPENDIX_C, getRelevantContext, buildContextPrimingPrompt };
