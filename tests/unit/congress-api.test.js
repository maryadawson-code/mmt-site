// lib/congress-api.js: every link the model is shown is a congress.gov page
// a person can open, never an api.congress.gov JSON URL (2026-09-13: the
// widget rendered "record 1" links to raw API JSON).

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// CommonJS loader, like the other Ask MMT tests: the lib is a CJS singleton
// the assistant requires.
const require = createRequire(import.meta.url);
const { billPageUrl, crsPageUrl, committeeReportPageUrl, hearingSearchUrl } = require("../../netlify/functions/lib/congress-api.js");

describe("congress.gov page links", () => {
  it("maps every bill type to its congress.gov path", () => {
    expect(billPageUrl(119, "S", 3018)).toBe("https://www.congress.gov/bill/119th-congress/senate-bill/3018");
    expect(billPageUrl(119, "HR", 5622)).toBe("https://www.congress.gov/bill/119th-congress/house-bill/5622");
    expect(billPageUrl(119, "HRES", 1109)).toBe("https://www.congress.gov/bill/119th-congress/house-resolution/1109");
    expect(billPageUrl(119, "SRES", 542)).toBe("https://www.congress.gov/bill/119th-congress/senate-resolution/542");
    expect(billPageUrl(118, "SJRES", 7)).toBe("https://www.congress.gov/bill/118th-congress/senate-joint-resolution/7");
    expect(billPageUrl(121, "HCONRES", 2)).toBe("https://www.congress.gov/bill/121st-congress/house-concurrent-resolution/2");
  });
  it("CRS products, committee reports and hearings resolve to congress.gov pages", () => {
    expect(crsPageUrl("R49344")).toBe("https://www.congress.gov/crs-product/R49344");
    expect(committeeReportPageUrl(119, "Senate", 12)).toBe("https://www.congress.gov/congressional-report/119th-congress/senate-report/12");
    expect(hearingSearchUrl("Military Health System")).toMatch(/^https:\/\/www\.congress\.gov\/search\?q=/);
    expect(hearingSearchUrl("x")).not.toContain("api.congress.gov");
  });
});
