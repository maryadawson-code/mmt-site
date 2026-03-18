// ============================================================
// report-quality-gate.js — Quality gate for MarketPulse reports
//
// Prevents delivery of low-intelligence reports to paying customers.
// Runs AFTER all research passes but BEFORE PDF generation.
//
// Returns: { pass: boolean, failures: string[], grade: "PASS"|"MARGINAL"|"FAIL" }
// ============================================================

/**
 * Analyze research pass results and build quality metrics.
 * Call this incrementally as each pass completes.
 */
function createReportQuality() {
  return {
    totalPasses: 0,
    nullPasses: 0,
    specificContracts: 0,
    namedEntities: 0,
    dollarValues: 0,
    actionableItems: 0,
    youtubeSourceCount: 0,
  };
}

/**
 * Analyze a pass result for quality signals.
 * @param {Object} quality - The reportQuality object
 * @param {string} content - The pass result content
 * @param {string[]} [citations] - Citations from this pass
 */
function analyzePassResult(quality, content, citations) {
  quality.totalPasses++;

  if (!content || content.trim().length < 100) {
    quality.nullPasses++;
    return;
  }

  const lower = content.toLowerCase();

  // Check for null-result indicators
  if (
    /no results found|no contracts found|no data available|none identified|no relevant|could not find/i.test(content) &&
    content.trim().length < 500
  ) {
    quality.nullPasses++;
  }

  // Count specific contracts (patterns like FA8773-24-D-0001, W52P1J-20-D-0001, GS-35F-0511T)
  const contractPatterns = content.match(
    /[A-Z]{1,4}[\d]{2,5}[-][\d]{2,4}[-][A-Z][-][\d]{4,}/g
  );
  if (contractPatterns) {
    quality.specificContracts += contractPatterns.length;
  }
  // Also match solicitation numbers
  const solPatterns = content.match(/\b[A-Z0-9]{6,}-[A-Z0-9-]+\b/g);
  if (solPatterns) {
    quality.specificContracts += Math.min(solPatterns.length, 5);
  }

  // Count dollar values ($X.XM, $X.XB, $XXX,XXX)
  const dollarPatterns = content.match(
    /\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|M|B|K))?/gi
  );
  if (dollarPatterns) {
    quality.dollarValues += dollarPatterns.length;
  }

  // Count named entities (company names, agency names)
  const entityPatterns = content.match(
    /\b(?:Booz Allen|Leidos|GDIT|SAIC|Deloitte|Accenture|Peraton|ManTech|CACI|ICF|Maximus|Unison|CGI Federal)\b/gi
  );
  if (entityPatterns) {
    quality.namedEntities += entityPatterns.length;
  }
  // Agency names
  const agencyPatterns = content.match(
    /\b(?:GSA|DoD|VA|HHS|DHA|CMS|NIH|CDC|OPM|SBA|USAID)\b/g
  );
  if (agencyPatterns) {
    quality.namedEntities += new Set(agencyPatterns).size;
  }

  // Count actionable items
  const actionPatterns = content.match(
    /\b(?:recommend|should|submit|register|attend|monitor|pursue|target|apply|propose|team with)\b/gi
  );
  if (actionPatterns) {
    quality.actionableItems += actionPatterns.length;
  }

  // Count YouTube sources
  if (citations) {
    quality.youtubeSourceCount += citations.filter((url) => {
      const u = (url || "").toLowerCase();
      return u.includes("youtube.com") || u.includes("youtu.be");
    }).length;
  }
}

/**
 * Run the quality gate on the final synthesis.
 * @param {Object} quality - The reportQuality metrics object
 * @param {string} synthesis - Final synthesized report text
 * @returns {{ pass: boolean, failures: string[], grade: "PASS"|"MARGINAL"|"FAIL" }}
 */
function checkReportQuality(quality, synthesis) {
  const failures = [];

  // Must have specific intelligence
  if (quality.specificContracts < 1 && quality.dollarValues < 3) {
    failures.push(
      `No specific contracts or dollar values found (contracts: ${quality.specificContracts}, dollar values: ${quality.dollarValues})`
    );
  }

  // Must not be mostly null
  if (quality.totalPasses > 0 && quality.nullPasses > quality.totalPasses * 0.6) {
    failures.push(
      `${quality.nullPasses}/${quality.totalPasses} passes returned empty or near-empty`
    );
  }

  // Check synthesis for generic padding
  if (synthesis) {
    const lines = synthesis.split("\n").filter((l) => l.trim());
    const genericPhrases = lines.filter((l) =>
      /program overview|what is\s|how to apply|certification process|eligibility requirements?|mentor[\s-]prot|program description|was established in|is designed to/i.test(l)
    );
    if (lines.length > 0 && genericPhrases.length > lines.length * 0.3) {
      failures.push(
        `Report is ${Math.round((genericPhrases.length / lines.length) * 100)}% generic program descriptions (${genericPhrases.length}/${lines.length} lines)`
      );
    }
  }

  // YouTube source check
  if (quality.youtubeSourceCount > 0) {
    failures.push(
      `${quality.youtubeSourceCount} YouTube source${quality.youtubeSourceCount > 1 ? "s" : ""} found in citations`
    );
  }

  // Grade determination
  let grade;
  if (failures.length === 0) {
    grade = "PASS";
  } else if (failures.length <= 2) {
    grade = "MARGINAL";
  } else {
    grade = "FAIL";
  }

  return {
    pass: failures.length === 0,
    failures,
    grade,
  };
}

/**
 * Build a quality disclaimer for MARGINAL reports.
 * @param {string[]} failures - List of quality failures
 * @returns {string}
 */
function buildQualityDisclaimer(failures) {
  return (
    "\n\n---\n**RESEARCH NOTE:** This report contains limited specific intelligence " +
    "for your query. The following limitations were detected:\n" +
    failures.map((f) => `- ${f}`).join("\n") +
    "\n\nWe recommend supplementing with direct searches on SAM.gov, " +
    "USASpending.gov, and FPDS.gov for the most current procurement data.\n---\n"
  );
}

module.exports = {
  createReportQuality,
  analyzePassResult,
  checkReportQuality,
  buildQualityDisclaimer,
};
