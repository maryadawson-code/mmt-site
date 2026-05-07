// Grants.gov tool — grants_search_opportunities.
//
// DM-103 (Sprint A1, 2026-05-07).

import { withCache } from "../cache.js";
import { ToolDefinition, ToolHandler } from "../types.js";

export const grants_search_opportunities: ToolDefinition = {
  name: "grants_search_opportunities",
  description:
    "Search Grants.gov for active federal grant opportunities. Filter by keyword, agency, CFDA, eligibility.",
  inputSchema: {
    type: "object",
    properties: {
      keyword: { type: "string" },
      agency: { type: "string", description: "Agency code (e.g., HHS, VA, DOD)" },
      cfda: { type: "string", description: "Assistance Listing number (e.g., 93.279)" },
      limit: { type: "integer", default: 10, maximum: 25 },
    },
    additionalProperties: false,
  },
};

export const handleGrantsSearchOpportunities: ToolHandler = async (args) => {
  const limit = Math.min(Number(args.limit ?? 10), 25);

  return withCache("grants_search_opportunities", { ...args, limit }, async () => {
    const body: any = {
      rows: limit,
      oppStatuses: "forecasted|posted",
    };
    if (args.keyword) body.keyword = args.keyword;
    if (args.agency) body.agencyCode = args.agency;
    if (args.cfda) body.cfda = args.cfda;

    const res = await fetch("https://api.grants.gov/v1/api/search2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Grants.gov ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    const hits = json.data?.oppHits || [];
    const items = hits.map((g: any) => ({
      opportunity_id: g.id,
      number: g.number,
      title: g.title,
      agency: g.agencyName,
      cfda: g.cfdaList?.join(", "),
      open_date: g.openDate,
      close_date: g.closeDate,
      status: g.oppStatus,
      url: `https://www.grants.gov/search-results-detail/${encodeURIComponent(g.id)}`,
    }));
    return {
      data: { items, total: json.data?.hitCount || items.length },
      source_url: "https://api.grants.gov/v1/api/search2",
    };
  });
};
