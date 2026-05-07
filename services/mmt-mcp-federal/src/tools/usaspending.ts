// USASpending tools — usaspending_naics_summary, usaspending_recipient_awards.
// No auth required.
//
// DM-102 (Sprint A1, 2026-05-07).

import { withCache } from "../cache.js";
import { ToolDefinition, ToolHandler } from "../types.js";

export const usaspending_naics_summary: ToolDefinition = {
  name: "usaspending_naics_summary",
  description:
    "Aggregate federal spending in a NAICS over a fiscal-year window. Useful for TAM sizing and market-context answers.",
  inputSchema: {
    type: "object",
    properties: {
      naics: { type: "string", description: "Six-digit NAICS code" },
      fiscal_year: { type: "integer", description: "FY (e.g., 2026)" },
      agency: { type: "string", description: "Optional agency toptier name" },
    },
    required: ["naics", "fiscal_year"],
    additionalProperties: false,
  },
};

export const handleUsaspendingNaicsSummary: ToolHandler = async (args) => {
  return withCache("usaspending_naics_summary", args, async () => {
    const fy = Number(args.fiscal_year);
    const filters: any = {
      time_period: [{ start_date: `${fy - 1}-10-01`, end_date: `${fy}-09-30` }],
      naics_codes: [String(args.naics)],
    };
    if (args.agency) {
      filters.agencies = [{ type: "funding", tier: "toptier", name: args.agency }];
    }
    const res = await fetch(
      "https://api.usaspending.gov/api/v2/search/spending_by_category/naics/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, limit: 1 }),
      }
    );
    if (!res.ok) {
      throw new Error(`USASpending ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    const total = json.results && json.results[0] ? json.results[0].amount : 0;
    return {
      data: {
        naics: args.naics,
        fiscal_year: fy,
        agency: args.agency || "All federal",
        total_obligated: total,
      },
      source_url:
        "https://api.usaspending.gov/api/v2/search/spending_by_category/naics/",
    };
  });
};

export const usaspending_recipient_awards: ToolDefinition = {
  name: "usaspending_recipient_awards",
  description:
    "Pull a specific recipient's recent federal contract awards. Use for incumbency / past-performance research.",
  inputSchema: {
    type: "object",
    properties: {
      recipient: { type: "string", description: "Company / vendor name" },
      from_days_ago: { type: "integer", default: 730 },
      limit: { type: "integer", default: 10, maximum: 25 },
    },
    required: ["recipient"],
    additionalProperties: false,
  },
};

export const handleUsaspendingRecipientAwards: ToolHandler = async (args) => {
  const limit = Math.min(Number(args.limit ?? 10), 25);
  const daysBack = Number(args.from_days_ago ?? 730);
  const from = new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return withCache("usaspending_recipient_awards", { ...args, limit, from }, async () => {
    const res = await fetch(
      "https://api.usaspending.gov/api/v2/search/spending_by_award/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            award_type_codes: ["A", "B", "C", "D"],
            time_period: [{ start_date: from, end_date: today }],
            recipient_search_text: [args.recipient],
          },
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
      }
    );
    if (!res.ok) {
      throw new Error(`USASpending ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    const items = (json.results || []).map((r: any) => ({
      award_id: r["Award ID"],
      recipient: r["Recipient Name"],
      amount: r["Award Amount"],
      agency: r["Awarding Agency"],
      sub_agency: r["Awarding Sub Agency"],
      naics: r["NAICS Code"],
      start_date: r["Start Date"],
      description: (r["Description"] || "").slice(0, 200),
      usaspending_url: `https://www.usaspending.gov/award/${encodeURIComponent(
        r.generated_internal_id || r["Award ID"]
      )}`,
    }));
    return {
      data: { recipient: args.recipient, items, total: items.length },
      source_url: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
    };
  });
};
