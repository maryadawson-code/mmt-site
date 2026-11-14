// The page index the site help widget answers from: the HTML-to-text split
// (scripts/lib/page-text.js), the per-page record rules and the build
// (scripts/build-site-index.js), and the runtime reader (lib/site-index.js).
//
// The property under test is the paywall: text inside a
// [data-access="premium"] element, and every word of a script-gated
// premium page, must never be in what a signed-out caller is handed.

import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// One module instance for the test and the code under test (CJS singletons).
const require = createRequire(import.meta.url);
const { extractPage, cleanTitle } = require("../../scripts/lib/page-text.js");
const { pageRecord, buildIndex, corpusPageKeys, isExcluded, PUBLIC_CHARS } = require("../../scripts/build-site-index.js");
const siteIndex = require("../../netlify/functions/lib/site-index.js");

const page = (body, head = "<title>Sample</title>") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("extractPage", () => {
  it("splits text by the premium gate and reports the gate", () => {
    const out = extractPage(page('<main><p>Open to all.</p><div data-access="premium"><h2>Roster</h2><p>Named principal.</p></div><p>After the gate.</p></main>'));
    expect(out.hasGate).toBe(true);
    expect(out.publicText).toBe("Open to all. After the gate.");
    expect(out.memberText).toBe("Roster Named principal.");
    expect(out.memberHeadings).toEqual(["Roster"]);
    expect(out.publicText).not.toContain("Named principal");
  });

  it("keeps nested gated text gated when an inner tag is left unclosed", () => {
    const out = extractPage(page('<div data-access="premium"><ul><li>First secret<li>Second secret</ul></div><p>Public tail.</p>'));
    expect(out.memberText).toBe("First secret Second secret");
    expect(out.publicText).toBe("Public tail.");
  });

  it("drops page chrome, scripts, styles and comments", () => {
    const out = extractPage(page(
      '<nav>Intelligence ProposalPulse</nav><div class="dash-nav">Dashboard links</div>' +
      "<style>.x{color:red}</style><script>var a = '<p>not text</p>';</script><!-- <p>comment</p> -->" +
      "<main><h1>Help</h1><p>Real content.</p><button>Subscribe</button></main><footer>Brand Read Tools</footer>",
    ));
    expect(out.publicText).toBe("Help Real content.");
    expect(out.publicHeadings).toEqual(["Help"]);
  });

  it("treats a line break and a block boundary as a word boundary", () => {
    const out = extractPage(page("<h1>Defense Health Agency<br>Organizational Structure</h1><p>One</p><p>Two</p>"));
    expect(out.publicText).toBe("Defense Health Agency Organizational Structure One Two");
    expect(out.publicHeadings).toEqual(["Defense Health Agency Organizational Structure"]);
  });

  it("decodes entities and reads the title and description from the head", () => {
    const out = extractPage(page("<p>R&amp;D &middot; 30&ndash;90 seconds &#169; &#x2605;</p>", '<title>DHA Organizational Structure &middot; MMT Premium</title><meta name="description" content="Who signs &amp; who owns.">'));
    expect(out.title).toBe("DHA Organizational Structure");
    expect(out.description).toBe("Who signs & who owns.");
    expect(out.publicText).toBe("R&D · 30–90 seconds © ★");
  });

  it("flags a redirect stub", () => {
    expect(extractPage(page("", '<title>Moved</title><meta http-equiv="refresh" content="0; url=/pricing">')).isRedirect).toBe(true);
  });

  it("strips the site's title suffixes and leaves a real title alone", () => {
    expect(cleanTitle("Key People | Mission Meets Tech")).toBe("Key People");
    expect(cleanTitle("Pursuit Calendar — 90-Day Deadline Tracker")).toBe("Pursuit Calendar — 90-Day Deadline Tracker");
  });
});

describe("pageRecord", () => {
  it("indexes a public page with its text public", () => {
    const rec = pageRecord("/help", page("<h1>User Guide</h1><p>Cancel anytime.</p>", '<title>Help &amp; User Guide</title><meta name="description" content="How to use the site.">'));
    expect(rec).toMatchObject({ url: "/help", title: "Help & User Guide", access: "public", tags: ["help"], member_text: "" });
    expect(rec.public_text).toContain("Cancel anytime.");
  });

  it("keeps a gated premium page's pitch public and its content member-only", () => {
    const rec = pageRecord("/premium/org-charts/dha", page('<h2>Org chart is Premium</h2><div data-access="premium"><p>Director: a named person.</p></div>', "<title>DHA Organizational Structure</title>"));
    expect(rec.access).toBe("premium");
    expect(rec.tags).toEqual(["org", "charts", "dha"]);
    expect(rec.public_text).toBe("Org chart is Premium");
    expect(rec.member_text).toBe("Director: a named person.");
  });

  it("treats every word of a script-gated premium page as member text", () => {
    const rec = pageRecord("/premium/org-charts/cdc", page("<h1>CDC</h1><p>Director: a named person.</p>", "<title>CDC Organizational Structure</title>"));
    expect(rec.public_text).toBe("");
    expect(rec.member_text).toBe("CDC Director: a named person.");
  });

  it("indexes a sample report by title only", () => {
    const rec = pageRecord("/samples/marketpulse-report", page("<p>Illustrative score: 71 of 100.</p>", "<title>MarketPulse Brief — Sample</title>"));
    expect(rec.public_text).toBe("");
    expect(rec.member_text).toBe("");
    expect(rec.title).toBe("MarketPulse Brief — Sample");
  });

  it("refuses admin pages, tag listings, redirect stubs and untitled pages", () => {
    for (const url of ["/ops", "/command-center", "/premium/api-health", "/topics/dha", "/newsletter/page/3", "/demos/x", "/404"]) {
      expect(isExcluded(url)).toBe(true);
      expect(pageRecord(url, page("<p>x</p>"))).toBeNull();
    }
    expect(pageRecord("/moved", page("", '<title>Moved</title><meta http-equiv="refresh" content="0; url=/x">'))).toBeNull();
    expect(pageRecord("/untitled", page("<p>x</p>", ""))).toBeNull();
    expect(isExcluded("/topics")).toBe(false);
  });

  it("caps a long page", () => {
    const rec = pageRecord("/long", page(`<p>${"word ".repeat(5000)}</p>`));
    expect(rec.public_text.length).toBe(PUBLIC_CHARS);
  });
});

describe("buildIndex", () => {
  let tmp;
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  function fixture(files, corpusItems) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "site-index-"));
    const distDir = path.join(tmp, "dist");
    for (const [rel, html] of Object.entries(files)) {
      const file = path.join(distDir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html);
    }
    const corpusFile = path.join(tmp, "corpus.json");
    fs.writeFileSync(corpusFile, JSON.stringify({ items: corpusItems }));
    return { distDir, corpusFile, outFile: path.join(tmp, "out", "index.json") };
  }

  it("skips pages the corpus carries one-to-one, keeps hubs, and collapses a page published twice", () => {
    const paths = fixture(
      {
        "help.html": page("<p>Help body.</p>", "<title>Help</title>"),
        "newsletter/an-article/index.html": page("<p>Article body.</p>", "<title>An Article</title>"),
        "idiq-tracker.html": page("<p>Every vehicle.</p>", "<title>IDIQ Tracker</title>"),
        "about-press.html": page("<p>Press body.</p>", "<title>Press</title>"),
        "about/press.html": page("<p>Press body.</p>", "<title>Press</title>"),
        "samples/a.html": page("<p>Sample body.</p>", "<title>Sample Report</title>"),
        "samples/b.html": page("<p>Sample body.</p>", "<title>Sample Report</title>"),
        "ops.html": page("<p>Admin.</p>", "<title>Ops</title>"),
        "premium/key-people.html": page("<p>Names.</p>", "<title>Key People</title>"),
      },
      [
        { url: "/newsletter/an-article/" },
        { url: "/idiq-tracker.html#one" },
        { url: "/idiq-tracker.html#two" },
      ],
    );
    const index = buildIndex(paths);
    expect(index.pages.map((p) => p.url)).toEqual(["/about-press", "/help", "/idiq-tracker", "/premium/key-people", "/samples/a"]);
    expect(index.counts).toEqual({ public: 4, premium: 1 });
    // Written with no timestamp, so an unchanged site writes an unchanged file.
    const first = fs.readFileSync(paths.outFile, "utf8");
    buildIndex(paths);
    expect(fs.readFileSync(paths.outFile, "utf8")).toBe(first);
  });

  it("names the hub rule: a URL many corpus items share is not 'covered'", () => {
    const paths = fixture({}, [{ url: "/a/" }, { url: "/hub#1" }, { url: "/hub#2" }]);
    expect([...corpusPageKeys(paths.corpusFile)]).toEqual(["/a"]);
  });
});

describe("site-index runtime", () => {
  afterEach(() => siteIndex._setSiteIndexForTests(null));

  it("gives one key to every spelling of a page's URL", () => {
    for (const url of ["/premium/org-charts/dha.html", "/premium/org-charts/dha/", "https://missionmeetstech.com/premium/org-charts/dha#j6", "/Premium/Org-Charts/DHA?x=1"]) {
      expect(siteIndex.urlKey(url)).toBe("/premium/org-charts/dha");
    }
    expect(siteIndex.urlKey("/index.html")).toBe("/");
    expect(siteIndex.urlKey("/newsletter/x/index.html")).toBe("/newsletter/x");
  });

  it("hands member text to a member only, and marks a premium page locked for everyone else", () => {
    siteIndex._setSiteIndexForTests({
      pages: [
        { url: "/premium/org-charts/dha", title: "DHA Organizational Structure", tags: ["dha"], access: "premium", public_text: "Org chart is Premium", member_text: "Director: a named person." },
        { url: "/contract-tracker", title: "Contract Tracker", tags: [], access: "public", public_text: "Headlines.", member_text: "Vendor and value." },
      ],
    });
    const [dhaAnon, trackerAnon] = siteIndex.pageItems(false);
    expect(dhaAnon).toMatchObject({ type: "page", premium: true, locked: true, excerpt: "Org chart is Premium" });
    expect(trackerAnon).toMatchObject({ premium: false, locked: false, excerpt: "Headlines." });
    expect(JSON.stringify([dhaAnon, trackerAnon])).not.toMatch(/named person|Vendor and value/);

    const [dhaMember, trackerMember] = siteIndex.pageItems(true);
    // A member is past the "this page is Premium" pitch.
    expect(dhaMember).toMatchObject({ locked: false, excerpt: "Director: a named person." });
    expect(trackerMember.excerpt).toBe("Headlines. Vendor and value.");
  });
});
