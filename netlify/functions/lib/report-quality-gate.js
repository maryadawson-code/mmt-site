// ============================================================
// report-quality-gate.js — Quality gate for MarketPulse reports
//
// Prevents delivery of low-intelligence reports to paying customers.
// Runs AFTER all research passes but BEFORE PDF generation.
//
// 7 individual gates (Sprint E):
//   1. Pipeline Density    — structured entry count >= 3
//   2. Data Integrity      — dollar figures + contract refs exist
//   3. Source Quality      — >= 30% .gov citations
//   4. Confidence Integrity — no HIGH on null, tags <= 10
//   5. Claim Consistency   — no contradictions
//   6. Customer Value      — content length + data density
//   7. Query Fulfillment   — topic terms present in synthesis
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

// ============================================================
// 7 QUALITY GATES
// ============================================================

/**
 * Gate 1: Pipeline Density — count structured pipeline entries.
 */
function gatePipelineDensity(synthesis) {
  const entryCount = (synthesis.match(/CONTRACT\/OPPORTUNITY:/g) || []).length;
  if (entryCount >= 3) return null;
  return `Fewer than 3 pipeline opportunities identified (found: ${entryCount})`;
}

/**
 * Gate 2: Data Integrity — dollar figures + contract/solicitation refs.
 */
function gateDataIntegrity(synthesis) {
  const hasDollar = /\$[\d,.]+[BMK]?\b/i.test(synthesis);
  const hasContract = /[A-Z0-9]{2,6}[-_]?[A-Z0-9]{4,}/i.test(synthesis);
  if (hasDollar && hasContract) return null;
  return "No verifiable contract numbers or dollar figures found";
}

/**
 * Gate 3: Source Quality — .gov citation percentage.
 */
function gateSourceQuality(synthesis, citations) {
  if (!citations || citations.length === 0) {
    return "No citations provided";
  }
  // YouTube/social check — warn only (source filter strips these before PDF)
  const youtubeCount = citations.filter((u) => /youtube\.com|youtu\.be/i.test(u || "")).length;
  if (youtubeCount > 0) {
    console.warn(`[GATE WARNING] ${youtubeCount} YouTube source${youtubeCount > 1 ? "s" : ""} found in citations (stripped by source filter)`);
  }
  const govCount = citations.filter((u) => /\.gov\b/i.test(u || "")).length;
  const govPercent = Math.round((govCount / citations.length) * 100);
  if (govPercent < 30) {
    return `Source quality: only ${govPercent}% .gov sources (minimum 30%)`;
  }
  return null;
}

/**
 * Gate 4: Confidence Integrity — no HIGH on null, total tags <= 10.
 */
function gateConfidenceIntegrity(synthesis) {
  const failures = [];
  // Check for HIGH near null indicators
  const lines = synthesis.split("\n");
  for (const line of lines) {
    if (/\[HIGH\]/i.test(line) && /\b(null|none|not found|no contracts|no results|zero)\b/i.test(line)) {
      failures.push("HIGH confidence assigned to null result");
      break;
    }
  }
  // Count total confidence tags
  const tagCount = (synthesis.match(/\[(HIGH|MEDIUM|LOW|UNVERIFIED)\]/gi) || []).length;
  if (tagCount > 10) {
    failures.push(`Too many confidence tags (${tagCount})`);
  }
  return failures.length > 0 ? failures.join("; ") : null;
}

/**
 * Gate 5: Claim Consistency — contradictions.
 */
function gateClaimConsistency(synthesis) {
  const lower = synthesis.toLowerCase();
  // Only check executive summary and pipeline sections, not methodology
  // (methodology legitimately explains what was NOT found)
  const preMethodology = lower.split("## methodology")[0] || lower;
  const hasZeroContracts = /(?:zero|no) contracts?\b/.test(preMethodology);
  const hasVendorNames = /\b(?:inc\.|llc|corp\.|solutions|technologies|systems)\b/i.test(synthesis);
  if (hasZeroContracts && hasVendorNames) {
    return 'Contradiction: "zero contracts" stated but vendor names present';
  }
  return null;
}

/**
 * Gate 6: Customer Value — content length + data density.
 */
function gateCustomerValue(quality, synthesis) {
  if (!synthesis) return "Report is empty";
  const charCount = synthesis.length;
  if (charCount < 2000) return `Report too short (${charCount} chars)`;
  if (charCount > 18000) return `Report too long (${charCount} chars, ~${Math.round(charCount/3000)} pages — max 4 pages / ~12,000 chars)`;
  // Data density: skip if structured pipeline entries exist (counted separately)
  const pipelineEntries = (synthesis.match(/CONTRACT\/OPPORTUNITY:/g) || []).length;
  if (pipelineEntries >= 3) { /* density OK — pipeline entries carry the data */ }
  else {
    const expectedContracts = Math.floor(charCount / 5000);
    if (expectedContracts > 0 && quality.specificContracts < expectedContracts) {
      return `Low data density (${quality.specificContracts} contracts in ${charCount} chars)`;
    }
  }
  // Generic padding check
  const lines = synthesis.split("\n").filter((l) => l.trim());
  const genericPhrases = lines.filter((l) =>
    /program overview|what is\s|how to apply|certification process|eligibility requirements?|mentor[\s-]prot|program description|was established in|is designed to/i.test(l)
  );
  if (lines.length > 0 && genericPhrases.length > lines.length * 0.3) {
    return `Report is ${Math.round((genericPhrases.length / lines.length) * 100)}% generic program descriptions`;
  }
  return null;
}

/**
 * Gate 7: Query Fulfillment — topic terms in synthesis.
 */
function gateQueryFulfillment(synthesis, topic) {
  if (!topic) return null;
  // Extract meaningful words (>3 chars, not stop words)
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "have", "will", "been", "about", "what", "which", "their", "also", "more", "than", "would", "could", "should", "into", "they", "them", "being", "some", "when", "where", "there", "here", "these", "those", "other", "each", "every", "most", "like", "over", "such", "after", "before", "between", "through"]);
  const topicWords = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));
  if (topicWords.length === 0) return null;
  const lower = synthesis.toLowerCase();
  const matched = topicWords.filter((w) => lower.includes(w));
  const matchPercent = Math.round((matched.length / topicWords.length) * 100);
  if (matchPercent < 60) {
    return `Report may not address the original query (matched ${matchPercent}% of topic terms)`;
  }
  return null;
}

/**
 * Gate 8: Competitive Data Verification — entries must have contract numbers.
 */
function gateCompetitiveData(synthesis) {
  // Extract competitive landscape section
  const compMatch = synthesis.match(/## COMPETITIVE LANDSCAPE[\s\S]*?(?=## |$)/i);
  if (!compMatch) return null; // No section = no issue

  const compText = compMatch[0];
  // Count company entries (lines mentioning LLC, Inc, Corp, etc.)
  const companyLines = compText.split("\n").filter((l) =>
    /\b(LLC|Inc\.?|Corp\.?|Solutions|Technologies|Systems|Strategies|Group|Partners|Hamilton|International)\b/i.test(l) &&
    l.trim().length > 10
  );
  if (companyLines.length < 3) return null; // Too few entries to flag

  // Count entries with contract numbers
  const withContract = companyLines.filter((l) =>
    /[A-Z0-9]{2,6}[-_][A-Z0-9]{2,}[-_][A-Z0-9]/i.test(l) ||
    /contract\s*#/i.test(l) ||
    /GS-\d|FA\d|W\d{2}|36C\d|47Q/i.test(l) ||
    /market participant|potential|assumed|no confirmed/i.test(l)
  );

  if (withContract.length === 0) {
    return "Competitive landscape contains entries without verifiable contract numbers";
  }
  return null;
}

/**
 * Gate 9: Strategic depth — report must contain analysis, not just inventory.
 * Checks for strategic thesis, market structure assessment, barriers to entry,
 * competitive dynamics, and forward catalysts.
 */
function gateStrategicDepth(synthesis) {
  const checks = [
    { test: /STRATEGIC THESIS/i, label: "strategic thesis" },
    { test: /market (structure|concentration|tier)|TAM|addressable market/i, label: "market assessment" },
    { test: /barriers? to entry|entry barriers|what.*need.*compete/i, label: "barrier analysis" },
    { test: /COMPETITIVE DYNAMICS|CAPTURE STRATEGY/i, label: "strategic sections" },
  ];
  const missing = checks.filter((c) => !c.test.test(synthesis)).map((c) => c.label);
  if (missing.length >= 3) {
    return `Report lacks strategic depth — missing: ${missing.join(", ")}. Analysis reads as inventory rather than intelligence.`;
  }
  return null;
}

/**
 * Run all 9 quality gates on the final synthesis.
 * @param {Object} quality - The reportQuality metrics object
 * @param {string} synthesis - Final synthesized report text
 * @param {Object} [opts] - Optional: { citations, topic }
 * @returns {{ pass: boolean, failures: string[], grade: "PASS"|"MARGINAL"|"FAIL" }}
 */
function checkReportQuality(quality, synthesis, opts) {
  const { citations, topic } = opts || {};
  const failures = [];

  const gates = [
    gatePipelineDensity(synthesis || ""),
    gateDataIntegrity(synthesis || ""),
    gateSourceQuality(synthesis || "", citations),
    gateConfidenceIntegrity(synthesis || ""),
    gateClaimConsistency(synthesis || ""),
    gateCustomerValue(quality, synthesis || ""),
    gateQueryFulfillment(synthesis || "", topic),
    gateCompetitiveData(synthesis || ""),
    gateStrategicDepth(synthesis || ""),
  ];

  for (const result of gates) {
    if (result) failures.push(result);
  }

  // Must not be mostly null passes
  if (quality.totalPasses > 0 && quality.nullPasses > quality.totalPasses * 0.6) {
    failures.push(
      `${quality.nullPasses}/${quality.totalPasses} passes returned empty or near-empty`
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

// ============================================================
// AUTO-SCORING (Spec section 11.1)
// ============================================================

/**
 * Score the final report across 6 dimensions.
 * @param {string} synthesis - Final synthesized report text
 * @param {string[]} citations - Source URLs
 * @param {Object} [classification] - Intent classification result
 * @returns {Object} Score breakdown with overall weighted average
 */
function scoreReport(synthesis, citations, classification) {
  const text = synthesis || "";
  const cites = citations || [];

  // 1. Pipeline opportunities (30% weight)
  const pipelineCount = (text.match(/CONTRACT\/OPPORTUNITY:/g) || []).length;
  const pipelineScore = Math.min(100, Math.round((pipelineCount / 3) * 100));

  // 2. Source quality (20% weight)
  const govCount = cites.filter((u) => /\.gov\b/i.test(u || "")).length;
  const govPercent = cites.length > 0 ? Math.round((govCount / cites.length) * 100) : 0;
  const sourceScore = Math.min(100, Math.round((govPercent / 60) * 100));

  // 3. Confidence accuracy (20% weight)
  const lines = text.split("\n");
  let overRated = 0;
  for (const line of lines) {
    if (/\[HIGH\]/i.test(line) && /\b(null|none|not found|no contracts|no results|zero)\b/i.test(line)) {
      overRated++;
    }
  }
  const confidenceScore = overRated === 0 ? 100 : Math.max(0, 100 - overRated * 25);

  // 4. Content pages (10% weight)
  const chars = text.length;
  const estPages = Math.round(chars / 3000); // ~3000 chars per PDF page
  let pageScore;
  if (estPages >= 6 && estPages <= 14) {
    pageScore = 100;
  } else if (estPages >= 4 && estPages <= 16) {
    pageScore = 70;
  } else if (estPages >= 2) {
    pageScore = 40;
  } else {
    pageScore = 10;
  }

  // 5. Data density (10% weight)
  const contracts = (text.match(/[A-Z0-9]{2,6}[-_]?[A-Z0-9]{4,}/g) || []).length;
  const dollars = (text.match(/\$[\d,.]+[BMK]?\b/gi) || []).length;
  const dataItems = contracts + dollars;
  const itemsPerPage = estPages > 0 ? dataItems / estPages : 0;
  const densityScore = Math.min(100, Math.round(itemsPerPage * 50));

  // 6. Query fulfillment (10% weight)
  let fulfillmentScore = 50; // default if no classification
  if (classification && classification.intents) {
    const intentSectionMap = {
      pipeline_scan: /PIPELINE INTELLIGENCE/i,
      market_event_analysis: /MARKET CONTEXT|MARKET EVENT/i,
      competitive_intelligence: /COMPETITIVE (LANDSCAPE|DYNAMICS)/i,
      entity_intelligence: /STRATEGIC THESIS|EXECUTIVE SUMMARY/i,
      landscape_overview: /MARKET LANDSCAPE/i,
      forward_view: /FORWARD (VIEW|CATALYSTS)/i,
      weekly_actions: /CAPTURE STRATEGY|THIS WEEK/i,
    };
    let matched = 0;
    for (const intent of classification.intents) {
      if (intentSectionMap[intent] && intentSectionMap[intent].test(text)) {
        matched++;
      }
    }
    fulfillmentScore = classification.intents.length > 0
      ? Math.round((matched / classification.intents.length) * 100)
      : 50;
  }

  // 7. Strategic depth (15% weight) — does the report contain analysis, not just inventory?
  let strategicScore = 0;
  const strategicChecks = [
    { test: /STRATEGIC THESIS/i, weight: 25, label: "thesis" },
    { test: /TAM|total addressable|addressable market/i, weight: 15, label: "TAM" },
    { test: /market (structure|concentration|tier)|oligopoly|fragmented|monopoly/i, weight: 15, label: "market_structure" },
    { test: /barriers? to entry|entry barriers/i, weight: 10, label: "barriers" },
    { test: /growing|declining|trend|trajectory|YoY|year.over.year|CAGR/i, weight: 10, label: "trend" },
    { test: /win themes?|winning|competitive advantage|differentiat/i, weight: 10, label: "win_themes" },
    { test: /teaming|joint venture|mentor.protege|subcontract/i, weight: 10, label: "teaming" },
    { test: /CAPTURE STRATEGY/i, weight: 5, label: "capture" },
  ];
  const strategicHits = [];
  for (const check of strategicChecks) {
    if (check.test.test(text)) {
      strategicScore += check.weight;
      strategicHits.push(check.label);
    }
  }
  strategicScore = Math.min(100, strategicScore);

  // Weighted average (rebalanced to include strategic depth)
  const overall = Math.round(
    pipelineScore * 0.2 +
    sourceScore * 0.15 +
    confidenceScore * 0.15 +
    strategicScore * 0.2 +
    pageScore * 0.1 +
    densityScore * 0.1 +
    fulfillmentScore * 0.1
  );

  return {
    pipeline_opportunities: { count: pipelineCount, target: 3, score: pipelineScore },
    source_quality: { gov_percent: govPercent, target: 60, score: sourceScore },
    confidence_accuracy: { over_rated: overRated, score: confidenceScore },
    strategic_depth: { hits: strategicHits, score: strategicScore },
    content_pages: { chars, est_pages: estPages, target_range: [4, 8], score: pageScore },
    data_density: { items_per_page: Math.round(itemsPerPage * 10) / 10, target: 1, score: densityScore },
    query_fulfillment: { match_percent: fulfillmentScore, score: fulfillmentScore },
    overall,
  };
}

module.exports = {
  createReportQuality,
  analyzePassResult,
  checkReportQuality,
  buildQualityDisclaimer,
  scoreReport,
};
