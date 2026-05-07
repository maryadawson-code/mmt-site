// SAM.gov Opportunities API tools — sam_search_opportunities and
// sam_search_awards. Awards endpoint queries USASpending under the hood
// since SAM.gov's Contract Data API was decommissioned with FPDS Feb 24 2026.
//
// DM-102 (Sprint A1, 2026-05-07).

import { withCache } from "../cache.js";
import { TokenBucket, RateLimitError, ToolDefinition, ToolHandler } from "../types.js";

// SAM.gov rate limit: 900 req/hr per the API guide. Refill = 0.25/sec.
const samBucket = new TokenBucket(900, 900 / 3600);

function fmtDate(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export const sam_search_opportunities: ToolDefinition = {
  name: "sam_search_opportunities",
  description:
    "Search SAM.gov for active or recent federal contracting opportunities. Filter by keyword, agency, NAICS, set-aside, posted date.",
  inputSchema: {
    type: "object",
    properties: {
      keyword: { type: "string" },
      agency: { type: "string", description: "Agency name (e.g., Defense Health Agency)" },
      naics: { type: "string" },
      set_aside: { type: "string", description: "e.g., WOSB, 8(a), SDVOSBC" },
      posted_from_days_ago: { type: "integer", default: 30 },
      limit: { type: "integer", default: 10, maximum: 25 },
    },
    additionalProperties: false,
  },
};

export const handleSamSearchOpportunities: ToolHandler = async (args) => {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) throw new Error("SAM_GOV_API_KEY not configured");
  if (!samBucket.consume()) {
    throw new RateLimitError("sam_search_opportunities", samBucket.retryAfterMs());
  }

  const limit = Math.min(Number(args.limit ?? 10), 25);
  const daysBack = Number(args.posted_from_days_ago ?? 30);
  const from = new Date(Date.now() - daysBack * 86400_000);
  const to = new Date();

  const cacheKey = { ...args, limit, daysBack };
  return withCache("sam_search_opportunities", cacheKey, async () => {
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
    if (!res.ok) throw new Error(`SAM.gov ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const items = (json.opportunitiesData || []).map((o: any) => ({
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
  });
};

export const sam_search_awards: ToolDefinition = {
  name: "sam_search_awards",
  description:
    "Search recent federal contract awards (post-FPDS, via USASpending). Filter by agency, NAICS, recipient, date range.",
  inputSchema: {
    type: "object",
    properties: {
      agency: { type: "string", description: "Awarding agency toptier name" },
      keyword: { type: "string" },
      recipient: { type: "string" },
      naics: { type: "string" },
      from_days_ago: { type: "integer", default: 365 },
      limit: { type: "integer", default: 10, maximum: 25 },
    },
    additionalProperties: false,
  },
};

export const handleSamSearchAwards: ToolHandler = async (args) => {
  const limit = Math.min(Number(args.limit ?? 10), 25);
  const daysBack = Number(args.from_days_ago ?? 365);
  const from = new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return withCache("sam_search_awards", { ...args, limit, from, today }, async () => {
    const filters: any = {
      award_type_codes: ["A", "B", "C", "D"],
      time_period: [{ start_date: from, end_date: today }],
    };
    if (args.agency) {
      filters.agencies = [{ type: "awarding", tier: "toptier", name: args.agency }];
    }
    if (args.keyword) filters.keyword = args.keyword;
    if (args.naics) filters.naics_codes = [String(args.naics)];
    if (args.recipient) filters.recipient_search_text = [args.recipient];

    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        fields: [
          "Award ID",
          "Recipient Name",
          "Award Amount",
          "Description",
          "Start Date",
          "Awarding Agency",
          "Awarding Sub Agency",
          "NAICS Code",
        ],
        limit,
        page: 1,
        sort: "Award Amount",
        order: "desc",
        subawards: false,
      }),
    });
    if (!res.ok) {
      throw new Error(`USASpending ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    const items = (json.results || []).map((r: any) => ({
      award_id: r["Award ID"],
      recipient: r["Recipient Name"],
      amount: r["Award Amount"],
      start_date: r["Start Date"],
      agency: r["Awarding Agency"],
      sub_agency: r["Awarding Sub Agency"],
      naics: r["NAICS Code"],
      description: (r["Description"] || "").slice(0, 200),
      usaspending_url: `https://www.usaspending.gov/award/${encodeURIComponent(
        r.generated_internal_id || r["Award ID"]
      )}`,
    }));
    return {
      data: { items, total: items.length },
      source_url: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
    };
  });
};
