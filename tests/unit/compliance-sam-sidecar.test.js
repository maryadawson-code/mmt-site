// The Compliance Check SAM.gov sidecar looks a solicitation number up and
// cites what it finds. On 2026-09-30 a probe for HT940226R0001 (a DHA
// solicitation) came back citing a Navy research vessel, an Army CSO and a
// VA audiology buy: the lookup went out as the free-text `q` parameter,
// which the v2 search ignores (q=zzzzqqqxx returned 25,911 notices), so the
// sidecar reported the newest DoD notices as matches. These tests pin the
// wire: a number lookup goes out as `solnum`, costs one request, and only a
// notice carrying that number can be cited.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
const fetchCache = cjsRequire("../../netlify/functions/lib/fetch-cache.js");
function freshStore() { const d = {}; return { async get(k) { return k in d ? d[k] : null; }, async setJSON(k, v) { d[k] = v; } }; }

let api;
let calls;
let realFetch;

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const TMEP2 = { noticeId: "n1", solicitationNumber: "HT940226R0001", title: "TRICARE Medicare Eligible Program Second Generation (TMEP2)", fullParentPathName: "DEPT OF DEFENSE.DEFENSE HEALTH AGENCY (DHA).DEFENSE HEALTH AGENCY" };
const NAVY = { noticeId: "n2", solicitationNumber: "N00024-26-R-2234", title: "Research Vessel", fullParentPathName: "DEPT OF DEFENSE.DEPT OF THE NAVY" };

beforeAll(() => {
  realFetch = globalThis.fetch;
  process.env.SAM_GOV_API_KEY = "test-key";
  process.env.SAM_DAILY_QUOTA = "1000";
  api = cjsRequire("../../netlify/functions/lib/federal-data-apis.js");
});
afterAll(() => { globalThis.fetch = realFetch; delete process.env.SAM_GOV_API_KEY; delete process.env.SAM_DAILY_QUOTA; });
beforeEach(() => { calls = []; fetchCache._setStoreForTests(freshStore()); });

describe("solicitation-number lookup on the SAM.gov wire", () => {
  it("sends solnum, never q, and makes exactly one request", async () => {
    globalThis.fetch = async (url) => { calls.push(String(url)); return jsonRes({ totalRecords: 1, opportunitiesData: [TMEP2] }); };
    const r = await api.searchSAMOpportunities({ solnum: "HT940226R0001", limit: 3, daysBack: 365, agency: "DHA" });
    const sam = calls.filter((u) => u.includes("api.sam.gov"));
    expect(sam).toHaveLength(1);
    const params = new URL(sam[0]).searchParams;
    expect(params.get("solnum")).toBe("HT940226R0001");
    expect(params.get("q")).toBeNull();
    expect(r.opportunities.map((o) => o.solicitation_number)).toEqual(["HT940226R0001"]);
  });

  it("never asks SAM.gov for more than one year (365 days from today is rejected as over a year)", async () => {
    globalThis.fetch = async (url) => { calls.push(String(url)); return jsonRes({ totalRecords: 0, opportunitiesData: [] }); };
    await api.searchSAMOpportunities({ solnum: "HT940226R0001", daysBack: 365 });
    const params = new URL(calls.find((u) => u.includes("api.sam.gov"))).searchParams;
    const [fm, fd, fy] = params.get("postedFrom").split("/").map(Number);
    const [tm, td, ty] = params.get("postedTo").split("/").map(Number);
    const span = (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000;
    expect(span).toBeLessThanOrEqual(364);
    expect(span).toBeGreaterThanOrEqual(363);
  });

  it("skips the relaxed secondary call even when the primary is thin", async () => {
    globalThis.fetch = async (url) => { calls.push(String(url)); return jsonRes({ totalRecords: 0, opportunitiesData: [] }); };
    await api.searchSAMOpportunities({ solnum: "HT001126RE011", relaxKeyword: "data governance", agency: "DHA" });
    expect(calls.filter((u) => u.includes("api.sam.gov"))).toHaveLength(1);
  });
});

describe("filterBySolicitation", () => {
  const mapped = [
    { solicitation_number: "HT940226R0001", title: "TMEP2" },
    { solicitation_number: "N00024-26-R-2234", title: "Navy" },
    { solicitation_number: "", title: "no number" },
  ];
  it("keeps only notices carrying a queried number", () => {
    expect(api.filterBySolicitation(mapped, ["HT940226R0001"]).map((o) => o.title)).toEqual(["TMEP2"]);
  });
  it("matches case- and dash-insensitively", () => {
    expect(api.filterBySolicitation(mapped, ["n00024-26-r-2234"]).map((o) => o.title)).toEqual(["Navy"]);
    expect(api.filterBySolicitation(mapped, ["N0002426R2234"]).map((o) => o.title)).toEqual(["Navy"]);
  });
  it("cites nothing when no number was queried or nothing matches", () => {
    expect(api.filterBySolicitation(mapped, [])).toEqual([]);
    expect(api.filterBySolicitation([NAVY].map((o) => ({ solicitation_number: o.solicitationNumber })), ["HT940226R0001"])).toEqual([]);
  });
});
