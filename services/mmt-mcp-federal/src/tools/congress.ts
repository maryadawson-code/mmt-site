// Congress.gov API tool — congress_search_bills.
//
// DM-103 (Sprint A1, 2026-05-07).

import { withCache } from "../cache.js";
import { ToolDefinition, ToolHandler } from "../types.js";

export const congress_search_bills: ToolDefinition = {
  name: "congress_search_bills",
  description:
    "Search recent bills and resolutions in Congress. Useful for legislative-context answers (NDAA, appropriations, oversight).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keyword (e.g., 'health information technology')" },
      congress: { type: "integer", description: "Congress number (e.g., 119)", default: 119 },
      limit: { type: "integer", default: 10, maximum: 25 },
    },
    additionalProperties: false,
  },
};

export const handleCongressSearchBills: ToolHandler = async (args) => {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) throw new Error("CONGRESS_GOV_API_KEY not configured");
  const limit = Math.min(Number(args.limit ?? 10), 25);
  const congress = Number(args.congress ?? 119);

  return withCache("congress_search_bills", { ...args, limit, congress }, async () => {
    const url = new URL(`https://api.congress.gov/v3/bill/${congress}`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    if (args.query) url.searchParams.set("q", args.query);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Congress.gov ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    const items = ((json.bills as any[]) || []).map((b: any) => ({
      number: b.number,
      type: b.type,
      title: b.title,
      latest_action: b.latestAction?.text,
      latest_action_date: b.latestAction?.actionDate,
      url: b.url,
    }));
    return {
      data: { items, total: items.length, congress },
      source_url: url.toString().replace(apiKey, "REDACTED"),
    };
  });
};
