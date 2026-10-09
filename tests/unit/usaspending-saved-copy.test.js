// USASpending saved copies (2026-09-15). Cold USASpending queries ran 3s to
// 40s+ that day; Ask MMT's award search gets 7s, and a late answer used to be
// thrown away, so three of five subscriber turns showed "USASpending.gov:
// timeout" and "try again" failed the same way. These tests pin what
// replaced that: a same-day repeat makes no request, a late answer is saved
// when it lands, a failed live query is answered from the last good copy of
// the SAME query with its date on it, an error is never saved as an answer,
// and the nightly warm fills the exact keys a subscriber's question reads
// without ever calling SAM.gov.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
const fetchCache = cjsRequire("../../netlify/functions/lib/fetch-cache.js");
function freshStore() { const d = {}; return { async get(k) { return k in d ? d[k] : null; }, async setJSON(k, v) { d[k] = v; } }; }

const DAY1 = "2026-09-14";
const DAY2 = "2026-09-15";
let api;
let assistant;
let prewarm;
let realFetch;
let calls;

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
const T4NG2_ROW = {
  "Award ID": "36C10B24N0001", "Recipient Name": "GOVCIO LLC", "Award Amount": 5000000, "Description": "T4NG2 TASK ORDER",
  "Start Date": "2026-03-20", "End Date": "2027-03-19", "Awarding Agency": "Department of Veterans Affairs",
  generated_internal_id: "CONT_AWD_36C10B24N0001_3600",
};

// awards and totals: "ok" answers, "503" fails, "hang" never answers.
function stubFetch({ awards = "ok", totals = "ok" } = {}) {
  return async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
    if (u.includes("spending_by_award/")) {
      if (awards === "hang") return new Promise(() => {});
      if (awards === "503") return jsonRes({ detail: "upstream" }, 503);
      return jsonRes({ results: [T4NG2_ROW], page_metadata: { page: 1, hasNext: false } });
    }
    if (u.includes("budgetary_resources") && totals === "hang") return new Promise(() => {});
    if (u.includes("budgetary_resources")) return jsonRes({ agency_data_by_year: [{ fiscal_year: 2026, agency_budgetary_resources: 1e9, agency_total_obligated: 5e8, agency_total_outlayed: 4e8 }] });
    if (u.includes("api.sam.gov")) return jsonRes({ opportunitiesData: [], totalRecords: 0 });
    if (u.includes("gao.gov")) return { ok: true, status: 200, text: async () => "<rss><channel></channel></rss>" };
    return jsonRes({ results: [], count: 0 });
  };
}
const awardCalls = () => calls.filter((c) => c.url.includes("spending_by_award/"));

beforeAll(async () => {
  process.env.SAM_GOV_API_KEY = "test-sam-key";
  realFetch = globalThis.fetch;
  api = await import("../../netlify/functions/lib/federal-data-apis.js");
  assistant = await import("../../netlify/functions/lib/premium-assistant.js");
  prewarm = await import("../../netlify/functions/usaspending-prewarm-background.js");
});
afterAll(() => { globalThis.fetch = realFetch; delete process.env.SAM_GOV_API_KEY; });
beforeEach(() => { calls = []; fetchCache._setStoreForTests(freshStore()); });

const QUESTION = "Who are the incumbents on T4NG2?";
const argsFor = (question, today) => ({ ...assistant.federalQueryFor(question).federalArgs, today });

describe("usaGuarded", () => {
  it("a same-day repeat of the same query is served from the saved copy with no request", async () => {
    globalThis.fetch = stubFetch();
    const first = await api.enrichWithFederalData(argsFor(QUESTION, DAY2));
    expect(first.usaspending_awards.awards[0].piid).toBe("36C10B24N0001");
    expect(awardCalls().length).toBe(1);
    calls = [];
    const again = await api.enrichWithFederalData(argsFor(QUESTION, DAY2));
    expect(again.usaspending_awards.cached).toBe(true);
    expect(again.usaspending_awards.awards[0].piid).toBe("36C10B24N0001");
    expect(awardCalls().length).toBe(0);
  });

  it("a live answer that lands after the bound gave up is still saved, so the retry is warm", async () => {
    let release;
    const late = new Promise((r) => { release = r; });
    const run = async () => { await late; return { awards: [{ piid: "LATE-1" }], total: 1 }; };
    const out = await api.usaGuarded("awards", ["late"], run, { ms: 30, emptyShape: { awards: [], total: 0 }, today: DAY2 });
    expect(out.error).toBe("timeout");
    release();
    await new Promise((r) => setTimeout(r, 20));
    let ran = false;
    const retry = await api.usaGuarded("awards", ["late"], async () => { ran = true; return { awards: [], total: 0 }; }, { ms: 30, emptyShape: { awards: [], total: 0 }, today: DAY2 });
    expect(ran).toBe(false);
    expect(retry.cached).toBe(true);
    expect(retry.awards[0].piid).toBe("LATE-1");
  });

  it("a timeout the next day is answered from the last good copy, marked stale with the day it was fetched", async () => {
    await api.usaGuarded("awards", ["q"], async () => ({ awards: [{ piid: "A-1" }], total: 1 }), { ms: 500, emptyShape: { awards: [], total: 0 }, today: DAY1 });
    const out = await api.usaGuarded("awards", ["q"], () => new Promise(() => {}), { ms: 30, emptyShape: { awards: [], total: 0 }, today: DAY2 });
    expect(out.error).toBeUndefined();
    expect(out.stale).toBe(true);
    expect(out.fetched_on).toBe(DAY1);
    expect(out.live_error).toBe("timeout");
    expect(out.awards[0].piid).toBe("A-1");
  });

  it("an error is never saved as an answer, and with no earlier copy the error reaches the caller", async () => {
    const out = await api.usaGuarded("awards", ["e"], async () => ({ awards: [], total: 0, error: "USASpending API 503" }), { ms: 500, emptyShape: { awards: [], total: 0 }, today: DAY2 });
    expect(out.error).toBe("USASpending API 503");
    let ran = false;
    await api.usaGuarded("awards", ["e"], async () => { ran = true; return { awards: [], total: 0 }; }, { ms: 500, emptyShape: { awards: [], total: 0 }, today: DAY2 });
    expect(ran).toBe(true);
  });

  it("a different query never reads another query's copy", async () => {
    await api.usaGuarded("awards", ["one"], async () => ({ awards: [{ piid: "ONE" }], total: 1 }), { ms: 500, emptyShape: { awards: [], total: 0 }, today: DAY1 });
    const out = await api.usaGuarded("awards", ["two"], () => new Promise(() => {}), { ms: 30, emptyShape: { awards: [], total: 0 }, today: DAY2 });
    expect(out.error).toBe("timeout");
    expect(out.stale).toBeUndefined();
  });
});

describe("the fan-out with a saved copy", () => {
  it("USASpending down on day 2: the rows from day 1 reach the model with their date, and the subscriber sees why", async () => {
    globalThis.fetch = stubFetch();
    await api.enrichWithFederalData(argsFor(QUESTION, DAY1));
    globalThis.fetch = stubFetch({ awards: "503" });
    const out = await api.enrichWithFederalData(argsFor(QUESTION, DAY2));
    expect(out.usaspending_awards.stale).toBe(true);
    expect(out.usaspending_awards.fetched_on).toBe(DAY1);
    expect(out.summary).toMatch(/served saved copy: usaspending_awards from 2026-09-14/);

    const ctx = api.formatFederalDataContext(out);
    expect(ctx).toContain("36C10B24N0001");
    expect(ctx).toContain("SAVED COPY: USASpending did not answer this query live this turn (USASpending API 503");
    expect(ctx).toContain("fetched 2026-09-14");

    const unavailable = assistant.collectUnavailable({ federalData: out, systemBlocks: [] });
    const usa = unavailable.find((u) => u.id === "usaspending");
    expect(usa).toBeTruthy();
    expect(usa.reason).toMatch(/answered from results saved 2026-09-14$/);
  });

  it("with no saved copy a failed live query is still reported as not reached, never as no awards", async () => {
    globalThis.fetch = stubFetch({ awards: "503" });
    const out = await api.enrichWithFederalData(argsFor(QUESTION, DAY2));
    expect(out.usaspending_awards.error).toMatch(/503/);
    expect(api.formatFederalDataContext(out)).not.toContain("SAVED COPY");
    expect(assistant.collectUnavailable({ federalData: out, systemBlocks: [] }).map((u) => u.id)).toContain("usaspending");
  });
});

describe("nightly warm", () => {
  it("warming the vehicle fills the exact keys a subscriber's question reads: the question then makes no award request", async () => {
    globalThis.fetch = stubFetch();
    const status = await api.warmUSASpending(argsFor("T4NG2", DAY2), { ms: 1000 });
    expect(status.awards).toBe("fetched");
    calls = [];
    const out = await api.enrichWithFederalData(argsFor(QUESTION, DAY2));
    expect(out.usaspending_awards.cached).toBe(true);
    expect(awardCalls().length).toBe(0);
    expect(calls.some((c) => c.url.includes("budgetary_resources"))).toBe(false);
  });

  it("warms every known vehicle without one SAM.gov request, and a double-fired tick sends nothing to USASpending", async () => {
    globalThis.fetch = stubFetch();
    const queryFor = (q) => ({ federalArgs: { ...assistant.federalQueryFor(q).federalArgs, today: DAY2 } });
    const first = await prewarm.warmAll({ queryFor, ms: 1000 });
    expect(first.queries).toBeGreaterThan(10);
    expect(first.failed).toBe(0);
    expect(calls.some((c) => c.url.includes("api.sam.gov"))).toBe(false);
    expect(awardCalls().length).toBeGreaterThan(0);
    calls = [];
    const second = await prewarm.warmAll({ queryFor, ms: 1000 });
    expect(second.results.every((r) => r.awards === "cached")).toBe(true);
    expect(calls.filter((c) => c.url.includes("usaspending.gov")).length).toBe(0);
  });

  it("a vehicle whose warm times out is counted as not warmed", async () => {
    globalThis.fetch = stubFetch({ awards: "hang" });
    const queryFor = (q) => ({ federalArgs: { ...assistant.federalQueryFor(q).federalArgs, today: DAY2 } });
    const out = await prewarm.warmAll({ questions: ["T4NG2"], queryFor, ms: 30 });
    expect(out.failed).toBe(1);
    expect(out.results[0].awards).toBe("error (timeout)");
  });
});

// Department totals (2026-09-15): the live call gets 3s, and USASpending
// answered the same DoD request in 0.5s, 9.9s and 2.6s back to back. The
// vehicle warm reached only departments a known vehicle belongs to, so DHS
// and SSA totals were cold on every first ask of the day.
describe("nightly warm of every department's totals", () => {
  const reg = cjsRequire("../../netlify/functions/lib/federal-agencies.js");
  const budgetCalls = () => calls.filter((c) => c.url.includes("budgetary_resources"));
  const queryFor = (q) => ({ federalArgs: { ...assistant.federalQueryFor(q).federalArgs, today: DAY2 } });
  const warmOnDay2 = (agency, opts) => api.warmAgencyTotals(agency, { ...opts, today: DAY2 });

  it("covers each toptier code in the registry exactly once", () => {
    const codes = reg.usaspendingDepartments().map((a) => reg.usaspendingToptierCode(a));
    expect(codes.sort()).toEqual(["028", "036", "047", "070", "075", "080", "097"]);
  });

  it("after the vehicles, only DHS and SSA cost a request, and then a DHS or SSA question is answered from the saved copy while USASpending hangs", async () => {
    globalThis.fetch = stubFetch();
    await prewarm.warmAll({ queryFor, ms: 1000 });
    calls = [];
    const totals = await prewarm.warmTotals({ warm: warmOnDay2, ms: 1000 });
    expect(totals.failed).toBe(0);
    expect(budgetCalls().map((c) => new URL(c.url).pathname).sort()).toEqual(["/api/v2/agency/028/budgetary_resources/", "/api/v2/agency/070/budgetary_resources/"]);
    expect(totals.results.filter((r) => r.agency_totals === "cached").map((r) => r.code).sort()).toEqual(["036", "047", "075", "080", "097"]);

    globalThis.fetch = stubFetch({ totals: "hang" });
    calls = [];
    for (const [question, code] of [["How much has DHS obligated this year?", "070"], ["What is SSA spending on disability case processing?", "028"]]) {
      const out = await api.enrichWithFederalData(argsFor(question, DAY2));
      expect(out.agency_spending.cached, question).toBe(true);
      expect(out.agency_spending.spending.agency_code).toBe(code);
    }
    expect(budgetCalls().length).toBe(0);
  });

  it("the nightly tick runs the department pass after the vehicles; a handoff tick does not", async () => {
    const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
    try {
      globalThis.fetch = stubFetch();
      const nightly = JSON.parse((await prewarm.handler({ body: JSON.stringify({ triggered_by: "schedule" }) })).body);
      expect(nightly).toMatchObject({ mode: "nightly", failed: 0 });
      const codes = new Set(budgetCalls().map((c) => new URL(c.url).pathname.split("/")[4]));
      expect([...codes].sort()).toEqual(["028", "036", "047", "070", "075", "080", "097"]);
      calls = [];
      fetchCache._setStoreForTests(freshStore());
      await prewarm.handler({ body: JSON.stringify({ questions: ["Who are the incumbents on T4NG2?"] }) });
      expect([...new Set(budgetCalls().map((c) => new URL(c.url).pathname.split("/")[4]))]).toEqual(["036"]);
    } finally {
      if (saved.url !== undefined) process.env.SUPABASE_URL = saved.url;
      if (saved.key !== undefined) process.env.SUPABASE_SERVICE_KEY = saved.key;
    }
  });

  it("a department whose totals do not warm is counted, so a failed night reaches ops_events", async () => {
    globalThis.fetch = stubFetch({ totals: "hang" });
    const out = await prewarm.warmTotals({ departments: ["DHS"], warm: warmOnDay2, ms: 30 });
    expect(out).toMatchObject({ departments: 1, failed: 1 });
    expect(out.results[0]).toEqual({ agency: "DHS", code: "070", agency_totals: "error (timeout)" });
  });
});

describe("handoff of a slow award search", () => {
  const handoff = cjsRequire("../../netlify/functions/lib/usaspending-handoff.js");
  const res202 = { status: 202 };

  it("hands off only a timeout: a 503 is not slowness, and an answer needs nothing", () => {
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [], error: "timeout" } })).toBe(true);
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [{}], stale: true, live_error: "timeout" } })).toBe(true);
    expect(handoff.needsHandoff({ error: "timeout-8s" })).toBe(true);
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [], error: "USASpending API 503" } })).toBe(false);
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [{}], total: 1 } })).toBe(false);
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [{}], cached: true } })).toBe(false);
    // the department totals call: its timeout hands off too, unless the award
    // search failed outright (the worker would retry that failure)
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [{}], total: 1 }, agency_spending: { spending: null, error: "timeout", timeout_ms: 3000 } })).toBe(true);
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [{}], cached: true }, agency_spending: { spending: {}, stale: true, live_error: "timeout" } })).toBe(true);
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [], error: "USASpending API 503" }, agency_spending: { spending: null, error: "timeout" } })).toBe(false);
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [{}], total: 1 }, agency_spending: { spending: null, error: "USASpending Agency API 503" } })).toBe(false);
    expect(handoff.needsHandoff({ usaspending_awards: { awards: [{}], total: 1 }, agency_spending: { spending: null, skipped: "CGAC 021 is not a USASpending toptier agency" } })).toBe(false);
  });

  it("POSTs the question to the background worker and reports whether it was accepted (202)", async () => {
    const sent = [];
    const ok = await handoff.handOffSlowUSASpending("Who are the incumbents on DHITSC?", { usaspending_awards: { error: "timeout" } }, {
      siteUrl: "https://example.test", fetchImpl: async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); return res202; },
    });
    expect(ok).toBe(true);
    expect(sent).toEqual([{ url: "https://example.test/.netlify/functions/usaspending-prewarm-background", body: { questions: ["Who are the incumbents on DHITSC?"] } }]);
    const refused = await handoff.handOffSlowUSASpending("q?", { usaspending_awards: { error: "timeout" } }, { siteUrl: "https://example.test", fetchImpl: async () => ({ status: 404 }) });
    expect(refused).toBe(false);
  });

  it("only a deployed Lambda has a site to hand off to: netlify dev:exec's URL alone (the eval, local scripts) is not one", () => {
    expect(handoff.deployedSiteUrl({ URL: "https://missionmeetstech.com" })).toBe("");
    expect(handoff.deployedSiteUrl({ URL: "https://missionmeetstech.com", AWS_LAMBDA_FUNCTION_NAME: "premium-chat" })).toBe("https://missionmeetstech.com");
  });

  it("sends nothing without a site URL or when nothing timed out, and never throws", async () => {
    let n = 0;
    const count = async () => { n += 1; return res202; };
    expect(await handoff.handOffSlowUSASpending("q", { usaspending_awards: { error: "timeout" } }, { siteUrl: "", fetchImpl: count })).toBe(false);
    expect(await handoff.handOffSlowUSASpending("q", { usaspending_awards: { awards: [{}] } }, { siteUrl: "https://example.test", fetchImpl: count })).toBe(false);
    expect(n).toBe(0);
    expect(await handoff.handOffSlowUSASpending("q", { usaspending_awards: { error: "timeout" } }, { siteUrl: "https://example.test", fetchImpl: async () => { throw new Error("down"); } })).toBe(false);
  });

  it("the subscriber is told to ask again only when the handoff was accepted", () => {
    const federalData = { usaspending_awards: { awards: [], total: 0, error: "timeout" } };
    const accepted = assistant.collectUnavailable({ federalData, systemBlocks: [], handedOff: true }).find((u) => u.id === "usaspending");
    expect(accepted.reason).toBe("timeout; still running, ask again in a minute or two");
    const notAccepted = assistant.collectUnavailable({ federalData, systemBlocks: [] }).find((u) => u.id === "usaspending");
    expect(notAccepted.reason).toBe("timeout");
  });

  it("the worker reads at most three non-empty questions from the handoff body; no body is the nightly vehicle warm", () => {
    expect(prewarm.handoffQuestions({ body: JSON.stringify({ questions: ["Who holds DHITSC?", "", 5, "a", "q2?", "q3?", "q4?"] }) })).toEqual(["Who holds DHITSC?", "q2?", "q3?"]);
    expect(prewarm.handoffQuestions({ body: JSON.stringify({ triggered_by: "schedule" }) })).toEqual([]);
    expect(prewarm.handoffQuestions({ body: "not json" })).toEqual([]);
    expect(prewarm.handoffQuestions({})).toEqual([]);
  });
});
