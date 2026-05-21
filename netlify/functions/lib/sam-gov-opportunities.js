// ============================================================
// lib/sam-gov-opportunities.js — CommonJS shim mirroring the
// handleSamSearchOpportunities handler in
// services/mmt-mcp-federal/src/tools/sam-gov.ts. The TS source is
// part of the MCP runtime (ESM + cache + token bucket) which isn't
// usable from a Netlify Function bundle. This file ports just the
// fetch + field-extraction surface so the pursuit-calendar-refresh
// cron can call SAM.gov directly.
//
// Returned shape is identical to the MCP handler so the two stay
// in lockstep:
//   { data: { items: [...], total: N }, source_url: string }
// Each item: { notice_id, title, solicitation_number, type,
//              posted_date, response_deadline, naics, set_aside,
//              agency, sam_url }
//
// Caller is responsible for date-window filtering (e.g., dropping
// items with response_deadline outside the next 90 days) and for
// the SAM.gov rate limit (900 req/hr) — at 5 queries per refresh
// every 6h this is comfortably under cap.
// ============================================================

function fmtDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

async function sam_search_opportunities(args = {}) {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) throw new Error("SAM_GOV_API_KEY not configured");

  const limit = Math.min(Number(args.limit ?? 10), 25);
  const daysBack = Number(args.posted_from_days_ago ?? 30);
  const from = new Date(Date.now() - daysBack * 86400000);
  const to = new Date();

  const url = new URL("https://api.sam.gov/prod/opportunities/v2/search");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("postedFrom", fmtDate(from));
  url.searchParams.set("postedTo", fmtDate(to));
  if (args.keyword) url.searchParams.set("title", args.keyword);
  if (args.naics) url.searchParams.set("ncode", args.naics);
  if (args.set_aside) url.searchParams.set("typeOfSetAside", args.set_aside);
  if (args.agency) url.searchParams.set("organizationName", args.agency);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SAM.gov ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const items = (json.opportunitiesData || []).map((o) => ({
    notice_id: o.noticeId,
    title: o.title,
    solicitation_number: o.solicitationNumber,
    type: o.type,
    posted_date: o.postedDate,
    response_deadline: o.responseDeadLine,
    naics: o.naicsCode,
    set_aside: o.typeOfSetAsideDescription,
    agency: o.fullParentPathName,
    sam_url: o.uiLink,
  }));
  return {
    data: { items, total: json.totalRecords ?? items.length },
    source_url: url.toString().replace(apiKey, "REDACTED"),
  };
}

const handleSamSearchOpportunities = sam_search_opportunities;

module.exports = {
  sam_search_opportunities,
  handleSamSearchOpportunities,
};
