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
const { searchBills, searchHearings, searchCRSReports, searchCommitteeReports } = require("./lib/congress-api");
const { searchTrials } = require("./lib/clinicaltrials-api");
const { searchPubMed, fetchPubMedSummaries } = require("./lib/pubmed-api");
const { searchJobs } = require("./lib/usajobs-api");
const { detectVehicles, expandedSearchTerms } = require("./lib/known-vehicles");
const { buildQueryTerms, buildPubMedQuery, FR_AGENCY_SLUGS, USASPENDING_AGENCY_NAMES } = require("./lib/signal-chain-query-builder");
const { searchCorpus } = require("./lib/content-index");
const fs = require("fs");
const path = require("path");

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
  // Over-fetch then post-filter: Congress.gov's q param returns recently
  // updated bills regardless of keyword match, so we need to verify each
  // result actually references our terms.
  const [bills, hearings, reports] = await Promise.all([
    searchBills({ keyword: terms.forCongress, congress: 119, limit: 30 }).catch(() => ({ bills: [] })),
    searchHearings({ keyword: terms.forCongress, congress: 119, limit: 20 }).catch(() => ({ hearings: [] })),
    searchCommitteeReports({ keyword: terms.forCongress, congress: 119, limit: 15 }).catch(() => ({ reports: [] })),
  ]);

  const tokens = (terms.topKeywords || []).map((k) => String(k || "").toLowerCase()).filter(Boolean);
  const matchesAny = (text) => {
    if (!text || tokens.length === 0) return false;
    const lc = String(text).toLowerCase();
    return tokens.some((t) => lc.includes(t));
  };

  const billList = (bills.bills || []).filter((b) => matchesAny(b.title) || matchesAny(b.latest_action)).slice(0, 5);
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

  return { score, weight: 0.20, source: "Congress.gov + GovInfo", signals, noSignalReason: reason };
}

// ------------------------------------------------------------
// Layer 3: Workforce (USAJobs) — weight 15%
// ------------------------------------------------------------
async function layerWorkforce(terms, agency) {
  const agencyCodeMap = { DHA: "DD17", VA: "VATA", HHS: "HE00", DoD: "DD00", GSA: "GS00" };
  const org = agencyCodeMap[agency];
  const { jobs = [] } = await searchJobs({
    keyword: terms.forUSAJobs,
    agency: org,
    limit: 10,
  }).catch(() => ({ jobs: [] }));

  const keywordsLower = terms.topKeywords.map((k) => k.toLowerCase());
  const relevant = jobs.filter((p) => {
    const title = (p.position_title || "").toLowerCase();
    return keywordsLower.some((k) => title.includes(k));
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

  const reason = signals.length === 0
    ? `No active federal job postings matching these keywords at ${agency || "any agency"}. Hiring leads contracts by 6–18 months — check back.`
    : null;

  return { score, weight: 0.15, source: "USAJobs", signals, noSignalReason: reason };
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
    }).catch(() => ({ awards: [], total: 0 })),
    searchGAOReports({ keyword: terms.forUSASpending, limit: 3 }).catch(() => ({ reports: [] })),
  ]);

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

  return { score, weight: 0.25, source: "USASpending + GAO", signals, noSignalReason: reason };
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
    // Use SAM.gov Opportunities as the PRIMARY source for contract signals.
    searchSAMOpportunities({
      keyword: terms.forSAM,
      limit: 10,
    }).catch(() => ({ opportunities: [], total: 0 })),
    // Federal Register supplemental, ALWAYS with keyword filter now.
    searchFederalRegister({
      keyword: terms.forFedRegister,
      agencies: FR_AGENCY_SLUGS[agency] ? [FR_AGENCY_SLUGS[agency]] : undefined,
      type: ["NOTICE", "RULE"],
      limit: 3,
    }).catch(() => ({ documents: [], total: 0 })),
  ]);

  const opps = samOpps.opportunities || [];
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

  const reason = signals.length === 0
    ? `No active SAM.gov solicitations matching these keywords at ${agency || "any agency"}. Zero Federal Register notices in the window.`
    : (opps.length === 0 && docs.length > 0
        ? `No active SAM.gov solicitations found. ${docs.length} Federal Register notice${docs.length === 1 ? "" : "s"} — showing most relevant.`
        : null);

  return { score, weight: 0.25, source: "SAM.gov + Federal Register", signals, noSignalReason: reason };
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
function cacheKeyFor(topic, agency) {
  const now = new Date();
  const week = Math.floor((now - new Date(now.getUTCFullYear(), 0, 1)) / (7 * DAY_MS));
  const normalized = `${(topic || "").toLowerCase().trim()}|${agency || ""}|W${now.getUTCFullYear()}-${week}`;
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
  let email, topic, agency;
  if (event.httpMethod === "GET") {
    const qs = event.queryStringParameters || {};
    email = (qs.email || "").toLowerCase().trim();
    topic = (qs.topic || "").trim();
    agency = qs.agency || null;
  } else {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }
    email = (body.email || "").toLowerCase().trim();
    topic = (body.topic || "").trim();
    agency = body.agency || null;
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: user } = await supabase
    .from("mp_users")
    .select("tier, subscription_tier, subscription_status")
    .eq("email", email)
    .single();

  const isPremium = user && (
    (user.subscription_tier === "premium" && user.subscription_status === "active") ||
    (user.subscription_tier === "institutional" && user.subscription_status === "active") ||
    user.tier === "admin" ||
    user.tier === "paid"
  );

  if (!isPremium) {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "Signal Chain is a Premium feature. Subscribe at missionmeetstech.com/pricing" }) };
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
  const [research, legislative, workforce, budget, contract] = await Promise.all([
    race(6000, () => layerResearch(terms, resolvedAgency)),
    race(6000, () => layerLegislative(terms)),
    race(6000, () => layerWorkforce(terms, resolvedAgency)),
    race(6000, () => layerBudget(terms, resolvedAgency)),
    race(6000, () => layerContract(terms, resolvedAgency)),
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
  };

  const composite = computeComposite(layers);
  const { verdict, captureAlert, color } = getVerdict(composite);

  const card = {
    topic,
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
  };

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

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "X-Cache": "MISS" },
    body: JSON.stringify({ ...card, cached: false }),
  };
};
