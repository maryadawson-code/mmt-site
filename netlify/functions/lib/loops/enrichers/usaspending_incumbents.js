// ============================================================
// enrichers/usaspending_incumbents.js (L1 step "enrich")
//
// For each distinct USASpending toptier agency referenced by the deduped
// opportunities, pulls the top-N recent contract awards (the likely
// incumbent set on that agency) and attaches them to every opportunity
// from that agency. USASpending is public + unauthenticated (no quota),
// so this is free to run daily — and it is what makes the quota-safe
// scorer's incumbent-vulnerability signal possible WITHOUT spending SAM
// quota on per-item scoring.
// ============================================================

const { fetchAwardsByAgency } = require("../../usaspending-client");
const { mapLimit } = require("../util");

async function run(ctx, config) {
  const items = (ctx.data.dedupe && ctx.data.dedupe.items) || [];
  const topN = config.topN || 3;

  // Unique toptier agency names present in this batch.
  const agencies = [...new Set(items.map((i) => i._query && i._query.usaspending_agency).filter(Boolean))];

  const byAgency = {};
  await mapLimit(agencies, 3, async (agencyName) => {
    const awards = await fetchAwardsByAgency(agencyName, { limit: topN, daysBack: 365 });
    byAgency[agencyName] = awards.slice(0, topN).map((a) => ({
      recipient: a.recipient,
      value: a.value,
      action_date: a.action_date,
      award_id: a.award_id,
    }));
  });

  let enrichedCount = 0;
  for (const it of items) {
    const agency = it._query && it._query.usaspending_agency;
    it.incumbents = (agency && byAgency[agency]) || [];
    if (it.incumbents.length) enrichedCount++;
  }

  return { items, agenciesEnriched: agencies.length, enrichedCount };
}

module.exports = { run };
