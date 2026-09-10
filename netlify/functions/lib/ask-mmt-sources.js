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
// listing a source the answer will never cite).
// ============================================================

const SOURCE_CATALOG = [
  { id: "mmt_archive", name: "MMT article archive", url: "https://missionmeetstech.com/latest", mode: "index",
    provides: "Every published MMT analysis, Friday brief, monthly brief, Contract Tracker note, and IDIQ analyst note",
    use: "Context: what Mary has already worked out about the vehicle, agency, or program. Cited by article, with the link." },
  { id: "usaspending", name: "USASpending.gov", url: "https://www.usaspending.gov", mode: "live",
    provides: "Federal obligations, awards, recipients, spending by agency and NAICS",
    use: "Who won what, for how much, and how the money has moved" },
  { id: "sam_opportunities", name: "SAM.gov Opportunities", url: "https://sam.gov/search/?index=opp", mode: "live",
    provides: "Active solicitations, sources sought, RFIs, presolicitations, award notices",
    use: "Solicitation status, response deadlines, set-aside and NAICS details" },
  { id: "federal_register", name: "Federal Register", url: "https://www.federalregister.gov", mode: "live",
    provides: "Rules, proposed rules, and notices from federal agencies",
    use: "Regulatory actions that change a program or a requirement" },
  { id: "gao_reports", name: "GAO reports", url: "https://www.gao.gov/reports-testimonies", mode: "live",
    provides: "Government Accountability Office reports and testimonies",
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
    provides: "Catalog of federal assistance programs (formerly CFDA)",
    use: "The program authority behind a grant or cooperative agreement" },
  { id: "usajobs", name: "USAJOBS", url: "https://www.usajobs.gov", mode: "live",
    provides: "Open federal job announcements",
    use: "Hiring signals that show where an office is building capacity" },
  { id: "it_dashboard", name: "Federal IT Dashboard", url: "https://itdashboard.gov", mode: "live",
    provides: "Agency IT investment portfolios and CIO ratings",
    use: "The investment line and its rating behind an IT program" },
  { id: "cms", name: "CMS provider data", url: "https://data.cms.gov", mode: "live",
    provides: "Medicare and Medicaid provider, utilization, and program datasets",
    use: "CMS program facts and provider-level context" },
  { id: "onc_healthit", name: "ONC Health IT data", url: "https://www.healthit.gov/data", mode: "live",
    provides: "Health IT adoption, interoperability, and certification statistics",
    use: "Adoption and interoperability numbers behind a health IT claim" },
  { id: "onc_chpl", name: "ONC CHPL", url: "https://chpl.healthit.gov", mode: "live",
    provides: "Certified Health IT Product List",
    use: "Whether a product and edition are certified, and for what criteria" },
  { id: "hhs_open", name: "HHS open data", url: "https://healthdata.gov", mode: "live",
    provides: "HHS datasets across CDC, FDA, NIH, HRSA, and CMS",
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
];

const CATALOG_BY_ID = Object.fromEntries(SOURCE_CATALOG.map((s) => [s.id, s]));

const LINK_KEYS = /^(url|uilink|link|permalink|source_url|href|pdf_url|study_url)$/i;
const MAX_LINKS_PER_SYSTEM = 4;

/**
 * Walk an enrichment result (bounded depth) and collect the http(s) links
 * the model was shown. Network-free; never throws.
 */
function extractLinks(value, depth = 0, out = new Set()) {
  if (value == null || depth > 4 || out.size >= MAX_LINKS_PER_SYSTEM) return out;
  if (Array.isArray(value)) {
    for (const v of value) extractLinks(v, depth + 1, out);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (LINK_KEYS.test(k) && typeof v === "string" && /^https?:\/\//i.test(v)) {
        if (out.size < MAX_LINKS_PER_SYSTEM) out.add(v.trim());
      } else if (typeof v === "object") {
        extractLinks(v, depth + 1, out);
      }
    }
  }
  return out;
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
 * @returns {Array<{id, name, kind, url, mode, links?, title?, date?}>}
 */
function buildSources({ systems = [], corpusMatches = [] } = {}) {
  const out = [];
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
      links: Array.from(extractLinks(s.data)),
    });
  }
  return out;
}

module.exports = { SOURCE_CATALOG, CATALOG_BY_ID, buildSources, extractLinks, splitFederalData };
