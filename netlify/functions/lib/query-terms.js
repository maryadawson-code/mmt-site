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
//     years:        [2024]                    // fiscal/calendar years named
//     since:        "2023-10-01" | null       // earliest start date they imply
//     setAside:     { kinds, codes } | null   // USASpending set_aside_type_codes
//     wantsObligations: true|false           // "how much ... obligated/spent/since FY"
//   }
//
// 2026-09-14: a fiscal year in the question ("since FY2024") used to travel
// to the APIs as the keyword "fy2024" (which matches nothing) instead of
// bounding the search window; "small business" went the same way. Years
// and set-aside wording now leave the phrase and come back as filters.
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
bought buy buys buying purchase purchased purchases purchasing spent pays pay paid paying received receive
receives receiving gave given released posted signed sold sell sells move moved moves ordered picked selected chose chosen
interested regardless tied go goes went gone got matter matters whoever whichever whether
long often usually typically quickly fast slow soon early late
reach reaches reached reaching achieve achieves achieved hit hits reaching finish finishes finished
fy fiscal last
`.trim().split(/\s+/));

// ---- fiscal / calendar years -------------------------------------------
// A federal fiscal year N runs Oct 1 of N-1 through Sep 30 of N. The year
// leaves the phrase (an API keyword "fy2024" matches nothing) and comes back
// as `years` plus `since`, the earliest start date the mentions imply.
// `today` is injectable so "last year" is deterministic in tests.
function toDate(today) {
  if (today instanceof Date && !Number.isNaN(today.getTime())) return today;
  if (typeof today === "string" && /^\d{4}-\d{2}-\d{2}/.test(today)) return new Date(today.slice(0, 10) + "T00:00:00Z");
  return new Date();
}
function fiscalYearOf(d) {
  return d.getUTCMonth() >= 9 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}
function fourDigit(y) {
  const n = Number(y);
  return String(y).length === 2 ? 2000 + n : n;
}
function extractYears(text, today) {
  const d = toDate(today);
  const mentions = []; // { year, fiscal }
  let out = String(text || "");
  // FY2024, FY 24, FY'24, fiscal year 2024, fiscal 2024
  out = out.replace(/\bFY\s?['\u2019]?(\d{4}|\d{2})\b/gi, (m, y) => { mentions.push({ year: fourDigit(y), fiscal: true }); return " "; });
  out = out.replace(/\bfiscal(?:\s+year)?\s+['\u2019]?(\d{4}|\d{2})\b/gi, (m, y) => { mentions.push({ year: fourDigit(y), fiscal: true }); return " "; });
  // last year / this year / last fiscal year / prior year
  out = out.replace(/\b(last|past|previous|prior|this|current|next)\s+(fiscal\s+)?year\b/gi, (m, rel, fiscal) => {
    const base = fiscal ? fiscalYearOf(d) : d.getUTCFullYear();
    const shift = /^(last|past|previous|prior)$/i.test(rel) ? -1 : (/^next$/i.test(rel) ? 1 : 0);
    mentions.push({ year: base + shift, fiscal: !!fiscal });
    return " ";
  });
  // a bare calendar year: "since 2024", "in 2025", "2026 awards"
  out = out.replace(/\b(20[0-4]\d)\b/g, (m, y) => { mentions.push({ year: Number(y), fiscal: false }); return " "; });
  const years = [...new Set(mentions.map((m) => m.year))].sort((a, b) => a - b);
  let since = null;
  for (const m of mentions) {
    const start = m.fiscal ? `${m.year - 1}-10-01` : `${m.year}-01-01`;
    if (!since || start < since) since = start;
  }
  // A year that has not started cannot bound a search window.
  if (since && since > d.toISOString().slice(0, 10)) since = null;
  return { text: out, years, since };
}

// ---- set-asides -----------------------------------------------------------
// USASpending `set_aside_type_codes` (FPDS type-of-set-aside codes). Probed
// live 2026-09-14: the filter is enforced (an unknown code returns zero rows
// rather than an error, so only these known codes are ever sent).
const SET_ASIDE_CODES = {
  "EDWOSB": ["EDWOSB", "EDWOSBSS"],
  "WOSB": ["WOSB", "WOSBSS", "EDWOSB", "EDWOSBSS"],
  "SDVOSB": ["SDVOSBC", "SDVOSBS"],
  "VOSB": ["VSA", "VSS", "SDVOSBC", "SDVOSBS"],
  "8(a)": ["8A", "8AN"],
  "HUBZone": ["HZC", "HZS"],
};
const ALL_SMALL_BUSINESS_CODES = ["SBA", "SBP", "8A", "8AN", "HZC", "HZS", "SDVOSBC", "SDVOSBS", "WOSB", "WOSBSS", "EDWOSB", "EDWOSBSS", "VSA", "VSS"];
// Order matters: the specific kind is matched (and removed) before the
// generic wording that contains it (EDWOSB before WOSB, SDVOSB before VOSB).
const SET_ASIDE_PATTERNS = [
  { kind: "EDWOSB", re: /\b(edwosb|economically[- ]disadvantaged(\s+(women|woman)[- ]owned)?(\s+small\s+business(es)?)?)\b/gi },
  { kind: "WOSB", re: /\b(wosb|(women|woman)[- ]owned(\s+small\s+business(es)?)?)\b/gi },
  { kind: "SDVOSB", re: /\b(sdvosb|service[- ]disabled(\s+veteran[- ]owned)?(\s+small\s+business(es)?)?)\b/gi },
  { kind: "VOSB", re: /\b(vosb|veteran[- ]owned(\s+small\s+business(es)?)?)\b/gi },
  { kind: "8(a)", re: /(\b8\s?\(a\)|\b8a\b)/gi },
  { kind: "HUBZone", re: /\bhub[- ]?zone\b/gi },
  { kind: "small business", re: /\bsmall[- ]business(es)?\b|\bset[- ]asides?\b/gi },
];
function extractSetAside(text) {
  let out = String(text || "");
  const kinds = [];
  for (const p of SET_ASIDE_PATTERNS) {
    let hit = false;
    out = out.replace(p.re, () => { hit = true; return " "; });
    if (hit) kinds.push(p.kind);
  }
  if (!kinds.length) return { text: out, setAside: null };
  const specific = kinds.filter((k) => SET_ASIDE_CODES[k]);
  const codes = specific.length
    ? [...new Set(specific.flatMap((k) => SET_ASIDE_CODES[k]))]
    : ALL_SMALL_BUSINESS_CODES.slice();
  return { text: out, setAside: { kinds, codes } };
}

// Does the question ask for money over time? Decides whether the recipient
// obligations-by-fiscal-year call runs (federal-data-apis.js).
const OBLIGATIONS_RE = /\b(obligat|spend|spent|paid|pay|bought|buy|cost|since|fy|year)/i;
function obligationsIntent(text) {
  return OBLIGATIONS_RE.test(String(text || ""));
}

// Nouns that describe the KIND of record being asked for. The award and
// opportunity searches are already scoped to those kinds, so passing the
// word itself only dilutes the keyword. They stay in `tokens`.
const GENERIC = new Set([
  "award", "awards", "awarded", "contract", "contracts", "contracting", "opportunity", "opportunities",
  "solicitation", "solicitations", "procurement", "procurements", "spend", "spending", "obligation",
  "obligations", "obligated", "vendor", "vendors", "incumbent", "incumbents", "bid", "bids", "bidding",
  "pipeline", "forecast", "forecasts", "activity", "work", "efforts", "effort", "initiative", "initiatives",
  // "the product is GetWell" / "which tool did VA buy": the noun names the
  // KIND of thing, the name beside it is the search term.
  "product", "products", "tool", "tools",
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
 * @param {{today?: Date|string}} [opts] today pins "last year" (tests)
 * @returns {{phrase, phraseTokens, rankedTokens, tokens, agency, agencies, corrected, corrections, years, since, setAside, wantsObligations}}
 */
function extractSearchTerms(question, opts = {}) {
  const raw = String(question || "");

  // Agency wording out, agency codes in. The registry strips official names
  // and acronyms but deliberately keeps program words (TRICARE, MHS GENESIS,
  // Medicare) that are usually the best search term in the question.
  const stripped = stripAgencyWording(raw);
  const codes = stripped.codes;
  // Years and set-aside wording become filters, never keywords.
  const yearsOut = extractYears(stripped.text, opts.today);
  const setAsideOut = extractSetAside(yearsOut.text);
  const text = setAsideOut.text;

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
    years: yearsOut.years,
    since: yearsOut.since,
    setAside: setAsideOut.setAside,
    wantsObligations: obligationsIntent(raw),
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
  extractYears,
  extractSetAside,
  obligationsIntent,
  fiscalYearOf,
  STOPWORDS,
  GENERIC,
  VOCAB_SET,
  SET_ASIDE_CODES,
  ALL_SMALL_BUSINESS_CODES,
};
