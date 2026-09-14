// content-index.js + build-content-corpus.js: the corpus Ask MMT reads.
//
// 2026-09-14: the forecast pipeline, budget lines, CSO AoIs, key people and
// the monthly reads joined the corpus; four bugs (IDIQ items pointing at an
// absolute SAM.gov URL that rendered as "missionmeetstech.comhttps://...",
// three contract URLs that 404'd, undated capture-intel signals, brief
// excerpts opening with nav boilerplate) were fixed; searchCorpus caps each
// type so 201 forecast rows cannot crowd out articles; formatCorpusContext
// shows a window around the matched term instead of the first 600 chars.
//
// Tests that read the REAL corpus assert properties of the committed data
// files (rebuilt with `node scripts/build-content-corpus.js`), so a future
// rebuild that regresses a fix fails here.

import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cjsRequire = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const matter = cjsRequire("gray-matter");
const ci = cjsRequire("../../netlify/functions/lib/content-index.js");
const builder = cjsRequire("../../scripts/build-content-corpus.js");
const fullCorpus = cjsRequire("../../netlify/functions/data/mmt-content-corpus.json");
const publicCorpus = cjsRequire("../../netlify/functions/data/mmt-content-corpus-public.json");
const contractsFile = cjsRequire("../../contracts.json");
const { extractSearchTerms } = cjsRequire("../../netlify/functions/lib/query-terms.js");

const { searchCorpus, formatCorpusContext, excerptWindow, absoluteUrl, _setCorpusForTests } = ci;

function item(overrides) {
  return {
    id: overrides.id || `x-${Math.random().toString(36).slice(2, 8)}`,
    type: "article",
    title: "Untitled",
    slug: "untitled",
    date: "2026-01-15",
    description: "",
    tags: [],
    url: "/newsletter/untitled/",
    excerpt: "",
    premium: false,
    ...overrides,
  };
}

function fixture(items) {
  _setCorpusForTests({ generated_at: "2026-09-14T00:00:00Z", total: items.length, items });
}

afterEach(() => _setCorpusForTests(null));

// ---------------------------------------------------------------------
// Per-type cap (fixture corpus)
// ---------------------------------------------------------------------
describe("searchCorpus per-type cap", () => {
  const fifty = Array.from({ length: 50 }, (_, i) => item({
    id: `f-${i}`,
    type: "forecast_row",
    title: `CMS forecast: HCDS support row ${i}`,
    agency: "CMS",
    tags: ["forecast", "CMS"],
    url: "/premium/forecast-delta",
    excerpt: `Agency: CMS\nItem: HCDS support row ${i}\nAnticipated solicitation: 2026-11-0${(i % 9) + 1}`,
    premium: true,
  }));
  const articles = [
    item({ id: "a-1", type: "article", title: "What HCDS means for CMS vendors", excerpt: "HCDS at CMS is the vehicle that matters." }),
    item({ id: "a-2", type: "article", title: "HCDS task orders, one year in", excerpt: "A year of HCDS orders at CMS." }),
    item({ id: "c-1", type: "contract_intel", title: "HCDS (Health Care Data Services)", url: "/contracts/hcds/", excerpt: "CMS HCDS IDIQ. Status: active." }),
  ];

  it("returns at most 3 forecast_row items when 50 match, and keeps other types in the answer", () => {
    fixture([...fifty, ...articles]);
    const out = searchCorpus("What is in the CMS forecast for HCDS?", 5, "");
    expect(out.length).toBe(5);
    const rows = out.filter((m) => m.type === "forecast_row");
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(out.some((m) => m.type === "article")).toBe(true);
  });

  it("caps every type, so a single type never fills the list", () => {
    fixture([...fifty, ...articles]);
    const out = searchCorpus("CMS forecast HCDS", 8, "");
    const counts = {};
    for (const m of out) counts[m.type] = (counts[m.type] || 0) + 1;
    for (const n of Object.values(counts)) expect(n).toBeLessThanOrEqual(ci.DEFAULT_PER_TYPE_CAP);
  });

  it("fourth param lifts the cap (perTypeCap: 0) and overrides the count (topN)", () => {
    fixture([...fifty, ...articles]);
    const uncapped = searchCorpus("CMS forecast HCDS", 5, "", { perTypeCap: 0 });
    expect(uncapped.filter((m) => m.type === "forecast_row").length).toBeGreaterThan(3);
    const ten = searchCorpus("CMS forecast HCDS", 5, "", { perTypeCap: 0, topN: 10 });
    expect(ten.length).toBe(10);
  });

  it("keeps the default signature: searchCorpus(question, 5, phrase) returns 5 with _score and _anchor", () => {
    fixture([...fifty, ...articles]);
    const out = searchCorpus("Tell me about HCDS at CMS", 5, "hcds");
    expect(out.length).toBe(5);
    for (const m of out) {
      expect(typeof m._score).toBe("number");
      expect(typeof m._anchor).toBe("string");
    }
  });

  it("an item whose agency field is the question's agency acronym ranks above a body mention", () => {
    fixture([
      item({ id: "row", type: "budget_line", title: "VA FY2027 budget: VHA Medical Services", agency: "VA", excerpt: "FY2027 request $59,958M" }),
      item({ id: "mention", type: "article", title: "FY2027 budget notes", excerpt: "The VA line moved. FY2027 request." }),
    ]);
    const out = searchCorpus("What is the VA FY2027 budget request?", 5, "");
    expect(out[0].id).toBe("row");
  });
});

// ---------------------------------------------------------------------
// Glossary boost and agency-acronym exclusion (kept from 09-13)
// ---------------------------------------------------------------------
describe("glossary ranking rules", () => {
  it("a glossary entry whose term is the question's token outranks articles that mention it", () => {
    fixture([
      item({ id: "g", type: "glossary", title: "ATO", expansion: "Authority to Operate", excerpt: "Term: ATO\nStands for: Authority to Operate", url: "/glossary.html#term-ato" }),
      item({ id: "a", type: "article", title: "Why your ATO takes 18 months", excerpt: "ATO ATO ATO ATO ATO. The ATO process." }),
    ]);
    const out = searchCorpus("What is an ATO?", 5, "");
    expect(out[0].id).toBe("g");
  });

  it("an agency acronym is scope, not the subject: the DHA glossary entry does not get the definition boost", () => {
    fixture([
      item({ id: "g", type: "glossary", title: "DHA", expansion: "Defense Health Agency", excerpt: "Term: DHA\nStands for: Defense Health Agency", url: "/glossary.html#term-dha" }),
      item({ id: "c", type: "contract_intel", title: "DHA Data Governance (WOSB Set-Aside)", url: "/contracts/dha-data-governance/", tags: ["DHA"], excerpt: "DHA data governance award. Agency: DHA. Status: active." }),
    ]);
    const out = searchCorpus("Tell me about data governance awards in the DHA", 5, "data governance");
    expect(out[0].id).toBe("c");
  });
});

// ---------------------------------------------------------------------
// formatCorpusContext: URL handling and the excerpt window
// ---------------------------------------------------------------------
describe("formatCorpusContext", () => {
  it("never concatenates the site host onto an absolute URL", () => {
    fixture([
      item({ id: "abs", type: "idiq_vehicle", title: "T4NG2", url: "https://sam.gov/opp/abc/view", excerpt: "T4NG2 vehicle" }),
      item({ id: "rel", type: "idiq_vehicle", title: "T4NG2 tracker", url: "/idiq-tracker.html#t4ng2", source_url: "https://sam.gov/opp/def/view", excerpt: "T4NG2 on the tracker" }),
      item({ id: "bare", type: "article", title: "T4NG2 article", url: "newsletter/t4ng2/", excerpt: "T4NG2 article body" }),
    ]);
    const ctx = formatCorpusContext(searchCorpus("Tell me about T4NG2", 5, ""));
    expect(ctx).not.toContain("missionmeetstech.comhttp");
    expect(ctx).toContain("URL: https://sam.gov/opp/abc/view");
    expect(ctx).toContain("URL: https://missionmeetstech.com/idiq-tracker.html#t4ng2 | Source: https://sam.gov/opp/def/view");
    expect(ctx).toContain("URL: https://missionmeetstech.com/newsletter/t4ng2/");
  });

  it("absoluteUrl is idempotent on absolute input and prefixes relative paths", () => {
    expect(absoluteUrl("https://sam.gov/x")).toBe("https://sam.gov/x");
    expect(absoluteUrl("/contracts/x/")).toBe("https://missionmeetstech.com/contracts/x/");
    expect(absoluteUrl("contracts/x/")).toBe("https://missionmeetstech.com/contracts/x/");
    expect(absoluteUrl("")).toBe("https://missionmeetstech.com/");
  });

  it("shows a window around the matched term, not the first 600 chars, and gives the top match more room", () => {
    const filler = "filler word ".repeat(300); // 3,600 chars before the passage
    const passage = "The HCDS recompete drops in March with a WOSB pool.";
    fixture([
      item({ id: "top", type: "premium_brief", title: "Brief", excerpt: `${filler}${passage}${" tail word".repeat(200)}` }),
      item({ id: "second", type: "article", title: "Article", excerpt: `${filler}${passage}${" tail word".repeat(200)}` }),
    ]);
    const matches = searchCorpus("What about the HCDS recompete?", 5, "");
    const ctx = formatCorpusContext(matches);
    expect(ctx).toContain("HCDS recompete drops in March");
    const rows = ctx.split("\n\n### ").slice(1);
    expect(rows.length).toBe(2);
    const excerptOf = (row) => row.split("- Excerpt: ")[1];
    expect(excerptOf(rows[0]).startsWith("...")).toBe(true);
    expect(excerptOf(rows[0]).length).toBeGreaterThan(excerptOf(rows[1]).length);
    expect(excerptOf(rows[0]).length).toBeLessThanOrEqual(1500 + 8);
    expect(excerptOf(rows[1]).length).toBeLessThanOrEqual(700 + 8);
  });

  it("falls back to the start of the item when no term is found in the excerpt", () => {
    const text = "Opening sentence of the item. " + "more text ".repeat(200);
    expect(excerptWindow(text, "", 300).startsWith("Opening sentence")).toBe(true);
    expect(excerptWindow(text, "absent-term", 300).startsWith("Opening sentence")).toBe(true);
    expect(excerptWindow(text, "", 300).endsWith(" ...")).toBe(true);
    expect(excerptWindow("short", "short", 300)).toBe("short");
  });

  it("accepts an explicit query and phrase for callers that did not go through searchCorpus", () => {
    const filler = "filler word ".repeat(200);
    const ctx = formatCorpusContext([item({ title: "X", excerpt: `${filler}community care network is the phrase. ${filler}` })], "community care", "community care network");
    expect(ctx).toContain("community care network is the phrase");
    expect(ctx.split("- Excerpt: ")[1].startsWith("...")).toBe(true);
  });

  it("returns an empty string for no matches", () => {
    expect(formatCorpusContext([])).toBe("");
    expect(formatCorpusContext(null)).toBe("");
  });
});

// ---------------------------------------------------------------------
// briefRegion (the excerpt cut) as a pure function
// ---------------------------------------------------------------------
describe("briefRegion", () => {
  const page = `<html><head><title>Capture Corner: X &middot; MMT Premium</title></head><body>
<nav class="nav-editorial"><a href="/">MMT Premium</a> Sign in</nav>
<main class="wrap">
  <a href="/capture-corner.html" class="back-link">&larr; Capture Corner</a>
  <div class="section-label">MMT Premium &middot; Capture Corner &middot; September 15, 2026</div>
  <h1>The Clause That Opens on January 6</h1>
  <p><em>The dek.</em></p>
  <div class="pills"><span class="pill">Capture Corner</span></div>
  <div data-gate="free"><div class="gate-notice"><h3>&#9733; Premium Capture Corner</h3><p>Preview paragraph.</p><a class="gate-cta" href="/pricing">See premium plans</a></div></div>
  <div data-access="premium" class="brief-body"><p>The body.</p></div>
</main>
<footer>Footer boilerplate</footer></body></html>`;

  it("starts at the title and ends at </main>, dropping pills, the gate CTA and the gate heading", () => {
    const region = builder.briefRegion(page);
    expect(region.startsWith("<h1>")).toBe(true);
    expect(region).toContain("Preview paragraph.");
    expect(region).toContain("The body.");
    expect(region).not.toContain("section-label");
    expect(region).not.toContain("back-link");
    expect(region).not.toContain("See premium plans");
    expect(region).not.toContain('class="pill"');
    expect(region).not.toContain("Premium Capture Corner");
    expect(region).not.toContain("Footer boilerplate");
  });

  it("returns the whole document when there is no <main> or <h1>", () => {
    expect(builder.briefRegion("<p>plain</p>")).toBe("<p>plain</p>");
  });

  it("isoDate and fiscalYearOf read the shapes the data files use", () => {
    expect(builder.isoDate("2026-07-26T12:00:00Z")).toBe("2026-07-26");
    expect(builder.isoDate("capture-corner-2026-09-15")).toBe("2026-09-15");
    expect(builder.isoDate("")).toBe("");
    expect(builder.fiscalYearOf("2026-10-01")).toBe("FY2027 (FY27)");
    expect(builder.fiscalYearOf("2026-09-30")).toBe("FY2026 (FY26)");
    expect(builder.fiscalYearOf("TBD")).toBe("");
  });
});

// ---------------------------------------------------------------------
// Agency boost is gated on the topic phrase (2026-09-14)
// ---------------------------------------------------------------------
describe("agency boost gate", () => {
  const rows = [
    item({ id: "row-1", type: "forecast_row", title: "VA forecast: VISN 21 Biomedical IT refresh", agency: "VA", date: "2026-09-10", url: "/premium/forecast-delta", excerpt: "Agency: VA\nItem: VISN 21 Biomedical IT refresh\nAward estimate: FY27 Q1", premium: true }),
    item({ id: "row-2", type: "forecast_row", title: "VA forecast: Contract Management Solution", agency: "VA", date: "2026-09-10", url: "/premium/forecast-delta", excerpt: "Agency: VA\nItem: Contract Management Solution\nAward estimate: FY27 Q2", premium: true }),
    item({ id: "tracker", type: "contract_intel", title: "VA Ambient Scribe IDIQ (36C10B26R0006)", url: "/contracts/va-ambient-scribe-idiq/", date: "2026-08-17", excerpt: "Agency: VA. VA ambient scribe IDIQ, GAO protest decided." }),
  ];

  it("a VA row with no query term in its text never outranks the entry whose title is the phrase", () => {
    fixture(rows);
    const out = searchCorpus("What is VA doing with ambient scribes?", 5, "ambient scribe");
    expect(out[0].id).toBe("tracker");
    expect(out.filter((m) => m.type === "forecast_row" && m._anchor === "")).toEqual([]);
  });

  it("the boost still applies when the row carries the phrase, and when the question has no phrase", () => {
    fixture([
      ...rows,
      item({ id: "row-3", type: "forecast_row", title: "VA forecast: Ambient scribe pilot expansion", agency: "VA", date: "2026-09-10", url: "/premium/forecast-delta", excerpt: "Agency: VA\nItem: ambient scribe pilot", premium: true }),
    ]);
    const withPhrase = searchCorpus("What is VA doing with ambient scribes?", 5, "ambient scribe");
    expect(withPhrase.map((m) => m.id)).toContain("row-3");
    expect(withPhrase.map((m) => m.id)).not.toContain("row-1");
    const noPhrase = searchCorpus("What is in the VA forecast?", 5, "");
    expect(noPhrase.filter((m) => m.type === "forecast_row").length).toBe(3);
  });
});

// ---------------------------------------------------------------------
// Publish gate: read time (fixture, pinned dates) and build time (real files)
// ---------------------------------------------------------------------
describe("publish gate", () => {
  const staged = [
    item({ id: "held", type: "article", title: "VA raters and service records", date: "2026-09-15", url: "/newsletter/held/", excerpt: "VA raters enter service that never happened. EO 14426 and DEERS." }),
    item({ id: "held-brief", type: "premium_brief", title: "The Clause That Opens on January 6", date: "2026-09-15", url: "/premium/briefs/capture-corner-2026-09-15.html", excerpt: "VA raters and the DEERS clause.", premium: true }),
    item({ id: "live", type: "article", title: "VA raters, the earlier read", date: "2026-09-11", url: "/newsletter/live/", excerpt: "VA raters and DEERS records, the earlier piece." }),
    item({ id: "vehicle", type: "idiq_vehicle", title: "VA raters support IDIQ", date: "2027-01-01", url: "/idiq-tracker.html", excerpt: "VA raters DEERS vehicle, period of performance starts next year." }),
  ];

  it("searchCorpus never returns a publish-dated item later than today (ET), and releases it on its date", () => {
    fixture(staged);
    const before = searchCorpus("What about VA raters and DEERS?", 5, "", { today: "2026-09-14" });
    expect(before.map((m) => m.id).sort()).toEqual(["live", "vehicle"]);
    const onDay = searchCorpus("What about VA raters and DEERS?", 5, "", { today: "2026-09-15" });
    expect(onDay.map((m) => m.id).sort()).toEqual(["held", "held-brief", "live", "vehicle"]);
  });

  it("a period-of-performance or verification date in the future is not a publish date and is never held", () => {
    fixture(staged);
    const out = searchCorpus("VA raters IDIQ", 5, "", { today: "2026-09-14" });
    expect(out.map((m) => m.id)).toContain("vehicle");
  });

  it("the builder holds the 2026-09-15 article and Capture Corner on 2026-09-14 (ET) and includes them on 2026-09-15", () => {
    const heldArticle = "article-vas-manual-tells-raters-to-enter-service-that-never-happened";
    const heldBrief = "brief-capture-corner-2026-09-15";
    const before = [...builder.buildArticles("2026-09-14"), ...builder.buildBriefs("2026-09-14")].map((i) => i.id);
    expect(before).not.toContain(heldArticle);
    expect(before).not.toContain(heldBrief);
    expect(before).toContain("brief-capture-corner-2026-09-11");
    const onDay = [...builder.buildArticles("2026-09-15"), ...builder.buildBriefs("2026-09-15")].map((i) => i.id);
    expect(onDay).toContain(heldArticle);
    expect(onDay).toContain(heldBrief);
    expect(builder.isHeld("2026-09-15", "2026-09-14")).toBe(true);
    expect(builder.isHeld("2026-09-14", "2026-09-14")).toBe(false);
    expect(builder.isHeld("", "2026-09-14")).toBe(false);
  });

  it("buildArticles never emits the _template placeholder and every url is /newsletter/<slug>/", () => {
    const arts = builder.buildArticles("2026-09-14");
    expect(arts.some((a) => a.id.includes("replace-with-url-slug"))).toBe(false);
    for (const a of arts) expect(a.url).toBe(`/newsletter/${a.slug}/`);
  });

  it("collectItems scrubs every item and buildIdiqVehicles carries no fragment", () => {
    for (const v of builder.buildIdiqVehicles()) expect(v.url).toBe("/idiq-tracker.html");
    const { allItems } = builder.collectItems("2026-09-14");
    expect(allItems.some((i) => /@va\.gov/i.test(i.excerpt))).toBe(false);
    expect(allItems.some((i) => i.date > "2026-09-14" && ci.PUBLISH_DATED_TYPES.has(i.type))).toBe(false);
  });
});

describe("scrubCorpusText", () => {
  it("removes emails and phone numbers and keeps clause numbers", () => {
    const out = builder.scrubCorpusText("Contracting Officer: Terricia Lloyd ( Terricia.Lloyd@va.gov ; 512-981-4453 ) under GSAR 552.239-7001, DFARS 252.204-7012 and FAR 52.204-21; also 202.306.4240 and (202) 306-4240.");
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/512-981-4453|202.306.4240|306-4240/);
    expect(out).toContain("552.239-7001");
    expect(out).toContain("252.204-7012");
    expect(out).toContain("52.204-21");
    expect(out).toContain("[email removed]");
    expect(out).toContain("[phone removed]");
    expect(builder.scrubCorpusText("")).toBe("");
    expect(builder.scrubCorpusText(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------
// The committed corpus: properties of the real data
// ---------------------------------------------------------------------
describe("committed corpus", () => {
  const items = fullCorpus.items;
  const byType = (t) => items.filter((i) => i.type === t);

  it("'What is in the CMS forecast for FY2027?' has a CMS forecast_row in the top 3", () => {
    const out = searchCorpus("What is in the CMS forecast for FY2027?", 5, "");
    expect(out.slice(0, 3).some((m) => m.type === "forecast_row" && m.agency === "CMS")).toBe(true);
  });

  it("'Who is the DHA Director?' includes the DHA key_people block", () => {
    const out = searchCorpus("Who is the DHA Director?", 5, "");
    const kp = out.find((m) => m.type === "key_people" && m.agency === "DHA");
    expect(kp).toBeTruthy();
    expect(kp.excerpt).toContain("Director");
    expect(kp.url).toBe("/premium/key-people");
  });

  it("carries every new premium dataset, dated and marked premium", () => {
    for (const t of ["forecast_row", "budget_line", "cso_aoi", "key_people", "forecast_delta", "gao_sustain"]) {
      const rows = byType(t);
      expect(rows.length, t).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.premium, `${t} ${r.id}`).toBe(true);
        expect(r.date, `${t} ${r.id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(r.url, `${t} ${r.id}`).toMatch(/^\//);
      }
    }
    expect(byType("forecast_row").every((r) => r.url === "/premium/forecast-delta")).toBe(true);
    expect(byType("budget_line").every((r) => r.url === "/premium/cr-exposure")).toBe(true);
    expect(byType("cso_aoi").every((r) => /^\/contracts\/[a-z0-9-]+\/$/.test(r.url))).toBe(true);
  });

  it("key_people items carry names, titles and offices and never an email or phone", () => {
    for (const r of byType("key_people")) {
      expect(r.excerpt).not.toMatch(/@/);
      expect(r.excerpt).not.toMatch(/\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/);
    }
  });

  // 2026-09-14: two Capture Corners and the migrated May monthly carried VA
  // contracting officers' emails and direct lines; the model quoted them
  // when asked for the contact. The builder scrubs every item now.
  it("no item of any type carries an email address or a phone number in its excerpt or description", () => {
    const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
    const CLAUSE = /\b\d{2,3}\.\d{3}-\d{1,4}\b/g;
    expect(items.length).toBeGreaterThan(500);
    for (const r of items) {
      const text = `${r.excerpt || ""} ${r.description || ""}`;
      expect(text, `${r.type} ${r.id} email`).not.toMatch(EMAIL);
      expect(text.replace(CLAUSE, ""), `${r.type} ${r.id} phone`).not.toMatch(PHONE);
    }
  });

  it("the scrub keeps FAR/GSAR/DFARS clause numbers, which share a phone number's digit shape", () => {
    // The CMMC article is about DFARS 252.204-7012; a scrub that ate the
    // clause number would gut the answer to any CMMC question.
    const cmmc = items.find((i) => i.id === "article-health-net-never-had-a-cmmc-deadline");
    expect(cmmc).toBeTruthy();
    expect(cmmc.excerpt).toContain("252.204-7012");
    expect(items.some((i) => /552\.239-7001/.test(i.excerpt))).toBe(true);
  });

  it("holds nothing the site is still holding: no publish-dated item is later than the corpus's own build day (ET)", () => {
    const buildDay = ci.todayET(new Date(fullCorpus.generated_at));
    expect(buildDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const late = items.filter((i) => ci.PUBLISH_DATED_TYPES.has(i.type) && i.date && String(i.date) > buildDay);
    expect(late.map((i) => `${i.id} ${i.date}`)).toEqual([]);
  });

  it("every article url is /newsletter/<slug>/, the path build.js writes, and the template is not an item", () => {
    const rows = byType("article");
    expect(rows.length).toBeGreaterThan(100);
    const slugify = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";
    const dir = path.join(ROOT, "content", "newsletter");
    const expected = new Set();
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_"))) {
      const { data } = matter(fs.readFileSync(path.join(dir, f), "utf8"));
      if (data.title) expected.add(`/newsletter/${data.slug || slugify(data.title)}/`);
    }
    for (const r of rows) {
      expect(r.url, r.id).toMatch(/^\/newsletter\/[a-z0-9-]+\/$/);
      expect(expected.has(r.url), `${r.id} -> ${r.url} is not a page build.js writes`).toBe(true);
    }
    expect(rows.some((r) => /replace-with-url-slug|untitled/.test(r.url))).toBe(false);
  });

  // Dist-backed: after `node build.js`, every article the corpus cites must
  // be a page under dist/. CI runs the unit suite without a build, so the
  // check runs only when dist/newsletter exists (locally and in deploy-gate).
  const distNewsletter = path.join(ROOT, "dist", "newsletter");
  const hasDist = fs.existsSync(distNewsletter);
  it.skipIf(!hasDist)("every article url resolves to dist/newsletter/<slug>/index.html after node build.js", () => {
    const missing = byType("article")
      .map((r) => r.url)
      .filter((u) => !fs.existsSync(path.join(ROOT, "dist", u.replace(/^\//, ""), "index.html")));
    expect(missing).toEqual([]);
  });

  // The production call shape (premium-assistant.js): the spelling-corrected
  // question and the extracted phrase. Before the agency-boost gate these
  // three returned VA forecast/budget rows with no query term in their text
  // above the on-topic tracker, IDIQ, capture-intel and glossary items.
  const ask = (q) => {
    const t = extractSearchTerms(q);
    return searchCorpus(t.corrected || q, 5, t.phrase);
  };

  it("'What is VA doing with ambient scribes?' leads with the VA Ambient Scribe tracker entry and returns no zero-topic row", () => {
    const out = ask("What is VA doing with ambient scribes?");
    expect(out[0].type).toBe("contract_intel");
    expect(out[0].title).toMatch(/VA Ambient Scribe/);
    expect(out.every((m) => m._anchor !== "")).toBe(true);
    expect(searchCorpus("What is VA doing with ambient scribes?", 5, "ambient scribe")[0].title).toMatch(/VA Ambient Scribe/);
  });

  it("'What did VA award for telehealth?' returns no forecast_row or budget_line", () => {
    const out = ask("What did VA award for telehealth?");
    expect(out.length).toBeGreaterThan(0);
    expect(out.filter((m) => m.type === "forecast_row" || m.type === "budget_line")).toEqual([]);
  });

  it("'Tell me about Oracle Health at VA' puts the IDIQ, capture-intel and glossary items in the top 3", () => {
    const out = ask("Tell me about Oracle Health at VA");
    expect(out.slice(0, 3).map((m) => m.type).sort()).toEqual(["capture_intel", "glossary", "idiq_vehicle"]);
  });

  it("every capture_intel item has a non-empty date", () => {
    const rows = byType("capture_intel");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.date, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("every idiq_vehicle url is the MMT tracker page with no fragment (the cards render client-side with no ids), with the primary source kept as source_url", () => {
    const rows = byType("idiq_vehicle");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.url, r.id).toMatch(/^\/idiq-tracker\.html$/);
      expect(r.url).not.toMatch(/^https?:/);
    }
    expect(rows.some((r) => /^https?:\/\//.test(r.source_url || ""))).toBe(true);
  });

  it("every contract_intel url is the path build.js writes (c.slug when present)", () => {
    const list = Array.isArray(contractsFile) ? contractsFile : contractsFile.contracts;
    const slugify = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "untitled";
    const expected = new Set(list.map((c) => `/contracts/${c.slug || slugify(c.name)}/`));
    const rows = byType("contract_intel");
    expect(rows.length).toBe(list.length);
    for (const r of rows) expect(expected.has(r.url), r.url).toBe(true);
    // The three entries whose slug is not the slugified name.
    for (const c of list.filter((c) => c.slug && c.slug !== slugify(c.name))) {
      expect(rows.some((r) => r.url === `/contracts/${c.slug}/`), c.slug).toBe(true);
    }
  });

  it("the newest Capture Corner excerpt begins with the brief, not the nav", () => {
    const cc = byType("premium_brief")
      .filter((r) => String(r.slug).startsWith("capture-corner-"))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    expect(cc).toBeTruthy();
    expect(cc.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const head = cc.excerpt.slice(0, 80);
    expect(head).not.toMatch(/MMT Premium/);
    expect(head).not.toMatch(/Capture Corner:/);
    expect(head).not.toMatch(/Sign in|&larr;|←/);
    expect(cc.excerpt.startsWith(cc.title.slice(0, 20))).toBe(true);
  });

  it("no excerpt or title still carries an encoded HTML entity", () => {
    expect(items.filter((i) => /&(mdash|middot|larr|rarr|#\d+);/.test(`${i.title} ${i.excerpt}`)).length).toBe(0);
  });

  it("the public corpus contains zero premium items and none of the premium types", () => {
    expect(publicCorpus.items.filter((i) => i.premium).length).toBe(0);
    const premiumTypes = new Set(["forecast_row", "budget_line", "cso_aoi", "key_people", "forecast_delta", "gao_sustain", "premium_brief", "monthly_brief", "capture_intel", "capture_corner"]);
    expect(publicCorpus.items.filter((i) => premiumTypes.has(i.type)).length).toBe(0);
    const fullIds = new Set(items.map((i) => i.id));
    expect(publicCorpus.items.every((i) => fullIds.has(i.id))).toBe(true);
  });

  it("formatCorpusContext on real matches never glues the host onto an absolute URL", () => {
    for (const q of ["Tell me about T4NG2", "What is the DHA enterprise CSO?", "CMS forecast FY2027"]) {
      expect(formatCorpusContext(searchCorpus(q, 5, ""))).not.toContain("missionmeetstech.comhttp");
    }
  });
});
