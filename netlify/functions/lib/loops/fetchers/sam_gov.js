// ============================================================
// fetchers/sam_gov.js (L1 step "fetch")
//
// Runs the spec's keyword/NAICS queries against SAM.gov Opportunities
// via the existing sam-gov-opportunities helper, tags each result with
// the originating query (so the enricher knows which USASpending toptier
// agency to look up), and returns a flat list of normalized rows.
//
// SAM.gov daily-quota note (CLAUDE.md hard rule): the SAM_GOV_API_KEY has
// a SMALL SHARED DAILY quota. This loop runs ONCE/day with N queries
// (5 in the v1 spec). Keep the query count low and the cadence daily so
// L1 does not starve the on-demand tools (signal-chain, compliance-check,
// pursuit-score) that share the same pool. Do NOT raise this to hourly.
// ============================================================

const { sam_search_opportunities } = require("../../sam-gov-opportunities");

async function run(ctx, config) {
  const queries = Array.isArray(config.queries) ? config.queries : [];
  const windowDays = Math.max(1, Math.ceil((config.windowHours || 48) / 24));
  const limit = config.limit || 15;

  const items = [];
  const errors = [];

  for (const q of queries) {
    try {
      const { data } = await sam_search_opportunities({
        keyword: q.keyword,
        naics: q.naics,
        agency: q.agency,
        set_aside: q.set_aside,
        posted_from_days_ago: windowDays,
        limit,
      });
      for (const it of data.items || []) {
        items.push({
          ...it,
          _query: {
            keyword: q.keyword,
            naics: q.naics || it.naics,
            usaspending_agency: q.usaspending_agency || null,
          },
        });
      }
    } catch (e) {
      // Graceful per-query failure — one bad query (or a quota 429) must
      // not zero out the whole run. Recorded so freshness/dup evals see it.
      errors.push({ query: q.keyword, error: String(e && e.message).slice(0, 200) });
      ctx.log?.warn?.(`L1 sam_gov: query "${q.keyword}" failed — ${e && e.message}`);
    }
  }

  return { items, errors, queriedAt: new Date().toISOString(), windowDays };
}

module.exports = { run };
