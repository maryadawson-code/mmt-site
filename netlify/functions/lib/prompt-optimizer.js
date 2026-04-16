// ============================================================
// prompt-optimizer.js — MarketPulse prompt preprocessing
//
// Takes raw user request and enriches it into a structured
// research prompt using GovCon best practices. Called BEFORE
// the Perplexity pipeline in generate-tactical-brief-background.js.
//
// The original user topic is preserved in the order record.
// The optimized prompt is what gets sent to the AI pipeline.
// ============================================================

/**
 * @param {Object} userRequest
 * @param {string} userRequest.topic - Raw user research topic
 * @param {string} [userRequest.company] - Requesting company
 * @param {string} [userRequest.segment] - Market segment (e.g., "DHA", "VA", "DoD")
 * @param {string} [userRequest.audience] - Target audience
 * @param {string} [userRequest.additional_context] - Any extra context
 * @returns {string} Optimized prompt string for the research pipeline
 */
function optimizeMarketPrompt(userRequest) {
  const { topic, company, segment, audience, additional_context } = userRequest;

  if (!topic || !topic.trim()) {
    return topic || "";
  }

  const detectedContext = detectFederalContext(topic);
  const detectedNaics = detectNaicsCodes(topic);

  const sections = [];

  // Core research topic (preserved verbatim)
  sections.push(`PRIMARY RESEARCH TOPIC: ${topic.trim()}`);

  // Synonym expansion — broaden search terms for common health IT concepts
  const synonymExpansions = expandSynonyms(topic);
  if (synonymExpansions.length > 0) {
    sections.push(
      `SEARCH TERM EXPANSION (use ALL of these when querying data sources):\n` +
      synonymExpansions.map((s) => `- "${s.term}" also search for: ${s.synonyms.join(", ")}`).join("\n")
    );
  }

  // Federal market context
  if (detectedContext.agencies.length > 0 || segment) {
    sections.push(
      `FEDERAL MARKET CONTEXT:\n` +
      `- Target agencies: ${[...new Set([...(segment ? [segment] : []), ...detectedContext.agencies])].join(", ")}\n` +
      `- Domain: ${detectedContext.domain || "Federal Health IT"}\n` +
      (detectedContext.programs.length > 0 ? `- Related programs: ${detectedContext.programs.join(", ")}\n` : "")
    );
  }

  // Procurement intelligence request
  sections.push(
    `PROCUREMENT INTELLIGENCE REQUIRED:\n` +
    `- Active and recent contract vehicles (IDIQs, BPAs, GWACs) relevant to this topic\n` +
    `- Applicable NAICS codes${detectedNaics.length > 0 ? `: start with ${detectedNaics.join(", ")} and identify others` : ""}\n` +
    `- Set-aside categories (SDVOSB, 8(a), HUBZone, WOSB, full-and-open)\n` +
    `- Recent SAM.gov opportunities and solicitations (last 12 months)\n` +
    `- FPDS award data for incumbent contractors`
  );

  // Competitive landscape request
  sections.push(
    `COMPETITIVE LANDSCAPE REQUIRED:\n` +
    `- Incumbent contractors with actual contract numbers and values from FPDS/USASpending\n` +
    `- Market tier analysis (small business vs. mid-tier vs. large prime)\n` +
    `- Teaming patterns and joint ventures active in this space\n` +
    `- Recent wins and protests relevant to this domain`
  );

  // Timeline and recompete intelligence
  sections.push(
    `TIMELINE & RECOMPETE INTELLIGENCE:\n` +
    `- Upcoming recompetes and contract expirations (next 18 months)\n` +
    `- Key procurement milestones and deadlines\n` +
    `- Budget cycle implications (current FY and FYDP where applicable)\n` +
    `- Sources sought, RFIs, and draft RFPs in the pipeline`
  );

  // Risk and barrier analysis
  sections.push(
    `RISK & BARRIER ANALYSIS:\n` +
    `- Barriers to entry for new entrants\n` +
    `- Security clearance and compliance requirements (FedRAMP, FISMA, HIPAA)\n` +
    `- Incumbent advantage factors and switching costs\n` +
    `- Political and budget risks affecting this market`
  );

  // Actionable recommendations
  if (company) {
    sections.push(
      `ACTIONABLE RECOMMENDATIONS FOR ${company.toUpperCase()}:\n` +
      `- Specific capture strategy recommendations\n` +
      `- Teaming opportunities with identified incumbents or complementary firms\n` +
      `- Upcoming events, industry days, and engagement opportunities\n` +
      `- Recommended contract vehicles for market entry`
    );
  } else {
    sections.push(
      `ACTIONABLE NEXT STEPS FOR A SMALL BUSINESS:\n` +
      `- Recommended contract vehicles for market entry\n` +
      `- Teaming opportunities with identified incumbents\n` +
      `- Upcoming industry days and engagement opportunities\n` +
      `- Key relationships and points of contact to develop`
    );
  }

  if (additional_context) {
    sections.push(`ADDITIONAL CONTEXT FROM REQUESTER: ${additional_context}`);
  }

  return sections.join("\n\n");
}

// --- Helpers ---

const AGENCY_PATTERNS = [
  { pattern: /\b(DHA|Defense Health Agency|military health)\b/i, agency: "DHA", domain: "Defense Health", programs: ["MHS GENESIS", "AHLTA", "DHMSM"] },
  { pattern: /\b(VA|Veterans Affairs|veterans health|VHA|VistA)\b/i, agency: "VA/VHA", domain: "Veterans Health", programs: ["VistA", "Cerner/Oracle Health EHR", "EHRM"] },
  { pattern: /\b(CMS|Centers for Medicare|Medicare|Medicaid)\b/i, agency: "CMS", domain: "Healthcare Policy", programs: ["QHIN", "TEFCA", "Interoperability"] },
  { pattern: /\b(DoD|Department of Defense|defense)\b/i, agency: "DoD", domain: "Defense", programs: [] },
  { pattern: /\b(HHS|Health and Human Services)\b/i, agency: "HHS", domain: "Health Policy", programs: [] },
  { pattern: /\b(ONC|ASTP|National Coordinator|health IT)\b/i, agency: "ASTP/ONC", domain: "Health IT Policy", programs: ["USCDI", "TEFCA", "Certification"] },
  { pattern: /\b(NIH|National Institutes of Health)\b/i, agency: "NIH", domain: "Biomedical Research", programs: [] },
  { pattern: /\b(CDC|Centers for Disease Control)\b/i, agency: "CDC", domain: "Public Health", programs: ["Data Modernization Initiative"] },
  { pattern: /\b(TRICARE)\b/i, agency: "DHA/TRICARE", domain: "Defense Health Benefits", programs: ["TRICARE"] },
  { pattern: /\b(MHS GENESIS|DHMSM)\b/i, agency: "DHA", domain: "Defense Health EHR", programs: ["MHS GENESIS", "DHMSM"] },
];

function detectFederalContext(topic) {
  const result = { agencies: [], domain: null, programs: [] };
  for (const { pattern, agency, domain, programs } of AGENCY_PATTERNS) {
    if (pattern.test(topic)) {
      result.agencies.push(agency);
      if (!result.domain) result.domain = domain;
      result.programs.push(...programs);
    }
  }
  result.programs = [...new Set(result.programs)];
  return result;
}

const NAICS_PATTERNS = [
  { pattern: /\b(EHR|electronic health record|health IT|clinical systems)\b/i, codes: ["541512", "541519"] },
  { pattern: /\b(cybersecurity|cyber|FedRAMP|FISMA)\b/i, codes: ["541512", "541519", "541690"] },
  { pattern: /\b(cloud|infrastructure|hosting)\b/i, codes: ["518210", "541512"] },
  { pattern: /\b(consulting|advisory|strategy)\b/i, codes: ["541611", "541618"] },
  { pattern: /\b(AI|artificial intelligence|machine learning|data analytics)\b/i, codes: ["541512", "541519", "541715"] },
  { pattern: /\b(telehealth|telemedicine|remote health|virtual health|digital health|connected care|remote patient monitoring|RPM|VVC|Video Connect|mHealth|remote care|virtual care)\b/i, codes: ["541512", "621999", "541519"] },
  { pattern: /\b(medical device|biomedical)\b/i, codes: ["334510", "339112"] },
  { pattern: /\b(training|education|workforce)\b/i, codes: ["611430", "541612"] },
  { pattern: /\b(interoperability|data exchange|FHIR|HL7)\b/i, codes: ["541512", "541519"] },
];

function detectNaicsCodes(topic) {
  const codes = new Set();
  for (const { pattern, codes: naics } of NAICS_PATTERNS) {
    if (pattern.test(topic)) {
      naics.forEach((c) => codes.add(c));
    }
  }
  return [...codes];
}

// --- Synonym expansion for health IT concepts ---
const SYNONYM_MAP = [
  { trigger: /\b(telehealth)\b/i, term: "telehealth", synonyms: ["virtual health", "digital health", "connected care", "remote patient monitoring", "RPM", "telemedicine", "VA Video Connect", "VVC", "virtual care", "mHealth", "remote care", "tele-ICU", "store-and-forward"] },
  { trigger: /\b(virtual health)\b/i, term: "virtual health", synonyms: ["telehealth", "digital health", "connected care", "telemedicine", "remote patient monitoring", "virtual care"] },
  { trigger: /\b(EHR|electronic health record)\b/i, term: "EHR", synonyms: ["electronic health record", "health information system", "clinical information system", "VistA", "MHS GENESIS", "Oracle Health", "Cerner", "EHRM"] },
  { trigger: /\b(cybersecurity|cyber)\b/i, term: "cybersecurity", synonyms: ["information security", "FISMA", "FedRAMP", "CMMC", "zero trust", "NIST 800-171", "ATO", "Authority to Operate"] },
  { trigger: /\b(AI|artificial intelligence)\b/i, term: "AI", synonyms: ["artificial intelligence", "machine learning", "ML", "predictive analytics", "decision intelligence", "clinical decision support", "natural language processing", "NLP", "agentic AI"] },
  { trigger: /\b(interoperability)\b/i, term: "interoperability", synonyms: ["health data exchange", "FHIR", "HL7", "TEFCA", "USCDI", "health information exchange", "HIE", "data sharing"] },
  { trigger: /\b(cloud)\b/i, term: "cloud", synonyms: ["cloud computing", "cloud migration", "FedRAMP", "cloud hosting", "IaaS", "PaaS", "SaaS", "AWS GovCloud", "Azure Government"] },
  { trigger: /\b(SDVOSB)\b/i, term: "SDVOSB", synonyms: ["Service-Disabled Veteran-Owned Small Business", "VOSB", "veteran-owned", "VetCert", "VA OSDBU"] },
  { trigger: /\b(data analytics|analytics)\b/i, term: "data analytics", synonyms: ["business intelligence", "data visualization", "predictive analytics", "population health analytics", "clinical analytics", "data warehouse", "data lake"] },
  { trigger: /\b(medical device)\b/i, term: "medical device", synonyms: ["biomedical equipment", "FDA-cleared", "clinical device", "point-of-care", "wearable", "remote monitoring device", "durable medical equipment", "DME"] },
];

function expandSynonyms(topic) {
  const results = [];
  for (const entry of SYNONYM_MAP) {
    if (entry.trigger.test(topic)) {
      results.push({ term: entry.term, synonyms: entry.synonyms });
    }
  }
  return results;
}

module.exports = { optimizeMarketPrompt };
