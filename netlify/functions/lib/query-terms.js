// ============================================================
// query-terms.js — turn a subscriber's question into API search terms
//
// The 2026-09-10 failure: "Tell me all about data governence awards in the
// DHA" went to USASpending and SAM.gov as the literal keyword
// "Tell about data governence awards" (split on spaces, keep words longer
// than three letters, take five). Question scaffolding went to the API, the
// misspelling went with it, and the answer said "I don't have a source"
// while the Contract Tracker held a DHA data governance entry.
//
// This module is pure and network-free:
//   extractSearchTerms(question) -> {
//     phrase:       "data governance"        // keyword/q parameter
//     phraseTokens: ["data", "governance"]   // same, as tokens, in order
//     rankedTokens: ["governance", "data"]   // most specific first
//     tokens:       [...]                    // content tokens for relevance
//     agency:       "DHA" | null              // primary agency
//     agencies:     ["DHA"]                   // every agency named
//     corrected:    "...data governance..."   // typo-corrected question
//     corrections:  [{ from, to }]
//   }
//
// Three properties make this work for ANY question, not one:
//   1. Agency wording comes from lib/federal-agencies.js (27 agencies), not
//      a hand-typed list, and travels as its own API filter.
//   2. Generic procurement nouns (awards, contracts, solicitations) leave
//      the keyword but stay in `tokens`. When a question is ONLY an agency
//      plus generic nouns ("what awards has CDC made?"), the phrase is
//      deliberately EMPTY: an agency-filtered search with no keyword is the
//      right query, and `searchPhrase()` never falls back to the raw
//      sentence.
//   3. `keywordLadder()` returns progressively shorter keywords so a long
//      or unusual question relaxes into a hit instead of returning zero.
// ============================================================

const { stripAgencyWording, agencyFor } = require("./federal-agencies");

const STOPWORDS = new Set(`
a an the and or but if so than then that this these those there here is are was were be been being am
do does did done doing has have had having can could would should will shall may might must
i me my mine we us our ours you your yours he him his she her hers it its they them their theirs
what whats who whos whom whose which when where why how much many any some all every each both few
tell give show explain describe summarize summarise list find look looking search know want need like
please about into onto over under between among within without through during before after since until
from at by to of in on for with as up out off down again further once here there
latest current currently recent recently new news update updates status going happening moving happen
really actually just only also even still yet already now today tonight week month year years ago
anything everything something nothing thing things stuff detail details info information overview
say said says think thought around across against along going get getting got
won win wins winner hold holds held holding make makes made made use used using come comes coming
run runs running put puts take takes taken bring brings due out there per via such other others
`.trim().split(/\s+/));

// Nouns that describe the KIND of record being asked for. The award and
// opportunity searches are already scoped to those kinds, so passing the
// word itself only dilutes the keyword. They stay in `tokens`.
const GENERIC = new Set([
  "award", "awards", "awarded", "contract", "contracts", "contracting", "opportunity", "opportunities",
  "solicitation", "solicitations", "procurement", "procurements", "spend", "spending", "obligation",
  "obligations", "obligated", "vendor", "vendors", "incumbent", "incumbents", "bid", "bids", "bidding",
  "pipeline", "forecast", "forecasts", "activity", "work", "efforts", "effort", "initiative", "initiatives",
]);

// Domain vocabulary. Two jobs: typo correction (a token of six or more
// letters within edit distance 2 of exactly one entry) and specificity
// ranking (a domain term outranks an ordinary word when the keyword ladder
// shortens the query).
const VOCAB = `
governance interoperability cybersecurity telehealth telemedicine acquisition solicitation incumbent
modernization migration analytics infrastructure procurement appropriations authorization certification
compliance credentialing enterprise integration informatics laboratory logistics pharmacy radiology
imaging scheduling referral community network veterans medicare medicaid healthcare beneficiaries
readiness recompete protest sustain sustainment obligations obligated budget forecast deployment
implementation engineering development operations maintenance support services software hardware
platform dental clinical patient electronic records ambient listening scribe artificial intelligence
generative machine learning security privacy identity verification revenue billing claims eligibility
enrollment workforce staffing training research vaccine pandemic preparedness response resilience
wearable remote monitoring virtual digital quality safety oversight accountability transparency
standards framework strategy roadmap contract contracts contracting opportunities opportunity awards
program programs portfolio vehicle vehicles ceiling protests solicitations pathology genomics
behavioral surveillance immunization interoperable warehouse lakehouse stewardship metadata
prosthetics optometry audiology oncology cardiology nursing surgical ambulatory inpatient outpatient
reimbursement actuarial formulary telecommunications datacenter cloud hosting sustainability
accreditation transformation transition modernize sequencing biosurveillance epidemiology
`.trim().split(/\s+/);
const VOCAB_SET = new Set(VOCAB);

const MAX_PHRASE_TOKENS = 6;

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function correctToken(tok) {
  if (tok.length < 6 || VOCAB_SET.has(tok) || STOPWORDS.has(tok) || GENERIC.has(tok)) return null;
  // Never "correct" something that names a real agency.
  if (agencyFor(tok)) return null;
  const cands = VOCAB.filter((w) => w[0] === tok[0] && Math.abs(w.length - tok.length) <= 2 && levenshtein(tok, w) <= 2);
  return cands.length === 1 ? cands[0] : null;
}

/**
 * How searchable a token is on its own. Identifiers and acronyms beat domain
 * terms, which beat ordinary words. Used only to decide which tokens survive
 * when the keyword ladder shortens a query; the top rung keeps the
 * subscriber's own word order.
 */
function specificity(tok, acronyms) {
  if (/\d/.test(tok)) return 3;            // T4NG2, FY2027, HT003826SC005, 36C10G26R0004
  if (acronyms.has(tok)) return 3;         // EHR, TEFCA, HCDS, CSO
  if (VOCAB_SET.has(tok)) return 2;        // governance, telehealth, interoperability
  return 1;
}

/**
 * @param {string} question
 * @returns {{phrase, phraseTokens, rankedTokens, tokens, agency, agencies, corrected, corrections}}
 */
function extractSearchTerms(question) {
  const raw = String(question || "");

  // Agency wording out, agency codes in. The registry strips official names
  // and acronyms but deliberately keeps program words (TRICARE, MHS GENESIS,
  // Medicare) that are usually the best search term in the question.
  const { text, codes } = stripAgencyWording(raw);

  // All-caps runs in the ORIGINAL question are load-bearing: they survive
  // the stopword list and rank as high-specificity.
  const acronyms = new Set();
  for (const m of raw.matchAll(/\b[A-Z][A-Z0-9-]{1,}\b/g)) acronyms.add(m[0].toLowerCase());

  const corrections = [];
  const words = text
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^a-z0-9\-+.\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ""))
    .filter(Boolean)
    .map((w) => {
      if (acronyms.has(w)) return w;
      const fix = correctToken(w);
      if (fix) { corrections.push({ from: w, to: fix }); return fix; }
      return w;
    });

  const tokens = [];
  for (const w of words) {
    if (acronyms.has(w)) { tokens.push(w); continue; }  // IT, EHR, AI survive stopwords
    if (STOPWORDS.has(w)) continue;
    if (w.length < 2) continue;
    tokens.push(w);
  }

  const phraseTokens = tokens.filter((w) => !GENERIC.has(w)).slice(0, MAX_PHRASE_TOKENS);
  const rankedTokens = [...phraseTokens]
    .map((t, i) => ({ t, i, s: specificity(t, acronyms) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.t);

  const corrected = corrections.length
    ? raw.replace(/[A-Za-z]+/g, (w) => {
        const c = corrections.find((x) => x.from === w.toLowerCase());
        return c ? c.to : w;
      })
    : raw;

  return {
    phrase: phraseTokens.join(" "),
    phraseTokens,
    rankedTokens,
    tokens: tokens.slice(0, 8),
    agency: codes[0] || null,
    agencies: codes,
    corrected,
    corrections,
  };
}

/**
 * The keyword to send an API. NEVER the raw sentence: when nothing specific
 * survives, fall back to the content tokens, and when even those are empty
 * return "" so the caller runs an agency-filtered search with no keyword.
 */
function searchPhrase(questionOrTerms) {
  const t = typeof questionOrTerms === "string" ? extractSearchTerms(questionOrTerms) : (questionOrTerms || {});
  if (t.phrase) return t.phrase;
  // Nothing specific survived. With an agency in hand ("what awards has CDC
  // made?"), an agency-filtered search with NO keyword is the right query;
  // sending the leftover generic noun ("awards") would only exclude rows.
  if (t.agency) return "";
  const tokens = Array.isArray(t.tokens) ? t.tokens : [];
  return tokens.slice(0, 4).join(" ");
}

/**
 * Progressively shorter keywords, most specific terms retained longest.
 * A caller walks the ladder until a query returns rows, so an unusual or
 * wordy question relaxes into an answer instead of returning zero:
 *
 *   "remote patient monitoring outcomes in VA"
 *     -> "remote patient monitoring outcomes" -> "monitoring remote" -> "monitoring" -> ""
 *
 * The last rung is always "" (agency filter only). Deduped, order preserved.
 */
function keywordLadder(questionOrTerms) {
  const t = typeof questionOrTerms === "string" ? extractSearchTerms(questionOrTerms) : (questionOrTerms || {});
  const hasPhrase = Array.isArray(t.phraseTokens) && t.phraseTokens.length > 0;
  // No specific term and an agency named: the agency filter alone IS the
  // query. Do not lead with a leftover generic noun.
  if (!hasPhrase && t.agency) return [""];
  const ordered = hasPhrase ? t.phraseTokens : (Array.isArray(t.tokens) ? t.tokens.slice(0, 4) : []);
  const ranked = Array.isArray(t.rankedTokens) && t.rankedTokens.length ? t.rankedTokens : ordered;

  const rungs = [];
  if (ordered.length) rungs.push(ordered.join(" "));      // the subscriber's own wording
  if (ranked.length > 2) rungs.push(ranked.slice(0, 2).join(" "));
  if (ranked.length > 1) rungs.push(ranked[0]);
  rungs.push("");                                          // agency only
  return [...new Set(rungs)];
}

module.exports = {
  extractSearchTerms,
  searchPhrase,
  keywordLadder,
  specificity,
  levenshtein,
  STOPWORDS,
  GENERIC,
  VOCAB_SET,
};
