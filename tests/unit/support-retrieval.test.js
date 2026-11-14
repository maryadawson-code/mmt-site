// What the site help widget may read for one question (lib/support-retrieval.js),
// against a fixture corpus and a fixture page index.
//
// The paywall is enforced before scoring. So for a signed-out caller these
// assert three things: no gated text in a passage, no gated item returned
// unlocked, and no ranking that could only come from reading gated text.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

// The corpus and the index are process singletons; load them and the module
// under test through one require so the fixtures reach the code that reads them.
const require = createRequire(import.meta.url);
const contentIndex = require("../../netlify/functions/lib/content-index.js");
const siteIndex = require("../../netlify/functions/lib/site-index.js");
const { retrieve, linksFor, visibleItems, keyTerms, bestPassage, sitePath, INTENTS } = require("../../netlify/functions/lib/support-retrieval.js");

const TODAY = "2026-11-13";
const SECRET = "Zebulon Quartermain"; // appears only behind a gate

const CORPUS = {
  items: [
    { id: "article-public", type: "article", title: "DHA Is Replacing How It Buys", description: "The budget already voted.", tags: ["dha"], url: "/newsletter/dha-is-replacing-how-it-buys/", date: "2026-05-01", premium: false, excerpt: "DHA is reorganizing its contracting offices this year." },
    { id: "article-premium", type: "article", title: "The Reorg Lives in the Loading Dock", description: "A premium article card.", tags: ["logistics"], url: "/newsletter/the-reorg-lives/", date: "2026-06-01", premium: true, excerpt: `Gated article body naming ${SECRET}.` },
    { id: "brief-1", type: "premium_brief", title: "DHA Reorganization: Sixteen Changes", description: `Brief summary naming ${SECRET}.`, tags: ["quartermain"], url: "/premium/briefs/capture-corner-2026-04-29.html", date: "2026-04-29", premium: true, excerpt: `Brief body naming ${SECRET}.` },
    { id: "people-1", type: "key_people", title: `${SECRET}, DHA Chief Information Officer`, description: "", tags: ["dha"], url: "/premium/key-people", date: "2026-10-19", premium: true, excerpt: `${SECRET} leads the DHA J-6.` },
    { id: "glossary-tefca", type: "glossary", title: "TEFCA", description: "Trusted Exchange Framework and Common Agreement.", tags: [], url: "/glossary.html#term-tefca", premium: false, excerpt: "A nationwide framework for health information exchange." },
    { id: "future", type: "article", title: "DHA Org Chart Scoop", description: "Not out yet.", tags: ["dha"], url: "/newsletter/future/", date: "2026-12-25", premium: false, excerpt: "DHA org chart news held for later." },
    { id: "external", type: "contract_intel", title: "Zanzibar Vehicle", description: "zanzibar", tags: [], url: "https://sam.gov/opp/abc", premium: false, excerpt: "zanzibar zanzibar" },
  ],
};

const HELP_TEXT =
  "Access tiers. A subscription to the free newsletter needs no account. " + "Filler about tools and tiers. ".repeat(80) +
  "Subscription Management. Canceling: cancel monthly anytime before your next billing date. Refunds: annual subscribers can request a full refund within 14 days of any charge. " +
  "More filler. ".repeat(40);

const INDEX = {
  pages: [
    { url: "/premium/org-charts/dha", title: "DHA Organizational Structure", description: "", tags: ["org", "charts", "dha"], access: "premium", public_text: "Org chart is Premium. Leadership-level org chart with named principals.", member_text: `Director of the J-6: ${SECRET}. Deputy: another named person.` },
    { url: "/premium/org-charts/va", title: "VA Organizational Structure", description: "", tags: ["org", "charts", "va"], access: "premium", public_text: "", member_text: "VA OIT leadership roster." },
    { url: "/premium/key-people", title: "Key People", description: "Named profiles of senior leaders.", tags: ["key", "people"], access: "premium", public_text: "", member_text: "Profiles." },
    { url: "/pricing", title: "MMT Premium", description: "What Premium includes.", tags: ["pricing"], access: "public", public_text: "Founding $199 a year. Annual $249 a year. Monthly $29.99.", member_text: "" },
    { url: "/help", title: "Help & User Guide", description: "How to use the site.", tags: ["help"], access: "public", public_text: HELP_TEXT, member_text: "" },
    { url: "/security", title: "Data Security", description: "How documents are handled.", tags: ["security"], access: "public", public_text: "Documents are not stored after processing.", member_text: "" },
    { url: "/privacy", title: "Privacy Policy", description: "", tags: ["privacy"], access: "public", public_text: "What is collected and why.", member_text: "" },
    { url: "/ask", title: "Ask MMT: research with receipts", description: "", tags: ["ask"], access: "public", public_text: "Ask a research question.", member_text: "" },
    { url: "/dashboard", title: "Premium Dashboard", description: "", tags: ["dashboard"], access: "public", public_text: "Sign in with your subscriber email.", member_text: "" },
  ],
};

beforeEach(() => {
  contentIndex._setCorpusForTests(CORPUS);
  siteIndex._setSiteIndexForTests(INDEX);
});
afterEach(() => {
  contentIndex._setCorpusForTests(null);
  siteIndex._setSiteIndexForTests(null);
});

const urls = (sources) => sources.map((s) => s.url);

describe("the question that started this", () => {
  it("returns the DHA org chart first for a signed-out reader, locked, with only its public preview", () => {
    const sources = retrieve("Where can I find the DHA org chart?", { today: TODAY });
    expect(sources[0]).toMatchObject({ n: 1, url: "/premium/org-charts/dha", access: "premium", locked: true });
    expect(sources[0].passage).toContain("Org chart is Premium");
    expect(JSON.stringify(sources)).not.toContain(SECRET);
  });

  it("returns it first for a member, unlocked, with the page's own content", () => {
    const sources = retrieve("Where can I find the DHA org chart?", { member: true, today: TODAY });
    expect(sources[0]).toMatchObject({ url: "/premium/org-charts/dha", locked: false });
    expect(sources[0].passage).toContain(SECRET);
    expect(sources[0].passage).not.toContain("Org chart is Premium");
  });

  it("tells a two-letter agency apart whether or not it is capitalized", () => {
    expect(retrieve("do you have a va org chart", { today: TODAY })[0].url).toBe("/premium/org-charts/va");
    expect(retrieve("Do you have a VA org chart?", { member: true, today: TODAY })[0].url).toBe("/premium/org-charts/va");
  });
});

describe("the paywall holds for a signed-out caller", () => {
  it("never puts a gated item in the candidate list unlocked", () => {
    for (const item of visibleItems(false)) {
      if (item.premium) expect(item.locked).toBe(true);
    }
    expect(JSON.stringify(visibleItems(false))).not.toContain(SECRET);
  });

  it("hides structured premium rows entirely, because their titles are the data", () => {
    expect(visibleItems(false).some((i) => i.type === "key_people")).toBe(false);
    expect(visibleItems(true).some((i) => i.type === "key_people")).toBe(true);
  });

  it("teases a premium article by its card and a premium brief by its headline only", () => {
    const article = visibleItems(false).find((i) => i.id === "article-premium");
    expect(article).toMatchObject({ locked: true, excerpt: "", description: "A premium article card.", tags: ["logistics"] });
    const brief = visibleItems(false).find((i) => i.id === "brief-1");
    expect(brief).toMatchObject({ locked: true, excerpt: "", description: "", tags: [] });
  });

  it("cannot be used to probe gated text: a word only behind the gate retrieves nothing", () => {
    expect(retrieve("Quartermain", { today: TODAY })).toEqual([]);
    const forMember = retrieve("Quartermain", { member: true, today: TODAY });
    expect(forMember.length).toBeGreaterThan(0);
  });

  it("routes a 'who leads' question to the locked page, not to a public page that happens to mention DHA", () => {
    const sources = retrieve("Who leads the DHA J-6?", { today: TODAY });
    expect(sources[0].url).toBe("/premium/org-charts/dha");
    expect(sources[0].locked).toBe(true);
  });
});

describe("help questions reach the page that answers them", () => {
  it.each([
    ["How much does Premium cost?", "/pricing"],
    ["How do I cancel my subscription?", "/help"],
    ["I can't sign in to my dashboard", ["/help", "/dashboard"]],
    ["How do I talk to a person?", "/help"],
    ["Is my data private?", ["/security", "/privacy"]],
    ["Where is Ask MMT?", "/ask"],
    ["what is TEFCA", "/glossary.html#term-tefca"],
  ])("%s", (question, expected) => {
    const top = retrieve(question, { today: TODAY })[0];
    expect(top).toBeDefined();
    expect([].concat(expected)).toContain(top.url);
  });

  it("opens the passage on the section that answers, not the first mention", () => {
    const [help] = retrieve("How do I cancel my subscription and can I get a refund?", { today: TODAY });
    expect(help.url).toBe("/help");
    expect(help.passage).toContain("cancel monthly anytime");
    expect(help.passage).toContain("refund within 14 days");
  });

  it("returns nothing for a question the site has no page on", () => {
    expect(retrieve("what is the weather in Boston", { today: TODAY })).toEqual([]);
    expect(retrieve("where is it", { today: TODAY })).toEqual([]);
  });

  it("reads a short follow-up with the question it follows", () => {
    const history = [{ question: "Where can I find the DHA org chart?", answer: "It is a Premium page." }];
    expect(retrieve("and for VA?", { history, today: TODAY })[0].url).toBe("/premium/org-charts/va");
    expect(retrieve("VA?", { history, today: TODAY })[0].url).toBe("/premium/org-charts/va");
    // Without the earlier question the same words find nothing to anchor on.
    expect(retrieve("and for VA?", { today: TODAY }).map((s) => s.url)).not.toContain("/premium/org-charts/va");
  });

  it("lets a short question that stands on its own stand on its own", () => {
    const history = [{ question: "Where can I find the DHA org chart?", answer: "It is a Premium page." }];
    expect(retrieve("How much does Premium cost?", { history, today: TODAY })[0].url).toBe("/pricing");
    expect(retrieve("How do I cancel?", { history, today: TODAY })[0].url).toBe("/help");
  });
});

describe("result hygiene", () => {
  it("holds an article until its publish date, the same gate as the site", () => {
    expect(urls(retrieve("DHA org chart scoop", { today: TODAY }))).not.toContain("/newsletter/future/");
    expect(urls(retrieve("DHA org chart scoop", { today: "2026-12-26" }))).toContain("/newsletter/future/");
  });

  it("never returns a source that is not a page on this site", () => {
    expect(retrieve("zanzibar", { today: TODAY })).toEqual([]);
    expect(sitePath("https://missionmeetstech.com/pricing")).toBe("/pricing");
    expect(sitePath("https://sam.gov/opp/abc")).toBe("");
    expect(sitePath("//evil.example/x")).toBe("");
  });

  it("numbers sources from 1 in rank order", () => {
    const sources = retrieve("DHA org chart", { member: true, today: TODAY });
    expect(sources.map((s) => s.n)).toEqual(sources.map((_, i) => i + 1));
  });

  it("links each page once, in rank order, capped", () => {
    const links = linksFor([
      { title: "A", url: "/a", access: "public" },
      { title: "A again", url: "/a.html#x", access: "public" },
      { title: "B", url: "/premium/b", access: "premium" },
      { title: "C", url: "/c", access: "public" },
    ], 2);
    expect(links).toEqual([{ title: "A", url: "/a", access: "public" }, { title: "B", url: "/premium/b", access: "premium" }]);
  });
});

describe("pure helpers", () => {
  it("keyTerms keeps what the question is about and drops how it was asked", () => {
    expect(keyTerms("Where can I find the DHA org chart on MMT?")).toEqual(["dha", "org", "chart"]);
    expect(keyTerms("is it private")).toEqual(["private"]);
    expect(keyTerms("VA pricing")).toEqual(["va", "pric"]);
    expect(keyTerms("what does IT mean")).toContain("it");
    expect(keyTerms("what does it mean")).not.toContain("it");
  });

  it("bestPassage returns short text whole and marks where long text was cut", () => {
    expect(bestPassage("short text", ["short"], 100)).toBe("short text");
    const long = `${"alpha ".repeat(200)}the refund policy and how to cancel ${"omega ".repeat(200)}`;
    const passage = bestPassage(long, ["refund", "cancel"], 200);
    expect(passage).toContain("refund policy and how to cancel");
    expect(passage.startsWith("...")).toBe(true);
    expect(passage.endsWith(" ...")).toBe(true);
    expect(passage.length).toBeLessThanOrEqual(200 + 8);
  });

  it("every intent names where it routes", () => {
    for (const intent of INTENTS) {
      expect(Boolean(intent.pages && intent.pages.length) || Boolean(intent.prefix)).toBe(true);
      expect(intent.words.length).toBeGreaterThan(0);
    }
  });
});
