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
const { enrichWithCALC, formatCALCContext } = require("./calc-rates");
const { enrichWithECFR, formatECFRContext } = require("./ecfr-api");
const { enrichWithRegulationsGov, formatRegulationsGovContext } = require("./regulations-gov");
// Sprint 5 2026-05-15: 5 additional federal-API enrichments.
const { enrichWithBLS, formatBLSContext } = require("./bls-api");
const { enrichWithCHPL, formatCHPLContext } = require("./onc-chpl-api");
const { enrichWithContractAwards, formatContractAwardsContext } = require("./sam-contract-awards");
const { enrichWithWageDeterminations, formatWageDeterminationsContext } = require("./sam-wage-determinations");
const { enrichWithEDGAR, formatEDGARContext } = require("./sec-edgar-api");
const { searchCorpus, formatCorpusContext } = require("./content-index");
const { detectVehicles, formatVehiclesContext, expandedSearchTerms } = require("./known-vehicles");
// Sprint 6 Phase 2 2026-05-15: optional circuit breakers + metrics.
// Both gates default OFF — code paths byte-identical to Sprint 5 unless
// ASK_MMT_CIRCUITS_ENABLED=true and/or ASK_MMT_METRICS_ENABLED=true are
// set in Netlify env. Rollout is a Mary-controlled flip; see Sprint 6 spec.
const { getCircuit } = require("./circuit-registry");
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CIRCUITS_ENABLED = process.env.ASK_MMT_CIRCUITS_ENABLED === "true";
const METRICS_ENABLED = process.env.ASK_MMT_METRICS_ENABLED === "true";

function getSupabaseForMetrics() {
  if (!METRICS_ENABLED) return null;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  try { return createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY); }
  catch { return null; }
}

// 8s timeout shared by safe() and instrument(). Module-scope so instrument()
// can reuse it; matches Sprint 5 Phase C behavior exactly.
function withTimeout(p) {
  return Promise.race([
    p.catch((e) => ({ error: e && e.message ? e.message : String(e) })),
    new Promise((resolve) => setTimeout(() => resolve({ error: "timeout-8s" }), 8000)),
  ]);
}

// Wraps an enrichment promise with optional circuit breaker + timing
// metrics. If CIRCUITS_ENABLED is false, behavior is byte-identical to
// the Sprint 5 safe() path (8s timeout + caught error → { error }).
// If anything inside the wrapper throws unexpectedly, we return
// { error: msg } instead of re-running fn() so prod cannot break.
async function instrument(circuitName, fn, supabase) {
  const start = Date.now();
  let result, hadError = false, errMsg = null, openCircuit = false;
  try {
    if (CIRCUITS_ENABLED) {
      const circuit = getCircuit(circuitName);
      if (circuit) {
        try {
          result = await withTimeout(Promise.resolve().then(() => circuit.execute(fn)));
        } catch (err) {
          if (err && err.name === "CircuitOpenError") {
            openCircuit = true;
            result = { error: "circuit_open", circuit: circuitName };
          } else {
            hadError = true;
            errMsg = err && err.message;
            result = { error: errMsg };
          }
        }
      } else {
        result = await withTimeout(fn());
      }
    } else {
      result = await withTimeout(fn());
    }
    if (result && result.error === "timeout-8s") { hadError = true; errMsg = "timeout-8s"; }
    else if (result && result.error && !openCircuit) { hadError = true; errMsg = result.error; }
  } catch (outerErr) {
    console.error("instrument wrapper crash:", outerErr && outerErr.message);
    result = { error: outerErr && outerErr.message };
    hadError = true;
    errMsg = outerErr && outerErr.message;
  }
  const elapsed = Date.now() - start;
  if (METRICS_ENABLED && supabase) {
    Promise.resolve().then(async () => {
      try {
        await supabase.from("ops_events").insert({
          event_type: "ask_mmt_api_call",
          details: {
            api: circuitName,
            elapsed_ms: elapsed,
            had_error: hadError,
            error: errMsg,
            open_circuit: openCircuit,
            had_data: !hadError && !openCircuit && !!(result && (Array.isArray(result) ? result.length : Object.keys(result || {}).length > 0)),
          },
        });
      } catch { /* never throw from telemetry */ }
    });
  }
  return result;
}

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

WHAT COUNTS AS A VERIFIED FACT (read carefully — the verified-facts block can contain several kinds of evidence, any of which is sufficient to answer from):
  1. MMT ORIGINAL CONTENT — Mary's published articles, weekly Friday briefs, and monthly briefs. If the block above contains entries under "MMT ORIGINAL CONTENT", that is first-class verified evidence. Answer from it confidently.
  2. FEDERAL VEHICLE BASELINE — MMT-curated canonical facts about federal IDIQs (OASIS+, T4NG2, MHS GENESIS, etc.). These are first-class too.
  3. Live federal API query results (USASpending, SAM.gov, Congress.gov, PubMed, ClinicalTrials.gov, etc.) — also first-class.

HARD RULES:
- If ANY of the three evidence classes above is present in the block, answer from it. Do NOT say "I don't have verified facts" when MMT articles or vehicle baselines are in the block — they ARE verified facts.
- If the block contains MMT articles relevant to the question, lead with what Mary wrote. Quote a specific excerpt when it sharpens the answer. Link to the URL.
- Do not invent contract numbers, dollar amounts, deadlines, hiring counts, or citations that aren't in the block.
- If the block is genuinely empty on the question, say so plainly and recommend what to check next. Never fabricate to fill a gap. (Empty means zero MMT articles AND zero API results — not just "the API returned nothing for this specific keyword.")
- Quote sources inline. Examples: "(Mission Meets Tech, Mar 24 2026)", "(USASpending: PIID xxx)", "(SAM.gov notice xxx)", "(Congress.gov HR xxx)", "(PubMed PMID xxx)".
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

  // Sprint 5 2026-05-15: 8s per-enrichment timeout. Sprint 6 2026-05-15
  // Phase 2: same behavior, but the helper now lives at module scope as
  // withTimeout() so instrument() can reuse it. safe() is kept inline for
  // the CALC enrichment which has no circuit per the Sprint 6 mapping.
  const safe = withTimeout;

  // Optional metrics client. Returns null unless ASK_MMT_METRICS_ENABLED=true.
  const metricsSb = getSupabaseForMetrics();

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
    calcData,
    ecfrData,
    regsGovData,
    blsData,
    chplData,
    contractAwardsData,
    wageDetData,
    edgarData,
  ] = await Promise.all([
    instrument("usaspending",             () => enrichWithFederalData({ topic: primaryQuery, agency: agency || undefined, naics: primaryNaics }), metricsSb),
    instrument("congress",                () => enrichWithCongress({ topic: primaryQuery }),                                     metricsSb),
    instrument("govinfo",                 () => enrichWithGovInfo({ topic: primaryQuery }),                                      metricsSb),
    instrument("pubmed",                  () => enrichWithPubMed({ topic: question, yearsBack: 5 }),                             metricsSb),
    instrument("grants",                  () => enrichWithGrants({ topic: primaryQuery }),                                       metricsSb),
    instrument("sam_assistance",          () => enrichWithAssistance({ topic: primaryQuery, agency }),                           metricsSb),
    instrument("usajobs",                 () => enrichWithUSAJobs({ topic: primaryQuery }),                                      metricsSb),
    instrument("it_dashboard",            () => enrichWithITDashboard({ topic: primaryQuery, agencyCode }),                      metricsSb),
    instrument("cms",                     () => enrichWithCMSProviderData({ topic: question }),                                  metricsSb),
    instrument("clinicaltrials",          () => enrichWithClinicalTrials({ topic: question }),                                   metricsSb),
    instrument("onc_healthit",            () => enrichWithONCHealthIT({ topic: question }),                                      metricsSb),
    instrument("hhs_open",                () => enrichWithHHSOpenData({ topic: question }),                                      metricsSb),
    // CALC has no circuit per Sprint 6 mapping (GSA, low traffic). safe() = withTimeout().
    safe(enrichWithCALC({ topic: question })),
    instrument("ecfr",                    () => enrichWithECFR({ topic: question }),                                             metricsSb),
    instrument("regulations_gov",         () => enrichWithRegulationsGov({ topic: question }),                                   metricsSb),
    instrument("bls",                     () => enrichWithBLS({ topic: question }),                                              metricsSb),
    instrument("onc_chpl",                () => enrichWithCHPL({ topic: question }),                                             metricsSb),
    instrument("sam_contract_awards",     () => enrichWithContractAwards({ topic: primaryQuery, agency }),                       metricsSb),
    instrument("sam_wage_determinations", () => enrichWithWageDeterminations({ topic: question }),                               metricsSb),
    // EDGAR takes a competitor list — empty by default until callers can
    // pass company context. Skipped result is a no-op so no answer regression.
    instrument("sec_edgar",               () => enrichWithEDGAR({ competitors: [] }),                                            metricsSb),
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
    formatCALCContext(calcData),
    formatECFRContext(ecfrData),
    formatRegulationsGovContext(regsGovData),
    formatBLSContext(blsData || {}),
    formatCHPLContext(chplData),
    formatContractAwardsContext(contractAwardsData),
    formatWageDeterminationsContext(wageDetData),
    formatEDGARContext(edgarData),
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

VERIFIED FACTS AVAILABLE (cite any of these — the block may contain MMT articles, MMT federal-vehicle baselines, MMT contract intel, MMT capture-intel signals, MMT IDIQ-vehicle analyst notes, and live federal API results. All are first-class evidence. Treat "MMT ORIGINAL CONTENT" entries and IDIQ vehicle excerpts as things Mary has already published — answer from them and cite the URL):
${context || "(Nothing matched on either the MMT corpus or the live federal APIs. Answer honestly — say what you can from general knowledge and recommend what the subscriber should check next. Do NOT invent facts.)"}

Answer the subscriber now, following the voice and format rules in the system prompt. If the block contains MMT coverage of the topic, lead with what I wrote and quote the most relevant line.`;

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
