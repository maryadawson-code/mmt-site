/**
 * signal-extractor.js — Lightweight intelligence signal extraction.
 *
 * Extracts vehicle references, agency references, and domain keywords
 * from document text using regex. No AI calls, no external APIs.
 * Runs synchronously and is designed to be fast and non-blocking.
 *
 * Used by: score-deck-background.js, generate-tactical-brief-background.js,
 *          contract-intel-refresh-background.js
 */

const VEHICLE_PATTERNS = [
  { pattern: /\bT4NG2?\b/gi, key: "T4NG" },
  { pattern: /\bOASIS\s*\+|OASIS\s*Plus\b/gi, key: "OASIS+" },
  { pattern: /\bOASIS\b(?!\s*\+|\s*Plus)/gi, key: "OASIS" },
  { pattern: /\bCIO-?SP3\b/gi, key: "CIO-SP3" },
  { pattern: /\bCIO-?SP4\b/gi, key: "CIO-SP4" },
  { pattern: /\bAlliant\s*[23]\b/gi, key: "Alliant 3" },
  { pattern: /\bVETS\s*2?\b/gi, key: "VETS 2" },
  { pattern: /\bSEWP\s*(V|VI)?\b/gi, key: "SEWP" },
  { pattern: /\b8\(a\)\s*STARS|STARS\s*III\b/gi, key: "8(a) STARS III" },
  { pattern: /\bGSA\s*(MAS|Schedule)\b/gi, key: "GSA MAS" },
  { pattern: /\bEIS\b(?!\s*D)/gi, key: "EIS" },
  { pattern: /\bITES-3S\b/gi, key: "ITES-3S" },
  { pattern: /\bMHS\s*GENESIS\b/gi, key: "MHS GENESIS" },
  { pattern: /\bOMNIBUS\s*(IV|4)\b/gi, key: "OMNIBUS IV" },
];

const AGENCY_PATTERNS = [
  { pattern: /\bDHA\b|Defense\s+Health\s+Agency/gi, key: "DHA" },
  { pattern: /\bVA\b|Veterans\s+Affairs|VHA\b/gi, key: "VA" },
  { pattern: /\bOIT\b|Office\s+of\s+Information\s+and\s+Technology/gi, key: "VA OIT" },
  { pattern: /\bFEHRM\b/gi, key: "FEHRM" },
  { pattern: /\bPEO\s*DHMS\b/gi, key: "PEO DHMS" },
  { pattern: /\bCMS\b|Centers\s+for\s+Medicare/gi, key: "CMS" },
  { pattern: /\bDoD\b|Department\s+of\s+Defense/gi, key: "DoD" },
  { pattern: /\bCDAO\b/gi, key: "CDAO" },
  { pattern: /\bNIH\b|National\s+Institutes?\s+of\s+Health/gi, key: "NIH" },
  { pattern: /\bIHS\b|Indian\s+Health\s+Service/gi, key: "IHS" },
  { pattern: /\bHHS\b|Health\s+and\s+Human\s+Services/gi, key: "HHS" },
];

const TOPIC_KEYWORDS = [
  "telehealth", "EHR", "electronic health record", "FHIR", "interoperability",
  "cybersecurity", "zero trust", "cloud", "artificial intelligence", "AI",
  "machine learning", "data analytics", "remote patient monitoring",
  "mobile health", "mHealth", "health information exchange", "HIE",
  "TRICARE", "pharmacy", "clinical decision support", "medical readiness",
  "population health", "health surveillance", "FedRAMP",
];

/**
 * Extract intelligence signals from document text.
 * @param {string} text - Document or research text to analyze
 * @param {Object} metadata - Optional context (document_type, score, verdict, etc.)
 * @returns {Array<{type: string, key: string, value: Object}>}
 */
function extractIntelSignals(text, metadata = {}) {
  if (!text || typeof text !== "string") return [];

  const signals = [];
  const seen = new Set();

  // Vehicle detection
  for (const { pattern, key } of VEHICLE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text) && !seen.has(`vehicle:${key}`)) {
      seen.add(`vehicle:${key}`);
      signals.push({
        type: "vehicle_interest",
        key,
        value: { ...metadata, detected_in: "document_text" },
      });
    }
  }

  // Agency detection
  for (const { pattern, key } of AGENCY_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text) && !seen.has(`agency:${key}`)) {
      seen.add(`agency:${key}`);
      signals.push({
        type: "agency_interest",
        key,
        value: { ...metadata, detected_in: "document_text" },
      });
    }
  }

  // Topic keyword frequency
  const lowerText = text.toLowerCase();
  const topicCounts = [];
  for (const keyword of TOPIC_KEYWORDS) {
    const re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = text.match(re);
    if (matches && matches.length > 0) {
      topicCounts.push({ keyword, count: matches.length });
    }
  }

  // Top 5 topics by frequency
  topicCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .forEach(({ keyword, count }) => {
      signals.push({
        type: "topic_interest",
        key: keyword,
        value: { ...metadata, frequency: count, detected_in: "document_text" },
      });
    });

  return signals;
}

module.exports = { extractIntelSignals, VEHICLE_PATTERNS, AGENCY_PATTERNS, TOPIC_KEYWORDS };
