// Federal Register tools — fedreg_search, fedreg_document.
// No auth required.
//
// DM-102 (Sprint A1, 2026-05-07).

import { withCache } from "../cache.js";
import { ToolDefinition, ToolHandler } from "../types.js";

export const fedreg_search: ToolDefinition = {
  name: "fedreg_search",
  description:
    "Search the Federal Register for rules, notices, proposed rules, and presidential documents. Filter by agency, type, date.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      agencies: {
        type: "array",
        items: { type: "string" },
        description: "Federal Register agency slug(s) (e.g., 'health-and-human-services-department')",
      },
      type: { type: "string", description: "Rule, Proposed Rule, Notice, Presidential Document" },
      from_days_ago: { type: "integer", default: 30 },
      limit: { type: "integer", default: 10, maximum: 25 },
    },
    additionalProperties: false,
  },
};

export const handleFedregSearch: ToolHandler = async (args) => {
  const limit = Math.min(Number(args.limit ?? 10), 25);
  const daysBack = Number(args.from_days_ago ?? 30);
  const from = new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);

  return withCache("fedreg_search", { ...args, limit, from }, async () => {
    const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("order", "newest");
    url.searchParams.set("conditions[publication_date][gte]", from);
    if (args.query) url.searchParams.set("conditions[term]", args.query);
    if (args.type) url.searchParams.set("conditions[type][]", args.type);
    if (Array.isArray(args.agencies)) {
      for (const a of args.agencies) {
        url.searchParams.append("conditions[agencies][]", a);
      }
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Federal Register ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    const items = (json.results || []).map((d: any) => ({
      document_number: d.document_number,
      title: d.title,
      type: d.type,
      publication_date: d.publication_date,
      agency_names: d.agencies?.map((a: any) => a.name) || [],
      abstract: (d.abstract || "").slice(0, 500),
      html_url: d.html_url,
    }));
    return {
      data: { items, total: json.count ?? items.length },
      source_url: url.toString(),
    };
  });
};

export const fedreg_document: ToolDefinition = {
  name: "fedreg_document",
  description: "Fetch a single Federal Register document by document number.",
  inputSchema: {
    type: "object",
    properties: {
      document_number: { type: "string" },
    },
    required: ["document_number"],
    additionalProperties: false,
  },
};

export const handleFedregDocument: ToolHandler = async (args) => {
  return withCache("fedreg_document", args, async () => {
    const url = `https://www.federalregister.gov/api/v1/documents/${encodeURIComponent(
      args.document_number
    )}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Federal Register ${res.status}`);
    }
    const d: any = await res.json();
    return {
      data: {
        document_number: d.document_number,
        title: d.title,
        type: d.type,
        publication_date: d.publication_date,
        agencies: d.agencies?.map((a: any) => a.name) || [],
        abstract: d.abstract || "",
        html_url: d.html_url,
        full_text_excerpt: (d.full_text_xml_url ? "(full text XML available)" : ""),
        action: d.action,
        effective_on: d.effective_on,
      },
      source_url: url,
    };
  });
};
