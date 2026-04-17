// ============================================================
// premium-assistant.js — Shared assistant for Ask MMT + premium chat
//
// Given a natural-language question from a premium subscriber,
// run the federal-data enrichment stack in parallel, feed the
// verified facts to Claude Sonnet as context, and return a
// grounded markdown answer with source citations.
//
// Used by:
//   - ask-mmt-submit.js (asynchronous — draft answer in confirm email)
//   - premium-chat.js   (synchronous — chat reply)
// ============================================================

const { enrichWithFederalData, formatFederalDataContext } = require("./federal-data-apis");
const { enrichWithCongress, formatCongressContext } = require("./congress-api");
const { enrichWithGovInfo, formatGovInfoContext } = require("./govinfo-api");
const { enrichWithPubMed, formatPubMedContext } = require("./pubmed-api");
const { enrichWithGrants, formatGrantsContext } = require("./grants-api");
const { enrichWithAssistance, formatAssistanceContext } = require("./sam-assistance");
const { enrichWithUSAJobs, formatUSAJobsContext } = require("./usajobs-api");
const { enrichWithITDashboard, formatITDashboardContext } = require("./it-dashboard-api");
const { enrichWithCMSProviderData, formatCMSContext } = require("./cms-provider-data");
const { enrichWithClinicalTrials, formatClinicalTrialsContext } = require("./clinicaltrials-api");
const { enrichWithONCHealthIT, formatONCHealthITContext } = require("./onc-healthit-api");
const { enrichWithHHSOpenData, formatHHSOpenDataContext } = require("./hhs-open-data");
const { searchCorpus, formatCorpusContext } = require("./content-index");
const { detectVehicles, formatVehiclesContext, expandedSearchTerms } = require("./known-vehicles");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Default to Haiku — fast, cheap, and good enough for grounded Q&A where
// the model's job is to synthesize already-verified facts.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// Agency hints extracted from questions → acronym/code
const AGENCY_HINTS = {
  "veterans affairs": "VA", "va ": "VA", " va.": "VA", " va,": "VA",
  "defense health": "DHA", "dha ": "DHA",
  "health and human services": "HHS", "hhs ": "HHS",
  "medicare": "CMS", "medicaid": "CMS", "cms ": "CMS",
  "nih ": "NIH", "national institutes of health": "NIH",
  "indian health": "IHS",
  "department of defense": "DoD", "dod ": "DoD",
};

function detectAgency(text) {
  if (!text) return null;
  const lower = ` ${text.toLowerCase()} `;
  for (const [hint, code] of Object.entries(AGENCY_HINTS)) {
    if (lower.includes(hint)) return code;
  }
  return null;
}

const SYSTEM_PROMPT = `You are the Mission Meets Tech premium research assistant. You answer federal health IT procurement, policy, and market questions for paid subscribers.

HARD RULES:
- Use ONLY the "verified facts" block below as your factual base. That block contains (a) Mary's own MMT articles and premium briefs, and (b) direct federal API query results. Do not invent contract numbers, dollar amounts, deadlines, hiring counts, or citations.
- If the verified facts don't answer the question, say so plainly and recommend what to check next. Never fabricate to fill a gap.
- Quote the source inline. Examples: "(Mission Meets Tech, Mar 24 2026)", "(USASpending: PIID xxx)", "(SAM.gov notice xxx)", "(Congress.gov HR xxx)", "(PubMed PMID xxx)".
- When an MMT article is relevant, reference it by title AND link to the URL shown in the corpus. Mary's own coverage is the most valuable thing the subscriber paid for — surface it.
- Prefer specific numbers over generalities. If the verified facts give a dollar figure or date, use it.
- Be concise — 3-6 short paragraphs. Use bullets for lists of contracts, bills, or hearings.

VOICE (Mary Womack — warm but fierce, first-person, federal health IT pro):
- Warm but direct. First person ("I", "my team"). No em dashes.
- Do NOT use: "pivotal", "comprehensive", "robust", "transformative", "delve", "leverage", "ecosystem", "streamline", "holistic".
- Do NOT open with "Certainly", "Great question", or "I understand".

OUTPUT FORMAT (markdown):
- **1-sentence bottom line** at the top (what the subscriber needs to know first).
- Then the 3-6 paragraphs / bullets of substantive answer with inline citations.
- End with a "Sources" list pulling every inline citation into markdown links. Put MMT article links first so the subscriber can continue reading on the site.`;

async function runEnrichment(question) {
  // Detect any federal vehicles mentioned (OASIS+, T4NG2, MHS GENESIS, etc.).
  // Matched vehicles override the agency and search-term detection so that
  // a question like "what's going on with OASIS+?" gets queried as
  // 'OASIS+ OR OASIS Plus' instead of just tokenizing the question text.
  const matchedVehicles = detectVehicles(question);
  const vehicleAgency = matchedVehicles.length > 0 ? matchedVehicles[0].agency : null;
  const agency = detectAgency(question) || vehicleAgency;
  const agencyCodeMap = { VA: "036", DHA: "097", HHS: "075", DoD: "097", GSA: "047", NASA: "080", Army: "097" };
  const agencyCode = agencyCodeMap[agency];

  // If a vehicle was detected, use its canonical + alias search terms
  // as the primary query for USASpending/SAM. Otherwise fall back to
  // the raw question text (same behavior as before).
  const vehicleSearchTerms = expandedSearchTerms(matchedVehicles);
  const primaryQuery = vehicleSearchTerms.length > 0
    ? vehicleSearchTerms.join(" ")
    : question;
  const primaryNaics = matchedVehicles.length > 0 && matchedVehicles[0].naics.length > 0
    ? matchedVehicles[0].naics
    : undefined;

  const safe = (p) => p.catch((e) => ({ error: e.message }));

  // MMT content corpus search — uses the raw question so it picks up
  // nuance the vehicle dictionary doesn't know about.
  const corpusMatches = searchCorpus(question, 5);

  const [
    federalData,
    congressData,
    govinfoData,
    pubmedData,
    grantsData,
    assistanceData,
    usajobsData,
    itDashboardData,
    cmsData,
    ctgovData,
    oncHealthITData,
    hhsOpenData,
  ] = await Promise.all([
    safe(enrichWithFederalData({ topic: primaryQuery, agency: agency || undefined, naics: primaryNaics })),
    safe(enrichWithCongress({ topic: primaryQuery })),
    safe(enrichWithGovInfo({ topic: primaryQuery })),
    safe(enrichWithPubMed({ topic: question, yearsBack: 5 })),
    safe(enrichWithGrants({ topic: primaryQuery })),
    safe(enrichWithAssistance({ topic: primaryQuery, agency })),
    safe(enrichWithUSAJobs({ topic: primaryQuery })),
    safe(enrichWithITDashboard({ topic: primaryQuery, agencyCode })),
    safe(enrichWithCMSProviderData({ topic: question })),
    safe(enrichWithClinicalTrials({ topic: question })),
    safe(enrichWithONCHealthIT({ topic: question })),
    safe(enrichWithHHSOpenData({ topic: question })),
  ]);

  const context = [
    formatVehiclesContext(matchedVehicles),
    formatCorpusContext(corpusMatches),
    formatFederalDataContext(federalData),
    formatCongressContext(congressData),
    formatGovInfoContext(govinfoData),
    formatPubMedContext(pubmedData),
    formatGrantsContext(grantsData),
    formatAssistanceContext(assistanceData),
    formatUSAJobsContext(usajobsData),
    formatITDashboardContext(itDashboardData),
    formatCMSContext(cmsData),
    formatClinicalTrialsContext(ctgovData),
    formatONCHealthITContext(oncHealthITData),
    formatHHSOpenDataContext(hhsOpenData),
  ].filter(Boolean).join("");

  return {
    agency,
    context,
    hasAnyData: context.length > 0,
    corpusMatches: corpusMatches.length,
    vehiclesDetected: matchedVehicles.map((v) => v.canonical),
  };
}

async function callClaude({ question, context, model = DEFAULT_MODEL, maxTokens = 1500 }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const userPrompt = `Subscriber question: "${question}"

VERIFIED FACTS FROM DIRECT API QUERIES (these are the ONLY facts you may cite):
${context || "(No direct API results returned. Answer honestly — say what you can from general knowledge of federal health IT and recommend what the subscriber should check.)"}

Answer the subscriber now, following the voice and format rules in the system prompt.`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 45000);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const answer = (data.content || []).map((b) => b.text || "").join("").trim();
    return { answer, model, usage: data.usage };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Main entry point: given a question, return a grounded answer + sources.
 * @returns {Promise<{answer: string, agency: string|null, hasData: boolean, model: string, error?: string}>}
 */
async function answerQuestion({ question, maxTokens = 1500 }) {
  if (!question || question.trim().length < 3) {
    return { answer: "", error: "question too short", agency: null, hasData: false };
  }
  try {
    const { agency, context, hasAnyData } = await runEnrichment(question);
    const { answer, model, usage } = await callClaude({ question, context, maxTokens });
    return {
      answer,
      agency,
      hasData: hasAnyData,
      model,
      usage,
    };
  } catch (err) {
    return {
      answer: "",
      agency: null,
      hasData: false,
      error: err.message,
    };
  }
}

module.exports = {
  detectAgency,
  runEnrichment,
  answerQuestion,
};
