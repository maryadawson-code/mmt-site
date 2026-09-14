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
const { searchCorpus, formatCorpusContext, loadCorpus } = require("./content-index");
// 2026-09-13: optional systems run only when the question calls for them,
// and the model gets a verified acronym reference built from the context.
const { classifyQuestion, systemsFor } = require("./question-shape");
const { acronymReference, setGlossaryLoader } = require("./acronyms");
const { detectVehicles, formatVehiclesContext, expandedSearchTerms } = require("./known-vehicles");
// 2026-09-10: per-answer `sources` array. The catalog in ask-mmt-sources.js is
// the same list build.js renders on /ask/sources, so the page and the code
// cannot drift.
const { buildSources, splitFederalData, CATALOG_BY_ID } = require("./ask-mmt-sources");
// 2026-09-10: question -> search terms (no more sending the sentence as the
// keyword), and a federal-sites-only web search when the structured
// award/opportunity sources are silent.
const { extractSearchTerms } = require("./query-terms");
const { detectAgencies, agencyCgac, agencyName } = require("./federal-agencies");
const { webFederalSearch, formatWebFederalContext, shouldWebFallback } = require("./web-federal-search");
// 2026-09-14: post-answer guards. The prompt says what the model may cite;
// these check the finished answer (links it did not retrieve are de-linked,
// a model-written Sources tail is dropped, unsupported dollar figures are
// counted in shadow mode).
const { stripSourcesSection, enforceLinks, dollarGuard, enforceVoice } = require("./answer-guards");
// Sprint 6 Phase 2 2026-05-15: optional circuit breakers + metrics.
// Both gates default OFF — code paths byte-identical to Sprint 5 unless
// ASK_MMT_CIRCUITS_ENABLED=true and/or ASK_MMT_METRICS_ENABLED=true are
// set in Netlify env. Rollout is a Mary-controlled flip; see Sprint 6 spec.
const { getCircuit } = require("./circuit-registry");
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");

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

// Default to Haiku: fast, cheap, and good enough for grounded Q&A where
// the model's job is to synthesize already-verified facts. Read at call
// time so ASK_MMT_MODEL can switch the deployed function (and a test) with
// no code change.
const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
function defaultModel() {
  return process.env.ASK_MMT_MODEL || FALLBACK_MODEL;
}
function isHaiku(model) {
  return String(model || "").toLowerCase().includes("haiku");
}
// Haiku answers in a few seconds; the abort is a backstop for a hung
// connection, not a budget. Sonnet and Opus get the older, longer window.
const CLAUDE_TIMEOUT_HAIKU_MS = 25000;
const CLAUDE_TIMEOUT_OTHER_MS = 45000;

/** YYYY-MM-DD in America/New_York (the site's clock). */
function dateET(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// DoD (CGAC 097 and the three military departments, which carry their own
// CGAC in the registry) publishes award data to USAspending on a delay.
// The model is told so it does not read "no award since June" as a fact.
const DOD_CGACS = new Set(["097", "021", "017", "057"]);
const AWARD_DELAY_DAYS = 90;
function awardDelayNote(cgac, now = new Date()) {
  if (!cgac || !DOD_CGACS.has(String(cgac))) return "";
  const since = new Date(now.getTime() - AWARD_DELAY_DAYS * 86400000);
  return `\n\nAWARD DATA DELAY: DoD award data becomes public on USAspending about 90 days after award (USAspending About the Data), so awards signed since ${dateET(since)} may not appear yet.`;
}

// MMT's glossary (corpus items of type "glossary") is the first place an
// acronym expansion comes from; the curated table in lib/acronyms.js is
// second; anything else the model must write as-is.
setGlossaryLoader(() => {
  const corpus = loadCorpus();
  const m = new Map();
  for (const it of (corpus && corpus.items) || []) {
    if (it && it.type === "glossary" && it.title && it.expansion) m.set(String(it.title), String(it.expansion));
  }
  return m;
});

// Past this age the model is told when MMT last covered the question, so a
// March status is not read back as today's.
const ARCHIVE_STALE_DAYS = 60;

/** Pure: the MMT ARCHIVE RECENCY line, or "" when the newest match is fresh. */
function archiveRecencyNote(corpusMatches, now = new Date()) {
  const dates = (corpusMatches || [])
    .map((m) => (m && m.date ? new Date(m.date) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  if (!dates.length) return "";
  const newest = new Date(Math.max(...dates.map((d) => d.getTime())));
  const ageDays = Math.floor((now.getTime() - newest.getTime()) / 86400000);
  if (ageDays <= ARCHIVE_STALE_DAYS) return "";
  return `\n\nMMT ARCHIVE RECENCY: the newest MMT source matched on this question is dated ${newest.toISOString().slice(0, 10)} (${ageDays} days ago). Anything since then is only in the live systems in this block; say when MMT last covered it rather than presenting that status as current.`;
}

// Agency detection is the registry's job (lib/federal-agencies.js, 27
// agencies). It used to be an eight-entry substring map here, so a question
// about FDA, CDC, HRSA, ARPA-H, ONC or the Army detected no agency at all
// and every downstream filter ran unscoped.
function detectAgency(text) {
  if (!text) return null;
  return detectAgencies(text)[0] || null;
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
- CONFLICTS: when two records in the block disagree on status, date, awardee or dollar value, say so in the bottom line, cite both with their dates, and prefer the later-dated live record; never pick one silently.
- AWARD FIELDS: USASpending award amount is the potential value as reported to FPDS; obligated is money actually committed. Name the field you are quoting. Never call either the contract value. Never add, average or annualize amounts yourself; if the block carries a computed totals line, quote it.
- If the block contains an AWARD DATA DELAY line, repeat it in the answer.
- If the block is genuinely empty on the question, say so plainly and recommend what to check next. Never fabricate to fill a gap. (Empty means zero MMT articles AND zero API results, not just "the API returned nothing for this specific keyword.") Use this exact shape for the bottom line in that case: "I don't have a source for that in the systems I read. Where I'd look: <the one or two primary sources most likely to hold it>. If you want it researched properly, MarketPulse delivers a source-cited brief in 24 hours (https://missionmeetstech.com/marketpulse)." Do not pad an empty answer with general knowledge dressed up as fact.
- If a system listed under SYSTEMS NOT REACHED would normally hold the answer (SAM.gov for solicitations, USASpending for awards), say that it could not be checked this turn and name it. Never imply "no such record exists" because a system was silent.
- ACRONYMS: expand an acronym only with the expansion given in the ACRONYM REFERENCE block or spelled out in a source excerpt. If neither gives it, write the acronym exactly as it appears in the source. Never guess what letters stand for.
- LIVE RECORDS: every live federal record in the block that matches the question's agency and topic (an award, a notice, a docket, a report) must appear in the answer with its citation, or be set aside in one clause that says why it is not the thing asked about (for example, a related award under a different vehicle). Never tell the subscriber to go check a system whose matching record is already in the block.
- DATES: MMT sources carry their dates. When the block's MMT ARCHIVE RECENCY line says the newest MMT source is more than 60 days old, say when MMT last covered the question and that anything since would show only in the live systems. Do not present an old status as current.
- The MarketPulse sentence belongs only in the empty-block shape above. Do not add product pitches to an answer that has evidence.
- PRODUCT AND VENDOR QUESTIONS: an award whose description names the product is an award tied to that product even when the recipient is a reseller or integrator (a NASA SEWP order to Thundercat "for GetWell Network" is a GetWell award); report the recipient, the buying office, the amount, the dates and the description. Awards under "RECIPIENTS NAMED LIKE" are the vendor's own primes. A keyword that only matches a street address or an unrelated word (an IRS facility on Getwell Road) is not a match; say you set it aside. Never report "no awards" while the block holds an award whose description names the product.
- FOLLOW-UPS: when the question only makes sense with the previous turn ("the product is X", "regardless of who got them", "what about VA?"), answer it as a continuation using the block. Do not ask the subscriber to repeat what the prior turn already said.
- WEB SEARCH OF FEDERAL SITES results are leads, not verified facts: attribute them to the page URL, say they came from a web search, and tell the subscriber to verify on the page. A web lead never sets the bottom line: when MMT coverage or a live federal record speaks to the question, the bottom line comes from those, and the lead is mentioned after it.
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
- Do not append a Sources section; the reader sees the server-built sources list under your answer. Keep inline citations in parentheses.`;

async function runEnrichment(question, { now = new Date() } = {}) {
  // Detect any federal vehicles mentioned (OASIS+, T4NG2, MHS GENESIS, etc.).
  // Matched vehicles override the agency and search-term detection so that
  // a question like "what's going on with OASIS+?" gets queried as
  // 'OASIS+ OR OASIS Plus' instead of just tokenizing the question text.
  const matchedVehicles = detectVehicles(question);
  const vehicleAgency = matchedVehicles.length > 0 ? matchedVehicles[0].agency : null;
  const terms = extractSearchTerms(question);
  const agency = detectAgency(question) || terms.agency || vehicleAgency;
  const agencyCode = agency ? agencyCgac(agency) : undefined;

  // If a vehicle was detected, use its canonical + alias search terms
  // as the primary query for USASpending/SAM. Otherwise fall back to
  // the raw question text (same behavior as before).
  const vehicleSearchTerms = expandedSearchTerms(matchedVehicles);
  // Never the raw sentence: "Tell me all about data governence awards in
  // the DHA" becomes "data governance" (agency carried separately).
  const topicQuery = terms.phrase || question;
  const primaryQuery = vehicleSearchTerms.length > 0
    ? vehicleSearchTerms.join(" ")
    : topicQuery;
  const primaryNaics = matchedVehicles.length > 0 && matchedVehicles[0].naics.length > 0
    ? matchedVehicles[0].naics
    : undefined;
  // A short phrase with no known vehicle may be a vendor or product name
  // ("GetWell", "Oracle Health"); the recipient search costs nothing and
  // returns nothing when no recipient carries the name.
  const recipientName = matchedVehicles.length === 0 && terms.phraseTokens.length >= 1 && terms.phraseTokens.length <= 3
    ? terms.phrase
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
  const corpusMatches = searchCorpus(terms.corrected || question, 5, terms.phrase);

  // Which optional systems this question calls for (lib/question-shape.js).
  // A system that is not routed is not queried, is not "not reached", and
  // cannot become a source.
  const { shapes } = classifyQuestion(question);
  const routed = systemsFor(shapes);
  const optional = (id, fn) => (routed.has(id) ? instrument(id, fn, metricsSb) : Promise.resolve({ skipped: "not_relevant" }));

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
    // The federal layer derives fiscal-year windows, set-aside codes and
    // obligation intent from its `topic`, but the topic it receives is the
    // stripped phrase (years and set-aside words already removed), so those
    // come from the question's own terms here.
    instrument("usaspending",             () => enrichWithFederalData({
      topic: primaryQuery, agency: agency || undefined, naics: primaryNaics, recipientName,
      rungs: matchedVehicles.length ? [matchedVehicles[0].canonical, ...vehicleSearchTerms] : undefined,
      since: terms.since || undefined,
      setAside: terms.setAside && Array.isArray(terms.setAside.codes) && terms.setAside.codes.length ? terms.setAside.codes : undefined,
      wantsObligations: /\b(obligat\w*|spen[dt]\w*|paid|pay|pays|bought|buy|buys|cost|costs|since|fy\s?\d|year|years)\b/i.test(question),
    }), metricsSb),
    instrument("congress",                () => enrichWithCongress({ topic: primaryQuery, relevanceTokens: vehicleSearchTerms.length > 0 ? undefined : terms.tokens }), metricsSb),
    instrument("govinfo",                 () => enrichWithGovInfo({ topic: primaryQuery }),                                      metricsSb),
    optional("pubmed",                    () => enrichWithPubMed({ topic: topicQuery, yearsBack: 5 })),
    optional("grants",                    () => enrichWithGrants({ topic: primaryQuery })),
    optional("sam_assistance",            () => enrichWithAssistance({ topic: primaryQuery, agency })),
    optional("usajobs",                   () => enrichWithUSAJobs({ topic: primaryQuery })),
    instrument("it_dashboard",            () => enrichWithITDashboard({ topic: primaryQuery, agencyCode }),                      metricsSb),
    instrument("cms",                     () => enrichWithCMSProviderData({ topic: topicQuery }),                                  metricsSb),
    optional("clinicaltrials",            () => enrichWithClinicalTrials({ topic: topicQuery })),
    optional("onc_healthit",              () => enrichWithONCHealthIT({ topic: topicQuery })),
    optional("hhs_open",                  () => enrichWithHHSOpenData({ topic: topicQuery })),
    // CALC has no circuit per Sprint 6 mapping (GSA, low traffic). safe() = withTimeout().
    safe(enrichWithCALC({ topic: topicQuery })),
    optional("ecfr",                      () => enrichWithECFR({ topic: topicQuery })),
    optional("regulations_gov",           () => enrichWithRegulationsGov({ topic: topicQuery, agency })),
    instrument("bls",                     () => enrichWithBLS({ topic: topicQuery }),                                              metricsSb),
    instrument("onc_chpl",                () => enrichWithCHPL({ topic: topicQuery }),                                             metricsSb),
    instrument("sam_contract_awards",     () => enrichWithContractAwards({ topic: primaryQuery, agency }),                       metricsSb),
    instrument("sam_wage_determinations", () => enrichWithWageDeterminations({ topic: topicQuery }),                               metricsSb),
    // EDGAR takes a competitor list — empty by default until callers can
    // pass company context. Skipped result is a no-op so no answer regression.
    instrument("sec_edgar",               () => enrichWithEDGAR({ competitors: [] }),                                            metricsSb),
  ]);

  // One entry per fan-out system: the formatted context the model will see
  // plus the raw data (for link extraction). `used` = that system actually
  // contributed text to the prompt, which is the honest definition of
  // "this answer drew on X".
  // Fallback web search of federal sites, only when the structured
  // award/opportunity sources returned nothing (never throws).
  let webData = { skipped: "not_needed" };
  if (shouldWebFallback({ federalData, contractAwardsData, shapes })) {
    webData = await webFederalSearch({ query: primaryQuery, agency, question });
  }

  const federalText = formatFederalDataContext(federalData);
  const systemBlocks = [
    // federal-data-apis fans out to several systems; split so the answer
    // cites USASpending and SAM.gov separately.
    ...splitFederalData(federalData).map((part) => ({ id: part.id, text: "", data: part.data, used: federalText.length > 0 })),
    { id: "congress",                text: formatCongressContext(congressData),            data: congressData },
    { id: "govinfo",                 text: formatGovInfoContext(govinfoData),              data: govinfoData },
    { id: "pubmed",                  text: formatPubMedContext(pubmedData),                data: pubmedData },
    { id: "grants",                  text: formatGrantsContext(grantsData),                data: grantsData },
    { id: "sam_assistance",          text: formatAssistanceContext(assistanceData),        data: assistanceData },
    { id: "usajobs",                 text: formatUSAJobsContext(usajobsData),              data: usajobsData },
    { id: "it_dashboard",            text: formatITDashboardContext(itDashboardData),      data: itDashboardData },
    { id: "cms",                     text: formatCMSContext(cmsData),                      data: cmsData },
    { id: "clinicaltrials",          text: formatClinicalTrialsContext(ctgovData),         data: ctgovData },
    { id: "onc_healthit",            text: formatONCHealthITContext(oncHealthITData),      data: oncHealthITData },
    { id: "hhs_open",                text: formatHHSOpenDataContext(hhsOpenData),          data: hhsOpenData },
    { id: "calc",                    text: formatCALCContext(calcData),                    data: calcData },
    { id: "ecfr",                    text: formatECFRContext(ecfrData),                    data: ecfrData },
    { id: "regulations_gov",         text: formatRegulationsGovContext(regsGovData),       data: regsGovData },
    { id: "bls",                     text: formatBLSContext(blsData || {}),                data: blsData },
    { id: "onc_chpl",                text: formatCHPLContext(chplData),                    data: chplData },
    { id: "sam_contract_awards",     text: formatContractAwardsContext(contractAwardsData), data: contractAwardsData },
    { id: "sam_wage_determinations", text: formatWageDeterminationsContext(wageDetData),   data: wageDetData },
    { id: "sec_edgar",               text: formatEDGARContext(edgarData),                  data: edgarData },
    { id: "web_federal",             text: formatWebFederalContext(webData),               data: webData },
  ].map((b) => ({ ...b, text: b.text || "", used: b.used !== undefined ? b.used : (b.text || "").length > 0 }));

  // Systems that were queried but did not answer (timeout, quota, HTTP
  // error, missing key). Their silence must never read as "no record
  // exists": the model is told, the widget shows it, and ops can see it.
  const unavailable = collectUnavailable({ federalData, systemBlocks });
  const unavailableText = unavailable.length
    ? `\n\nSYSTEMS NOT REACHED THIS TURN (queried but no answer; do not treat as "no records exist"; if the question depends on one of these, say it could not be checked):\n${unavailable.map((u) => `- ${u.name}: ${u.reason}`).join("\n")}`
    : "";

  const recencyText = archiveRecencyNote(corpusMatches, now);
  const delayText = awardDelayNote(agencyCode, now);
  const baseContext = [
    formatVehiclesContext(matchedVehicles),
    formatCorpusContext(corpusMatches, terms.corrected || question, terms.phrase),
    recencyText,
    federalText,
    delayText,
    ...systemBlocks.map((b) => b.text),
    unavailableText,
  ].filter(Boolean).join("");

  // The only acronym expansions the model may use, built from the acronyms
  // that actually appear in the question and the retrieved context.
  const acronyms = acronymReference({ question, context: baseContext });
  const context = baseContext + (acronyms.block || "");

  const sources = buildSources({ systems: systemBlocks, corpusMatches, queriedAt: new Date().toISOString() });

  return {
    agency,
    agencyName: agency ? agencyName(agency) : null,
    context,
    hasAnyData: baseContext.length > unavailableText.length + recencyText.length + delayText.length,
    corpusMatches: corpusMatches.length,
    vehiclesDetected: matchedVehicles.map((v) => v.canonical),
    sources,
    unavailable,
    searchPhrase: primaryQuery,
    corrections: terms.corrections,
    shapes,
    routed: [...routed],
    acronyms: { known: acronyms.known.map(([t]) => t), unknown: acronyms.unknown },
  };
}

function shortReason(err) {
  const s = String(err || "").replace(/\s+/g, " ").trim();
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

/**
 * Pure: derive the "not reached" list from the raw enrichment results.
 * federal-data-apis resolves with per-system {error} fields; the other
 * clients resolve with a top-level {error} (or {configured:false}).
 */
/**
 * Pure: a client that fans out internally (ClinicalTrials.gov runs three
 * sponsor searches, Grants.gov three agencies, USAJOBS four) carries its
 * errors one level down. It did not answer when every part failed.
 */
function nestedFailure(d) {
  const parts = Object.values(d).filter((v) => v && typeof v === "object" && !Array.isArray(v));
  if (!parts.length || !parts.every((v) => v.error)) return null;
  return parts[0].error;
}

function collectUnavailable({ federalData, systemBlocks }) {
  const out = [];
  const push = (id, reason) => {
    const cat = CATALOG_BY_ID[id];
    if (!cat || out.some((u) => u.id === id)) return;
    out.push({ id, name: cat.name, reason: shortReason(reason) || "no answer" });
  };
  if (federalData && federalData.error && !federalData.usaspending_awards) {
    // The whole federal-data bundle failed (timeout, throw): every system
    // it fans out to went unanswered, not just the two that are named most.
    push("usaspending", federalData.error);
    push("sam_opportunities", federalData.error);
    push("federal_register", federalData.error);
    push("gao_reports", federalData.error);
  } else if (federalData) {
    if (federalData.usaspending_awards && federalData.usaspending_awards.error) push("usaspending", federalData.usaspending_awards.error);
    const so = federalData.sam_opportunities;
    if (so && so.error) push("sam_opportunities", so.rateLimited ? `daily quota spent${so.resetAt ? `, resets ${so.resetAt}` : ", resets 00:00 UTC"}` : so.error);
    if (federalData.federal_register && federalData.federal_register.error) push("federal_register", federalData.federal_register.error);
    if (federalData.gao_reports && federalData.gao_reports.error) push("gao_reports", federalData.gao_reports.error);
  }
  for (const b of systemBlocks || []) {
    const d = b.data;
    if (!d || typeof d !== "object" || b.id === "web_federal") continue;
    // Not queried for this question (routing), or never connected (no key,
    // retired API): neither is "not reached this turn". The catalog page
    // carries the permanent state; listing it on every answer would train
    // subscribers to ignore the line that matters (a real quota or outage).
    if (d.skipped || d.configured === false) continue;
    if (d.error) { push(b.id, d.error); continue; }
    const nested = nestedFailure(d);
    if (nested) push(b.id, nested);
  }
  return out;
}

function formatHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return "";
  const turns = history.map((t, i) => `Turn ${i + 1}\nQ: ${t.question}\nA: ${t.answer}`).join("\n\n");
  return `\nPRIOR TURNS IN THIS CONVERSATION (for follow-up context only; re-verify any fact against the block below before repeating it):\n${turns}\n`;
}

async function callClaude({ question, context, history = [], model = defaultModel(), maxTokens = 1500, today = dateET(), fetchImpl = fetch }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  // The date rides in the USER turn, never the system prompt, so prompt
  // caching of the system text stays possible and the model reads "today"
  // as part of the question it is answering.
  const userPrompt = `TODAY: ${today} (America/New_York)

Subscriber question: "${question}"
${formatHistory(history)}
VERIFIED FACTS AVAILABLE (cite any of these — the block may contain MMT articles, MMT federal-vehicle baselines, MMT contract intel, MMT capture-intel signals, MMT IDIQ-vehicle analyst notes, and live federal API results. All are first-class evidence. Treat "MMT ORIGINAL CONTENT" entries and IDIQ vehicle excerpts as things Mary has already published — answer from them and cite the URL):
${context || "(Nothing matched on either the MMT corpus or the live federal APIs. Answer honestly — say what you can from general knowledge and recommend what the subscriber should check next. Do NOT invent facts.)"}

Answer the subscriber now, following the voice and format rules in the system prompt. If the block contains MMT coverage of the topic, lead with what I wrote and quote the most relevant line.`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), isHaiku(model) ? CLAUDE_TIMEOUT_HAIKU_MS : CLAUDE_TIMEOUT_OTHER_MS);

  try {
    const res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        // claude-sonnet-5 rejects a temperature (400); Haiku accepts one.
        ...(isHaiku(model) ? { temperature: 0.2 } : {}),
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
 * Pure: a follow-up that carries no search terms of its own ("regardless of
 * who got them"), or leans on a pronoun with almost none ("the product is
 * GetWell"), is retrieved as a continuation of the previous question. The
 * model still sees the subscriber's actual wording; only the retrieval
 * query is widened. 2026-09-13: "I'm interested in all awards tied to the
 * product regardless of who got them" was retrieved as "interested tied
 * product regardless go" and the bot asked for the product name it had
 * been given one turn earlier.
 */
const FOLLOW_UP_RE = /\b(it|its|that|this|those|these|them|the product|the same|same one|regardless|as well|instead|too|also|what about|how about)\b/i;
function resolveFollowUp(question, history = []) {
  const q = String(question || "");
  const prior = Array.isArray(history) && history.length ? String(history[history.length - 1].question || "").trim() : "";
  if (!prior) return { question: q, carried: false };
  const t = extractSearchTerms(q);
  const own = Array.isArray(t.phraseTokens) ? t.phraseTokens.length : 0;
  const carry = own === 0 || (own <= 2 && FOLLOW_UP_RE.test(q));
  if (!carry) return { question: q, carried: false };
  return { question: `${prior} ${q}`, carried: true, prior };
}

/** Pure: the voice rule bans em dashes; the model still emits them. */
function stripEmDashes(text) {
  return String(text || "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+--\s+/g, ", ")
    .replace(/,\s*,/g, ", ")
    .replace(/([.!?:;])\s*,\s*/g, "$1 ");
}

/**
 * Main entry point: given a question, return a grounded answer + sources.
 * @returns {Promise<{answer: string, agency: string|null, hasData: boolean, model: string, sources: Array, error?: string}>}
 */
async function answerQuestion({ question, history = [], maxTokens = 1500 }) {
  if (!question || question.trim().length < 3) {
    return { answer: "", error: "question too short", agency: null, hasData: false, sources: [], unavailable: [] };
  }
  try {
    const followUp = resolveFollowUp(question, history);
    const t0 = Date.now();
    const { agency, agencyName: scopeName, context, hasAnyData, sources, unavailable, searchPhrase, corrections, shapes, routed } = await runEnrichment(followUp.question);
    const t1 = Date.now();
    const { answer: raw, model, usage } = await callClaude({ question, context, history, maxTokens });
    const t2 = Date.now();
    // Guards, in order: drop the model's own Sources tail (the widget
    // renders the server list), enforce the voice rule, de-link anything
    // the server did not retrieve, then count unsupported dollar figures
    // without touching the text.
    const voiced = enforceVoice(stripEmDashes(stripSourcesSection(raw)));
    const linked = enforceLinks(voiced.answer, context, sources);
    const dollars = dollarGuard(linked.answer, context);
    return {
      answer: linked.answer,
      voice_fixes: voiced.voice_fixes,
      agency,
      agencyName: scopeName,
      hasData: hasAnyData,
      model,
      usage,
      sources,
      unavailable,
      searchPhrase,
      corrections,
      shapes,
      routed,
      carried: followUp.carried,
      unlisted_link_count: linked.unlisted_link_count,
      unlisted_links: linked.unlisted,
      unsupported_dollar_count: dollars.unsupported_dollar_count,
      unsupported_dollars: dollars.unsupported,
      timings: { enrichment_ms: t1 - t0, model_ms: t2 - t1 },
    };
  } catch (err) {
    return {
      answer: "",
      agency: null,
      hasData: false,
      sources: [],
      unavailable: [],
      error: err.message,
    };
  }
}

module.exports = {
  detectAgency,
  runEnrichment,
  answerQuestion,
  callClaude,
  collectUnavailable,
  archiveRecencyNote,
  awardDelayNote,
  resolveFollowUp,
  stripEmDashes,
  defaultModel,
  dateET,
  ARCHIVE_STALE_DAYS,
  AWARD_DELAY_DAYS,
  CLAUDE_TIMEOUT_HAIKU_MS,
  CLAUDE_TIMEOUT_OTHER_MS,
};
