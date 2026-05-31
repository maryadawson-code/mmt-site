// ============================================================
// signal-chain.js — Signal Chain Engine v2
//
// Rewrite per /Users/marywomack/Downloads/signal-chain-refinement-spec.md
// (2026-04-17). Fixes the v1 bugs:
//   - "muscle physiology / banana-peel carbon dots" PubMed results
//     (missing affiliation filter)
//   - 2010 hurricane EIS / 2020 arms sales contract results
//     (missing keyword filter on Federal Register, wrong source for
//      contract signals)
//   - Legislative/Workforce/Budget layers returning zero for every query
//
// Each of 5 layers scores 0–100 from 1–2 targeted API calls. Composite
// is weighted: Budget 25%, Contract 25%, Legislative 20%, Research 15%,
// Workforce 15%. Alert at composite ≥75 ("CAPTURE ALERT").
// ============================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { searchUSASpending, searchFederalRegister, searchGAOReports, searchSAMOpportunities } = require("./lib/federal-data-apis");
const { searchBills, searchBillSummaries, searchHearings, searchCRSReports, searchCommitteeReports } = require("./lib/congress-api");
const { searchTrials } = require("./lib/clinicaltrials-api");
const { searchPubMed, fetchPubMedSummaries } = require("./lib/pubmed-api");
// S-P5: rule/cert enrichment libs, surfaced as an informational layer (no
// composite weight). Dormant unless INTEL_RULES_CERT_LAYERS=true so prod
// behavior is unchanged until flipped; each call is try/catch + graceful skip,
// matching the existing federal-lib pattern.
const { enrichWithRegulationsGov } = require("./lib/regulations-gov");
const { enrichWithECFR } = require("./lib/ecfr-api");
const { enrichWithCHPL } = require("./lib/onc-chpl-api");
const INTEL_RULES_CERT_LAYERS = (process.env.MMT_API_ON || "").split(",").map((s) => s.trim()).includes("p5");
const { searchJobs } = require("./lib/usajobs-api");
const { detectVehicles, expandedSearchTerms } = require("./lib/known-vehicles");
const { buildQueryTerms, buildPubMedQuery, FR_AGENCY_SLUGS, USASPENDING_AGENCY_NAMES, correctCommonTypos, fallbackSuggestionsFor } = require("./lib/signal-chain-query-builder");
const { searchCorpus } = require("./lib/content-index");
const fs = require("fs");
const path = require("path");
const { getFlag } = require("./lib/feature-flags");
const { loadToolContext, buildToolEnvelope, buildEvidencePanel, renderBlockedResponse } = require("./lib/premium-tools-core");
const { loadEntitlement, blockMessageFor, logEntitlementMismatch } = require("./lib/entitlement");

// Contracts intelligence — Mary-curated intel on known programs.
// See content-index.js for the path-candidate rationale.
const CONTRACTS_CANDIDATES = [
  path.join(__dirname, "..", "..", "contracts.json"),
  path.join(process.cwd(), "contracts.json"),
  "/var/task/contracts.json",
  path.join(process.env.LAMBDA_TASK_ROOT || "", "contracts.json"),
];
let CONTRACTS_DATA = null;
function loadContracts() {
  if (CONTRACTS_DATA) return CONTRACTS_DATA;
  for (const candidate of CONTRACTS_CANDIDATES) {
    if (!candidate) continue;
    try {
      CONTRACTS_DATA = JSON.parse(fs.readFileSync(candidate, "utf8"));
      return CONTRACTS_DATA;
    } catch (_) { /* try next */ }
  }
  CONTRACTS_DATA = [];
  return CONTRACTS_DATA;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const CACHE_TTL_HOURS = 168; // 1 week — signal data moves slowly
const DAY_MS = 86400000;

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function formatDollarsShort(n) {
  if (!n) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}
function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return Infinity;
  return (Date.now() - d) / DAY_MS;
}
function race(ms, fn) {
  return Promise.race([
    fn().catch((e) => ({ __error: e.message })),
    new Promise((resolve) => setTimeout(() => resolve({ __timedOut: true }), ms)),
  ]);
}

// ------------------------------------------------------------
// Layer 1: Research (PubMed + ClinicalTrials.gov) — weight 15%
// ------------------------------------------------------------
async function layerResearch(terms, agency) {
  const pubmedQuery = buildPubMedQuery(terms, agency);
  const [pm, trials] = await Promise.all([
    searchPubMed({ query: pubmedQuery, retmax: 5, daysBack: 730 }).catch(() => ({ pmids: [], count: 0 })),
    searchTrials({
      query: terms.base,
      sponsor: agency === "DHA" || agency === "DoD" ? "Defense Health Agency" : (agency === "VA" ? "VA Office of Research" : undefined),
      status: ["COMPLETED", "ACTIVE_NOT_RECRUITING", "RECRUITING"],
      limit: 5,
    }).catch(() => ({ studies: [], total: 0 })),
  ]);
  const articles = pm.pmids.length > 0
    ? (await fetchPubMedSummaries(pm.pmids).catch(() => ({ articles: [] }))).articles || []
    : [];

  const pubmedCount = pm.count || articles.length;
  const trialsCount = trials.total || (trials.studies || []).length;
  const trialResults = trials.studies || [];
  const recentCompleted = trialResults.filter((t) =>
    (t.status || "").toUpperCase() === "COMPLETED" && daysAgo(t.completion_date) < 730
  );

  let score = 0;
  if (pubmedCount > 30) score += 50;
  else if (pubmedCount > 15) score += 40;
  else if (pubmedCount > 7) score += 30;
  else if (pubmedCount > 3) score += 20;
  else if (pubmedCount > 0) score += 10;
  if (trialsCount > 10) score += 50;
  else if (trialsCount > 5) score += 40;
  else if (trialsCount > 2) score += 25;
  else if (trialsCount > 0) score += 15;
  if (recentCompleted.length > 0) score = Math.min(score + 10, 100);

  const signals = [
    ...articles.slice(0, 3).map((a) => ({
      title: (a.title || "").substring(0, 140),
      url: a.url,
      source: "PubMed",
      date: a.pub_date,
      organization: a.journal,
      relevanceNote: null,
    })),
    ...trialResults.slice(0, 2).map((t) => ({
      title: (t.title || "").substring(0, 140),
      url: t.url,
      source: "ClinicalTrials",
      date: t.completion_date || t.start_date,
      organization: t.lead_sponsor,
      relevanceNote: (t.status || "").toUpperCase() === "COMPLETED" ? "Completed — results often feed next-phase procurement" : null,
    })),
  ];

  const reason = signals.length === 0
    ? `No recent federal-affiliated research found for these keywords in PubMed or ClinicalTrials.gov (${agency || "any agency"}).`
    : null;

  return { score: clamp(score, 0, 100), weight: 0.15, source: "PubMed + ClinicalTrials", signals, noSignalReason: reason };
}

// ------------------------------------------------------------
// Layer 2: Legislative (Congress + Committee Reports) — weight 20%
// ------------------------------------------------------------
async function layerLegislative(terms) {
  // SC-3: Congress.gov's `q` param does not actually keyword-filter on
  // `/v3/bill/{congress}` (a query for "TRICARE" returned 2007 Congress
  // 110 bills about Northern Ireland). Switched the upstream client to
  // pull a wide window (last 180 days, up to 250 results) and post-filter
  // here against title + latest-action text AND bill summaries
  // (richer text — short program names like "MHS GENESIS" show up in
  // summaries when they don't appear in titles).
  const [bills, summaries, hearings, reports] = await Promise.all([
    searchBills({ congress: 119, limit: 250, daysBack: 180 }).catch((e) => ({ bills: [], error: e && e.message })),
    searchBillSummaries({ congress: 119, limit: 250, daysBack: 180 }).catch((e) => ({ summaries: [], error: e && e.message })),
    searchHearings({ congress: 119, limit: 100 }).catch((e) => ({ hearings: [], error: e && e.message })),
    searchCommitteeReports({ congress: 119, limit: 100 }).catch((e) => ({ reports: [], error: e && e.message })),
  ]);

  const _apiErrors = [];
  if (bills.error) _apiErrors.push({ source: "congress_bills", message: bills.error });
  if (summaries.error) _apiErrors.push({ source: "congress_summaries", message: summaries.error });
  if (hearings.error) _apiErrors.push({ source: "congress_hearings", message: hearings.error });
  if (reports.error) _apiErrors.push({ source: "congress_reports", message: reports.error });

  const tokens = (terms.topKeywords || []).map((k) => String(k || "").toLowerCase()).filter(Boolean);
  const matchesAny = (text) => {
    if (!text || tokens.length === 0) return false;
    const lc = String(text).toLowerCase();
    return tokens.some((t) => lc.includes(t));
  };

  // Build a lookup of bill identity → summary text so we can use summary
  // text to qualify a bill that otherwise only matches in its summary.
  // Key shape: `${congress}-${type}-${number}` (case-insensitive on type).
  const summaryIndex = new Map();
  for (const s of (summaries.summaries || [])) {
    const key = `${s.congress}-${String(s.type || "").toLowerCase()}-${s.number}`;
    // Concatenate summary text if multiple summary actions per bill
    const prev = summaryIndex.get(key) || "";
    summaryIndex.set(key, (prev + " " + (s.text || "")).trim());
  }

  const billList = (bills.bills || [])
    .filter((b) => {
      if (matchesAny(b.title) || matchesAny(b.latest_action)) return true;
      const key = `${b.congress}-${String(b.type || "").toLowerCase()}-${b.number}`;
      return matchesAny(summaryIndex.get(key));
    })
    .slice(0, 5);

  const hearingList = (hearings.hearings || []).filter((h) => matchesAny(h.title) || matchesAny(h.committee)).slice(0, 5);
  const reportList = (reports.reports || []).filter((r) => matchesAny(r.title)).slice(0, 3);

  let score = 0;
  score += Math.min(billList.length * 10, 40);
  hearingList.forEach((h) => {
    score += daysAgo(h.date) < 90 ? 15 : 8;
  });
  score = Math.min(score, 80);
  score += Math.min(reportList.length * 7, 20);
  score = clamp(score, 0, 100);

  const signals = [
    ...billList.slice(0, 2).map((b) => ({
      title: `${b.type} ${b.number}: ${(b.title || "").substring(0, 100)}`,
      url: b.url,
      source: "Congress.gov",
      date: b.latest_action_date || b.update_date,
      organization: "119th Congress",
      relevanceNote: b.latest_action ? `Latest action: ${b.latest_action.substring(0, 80)}` : null,
    })),
    ...hearingList.slice(0, 2).map((h) => ({
      title: (h.title || "").substring(0, 120),
      url: h.url,
      source: "Congress.gov",
      date: h.date,
      organization: h.committee,
      relevanceNote: null,
    })),
    ...reportList.slice(0, 1).map((r) => ({
      title: (r.title || "").substring(0, 120),
      url: r.url,
      source: "Congress.gov",
      date: null,
      organization: `${r.chamber || ""} ${r.type || ""}`.trim() || "Committee Report",
      relevanceNote: null,
    })),
  ];

  const reason = signals.length === 0
    ? "No active bills or hearings found in 119th Congress for these terms."
    : null;

  return { score, weight: 0.20, source: "Congress.gov + GovInfo", signals, noSignalReason: reason, _apiErrors };
}

// ------------------------------------------------------------
// Layer 3: Workforce (USAJobs) — weight 15%
// ------------------------------------------------------------
async function layerWorkforce(terms, agency) {
  const agencyCodeMap = { DHA: "DD17", VA: "VATA", HHS: "HE00", DoD: "DD00", GSA: "GS00" };
  const org = agencyCodeMap[agency];

  // SC-5: USAJobs keyword expansion. The precise 2-token keyword
  // ("mhs genesis") matches almost nothing because USAJobs job titles
  // use generic role language ("Health IT Specialist," "Project
  // Manager"), not program names. Run a tiered query:
  //   primary  = 2-token precise phrase (terms.forUSAJobs)
  //   broad    = 1-token program anchor (terms.forUSAJobsBroad) — only
  //              fires when primary returns 0 useful matches.
  // Union by usajobs.position_id so duplicates don't double-count.
  const primary = await searchJobs({
    keyword: terms.forUSAJobs,
    agency: org,
    limit: 10,
  }).catch((e) => ({ jobs: [], error: e && e.message ? e.message : String(e) }));

  const _apiErrors = [];
  if (primary.error) _apiErrors.push({ source: "usajobs", call: "primary", message: primary.error });

  let jobs = primary.jobs || [];
  let broadFired = false;
  if (jobs.length < 3 && terms.forUSAJobsBroad && terms.forUSAJobsBroad !== terms.forUSAJobs) {
    broadFired = true;
    const broad = await searchJobs({
      keyword: terms.forUSAJobsBroad,
      agency: org,
      limit: 10,
    }).catch((e) => ({ jobs: [], error: e && e.message ? e.message : String(e) }));
    if (broad.error) _apiErrors.push({ source: "usajobs", call: "broad", message: broad.error });
    // Union by job id (or url as fallback) so a job that matched both
    // queries doesn't count twice.
    const seen = new Set(jobs.map((j) => j.id || j.url));
    for (const j of (broad.jobs || [])) {
      const key = j.id || j.url;
      if (key && !seen.has(key)) { seen.add(key); jobs.push(j); }
    }
  }

  const keywordsLower = terms.topKeywords.map((k) => k.toLowerCase());
  // Broaden the post-filter so a tier-1 job that matches a single
  // 4+ char token (e.g., "modernization") is kept. The previous
  // includes() pass against ALL topKeywords was the second narrowness
  // bottleneck — drop the AND-style intersection and accept any
  // single-keyword title overlap.
  const relevant = jobs.filter((p) => {
    const title = (p.position_title || "").toLowerCase();
    return keywordsLower.some((k) => k.length > 3 && title.includes(k));
  });

  let score = 0;
  if (relevant.length > 10) score += 60;
  else if (relevant.length > 5) score += 45;
  else if (relevant.length > 2) score += 30;
  else if (relevant.length > 0) score += 15;
  else if (jobs.length > 0) score += 5;
  const senior = relevant.filter((p) => {
    const t = (p.position_title || "").toLowerCase();
    if (/senior|lead|director|chief|supervisor/.test(t)) return true;
    const pm = parseFloat(p.pay_max || p.pay_min || 0);
    return pm > 130000;
  });
  score += Math.min(senior.length * 12, 25);
  const veryRecent = relevant.filter((p) => daysAgo(p.open_date) < 14);
  if (veryRecent.length > 0) score += 15;
  score = clamp(score, 0, 100);

  const signals = relevant.slice(0, 5).map((j) => ({
    title: (j.position_title || "").substring(0, 120),
    url: j.url,
    source: "USAJobs",
    date: j.open_date,
    organization: `${j.agency || ""}${j.location ? " · " + j.location : ""}`,
    relevanceNote: /senior|lead|director|chief|supervisor/i.test(j.position_title || "")
      ? "Senior hire — program leadership signal"
      : null,
  }));

  // notConfigured is a softer state than apiError — it tells the
  // frontend to render "Setup required" / "key not configured" copy
  // (amber) rather than "Data source unavailable" (red). Without this
  // distinction, every Signal Chain run looks broken until the operator
  // sets USAJOBS_API_KEY.
  const notConfigured = !!(primary && primary.notConfigured);
  const reason = signals.length === 0
    ? (notConfigured
        ? "Workforce layer needs USAJOBS_API_KEY in Netlify env (register at developer.usajobs.gov)."
        : _apiErrors.length > 0
          ? `USAJobs search failed (${_apiErrors[0].message}). No data — distinct from a confirmed zero.`
          : `No active federal job postings matching these keywords at ${agency || "any agency"}${broadFired ? " (tried both precise and broadened searches)" : ""}. Hiring leads contracts by 6–18 months — check back.`)
    : null;

  return { score, weight: 0.15, source: "USAJobs", signals, noSignalReason: reason, notConfigured, _apiErrors, _broadFired: broadFired };
}

// ------------------------------------------------------------
// Layer 4: Budget (USASpending + GAO) — weight 25%
// ------------------------------------------------------------
async function layerBudget(terms, agency) {
  const [awards, gaoReports] = await Promise.all([
    searchUSASpending({
      keyword: terms.forUSASpending,
      agency,
      startDate: new Date(Date.now() - 730 * DAY_MS).toISOString().slice(0, 10),
      limit: 10,
    }).catch((e) => ({ awards: [], total: 0, error: e && e.message ? e.message : String(e) })),
    searchGAOReports({ keyword: terms.forUSASpending, limit: 3 }).catch((e) => ({ reports: [], error: e && e.message ? e.message : String(e) })),
  ]);

  const _apiErrors = [];
  if (awards.error) _apiErrors.push({ source: "usaspending", status: awards.status || null, message: awards.error });
  if (gaoReports.error) _apiErrors.push({ source: "gao", message: gaoReports.error });

  const awardList = awards.awards || [];
  const totalObligated = awardList.reduce((s, a) => s + (a.obligated || 0), 0);
  const awardCount = awardList.length;
  const mostRecentDaysAgo = awardList.length > 0
    ? Math.min(...awardList.map((a) => daysAgo(a.start_date || a.end_date)))
    : Infinity;
  const gao = gaoReports.reports || [];

  let score = 0;
  if (totalObligated > 500_000_000) score += 50;
  else if (totalObligated > 100_000_000) score += 40;
  else if (totalObligated > 50_000_000) score += 30;
  else if (totalObligated > 10_000_000) score += 20;
  else if (totalObligated > 1_000_000) score += 10;
  else if (awardCount > 0) score += 5;
  if (mostRecentDaysAgo < 30) score += 30;
  else if (mostRecentDaysAgo < 90) score += 20;
  else if (mostRecentDaysAgo < 180) score += 10;
  else if (mostRecentDaysAgo < 365) score += 5;
  score += Math.min(gao.length * 10, 20);
  score = clamp(score, 0, 100);

  const signals = [
    ...awardList.slice(0, 3).map((a) => ({
      title: `${formatDollarsShort(a.obligated || 0)} to ${a.recipient || "Unknown"}`,
      url: a.source_url,
      source: "USASpending",
      date: a.start_date,
      organization: a.sub_agency || a.agency,
      relevanceNote: (a.obligated || 0) > 50_000_000 ? "Major award" : null,
    })),
    ...gao.slice(0, 2).map((r) => ({
      title: (r.title || "").substring(0, 120),
      url: r.url,
      source: "GAO",
      date: r.date,
      organization: "Government Accountability Office",
      relevanceNote: "GAO scrutiny often precedes budget action",
    })),
  ];

  const reason = signals.length === 0
    ? `No obligation data found for these keywords at ${agency || "any agency"} in USASpending. Try a broader search term.`
    : null;

  return { score, weight: 0.25, source: "USASpending + GAO", signals, noSignalReason: reason, _apiErrors };
}

// ------------------------------------------------------------
// Layer 5: Contract (SAM.gov primary, Federal Register supplemental) — weight 25%
// ------------------------------------------------------------
const SAM_TYPE_WEIGHTS = { o: 25, r: 20, p: 15, k: 12, s: 8 };
const SAM_TYPE_LABELS = {
  o: "Solicitation", r: "Combined Synopsis/Solicitation",
  p: "Pre-Solicitation", k: "Sources Sought", s: "Special Notice",
};

async function layerContract(terms, agency) {
  const [samOpps, frDocs] = await Promise.all([
    // SC-4: SAM.gov rewrite — full-text `q`, ptype=o,r,p,k (active only),
    // optional deptname, secondary union call for recently-posted gaps.
    searchSAMOpportunities({
      keyword: terms.forSAM,
      agency,
      limit: 25,
      daysBack: 180,
    }).catch((e) => ({ opportunities: [], total: 0, error: e && e.message })),
    // Federal Register supplemental, ALWAYS with keyword filter now.
    searchFederalRegister({
      keyword: terms.forFedRegister,
      agencies: FR_AGENCY_SLUGS[agency] || undefined,
      type: ["NOTICE", "RULE"],
      limit: 3,
    }).catch((e) => ({ documents: [], total: 0, error: e && e.message })),
  ]);

  const _apiErrors = [];
  if (samOpps.error) _apiErrors.push({ source: "sam_gov", status: samOpps.status || null, message: samOpps.error });
  if (frDocs.error) _apiErrors.push({ source: "federal_register", message: frDocs.error });

  // Archive-style notices have already been filtered out by ptype on the
  // SAM call. Defensive secondary filter in case the API returns one
  // anyway — drop anything that isn't in the active-solicitation ptype set.
  const ACTIVE_PTYPES = new Set(["o", "r", "p", "k"]);
  const opps = (samOpps.opportunities || []).filter((opp) => {
    if (!opp.ptype) return true; // permissive when ptype absent
    return ACTIVE_PTYPES.has(opp.ptype);
  });
  const docs = frDocs.documents || [];

  let score = 0;
  opps.forEach((opp) => {
    const typeKey = (opp.type || "").toLowerCase()[0] || "s";
    const weight = SAM_TYPE_WEIGHTS[typeKey] || 5;
    const dAgo = daysAgo(opp.posted_date);
    const recency = dAgo < 30 ? 1.0 : dAgo < 60 ? 0.75 : dAgo < 90 ? 0.5 : 0.25;
    score += weight * recency;
  });
  score = Math.min(score, 80);
  if (docs.length > 0) score += Math.min(docs.length * 7, 20);
  score = clamp(score, 0, 100);

  const signals = [
    ...opps.slice(0, 5).map((opp) => {
      const typeKey = (opp.type || "").toLowerCase()[0] || "s";
      const label = SAM_TYPE_LABELS[typeKey] || opp.type || "Notice";
      return {
        title: `[${label}] ${(opp.title || "").substring(0, 100)}`,
        url: opp.url,
        source: "SAM.gov",
        date: opp.posted_date,
        organization: opp.agency,
        relevanceNote: typeKey === "o" ? "LIVE SOLICITATION" : null,
      };
    }),
    ...docs.slice(0, 2).map((d) => ({
      title: (d.title || "").substring(0, 120),
      url: d.url,
      source: "Federal Register",
      date: d.publication_date,
      organization: d.agencies,
      relevanceNote: null,
    })),
  ];

  // SAM throttle flag-through: the underlying searchSAMOpportunities
  // sets rateLimited=true with resetAt when SAM returns 429 or code
  // 900804. We surface those flags on the layer so the frontend can
  // render an amber "Resets <date>" badge instead of a red "Data
  // source unavailable" badge — very different operator action.
  const rateLimited = !!samOpps.rateLimited;
  const resetAt = samOpps.resetAt || null;
  const reason = signals.length === 0
    ? (rateLimited
        ? `SAM.gov quota exceeded (resets ${resetAt || "soon"}). Federal Register returned no matches either — contract layer is partial this window.`
        : `No active SAM.gov solicitations matching these keywords at ${agency || "any agency"}. Zero Federal Register notices in the window.`)
    : (opps.length === 0 && docs.length > 0
        ? (rateLimited
            ? `SAM.gov quota exceeded (resets ${resetAt || "soon"}). Showing ${docs.length} Federal Register notice${docs.length === 1 ? "" : "s"} from the supplemental layer.`
            : `No active SAM.gov solicitations found. ${docs.length} Federal Register notice${docs.length === 1 ? "" : "s"} — showing most relevant.`)
        : null);

  return {
    score,
    weight: 0.25,
    source: "SAM.gov + Federal Register",
    signals,
    noSignalReason: reason,
    rateLimited,
    resetAt,
    _apiErrors,
  };
}

// ------------------------------------------------------------
// Layer 6: MMT Coverage (Mary's articles + contracts intel) — weight 0%
// Informational layer so subscribers see Mary's own reporting on the
// topic. Includes aliases (HCDS, CSO, DHMSM, etc.) via tokenized search
// against the content corpus + contracts.json.
// ------------------------------------------------------------
function layerMmtCoverage(terms, topic) {
  const query = [topic, ...(terms.topKeywords || []), ...(terms.aliases || [])].filter(Boolean).join(" ");
  let articles = [];
  try {
    articles = searchCorpus(query, 5).map((a) => ({
      title: a.title,
      url: a.url && a.url.startsWith("http") ? a.url : `https://missionmeetstech.com${a.url || ""}`,
      date: a.date || "",
      source: "Mission Meets Tech",
      organization: a.type === "episode" ? "MMT Podcast" : "MMT Analysis",
      relevanceNote: (a.description || "").substring(0, 140),
    }));
  } catch (_) { /* corpus unavailable */ }

  const contracts = loadContracts();
  const tokens = (terms.topKeywords || [])
    .concat([topic])
    .map((t) => String(t || "").toLowerCase())
    .filter((t) => t.length > 2);
  const contractSignals = contracts
    .filter((c) => {
      const hay = `${c.name || ""} ${c.description || ""} ${c.agency || ""}`.toLowerCase();
      return tokens.some((t) => hay.includes(t));
    })
    .slice(0, 5)
    .map((c) => ({
      title: `${c.name}${c.status ? ` · ${c.status}` : ""}`,
      url: c.link || `https://missionmeetstech.com/contract-tracker.html`,
      date: c.last_verified || "",
      source: "MMT Contract Tracker",
      organization: c.agency || "",
      relevanceNote: c.pursuit_score && c.pursuit_score.headline
        ? `Verdict ${c.pursuit_score.verdict}: ${c.pursuit_score.headline}`
        : (c.value || ""),
    }));

  const signals = [...articles, ...contractSignals];
  const reason = signals.length === 0
    ? `No MMT coverage found for "${topic}". If this is a newer program, Mary may be tracking it under a different name — e.g., DHMSM coverage often lives under HCDS or CSO.`
    : null;

  return {
    score: 0,            // informational — does not affect composite
    weight: 0,
    source: "Mission Meets Tech (articles + contract tracker)",
    signals,
    noSignalReason: reason,
  };
}

// ------------------------------------------------------------
// S-P5: informational rule/cert layer — live rulemaking + comment periods
// (Regulations.gov), current CFR sections (eCFR), and certified health IT
// products (ONC CHPL). Score 0 / weight 0 — does NOT affect the composite.
// Dormant unless INTEL_RULES_CERT_LAYERS=true; every call is graceful.
// ------------------------------------------------------------
async function layerRulesCert(terms, topic) {
  const empty = { score: 0, weight: 0, source: "Federal rules & certifications (Regulations.gov, eCFR, ONC CHPL)", signals: [], noSignalReason: null };
  if (!INTEL_RULES_CERT_LAYERS) return empty;
  const signals = [];
  try {
    const [reg, ecfr, chpl] = await Promise.all([
      enrichWithRegulationsGov({ topic }).catch(() => null),
      enrichWithECFR({ topic }).catch(() => null),
      enrichWithCHPL({ topic }).catch(() => null),
    ]);
    const docs = reg && reg.openComments && reg.openComments.documents;
    if (Array.isArray(docs)) {
      for (const d of docs.slice(0, 3)) {
        signals.push({ title: String(d.title || d.id || "Open comment period").substring(0, 140), url: d.url || "", date: d.comment_end || "", source: "Regulations.gov", organization: d.agency || "", relevanceNote: `Open comment period · due ${d.comment_end || "TBD"}` });
      }
    }
    const dockets = reg && reg.dockets && reg.dockets.dockets;
    if (Array.isArray(dockets)) {
      for (const d of dockets.slice(0, 2)) {
        signals.push({ title: String(d.title || d.id || "Rulemaking docket").substring(0, 140), url: d.url || "", date: d.posted || "", source: "Regulations.gov", organization: d.agency || "", relevanceNote: "Active rulemaking docket" });
      }
    }
    if (ecfr && Array.isArray(ecfr.results)) {
      for (const r of ecfr.results.slice(0, 3)) {
        signals.push({ title: `${r.hierarchy || "CFR"}${r.section ? ` § ${r.section}` : ""}`.substring(0, 140), url: r.url || "", date: "", source: "eCFR", organization: "", relevanceNote: String(r.headline || "").replace(/\s+/g, " ").substring(0, 160) });
      }
    }
    const products = chpl && (Array.isArray(chpl.products) ? chpl.products : (chpl.products && chpl.products.products));
    if (Array.isArray(products)) {
      for (const p of products.slice(0, 3)) {
        const name = p.product_name || p.product || p.name || "";
        const dev = p.developer || "";
        if (!name && !dev) continue;
        signals.push({ title: `${dev ? dev + " — " : ""}${name}`.substring(0, 140), url: p.url || "https://chpl.healthit.gov", date: p.status_date || "", source: "ONC CHPL", organization: dev, relevanceNote: `${p.edition || "Certified"} · ${p.status || "health IT product"}` });
      }
    }
  } catch (_) { /* graceful — informational layer never breaks the response */ }
  return { ...empty, signals, noSignalReason: signals.length === 0 ? `No rules/cert signals for "${topic}".` : null };
}

// ------------------------------------------------------------
// Composite + verdict
// ------------------------------------------------------------
function computeComposite(layers) {
  return Math.round(
    (layers.research.score * 0.15) +
    (layers.legislative.score * 0.20) +
    (layers.workforce.score * 0.15) +
    (layers.budget.score * 0.25) +
    (layers.contract.score * 0.25)
  );
}

function getVerdict(composite) {
  if (composite >= 75) return { verdict: "CAPTURE ALERT", captureAlert: true, color: "#E63946" };
  if (composite >= 55) return { verdict: "ACTIVE", captureAlert: false, color: "#15803D" };
  if (composite >= 40) return { verdict: "BUILDING", captureAlert: false, color: "#457B9D" };
  if (composite >= 25) return { verdict: "EMERGING", captureAlert: false, color: "#92710A" };
  return { verdict: "QUIET", captureAlert: false, color: "#6B7280" };
}

// ------------------------------------------------------------
// Caching (1-week TTL, ops_events-backed)
// ------------------------------------------------------------
// Cache version — bump when the response shape or scoring algorithm
// changes so subscribers don't keep reading pre-fix stale entries for
// up to a week.
//   v2 = Sprint 8a (SC-1/SC-2/SC-7): USASpending payload fix, FR DHA
//        slug fix, topKeywords dedup, _apiErrors in layer payload.
//   v3 = Sprint 8c (SC-5/SC-6/SC-8 + SAM relevance bleed): tiered
//        USAJobs query w/ broad fallback, top-level apiErrors[],
//        suggestions exclude current topic, SAM secondary call
//        drops when primary >= 3 hits.
//   v4 = SC-OPS (2026-05-18): SAM throttle detection (rateLimited/
//        resetAt), USAJobs notConfigured flag, contract layer
//        rateLimited+resetAt fields, stale_fallback attachment.
const CACHE_VERSION = "v4";
function cacheKeyFor(topic, agency) {
  const now = new Date();
  const week = Math.floor((now - new Date(now.getUTCFullYear(), 0, 1)) / (7 * DAY_MS));
  const normalized = `${CACHE_VERSION}|${(topic || "").toLowerCase().trim()}|${agency || ""}|W${now.getUTCFullYear()}-${week}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function readCache(supabase, key) {
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("ops_events")
      .select("details, created_at")
      .eq("event_type", "signal_chain_cache")
      .eq("details->>cache_key", key)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.details && data.details.card) {
      return { card: data.details.card, cachedAt: data.created_at };
    }
  } catch (_) { /* swallow */ }
  return null;
}

async function writeCache(supabase, key, card) {
  try {
    await supabase.from("ops_events").insert({
      event_type: "signal_chain_cache",
      details: { cache_key: key, card, stored_at: new Date().toISOString() },
    });
  } catch (_) { /* swallow */ }
}

// Stale-cache fallback for the rate-limited + upstream-broken case.
// Unlike readCache (which enforces a 7-day TTL), this scans recent
// cache rows and finds one whose payload matches our topic+agency
// regardless of age. Used when SAM is throttled or USASpending is
// down — we degrade to last-known-good rather than serving an empty
// card during transient upstream outages.
//
// Returns null if no prior cache exists for this topic.
async function readAnyPriorCache(supabase, topic, agency) {
  try {
    const cutoff = new Date(Date.now() - 90 * DAY_MS).toISOString();
    const { data } = await supabase
      .from("ops_events")
      .select("details, created_at")
      .eq("event_type", "signal_chain_cache")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!Array.isArray(data)) return null;
    const tNorm = (topic || "").toLowerCase().trim();
    const aNorm = agency || "";
    for (const row of data) {
      const card = row.details && row.details.card;
      if (!card) continue;
      if ((card.topic || "").toLowerCase().trim() === tNorm && (card.agency || "") === aNorm) {
        return { card, cachedAt: row.created_at };
      }
    }
  } catch (_) { /* swallow */ }
  return null;
}

// ------------------------------------------------------------
// Main handler
// ------------------------------------------------------------
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }

  // Accept topic + agency via querystring (GET) or JSON body (POST)
  let email, topic, agency, company;
  if (event.httpMethod === "GET") {
    const qs = event.queryStringParameters || {};
    email = (qs.email || "").toLowerCase().trim();
    topic = (qs.topic || "").trim();
    agency = qs.agency || null;
    company = qs.company || null;
  } else {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    email = (body.email || "").toLowerCase().trim();
    topic = (body.topic || "").trim();
    agency = body.agency || null;
    company = body.company || null;
  }

  if (!email || !topic) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email and topic required" }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid email" }) };
  }
  if (topic.length < 3) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "QUERY_TOO_SHORT", message: "Enter at least 3 characters." }) };
  }

  // Typo correction — silently fix common federal-vocab misspellings
  // before we burn API quota on a query that returns 0 results across
  // every layer. The corrected topic is what reaches the upstream APIs;
  // the original is preserved on the response so the user sees a
  // "We searched 'X' (corrected from 'Y')." line in the UI.
  const _typoFix = correctCommonTypos(topic);
  const originalTopic = topic;
  if (_typoFix.changed) {
    console.log(`signal-chain: typo correction "${topic}" -> "${_typoFix.corrected}" (${_typoFix.replacements.map(([f,t]) => `${f}→${t}`).join(", ")})`);
    topic = _typoFix.corrected;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const entitlement = await loadEntitlement(supabase, email);
  if (!entitlement.ok) {
    const block = blockMessageFor(entitlement);
    await logEntitlementMismatch(supabase, { email, tool: "signal_chain", entitlement, expected: "premium|founding|institutional|admin" });
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: block.message,
        reason_code: block.reason_code,
        detected_tier: entitlement.tier,
        support: "mary@missionmeetstech.com",
      }),
    };
  }

  // Cache read
  const cacheKey = cacheKeyFor(topic, agency);
  const cached = await readCache(supabase, cacheKey);
  if (cached) {
    const ageHours = Math.floor((Date.now() - new Date(cached.cachedAt).getTime()) / 3600000);
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "X-Cache": "HIT" },
      body: JSON.stringify({ ...cached.card, cached: true, cachedAgoHours: ageHours }),
    };
  }

  // Vehicle detection — resolve aliases (OASIS+ → "OASIS Plus" etc.)
  const matchedVehicles = detectVehicles(topic);
  const resolvedTopic = matchedVehicles.length > 0
    ? [topic, ...expandedSearchTerms(matchedVehicles)].join(" ")
    : topic;
  const resolvedAgency = agency || (matchedVehicles[0] && matchedVehicles[0].agency) || null;

  const terms = buildQueryTerms(resolvedTopic, resolvedAgency);

  // Run all 5 layers in parallel with 6s per-layer timeout
  const [research, legislative, workforce, budget, contract, rulesCert] = await Promise.all([
    race(6000, () => layerResearch(terms, resolvedAgency)),
    race(6000, () => layerLegislative(terms)),
    race(6000, () => layerWorkforce(terms, resolvedAgency)),
    race(6000, () => layerBudget(terms, resolvedAgency)),
    race(6000, () => layerContract(terms, resolvedAgency)),
    race(6000, () => layerRulesCert(terms, resolvedTopic)),
  ]);

  const zero = { score: 0, weight: 0, source: "", signals: [], noSignalReason: "Data source timed out — try again." };
  const timedOut = [];
  if (research.__timedOut) timedOut.push("research");
  if (legislative.__timedOut) timedOut.push("legislative");
  if (workforce.__timedOut) timedOut.push("workforce");
  if (budget.__timedOut) timedOut.push("budget");
  if (contract.__timedOut) timedOut.push("contract");

  const layers = {
    research:    research.__timedOut || research.__error ? { ...zero, weight: 0.15 } : research,
    legislative: legislative.__timedOut || legislative.__error ? { ...zero, weight: 0.20 } : legislative,
    workforce:   workforce.__timedOut || workforce.__error ? { ...zero, weight: 0.15 } : workforce,
    budget:      budget.__timedOut || budget.__error ? { ...zero, weight: 0.25 } : budget,
    contract:    contract.__timedOut || contract.__error ? { ...zero, weight: 0.25 } : contract,
    mmtCoverage: layerMmtCoverage(terms, topic),
    // S-P5: informational only (weight 0) — empty/no-op unless INTEL_RULES_CERT_LAYERS=true.
    rulesCert:   rulesCert.__timedOut || rulesCert.__error ? { ...zero, weight: 0 } : rulesCert,
  };

  // Surface upstream API errors via ops_events so they show up in the
  // operator dashboard instead of being silently swallowed by the
  // layer .catch handlers. Previously every USASpending HTTP 400 (the
  // SC-1 bug) returned awards=[], silently scoring Budget at 0 with no
  // operator visibility. Fire-and-forget — don't block the response.
  //
  // SC-6: ALSO aggregate to a top-level `apiErrors` on the response so
  // the frontend can distinguish "API failed → no data" from "API
  // succeeded → confirmed zero." Without this top-level surface the
  // UI shows "no data found" in both cases.
  const apiErrors = [];
  for (const [layerName, layer] of Object.entries(layers)) {
    if (!layer || !Array.isArray(layer._apiErrors) || layer._apiErrors.length === 0) continue;
    for (const err of layer._apiErrors) {
      apiErrors.push({
        layer: layerName,
        source: err.source,
        status: err.status || null,
        call: err.call || null,
        message: err.message,
      });
      supabase.from("ops_events").insert({
        event_type: "signal_chain_api_error",
        details: {
          layer: layerName,
          source: err.source,
          status: err.status || null,
          message: err.message,
          topic,
          agency: resolvedAgency,
          submitted_at: new Date().toISOString(),
        },
      }).then(() => {}, () => {});
    }
  }

  const composite = computeComposite(layers);
  const { verdict, captureAlert, color } = getVerdict(composite);

  // Empty-result intelligence — when composite is effectively zero
  // across all 5 layers, surface fallback suggestions so the
  // subscriber has somewhere productive to click instead of staring
  // at "0/100 QUIET". This is the 2026-04-28 Signal Chain failure
  // mode: misspelled query → all layers return 0 → user perceives
  // the tool as broken.
  const layerScores = Object.values(layers || {}).map((l) => l && typeof l.score === "number" ? l.score : 0);
  const allLayersEmpty = layerScores.every((s) => s === 0);
  const empty_state = (composite < 5 && allLayersEmpty);
  // SC-8: filter suggestions so we never offer the user's current query
  // back to them when their query returned 0 (the "VA + CCN Next Gen →
  // suggested: CCN Next Gen" failure mode).
  const suggestions = empty_state ? fallbackSuggestionsFor(resolvedAgency, topic).slice(0, 4) : [];

  const card = {
    topic,
    original_topic: originalTopic !== topic ? originalTopic : undefined,
    typo_corrections: _typoFix.changed ? _typoFix.replacements : undefined,
    agency: resolvedAgency,
    composite,
    verdict,
    captureAlert,
    verdictColor: color,
    partial: timedOut.length > 0,
    timedOut,
    generatedAt: new Date().toISOString(),
    resolved: {
      searchedTopic: resolvedTopic,
      agency: resolvedAgency,
      vehicles: matchedVehicles.map((v) => v.canonical),
      topKeywords: terms.topKeywords,
    },
    layers,
    empty_state,
    suggestions,
    empty_state_message: empty_state
      ? `No federal data signal for "${topic}" at ${resolvedAgency || "any agency"} this window. Try one of the active programs below, or broaden your terms.`
      : undefined,
    // SC-6: top-level API errors so the frontend can render an
    // operator-visible "Upstream API issue" badge separate from the
    // genuine "no data found" empty state. Omitted when empty so
    // clients can do `if (card.apiErrors)`.
    apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
  };

  // Stale-cache fallback — when the contract layer is rate-limited
  // (SAM quota exceeded) OR errored, AND we have a prior successful
  // run for this topic+agency, attach `stale_fallback` so the frontend
  // can render "Last-known-good · N days ago" with the prior run's
  // signals. Means subscribers see real data during a SAM throttle
  // window instead of an empty contract card. Cached card stays the
  // live (degraded) one so future runs don't poison freshness.
  const contractDegraded = layers.contract && (layers.contract.rateLimited || layers.contract.apiError);
  if (contractDegraded) {
    const prior = await readAnyPriorCache(supabase, topic, resolvedAgency);
    const priorContract = prior && prior.card && prior.card.layers && prior.card.layers.contract;
    if (priorContract && Array.isArray(priorContract.signals) && priorContract.signals.length > 0 && !priorContract.rateLimited && !priorContract.apiError) {
      card.stale_fallback = {
        layer: "contract",
        cachedAt: prior.cachedAt,
        signals: priorContract.signals.slice(0, 5),
        composite: prior.card.composite,
        verdict: prior.card.verdict,
      };
    }
  }

  // Write to cache (non-blocking)
  writeCache(supabase, cacheKey, card).catch(() => {});

  // Log for observability + potential future alerting
  try {
    await supabase.from("ops_events").insert({
      event_type: "signal_chain_run",
      details: {
        email,
        topic,
        agency: resolvedAgency,
        composite,
        verdict,
        captureAlert,
        partial: card.partial,
        submitted_at: new Date().toISOString(),
      },
    });
  } catch (_) {}

  // === PREMIUM_TOOLS_V2 envelope wrapping ===
  let envelope = null;
  const V2_ON = getFlag("PREMIUM_TOOLS_V2") === "on";
  if (V2_ON) {
    const toolCtx = await loadToolContext(supabase, email, { company });
    if (toolCtx.state === "BLOCKED") {
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify(renderBlockedResponse(email, toolCtx.reason)),
      };
    }
    // Collect citations from layer signals
    const allUrls = [];
    for (const layer of Object.values(layers)) {
      if (!layer || !Array.isArray(layer.signals)) continue;
      for (const sig of layer.signals) {
        if (sig.url) allUrls.push({ claim: sig.title || sig.summary || "signal", url: sig.url, observed_date: sig.date || new Date().toISOString().slice(0, 10) });
      }
    }
    const evidence = buildEvidencePanel(allUrls);
    const verdictToState = {
      "CAPTURE ALERT": "Pursue",
      "ACTIVE": "Watch",
      "BUILDING": "Watch",
      "EMERGING": "Monitor",
    };
    const dimensions = {};
    for (const [k, v] of Object.entries(layers)) {
      if (!v || typeof v.score !== "number") continue;
      dimensions[k] = { score: v.score, max: 100, detail: v.noSignalReason || (v.source || "") };
    }
    envelope = buildToolEnvelope({
      tool: "signal",
      email,
      inputs: { topic, agency: resolvedAgency },
      toolContext: toolCtx,
      resolved: card.resolved || {},
      rawFinding: {
        topic,
        state: verdictToState[verdict] || "Monitor",
        why: Object.entries(layers)
          .filter(([_, v]) => v && v.score > 0)
          .map(([k, v]) => `${k}: ${v.score} — ${(v.signals || []).slice(0, 1).map(s => s.title || "signal").join("")}`),
        blockers: card.timedOut && card.timedOut.length > 0 ? [`Layers timed out: ${card.timedOut.join(", ")}`] : [],
        what_would_flip: ["New RFI/RFP posting", "Protest decision", "Budget mark"],
      },
      dimensions,
      totalScore: composite,
      evidence,
      legacy: card,
    });
    // Do NOT mutate card with `card.envelope = envelope` — it creates a
    // circular structure (envelope.legacy === card → card.envelope === envelope)
    // that crashes JSON.stringify. Mirror pursuit-score's pattern: add the
    // envelope to a fresh response object below.
  }

  const responseBody = { ...card, cached: false };
  if (envelope) responseBody.envelope = envelope;
  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "X-Cache": "MISS" },
    body: JSON.stringify(responseBody),
  };
};
