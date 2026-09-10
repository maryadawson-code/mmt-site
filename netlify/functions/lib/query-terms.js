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
//     phrase:   "data governance"        // for keyword/q parameters
//     tokens:   ["data", "governance"]   // for relevance filtering
//     agency:   "DHA" | null              // detected from the wording
//     corrected: "tell me all about data governance awards in the dha"
//     corrections: [{ from: "governence", to: "governance" }]
//   }
// Generic procurement nouns (awards, contracts, solicitations...) are kept
// out of `phrase` because they add nothing to a keyword search that is
// already scoped to contract awards, but they stay in `tokens`.
// ============================================================

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
say said says think thought around across against along
`.trim().split(/\s+/));

// Nouns that describe the *kind* of record being asked for. The award and
// opportunity searches are already scoped to those kinds, so passing the
// word itself only dilutes the keyword.
const GENERIC = new Set([
  "award", "awards", "awarded", "contract", "contracts", "contracting", "opportunity", "opportunities",
  "solicitation", "solicitations", "procurement", "procurements", "spend", "spending", "obligation",
  "obligations", "obligated", "vendor", "vendors", "incumbent", "incumbents", "bid", "bids", "bidding",
  "pipeline", "forecast", "forecasts", "activity", "work", "efforts", "effort", "initiative", "initiatives",
]);

// Agency wording is passed to the APIs as a separate filter; leaving it in
// the keyword only narrows results to records that spell the agency out.
const AGENCY_PHRASES = [
  { re: /\bdefense health agency\b/gi, code: "DHA" },
  { re: /\bmilitary health system\b/gi, code: "DHA" },
  { re: /\bdepartment of veterans affairs\b/gi, code: "VA" },
  { re: /\bveterans affairs\b/gi, code: "VA" },
  { re: /\bveterans health administration\b/gi, code: "VA" },
  { re: /\bdepartment of defense\b/gi, code: "DoD" },
  { re: /\bhealth and human services\b/gi, code: "HHS" },
  { re: /\bcenters for medicare (?:and|&) medicaid services\b/gi, code: "CMS" },
  { re: /\bnational institutes of health\b/gi, code: "NIH" },
  { re: /\bindian health service\b/gi, code: "IHS" },
  { re: /\bgeneral services administration\b/gi, code: "GSA" },
];
const AGENCY_TOKENS = {
  dha: "DHA", va: "VA", vha: "VA", vba: "VA", hhs: "HHS", cms: "CMS", nih: "NIH", ihs: "IHS", dod: "DoD",
  gsa: "GSA", onc: "ONC", fda: "FDA", cdc: "CDC", "arpa-h": "ARPA-H", arpah: "ARPA-H", mhs: "DHA",
};

// Domain vocabulary for typo correction. A token of six or more letters that
// is not a known word and sits within edit distance 2 of exactly one of
// these (same first letter) is replaced. Short tokens and acronyms are
// never touched.
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
`.trim().split(/\s+/);
const VOCAB_SET = new Set(VOCAB);

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
  const cands = VOCAB.filter((w) => w[0] === tok[0] && Math.abs(w.length - tok.length) <= 2 && levenshtein(tok, w) <= 2);
  return cands.length === 1 ? cands[0] : null;
}

/**
 * @param {string} question
 * @returns {{ phrase: string, tokens: string[], agency: string|null, corrected: string, corrections: Array<{from:string,to:string}> }}
 */
function extractSearchTerms(question) {
  const raw = String(question || "");
  let agency = null;
  let text = raw;
  for (const { re, code } of AGENCY_PHRASES) {
    if (re.test(text)) { agency = agency || code; text = text.replace(re, " "); }
    re.lastIndex = 0;
  }
  // Keep acronyms (all-caps runs) as-is; they are load-bearing search terms.
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

  const content = [];
  for (const w of words) {
    if (AGENCY_TOKENS[w]) { agency = agency || AGENCY_TOKENS[w]; continue; }
    if (acronyms.has(w)) { content.push(w); continue; } // "IT", "EHR", "AI" survive the stopword list
    if (STOPWORDS.has(w)) continue;
    if (w.length < 2) continue;
    content.push(w);
  }
  const specific = content.filter((w) => !GENERIC.has(w));
  const phraseTokens = (specific.length ? specific : []).slice(0, 6);

  const corrected = corrections.length
    ? raw.replace(/[A-Za-z]+/g, (w) => { const c = corrections.find((x) => x.from === w.toLowerCase()); return c ? c.to : w; })
    : raw;

  return {
    phrase: phraseTokens.join(" "),
    tokens: content.slice(0, 8),
    agency,
    corrected,
    corrections,
  };
}

module.exports = { extractSearchTerms, levenshtein, STOPWORDS, GENERIC };
