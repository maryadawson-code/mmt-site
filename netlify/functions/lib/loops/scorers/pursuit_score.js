// ============================================================
// scorers/pursuit_score.js (L1 step "score")
//
// QUOTA-SAFE heuristic scorer. Deliberately does NOT call the premium
// scorePursuit() engine per opportunity: that engine hits SAM.gov on
// every call, and SAM has a SMALL SHARED DAILY quota (CLAUDE.md hard
// rule). Scoring ~15-20 opportunities/day through it would exhaust the
// pool and break the on-demand tools. Instead we score from data we
// ALREADY have in-context — SAM metadata + the USASpending incumbents the
// enricher fetched (USASpending is unauthenticated/unquota'd) — so this
// step costs $0, makes zero extra network calls, and is fully
// deterministic/testable.
//
// The output is a triage signal to help Mary prioritize review of the
// staged loop_opportunities, NOT a published bid/no-bid verdict.
// ============================================================

const HEALTH_IT_NAICS = new Set(["541511", "541512", "541513", "541519", "518210", "621111", "621999"]);
const HIGH_VALUE_TERMS = [
  "ehr", "electronic health record", "genesis", "oasis", "sewp", "cio-sp",
  "t4ng", "vista", "interoperab", "telehealth", "ambient", "ai ", "artificial intelligence",
];

function scoreOne(item) {
  const factors = {};
  let score = 40;

  // Response window — near-term open solicitations are the live ones.
  const deadline = item.response_deadline ? new Date(item.response_deadline).getTime() : null;
  if (deadline) {
    const days = (deadline - Date.now()) / 86_400_000;
    if (days < 0) { score -= 20; factors.window = "closed"; }
    else if (days <= 45) { score += 15; factors.window = "near_term"; }
    else { score += 5; factors.window = "future"; }
  }

  // Incumbent signal from USASpending — any incumbents => a recompete-ish
  // market; a single dominant incumbent => concentrated/vulnerable.
  const inc = item.incumbents || [];
  if (inc.length) {
    score += 10;
    factors.incumbents = inc.length;
    const vals = inc.map((i) => Number(i.value) || 0).sort((a, b) => b - a);
    const total = vals.reduce((a, b) => a + b, 0);
    if (total > 0 && vals[0] / total >= 0.6) { score += 10; factors.incumbent_concentration = "high"; }
  }

  if (item.set_aside) { score += 8; factors.set_aside = item.set_aside; }

  const naics = (item.naics || (item._query && item._query.naics) || "").toString();
  if (HEALTH_IT_NAICS.has(naics)) { score += 7; factors.naics_match = naics; }

  const title = (item.title || "").toLowerCase();
  if (HIGH_VALUE_TERMS.some((t) => title.includes(t))) { score += 10; factors.high_value_term = true; }

  const type = (item.type || "").toLowerCase();
  if (/solicitation|combined synopsis/.test(type)) { score += 5; factors.type = "active"; }
  else if (/sources sought|presolicitation|special notice/.test(type)) { score += 3; factors.type = "early"; }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = score >= 70 ? "PURSUE" : score >= 50 ? "QUALIFY" : score >= 35 ? "MONITOR" : "WATCH";
  return { score, verdict, factors };
}

async function run(ctx) {
  const items = (ctx.data.enrich && ctx.data.enrich.items) || (ctx.data.dedupe && ctx.data.dedupe.items) || [];
  for (const it of items) {
    const { score, verdict, factors } = scoreOne(it);
    it.pursuit_score = score;
    it.pursuit_verdict = verdict;
    it.score_factors = factors;
  }
  // No network, no LLM => no marginal cost.
  return { items, scored: items.length, scores: items.map((i) => i.pursuit_score) };
}

module.exports = { run, scoreOne };
