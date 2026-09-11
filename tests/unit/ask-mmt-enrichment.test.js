// End-to-end enrichment for the exact question that failed on 2026-09-10,
// with every upstream stubbed. Two properties the product markets:
//   1. "Every answer shows its sources": the MMT archive entry on DHA data
//      governance is found and cited with the MMT page, not a bare sam.gov.
//   2. "It tells you when it does not know": a system that did not answer
//      is listed as NOT REACHED, never mistaken for "no record exists".
// Also asserts the fallback web search fires only when the structured
// award sources were silent, and stays off without a key.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const QUESTION = "Tell me all about data governence awards in the DHA";
let assistant;
let realFetch;
let seen;

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeAll(async () => {
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  process.env.SAM_GOV_API_KEY = "test-sam-key";
  realFetch = globalThis.fetch;
  assistant = await import("../../netlify/functions/lib/premium-assistant.js");
});
afterAll(() => { globalThis.fetch = realFetch; delete process.env.SAM_GOV_API_KEY; });

describe("runEnrichment for the failing question", () => {
  it("with every upstream down: the archive still answers, and the silent systems are named, not treated as empty", async () => {
    seen = [];
    globalThis.fetch = async (url) => { seen.push(String(url)); throw new Error("egress blocked"); };
    const r = await assistant.runEnrichment(QUESTION);

    expect(r.agency).toBe("DHA");
    expect(r.searchPhrase).toBe("data governance");
    expect(r.corrections).toEqual([{ from: "governence", to: "governance" }]);

    const articles = r.sources.filter((s) => s.kind === "article");
    expect(articles.map((s) => s.title)).toContain("DHA Data Governance (WOSB Set-Aside)");
    expect(articles.find((s) => s.title === "DHA Data Governance (WOSB Set-Aside)").url)
      .toBe("https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/");
    expect(r.sources.filter((s) => s.kind === "system")).toEqual([]);

    const ids = r.unavailable.map((u) => u.id);
    expect(ids).toContain("usaspending");
    expect(ids).toContain("sam_opportunities");
    expect(ids).toContain("pubmed");
    expect(r.unavailable.every((u) => typeof u.name === "string" && u.name.length > 0)).toBe(true);
    expect(r.context).toContain("SYSTEMS NOT REACHED THIS TURN");
    expect(r.context).toContain("MMT ORIGINAL CONTENT");
    expect(r.hasAnyData).toBe(true);
    // No Perplexity key: the fallback never went to the wire.
    expect(seen.some((u) => u.includes("perplexity"))).toBe(false);
  }, 30000);

  it("with USASpending answering: the award system is a cited source with record links and drops off the not-reached list", async () => {
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("spending_by_award")) {
        return jsonRes({ results: [{
          "Award ID": "HT001125F0042", "Recipient Name": "EXAMPLE DATA LLC", "Award Amount": 1200000, "Total Obligated Amount": 900000,
          "Description": "DATA GOVERNANCE SUPPORT SERVICES", "Start Date": "2025-01-01", "End Date": "2026-12-31",
          "Awarding Agency": "Department of Defense", "Awarding Sub Agency": "Defense Health Agency", "NAICS Code": "541512",
        }], page_metadata: { total: 1 } });
      }
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment(QUESTION);
    const usa = r.sources.find((s) => s.id === "usaspending");
    expect(usa).toBeTruthy();
    expect(usa.links.length).toBeGreaterThan(0);
    expect(usa.links[0]).toContain("usaspending.gov");
    expect(r.unavailable.map((u) => u.id)).not.toContain("usaspending");
    expect(r.context).toContain("HT001125F0042");
  }, 30000);

  it("fires the federal web search only when awards, opportunities and contract awards were all silent, and cites it as a fallback", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    let perplexityCalls = 0;
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("api.perplexity.ai")) {
        perplexityCalls += 1;
        return jsonRes({ choices: [{ message: { content: "health.mil lists a DHA data governance award notice." } }], citations: ["https://health.mil/News/Articles/2026/x"] });
      }
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment(QUESTION);
    expect(perplexityCalls).toBe(1);
    const web = r.sources.find((s) => s.id === "web_federal");
    expect(web).toBeTruthy();
    expect(web.mode).toBe("fallback");
    expect(web.links).toEqual(["https://health.mil/News/Articles/2026/x"]);
    expect(r.context).toContain("WEB SEARCH OF FEDERAL SITES");
    delete process.env.PERPLEXITY_API_KEY;
  }, 30000);
});

describe("collectUnavailable", () => {
  it("maps rate-limited SAM to a plain reason and ignores healthy systems", () => {
    const out = assistant.collectUnavailable({
      federalData: {
        usaspending_awards: { awards: [] },
        sam_opportunities: { opportunities: [], error: "SAM 429", rateLimited: true, resetAt: "2026-09-11T00:00:00Z" },
      },
      systemBlocks: [
        { id: "congress", data: { configured: false } },
        { id: "pubmed", data: { articles: [] } },
        { id: "web_federal", data: { error: "ignored" } },
      ],
    });
    expect(out.map((u) => u.id)).toEqual(["sam_opportunities", "congress"]);
    expect(out[0].reason).toMatch(/rate limited/);
    expect(out[1].reason).toBe("not configured");
  });
});
