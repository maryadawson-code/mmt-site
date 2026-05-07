// GAO tool — gao_recent_decisions. No public API; uses RSS.
//
// DM-103 (Sprint A1, 2026-05-07).

import { withCache } from "../cache.js";
import { ToolDefinition, ToolHandler } from "../types.js";

const GAO_RSS = "https://www.gao.gov/rss/legal/bid_protests.xml";

export const gao_recent_decisions: ToolDefinition = {
  name: "gao_recent_decisions",
  description:
    "Recent GAO bid-protest decisions from the GAO RSS feed. Optional keyword filter on title.",
  inputSchema: {
    type: "object",
    properties: {
      keyword: { type: "string" },
      limit: { type: "integer", default: 10, maximum: 25 },
    },
    additionalProperties: false,
  },
};

export const handleGaoRecentDecisions: ToolHandler = async (args) => {
  const limit = Math.min(Number(args.limit ?? 10), 25);
  return withCache("gao_recent_decisions", { ...args, limit }, async () => {
    const res = await fetch(GAO_RSS, { headers: { Accept: "application/rss+xml" } });
    if (!res.ok) {
      throw new Error(`GAO RSS ${res.status}`);
    }
    const xml = await res.text();
    const items = parseRssItems(xml).slice(0, 50);
    const filtered = args.keyword
      ? items.filter((i) =>
          i.title.toLowerCase().includes(String(args.keyword).toLowerCase())
        )
      : items;
    return {
      data: { items: filtered.slice(0, limit), total: filtered.length },
      source_url: GAO_RSS,
    };
  });
};

function parseRssItems(xml: string) {
  const items: Array<{ title: string; link: string; pub_date: string; description: string }> = [];
  const itemBlocks = xml.split(/<item>/i).slice(1);
  for (const block of itemBlocks) {
    const end = block.indexOf("</item>");
    const inner = end >= 0 ? block.slice(0, end) : block;
    items.push({
      title: extractTag(inner, "title"),
      link: extractTag(inner, "link"),
      pub_date: extractTag(inner, "pubDate"),
      description: extractTag(inner, "description").slice(0, 400),
    });
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}
