// End-to-end enrichment with every upstream stubbed. Properties the product
// markets, asserted across question shapes rather than one question:
//   1. "Every answer shows its sources": the archive entry is found and
//      cited with the MMT page; a system that was not queried for this
//      question is never a source and never "not reached".
//   2. "It tells you when it does not know": a system that was queried and
//      did not answer is listed as NOT REACHED; a system that was never
//      connected (no key, retired API) is not, because the catalog says so.
//   3. The fallback web search fires when the award/solicitation picture is
//      incomplete: all sources empty, or SAM.gov out of quota on a contract
//      question. Off without a key.
//   4. The model sees what it needs to not invent: the record's description
//      and award amount, a working USASpending link, the acronym reference,
//      and the age of the newest MMT source.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
const fetchCache = cjsRequire("../../netlify/functions/lib/fetch-cache.js");
function freshStore() { const d = {}; return { async get(k) { return k in d ? d[k] : null; }, async setJSON(k, v) { d[k] = v; } }; }

const QUESTION = "Tell me all about data governence awards in the DHA";
let assistant;
let realFetch;
let seen;

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const IMMUTA = {
  "Award ID": "HT001524F0063", "Recipient Name": "NEW TECH SOLUTIONS, INC.", "Award Amount": 286673, "Total Obligated Amount": 0,
  "Description": "IMMUTA SOFTWARE FOR DATA GOVERNANCE", "Start Date": "2024-03-16", "End Date": "2025-03-15",
  "Awarding Agency": "Department of Defense", "Awarding Sub Agency": "Defense Health Agency", "NAICS Code": null,
  generated_internal_id: "CONT_AWD_HT001524F0063_9700_NNG15SC82B_8000",
};

beforeAll(async () => {
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.USAJOBS_API_KEY;
  process.env.SAM_GOV_API_KEY = "test-sam-key";
  realFetch = globalThis.fetch;
  assistant = await import("../../netlify/functions/lib/premium-assistant.js");
});
afterAll(() => { globalThis.fetch = realFetch; delete process.env.SAM_GOV_API_KEY; });
beforeEach(() => { fetchCache._setStoreForTests(freshStore()); seen = []; });

describe("runEnrichment: the DHA data governance question (procurement shape)", () => {
  it("with every upstream down: the archive answers, the queried-and-silent systems are named, the unrouted ones are not", async () => {
    globalThis.fetch = async (url) => { seen.push(String(url)); throw new Error("egress blocked"); };
    const r = await assistant.runEnrichment(QUESTION);

    expect(r.agency).toBe("DHA");
    expect(r.searchPhrase).toBe("data governance");
    expect(r.corrections).toEqual([{ from: "governence", to: "governance" }]);
    expect(r.shapes).toEqual(["procurement"]);

    const articles = r.sources.filter((s) => s.kind === "article");
    expect(articles.map((s) => s.title)).toContain("DHA Data Governance (WOSB Set-Aside)");
    expect(articles.find((s) => s.title === "DHA Data Governance (WOSB Set-Aside)").url)
      .toBe("https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/");
    expect(r.sources.filter((s) => s.kind === "system")).toEqual([]);

    const ids = r.unavailable.map((u) => u.id);
    expect(ids).toContain("usaspending");
    expect(ids).toContain("sam_opportunities");
    expect(ids).toContain("federal_register");
    expect(ids).toContain("gao_reports");
    // Congress.gov and GovInfo have no key in the test environment: never
    // connected, so not "not reached" (the catalog carries that state)
    expect(ids).not.toContain("congress");
    expect(ids).not.toContain("govinfo");
    // not routed for a procurement question: never queried, never "not reached"
    for (const id of ["pubmed", "clinicaltrials", "grants", "sam_assistance", "usajobs", "ecfr", "regulations_gov", "hhs_open", "onc_healthit"]) {
      expect(ids, `${id} should not be listed`).not.toContain(id);
    }
    expect(seen.some((u) => u.includes("pubmed") || u.includes("clinicaltrials") || u.includes("ecfr.gov") || u.includes("regulations.gov"))).toBe(false);
    // never connected: the catalog carries it, the answer does not
    expect(ids).not.toContain("it_dashboard");
    expect(r.unavailable.every((u) => typeof u.name === "string" && u.name.length > 0)).toBe(true);
    expect(r.context).toContain("SYSTEMS NOT REACHED THIS TURN");
    expect(r.context).toContain("MMT ORIGINAL CONTENT");
    expect(r.context).toContain("ACRONYM REFERENCE");
    expect(r.context).toContain("DHA: Defense Health Agency");
    expect(r.hasAnyData).toBe(true);
    expect(seen.some((u) => u.includes("perplexity"))).toBe(false);
  }, 30000);

  it("with USASpending answering: the award is a cited source, the model sees its description and amount, and the link is the real award page", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("spending_by_award")) return jsonRes({ results: [IMMUTA], page_metadata: { total: 1 } });
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment(QUESTION);
    const usa = r.sources.find((s) => s.id === "usaspending");
    expect(usa).toBeTruthy();
    expect(usa.links).toEqual(["https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700_NNG15SC82B_8000"]);
    expect(r.unavailable.map((u) => u.id)).not.toContain("usaspending");
    expect(r.context).toContain("HT001524F0063");
    expect(r.context).toContain("IMMUTA SOFTWARE FOR DATA GOVERNANCE");
    expect(r.context).toContain("award $0.29M");
    expect(r.context).not.toContain("usaspending.gov/award/HT001524F0063");
  }, 30000);

  it("SAM.gov out of quota on a contract question: the federal web search runs even though USASpending answered, and the reason names the reset", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    let perplexityCalls = 0;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("spending_by_award")) return jsonRes({ results: [IMMUTA], page_metadata: { total: 1 } });
      if (u.includes("api.sam.gov")) return jsonRes({ code: "900804", message: "Message throttled out", nextAccessTime: "2026-Sep-14 00:00:00+0000 UTC" }, 429);
      if (u.includes("api.perplexity.ai")) {
        perplexityCalls += 1;
        return jsonRes({ choices: [{ message: { content: "sam.gov lists the DHA data governance WOSB notice." } }], citations: ["https://sam.gov/opp/0123456789abcdef0123456789abcdef/view"] });
      }
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment(QUESTION);
    expect(perplexityCalls).toBe(1);
    const web = r.sources.find((s) => s.id === "web_federal");
    expect(web).toBeTruthy();
    expect(web.mode).toBe("fallback");
    const sam = r.unavailable.find((u) => u.id === "sam_opportunities");
    expect(sam.reason).toBe("daily quota spent, resets 2026-Sep-14 00:00:00+0000 UTC");
    expect(r.context).toContain("WEB SEARCH OF FEDERAL SITES");
    delete process.env.PERPLEXITY_API_KEY;
  }, 30000);

  it("fires the federal web search when awards, opportunities and contract awards were all silent", async () => {
    process.env.PERPLEXITY_API_KEY = "pplx-test";
    let perplexityCalls = 0;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("api.perplexity.ai")) {
        perplexityCalls += 1;
        return jsonRes({ choices: [{ message: { content: "health.mil lists a DHA data governance award notice." } }], citations: ["https://health.mil/News/Articles/2026/x"] });
      }
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment(QUESTION);
    expect(perplexityCalls).toBe(1);
    expect(r.sources.find((s) => s.id === "web_federal").links).toEqual(["https://health.mil/News/Articles/2026/x"]);
    delete process.env.PERPLEXITY_API_KEY;
  }, 30000);
});

describe("runEnrichment: other question shapes route other systems", () => {
  it("a research question queries PubMed and ClinicalTrials.gov and reports them when silent; a hiring question queries USAJOBS only when it has a key", async () => {
    globalThis.fetch = async (url) => { seen.push(String(url)); throw new Error("egress blocked"); };
    const research = await assistant.runEnrichment("What does the published research say about remote patient monitoring outcomes in VA?");
    expect(research.shapes).toContain("research");
    expect(research.routed).toEqual(expect.arrayContaining(["pubmed", "clinicaltrials"]));
    const ids = research.unavailable.map((u) => u.id);
    expect(ids).toContain("pubmed");
    expect(ids).toContain("clinicaltrials");
    expect(ids).not.toContain("grants");

    const hiring = await assistant.runEnrichment("Is DHA hiring data scientists?");
    expect(hiring.routed).toContain("usajobs");
    // no USAJOBS key: never connected, so not "not reached"
    expect(hiring.unavailable.map((u) => u.id)).not.toContain("usajobs");
  }, 30000);

  it("a policy question queries eCFR and Regulations.gov, scoped to the agency", async () => {
    const regsUrls = [];
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("api.regulations.gov")) { regsUrls.push(u); return jsonRes({ data: [], meta: { totalElements: 0 } }); }
      if (u.includes("ecfr.gov")) return jsonRes({ results: [], meta: { total_count: 0 } });
      throw new Error("egress blocked");
    };
    const r = await assistant.runEnrichment("Is the CMS interoperability rule final?");
    expect(r.shapes).toContain("policy");
    expect(r.routed).toEqual(expect.arrayContaining(["ecfr", "regulations_gov"]));
    expect(regsUrls.length).toBeGreaterThan(0);
    expect(new URL(regsUrls[0]).searchParams.get("filter[agencyId]")).toBe("CMS");
    expect(r.unavailable.map((u) => u.id)).not.toContain("ecfr");
  }, 30000);
});

describe("collectUnavailable", () => {
  it("names a spent SAM quota plainly, lists queried-and-failed systems, and skips never-connected or unrouted ones", () => {
    const out = assistant.collectUnavailable({
      federalData: {
        usaspending_awards: { awards: [] },
        sam_opportunities: { opportunities: [], error: "SAM 429", rateLimited: true, resetAt: "2026-09-11T00:00:00Z" },
      },
      systemBlocks: [
        { id: "congress", data: { configured: false } },
        { id: "govinfo", data: { error: "timeout-8s" } },
        { id: "clinicaltrials", data: { dha: { studies: [], error: "egress blocked" }, va: { studies: [], error: "egress blocked" }, general: { studies: [], error: "egress blocked" } } },
        { id: "grants", data: { general: { grants: [] }, cdmrp: { grants: [], error: "x" }, arpah: { grants: [] } } },
        { id: "pubmed", data: { skipped: "not_relevant" } },
        { id: "it_dashboard", data: { configured: false, reason: "retired" } },
        { id: "web_federal", data: { error: "ignored" } },
      ],
    });
    expect(out.map((u) => u.id)).toEqual(["sam_opportunities", "govinfo", "clinicaltrials"]);
    expect(out[0].reason).toBe("daily quota spent, resets 2026-09-11T00:00:00Z");
    expect(out[1].reason).toBe("timeout-8s");
    expect(out[2].reason).toBe("egress blocked"); // every sponsor search failed; grants had one good part and stays off the list
  });
});

describe("archiveRecencyNote", () => {
  it("says when MMT last covered the question once the newest match is older than the threshold", () => {
    const now = new Date("2026-09-13T12:00:00Z");
    expect(assistant.archiveRecencyNote([{ date: "2026-09-11" }, { date: "2026-04-04" }], now)).toBe("");
    const note = assistant.archiveRecencyNote([{ date: "2026-04-11" }, { date: "2026-03-31" }], now);
    expect(note).toContain("MMT ARCHIVE RECENCY");
    expect(note).toContain("2026-04-11");
    expect(note).toContain("155 days ago");
    expect(assistant.archiveRecencyNote([], now)).toBe("");
    expect(assistant.archiveRecencyNote([{ date: "" }, { date: "not a date" }], now)).toBe("");
  });
});
