// lib/onc-chpl-api.js. 2026-09-14: any Ask MMT question naming Epic, Oracle,
// Cerner, ONC, CHPL or "certified" crashed runEnrichment, because
// enrichWithCHPL nested the whole search result under `products` and
// formatCHPLContext called .slice on that object. These tests pin the flat
// shape, the top-level error (so the not-reached list can name the system),
// the env-driven API key, and that neither reader ever throws.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
const chpl = cjsRequire("../../netlify/functions/lib/onc-chpl-api.js");
const { collectUnavailable } = cjsRequire("../../netlify/functions/lib/premium-assistant.js");

const LISTING = {
  id: 10001,
  chplProductNumber: "15.04.04.2891.Epic.AM.13.1.220630",
  product: { name: "EpicCare Ambulatory" },
  version: "February 2022",
  developer: { name: "Epic Systems Corporation" },
  edition: { name: "2015" },
  certificationStatus: { name: "Active" },
  currentCertificationStatus: { eventDate: "2022-06-30" },
  criteriaMet: [1, 2, 3],
};

let realFetch;
let calls;
function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function stubFetch(body, status = 200) {
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), headers: opts.headers || {} }); return jsonRes(body, status); };
}

beforeEach(() => { realFetch = globalThis.fetch; calls = []; delete process.env.CHPL_API_KEY; });
afterEach(() => { globalThis.fetch = realFetch; delete process.env.CHPL_API_KEY; });

describe("enrichWithCHPL", () => {
  it("skips questions that name no vendor or certification term", async () => {
    stubFetch({ results: [LISTING] });
    expect(await chpl.enrichWithCHPL({ topic: "DHA data governance awards" })).toEqual({ skipped: true });
    expect(calls).toHaveLength(0);
  });

  it("returns a FLAT products array with the total, never the nested search result", async () => {
    stubFetch({ results: [LISTING], recordCount: 1 });
    const r = await chpl.enrichWithCHPL({ topic: "Is Epic certified" });
    expect(Array.isArray(r.products)).toBe(true);
    expect(r.products).toHaveLength(1);
    expect(r.products[0]).toMatchObject({ developer: "Epic Systems Corporation", product_name: "EpicCare Ambulatory", status: "Active" });
    expect(r.total).toBe(1);
    expect(r.error).toBeUndefined();
  });

  it("puts the API error at the TOP level so collectUnavailable names the system", async () => {
    stubFetch({ message: "unauthorized" }, 401);
    const r = await chpl.enrichWithCHPL({ topic: "Oracle Cerner CHPL listing" });
    expect(r.products).toEqual([]);
    expect(r.error).toMatch(/CHPL API 401/);
    expect(r.error).toMatch(/CHPL_API_KEY/);
    const unavailable = collectUnavailable({ federalData: null, systemBlocks: [{ id: "onc_chpl", text: "", data: r }] });
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0].name).toBe("ONC CHPL");
    expect(unavailable[0].reason).toMatch(/CHPL API 401/);
  });

  it("never throws, even when fetch itself blows up or the search stub hands back the old nested shape", async () => {
    globalThis.fetch = async () => { throw new Error("socket hang up"); };
    const r = await chpl.enrichWithCHPL({ topic: "Meditech certified" });
    expect(r).toMatchObject({ products: [], error: "socket hang up" });
    // The old nested shape, as a stub of the search result: the formatter and
    // the flattener both survive it.
    const nested = { products: { products: [], error: "CHPL API 401" }, reason: "Ask MMT vendor lookup for: x" };
    expect(() => chpl.formatCHPLContext(nested)).not.toThrow();
    expect(chpl.productList(nested)).toEqual([]);
  });

  it("reads CHPL_API_KEY from the environment and falls back to ANONYMOUS", async () => {
    stubFetch({ results: [] });
    await chpl.searchCertifiedProducts({ keyword: "Epic", limit: 2 });
    expect(calls[0].headers["API-KEY"]).toBe("ANONYMOUS");
    process.env.CHPL_API_KEY = "  real-key-123 ";
    await chpl.searchCertifiedProducts({ keyword: "Epic", limit: 2 });
    expect(calls[1].headers["API-KEY"]).toBe("real-key-123");
    expect(calls[1].url).toContain("chpl.healthit.gov/rest/search/v3?");
    expect(calls[1].url).toContain("searchTerm=Epic");
  });
});

describe("formatCHPLContext", () => {
  it("returns '' for the old nested shape {products:{products:[]}} instead of crashing", () => {
    expect(chpl.formatCHPLContext({ products: { products: [] } })).toBe("");
    expect(chpl.formatCHPLContext({ products: { products: [], error: "CHPL API 401" }, reason: "lookup" })).toBe("");
  });

  it("returns '' unless products is a non-empty array", () => {
    expect(chpl.formatCHPLContext(null)).toBe("");
    expect(chpl.formatCHPLContext({ skipped: true })).toBe("");
    expect(chpl.formatCHPLContext({ products: [], error: "CHPL API 401", reason: "lookup" })).toBe("");
    expect(chpl.formatCHPLContext({ products: "not-a-list" })).toBe("");
  });

  it("renders the listings the model may cite, with the total", () => {
    const p = { chpl_id: "15.04.04.2891", developer: "Epic Systems Corporation", product_name: "EpicCare", version: "2022", edition: "2015", status: "Active", status_date: "2022-06-30", url: "https://chpl.healthit.gov/#/listing/10001" };
    const out = chpl.formatCHPLContext({ products: [p], total: 40, reason: "Ask MMT vendor lookup for: Epic" });
    expect(out).toContain("ONC CHPL CERTIFIED PRODUCT LISTINGS (1 of 40)");
    expect(out).toContain("Epic Systems Corporation / EpicCare");
    expect(out).toContain("https://chpl.healthit.gov/#/listing/10001");
    expect(out).not.toContain("—");
    // the old nested shape with real rows still renders (flattened)
    expect(chpl.formatCHPLContext({ products: { products: [p] } })).toContain("EpicCare");
  });

  it("keeps the ProposalPulse verdict for a verification claim, even with zero matches", () => {
    const out = chpl.formatCHPLContext({ verified: false, reason: "no certified product found under that vendor/product name", products: [] });
    expect(out).toContain("ONC CHPL CERTIFICATION CHECK: NOT VERIFIED");
    expect(out).toContain("no certified product found");
    const ok = chpl.formatCHPLContext({ verified: true, reason: "CHPL confirms 1 active certified product(s) match", products: [{ chpl_id: "x", developer: "d", product_name: "p", version: "1", edition: "2015", status: "Active", status_date: "", url: "https://chpl.healthit.gov/#/listing/1" }] });
    expect(ok).toContain("VERIFIED");
    expect(ok).toContain("Matched listings:");
  });
});

describe("searchCertifiedProducts", () => {
  it("resolves with an error (never rejects) on a non-2xx status", async () => {
    stubFetch({}, 503);
    const r = await chpl.searchCertifiedProducts({ keyword: "Epic" });
    expect(r).toEqual({ products: [], total: 0, error: "CHPL API 503" });
  });
});
