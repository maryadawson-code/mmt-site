// Ask MMT sources (lib/ask-mmt-sources.js). "Research with receipts" is only
// true if (a) every system the assistant fans out to has a catalog row, so the
// public /ask/sources table cannot silently omit something the code queries,
// and (b) an answer lists only the systems that actually returned data.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SOURCE_CATALOG,
  CATALOG_BY_ID,
  buildSources,
  extractLinks,
  splitFederalData,
} from "../../netlify/functions/lib/ask-mmt-sources.js";

const ASSISTANT = path.join(process.cwd(), "netlify", "functions", "lib", "premium-assistant.js");

describe("SOURCE_CATALOG", () => {
  it("every id the assistant fans out to has a catalog row", () => {
    const src = fs.readFileSync(ASSISTANT, "utf8");
    const ids = new Set();
    for (const m of src.matchAll(/\{\s*id:\s*"([a-z_]+)"/g)) ids.add(m[1]);
    // the federal-data split ids come from splitFederalData
    ["usaspending", "sam_opportunities", "federal_register", "gao_reports"].forEach((i) => ids.add(i));
    expect(ids.size).toBeGreaterThan(15);
    const missing = [...ids].filter((i) => !CATALOG_BY_ID[i]);
    expect(missing).toEqual([]);
  });

  it("rows are well-formed: unique ids, http urls, a known mode, copy for both columns", () => {
    const seen = new Set();
    for (const s of SOURCE_CATALOG) {
      expect(seen.has(s.id)).toBe(false);
      seen.add(s.id);
      expect(s.url).toMatch(/^https:\/\//);
      expect(["live", "index", "conditional", "fallback"]).toContain(s.mode);
      expect(s.provides.length).toBeGreaterThan(10);
      expect(s.use.length).toBeGreaterThan(10);
      if (s.mode === "conditional" || s.mode === "fallback") expect(s.note.length).toBeGreaterThan(10);
    }
    expect(CATALOG_BY_ID.mmt_archive.mode).toBe("index");
    expect(CATALOG_BY_ID.web_federal.mode).toBe("fallback");
  });

  it("carries no em dashes (voice rule)", () => {
    expect(JSON.stringify(SOURCE_CATALOG)).not.toContain("—");
  });
});

describe("buildSources", () => {
  it("lists only systems that were used, MMT articles first, with extracted links", () => {
    const out = buildSources({
      systems: [
        { id: "congress", used: true, data: { bills: [{ title: "NDAA", url: "https://www.congress.gov/bill/1" }] } },
        { id: "pubmed", used: false, data: { articles: [{ url: "https://pubmed.ncbi.nlm.nih.gov/1" }] } },
        { id: "not_in_catalog", used: true, data: {} },
      ],
      corpusMatches: [{ title: "T4NG2 explained", date: "2026-03-01", type: "article", url: "/newsletter/t4ng2" }],
    });
    expect(out[0]).toMatchObject({ kind: "article", url: "https://missionmeetstech.com/newsletter/t4ng2", title: "T4NG2 explained" });
    const ids = out.map((s) => s.id);
    expect(ids).toContain("congress");
    expect(ids).not.toContain("pubmed");
    expect(ids).not.toContain("not_in_catalog");
    expect(out.find((s) => s.id === "congress").links).toEqual(["https://www.congress.gov/bill/1"]);
  });

  it("returns an empty list when nothing was used", () => {
    expect(buildSources({ systems: [{ id: "congress", used: false }], corpusMatches: [] })).toEqual([]);
    expect(buildSources()).toEqual([]);
  });
});

describe("extractLinks", () => {
  it("collects link-shaped string fields, dedupes, caps at four, ignores non-http", () => {
    const links = extractLinks({
      a: { url: "https://x.gov/1" },
      b: [{ uiLink: "https://x.gov/2" }, { link: "https://x.gov/2" }],
      c: { permalink: "ftp://nope" },
      d: [{ url: "https://x.gov/3" }, { url: "https://x.gov/4" }, { url: "https://x.gov/5" }],
      e: { title: "https://x.gov/not-a-link-key" },
    });
    expect([...links]).toEqual(["https://x.gov/1", "https://x.gov/2", "https://x.gov/3", "https://x.gov/4"]);
  });
  it("never throws on hostile input", () => {
    const circular = {}; circular.self = circular;
    expect(() => extractLinks(circular)).not.toThrow();
    expect([...extractLinks(null)]).toEqual([]);
    expect([...extractLinks("str")]).toEqual([]);
  });
});

describe("splitFederalData", () => {
  it("splits the federal-data-apis blob into separately citable systems", () => {
    const parts = splitFederalData({
      usaspending_awards: { awards: [{ piid: "X" }] },
      spending_categories: { categories: [] },
      sam_opportunities: { opportunities: [{ notice_id: "abc" }] },
      federal_register: { documents: [] },
      gao_reports: { reports: [{ report_number: "GAO-1" }] },
    });
    expect(parts.map((p) => p.id)).toEqual(["usaspending", "sam_opportunities", "gao_reports"]);
  });
  it("is empty for missing or malformed input", () => {
    expect(splitFederalData(null)).toEqual([]);
    expect(splitFederalData({ error: "timeout-8s" })).toEqual([]);
  });
});
