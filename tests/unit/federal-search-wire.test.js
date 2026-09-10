// Wire-level check of what the federal fan-out actually sends. On
// 2026-09-10 the question "Tell me all about data governence awards in the
// DHA" reached USASpending as keywords ["Tell about data governence awards"]
// and SAM.gov as q=<same>, scoped to all of DoD. These tests stub fetch and
// read the outbound request bodies, so "works as marketed" is asserted at
// the boundary the APIs see, not at the prompt.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

const QUESTION = "Tell me all about data governence awards in the DHA";
let api;
let calls;
let realFetch;

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function makeFetch({ subtierResults = [], toptierResults = [], subtierStatus = 200 } = {}) {
  return async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
    if (u.includes("api.usaspending.gov/api/v2/search/spending_by_award")) {
      const body = JSON.parse(opts.body);
      const tier = body.filters.agencies && body.filters.agencies[0] && body.filters.agencies[0].tier;
      if (tier === "subtier") {
        if (subtierStatus !== 200) return jsonRes({ detail: "bad agency" }, subtierStatus);
        return jsonRes({ results: subtierResults, page_metadata: { total: subtierResults.length } });
      }
      return jsonRes({ results: toptierResults, page_metadata: { total: toptierResults.length } });
    }
    if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
    if (u.includes("federalregister.gov")) return jsonRes({ results: [], count: 0 });
    if (u.includes("gao.gov")) return jsonRes({ results: [] });
    if (u.includes("api.usaspending.gov")) return jsonRes({ results: [] });
    return jsonRes({});
  };
}

beforeAll(async () => {
  process.env.SAM_GOV_API_KEY = "test-sam-key";
  realFetch = globalThis.fetch;
  api = await import("../../netlify/functions/lib/federal-data-apis.js");
});
afterAll(() => { globalThis.fetch = realFetch; delete process.env.SAM_GOV_API_KEY; });
beforeEach(() => { calls = []; });

describe("deriveKeywords", () => {
  it("never sends the sentence", () => {
    expect(api.deriveKeywords(QUESTION)).toBe("data governance");
    expect(api.deriveKeywords("MHS GENESIS")).toBe("genesis");
    expect(api.deriveKeywords("Community Care Network")).toBe("community care network");
    expect(api.deriveKeywords("")).toBe("");
  });
});

describe("enrichWithFederalData on the wire", () => {
  it("sends 'data governance' scoped to the Defense Health Agency subtier, then widens to DoD when the subtier is empty", async () => {
    globalThis.fetch = makeFetch({ subtierResults: [], toptierResults: [{ "Award ID": "HT001125F0001", "Recipient Name": "X", "Award Amount": 1, "Description": "DATA GOVERNANCE SUPPORT" }] });
    const out = await api.enrichWithFederalData({ topic: QUESTION, agency: "DHA" });
    const usa = calls.filter((c) => c.url.includes("spending_by_award")).map((c) => c.body.filters);
    expect(usa.length).toBe(2);
    expect(usa[0].keywords).toEqual(["data governance"]);
    expect(usa[0].agencies).toEqual([{ type: "funding", tier: "subtier", name: "Defense Health Agency" }]);
    expect(usa[1].keywords).toEqual(["data governance"]);
    expect(usa[1].agencies).toEqual([{ type: "funding", tier: "toptier", name: "Department of Defense" }]);
    expect(out.usaspending_awards.widened_from_subtier).toBe(true);
    expect(out.usaspending_awards.awards[0].piid).toBe("HT001125F0001");

    const sam = calls.find((c) => c.url.includes("api.sam.gov"));
    const params = new URL(sam.url).searchParams;
    expect(params.get("q")).toBe("data governance");
    expect(params.get("deptname")).toBe("DEPT OF DEFENSE");
    expect(params.get("api_key")).toBe("test-sam-key");
  });

  it("keeps the subtier results when the sub-agency answers", async () => {
    globalThis.fetch = makeFetch({ subtierResults: [{ "Award ID": "DHA-1", "Recipient Name": "Y", "Award Amount": 5, "Description": "data governance" }] });
    const out = await api.enrichWithFederalData({ topic: QUESTION, agency: "DHA" });
    expect(calls.filter((c) => c.url.includes("spending_by_award")).length).toBe(1);
    expect(out.usaspending_awards.awards[0].piid).toBe("DHA-1");
    expect(out.usaspending_awards.widened_from_subtier).toBeUndefined();
  });

  it("retries at toptier when USASpending rejects the subtier name (misnamed subtier can never blank an answer)", async () => {
    globalThis.fetch = makeFetch({ subtierStatus: 400, toptierResults: [{ "Award ID": "DOD-9", "Recipient Name": "Z", "Award Amount": 2, "Description": "x" }] });
    const out = await api.searchUSASpending({ keyword: "data governance", agency: "DHA" });
    const tiers = calls.filter((c) => c.url.includes("spending_by_award")).map((c) => c.body.filters.agencies[0].tier);
    expect(tiers).toEqual(["subtier", "toptier"]);
    expect(out.awards[0].piid).toBe("DOD-9");
    expect(out.error).toBeUndefined();
  });

  it("agencies without a subtier mapping go straight to toptier", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [] });
    await api.searchUSASpending({ keyword: "imaging", agency: "VA" });
    const tiers = calls.filter((c) => c.url.includes("spending_by_award")).map((c) => c.body.filters.agencies[0].tier);
    expect(tiers).toEqual(["toptier"]);
  });
});
