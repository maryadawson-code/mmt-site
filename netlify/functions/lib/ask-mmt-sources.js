// ============================================================
// ask-mmt-sources.js — the ONE list of what Ask MMT reads
//
// Two consumers, deliberately sharing this file so they cannot drift:
//   1. premium-assistant.js builds the per-answer `sources` array from it
//      (which systems actually returned data for THIS question, with the
//      item links the model was shown).
//   2. build.js renders /ask/sources from SOURCE_CATALOG, so the public
//      "what it reads" table is the same list the code queries. A source
//      added to the fan-out without a catalog row fails the unit test.
//
// `mode` is honest about freshness: "live" means the system is queried at
// question time; "index" means the MMT archive index rebuilt on every site
// build; "conditional" means the client exists but returns nothing until a
// credential or input it needs is present (say so on the page rather than
// listing a source the answer will never cite); "fallback" means a
// last-resort search that runs only when the structured sources are silent.
// ============================================================

const SOURCE_CATALOG = [
  { id: "mmt_archive", name: "MMT article archive", url: "https://missionmeetstech.com/latest", mode: "index",
    provides: "Every published MMT analysis, Friday brief, monthly brief, Contract Tracker note, and IDIQ analyst note",
    use: "Context: what Mary has already worked out about the vehicle, agency, or program. Cited by article, with the link." },
  { id: "usaspending", name: "USASpending.gov", url: "https://www.usaspending.gov", mode: "live",
    provides: "Federal obligations, awards, recipients, spending by agency and NAICS",
    use: "Who won what, for how much, and how the money has moved" },
  { id: "sam_opportunities", name: "SAM.gov Opportunities", url: "https://sam.gov/search/?index=opp", mode: "live",
    note: "SAM.gov limits this key to a small number of queries a day, kept for subscriber questions. When the day's quota is spent the answer says so and the federal web search covers solicitations.",
    provides: "Active solicitations, sources sought, RFIs, presolicitations, award notices",
    use: "Solicitation status, response deadlines, set-aside and NAICS details" },
  { id: "federal_register", name: "Federal Register", url: "https://www.federalregister.gov", mode: "live",
    provides: "Rules, proposed rules, and notices from federal agencies",
    use: "Regulatory actions that change a program or a requirement" },
  { id: "gao_reports", name: "GAO reports", url: "https://www.gao.gov/reports-testimonies", mode: "live",
    note: "gao.gov blocks search from servers, so Ask MMT reads GAO's published-reports feed (the latest 25 reports) and matches the question against it. Older reports are not searched.",
    provides: "The Government Accountability Office's most recent published reports",
    use: "Oversight findings on a program, an acquisition, or an agency" },
  { id: "congress", name: "Congress.gov", url: "https://www.congress.gov", mode: "live",
    provides: "Bills, NDAA text, appropriations, committee activity",
    use: "Statutory language, funding direction, policy history" },
  { id: "govinfo", name: "GovInfo", url: "https://www.govinfo.gov", mode: "live",
    provides: "Budget justification books, public laws, Congressional Record, hearings",
    use: "The budget exhibit or the enacted text behind a funding claim" },
  { id: "pubmed", name: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov", mode: "live",
    provides: "Peer-reviewed clinical and health services research",
    use: "Evidence behind a technical approach or a program claim" },
  { id: "clinicaltrials", name: "ClinicalTrials.gov", url: "https://clinicaltrials.gov", mode: "live",
    provides: "Registered clinical studies and sponsors",
    use: "Active research tied to a program, a condition, or a sponsor" },
  { id: "grants", name: "Grants.gov", url: "https://www.grants.gov", mode: "live",
    provides: "Federal grant opportunities",
    use: "Grant-funded work adjacent to a contract opportunity" },
  { id: "sam_assistance", name: "SAM.gov Assistance Listings", url: "https://sam.gov/content/assistance-listings", mode: "live",
    note: "The listings API has no keyword search. Ask MMT pulls the department's active listings once a day and matches the question against them. Shares the SAM.gov daily quota.",
    provides: "Catalog of federal assistance programs (formerly CFDA)",
    use: "The program authority behind a grant or cooperative agreement" },
  { id: "usajobs", name: "USAJOBS", url: "https://www.usajobs.gov", mode: "conditional",
    note: "Needs a free USAJOBS developer key (developer.usajobs.gov). Until USAJOBS_API_KEY and USAJOBS_USER_EMAIL are set the client returns nothing, so it is listed here rather than cited.",
    provides: "Open federal job announcements",
    use: "Hiring signals that show where an office is building capacity" },
  { id: "it_dashboard", name: "Federal IT Dashboard", url: "https://itdashboard.gov", mode: "conditional",
    note: "itdashboard.gov says OMB is taking steps to sunset the site and that, effective April 2026, agency reporting narrows to statutorily required data (read 2026-09-14). Its public API was retired earlier (every /api path returns 404), so nothing can be queried at question time. Listed so you know it will not be cited.",
    provides: "Agency IT investment portfolios and CIO ratings",
    use: "The investment line and its rating behind an IT program" },
  { id: "cms", name: "CMS provider data", url: "https://data.cms.gov", mode: "live",
    provides: "Medicare and Medicaid provider, utilization, and program datasets",
    use: "CMS program facts and provider-level context" },
  { id: "onc_healthit", name: "ONC Health IT data", url: "https://www.healthit.gov/data", mode: "live",
    provides: "Health IT adoption, interoperability, and certification statistics",
    use: "Adoption and interoperability numbers behind a health IT claim" },
  { id: "onc_chpl", name: "ONC CHPL", url: "https://chpl.healthit.gov", mode: "live",
    note: "Read with MMT's registered CHPL API key (set 2026-09-14). If the key is ever removed the client reports the system as not reached rather than answering from memory.",
    provides: "Certified Health IT Product List",
    use: "Whether a product and edition are certified, and for what criteria" },
  { id: "hhs_open", name: "HHS open data", url: "https://healthdata.gov", mode: "live",
    provides: "HHS datasets from the healthdata.gov catalog (CDC, FDA, NIH, HRSA, CMS, and the Office of the CDO)",
    use: "Program-level data behind an HHS question" },
  { id: "ecfr", name: "eCFR", url: "https://www.ecfr.gov", mode: "live",
    provides: "Code of Federal Regulations, including the FAR, DFARS, and HIPAA",
    use: "The regulation text behind a compliance or contracting question" },
  { id: "regulations_gov", name: "Regulations.gov", url: "https://www.regulations.gov", mode: "live",
    provides: "Rulemaking dockets and open comment periods",
    use: "Where a rule sits and whether the comment window is open" },
  { id: "bls", name: "Bureau of Labor Statistics", url: "https://www.bls.gov", mode: "live",
    provides: "Wage and employment statistics by occupation and area",
    use: "Labor-rate context for a pricing or staffing question" },
  { id: "sam_wage_determinations", name: "SAM.gov Wage Determinations", url: "https://sam.gov/content/wage-determinations", mode: "live",
    provides: "Service Contract Act and Davis-Bacon wage determinations",
    use: "The wage floor that applies to a service contract" },
  { id: "calc", name: "GSA CALC+ labor rates", url: "https://calc.gsa.gov", mode: "conditional",
    note: "GSA is migrating CALC to IGCE. The client is wired but returns no data until GSA publishes the new endpoint.",
    provides: "Awarded GSA schedule labor rates",
    use: "Comparable awarded rates for a labor category" },
  { id: "sam_contract_awards", name: "SAM.gov Contract Awards", url: "https://open.gsa.gov/api/contract-data-api/", mode: "conditional",
    note: "The FPDS replacement. Requires a SAM.gov system account key; returns nothing until that key is provisioned.",
    provides: "Contract award records (the former FPDS data)",
    use: "Award-level detail once the system account is approved" },
  { id: "sec_edgar", name: "SEC EDGAR", url: "https://www.sec.gov/edgar", mode: "conditional",
    note: "Queried only when a question names a public company. Most federal health IT questions do not.",
    provides: "Public-company filings",
    use: "What a public competitor has told its investors about a contract" },
  { id: "web_federal", name: "Web search of federal sites", url: "https://missionmeetstech.com/ask/sources#fallback", mode: "fallback",
    note: "Runs when USASpending, SAM.gov Opportunities and the contract-award client all return nothing for the question, or when SAM.gov or USASpending could not be reached on a contract, vehicle or budget question. Restricted to .gov and .mil domains (sam.gov, usaspending.gov, health.mil, va.gov, hhs.gov, cms.gov, gsa.gov, gao.gov, congress.gov, govinfo.gov, federalregister.gov, nih.gov, arpa-h.gov, healthit.gov, defense.gov).",
    provides: "Pages on federal sites the structured APIs did not surface",
    use: "A lead when the structured sources are silent, labeled as a web-search lead in the answer, never a primary citation" },
];

// Optional systems say when they are queried (lib/question-shape.js), so
// the public table and the routing cannot disagree.
const { queriedWhen, OPTIONAL_SYSTEMS } = require("./question-shape");
for (const s of SOURCE_CATALOG) {
  if (OPTIONAL_SYSTEMS[s.id]) s.use = `${s.use}. ${queriedWhen(s.id)}`;
}

const CATALOG_BY_ID = Object.fromEntries(SOURCE_CATALOG.map((s) => [s.id, s]));

const LINK_KEYS = /^(url|uilink|link|permalink|source_url|href|pdf_url|study_url)$/i;
const LIST_LINK_KEYS = /^(citations|links|urls)$/i;
const MAX_LINKS_PER_SYSTEM = 4;
// The sibling field that names a record, in preference order. The widget
// used to print "record 1 · record 2"; a reader could not tell the Immuta
// award from the T4NG2 notice without clicking each one.
const LABEL_KEYS = ["title", "name", "piid", "award_id", "noticeId", "notice_id", "solicitation_number", "description"];
const LABEL_MAX = 60;

function labelFor(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const lower = Object.fromEntries(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const key of LABEL_KEYS) {
    const actual = lower[key.toLowerCase()];
    if (!actual) continue;
    const v = obj[actual];
    if (typeof v !== "string" && typeof v !== "number") continue;
    const s = String(v).replace(/\s+/g, " ").trim();
    if (!s) continue;
    return s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 3).trimEnd() + "..." : s;
  }
  return null;
}

/**
 * Walk an enrichment result (bounded depth) and collect the http(s) links
 * the model was shown, each as { url, label } where label is the record's
 * nearest sibling title/name/id (or null for a bare citation list).
 * Deduped by url, capped at MAX_LINKS_PER_SYSTEM. Network-free; never throws.
 * @returns {Array<{url:string, label:string|null}>}
 */
function extractLinks(value, depth = 0, out = [], seen = new Set()) {
  if (value == null || depth > 4 || out.length >= MAX_LINKS_PER_SYSTEM) return out;
  const add = (url, label) => {
    const u = String(url).trim();
    if (seen.has(u) || out.length >= MAX_LINKS_PER_SYSTEM) return;
    seen.add(u);
    out.push({ url: u, label: label || null });
  };
  if (Array.isArray(value)) {
    for (const v of value) extractLinks(v, depth + 1, out, seen);
    return out;
  }
  if (typeof value === "object") {
    let label;
    for (const [k, v] of Object.entries(value)) {
      if (LINK_KEYS.test(k) && typeof v === "string" && /^https?:\/\//i.test(v)) {
        if (label === undefined) label = labelFor(value);
        add(v, label);
      } else if (LIST_LINK_KEYS.test(k) && Array.isArray(v)) {
        // e.g. the web search's `citations: [url, url]`
        for (const item of v) {
          if (typeof item === "string" && /^https?:\/\//i.test(item)) add(item, null);
        }
      } else if (typeof v === "object") {
        extractLinks(v, depth + 1, out, seen);
      }
    }
  }
  return out;
}

/**
 * The url of a link entry, whether it is the new { url, label } object or
 * the plain string older answers (and any cached response) carried.
 */
function linkUrl(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return typeof entry.url === "string" ? entry.url : "";
}

/**
 * The federal-data-apis client fans out to several systems inside one
 * result. Split it back into catalog ids so the answer cites USASpending
 * and SAM.gov separately instead of one blob.
 */
function splitFederalData(data) {
  const parts = [];
  if (!data || typeof data !== "object") return parts;
  const usa = [];
  if (data.usaspending_awards && Array.isArray(data.usaspending_awards.awards) && data.usaspending_awards.awards.length) usa.push(data.usaspending_awards);
  if (data.usaspending_recipient_awards && Array.isArray(data.usaspending_recipient_awards.awards) && data.usaspending_recipient_awards.awards.length) usa.push(data.usaspending_recipient_awards);
  if (data.spending_categories && Array.isArray(data.spending_categories.categories) && data.spending_categories.categories.length) usa.push(data.spending_categories);
  if (data.agency_spending && data.agency_spending.spending) usa.push(data.agency_spending);
  if (usa.length) parts.push({ id: "usaspending", data: usa });
  if (data.sam_opportunities && Array.isArray(data.sam_opportunities.opportunities) && data.sam_opportunities.opportunities.length) parts.push({ id: "sam_opportunities", data: data.sam_opportunities });
  if (data.federal_register && Array.isArray(data.federal_register.documents) && data.federal_register.documents.length) parts.push({ id: "federal_register", data: data.federal_register });
  if (data.gao_reports && Array.isArray(data.gao_reports.reports) && data.gao_reports.reports.length) parts.push({ id: "gao_reports", data: data.gao_reports });
  return parts;
}

/**
 * Build the per-answer sources list.
 *
 * @param {Array<{id:string, used:boolean, data:*}>} systems - one entry per
 *   fan-out system; `used` is true when its formatted context was non-empty
 *   (i.e. the model actually saw something from it).
 * @param {Array} corpusMatches - MMT archive matches ({title, date, type, url})
 * @param {string|null} [queriedAt] - ISO time the fan-out ran, stamped on
 *   each system source as `queried_at` (null when the caller does not say).
 * @returns {Array<{id, name, kind, url, mode, links?, queried_at?, title?, date?}>}
 */
function buildSources({ systems = [], corpusMatches = [], queriedAt = null } = {}) {
  const out = [];
  const stamp = typeof queriedAt === "string" && queriedAt ? queriedAt : null;
  for (const m of corpusMatches || []) {
    if (!m || !m.url) continue;
    out.push({
      id: "mmt_archive",
      kind: "article",
      name: "Mission Meets Tech",
      title: m.title || "MMT article",
      date: m.date || null,
      type: m.type || null,
      url: /^https?:\/\//i.test(m.url) ? m.url : `https://missionmeetstech.com${m.url}`,
    });
  }
  const seen = new Set();
  for (const s of systems) {
    if (!s || !s.used) continue;
    const cat = CATALOG_BY_ID[s.id];
    if (!cat || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({
      id: cat.id,
      kind: "system",
      name: cat.name,
      url: cat.url,
      mode: cat.mode,
      links: extractLinks(s.data),
      queried_at: stamp,
    });
  }
  return out;
}

module.exports = { SOURCE_CATALOG, CATALOG_BY_ID, buildSources, extractLinks, linkUrl, splitFederalData };
