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
  linkUrl,
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

  it("lists CHPL as live now that MMT holds a key (set 2026-09-14) and is honest about the IT Dashboard (sunset)", () => {
    const chpl = CATALOG_BY_ID.onc_chpl;
    expect(chpl.mode).toBe("live");
    expect(chpl.note).toMatch(/API key/);
    expect(chpl.url).toBe("https://chpl.healthit.gov");
    const itd = CATALOG_BY_ID.it_dashboard;
    expect(itd.mode).toBe("conditional");
    expect(itd.note).toMatch(/sunset/i);
    expect(itd.note).toMatch(/April 2026/);
  });

  it("carries no em dashes or exclamation points (voice rule)", () => {
    const text = JSON.stringify(SOURCE_CATALOG);
    expect(text).not.toContain("—");
    expect(text).not.toContain("!");
  });
});

describe("buildSources", () => {
  it("lists only systems that were used, MMT articles first, with labeled links", () => {
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
    expect(out.find((s) => s.id === "congress").links).toEqual([{ url: "https://www.congress.gov/bill/1", label: "NDAA" }]);
  });

  it("stamps queried_at from the caller (null when not given) on system sources only", () => {
    const systems = [{ id: "congress", used: true, data: { url: "https://www.congress.gov/bill/1" } }];
    const corpusMatches = [{ title: "x", url: "/newsletter/x" }];
    const stamped = buildSources({ systems, corpusMatches, queriedAt: "2026-09-14T12:00:00.000Z" });
    expect(stamped.find((s) => s.id === "congress").queried_at).toBe("2026-09-14T12:00:00.000Z");
    expect(stamped.find((s) => s.kind === "article").queried_at).toBeUndefined();
    expect(buildSources({ systems }).find((s) => s.id === "congress").queried_at).toBeNull();
    expect(buildSources({ systems, queriedAt: 12345 }).find((s) => s.id === "congress").queried_at).toBeNull();
  });

  it("returns an empty list when nothing was used", () => {
    expect(buildSources({ systems: [{ id: "congress", used: false }], corpusMatches: [] })).toEqual([]);
    expect(buildSources()).toEqual([]);
  });
});

describe("extractLinks", () => {
  it("collects link-shaped string fields as {url,label}, dedupes by url, caps at four, ignores non-http", () => {
    const links = extractLinks({
      a: { url: "https://x.gov/1", title: "First" },
      b: [{ uiLink: "https://x.gov/2", name: "Second" }, { link: "https://x.gov/2", name: "Dup" }],
      c: { permalink: "ftp://nope" },
      d: [{ url: "https://x.gov/3" }, { url: "https://x.gov/4", piid: "HT001524F0063" }, { url: "https://x.gov/5" }],
      e: { title: "https://x.gov/not-a-link-key" },
    });
    expect(links.map(linkUrl)).toEqual(["https://x.gov/1", "https://x.gov/2", "https://x.gov/3", "https://x.gov/4"]);
    expect(links).toEqual([
      { url: "https://x.gov/1", label: "First" },
      { url: "https://x.gov/2", label: "Second" },
      { url: "https://x.gov/3", label: null },
      { url: "https://x.gov/4", label: "HT001524F0063" },
    ]);
  });

  it("labels from the nearest sibling in preference order, trimmed to 60 chars", () => {
    const long = "IMMUTA SOFTWARE FOR DATA GOVERNANCE AND ACCESS CONTROL ACROSS THE ENTERPRISE DATA PLATFORM";
    const [award] = extractLinks({ description: long, piid: "HT001524F0063", url: "https://usaspending.gov/award/1" });
    expect(award.label).toBe("HT001524F0063"); // piid outranks description
    const [desc] = extractLinks({ description: long, url: "https://usaspending.gov/award/2" });
    expect(desc.label.length).toBeLessThanOrEqual(60);
    expect(desc.label.startsWith("IMMUTA SOFTWARE FOR DATA GOVERNANCE")).toBe(true);
    expect(desc.label.endsWith("...")).toBe(true);
    const [notice] = extractLinks({ noticeId: "abc123", solicitation_number: "HT0038-26-R-0001", uiLink: "https://sam.gov/opp/abc123/view" });
    expect(notice.label).toBe("abc123");
    const [sol] = extractLinks({ solicitation_number: "HT0038-26-R-0001", uiLink: "https://sam.gov/opp/abc123/view" });
    expect(sol.label).toBe("HT0038-26-R-0001");
    const [titled] = extractLinks({ Title: "Case-insensitive key", url: "https://x.gov/t" });
    expect(titled.label).toBe("Case-insensitive key");
  });

  it("citation lists carry no label", () => {
    expect(extractLinks({ citations: ["https://health.mil/a", "https://health.mil/a", "https://va.gov/b"] })).toEqual([
      { url: "https://health.mil/a", label: null },
      { url: "https://va.gov/b", label: null },
    ]);
  });

  it("never throws on hostile input", () => {
    const circular = {}; circular.self = circular;
    expect(() => extractLinks(circular)).not.toThrow();
    expect([...extractLinks(null)]).toEqual([]);
    expect([...extractLinks("str")]).toEqual([]);
  });
});

describe("linkUrl", () => {
  it("reads both the {url,label} object and the plain string older answers carried", () => {
    expect(linkUrl({ url: "https://x.gov/1", label: "one" })).toBe("https://x.gov/1");
    expect(linkUrl("https://x.gov/2")).toBe("https://x.gov/2");
    expect(linkUrl(null)).toBe("");
    expect(linkUrl({ label: "no url" })).toBe("");
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
