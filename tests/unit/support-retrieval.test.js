// What the site help widget may read for one question (lib/support-retrieval.js),
// against a fixture corpus and a fixture page index.
//
// The rule under test: a signed-out caller is answered from the page index's
// public text and NOTHING else. The corpus is never read for them, because
// the corpus marks rows `premium: false` that carry fields the pages
// withhold (a tracker entry's vendor and value, a recent article's body).
// The 2026-11-14 review found the first version handed those rows to anyone.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

// The corpus and the index are process singletons; load them and the module
// under test through one require so the fixtures reach the code that reads them.
const require = createRequire(import.meta.url);
const contentIndex = require("../../netlify/functions/lib/content-index.js");
const siteIndex = require("../../netlify/functions/lib/site-index.js");
const { retrieve, linksFor, visibleItems, needsPerson, keyTerms, bestPassage, sitePath, INTENTS } = require("../../netlify/functions/lib/support-retrieval.js");

const TODAY = "2026-11-13";
const SECRET = "Zebulon Quartermain"; // appears only where a signed-out reader must not reach
const VENDOR = "Oracle Health (Cerner)";

const forecastRow = (n) => ({ id: `forecast-${n}`, type: "forecast_row", title: `CMS forecast row ${n}: enterprise support`, description: "CMS", tags: ["cms"], agency: "CMS", url: "/premium/forecast-delta", date: "2026-09-10", premium: true, excerpt: `CMS agency profile support services forecast row ${n}.` });

const CORPUS = {
  items: [
    { id: "article-public", type: "article", title: "DHA Is Replacing How It Buys", description: "The budget already voted.", tags: ["dha"], url: "/newsletter/dha-is-replacing-how-it-buys/", date: "2026-05-01", premium: false, excerpt: "DHA is reorganizing its contracting offices this year." },
    // The corpus calls a recent article public; the page gates its body.
    { id: "article-recent", type: "article", title: "The Day a Doctor Said Yes", description: "One referral, seven steps.", tags: ["va"], url: "/newsletter/the-day-a-doctor-said-yes/", date: "2026-10-27", premium: false, excerpt: `Friends, the body. Sixty million is the right number, says ${SECRET}.` },
    { id: "article-cio", type: "article", title: "The DoW CIO Makes Five New Leadership Hires", description: "CIO CIO CIO.", tags: ["cio"], url: "/newsletter/dow-cio-five-new-leadership-hires/", date: "2026-04-01", premium: false, excerpt: "The CIO named a new CIO deputy and the CIO office grew. CIO." },
    // The corpus calls a tracker row public; the page shows "Vendor Premium".
    { id: "contract-ehrm", type: "contract_intel", title: "VA EHRM (Electronic Health Record Modernization)", description: "The VA EHR program.", tags: ["va", "ehrm"], url: "/contracts/va-ehrm/", premium: false, excerpt: `VA EHRM. Vendor: ${VENDOR} / Value: $37.2B lifecycle estimate / NAICS: 541512 / MMT verdict: WATCH` },
    { id: "brief-1", type: "premium_brief", title: "DHA Reorganization: Sixteen Changes", description: `Brief summary naming ${SECRET}.`, tags: ["quartermain"], url: "/premium/briefs/capture-corner-2026-04-29.html", date: "2026-04-29", premium: true, excerpt: `Brief body naming ${SECRET}.` },
    { id: "people-1", type: "key_people", title: `${SECRET}, DHA Chief Information Officer`, description: "", tags: ["dha"], url: "/premium/key-people", date: "2026-10-19", premium: true, excerpt: `${SECRET} leads the DHA J-6.` },
    { id: "glossary-tefca", type: "glossary", title: "TEFCA", description: "Trusted Exchange Framework and Common Agreement.", tags: [], url: "/glossary.html#term-tefca", premium: false, excerpt: `A nationwide framework. Contractor note: ${SECRET} says bid early.` },
    { id: "future", type: "article", title: "DHA Org Chart Scoop", description: "Not out yet.", tags: ["dha"], url: "/newsletter/future/", date: "2026-12-25", premium: false, excerpt: "DHA org chart news held for later." },
    { id: "external", type: "contract_intel", title: "Zanzibar Vehicle", description: "zanzibar", tags: [], url: "https://sam.gov/opp/abc", premium: false, excerpt: "zanzibar zanzibar" },
    ...[1, 2, 3, 4, 5, 6].map(forecastRow),
  ],
};

const HELP_TEXT =
  "Access tiers. A subscription to the free newsletter needs no account. " + "Filler about tools and tiers. ".repeat(80) +
  "Subscription Management. Canceling: cancel monthly anytime before your next billing date. Refunds: annual subscribers can request a full refund within 14 days of any charge. " +
  "More filler. ".repeat(40) + "Contact. Product support by email.";
const PROPOSAL_TEXT =
  "ProposalPulse scores a draft. " + "Cost and pricing volumes are scored for cost credibility by ProposalPulse. ".repeat(30) +
  "Paid assessment $19.99 per additional. Premium subscribers: $14.99 (25% off). " + "More about ProposalPulse criteria. ".repeat(30);

const pg = (url, title, publicText, extra = {}) => ({ url, title, description: "", tags: url.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && w !== "premium"), access: url.startsWith("/premium/") ? "premium" : "public", kind: "page", in_corpus: false, public_text: publicText, member_text: "", ...extra });

const INDEX = {
  pages: [
    pg("/premium/org-charts/dha", "DHA Organizational Structure", "Org chart is Premium. Leadership-level org chart with named principals.", { description: `Director ${SECRET} leads DHA.`, member_text: `Director of the J-6: ${SECRET}. Deputy: another named person.` }),
    pg("/premium/org-charts/va", "VA Organizational Structure", "", { member_text: "VA OIT leadership roster." }),
    pg("/premium/org-charts/cdc", "CDC Organizational Structure", "", { description: `CDC leadership: Director ${SECRET}.`, member_text: "CDC roster." }),
    pg("/premium/key-people", "Key People", "", { description: "Named profiles of senior leaders.", member_text: "Profiles." }),
    pg("/premium/forecast-delta", "Forecast Delta Tracker", "", { member_text: "What changed in the forecasts." }),
    pg("/agencies/va", "Department of Veterans Affairs / Veterans Health Administration · Agency Intelligence", "The VA buys health IT through T4NG2."),
    pg("/agencies/cms", "Centers for Medicare & Medicaid Services · Agency Intelligence", "CMS agency profile: budget posture and open vehicles."),
    pg("/pricing", "MMT Premium", "Founding $199 a year. Annual $249 a year. Monthly $29.99.", { description: "What Premium includes.", tags: ["pricing"] }),
    pg("/help", "Help & User Guide", HELP_TEXT, { description: "How to use the site." }),
    pg("/proposal-pulse", "ProposalPulse", PROPOSAL_TEXT),
    pg("/security", "Data Security", "Documents are not stored after processing."),
    pg("/privacy", "Privacy Policy", "What is collected and why."),
    pg("/ask", "Ask MMT: research with receipts", "Ask a research question."),
    pg("/dashboard", "Premium Dashboard", ""),
    pg("/podcast", "Fed UP Podcast", "Every episode of the podcast."),
    // Pages that are also corpus items: what a signed-out reader gets instead of the corpus row.
    pg("/newsletter/dha-is-replacing-how-it-buys", "DHA Is Replacing How It Buys", "DHA is reorganizing its contracting offices this year.", { kind: "article", date: "2026-05-01", in_corpus: true }),
    pg("/newsletter/the-day-a-doctor-said-yes", "The Day a Doctor Said Yes", "The Day a Doctor Said Yes. One referral, seven steps.", { kind: "article", date: "2026-10-27", in_corpus: true }),
    pg("/newsletter/dow-cio-five-new-leadership-hires", "The DoW CIO Makes Five New Leadership Hires", "The CIO named a new CIO deputy and the CIO office grew. CIO.", { kind: "article", date: "2026-04-01", in_corpus: true }),
    pg("/contracts/va-ehrm", "VA EHRM (Electronic Health Record Modernization)", "VA EHRM. The VA EHR program. Vendor Premium Value Premium NAICS Premium", { kind: "contract_intel", in_corpus: true }),
    pg("/glossary/tefca", "TEFCA", "Trusted Exchange Framework and Common Agreement. A nationwide framework.", { kind: "glossary", in_corpus: true }),
    pg("/premium/briefs/capture-corner-2026-04-29", "DHA Reorganization: Sixteen Changes", "", { kind: "premium_brief", date: "2026-04-29", in_corpus: true }),
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
const anon = (q, opts = {}) => retrieve(q, { today: TODAY, ...opts });
const member = (q, opts = {}) => retrieve(q, { member: true, today: TODAY, ...opts });

describe("the question that started this", () => {
  it("returns the DHA org chart first for a signed-out reader, locked, with only its public pitch", () => {
    const sources = anon("Where can I find the DHA org chart?");
    expect(sources[0]).toMatchObject({ n: 1, url: "/premium/org-charts/dha", access: "premium", locked: true });
    expect(sources[0].passage).toContain("Org chart is Premium");
    expect(sources[0].nav).toBeGreaterThan(0);
    expect(JSON.stringify(sources)).not.toContain(SECRET);
  });

  it("returns it first for a member, unlocked, with the page's own content", () => {
    const sources = member("Where can I find the DHA org chart?");
    expect(sources[0]).toMatchObject({ url: "/premium/org-charts/dha", locked: false });
    expect(sources[0].passage).toContain(SECRET);
    expect(sources[0].passage).not.toContain("Org chart is Premium");
  });

  it("tells a two-letter agency apart whether or not it is capitalized", () => {
    expect(anon("do you have a va org chart")[0].url).toBe("/premium/org-charts/va");
    expect(member("Do you have a VA org chart?")[0].url).toBe("/premium/org-charts/va");
  });
});

describe("a signed-out caller is answered from the page index's public text and nothing else", () => {
  it("never puts a corpus row in the signed-out candidate list", () => {
    const items = visibleItems(false);
    expect(items.length).toBe(INDEX.pages.length);
    for (const item of items) {
      expect(item.id.startsWith("page:")).toBe(true);
      if (item.premium) expect(item).toMatchObject({ locked: true, description: "" });
    }
    expect(JSON.stringify(items)).not.toContain(SECRET);
    expect(JSON.stringify(items)).not.toContain(VENDOR);
  });

  it("answers a tracker question from the page's placeholders, not the corpus row's vendor and value", () => {
    const [top] = anon("Who is the vendor on the VA EHRM contract and what is it worth?");
    expect(top.url).toBe("/contracts/va-ehrm");
    expect(top.passage).toContain("Vendor Premium");
    expect(top.passage).not.toMatch(/Oracle|37\.2B|541512|MMT verdict/);
    // A member is answered from the corpus row.
    expect(member("Who is the vendor on the VA EHRM contract and what is it worth?").find((s) => s.type === "contract_intel").passage).toContain(VENDOR);
  });

  it("answers from a recent article's public header, never its gated body", () => {
    const sources = anon("What does The Day a Doctor Said Yes say about sixty million?");
    const article = sources.find((s) => s.url === "/newsletter/the-day-a-doctor-said-yes");
    expect(article.passage).toBe("The Day a Doctor Said Yes. One referral, seven steps.");
    expect(JSON.stringify(sources)).not.toMatch(/Sixty million is the right number/);
  });

  it("names a premium page without its meta description, which is written for members", () => {
    const [top] = anon("Who is the CDC director?");
    expect(top).toMatchObject({ url: "/premium/org-charts/cdc", locked: true, passage: "" });
  });

  it("gives a glossary term from its page, without the contractor note the page truncates", () => {
    const [top] = anon("what is TEFCA");
    expect(top.url).toBe("/glossary/tefca");
    expect(top.passage).not.toContain("Contractor note");
    expect(member("what is TEFCA")[0].url).toBe("/glossary.html#term-tefca");
  });

  it("cannot be used to probe gated text: a word only behind a gate retrieves nothing", () => {
    expect(anon("Quartermain")).toEqual([]);
    expect(member("Quartermain").length).toBeGreaterThan(0);
  });

  it("shows structured premium rows to members only", () => {
    expect(visibleItems(false).some((i) => i.type === "key_people")).toBe(false);
    expect(visibleItems(true).some((i) => i.type === "key_people")).toBe(true);
  });

  it("does not hand a member the same page twice (the corpus item and its page)", () => {
    const items = visibleItems(true);
    expect(items.some((i) => i.id === "page:/newsletter/dha-is-replacing-how-it-buys")).toBe(false);
    expect(items.some((i) => i.id === "article-public")).toBe(true);
    expect(items.some((i) => i.id === "page:/pricing")).toBe(true);
  });
});

describe("people and agency questions", () => {
  it("leads with the named agency's org chart even when a topic acronym pulls elsewhere", () => {
    // "CIO" used to rank the CIO article above the DHA chart.
    expect(anon("Who is the DHA CIO?")[0]).toMatchObject({ url: "/premium/org-charts/dha", locked: true });
    expect(anon("Who is the VA CIO?")[0].url).toBe("/premium/org-charts/va");
    expect(anon("Who leads the DHA J-6?")[0].url).toBe("/premium/org-charts/dha");
  });

  it("does not treat a question about a company as a people question", () => {
    expect(anon("Who is the vendor on the VA EHRM contract?")[0].url).toBe("/contracts/va-ehrm");
  });

  it("finds an agency named only by a two-letter acronym", () => {
    // The scorer's tokens start at three letters; this used to return nothing.
    expect(anon("Tell me about the VA")[0].url).toBe("/agencies/va");
    expect(anon("Where is the VA page?")[0].url).toBe("/agencies/va");
  });

  it("does not let one dataset's rows fill a member's answer or repeat a page", () => {
    const sources = member("CMS agency profile");
    expect(urls(sources).slice(0, 2)).toContain("/agencies/cms");
    expect(new Set(urls(sources)).size).toBe(sources.length);
    expect(urls(sources).filter((u) => u === "/premium/forecast-delta").length).toBeLessThanOrEqual(1);
  });
});

describe("help questions reach the page that answers them", () => {
  it.each([
    ["How much does Premium cost?", "/pricing"],
    ["What does Premium include?", "/pricing"],
    ["How do I cancel my subscription?", "/help"],
    ["I can't sign in to my dashboard", ["/help", "/dashboard"]],
    ["How do I talk to a person?", "/help"],
    ["Is my data private?", ["/security", "/privacy"]],
    ["Where is Ask MMT?", "/ask"],
    ["Is there a podcast?", "/podcast"],
  ])("%s", (question, expected) => {
    const top = anon(question)[0];
    expect(top).toBeDefined();
    expect([].concat(expected)).toContain(top.url);
  });

  it("does not answer a question about an agency with MMT's prices or MMT's support desk", () => {
    expect(anon("How much does DHA spend on IT?")[0].url).not.toBe("/pricing");
    expect(anon("How do I contact DHA contracting?")[0].url).not.toBe("/help");
    expect(urls(anon("How much does the government spend on health IT budgets?"))).not.toContain("/pricing");
  });

  it("opens the passage on the section that answers, not the first mention", () => {
    const [help] = anon("How do I cancel my subscription and can I get a refund?");
    expect(help.url).toBe("/help");
    expect(help.passage).toContain("cancel monthly anytime");
    expect(help.passage).toContain("refund within 14 days");
  });

  it("shows the model the price line for a product, which says a dollar figure and not the word cost", () => {
    const sources = anon("How much does ProposalPulse cost?");
    const product = sources.find((s) => s.url === "/proposal-pulse");
    expect(product.passage).toContain("$19.99");
  });

  it("returns nothing for a question the site has no page on", () => {
    expect(anon("what is the weather in Boston")).toEqual([]);
    expect(anon("where is it")).toEqual([]);
  });
});

// 2026-11-19: ten new glossary pages reached main and "Where is the IDIQ
// tracker?" started leading with the glossary entry for IDIQ. The first fix
// matched title words by their opening, which sent "Where do I sign in?" to
// a page called Signal Chain. These pin what replaced both.
describe("the page named by the question outranks a page that only repeats its words", () => {
  const GLOSSARY_IDIQ = "IDIQ. Indefinite Delivery, Indefinite Quantity. " + "An IDIQ vehicle is tracked in the IDIQ tracker. Official sources for IDIQ. ".repeat(12);
  const withPages = (...extra) => siteIndex._setSiteIndexForTests({ pages: [...INDEX.pages, ...extra] });

  it("leads with the tracker, not the glossary entry that says its name twelve times", () => {
    withPages(
      pg("/idiq-tracker", "IDIQ Vehicle Tracker", "Every IDIQ vehicle MMT follows, with ceilings and ordering periods."),
      pg("/glossary/idiq", "IDIQ", GLOSSARY_IDIQ, { kind: "glossary" }),
    );
    expect(anon("Where is the IDIQ tracker?")[0].url).toBe("/idiq-tracker");
    expect(member("Where is the IDIQ tracker?")[0].url).toBe("/idiq-tracker");
    // The glossary entry is still the answer to the question it is named for.
    expect(anon("What does IDIQ mean?")[0].url).toBe("/glossary/idiq");
  });

  it("matches a title word in its own form: sign is not signal", () => {
    withPages(pg("/premium/signal-chain", "Signal Chain", "Signal Chain is Premium. Signals in the order they arrived. A sign of what is coming."));
    // The scorer finds "sign" inside "signal", so the page is a candidate.
    // Its title does not carry the word, and it is not reported as a match.
    const hit = anon("What is a good sign?").find((s) => s.url === "/premium/signal-chain");
    expect(hit).toBeDefined();
    expect(hit.nav).toBe(0);
    // The page is found by its own name.
    const [named] = anon("Where is the signal chain?");
    expect(named.url).toBe("/premium/signal-chain");
    expect(named.nav).toBe(2);
  });

  it("counts the section a page sits in: a question about a Premium page finds it", () => {
    withPages(pg("/premium/calendar", "Pursuit Calendar", "Pursuit Calendar is Premium. Ninety days of deadlines."));
    const [hit] = anon("Is the calendar Premium?");
    expect(hit.url).toBe("/premium/calendar");
    expect(hit.locked).toBe(true);
    expect(hit.nav).toBe(2); // "calendar" from the title, "premium" from the URL
  });

  it("leaves a routed question to its route even when another title carries every word", () => {
    // Titled with every word of the question; the price page is still the answer.
    withPages(
      pg("/newsletter/what-premium-cost-us", "What Premium Cost Us", "A story about what the premium on a bid cost us.", { kind: "article", date: "2026-03-01", tags: ["premium", "cost"] }),
      pg("/premium/cost-realism", "Cost Realism Notes", "Cost Realism Notes is Premium. How evaluators read a cost volume."),
    );
    expect(anon("How much does Premium cost?")[0].url).toBe("/pricing");
    expect(member("How much does Premium cost?")[0].url).toBe("/pricing");
  });

  it("routes a sign-up question, which shares no word with the page that answers it", () => {
    withPages(
      pg("/newsletter", "Subscribe", "Free. Subscribe now. Every Tuesday and Friday."),
      pg("/newsletter/the-digital-signal", "The Silent Crisis and the Digital Signal", "A signal. Designed to be a signal. ".repeat(10), { kind: "article", date: "2026-02-01" }),
    );
    expect(["/newsletter", "/pricing"]).toContain(anon("How do I sign up?")[0].url);
    expect(["/newsletter", "/pricing"]).toContain(anon("How do I join?")[0].url);
    // A question about an agency is not about joining MMT.
    expect(anon("How do I join the DHA vendor list?")[0].url).not.toBe("/pricing");
  });

  it("reads the two shortenings readers use, and no others", () => {
    withPages(pg("/this-issue", "Capture Intelligence", "Capture intelligence: the signals in this issue."));
    expect(anon("Where is capture intelligence?")[0]).toMatchObject({ url: "/this-issue", nav: 2 });
    expect(anon("Where is capture intel?")[0]).toMatchObject({ url: "/this-issue", nav: 2 });
    // "cap" is not a shortening anyone agreed on.
    expect(anon("Where is the cap intel?")[0]).toMatchObject({ url: "/this-issue", nav: 1 });
  });

  it("reads a plural or an -ing form as the word it is", () => {
    expect(keyTerms("pricing prices")).toEqual(["pric"]);
    expect(keyTerms("signals")).not.toEqual(keyTerms("sign"));
  });
});

describe("follow-ups", () => {
  const history = [{ question: "Where can I find the DHA org chart?", answer: "It is a Premium page." }];

  it("reads a connective or a bare agency name with the question before it, swapping the agency", () => {
    expect(anon("and for VA?", { history })[0].url).toBe("/premium/org-charts/va");
    expect(anon("VA?", { history })[0].url).toBe("/premium/org-charts/va");
    // Without the earlier question the same words have no org chart to mean.
    expect(urls(anon("and for VA?"))).not.toContain("/premium/org-charts/va");
  });

  it("lets a short question that stands on its own stand on its own", () => {
    // "Is there a podcast?" used to be answered with the DHA org chart again.
    expect(anon("Is there a podcast?", { history })[0].url).toBe("/podcast");
    expect(anon("podcast?", { history })[0].url).toBe("/podcast");
    expect(anon("How much does Premium cost?", { history })[0].url).toBe("/pricing");
    expect(anon("How do I cancel?", { history })[0].url).toBe("/help");
  });
});

describe("needsPerson", () => {
  it.each([
    ["How do I cancel my subscription?", true],
    ["Can I get a refund?", true],
    ["I was charged twice", true],
    ["My scorecard never arrived", true],
    ["I can't see premium content", true],
    ["How do I talk to a person?", true],
    ["Where is the DHA org chart?", false],
    ["How much does Premium cost?", false],
    ["what is TEFCA", false],
    ["How do I contact DHA contracting?", false],
  ])("%s -> %s", (question, expected) => {
    expect(needsPerson(question)).toBe(expected);
  });
});

describe("result hygiene", () => {
  it("holds a member's corpus article until its publish date, the same gate as the site", () => {
    expect(urls(member("DHA org chart scoop"))).not.toContain("/newsletter/future/");
    expect(urls(member("DHA org chart scoop", { today: "2026-12-26" }))).toContain("/newsletter/future/");
  });

  it("never returns a source that is not a page on this site", () => {
    expect(member("zanzibar")).toEqual([]);
    expect(sitePath("https://missionmeetstech.com/pricing")).toBe("/pricing");
    expect(sitePath("https://sam.gov/opp/abc")).toBe("");
    expect(sitePath("//evil.example/x")).toBe("");
  });

  it("numbers sources from 1 in rank order and reports title matches", () => {
    const sources = member("DHA org chart");
    expect(sources.map((s) => s.n)).toEqual(sources.map((_, i) => i + 1));
    for (const s of sources) expect(typeof s.nav).toBe("number");
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
    expect(keyTerms("is it private")).toEqual(["privat"]);
    // Word forms meet, and a longer word that merely starts the same does not.
    expect(keyTerms("pricing prices agencies includes")).toEqual(["pric", "agency", "includ"]);
    expect(keyTerms("sign")).not.toEqual(keyTerms("signal"));
    expect(keyTerms("VA pricing")).toEqual(["va", "pric"]);
    expect(keyTerms("what does IT mean")).toContain("it");
    expect(keyTerms("what does it mean")).not.toContain("it");
    // All capitals mark nothing.
    expect(keyTerms("WHERE IS THE DHA ORG CHART")).toEqual(["dha", "org", "chart"]);
  });

  it("bestPassage returns short text whole and marks where long text was cut", () => {
    expect(bestPassage("short text", ["short"], [], 100)).toBe("short text");
    const long = `${"alpha ".repeat(200)}the refund policy and how to cancel ${"omega ".repeat(200)}`;
    const passage = bestPassage(long, ["refund", "cancel"], [], 200);
    expect(passage).toContain("refund policy and how to cancel");
    expect(passage.startsWith("...")).toBe(true);
    expect(passage.endsWith(" ...")).toBe(true);
    expect(passage.length).toBeLessThanOrEqual(200 + 8);
  });

  it("bestPassage puts the question's own words ahead of intent vocabulary, and a hint ahead of both", () => {
    const text = `${"premium annual monthly founding pricing. ".repeat(20)}${"filler ".repeat(100)}seats: up to 5 seats for an Institutional team. ${"filler ".repeat(100)}`;
    // The densest run of plan words is at the start; the answer is not.
    expect(bestPassage(text, ["seat", "institutional"], ["pric", "premium", "annual"], 160)).toContain("up to 5 seats");
    const priced = `${"proposalpulse cost credibility. ".repeat(20)}${"filler ".repeat(100)}Paid assessment $19.99 each. ${"filler ".repeat(100)}`;
    expect(bestPassage(priced, ["proposalpulse", "cost"], [], 160)).not.toContain("$19.99");
    expect(bestPassage(priced, ["proposalpulse", "cost"], [], 160, [/\$\d/])).toContain("$19.99");
  });

  it("every intent names where it routes", () => {
    for (const intent of INTENTS) {
      expect(Boolean(intent.pages && intent.pages.length) || Boolean(intent.prefix)).toBe(true);
      expect(intent.words.length).toBeGreaterThan(0);
    }
  });
});
