// lib/onc-healthit-api.js: ONC data via the open API that still answers,
// gated to adoption/vendor questions, aggregated to the latest year.

import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { _setStoreForTests } = require("../../netlify/functions/lib/fetch-cache.js");
const onc = require("../../netlify/functions/lib/onc-healthit-api.js");

function freshStore() { const d = {}; return { async get(k) { return k in d ? d[k] : null; }, async setJSON(k, v) { d[k] = v; } }; }

const VENDORS = [
  { developer: "Epic Systems Corporation", provider_type: "hospital", program_year: "2016", tot_provs_report_developer: "1200" },
  { developer: "Cerner Corporation", provider_type: "hospital", program_year: "2016", tot_provs_report_developer: "800" },
  { developer: "MEDITECH", provider_type: "hospital", program_year: "2015", tot_provs_report_developer: "900" },
  { developer: "athenahealth", provider_type: "professional", program_year: "2016", tot_provs_report_developer: "5000" },
];
const AHA = [
  { region: "National", region_code: "US", period: "2020", pct_hospitals_cehrt: "0.9375", pct_hospitals_send_receive_find_integrate: "0.55", pct_hospitals_hie_participate: "0.71", pct_hospitals_api: "0.60", pct_hospitals_patients_view: "0.97" },
  { region: "Texas", region_code: "TX", period: "2020", pct_hospitals_cehrt: "0.91", pct_hospitals_send_receive_find_integrate: "", pct_hospitals_hie_participate: "0.5", pct_hospitals_api: "0.4", pct_hospitals_patients_view: "0.9" },
  { region: "National", region_code: "US", period: "2019", pct_hospitals_cehrt: "0.90" },
];
const fetchFor = (calls) => async (url) => {
  calls.push(String(url));
  const src = new URL(String(url)).searchParams.get("source");
  const body = src === onc.DATASETS.DEVELOPER_COUNTS ? VENDORS : AHA;
  return { ok: true, status: 200, json: async () => body };
};

describe("onc-healthit-api", () => {
  beforeEach(() => _setStoreForTests(freshStore()));

  it("is skipped unless the question is about adoption, vendors or interoperability", async () => {
    expect(await onc.enrichWithONCHealthIT({ topic: "data governance awards" })).toEqual({ skipped: true });
  });

  it("ranks developers for the latest hospital program year and reads the latest AHA period", async () => {
    const calls = [];
    const r = await onc.enrichWithONCHealthIT({ topic: "Which EHR vendors lead hospital adoption?", state: "TX", fetchImpl: fetchFor(calls) });
    expect(r.developers.program_year).toBe("2016");
    expect(r.developers.developers.map((d) => d.developer)).toEqual(["Epic Systems Corporation", "Cerner Corporation"]);
    expect(r.developers.developers[0].share_pct).toBe(60);
    expect(r.adoption.period).toBe("2020");
    expect(r.adoption.states.map((s) => s.code)).toEqual(["US", "TX"]);
    expect(r.adoption.states[0].certified_ehr_pct).toBe(93.8);
    expect(r.adoption.states[1].send_receive_find_integrate_pct).toBeNull();
    const ctx = onc.formatONCHealthITContext(r);
    expect(ctx).toContain("1200 hospitals reporting (60% of 2000)");
    expect(ctx).toContain("Texas (2020): certified EHR 91%");
    expect(calls.every((u) => u.startsWith("https://healthit.gov/data/open-api?source="))).toBe(true);
    // second question the same day: served from cache
    await onc.enrichWithONCHealthIT({ topic: "hospital EHR adoption", fetchImpl: fetchFor(calls) });
    expect(calls.length).toBe(2);
  });

  it("an HTML page instead of JSON is an error, not a crash, and is not cached", async () => {
    let n = 0;
    const bad = async () => { n += 1; return { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token '<'"); } }; };
    const r = await onc.getDeveloperMarketShare({ fetchImpl: bad });
    expect(r.error).toMatch(/Unexpected token/);
    await onc.getDeveloperMarketShare({ fetchImpl: bad });
    expect(n).toBe(2);
  });
});
