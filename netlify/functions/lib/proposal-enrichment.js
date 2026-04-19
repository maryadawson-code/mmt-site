// ============================================================
// proposal-enrichment.js — ProposalPulse pre-scoring enrichment
//
// Before handing a proposal to the scoring model, pull two
// external-evidence layers that let the evaluator persona catch
// what static document analysis misses:
//
//   1. BLS OEWS wage benchmarks for each labor category in the
//      proposal → flag over/under-priced rates
//   2. PubMed peer-reviewed evidence matching PWS/SOW technical
//      keywords → flag proposals unaware of current evidence base
//
// Both layers are non-blocking: if an API call fails, scoring
// proceeds without the enrichment (logged, not thrown).
// ============================================================

const { benchmarkProposalRates, formatBLSContext } = require("./bls-api");
const { enrichProposalEvidence, formatPubMedContext } = require("./pubmed-api");
const { checkLaborCompliance, formatWageDeterminationsContext } = require("./sam-wage-determinations");
const { verifyCertificationClaim, formatCHPLContext } = require("./onc-chpl-api");

// ------------------------------------------------------------
// Labor category extraction
// ------------------------------------------------------------

// Pattern 1: "Senior Systems Analyst ... $175/hr" (same line or nearby)
// Pattern 2: table rows like "Senior Systems Analyst | 1800 | $175"
// We keep the regex conservative — false positives are worse than false negatives.
const LABOR_TITLE_PATTERNS = [
  /(?:senior |sr\.? |junior |jr\.? |principal |lead |staff )?(systems? analyst|software (?:engineer|developer)|data (?:scientist|engineer|analyst)|devops engineer|cloud (?:engineer|architect)|enterprise architect|systems? administrator|network engineer|database administrator|cyber(?:security)? (?:analyst|engineer)|security engineer|information security analyst|(?:it |program )?project manager|program manager|technical writer|business analyst|management analyst|clinical informaticist|health informatics|ehr specialist|research scientist)/i,
];

const RATE_PATTERN = /\$\s?(\d{2,4}(?:\.\d{2})?)\s*(?:\/\s*(?:hr|hour|h))/i;

// Common federal metros — match proposal "place of performance"
const LOCATION_PATTERNS = [
  /washington(?:,?\s*(?:dc|d\.c\.))?/i,
  /arlington,?\s*va/i,
  /alexandria,?\s*va/i,
  /baltimore/i,
  /san antonio/i,
  /honolulu/i,
  /norfolk/i,
  /virginia beach/i,
  /huntsville/i,
  /denver/i,
  /colorado springs/i,
  /atlanta/i,
  /tampa/i,
];

function extractLocation(text) {
  if (!text) return "national";
  for (const p of LOCATION_PATTERNS) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return "national";
}

/**
 * Extract labor categories with rates from a proposal's text.
 * Scans line-by-line and bundles the title with any $/hr found on
 * the same line or the following 2 lines.
 */
function extractLaborCategories(text) {
  if (!text) return [];
  const location = extractLocation(text);
  const lines = text.split(/\r?\n/);
  const cats = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let titleMatch = null;
    for (const p of LABOR_TITLE_PATTERNS) {
      const m = line.match(p);
      if (m) { titleMatch = m; break; }
    }
    if (!titleMatch) continue;

    const title = titleMatch[0].trim();
    const window = [line, lines[i + 1] || "", lines[i + 2] || ""].join(" ");
    const rateMatch = window.match(RATE_PATTERN);
    const hourly_rate = rateMatch ? parseFloat(rateMatch[1]) : null;

    const key = `${title.toLowerCase()}:${hourly_rate || "null"}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cats.push({ title, hourly_rate, location });
    if (cats.length >= 8) break;
  }
  return cats;
}

// ------------------------------------------------------------
// Clinical / technical keyword extraction
// ------------------------------------------------------------

// Domain terms that signal a PubMed query should be relevant.
// Deliberately MMT-shaped: federal health IT + DHA/VA/HHS topic space.
const CLINICAL_KEYWORDS = [
  "ehr", "electronic health record", "interoperability", "fhir", "hl7",
  "telehealth", "telemedicine", "remote patient monitoring",
  "surgical readiness", "trauma", "combat casualty care",
  "glp-1", "diabetes", "obesity",
  "ptsd", "tbi", "traumatic brain injury", "suicide prevention",
  "opioid", "substance use",
  "ai diagnostics", "clinical decision support", "radiology ai",
  "genomics", "precision medicine",
  "vha", "va community care", "mhs genesis",
  "cybersecurity", "ransomware healthcare", "hipaa",
  "claims processing", "prior authorization",
  "naion", "vision", "ophthalmology",
  "maternal health", "pediatric",
];

function extractClinicalKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const k of CLINICAL_KEYWORDS) {
    if (lower.includes(k)) hits.push(k);
    if (hits.length >= 6) break;
  }
  return hits;
}

// ------------------------------------------------------------
// Main entry point — run both enrichments in parallel
// ------------------------------------------------------------

/**
 * Enrich a proposal with external evidence before scoring.
 * Safe to call with empty/malformed text — returns empty context.
 *
 * @param {Object} params
 * @param {string} params.documentText - extracted proposal text
 * @param {string} [params.sowText] - extracted SOW/PWS text (preferred
 *                                    for keyword extraction if present)
 * @returns {Promise<{context: string, laborCategories: Array, keywords: Array, evidenceCount: number}>}
 */
// --- ONC CHPL claim extraction ---
// Match phrases like "ONC 2015 Edition Cures certified", "certified to 2015 Edition"
const CHPL_CLAIM_PATTERN = /(?:ONC[-\s]?)?(?:certified|certification)\b[^.]{0,120}?(2015 Edition(?:\s+Cures(?:\s+Update)?)?|2014 Edition)/i;
const VENDOR_CLAIM_PATTERN = /\b(Epic|Oracle Health|Cerner|MEDITECH|Allscripts|athenahealth|NextGen|eClinicalWorks|Greenway)\b/i;
// CHPL product IDs follow the format {edition}.{product_code}.{developer_code}.{vendor}.{type}.{version}
// — e.g. "15.04.04.2891.Epic.AM.13". Treat a match as both an edition AND vendor claim.
const CHPL_ID_PATTERN = /\b(1[45])\.(\d{2})\.(\d{2})\.(\d{4})\.([A-Za-z][A-Za-z0-9]*)\.(AM|EH|IN|SM|RL|RD)\.(\d{1,3})\b/;

function extractCHPLClaim(text) {
  if (!text) return null;
  const idMatch = text.match(CHPL_ID_PATTERN);
  const edMatch = text.match(CHPL_CLAIM_PATTERN);
  const vendorMatch = text.match(VENDOR_CLAIM_PATTERN);
  if (!idMatch && !edMatch && !vendorMatch) return null;
  return {
    vendor: idMatch ? idMatch[5] : (vendorMatch ? vendorMatch[1] : null),
    edition: idMatch ? (idMatch[1] === "15" ? "2015 Edition" : "2014 Edition") : (edMatch ? edMatch[1] : null),
    chpl_id: idMatch ? idMatch[0] : null,
  };
}

// --- State/county extraction for SCA wage determination lookup ---
// Very conservative — only pull state if explicitly named after "place of performance"
const STATE_CODES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
function extractStateCounty(text) {
  if (!text) return { state: null, county: null };
  const popMatch = text.match(/place of performance[^.]*?\b([A-Z]{2})\b/i);
  if (popMatch && STATE_CODES.includes(popMatch[1].toUpperCase())) {
    return { state: popMatch[1].toUpperCase(), county: null };
  }
  const directStateMatch = text.match(/\b(?:performed|located|primary site)\b[^.]{0,60}?\b([A-Z]{2})\b/);
  if (directStateMatch && STATE_CODES.includes(directStateMatch[1])) {
    return { state: directStateMatch[1], county: null };
  }
  return { state: null, county: null };
}

async function enrichProposal({ documentText, sowText }) {
  const textForLabor = documentText || "";
  const textForKeywords = sowText || documentText || "";

  const laborCategories = extractLaborCategories(textForLabor);
  const keywords = extractClinicalKeywords(textForKeywords);
  // CHPL claims are the CONTRACTOR's assertion in the proposal, not
  // the government's ask in the SOW. Extract from documentText only.
  const chplClaim = extractCHPLClaim(documentText || "");
  const { state, county } = extractStateCounty(textForLabor);

  const [blsResult, pubmedResult, wdResult, chplResult] = await Promise.all([
    laborCategories.length > 0
      ? benchmarkProposalRates(laborCategories).catch((e) => ({ error: e.message, benchmarks: [], flags: [] }))
      : Promise.resolve({ benchmarks: [], flags: [] }),
    keywords.length > 0
      ? enrichProposalEvidence({ keywords, yearsBack: 5 }).catch((e) => ({ error: e.message, articles: [], count: 0 }))
      : Promise.resolve({ articles: [], count: 0 }),
    state && laborCategories.length > 0
      ? checkLaborCompliance({ state, county, categories: laborCategories }).catch((e) => ({ error: e.message, flags: [] }))
      : Promise.resolve({ flags: [] }),
    chplClaim && chplClaim.vendor
      ? verifyCertificationClaim({ vendorName: chplClaim.vendor, productName: null, edition: chplClaim.edition }).catch((e) => ({ error: e.message, products: [], verified: false, reason: e.message }))
      : Promise.resolve(null),
  ]);

  const blsContext = formatBLSContext(blsResult);
  const pubmedContext = formatPubMedContext(pubmedResult);
  const wdContext = formatWageDeterminationsContext(wdResult);
  const chplContext = chplResult ? formatCHPLContext(chplResult) : "";

  const context = [blsContext, pubmedContext, wdContext, chplContext].filter(Boolean).join("");

  return {
    context,
    laborCategories,
    keywords,
    laborFlags: blsResult.flags || [],
    wageDeterminationFlags: wdResult.flags || [],
    chplVerified: chplResult ? chplResult.verified : null,
    chplClaim,
    evidenceCount: pubmedResult.articles?.length || 0,
  };
}

module.exports = {
  extractLaborCategories,
  extractClinicalKeywords,
  enrichProposal,
};
