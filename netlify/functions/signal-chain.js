// ============================================================
// signal-chain.js — 5-layer federal signal monitor
//
// GET ?email=...&topic=...&agency=...
//
// Aggregates the MMT federal-data stack into 5 weighted layers:
//
//   Research    — ClinicalTrials.gov completions + PubMed recent papers
//   Legislative — Congress.gov bills + CRS reports + hearings
//   Workforce   — USAJobs posts at DHA/VA/HHS
//   Budget      — USASpending FY obligations + GovInfo budget docs
//   Contract    — SAM.gov Opportunities + Federal Register notices
//
// Each layer returns a score (0–100) and a list of evidence items.
// A signal fires when the cross-layer composite score exceeds 60.
//
// Implements Section 3.4 of docs/MMT-Technical-Spec.md (scaled down
// to a stateless aggregator — the full spec envisions signal event
// persistence + alerting, which lives in a follow-up pass).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { enrichWithFederalData } = require("./lib/federal-data-apis");
const { enrichWithCongress } = require("./lib/congress-api");
const { enrichWithGovInfo } = require("./lib/govinfo-api");
const { enrichWithClinicalTrials } = require("./lib/clinicaltrials-api");
const { enrichWithPubMed } = require("./lib/pubmed-api");
const { enrichWithUSAJobs } = require("./lib/usajobs-api");
const { detectVehicles, expandedSearchTerms } = require("./lib/known-vehicles");

const AGENCY_CODE_MAP = { VA: "036", DHA: "097", HHS: "075", DoD: "097" };
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function researchLayer(ctgov, pubmed) {
  const completedTrials = [
    ...(ctgov?.dha?.studies || []),
    ...(ctgov?.va?.studies || []),
  ].filter((s) => (s.status || "").toUpperCase() === "COMPLETED");
  const recentPapers = (pubmed?.articles || []).length;
  const rawScore = completedTrials.length * 15 + recentPapers * 5;
  return {
    score: clamp(rawScore, 0, 100),
    evidence: {
      completed_trials: completedTrials.length,
      recent_papers: recentPapers,
    },
    items: [
      ...completedTrials.slice(0, 5).map((t) => ({
        type: "trial",
        title: t.title,
        date: t.completion_date,
        sponsor: t.lead_sponsor,
        url: t.url,
      })),
      ...((pubmed?.articles || []).slice(0, 5).map((a) => ({
        type: "paper",
        title: a.title,
        date: a.pub_date,
        sponsor: a.journal,
        url: a.url,
      }))),
    ],
  };
}

function legislativeLayer(congress) {
  if (!congress || !congress.configured) {
    return { score: 0, evidence: { configured: false }, items: [] };
  }
  const bills = congress.bills?.bills?.length || 0;
  const crs = congress.crs?.reports?.length || 0;
  const hearings = congress.hearings?.hearings?.length || 0;
  return {
    score: clamp(bills * 7 + crs * 6 + hearings * 8, 0, 100),
    evidence: { active_bills: bills, crs_reports: crs, hearings },
    items: [
      ...(congress.bills?.bills || []).slice(0, 4).map((b) => ({
        type: "bill",
        title: `${b.type} ${b.number}: ${b.title}`,
        date: b.latest_action_date,
        sponsor: "",
        url: b.url,
      })),
      ...(congress.hearings?.hearings || []).slice(0, 3).map((h) => ({
        type: "hearing",
        title: h.title,
        date: h.date,
        sponsor: h.committee,
        url: h.url,
      })),
      ...(congress.crs?.reports || []).slice(0, 3).map((r) => ({
        type: "crs",
        title: r.title,
        date: r.update_date,
        sponsor: "CRS",
        url: r.url,
      })),
    ],
  };
}

function workforceLayer(usajobs) {
  if (!usajobs || !usajobs.configured) {
    return { score: 0, evidence: { configured: false }, items: [] };
  }
  const dha = usajobs.dha?.total || 0;
  const va = usajobs.va?.total || 0;
  const hhs = usajobs.hhs?.total || 0;
  const total = dha + va + hhs;
  return {
    score: clamp(total * 2, 0, 100),
    evidence: { dha_postings: dha, va_postings: va, hhs_postings: hhs, total },
    items: [
      ...(usajobs.dha?.jobs || []).slice(0, 3).map((j) => ({
        type: "job",
        title: `${j.position_title} (${j.agency})`,
        date: j.open_date,
        sponsor: j.location,
        url: j.url,
      })),
      ...(usajobs.va?.jobs || []).slice(0, 3).map((j) => ({
        type: "job",
        title: `${j.position_title} (${j.agency})`,
        date: j.open_date,
        sponsor: j.location,
        url: j.url,
      })),
    ],
  };
}

function budgetLayer(federal, govinfo) {
  const totalObligated = (federal?.usaspending_awards?.awards || [])
    .reduce((sum, a) => sum + (a.obligated || 0), 0);
  const budgetDocs = govinfo?.budget?.packages?.length || 0;
  let score = 0;
  if (totalObligated > 500e6) score += 60;
  else if (totalObligated > 100e6) score += 45;
  else if (totalObligated > 10e6) score += 25;
  else if (totalObligated > 0) score += 10;
  score += budgetDocs * 10;
  return {
    score: clamp(score, 0, 100),
    evidence: {
      total_obligated: totalObligated,
      budget_docs: budgetDocs,
    },
    items: [
      ...(govinfo?.budget?.packages || []).slice(0, 4).map((p) => ({
        type: "budget_doc",
        title: p.title,
        date: p.date_issued,
        sponsor: "GovInfo",
        url: p.url,
      })),
    ],
  };
}

function contractLayer(federal) {
  const opps = federal?.sam_opportunities?.opportunities || [];
  const regDocs = federal?.federal_register?.documents || [];
  const oppCount = opps.length;
  const regCount = regDocs.length;
  return {
    score: clamp(oppCount * 8 + regCount * 5, 0, 100),
    evidence: {
      active_opportunities: oppCount,
      federal_register_docs: regCount,
    },
    items: [
      ...opps.slice(0, 4).map((o) => ({
        type: "opportunity",
        title: o.title,
        date: o.response_deadline || o.posted_date,
        sponsor: o.agency,
        url: o.url,
      })),
      ...regDocs.slice(0, 3).map((d) => ({
        type: "federal_register",
        title: d.title,
        date: d.publication_date,
        sponsor: d.agencies,
        url: d.url,
      })),
    ],
  };
}

function compositeScore(layers) {
  // Weighted average — contract + budget slightly over-weighted since
  // they're the closest-to-procurement signals. Adjust if live use shows
  // better predictive performance with even weights.
  const weights = { research: 0.15, legislative: 0.20, workforce: 0.15, budget: 0.25, contract: 0.25 };
  let total = 0;
  for (const [key, w] of Object.entries(weights)) {
    total += (layers[key]?.score || 0) * w;
  }
  return Math.round(total);
}

function alertBand(composite) {
  if (composite >= 75) return { band: "CAPTURE ALERT", color: "#E63946" };
  if (composite >= 60) return { band: "WATCH", color: "#F97316" };
  if (composite >= 40) return { band: "TRACK", color: "#92710A" };
  return { band: "QUIET", color: "#6B7280" };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }

  const params = event.queryStringParameters || {};
  const email = (params.email || "").toLowerCase().trim();
  const topic = (params.topic || "").trim();
  const agency = params.agency || null;

  if (!email || !topic) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email and topic required" }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid email" }) };
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
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "Signal Chain is a Premium feature." }) };
  }

  // Vehicle detection: let OASIS+, T4NG2, etc. resolve to canonical search terms
  const vehicles = detectVehicles(topic);
  const searchQuery = vehicles.length > 0 ? expandedSearchTerms(vehicles).join(" ") : topic;
  const resolvedAgency = agency || (vehicles[0]?.agency) || undefined;
  const resolvedNaics = vehicles[0]?.naics || undefined;

  const safe = (p) => p.catch((e) => ({ error: e.message }));
  const [federal, congress, govinfo, ctgov, pubmed, usajobs] = await Promise.all([
    safe(enrichWithFederalData({ topic: searchQuery, agency: resolvedAgency, naics: resolvedNaics })),
    safe(enrichWithCongress({ topic: searchQuery })),
    safe(enrichWithGovInfo({ topic: searchQuery })),
    safe(enrichWithClinicalTrials({ topic })),
    safe(enrichWithPubMed({ topic, yearsBack: 3 })),
    safe(enrichWithUSAJobs({ topic: searchQuery })),
  ]);

  const layers = {
    research:    researchLayer(ctgov, pubmed),
    legislative: legislativeLayer(congress),
    workforce:   workforceLayer(usajobs),
    budget:      budgetLayer(federal, govinfo),
    contract:    contractLayer(federal),
  };
  const composite = compositeScore(layers);
  const { band, color } = alertBand(composite);

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      topic,
      resolved: { searched: searchQuery, agency: resolvedAgency, vehicles: vehicles.map((v) => v.canonical) },
      composite_score: composite,
      alert_band: band,
      alert_color: color,
      layers,
      generated_at: new Date().toISOString(),
    }),
  };
};
