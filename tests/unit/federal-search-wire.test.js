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

    const usa = calls.find((c) => c.url.includes("spending_by_award")).body.filters;
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
    const tiers = calls.filter((c) => c.url.includes("spending_by_award")).map((c) => c.body.filters.agencies[0].tier);
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
  const usaCalls = () => calls.filter((c) => c.url.includes("spending_by_award")).map((c) => c.body.filters);
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
    expect(ctx).toContain('USASPENDING.GOV OBLIGATIONS BY FISCAL YEAR TO RECIPIENTS NAMED LIKE "oracle"');
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
    expect(ctx).toContain("Rows shown: 3 of 42 matching; sum of award amounts shown: $3.75M (award amount field, potential value as reported to FPDS). Quote these figures; do not re-add them.");
    expect(ctx).toContain("Rows shown: 2 of 2 matching; sum of award amounts shown: $3.50M (award amount field, potential value as reported to FPDS). Quote these figures; do not re-add them.");
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

  it("hard cap: two spending_by_award calls per question for the ladder, a widening retry included", async () => {
    // DHA subtier empty on every rung: rung 0 subtier + widening = 2 calls, so rung 1 never runs
    globalThis.fetch = makeFetch({ subtierResults: [], toptierResults: [] });
    const out = await api.enrichWithFederalData({ topic: "remote patient monitoring outcomes", agency: "DHA", today: TODAY });
    const filters = usaCalls().filter((f) => !f.recipient_search_text);
    expect(filters.length).toBe(api.MAX_AWARD_CALLS);
    expect(filters.map((f) => f.agencies[0].tier)).toEqual(["subtier", "toptier"]);
    expect(out.award_calls).toBe(2);
    // and when a widening would be the third call, the subtier result stands
    calls = [];
    const budget = { used: 1, max: 2 };
    const r = await api.searchUSASpending({ keyword: "x", agency: "DHA", _budget: budget });
    expect(usaCalls().length).toBe(1);
    expect(r.widen_skipped).toMatch(/budget/);
    expect(r.widened_from_subtier).toBeUndefined();
  });
});

describe("vendor and product questions on the wire", () => {
  const usaCalls = () => calls.filter((c) => c.url.includes("spending_by_award")).map((c) => c.body.filters);

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
