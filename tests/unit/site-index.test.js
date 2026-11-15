// The page index the site help widget answers from: the HTML-to-text split
// (scripts/lib/page-text.js), the per-page record rules and the build
// (scripts/build-site-index.js), and the runtime reader (lib/site-index.js).
//
// The property under test is the paywall. A signed-out reader is answered
// from `public_text` and nothing else, so every way the site holds content
// back from a visitor with no account has to land outside it:
//   data-access="premium", data-gate="premium", data-gate="subscriber",
//   a recent article's gated shell, a page gated by script alone, and a
//   premium page's meta description.
// The 2026-11-14 review found the first version handled only the first.

import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// One module instance for the test and the code under test (CJS singletons).
const require = createRequire(import.meta.url);
const { extractPage, isMemberOnly, cleanTitle } = require("../../scripts/lib/page-text.js");
const { pageRecord, buildIndex, corpusPages, isExcluded, isMemberPage, SCRIPT_GATED_PAGES, TITLE_ONLY_PAGES, PUBLIC_CHARS } = require("../../scripts/build-site-index.js");
const siteIndex = require("../../netlify/functions/lib/site-index.js");

const page = (body, head = "<title>Sample</title>") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("extractPage", () => {
  it("splits text by the premium gate and reports the gate", () => {
    const out = extractPage(page('<main><p>Open to all.</p><div data-access="premium"><h2>Roster</h2><p>Named principal.</p></div><p>After the gate.</p></main>'));
    expect(out.hasGate).toBe(true);
    expect(out.publicText).toBe("Open to all. After the gate.");
    expect(out.memberText).toBe("Roster Named principal.");
  });

  it.each([
    ['data-access="premium"', true],
    ["data-access='premium'", true],
    ["data-access=premium", true],
    ['class="x" DATA-ACCESS="Premium" id="y"', true],
    ['data-gate="premium"', true],
    ['data-gate="subscriber"', true],
    ['data-gate="free"', true], // the paywall script shows only "public" and "anonymous" to everyone
    ['data-access="free"', false],
    ['data-access="email"', false], // an archive article, readable by anyone
    ['data-gate="public"', false],
    ['data-gate="anonymous"', false],
    ['data-gate-overlay="premium"', false], // the upgrade pitch, shown to non-members
    ['data-accessible="premium"', false],
    ['class="premium"', false],
  ])("isMemberOnly(%s) is %s", (attrs, expected) => {
    expect(isMemberOnly(` ${attrs}`)).toBe(expected);
  });

  it("keeps a data-gate block out of public text even though it carries no data-access", () => {
    // /events ships its Premium deadline list this way.
    const out = extractPage(page('<p>Conferences and webinars.</p><div data-gate="premium" style="display:none;"><p>Oct 29: last day to order.</p></div>'));
    expect(out.publicText).toBe("Conferences and webinars.");
    expect(out.memberText).toBe("Oct 29: last day to order.");
    expect(out.hasGate).toBe(true);
  });

  it("gates a recent article's whole shell and leaves the header above it public", () => {
    const html = page(
      '<div class="hero"><h1>The Day a Doctor Said Yes</h1><p>The public summary.</p></div>' +
      '<article data-age-days="17" data-access="premium" data-early-access="false"><div id="article-body"><p>First.</p><p>Second.</p><p>Eighth paragraph, past the cutoff.</p></div></article>',
    );
    const out = extractPage(html);
    expect(out.publicText).toBe("The Day a Doctor Said Yes The public summary.");
    expect(out.memberText).toContain("Eighth paragraph");
    // An archive article is open to everyone.
    expect(extractPage(html.replace('data-access="premium"', 'data-access="email"')).publicText).toContain("Eighth paragraph");
  });

  it("keeps nested gated text gated when an inner tag is left unclosed", () => {
    const out = extractPage(page('<div data-access="premium"><ul><li>First secret<li>Second secret</ul></div><p>Public tail.</p>'));
    expect(out.memberText).toBe("First secret Second secret");
    expect(out.publicText).toBe("Public tail.");
  });

  it("drops page chrome, scripts, styles, comments, headers and forms", () => {
    const out = extractPage(page(
      '<nav>Intelligence ProposalPulse</nav><header>Site header</header><div class="dash-nav">Dashboard links</div>' +
      '<div class="premium-topbar">★ MMT Premium Key People</div>' +
      "<style>.x{color:red}</style><script>var a = '<p>not text</p>';</script><!-- <p>comment</p> -->" +
      "<main><h1>Help</h1><p>Real content.</p><button>Subscribe</button><form><label>Full Name</label><input></form></main><footer>Brand Read Tools</footer>",
    ));
    expect(out.publicText).toBe("Help Real content.");
  });

  it("treats a line break and a block boundary as a word boundary", () => {
    expect(extractPage(page("<h1>Defense Health Agency<br>Organizational Structure</h1><p>One</p><p>Two</p>")).publicText).toBe(
      "Defense Health Agency Organizational Structure One Two",
    );
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

  it("strips section suffixes from a title and leaves a real title alone", () => {
    expect(cleanTitle("Key People | Mission Meets Tech")).toBe("Key People");
    expect(cleanTitle("TEFCA — Mission Meets Tech Glossary")).toBe("TEFCA");
    // Left on, every contract page would match the word "tracker".
    expect(cleanTitle("T4NG2 (VA IT Services) — Contract Tracker")).toBe("T4NG2 (VA IT Services)");
    expect(cleanTitle("Contract Tracker")).toBe("Contract Tracker");
    expect(cleanTitle("Pursuit Calendar — 90-Day Deadline Tracker")).toBe("Pursuit Calendar — 90-Day Deadline Tracker");
  });
});

describe("pageRecord", () => {
  it("indexes a public page with its text public", () => {
    const rec = pageRecord("/help", page("<h1>User Guide</h1><p>Cancel anytime.</p>", '<title>Help &amp; User Guide</title><meta name="description" content="How to use the site.">'));
    expect(rec).toMatchObject({ url: "/help", title: "Help & User Guide", access: "public", kind: "page", in_corpus: false, tags: ["help"], member_text: "" });
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

  it("treats a page outside /premium/ that gates by script alone the same way", () => {
    // The Capture Intelligence sheet locks most rows with script; its HTML
    // has no gate marker at all.
    const url = [...SCRIPT_GATED_PAGES][0];
    expect(url).toBe("/intel/capture-intelligence-this-issue");
    expect(isMemberPage(url)).toBe(true);
    const rec = pageRecord(url, page("<h1>Capture Intelligence</h1><table><tr><td class=\"window\">Q1 FY2027 for the gated row.</td></tr></table>", "<title>Capture Intelligence</title>"));
    expect(rec).toMatchObject({ access: "premium", public_text: "" });
    expect(rec.member_text).toContain("Q1 FY2027 for the gated row.");
  });

  it("indexes a sample report and the sign-in page by title only", () => {
    const sample = pageRecord("/samples/marketpulse-report", page("<p>Illustrative score: 71 of 100.</p>", "<title>MarketPulse Brief — Sample</title>"));
    expect(sample).toMatchObject({ public_text: "", member_text: "", title: "MarketPulse Brief — Sample" });
    // /dashboard's markup carries the member view, hidden by a stylesheet rule.
    expect(TITLE_ONLY_PAGES.has("/dashboard")).toBe(true);
    const dash = pageRecord("/dashboard", page("<p>Sign in.</p><div id=\"content\"><p>Welcome back. Your Premium access is active.</p></div>", "<title>Premium Dashboard</title>"));
    expect(dash).toMatchObject({ access: "public", public_text: "", member_text: "", title: "Premium Dashboard" });
  });

  it("labels a page that is also a corpus item, and drops member text a member never reads from it", () => {
    const html = page('<h1>Recent Article</h1><article data-access="premium"><p>Gated body.</p></article>', "<title>Recent Article</title>");
    const rec = pageRecord("/newsletter/recent-article", html, { kind: "article", date: "2026-10-27" });
    expect(rec).toMatchObject({ kind: "article", date: "2026-10-27", in_corpus: true, access: "public", public_text: "Recent Article", member_text: "" });
    expect(pageRecord("/newsletter/recent-article", html).member_text).toBe("Gated body.");
  });

  it("refuses admin pages, tag listings, redirect stubs and untitled pages", () => {
    for (const url of ["/ops", "/command-center", "/premium/api-health", "/topics/dha", "/newsletter/page/3", "/demos/x", "/404"]) {
      expect(isExcluded(url)).toBe(true);
      expect(pageRecord(url, page("<p>x</p>"))).toBeNull();
    }
    expect(pageRecord("/moved", page("", '<title>Moved</title><meta http-equiv="refresh" content="0; url=/x">'))).toBeNull();
    expect(pageRecord("/untitled", page("<p>x</p>", ""))).toBeNull();
    // Contract and glossary pages are indexed now: a signed-out reader is answered from them.
    for (const url of ["/topics", "/contracts/t4ng2-va-it-services", "/glossary/tefca"]) expect(isExcluded(url)).toBe(false);
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

  it("indexes every page, labels the ones the corpus also carries, and collapses a page published twice", () => {
    const paths = fixture(
      {
        "help.html": page("<p>Help body.</p>", "<title>Help</title>"),
        "newsletter/an-article/index.html": page("<p>Article body.</p>", "<title>An Article</title>"),
        "contracts/t4ng2/index.html": page("<p>Vendor Premium</p>", "<title>T4NG2 — Contract Tracker</title>"),
        "glossary/tefca.html": page("<p>A framework.</p>", "<title>TEFCA — Mission Meets Tech Glossary</title>"),
        "idiq-tracker.html": page("<p>Every vehicle.</p>", "<title>IDIQ Tracker</title>"),
        "about-press.html": page("<p>Press body.</p>", "<title>Press</title>"),
        "about/press.html": page("<p>Press body.</p>", "<title>Press</title>"),
        "samples/a.html": page("<p>Sample body.</p>", "<title>Sample Report</title>"),
        "samples/b.html": page("<p>Sample body.</p>", "<title>Sample Report</title>"),
        "ops.html": page("<p>Admin.</p>", "<title>Ops</title>"),
        "topics/dha.html": page("<p>Tag listing.</p>", "<title>DHA</title>"),
        "premium/key-people.html": page("<p>Names.</p>", "<title>Key People</title>"),
      },
      [
        { type: "article", url: "/newsletter/an-article/", date: "2026-05-01" },
        { type: "contract_intel", url: "/contracts/t4ng2/" },
        { type: "glossary", url: "/glossary.html#term-tefca" },
        { type: "idiq_vehicle", url: "/idiq-tracker.html#one" },
        { type: "idiq_vehicle", url: "/idiq-tracker.html#two" },
      ],
    );
    const index = buildIndex(paths);
    const byUrl = Object.fromEntries(index.pages.map((p) => [p.url, p]));
    expect(Object.keys(byUrl)).toEqual(["/about-press", "/contracts/t4ng2", "/glossary/tefca", "/help", "/idiq-tracker", "/newsletter/an-article", "/premium/key-people", "/samples/a"]);
    expect(byUrl["/newsletter/an-article"]).toMatchObject({ kind: "article", date: "2026-05-01", in_corpus: true });
    expect(byUrl["/contracts/t4ng2"]).toMatchObject({ kind: "contract_intel", in_corpus: true, title: "T4NG2" });
    // A glossary item's own page is /glossary/<term>, not the hub anchor.
    expect(byUrl["/glossary/tefca"]).toMatchObject({ kind: "glossary", in_corpus: true, title: "TEFCA" });
    // A hub many items share is still a page of its own.
    expect(byUrl["/idiq-tracker"]).toMatchObject({ kind: "page", in_corpus: false });
    expect(index.counts).toEqual({ public: 7, premium: 1, also_in_corpus: 3 });
    // Written with no timestamp, so an unchanged site writes an unchanged file.
    const first = fs.readFileSync(paths.outFile, "utf8");
    buildIndex(paths);
    expect(fs.readFileSync(paths.outFile, "utf8")).toBe(first);
  });

  it("names the hub rule: a URL many corpus items share is not one page's corpus item", () => {
    const paths = fixture({}, [{ type: "article", url: "/a/", date: "2026-01-02" }, { type: "idiq_vehicle", url: "/hub#1" }, { type: "idiq_vehicle", url: "/hub#2" }]);
    expect([...corpusPages(paths.corpusFile)]).toEqual([["/a", { kind: "article", date: "2026-01-02" }]]);
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

  it("hands a signed-out caller public text only, and nothing from a premium page but its pitch", () => {
    siteIndex._setSiteIndexForTests({
      pages: [
        { url: "/premium/org-charts/dha", title: "DHA Organizational Structure", description: "Director Jane Named leads DHA.", tags: ["dha"], access: "premium", kind: "page", public_text: "Org chart is Premium", member_text: "Director: a named person." },
        { url: "/contract-tracker", title: "Contract Tracker", description: "Every tracked contract.", tags: [], access: "public", kind: "page", public_text: "Headlines.", member_text: "Vendor and value." },
        { url: "/newsletter/recent", title: "Recent Article", description: "The public card.", tags: [], access: "public", kind: "article", date: "2026-10-27", in_corpus: true, public_text: "Recent Article", member_text: "" },
      ],
    });
    const [dhaAnon, trackerAnon, articleAnon] = siteIndex.pageItems(false);
    // A premium page's meta description is written for members: withheld.
    expect(dhaAnon).toMatchObject({ type: "page", premium: true, locked: true, excerpt: "Org chart is Premium", description: "" });
    expect(trackerAnon).toMatchObject({ premium: false, locked: false, excerpt: "Headlines.", description: "Every tracked contract." });
    expect(articleAnon).toMatchObject({ type: "article", date: "2026-10-27", inCorpus: true, excerpt: "Recent Article" });
    expect(JSON.stringify([dhaAnon, trackerAnon])).not.toMatch(/named person|Jane Named|Vendor and value/);

    const [dhaMember, trackerMember] = siteIndex.pageItems(true);
    // A member is past the "this page is Premium" pitch.
    expect(dhaMember).toMatchObject({ locked: false, excerpt: "Director: a named person.", description: "Director Jane Named leads DHA." });
    expect(trackerMember.excerpt).toBe("Headlines. Vendor and value.");
    expect(siteIndex.indexSize()).toBe(3);
  });

  it("reports an index that is not in the bundle as zero pages", () => {
    siteIndex._setSiteIndexForTests({ pages: [] });
    expect(siteIndex.indexSize()).toBe(0);
  });
});
