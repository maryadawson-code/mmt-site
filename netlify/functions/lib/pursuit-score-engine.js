// ============================================================
// pursuit-score-engine.js — Pursuit Score Engine
//
// Implements Section 3.3 of docs/MMT-Technical-Spec.md.
// Produces a 0–100 bid/no-bid score for a pursuit across four
// weighted dimensions:
//
//   Incumbent vulnerability (25) — is there a clear recompete opening?
//   Budget momentum (25)         — is real money moving toward this?
//   Legislative tailwind (25)    — does Congress want this to happen?
//   Pipeline research signal (25)— is the evidence base landing?
//
// Each dimension is scored from the existing federal-data API stack
// so the engine composes pure functions over what we already have.
// ============================================================

const { enrichWithFederalData } = require("./federal-data-apis");
const { enrichWithCongress } = require("./congress-api");
const { enrichWithGovInfo } = require("./govinfo-api");
const { enrichWithClinicalTrials } = require("./clinicaltrials-api");
const { enrichWithPubMed } = require("./pubmed-api");
const { enrichWithITDashboard } = require("./it-dashboard-api");
const { detectVehicles, expandedSearchTerms } = require("./known-vehicles");

const AGENCY_CODE_MAP = { VA: "036", DHA: "097", HHS: "075", DoD: "097", GSA: "047" };

/**
 * Score incumbent vulnerability (0–25).
 *   - Concentrated awardee field (1 dominant vendor) → higher vulnerability IF the
 *     contract is within 12 months of expiration, OR no expiring action is recorded
 *   - Fragmented field (4+ primes) → lower vulnerability, established ecosystem
 *   - No awards found → lowest score (we can't make a call)
 */
function scoreIncumbent(federalResult) {
  if (!federalResult || federalResult.error) return 5;
  const awards = federalResult.usaspending_awards?.awards || [];
  if (awards.length === 0) return 5;
  // Count distinct recipients among top 10 awards
  const recipients = new Set(awards.slice(0, 10).map((a) => a.recipient).filter(Boolean));
  const concentration = recipients.size;
  // Expiring contracts — pull from end_date within next 12 months
  const soon = awards.filter((a) => {
    if (!a.end_date) return false;
    const end = new Date(a.end_date);
    const horizon = new Date();
    horizon.setFullYear(horizon.getFullYear() + 1);
    return end > new Date() && end < horizon;
  }).length;

  let score = 0;
  if (concentration <= 2) score += 15;         // dominant-vendor situation = opening
  else if (concentration <= 4) score += 9;
  else score += 4;                              // fragmented field = harder to dislodge
  score += Math.min(soon * 2, 10);              // recompete window boost
  return Math.min(score, 25);
}

/**
 * Score budget momentum (0–25).
 *   - USASpending shows growing obligations → momentum
 *   - GovInfo returns recent budget justification docs → formal sponsorship
 *   - IT Dashboard investment tied to this keyword → structural program
 */
function scoreBudget(federalResult, govinfoResult, itDashboardResult) {
  let score = 0;
  const totalObligated = (federalResult?.usaspending_awards?.awards || [])
    .reduce((sum, a) => sum + (a.obligated || 0), 0);
  if (totalObligated > 500e6) score += 12;
  else if (totalObligated > 100e6) score += 9;
  else if (totalObligated > 10e6) score += 5;
  else if (totalObligated > 0) score += 2;

  const budgetDocs = govinfoResult?.budget?.packages?.length || 0;
  if (budgetDocs > 0) score += Math.min(budgetDocs * 2, 6);

  const itPrograms = itDashboardResult?.investments?.length || 0;
  if (itPrograms > 0) score += Math.min(itPrograms * 2, 7);

  return Math.min(score, 25);
}

/**
 * Score legislative tailwind (0–25).
 *   - Active bills mentioning the keyword
 *   - CRS reports (signal of congressional staff interest)
 *   - Recent committee hearings
 */
function scoreLegislative(congressResult) {
  if (!congressResult || !congressResult.configured) return 5;
  let score = 0;
  score += Math.min((congressResult.bills?.bills?.length || 0) * 2, 10);
  score += Math.min((congressResult.hearings?.hearings?.length || 0) * 2, 8);
  score += Math.min((congressResult.crs?.reports?.length || 0) * 2, 7);
  return Math.min(score, 25);
}

/**
 * Score pipeline research signal (0–25).
 *   - Completed clinical trials with federal sponsors → procurement within 12–24 months
 *   - Recent PubMed articles → evidence base active
 */
function scoreResearchPipeline(ctgovResult, pubmedResult) {
  let score = 0;
  const completedTrials = [
    ...(ctgovResult?.dha?.studies || []),
    ...(ctgovResult?.va?.studies || []),
  ].filter((s) => (s.status || "").toUpperCase() === "COMPLETED").length;
  score += Math.min(completedTrials * 3, 15);
  const recentArticles = (pubmedResult?.articles || []).length;
  score += Math.min(recentArticles, 10);
  return Math.min(score, 25);
}

/**
 * Bid/no-bid verdict from total score.
 */
function verdictFor(total) {
  if (total >= 75) return { verdict: "GO", color: "#15803D" };
  if (total >= 55) return { verdict: "LEAN GO", color: "#84cc16" };
  if (total >= 40) return { verdict: "DEVELOP", color: "#92710A" };
  if (total >= 25) return { verdict: "LEAN NO-BID", color: "#F97316" };
  return { verdict: "NO-BID", color: "#E63946" };
}

/**
 * MAIN ENTRY POINT — produce a full pursuit score card for a keyword.
 * @param {Object} params
 * @param {string} params.keyword - free-text description of the pursuit
 * @param {string} [params.agency] - short code (VA, DHA, HHS, DoD, GSA)
 * @param {string[]} [params.naics] - NAICS codes to filter
 */
async function scorePursuit({ keyword, agency, naics }) {
  if (!keyword) return { error: "keyword required" };

  // Use known-vehicles to expand the search query for known IDIQs.
  const matchedVehicles = detectVehicles(keyword);
  const searchQuery = matchedVehicles.length > 0
    ? expandedSearchTerms(matchedVehicles).join(" ")
    : keyword;
  const resolvedAgency = agency || (matchedVehicles[0] && matchedVehicles[0].agency) || undefined;
  const resolvedNaics = naics || (matchedVehicles[0] && matchedVehicles[0].naics) || undefined;
  const agencyCode = resolvedAgency ? AGENCY_CODE_MAP[resolvedAgency] : undefined;

  const safe = (p) => p.catch((e) => ({ error: e.message }));
  const [federalResult, congressResult, govinfoResult, ctgovResult, pubmedResult, itDashboardResult] = await Promise.all([
    safe(enrichWithFederalData({ topic: searchQuery, agency: resolvedAgency, naics: resolvedNaics })),
    safe(enrichWithCongress({ topic: searchQuery })),
    safe(enrichWithGovInfo({ topic: searchQuery })),
    safe(enrichWithClinicalTrials({ topic: keyword })),
    safe(enrichWithPubMed({ topic: keyword, yearsBack: 3 })),
    safe(enrichWithITDashboard({ topic: searchQuery, agencyCode })),
  ]);

  const incumbent = scoreIncumbent(federalResult);
  const budget = scoreBudget(federalResult, govinfoResult, itDashboardResult);
  const legislative = scoreLegislative(congressResult);
  const research = scoreResearchPipeline(ctgovResult, pubmedResult);
  const total = incumbent + budget + legislative + research;
  const { verdict, color } = verdictFor(total);

  const topAwardees = (federalResult?.usaspending_awards?.awards || [])
    .slice(0, 5)
    .map((a) => ({ recipient: a.recipient, obligated: a.obligated, end_date: a.end_date }));

  return {
    keyword,
    resolved: {
      searched: searchQuery,
      agency: resolvedAgency,
      naics: resolvedNaics,
      vehicles: matchedVehicles.map((v) => v.canonical),
    },
    total,
    verdict,
    color,
    dimensions: {
      incumbent_vulnerability: { score: incumbent, max: 25 },
      budget_momentum: { score: budget, max: 25 },
      legislative_tailwind: { score: legislative, max: 25 },
      research_pipeline: { score: research, max: 25 },
    },
    evidence: {
      top_awardees: topAwardees,
      usaspending_total: federalResult?.usaspending_awards?.total || 0,
      active_opportunities: federalResult?.sam_opportunities?.total || 0,
      active_bills: congressResult?.bills?.bills?.length || 0,
      crs_reports: congressResult?.crs?.reports?.length || 0,
      hearings: congressResult?.hearings?.hearings?.length || 0,
      completed_trials: [
        ...(ctgovResult?.dha?.studies || []),
        ...(ctgovResult?.va?.studies || []),
      ].filter((s) => (s.status || "").toUpperCase() === "COMPLETED").length,
      pubmed_articles: pubmedResult?.articles?.length || 0,
      it_dashboard_programs: itDashboardResult?.investments?.length || 0,
    },
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  scorePursuit,
  scoreIncumbent,
  scoreBudget,
  scoreLegislative,
  scoreResearchPipeline,
  verdictFor,
};
