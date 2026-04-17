// ============================================================
// pursuit-score-engine.js — Pursuit Score Engine v2
//
// Refined per /Users/marywomack/Downloads/pursuit-score-refinement-spec.md
// (2026-04-17). Each dimension is scored from sub-components with
// formatted evidence strings. A deterministic narrative generator
// composes a 2-sentence analyst take from the dimension scores.
//
// Dimensions (0–25 each):
//   Incumbent Vulnerability = HHI concentration (0–10) + expiring-contract
//     volume (0–10) + sole-source posture (0–5)
//   Budget Momentum = YoY obligation trend (0–10) + FY volume (0–8) +
//     IT Dashboard match (0–7 with CIO rating bonus)
//   Legislative Tailwind = active bills (0–12) + recent hearings (0–8) +
//     GAO + Federal Register (0–5)
//   Research Pipeline = PubMed volume (0–10) + ClinicalTrials.gov
//     volume (0–10) + recent completed federal trial bonus (0–5)
// ============================================================

const { enrichWithFederalData, searchUSASpending, getSpendingByCategory } = require("./federal-data-apis");
const { enrichWithCongress } = require("./congress-api");
const { enrichWithGovInfo } = require("./govinfo-api");
const { enrichWithClinicalTrials } = require("./clinicaltrials-api");
const { enrichWithPubMed } = require("./pubmed-api");
const { enrichWithITDashboard } = require("./it-dashboard-api");
const { detectVehicles, expandedSearchTerms } = require("./known-vehicles");

const AGENCY_CODE_MAP = { VA: "036", DHA: "097", HHS: "075", DoD: "097", GSA: "047" };

function formatDollarsShort(n) {
  if (!n) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

// ------------------------------------------------------------
// Dimension 1: Incumbent Vulnerability (0–25)
// ------------------------------------------------------------
function scoreIncumbentVulnerability(federalResult, agency) {
  if (!federalResult || federalResult.error) {
    return {
      score: 0,
      label: "Incumbent Vulnerability",
      evidence: ["No award data returned from USASpending for this query — score is 0 by default."],
    };
  }
  const awards = federalResult.usaspending_awards?.awards || [];
  if (awards.length === 0) {
    return {
      score: 0,
      label: "Incumbent Vulnerability",
      evidence: [`No matching awards found at ${agency || "any agency"} in this NAICS. Consider broadening the search or confirming program NAICS.`],
    };
  }

  // HHI concentration: sum of (each vendor's $ share)^2
  const byVendor = {};
  let totalObligated = 0;
  for (const a of awards) {
    const v = a.recipient || "Unknown";
    byVendor[v] = (byVendor[v] || 0) + (a.obligated || 0);
    totalObligated += a.obligated || 0;
  }
  const shares = totalObligated > 0
    ? Object.values(byVendor).map((v) => v / totalObligated)
    : [];
  const hhi = shares.reduce((s, x) => s + x * x, 0);
  const sortedVendors = Object.entries(byVendor).sort((a, b) => b[1] - a[1]);
  const topVendor = sortedVendors[0] || [null, 0];
  const topShare = totalObligated > 0 ? (topVendor[1] / totalObligated) : 0;
  const vendorCount = sortedVendors.length;

  // Expiring contracts (within 18 months)
  const horizon = new Date();
  horizon.setMonth(horizon.getMonth() + 18);
  const now = new Date();
  const expiring = awards.filter((a) => {
    if (!a.end_date) return false;
    const end = new Date(a.end_date);
    return !isNaN(end) && end > now && end < horizon;
  });
  const expiringCount = expiring.length;
  const expiringValue = expiring.reduce((s, a) => s + (a.obligated || 0), 0);
  // Sole-source proxy: set_aside value of "SOLE SOURCE" or missing set_aside on a large single-vendor award
  const soleSourceCount = expiring.filter((a) => {
    const sa = (a.set_aside || "").toUpperCase();
    return sa.includes("SOLE SOURCE") || sa.includes("NOT COMPETED");
  }).length;

  let score = 0;
  // Concentration sub-score (0–10): less concentration = higher score
  if (hhi < 0.15) score += 10;
  else if (hhi < 0.30) score += 7;
  else if (hhi < 0.50) score += 4;
  else score += 1;
  // Expiring sub-score (0–10)
  if (expiringValue > 500_000_000) score += 10;
  else if (expiringValue > 100_000_000) score += 8;
  else if (expiringValue > 50_000_000) score += 6;
  else if (expiringValue > 10_000_000) score += 4;
  else if (expiringCount > 0) score += 2;
  // Sole-source posture (0–5): none = standard recompete = best
  if (soleSourceCount === 0) score += 5;
  else if (soleSourceCount <= 2) score += 3;
  else score += 1;
  score = Math.min(score, 25);

  const evidence = [
    topVendor[0]
      ? `Top vendor "${topVendor[0]}" holds ${(topShare * 100).toFixed(0)}% of obligated dollars in this market at ${agency || "covered agencies"} (HHI: ${hhi.toFixed(2)})`
      : "No single-vendor concentration detectable in the result set.",
    expiringCount > 0
      ? `${expiringCount} contract${expiringCount === 1 ? "" : "s"} (${formatDollarsShort(expiringValue)}) expire within 18 months`
      : "No contracts in this result set expire within 18 months",
    soleSourceCount > 0
      ? `${soleSourceCount} expiring contract${soleSourceCount === 1 ? " was" : "s were"} sole-source awarded — recompete path uncertain`
      : `All expiring contracts were competed — standard recompete process expected`,
    `${vendorCount} unique vendor${vendorCount === 1 ? "" : "s"} awarded in this market at ${agency || "covered agencies"} — ${vendorCount < 5 ? "tight" : "competitive"} supplier base`,
  ].filter(Boolean);

  return {
    score,
    label: "Incumbent Vulnerability",
    evidence: evidence.slice(0, 3),
    metrics: { hhi, topShare, vendorCount, expiringCount, expiringValue, soleSourceCount },
  };
}

// ------------------------------------------------------------
// Dimension 2: Budget Momentum (0–25)
// ------------------------------------------------------------
async function scoreBudgetMomentum({ topic, agency, naics, federalResult, govinfoResult, itDashboardResult }) {
  // YoY trend: pull current FY vs prior FY obligations for this NAICS/agency.
  // Uses searchUSASpending directly so we don't fanout through the full enrich helper.
  const now = new Date();
  const fy = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  const safe = (p) => p.catch(() => ({ awards: [] }));
  const [currentFY, priorFY] = await Promise.all([
    safe(searchUSASpending({
      keyword: topic,
      agency,
      naics,
      startDate: `${fy - 1}-10-01`,
      endDate: `${fy}-09-30`,
      limit: 100,
    })),
    safe(searchUSASpending({
      keyword: topic,
      agency,
      naics,
      startDate: `${fy - 2}-10-01`,
      endDate: `${fy - 1}-09-30`,
      limit: 100,
    })),
  ]);

  const sumObligated = (r) => (r.awards || []).reduce((s, a) => s + (a.obligated || 0), 0);
  const currentTotal = sumObligated(currentFY);
  const priorTotal = sumObligated(priorFY);
  const yoyChange = priorTotal > 0 ? (currentTotal - priorTotal) / priorTotal : (currentTotal > 0 ? 1 : 0);

  // IT Dashboard match — look for programs whose name/description matches query keywords
  const investments = itDashboardResult?.investments || [];
  const keywords = (topic || "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const matchedInvestment = investments.find((inv) => {
    const hay = `${inv.name || ""} ${inv.agency || ""}`.toLowerCase();
    return keywords.some((k) => hay.includes(k));
  });
  const itDashboardMatch = !!matchedInvestment;
  const cioRating = matchedInvestment?.cio_rating ? String(matchedInvestment.cio_rating).toLowerCase() : null;

  let score = 0;
  // YoY sub-score (0–10)
  if (yoyChange > 0.20) score += 10;
  else if (yoyChange > 0.10) score += 8;
  else if (yoyChange > 0) score += 6;
  else if (yoyChange > -0.05) score += 4;
  else if (yoyChange > -0.15) score += 2;
  // Volume sub-score (0–8)
  if (currentTotal > 500_000_000) score += 8;
  else if (currentTotal > 100_000_000) score += 6;
  else if (currentTotal > 50_000_000) score += 4;
  else if (currentTotal > 10_000_000) score += 2;
  // IT Dashboard bonus (0–7)
  if (itDashboardMatch) {
    score += 4;
    if (cioRating && /green/.test(cioRating)) score += 3;
    else if (cioRating && /yellow/.test(cioRating)) score += 1;
  }
  // GovInfo budget doc boost (0–3) — small bonus if budget justification docs exist
  const budgetDocs = govinfoResult?.budget?.packages?.length || 0;
  if (budgetDocs > 0) score = Math.min(score + 3, 25);
  score = Math.min(score, 25);

  const yoyPct = (yoyChange * 100).toFixed(0);
  const yoySign = yoyChange >= 0 ? "+" : "";
  const evidence = [
    currentTotal > 0
      ? `${formatDollarsShort(currentTotal)} obligated in FY${fy} at ${agency || "covered agencies"} — ${yoySign}${yoyPct}% vs FY${fy - 1}`
      : `No obligations matched at ${agency || "covered agencies"} for FY${fy}`,
    itDashboardMatch
      ? `Listed as IT Dashboard investment: "${matchedInvestment.name}"${cioRating ? ` (CIO rating: ${cioRating})` : ""}`
      : `Not declared as a matched IT Dashboard investment`,
    budgetDocs > 0
      ? `${budgetDocs} GovInfo budget justification document${budgetDocs === 1 ? "" : "s"} cite this area`
      : null,
  ].filter(Boolean);

  return {
    score,
    label: "Budget Momentum",
    evidence: evidence.slice(0, 3),
    metrics: { currentTotal, priorTotal, yoyChange, itDashboardMatch, cioRating, budgetDocs },
  };
}

// ------------------------------------------------------------
// Dimension 3: Legislative Tailwind (0–25)
// ------------------------------------------------------------
function scoreLegislativeTailwind(congressResult, federalResult) {
  if (!congressResult || !congressResult.configured) {
    return {
      score: 0,
      label: "Legislative Tailwind",
      evidence: ["Congress.gov API key not configured — dimension unavailable. Set CONGRESS_API_KEY."],
      metrics: { configured: false },
    };
  }
  const bills = congressResult.bills?.bills || [];
  const hearings = congressResult.hearings?.hearings || [];
  const crs = congressResult.crs?.reports || [];
  const frDocs = federalResult?.federal_register?.documents || [];
  const gaoReports = federalResult?.gao_reports?.reports || [];

  // Recent hearings (within 90 days)
  const now = Date.now();
  const recentHearings = hearings.filter((h) => {
    if (!h.date) return false;
    const hd = new Date(h.date).getTime();
    return !isNaN(hd) && (now - hd) / (86400000) < 90;
  });

  let score = 0;
  // Bills sub-score (0–12): 3 pts each
  score += Math.min(bills.length * 3, 12);
  // Recent hearings sub-score (0–8): 4 pts per recent hearing
  score += Math.min(recentHearings.length * 4, 8);
  // GAO + FR sub-score (0–5)
  if (gaoReports.length > 0) score += 3;
  if (frDocs.length > 0) score += 2;
  // CRS reports as a partial signal (0–3 separate)
  if (crs.length > 0) score = Math.min(score + 2, 25);
  score = Math.min(score, 25);

  const evidence = [
    bills.length > 0
      ? `${bills.length} active bill${bills.length > 1 ? "s" : ""} in 119th Congress reference this area (most recent: "${(bills[0].title || "").slice(0, 60)}${(bills[0].title || "").length > 60 ? "..." : ""}")`
      : `No active bills found in 119th Congress for these keywords`,
    recentHearings.length > 0
      ? `${recentHearings.length} committee hearing${recentHearings.length > 1 ? "s" : ""} in past 90 days reference this topic`
      : hearings.length > 0
        ? `${hearings.length} committee hearing${hearings.length > 1 ? "s" : ""} in the current Congress (none within 90 days)`
        : `No recent committee hearings found`,
    gaoReports.length > 0
      ? `${gaoReports.length} GAO report${gaoReports.length > 1 ? "s" : ""} published (most recent: "${(gaoReports[0].title || "").slice(0, 50)}${(gaoReports[0].title || "").length > 50 ? "..." : ""}")`
      : frDocs.length > 0
        ? `${frDocs.length} Federal Register document${frDocs.length > 1 ? "s" : ""} match this area`
        : `No recent GAO reports or Federal Register documents matching these keywords`,
  ].filter(Boolean);

  return {
    score,
    label: "Legislative Tailwind",
    evidence: evidence.slice(0, 3),
    metrics: { billCount: bills.length, recentHearingCount: recentHearings.length, hearingCount: hearings.length, gaoCount: gaoReports.length, frCount: frDocs.length, crsCount: crs.length },
  };
}

// ------------------------------------------------------------
// Dimension 4: Research Pipeline (0–25)
// ------------------------------------------------------------
function scoreResearchPipeline(ctgovResult, pubmedResult) {
  const pubmedCount = pubmedResult?.articles?.length || 0;
  const allStudies = [
    ...(ctgovResult?.dha?.studies || []),
    ...(ctgovResult?.va?.studies || []),
    ...(ctgovResult?.general?.studies || []),
  ];
  const trialsTotal = allStudies.length;
  const fedStudies = [
    ...(ctgovResult?.dha?.studies || []),
    ...(ctgovResult?.va?.studies || []),
  ];
  const completedFedTrials = fedStudies.filter((s) => (s.status || "").toUpperCase() === "COMPLETED");
  const now = Date.now();
  const hasRecentCompleted = completedFedTrials.some((s) => {
    if (!s.completion_date) return false;
    const cd = new Date(s.completion_date).getTime();
    return !isNaN(cd) && (now - cd) / 86400000 < 730; // within 24 months
  });

  let score = 0;
  // PubMed volume (0–10)
  if (pubmedCount > 50) score += 10;
  else if (pubmedCount > 20) score += 8;
  else if (pubmedCount > 10) score += 6;
  else if (pubmedCount > 5) score += 4;
  else if (pubmedCount > 0) score += 2;
  // Trials volume (0–10)
  if (trialsTotal > 20) score += 10;
  else if (trialsTotal > 10) score += 7;
  else if (trialsTotal > 5) score += 5;
  else if (trialsTotal > 0) score += 3;
  // Recent federal completion bonus (0–5)
  if (hasRecentCompleted && completedFedTrials.length > 0) score += 5;
  else if (completedFedTrials.length > 0) score += 2;
  score = Math.min(score, 25);

  const evidence = [
    pubmedCount > 0
      ? `${pubmedCount} PubMed article${pubmedCount === 1 ? "" : "s"} indexed in past 24 months with federal health context`
      : `No PubMed literature found matching this program with federal health context`,
    trialsTotal > 0
      ? `${trialsTotal} registered clinical trials${completedFedTrials.length > 0 ? ` — ${completedFedTrials.length} federally-sponsored and completed` : ""}`
      : `No registered clinical trials found for this query`,
    hasRecentCompleted
      ? `Recent completed federal trial found — results likely feed next-phase procurement`
      : pubmedCount === 0 && trialsTotal === 0
        ? `Research pipeline scoring applies primarily to clinical/health IT programs — low score is expected for pure IT or logistics topics.`
        : null,
  ].filter(Boolean);

  return {
    score,
    label: "Research Pipeline",
    evidence: evidence.slice(0, 3),
    metrics: { pubmedCount, trialsTotal, completedFedTrials: completedFedTrials.length, hasRecentCompleted },
  };
}

// ------------------------------------------------------------
// Verdict + narrative
// ------------------------------------------------------------
function verdictFor(total) {
  if (total >= 75) return { verdict: "GO", color: "#15803D" };
  if (total >= 55) return { verdict: "LEAN GO", color: "#457B9D" };
  if (total >= 40) return { verdict: "DEVELOP", color: "#92710A" };
  if (total >= 25) return { verdict: "LEAN NO-BID", color: "#F97316" };
  return { verdict: "NO-BID", color: "#E63946" };
}

function generateNarrative({ dimensions, query, agency, verdict }) {
  const sorted = [
    { name: "budget trajectory", score: dimensions.budgetMomentum.score },
    { name: "legislative support", score: dimensions.legislativeTailwind.score },
    { name: "research pipeline activity", score: dimensions.researchPipeline.score },
    { name: "incumbent recompete opportunity", score: dimensions.incumbentVulnerability.score },
  ].sort((a, b) => b.score - a.score);
  const strongest = sorted[0].name;
  const second = sorted[1].name;
  const weakest = sorted[sorted.length - 1].name;
  const agencyLabel = agency || "covered agencies";

  const verdictFrames = {
    "GO":          `"${query}" at ${agencyLabel} presents a strong opportunity across all four dimensions.`,
    "LEAN GO":     `"${query}" at ${agencyLabel} shows meaningful signal, particularly in ${strongest} and ${second}.`,
    "DEVELOP":     `"${query}" at ${agencyLabel} warrants further development. ${strongest} is positive but ${weakest} needs work.`,
    "LEAN NO-BID": `"${query}" at ${agencyLabel} presents limited signal at this time. ${weakest} is a concern.`,
    "NO-BID":      `"${query}" at ${agencyLabel} does not present sufficient signal for pursuit at this stage.`,
  };
  const actionRecs = {
    "GO":          "Recommend full capture resource commitment.",
    "LEAN GO":     "Recommend qualifying the specific vehicle and confirming teaming strategy before committing B&P.",
    "DEVELOP":     "Recommend 60-day intelligence development: identify the program manager and confirm budget line item.",
    "LEAN NO-BID": "Monitor for 90 days. Score again if a solicitation or pre-solicitation notice drops.",
    "NO-BID":      "Resources better directed to higher-scoring opportunities at this time.",
  };
  return `${verdictFrames[verdict] || verdictFrames["DEVELOP"]} ${actionRecs[verdict] || actionRecs["DEVELOP"]}`;
}

// ------------------------------------------------------------
// Main entry
// ------------------------------------------------------------
async function scorePursuit({ keyword, agency, naics }) {
  if (!keyword || keyword.trim().length < 2) {
    return { error: "QUERY_TOO_SHORT", message: "Please enter at least 2 keywords." };
  }
  if (keyword.trim().split(/\s+/).length < 2 && keyword.length < 5) {
    // Edge case: single short word. Still proceed but flag it.
  }

  const matchedVehicles = detectVehicles(keyword);
  const searchQuery = matchedVehicles.length > 0
    ? expandedSearchTerms(matchedVehicles).join(" ")
    : keyword;
  const resolvedAgency = agency || (matchedVehicles[0] && matchedVehicles[0].agency) || undefined;
  const resolvedNaics = naics || (matchedVehicles[0] && matchedVehicles[0].naics) || undefined;
  const agencyCode = resolvedAgency ? AGENCY_CODE_MAP[resolvedAgency] : undefined;

  // Race each dimension's upstream enrichment against a 6s timeout so
  // one slow source can't starve the rest.
  const timeout = (ms, label) => new Promise((resolve) =>
    setTimeout(() => resolve({ __timedOut: label }), ms));
  const race = (label, promise) => Promise.race([
    promise.catch((e) => ({ error: e.message })),
    timeout(6000, label),
  ]);

  const [federalResult, congressResult, govinfoResult, ctgovResult, pubmedResult, itDashboardResult] = await Promise.all([
    race("federal", enrichWithFederalData({ topic: searchQuery, agency: resolvedAgency, naics: resolvedNaics })),
    race("congress", enrichWithCongress({ topic: searchQuery })),
    race("govinfo", enrichWithGovInfo({ topic: searchQuery })),
    race("ctgov", enrichWithClinicalTrials({ topic: keyword })),
    race("pubmed", enrichWithPubMed({ topic: keyword, yearsBack: 2 })),
    race("itdashboard", enrichWithITDashboard({ topic: searchQuery, agencyCode })),
  ]);

  const timedOut = [federalResult, congressResult, govinfoResult, ctgovResult, pubmedResult, itDashboardResult]
    .filter((r) => r && r.__timedOut)
    .map((r) => r.__timedOut);
  const partial = timedOut.length > 0;

  const incumbentVulnerability = scoreIncumbentVulnerability(
    federalResult && !federalResult.__timedOut ? federalResult : null,
    resolvedAgency,
  );
  const budgetMomentum = await scoreBudgetMomentum({
    topic: keyword,
    agency: resolvedAgency,
    naics: resolvedNaics,
    federalResult: federalResult && !federalResult.__timedOut ? federalResult : null,
    govinfoResult: govinfoResult && !govinfoResult.__timedOut ? govinfoResult : null,
    itDashboardResult: itDashboardResult && !itDashboardResult.__timedOut ? itDashboardResult : null,
  });
  const legislativeTailwind = scoreLegislativeTailwind(
    congressResult && !congressResult.__timedOut ? congressResult : null,
    federalResult && !federalResult.__timedOut ? federalResult : null,
  );
  const researchPipeline = scoreResearchPipeline(
    ctgovResult && !ctgovResult.__timedOut ? ctgovResult : null,
    pubmedResult && !pubmedResult.__timedOut ? pubmedResult : null,
  );

  const dimensions = {
    incumbentVulnerability,
    budgetMomentum,
    legislativeTailwind,
    researchPipeline,
  };
  const totalScore = incumbentVulnerability.score + budgetMomentum.score + legislativeTailwind.score + researchPipeline.score;
  const { verdict, color } = verdictFor(totalScore);

  const topAwardees = federalResult && federalResult.usaspending_awards
    ? (federalResult.usaspending_awards.awards || []).slice(0, 5).map((a) => ({
        recipient: a.recipient,
        obligated: a.obligated,
        end_date: a.end_date,
      }))
    : [];

  const narrative = generateNarrative({ dimensions, query: keyword, agency: resolvedAgency, verdict });

  return {
    query: keyword,
    agency: resolvedAgency || null,
    naics: resolvedNaics || null,
    resolved: {
      searched: searchQuery,
      vehicles: matchedVehicles.map((v) => v.canonical),
      agency: resolvedAgency,
      naics: resolvedNaics,
    },
    totalScore,
    verdict,
    verdictColor: color,
    partial,
    timedOut,
    scoredAt: new Date().toISOString(),
    dataThrough: new Date().toISOString().slice(0, 7), // YYYY-MM
    dimensions,
    narrative,
    evidence: {
      top_awardees: topAwardees,
      usaspending_total: federalResult?.usaspending_awards?.total || 0,
      active_opportunities: federalResult?.sam_opportunities?.total || 0,
    },
    // Legacy 'total' + 'dimensions.*' snake-case mapping for existing UI
    // that rendered the first version of this engine
    total: totalScore,
    color,
  };
}

module.exports = {
  scorePursuit,
  scoreIncumbentVulnerability,
  scoreBudgetMomentum,
  scoreLegislativeTailwind,
  scoreResearchPipeline,
  verdictFor,
  generateNarrative,
  formatDollarsShort,
};
