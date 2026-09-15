// Wire-level check of what the federal fan-out actually sends. On
// 2026-09-10 the question "Tell me all about data governence awards in the
// DHA" reached USASpending as keywords ["Tell about data governence awards"]
// and SAM.gov as q=<same>, scoped to all of DoD. These tests stub fetch and
// read the outbound request bodies, so "works as marketed" is asserted at
// the boundary the APIs see, not at the prompt.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

// The SAM.gov client's daily ledger and response cache live in a CommonJS
// singleton; every test gets a fresh store so one test's cache hit or 429
// cannot change what the next one sends to the wire.
const cjsRequire = createRequire(import.meta.url);
const fetchCache = cjsRequire("../../netlify/functions/lib/fetch-cache.js");
const samQuota = cjsRequire("../../netlify/functions/lib/sam-quota.js");
function freshStore() { const d = {}; return { async get(k) { return k in d ? d[k] : null; }, async setJSON(k, v) { d[k] = v; } }; }

const QUESTION = "Tell me all about data governence awards in the DHA";
let api;
let calls;
let realFetch;

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

// The page endpoint's real page_metadata (verified live 2026-09-14) is
// { page, hasNext, last_record_unique_id, last_record_sort_value }: there is
// NO total. The count endpoint answers { results: { contracts: N } }.
function makeFetch({ subtierResults = [], toptierResults = [], subtierStatus = 200, hasNext = false, count = null, countStatus = 200 } = {}) {
  return async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
    if (u.includes("api.usaspending.gov/api/v2/search/spending_by_award_count/")) {
      if (countStatus !== 200) return jsonRes({ detail: "down" }, countStatus);
      return jsonRes({ results: { contracts: count, grants: 0, idvs: 0, loans: 0, other: 0, direct_payments: 0 }, spending_level: "awards" });
    }
    if (u.includes("api.usaspending.gov/api/v2/search/spending_by_award/")) {
      const body = JSON.parse(opts.body);
      const tier = body.filters.agencies && body.filters.agencies[0] && body.filters.agencies[0].tier;
      if (tier === "subtier") {
        if (subtierStatus !== 200) return jsonRes({ detail: "bad agency" }, subtierStatus);
        return jsonRes({ results: subtierResults, page_metadata: { page: 1, hasNext } });
      }
      return jsonRes({ results: toptierResults, page_metadata: { page: 1, hasNext } });
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
beforeEach(() => { calls = []; delete process.env.SAM_DAILY_QUOTA; fetchCache._setStoreForTests(freshStore()); });

// Pinned so the request bodies below are byte-stable.
const TODAY = "2026-09-14";

describe("deriveKeywords", () => {
  it("never sends the sentence", () => {
    expect(api.deriveKeywords(QUESTION)).toBe("data governance");
    // MHS stays: it is the program prefix the question is about, and
    // "genesis" alone is a poor keyword (the registry strips only an
    // agency's own code acronym).
    expect(api.deriveKeywords("MHS GENESIS")).toBe("mhs genesis");
    expect(api.deriveKeywords("Community Care Network")).toBe("community care network");
    expect(api.deriveKeywords("")).toBe("");
  });
});

describe("enrichWithFederalData on the wire", () => {
  it("sends 'data governance' scoped to the Defense Health Agency subtier, then widens to DoD when the subtier is empty", async () => {
    globalThis.fetch = makeFetch({ subtierResults: [], toptierResults: [{ "Award ID": "HT001125F0001", "Recipient Name": "X", "Award Amount": 1, "Description": "DATA GOVERNANCE SUPPORT" }] });
    const out = await api.enrichWithFederalData({ topic: QUESTION, agency: "DHA" });
    const usa = calls.filter((c) => c.url.includes("spending_by_award/")).map((c) => c.body.filters);
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
    expect(calls.filter((c) => c.url.includes("spending_by_award/")).length).toBe(1);
    expect(out.usaspending_awards.awards[0].piid).toBe("DHA-1");
    expect(out.usaspending_awards.widened_from_subtier).toBeUndefined();
  });

  it("retries at toptier when USASpending rejects the subtier name (misnamed subtier can never blank an answer)", async () => {
    globalThis.fetch = makeFetch({ subtierStatus: 400, toptierResults: [{ "Award ID": "DOD-9", "Recipient Name": "Z", "Award Amount": 2, "Description": "x" }] });
    const out = await api.searchUSASpending({ keyword: "data governance", agency: "DHA" });
    const tiers = calls.filter((c) => c.url.includes("spending_by_award/")).map((c) => c.body.filters.agencies[0].tier);
    expect(tiers).toEqual(["subtier", "toptier"]);
    expect(out.awards[0].piid).toBe("DOD-9");
    expect(out.error).toBeUndefined();
  });

  it("relaxes the keyword when the full phrase returns nothing, and says which rung answered", async () => {
    // "remote patient monitoring outcomes" finds nothing; the ladder drops to
    // the most specific term rather than reporting no records.
    const question = "What does the published research say about remote patient monitoring outcomes in VA?";
    // Ask the module which rung is second rather than guessing it, so the
    // test proves relaxation happened without pinning the ranking heuristic.
    const { keywordLadder } = await import("../../netlify/functions/lib/query-terms.js");
    const ladder = keywordLadder(question);
    expect(ladder.length).toBeGreaterThan(1);
    const seen = [];
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("spending_by_award")) {
        const kw = (JSON.parse(opts.body).filters.keywords || [""])[0];
        seen.push(kw);
        if (kw === ladder[1]) {
          return jsonRes({ results: [{ "Award ID": "VA-77", "Recipient Name": "R", "Award Amount": 3, "Description": "remote monitoring" }] });
        }
        return jsonRes({ results: [] });
      }
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      return jsonRes({ results: [], count: 0 });
    };
    const out = await api.enrichWithFederalData({ topic: question, agency: "VA" });
    expect(seen[0]).toBe(ladder[0]);
    expect(seen).toContain(ladder[1]);
    expect(seen[0].split(" ").length).toBeGreaterThan(ladder[1].split(" ").length);
    expect(out.usaspending_awards.awards[0].piid).toBe("VA-77");
    expect(out.usaspending_awards.relaxed_keyword).toBe(ladder[1]);
    expect(out.usaspending_awards.original_keyword).toBe(ladder[0]);
    // bounded: never more than two keyword attempts, so the 8s fan-out
    // timeout in premium-assistant still holds
    expect(new Set(seen).size).toBeLessThanOrEqual(2);
  });

  it("an API error is not a miss: the ladder does not multiply a failure", async () => {
    const seen = [];
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      if (u.includes("spending_by_award")) {
        seen.push(JSON.parse(opts.body).filters.keywords);
        return jsonRes({ detail: "upstream down" }, 503);
      }
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [] });
      return jsonRes({ results: [], count: 0 });
    };
    const out = await api.enrichWithFederalData({ topic: "telehealth scheduling backlog", agency: "VA" });
    expect(seen.length).toBe(1);
    expect(out.usaspending_awards.error).toMatch(/503/);
  });

  it("scopes ANY agency, not just the hardcoded few: FDA gets its own subtier, department and Federal Register slug", async () => {
    globalThis.fetch = makeFetch({ subtierResults: [{ "Award ID": "FDA-1", "Recipient Name": "Q", "Award Amount": 9, "Description": "device software" }] });
    await api.enrichWithFederalData({ topic: "What FDA contracts are out for medical device software?", agency: "FDA" });

    const usa = calls.find((c) => c.url.includes("spending_by_award/")).body.filters;
    expect(usa.agencies).toEqual([{ type: "funding", tier: "subtier", name: "Food and Drug Administration" }]);
    expect(usa.keywords).toEqual(["medical device software"]);

    const sam = new URL(calls.find((c) => c.url.includes("api.sam.gov")).url).searchParams;
    expect(sam.get("deptname")).toBe("HEALTH AND HUMAN SERVICES, DEPARTMENT OF");
    expect(sam.get("q")).toBe("medical device software");

    const fr = new URL(calls.find((c) => c.url.includes("federalregister.gov")).url).searchParams;
    expect(fr.getAll("conditions[agencies][]")).toContain("food-and-drug-administration");

    // agency spending totals use the registry CGAC, not a five-entry map
    const totals = calls.find((c) => c.url.includes("agency/075"));
    expect(totals, "FDA spending totals should resolve to the HHS CGAC 075").toBeTruthy();
  });

  it("agencies without a subtier mapping go straight to toptier", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [] });
    await api.searchUSASpending({ keyword: "imaging", agency: "VA" });
    const tiers = calls.filter((c) => c.url.includes("spending_by_award/")).map((c) => c.body.filters.agencies[0].tier);
    expect(tiers).toEqual(["toptier"]);
  });
});

describe("SAM.gov daily quota and cache on the wire", () => {
  const samQuery = () => calls.filter((c) => c.url.includes("api.sam.gov"));

  it("the same query spends the quota once: the second subscriber is served from cache with no request", async () => {
    globalThis.fetch = makeFetch({});
    const a = await api.searchSAMOpportunities({ keyword: "data governance", agency: "DHA", limit: 15 });
    const b = await api.searchSAMOpportunities({ keyword: "data governance", agency: "DHA", limit: 15 });
    expect(a.cached).toBeUndefined();
    expect(b.cached).toBe(true);
    // 10-a-day key: ONE request per question (the secondary is skipped), and only for the FIRST call
    expect(samQuery().length).toBe(1);
    expect(a.secondary_skipped).toMatch(/one request per question/);
    expect((await samQuota.samQuotaState()).used).toBe(1);
  });

  it("on the 10-a-day key a question costs one SAM request; with SAM_DAILY_QUOTA=1000 the relaxed secondary may run (up to 2)", async () => {
    globalThis.fetch = makeFetch({});
    await api.searchSAMOpportunities({ keyword: "data governance", relaxKeyword: "governance", agency: "DHA", limit: 15 });
    expect(samQuery().length).toBe(1);
    expect((await samQuota.samQuotaState()).used).toBe(1);

    calls = [];
    fetchCache._setStoreForTests(freshStore());
    process.env.SAM_DAILY_QUOTA = "1000";
    const r = await api.searchSAMOpportunities({ keyword: "data governance", relaxKeyword: "governance", agency: "DHA", limit: 15 });
    expect(samQuery().length).toBe(2);
    expect(r.secondary_skipped).toBeUndefined();
    expect(new URL(samQuery()[1].url).searchParams.get("q")).toBe("governance");
    expect((await samQuota.samQuotaState()).used).toBe(2);
  });

  it("a 429 marks the day exhausted: the next question makes no SAM request and says why, and the fallback can run", async () => {
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("api.sam.gov")) return jsonRes({ code: "900804", message: "Message throttled out", nextAccessTime: "2026-Sep-14 00:00:00+0000 UTC" }, 429);
      return jsonRes({ results: [], count: 0, page_metadata: { total: 0 } });
    };
    const first = await api.searchSAMOpportunities({ keyword: "ambient scribe", agency: "DHA" });
    expect(first.rateLimited).toBe(true);
    expect(first.resetAt).toBe("2026-Sep-14 00:00:00+0000 UTC");
    const before = samQuery().length;
    const second = await api.searchSAMOpportunities({ keyword: "telehealth", agency: "VA" });
    expect(samQuery().length).toBe(before); // nothing went to the wire
    expect(second.rateLimited).toBe(true);
    expect(second.quotaGate).toBe("exhausted");
    expect(second.error).toContain("daily quota exhausted");
    expect(second.resetAt).toBe("2026-Sep-14 00:00:00+0000 UTC");
  });

  it("a scheduled caller is refused once the subscriber slice would be touched; a subscriber is not", async () => {
    globalThis.fetch = makeFetch({});
    // 10 a day, 6 kept for subscribers: after four are spent a cron gets nothing
    await samQuota.reserveSam(4);
    const cron = await api.searchSAMOpportunities({ keyword: "x", priority: "scheduled" });
    expect(cron.rateLimited).toBe(true);
    expect(cron.quotaGate).toBe("reserved_for_subscribers");
    expect(samQuery().length).toBe(0);
    const sub = await api.searchSAMOpportunities({ keyword: "x" });
    expect(sub.error).toBeUndefined();
    expect(samQuery().length).toBeGreaterThan(0);
  });

  it("USASpending rows link to the real award page and carry the description", async () => {
    globalThis.fetch = makeFetch({ subtierResults: [{ "Award ID": "HT001524F0063", "Recipient Name": "NEW TECH SOLUTIONS, INC.", "Award Amount": 286673, "Description": "IMMUTA SOFTWARE FOR DATA GOVERNANCE", generated_internal_id: "CONT_AWD_HT001524F0063_9700_NNG15SC82B_8000" }] });
    const out = await api.searchUSASpending({ keyword: "data governance", agency: "DHA" });
    expect(calls[0].body.fields).toContain("generated_internal_id");
    expect(out.awards[0].source_url).toBe("https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700_NNG15SC82B_8000");
    expect(out.awards[0].description).toBe("IMMUTA SOFTWARE FOR DATA GOVERNANCE");
    const ctx = api.formatFederalDataContext({ usaspending_awards: { awards: out.awards, total: 1 } });
    expect(ctx).toContain("IMMUTA SOFTWARE FOR DATA GOVERNANCE");
    expect(ctx).toContain("award $0.29M");
  });

  it("a Federal Register hit that does not carry the question's terms is dropped before the model sees it", async () => {
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("federalregister.gov")) return jsonRes({ results: [
        { title: "Renewal of Department of Defense Federal Advisory Committees; Defense Business Board", abstract: "charter renewal", document_number: "2026-11621", html_url: "https://www.federalregister.gov/d/2026-11621" },
        { title: "Defense Health Agency Data Governance Council Notice", abstract: "", document_number: "2026-99999", html_url: "https://www.federalregister.gov/d/2026-99999" },
      ], count: 2 });
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel></channel></rss>" };
      return jsonRes({ results: [], page_metadata: { total: 0 } });
    };
    const out = await api.enrichWithFederalData({ topic: QUESTION, agency: "DHA" });
    expect(out.federal_register.documents.map((d) => d.document_number)).toEqual(["2026-99999"]);
    expect(out.federal_register.filtered_out).toBe(1);
  });
});

describe("2026-09-14: rungs, per-call timeouts, windows, obligations, totals, set-asides, call budget", () => {
  const usaCalls = () => calls.filter((c) => c.url.includes("spending_by_award/")).map((c) => c.body.filters);
  const award = (id, amount, extra = {}) => ({ "Award ID": id, "Recipient Name": "R", "Award Amount": amount, "Description": "x", generated_internal_id: `CONT_AWD_${id}`, ...extra });

  it("rungs replace the derived ladder: the first USASpending body carries keywords ['T4NG2'], one rung per entry", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [] });
    await api.enrichWithFederalData({ topic: "T4NG2 T4NG 2 Transformation Twenty-One Total Technology Next Generation 2", agency: "VA", rungs: ["T4NG2", "T4NG 2"], today: TODAY });
    const filters = usaCalls();
    expect(filters[0].keywords).toEqual(["T4NG2"]);
    expect(filters[1].keywords).toEqual(["T4NG 2"]);
    expect(filters.length).toBe(2);
    // SAM.gov and the Federal Register get the bare canonical name too
    expect(new URL(calls.find((c) => c.url.includes("api.sam.gov")).url).searchParams.get("q")).toBe("T4NG2");
    expect(new URL(calls.find((c) => c.url.includes("federalregister.gov")).url).searchParams.get("conditions[term]")).toBe("T4NG2");
  });

  it("a SAM.gov stub that never resolves times out on its own: awards still arrive, only sam_opportunities carries error 'timeout'", async () => {
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("api.sam.gov")) return new Promise(() => {}); // never
      if (u.includes("spending_by_award")) {
        await new Promise((r) => setTimeout(r, 100));
        return jsonRes({ results: [award("VA-1", 1000)], page_metadata: { total: 1 } });
      }
      // a feed with one real item, so GAO answers (an empty feed is its own error)
      if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel><item><title>VA Telehealth Scheduling</title><link>https://www.gao.gov/products/gao-26-107001</link><pubDate>Mon, 01 Sep 2026 00:00:00 GMT</pubDate><description>scheduling</description></item></channel></rss>" };
      return jsonRes({ results: [], count: 0, page_metadata: { total: 0 } });
    };
    const started = Date.now();
    const out = await api.enrichWithFederalData({ topic: "telehealth scheduling", agency: "VA", today: TODAY });
    const elapsed = Date.now() - started;
    expect(out.usaspending_awards.awards[0].piid).toBe("VA-1");
    expect(out.sam_opportunities.error).toBe("timeout");
    expect(out.sam_opportunities.opportunities).toEqual([]);
    expect(out.federal_register.error).toBeUndefined();
    expect(out.gao_reports.error).toBeUndefined();
    expect(out.summary).toMatch(/timed out: sam_opportunities/);
    // bounded by the SAM timeout, not the 8s fan-out
    expect(elapsed).toBeGreaterThanOrEqual(api.TIMEOUTS_MS.sam - 50);
    expect(elapsed).toBeLessThan(api.TIMEOUTS_MS.awards);
  }, 15000);

  it("'How much has VA obligated to Oracle since FY2024?': phrase 'oracle', window from 2023-10-01, a recipient search and a pinned spending_over_time body", async () => {
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("spending_over_time")) {
        return jsonRes({ group: "fiscal_year", results: [
          { aggregated_amount: 888005560.9, time_period: { fiscal_year: "2024" } },
          { aggregated_amount: 1006448723.83, time_period: { fiscal_year: "2025" } },
          { aggregated_amount: 1624179010.54, time_period: { fiscal_year: "2026" } },
        ] });
      }
      if (u.includes("spending_by_award")) {
        const f = JSON.parse(opts.body).filters;
        if (f.recipient_search_text) return jsonRes({ results: [award("36C10B24D0001", 250000000, { "Recipient Name": "ORACLE AMERICA, INC." })], page_metadata: { total: 1 } });
        return jsonRes({ results: [], page_metadata: { total: 0 } });
      }
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel></channel></rss>" };
      return jsonRes({ results: [], count: 0, page_metadata: { total: 0 } });
    };
    const question = "How much has VA obligated to Oracle since FY2024?";
    const out = await api.enrichWithFederalData({ topic: question, agency: "VA", recipientName: "oracle", today: TODAY });

    // the keyword search: phrase without the year, window from the FY start
    const kw = usaCalls().find((f) => f.keywords);
    expect(kw.keywords).toEqual(["oracle"]);
    expect(kw.time_period).toEqual([{ start_date: "2023-10-01", end_date: TODAY }]);
    expect(out.window_start).toBe("2023-10-01");

    // the recipient search, same window
    const rs = usaCalls().find((f) => f.recipient_search_text);
    expect(rs.recipient_search_text).toEqual(["oracle"]);
    expect(rs.time_period).toEqual([{ start_date: "2023-10-01", end_date: TODAY }]);

    // the obligations-by-year call, body pinned to the shape verified live 2026-09-14
    const ot = calls.find((c) => c.url === "https://api.usaspending.gov/api/v2/search/spending_over_time/");
    expect(ot.body).toEqual({
      group: "fiscal_year",
      filters: {
        recipient_search_text: ["oracle"],
        award_type_codes: ["A", "B", "C", "D"],
        time_period: [{ start_date: "2023-10-01", end_date: TODAY }],
        agencies: [{ type: "funding", tier: "toptier", name: "Department of Veterans Affairs" }],
      },
    });
    expect(out.usaspending_recipient_obligations.years.map((y) => y.fiscal_year)).toEqual([2024, 2025, 2026]);
    expect(out.usaspending_recipient_obligations.total).toBeCloseTo(3518633295.27, 2);

    const ctx = api.formatFederalDataContext(out);
    // the recipient search matched a prime (ORACLE AMERICA), so the section renders
    expect(ctx).toContain('USASPENDING.GOV OBLIGATIONS BY FISCAL YEAR TO VENDORS WHOSE NAME CONTAINS "oracle"');
    expect(ctx).toContain('a vendor-name match only; this is NOT spending on the topic "oracle"');
    expect(ctx).toContain("- FY2024: $888.01M");
    expect(ctx).toContain("- FY2025: $1006.45M");
    expect(ctx).toContain("- FY2026: $1624.18M");
    expect(ctx).toContain("Total FY2024 to FY2026, computed in code: $3518.63M. Quote these figures; do not re-add them.");
    expect(ctx).toContain("funding department Department of Veterans Affairs");
  });

  it("the obligations call runs only when the question asks for money over time", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [] });
    const out = await api.enrichWithFederalData({ topic: "tell me about all GetWell awards", recipientName: "getwell", today: TODAY });
    expect(calls.some((c) => c.url.includes("spending_over_time"))).toBe(false);
    expect(out.usaspending_recipient_obligations.skipped).toMatch(/money over time/);
    // and the caller can force it
    calls = [];
    await api.enrichWithFederalData({ topic: "tell me about all GetWell awards", recipientName: "getwell", wantsObligations: true, today: TODAY });
    expect(calls.some((c) => c.url.includes("spending_over_time"))).toBe(true);
  });

  it("the totals line is computed in code for a fixture of three awards, for both award blocks", () => {
    const awards = [
      { piid: "A1", recipient: "X", award_amount: 1000000, obligated: 0, description: "one", source_url: "u1" },
      { piid: "A2", recipient: "Y", award_amount: 2500000, obligated: 0, description: "two", source_url: "u2" },
      { piid: "A3", recipient: "Z", award_amount: 250000, obligated: 0, description: "three", source_url: "u3" },
    ];
    const ctx = api.formatFederalDataContext({
      usaspending_awards: { awards, total: 42 },
      usaspending_recipient_awards: { name: "acme", awards: awards.slice(0, 2), total: 2 },
    });
    expect(ctx).toContain("Rows shown: 3 of 42 matching, largest award amounts first; sum of award amounts shown: $3.75M (award amount field, potential value as reported to FPDS). Quote these figures; do not re-add them.");
    expect(ctx).toContain("Rows shown: 2 of 2 matching, largest award amounts first; sum of award amounts shown: $3.50M (award amount field, potential value as reported to FPDS). Quote these figures; do not re-add them.");
    // no em dash anywhere in what the model reads
    expect(ctx).not.toMatch(/\u2014/);
  });

  it("set-aside wording becomes set_aside_type_codes on the award search and leaves the keyword", async () => {
    globalThis.fetch = makeFetch({ subtierResults: [award("DHA-SB", 5)] });
    const out = await api.enrichWithFederalData({ topic: "SDVOSB set-aside data governance awards in the DHA", agency: "DHA", today: TODAY });
    const f = usaCalls()[0];
    expect(f.keywords).toEqual(["data governance"]);
    expect(f.set_aside_type_codes).toEqual(["SDVOSBC", "SDVOSBS"]);
    expect(out.set_aside_codes).toEqual(["SDVOSBC", "SDVOSBS"]);
    expect(api.formatFederalDataContext(out)).toContain("set-aside codes SDVOSBC/SDVOSBS");
    // an explicit list from the caller wins
    calls = [];
    await api.enrichWithFederalData({ topic: "data governance", agency: "DHA", setAside: ["8A"], today: TODAY });
    expect(usaCalls()[0].set_aside_type_codes).toEqual(["8A"]);
    // no wording, no filter
    calls = [];
    await api.enrichWithFederalData({ topic: "data governance", agency: "DHA", today: TODAY });
    expect(usaCalls()[0].set_aside_type_codes).toBeUndefined();
  });

  it("spending_by_category runs only with a NAICS list, sends the registry's name-tier agency filter (never toptier_code), and caches 24h", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [] });
    await api.enrichWithFederalData({ topic: "data governance", agency: "DHA", today: TODAY });
    expect(calls.some((c) => c.url.includes("spending_by_category"))).toBe(false);

    calls = [];
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("spending_by_category")) return jsonRes({ results: [{ code: "541512", name: "Computer Systems Design Services", amount: 8551344722.79, count: 0 }] });
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel></channel></rss>" };
      return jsonRes({ results: [], count: 0, page_metadata: { total: 0 } });
    };
    const a = await api.enrichWithFederalData({ topic: "data governance", agency: "DHA", naics: ["541512"], today: TODAY });
    const cat = calls.find((c) => c.url.includes("spending_by_category"));
    expect(cat.body.filters.agencies).toEqual([{ type: "funding", tier: "toptier", name: "Department of Defense" }]);
    expect(JSON.stringify(cat.body)).not.toContain("toptier_code");
    expect(cat.body.filters.naics_codes).toEqual(["541512"]);
    expect(a.spending_categories.categories[0].naics).toBe("541512");
    expect(a.spending_categories.cached).toBeUndefined();

    calls = [];
    const b = await api.enrichWithFederalData({ topic: "data governance", agency: "DHA", naics: ["541512"], today: TODAY });
    expect(calls.some((c) => c.url.includes("spending_by_category"))).toBe(false);
    expect(b.spending_categories.cached).toBe(true);
    expect(b.spending_categories.categories[0].amount).toBe(8551344722.79);
  });

  it("a widening never consumes a rung: a sub-agency question that misses at both tiers still gets the relaxed keyword (2026-09-14 review)", async () => {
    // DHA subtier AND department empty on rung 0; rung 1 (the relaxed
    // keyword) answers at the department. Before the fix the widening was
    // charged against a 2-call cap and rung 1 never ran.
    const { keywordLadder } = await import("../../netlify/functions/lib/query-terms.js");
    const ladder = keywordLadder("remote patient monitoring outcomes");
    expect(ladder.length).toBeGreaterThan(1);
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("spending_by_award/")) {
        const f = JSON.parse(opts.body).filters;
        const kw = (f.keywords || [""])[0];
        if (kw === ladder[1] && f.agencies[0].tier === "toptier") return jsonRes({ results: [award("DOD-RELAXED", 7)], page_metadata: { page: 1, hasNext: false } });
        return jsonRes({ results: [], page_metadata: { page: 1, hasNext: false } });
      }
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel></channel></rss>" };
      return jsonRes({ results: [], count: 0 });
    };
    const out = await api.enrichWithFederalData({ topic: "remote patient monitoring outcomes", agency: "DHA", today: TODAY });
    const filters = usaCalls().filter((f) => !f.recipient_search_text);
    expect(filters.map((f) => [f.keywords[0], f.agencies[0].tier])).toEqual([
      [ladder[0], "subtier"], [ladder[0], "toptier"],
      [ladder[1], "subtier"], [ladder[1], "toptier"],
    ]);
    expect(out.usaspending_awards.awards[0].piid).toBe("DOD-RELAXED");
    expect(out.usaspending_awards.relaxed_keyword).toBe(ladder[1]);
    expect(out.usaspending_awards.widened_from_subtier).toBe(true);
    expect(out.award_rungs).toBe(2);
    expect(out.award_calls).toBe(4);
    expect(api.MAX_AWARD_CALLS).toBe(api.MAX_KEYWORD_ATTEMPTS * 2);
  });

  it("the ladder is still bounded: two rungs, each widened once, and never more than MAX_AWARD_CALLS requests", async () => {
    globalThis.fetch = makeFetch({ subtierResults: [], toptierResults: [] });
    const out = await api.enrichWithFederalData({ topic: "remote patient monitoring outcomes", agency: "DHA", today: TODAY });
    const filters = usaCalls().filter((f) => !f.recipient_search_text);
    expect(filters.length).toBe(api.MAX_AWARD_CALLS);
    expect(filters.map((f) => f.agencies[0].tier)).toEqual(["subtier", "toptier", "subtier", "toptier"]);
    expect(out.award_rungs).toBe(api.MAX_KEYWORD_ATTEMPTS);
    // a caller-supplied budget is still a ceiling: when a widening would exceed it, the subtier result stands
    calls = [];
    const budget = { used: 3, max: 4 };
    const r = await api.searchUSASpending({ keyword: "x", agency: "DHA", _budget: budget });
    expect(usaCalls().length).toBe(1);
    expect(r.widen_skipped).toMatch(/budget/);
    expect(r.widened_from_subtier).toBeUndefined();
  });

  it("an error on the widened call stops the ladder: rung 1 does not run after a 503 (an error is not a miss)", async () => {
    const seen = [];
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("spending_by_award/")) {
        const f = JSON.parse(opts.body).filters;
        seen.push(f.agencies[0].tier);
        if (f.agencies[0].tier === "toptier") return jsonRes({ detail: "upstream down" }, 503);
        return jsonRes({ results: [], page_metadata: { page: 1, hasNext: false } });
      }
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      return jsonRes({ results: [], count: 0 });
    };
    const out = await api.enrichWithFederalData({ topic: "remote patient monitoring outcomes", agency: "DHA", today: TODAY });
    expect(seen).toEqual(["subtier", "toptier"]);
    expect(out.usaspending_awards.error).toMatch(/503/);
  });
});

describe("vendor and product questions on the wire", () => {
  const usaCalls = () => calls.filter((c) => c.url.includes("spending_by_award/")).map((c) => c.body.filters);

  it("an unscoped question never sends an empty keyword (the twenty largest awards in government are not an answer)", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [] });
    const out = await api.enrichWithFederalData({ topic: "tell me about all GetWell awards" });
    const filters = usaCalls();
    expect(filters.length).toBe(1);
    expect(filters[0].keywords).toEqual(["getwell"]);
    expect(filters.some((f) => !f.keywords && !f.agencies)).toBe(false);
    expect(out.usaspending_awards.awards).toEqual([]);
  });

  it("with an agency the empty rung still runs, scoped (\"what has CDC awarded\" is a real query)", async () => {
    globalThis.fetch = makeFetch({ subtierResults: [] , toptierResults: [] });
    await api.enrichWithFederalData({ topic: "Show me CDC awards", agency: "CDC" });
    const filters = usaCalls();
    expect(filters.every((f) => Array.isArray(f.agencies) && f.agencies.length === 1)).toBe(true);
  });

  it("a candidate vendor name also runs a recipient search, and both kinds of award reach the model with their descriptions", async () => {
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("spending_by_award")) {
        const f = JSON.parse(opts.body).filters;
        if (f.recipient_search_text) {
          return jsonRes({ results: [{ "Award ID": "HT001425PE009", "Recipient Name": "GETWELLNETWORK INC", "Award Amount": 181540, "Description": "GETWELL NETWORK SOFTWARE FOR ATAMMC", "Awarding Sub Agency": "Defense Health Agency", generated_internal_id: "CONT_AWD_HT001425PE009_9700_-NONE-_-NONE-" }], page_metadata: { total: 1 } });
        }
        return jsonRes({ results: [
          { "Award ID": "36C10B23F0309", "Recipient Name": "THUNDERCAT TECHNOLOGY, LLC", "Award Amount": 12952798, "Description": "NASA SEWP ORDER FOR GETWELL NETWORK HARDWARE UPGRADE AND EXPANSION", "Awarding Sub Agency": "Department of Veterans Affairs", generated_internal_id: "CONT_AWD_36C10B23F0309_3600_NNG15SC03B_8000" },
          { "Award ID": "2043FY20C00001", "Recipient Name": "ALUTIIQ C&W SERVICES, LLC", "Award Amount": 20866412, "Description": "O&M SERVICES 5333 GETWELL MEMPHIS TN", "Awarding Sub Agency": "Internal Revenue Service", generated_internal_id: "CONT_AWD_2043FY20C00001_2050_-NONE-_-NONE-" },
        ], page_metadata: { total: 2 } });
      }
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel></channel></rss>" };
      return jsonRes({ results: [], count: 0, page_metadata: { total: 0 } });
    };
    const out = await api.enrichWithFederalData({ topic: "tell me about all GetWell awards", recipientName: "getwell" });
    const filters = usaCalls();
    expect(filters.find((f) => f.recipient_search_text)).toMatchObject({ recipient_search_text: ["getwell"] });
    expect(out.usaspending_recipient_awards.awards[0].recipient).toBe("GETWELLNETWORK INC");
    const ctx = api.formatFederalDataContext(out);
    expect(ctx).toContain("RECIPIENTS NAMED LIKE \"getwell\"");
    expect(ctx).toContain("NASA SEWP ORDER FOR GETWELL NETWORK");
    expect(ctx).toContain("5333 GETWELL MEMPHIS");
    expect(ctx).toContain("a keyword that only matches a street address");
    expect(ctx).toContain("https://www.usaspending.gov/award/CONT_AWD_HT001425PE009_9700_-NONE-_-NONE-");
  });
});

describe("2026-09-14 review: match counts, real award fields, topic-word obligations, set-aside subjects", () => {
  const usaCalls = () => calls.filter((c) => c.url.includes("spending_by_award/")).map((c) => c.body.filters);
  const countCalls = () => calls.filter((c) => c.url.includes("spending_by_award_count/"));
  const award = (id, amount, extra = {}) => ({ "Award ID": id, "Recipient Name": "R", "Award Amount": amount, "Description": "x", generated_internal_id: `CONT_AWD_${id}`, ...extra });
  const page = (n) => Array.from({ length: n }, (_, i) => award(`VA-${i + 1}`, (n - i) * 1e6));

  it("a full page asks the count endpoint with the SAME filters and prints that count, never the page length", async () => {
    // live shape: 20 rows, hasNext true, no total; count endpoint says 105 (telehealth at VA, 2026-09-14)
    globalThis.fetch = makeFetch({ toptierResults: page(20), hasNext: true, count: 105 });
    const out = await api.enrichWithFederalData({ topic: "telehealth", agency: "VA", today: TODAY });
    const pageCall = calls.find((c) => c.url.includes("spending_by_award/"));
    const countCall = countCalls()[0];
    expect(countCall, "count endpoint called").toBeTruthy();
    expect(countCall.body).toEqual({ filters: pageCall.body.filters, subawards: false });
    expect(out.usaspending_awards.total).toBe(105);
    expect(out.usaspending_awards.has_more).toBe(true);
    expect(out.usaspending_awards.total_exact).toBe(true);
    const ctx = api.formatFederalDataContext(out);
    expect(ctx).toContain("keyword matched in the description or recipient (105 matching)");
    expect(ctx).toContain("Rows shown: 10 of 105 matching, largest award amounts first;");
    expect(ctx).not.toMatch(/of 20 matching/);
    expect(out.summary).toContain("USASpending: 105 matching, top 20 returned");
  });

  it("a short page IS the count: no count call, 'N of N matching'", async () => {
    globalThis.fetch = makeFetch({ toptierResults: page(3), hasNext: false });
    const out = await api.enrichWithFederalData({ topic: "telehealth", agency: "VA", today: TODAY });
    expect(countCalls().length).toBe(0);
    expect(out.usaspending_awards.total).toBe(3);
    expect(out.usaspending_awards.has_more).toBe(false);
    expect(api.formatFederalDataContext(out)).toContain("Rows shown: 3 of 3 matching");
  });

  it("a full page whose count call fails is described, not numbered: 'more matches exist', never 'of 20 matching'", async () => {
    globalThis.fetch = makeFetch({ toptierResults: page(20), hasNext: true, countStatus: 503 });
    const out = await api.enrichWithFederalData({ topic: "telehealth", agency: "VA", today: TODAY });
    expect(out.usaspending_awards.total).toBe(null);
    expect(out.usaspending_awards.has_more).toBe(true);
    expect(out.usaspending_awards.total_exact).toBe(false);
    const ctx = api.formatFederalDataContext(out);
    expect(ctx).toContain("Rows shown: 10 of the top 20 by award amount (more matches exist beyond this page; the exact count was not available)");
    expect(ctx).not.toMatch(/of 20 matching/);
    expect(ctx).not.toMatch(/\d+ matching/);
    // the count endpoint is not a rung and not a widening
    expect(out.award_calls).toBe(1);
  });

  it("the recipient search counts the same way (a full page of 15 is not '15 matching')", async () => {
    globalThis.fetch = makeFetch({ toptierResults: page(15), hasNext: true, count: 58 });
    const out = await api.searchUSASpendingRecipients({ name: "oracle", agency: "VA", limit: 15, today: TODAY });
    expect(out.total).toBe(58);
    expect(countCalls()[0].body.filters.recipient_search_text).toEqual(["oracle"]);
    const ctx = api.formatFederalDataContext({ usaspending_recipient_awards: { ...out } });
    expect(ctx).toContain('RECIPIENTS NAMED LIKE "oracle" (58 matching;');
    expect(ctx).toContain("Rows shown: 10 of 58 matching");
  });

  it("asks USASpending only for fields the Contract Award mapping recognizes, and reads NAICS, PSC and Total Outlays from their real shape", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [award("36C79119F0004", 48075297.4, {
      "Total Outlays": 25133737.55,
      NAICS: { code: "561499", description: "ALL OTHER BUSINESS SUPPORT SERVICES" },
      PSC: { code: "R604", description: "SUPPORT- ADMINISTRATIVE: MAILING/DISTRIBUTION" },
      "Awarding Sub Agency": "Department of Veterans Affairs",
    })] });
    const out = await api.searchUSASpending({ keyword: "telehealth", agency: "VA", today: TODAY });
    const fields = calls[0].body.fields;
    for (const bogus of ["Type of Set Aside", "Total Obligated Amount", "NAICS Code", "NAICS Description"]) {
      expect(fields, `${bogus} is not a field the endpoint returns`).not.toContain(bogus);
    }
    expect(fields).toEqual(expect.arrayContaining(["NAICS", "PSC", "Total Outlays", "Award Amount", "Description", "generated_internal_id"]));
    const a = out.awards[0];
    expect(a.naics).toBe("561499");
    expect(a.naics_desc).toBe("ALL OTHER BUSINESS SUPPORT SERVICES");
    expect(a.psc).toBe("R604");
    expect(a.outlays).toBe(25133737.55);
    expect(a).not.toHaveProperty("set_aside");
    expect(a).not.toHaveProperty("obligated");
    const ctx = api.formatFederalDataContext({ usaspending_awards: { awards: out.awards, total: 1 } });
    expect(ctx).toContain("award $48.08M (outlays to date $25.13M) | Department of Veterans Affairs | NAICS 561499 | PSC R604 |");
  });

  it("a set-aside-filtered search never prints 'Set-aside: none' on its rows; the scope line states the filter, and a row with no outlays or NAICS prints neither", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [award("36C10B20N10020015", 197190000, { "Awarding Sub Agency": "Department of Veterans Affairs" })] });
    const out = await api.enrichWithFederalData({ topic: "What SDVOSB awards has the VA made under T4NG?", agency: "VA", today: TODAY });
    expect(usaCalls()[0].set_aside_type_codes).toEqual(["SDVOSBC", "SDVOSBS"]);
    const ctx = api.formatFederalDataContext(out);
    expect(ctx).toContain("set-aside codes SDVOSBC/SDVOSBS, applied as a filter; the rows below are all set-aside awards");
    expect(ctx).not.toContain("Set-aside: none");
    expect(ctx).not.toContain("NAICS n/a");
    expect(ctx).not.toContain("obligated to date");
    // no outlays, no NAICS: the row goes straight from the award amount to the office
    expect(ctx).toContain("award $197.19M | Department of Veterans Affairs | ");
  });

  it("'How much has VA spent on telehealth since FY2024?': all-zero obligation years for the topic word yield no OBLIGATIONS section and no '$0.00M obligated' summary", async () => {
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      // live shape 2026-09-14: spending_over_time answers a $0 row per year when no vendor carries the name
      if (u.includes("spending_over_time")) return jsonRes({ group: "fiscal_year", results: [
        { aggregated_amount: 0, time_period: { fiscal_year: "2024" } },
        { aggregated_amount: 0, time_period: { fiscal_year: "2025" } },
        { aggregated_amount: 0, time_period: { fiscal_year: "2026" } },
      ] });
      if (u.includes("spending_by_award/")) {
        const f = JSON.parse(opts.body).filters;
        if (f.recipient_search_text) return jsonRes({ results: [], page_metadata: { page: 1, hasNext: false } });
        return jsonRes({ results: [award("VA-TH-1", 5000000, { "Description": "TELEHEALTH SCHEDULING" })], page_metadata: { page: 1, hasNext: false } });
      }
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel></channel></rss>" };
      return jsonRes({ results: [], count: 0 });
    };
    const out = await api.enrichWithFederalData({ topic: "How much has VA spent on telehealth since FY2024?", agency: "VA", recipientName: "telehealth", wantsObligations: true, today: TODAY });
    expect(calls.some((c) => c.url.includes("spending_over_time"))).toBe(true);
    expect(out.usaspending_recipient_obligations.years).toEqual([]);
    expect(out.usaspending_recipient_obligations.total).toBe(0);
    expect(out.usaspending_recipient_obligations.skipped).toMatch(/no recipient matched/);
    expect(out.summary).not.toMatch(/obligated to "telehealth"/);
    expect(out.summary).not.toMatch(/\$0\.00M/);
    const ctx = api.formatFederalDataContext(out);
    expect(ctx).not.toContain("OBLIGATIONS BY FISCAL YEAR");
    expect(ctx).not.toContain("$0.00M");
    // the real keyword awards still reach the model
    expect(ctx).toContain("TELEHEALTH SCHEDULING");
  });

  it("obligations with money but no prime match ('cybersecurity' matched one vendor by name fragment in spending_over_time only) are not rendered either", () => {
    const ctx = api.formatFederalDataContext({
      usaspending_recipient_awards: { name: "cybersecurity", awards: [], total: 0 },
      usaspending_recipient_obligations: { name: "cybersecurity", since: "2023-10-01", until: TODAY, agency_scope: "Department of Veterans Affairs", years: [{ fiscal_year: 2026, obligated: 14800 }], total: 14800 },
    });
    expect(ctx).not.toContain("OBLIGATIONS BY FISCAL YEAR");
    expect(ctx).not.toContain("0.01M");
  });

  it("zero years are dropped from a real vendor's table, and the header says the match is by vendor name", async () => {
    globalThis.fetch = async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes("spending_over_time")) return jsonRes({ group: "fiscal_year", results: [
        { aggregated_amount: 0, time_period: { fiscal_year: "2024" } },
        { aggregated_amount: 1006448723.83, time_period: { fiscal_year: "2025" } },
        { aggregated_amount: 1624179010.54, time_period: { fiscal_year: "2026" } },
      ] });
      if (u.includes("spending_by_award/")) {
        const f = JSON.parse(opts.body).filters;
        if (f.recipient_search_text) return jsonRes({ results: [award("36C10B24D0001", 250000000, { "Recipient Name": "ORACLE AMERICA, INC." })], page_metadata: { page: 1, hasNext: false } });
        return jsonRes({ results: [], page_metadata: { page: 1, hasNext: false } });
      }
      if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
      if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel></channel></rss>" };
      return jsonRes({ results: [], count: 0 });
    };
    const out = await api.enrichWithFederalData({ topic: "How much has VA obligated to Oracle since FY2024?", agency: "VA", recipientName: "oracle", today: TODAY });
    expect(out.usaspending_recipient_obligations.years.map((y) => y.fiscal_year)).toEqual([2025, 2026]);
    const ctx = api.formatFederalDataContext(out);
    expect(ctx).toContain('OBLIGATIONS BY FISCAL YEAR TO VENDORS WHOSE NAME CONTAINS "oracle" (a vendor-name match only; this is NOT spending on the topic "oracle";');
    expect(ctx).toContain("years with no obligations are omitted");
    expect(ctx).not.toContain("- FY2024:");
    expect(ctx).toContain("Total FY2025 to FY2026, computed in code: $2630.63M.");
    expect(out.summary).toContain('$2630.63M obligated to "oracle" across 2 fiscal years');
  });

  it("'What is VA's small business goal?': the set-aside wording is the subject, so SAM.gov and the Federal Register receive it and USASpending still gets the codes", async () => {
    globalThis.fetch = makeFetch({ toptierResults: [] });
    const out = await api.enrichWithFederalData({ topic: "What is VA's small business goal?", agency: "VA", today: TODAY });
    expect(new URL(calls.find((c) => c.url.includes("api.sam.gov")).url).searchParams.get("q")).toBe("small business goal");
    expect(new URL(calls.find((c) => c.url.includes("federalregister.gov")).url).searchParams.get("conditions[term]")).toBe("small business goal");
    expect(usaCalls()[0].keywords).toEqual(["small business goal"]);
    expect(usaCalls()[0].set_aside_type_codes.length).toBe(14);
    expect(out.set_aside_codes.length).toBe(14);
  });
});

// Measured live 2026-09-15: every Army question ("Who are the incumbents on
// ITES-3H?") asked /agency/021/budgetary_resources/ and got 404 on every
// turn (539ms and 992ms in production, up to 18s from curl), because
// USASpending has no Army, Navy or Air Force toptier. Bodies below are the
// live responses from that day, trimmed to the fields the reader uses.
describe("agency spending totals: the code USASpending's agency endpoint accepts", () => {
  const ARMY_404 = { detail: "Agency with a toptier code of '021' does not exist" };
  const DOD_FY2026 = { toptier_code: "097", agency_data_by_year: [{ fiscal_year: 2026, agency_budgetary_resources: 2631408222827.34, agency_total_obligated: 1363585241420.8, agency_total_outlayed: 1212232405414.67, total_budgetary_resources: 15495311418794.12 }] };
  // The toptier codes /agency/<code>/budgetary_resources/ answered 200 for on
  // 2026-09-15; 021, 017 and 057 answered 404 and are absent from
  // /references/toptier_agencies/.
  const ACCEPTED_2026_09_15 = ["097", "075", "036", "070", "047", "080", "028"];

  const budgetCalls = () => calls.filter((c) => c.url.includes("/budgetary_resources/"));
  function totalsFetch(onBudget) {
    const base = makeFetch({ toptierResults: [] });
    return async (url, opts = {}) => {
      const u = String(url);
      if (!u.includes("/budgetary_resources/")) return base(url, opts);
      calls.push({ url: u, body: null });
      return onBudget(u);
    };
  }

  it("every registry agency resolves to a toptier code the endpoint accepted, and the military departments resolve to DoD 097", async () => {
    const reg = cjsRequire("../../netlify/functions/lib/federal-agencies.js");
    for (const a of reg.AGENCIES) {
      expect(ACCEPTED_2026_09_15, `${a.code} -> ${reg.usaspendingToptierCode(a.code)}`).toContain(reg.usaspendingToptierCode(a.code));
    }
    for (const code of ["Army", "Navy", "AirForce"]) expect(reg.usaspendingToptierCode(code)).toBe("097");
    // The agency's own CGAC is unchanged: SAM.gov assistance and
    // Regulations.gov read it, and they do know the Army.
    expect(reg.agencyCgac("Army")).toBe("021");
    expect(reg.agencyCgac("Navy")).toBe("017");
    expect(reg.agencyCgac("AirForce")).toBe("057");
  });

  it("'Who are the incumbents on ITES-3H?' asks for DoD 097, never 021, and the block says it is the whole department", async () => {
    globalThis.fetch = totalsFetch((u) => (u.includes("/agency/097/") ? jsonRes(DOD_FY2026) : jsonRes(ARMY_404, 404)));
    const out = await api.enrichWithFederalData({ topic: "Who are the incumbents on ITES-3H?", agency: "Army", today: TODAY });
    expect(budgetCalls().map((c) => new URL(c.url).pathname)).toEqual(["/api/v2/agency/097/budgetary_resources/"]);
    expect(out.agency_spending.error).toBeUndefined();
    expect(out.agency_spending.spending).toMatchObject({ agency_code: "097", agency_name: "Department of Defense", fiscal_year: 2026, obligated: 1363585241420.8 });
    const ctx = api.formatFederalDataContext(out);
    expect(ctx).toContain("DEPARTMENT-LEVEL SPENDING TOTALS for Department of Defense (CGAC 097), FY2026 to date");
    expect(ctx).toContain("(the whole department, not the sub-agency asked about)");
    expect(ctx).toContain("- Obligated: $1363.6B");
    expect(ctx).not.toContain("CGAC 021");
  });

  it("a 404 'does not exist' is a permanent skip, not an error, not a timeout, and the code is never requested again", async () => {
    globalThis.fetch = totalsFetch(() => jsonRes(ARMY_404, 404));
    const first = await api.getAgencySpendingTotals({ agency_code: "021", fiscal_year: 2026 });
    expect(first).toEqual({ spending: null, skipped: "CGAC 021 is not a USASpending toptier agency" });
    expect(first.error).toBeUndefined();
    const second = await api.getAgencySpendingTotals({ agency_code: "021", fiscal_year: 2026 });
    expect(second).toEqual(first);
    expect(budgetCalls().length).toBe(1);

    const pa = cjsRequire("../../netlify/functions/lib/premium-assistant.js");
    const unavailable = pa.collectUnavailable({ federalData: { usaspending_awards: { awards: [], total: 0 }, agency_spending: second }, systemBlocks: [] });
    expect(unavailable).toEqual([]);
  });

  it("any other failure stays an error and is not remembered: a 503, or a 404 without the does-not-exist detail", async () => {
    let status = 503;
    globalThis.fetch = totalsFetch(() => (status === 503 ? jsonRes({ detail: "Service Unavailable" }, 503) : jsonRes({ detail: "Not Found" }, 404)));
    expect(await api.getAgencySpendingTotals({ agency_code: "097", fiscal_year: 2026 })).toEqual({ spending: null, error: "USASpending Agency API 503" });
    status = 404;
    expect(await api.getAgencySpendingTotals({ agency_code: "097", fiscal_year: 2026 })).toEqual({ spending: null, error: "USASpending Agency API 404" });
    expect(budgetCalls().length).toBe(2);
  });
});
