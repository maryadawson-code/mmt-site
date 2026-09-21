// lib/agent-allowance-copy.js: the disclosure every page and the guide share.
// Numbers come from config, unconfirmed pricing renders nothing, and the words
// follow the house voice rules.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as copy from "../../netlify/functions/lib/agent-allowance-copy.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SET = { CONFIRMED: true, CALLS_PER_MONTH: 5000, OVERAGE_USD_PER_CALL: 0.01, MAX_BILLABLE_OVERAGE_CALLS: 5000, BILLING_STARTS_MONTH: "2026-10" };
const BANNED = /pivotal|comprehensive|robust|transformative|delve|leverage|synergy|paradigm|holistic|streamline|actionable|ecosystem/i;

describe("formatting", () => {
  it("prints calls with separators and a rate with at least two decimals", () => {
    expect(copy.fmtCalls(5000)).toBe("5,000");
    expect(copy.fmtCalls(125000)).toBe("125,000");
    expect([0.01, 0.005, 0.1, 1, 0.0125, 2.5].map(copy.fmtRate)).toEqual(["$0.01", "$0.005", "$0.10", "$1.00", "$0.0125", "$2.50"]);
    expect(copy.monthName("2026-10")).toBe("October 2026");
    expect(copy.monthName("soon")).toBeNull();
  });
});

describe("the disclosure", () => {
  const all = (a) => [copy.pricingFeature(a), copy.guideSection(a), copy.panelNote(a)];
  it("quotes the configured numbers, everywhere, and nothing else", () => {
    for (const html of all(SET)) { expect(html).toMatch(/5,000 calls a month/); expect(html).toMatch(/\$0\.01/); }
    for (const html of all({ ...SET, CALLS_PER_MONTH: 7500, OVERAGE_USD_PER_CALL: 0.02, MAX_BILLABLE_OVERAGE_CALLS: 2500 })) { expect(html).toMatch(/7,500/); expect(html).toMatch(/\$0\.02/); expect(html).not.toMatch(/5,000|\$0\.01/); }
  });
  it("says only calls that return data count, that nothing is cut off, and when billing starts", () => {
    const g = copy.guideSection(SET);
    expect(g).toMatch(/Only calls that return data count/);
    expect(g).toMatch(/never billed/);
    // "Nothing is cut off" was true for one afternoon. With a limit the page says where the pause is, in calls and in dollars.
    expect(g).not.toMatch(/nothing is cut off/i);
    expect(g).toMatch(/up to 5,000 more calls \(\$50\.00\)/);
    expect(g).toMatch(/pauses until the first of the next month/);
    expect(g).toMatch(/A connection without the add-on pauses at the allowance/);
    for (const html of all(SET)) expect(html).toMatch(/pauses until/);
    // No limit configured: no pause is promised anywhere.
    for (const html of [copy.pricingFeature({ ...SET, MAX_BILLABLE_OVERAGE_CALLS: null }), copy.panelNote({ ...SET, MAX_BILLABLE_OVERAGE_CALLS: null })]) expect(html).not.toMatch(/pauses until next month/);
    expect(g).toMatch(/starts with October 2026 usage/);
    expect(g).toMatch(/id="allowance"/);
    expect(copy.guideSection({ ...SET, BILLING_STARTS_MONTH: null })).not.toMatch(/starts with/);
    expect(copy.panelNote(SET)).toMatch(/href="\/agent-access-guide#allowance"/);
  });
  it("renders nothing at all while the pricing is unconfirmed or malformed", () => {
    for (const a of [{ ...SET, CONFIRMED: false }, { ...SET, CALLS_PER_MONTH: 0 }, { ...SET, OVERAGE_USD_PER_CALL: 0 }, null, undefined]) expect(all(a)).toEqual(["", "", ""]);
  });
  it("keeps the house voice: no em dashes, no exclamation points, no banned words", () => {
    for (const html of all(SET)) { expect(html).not.toMatch(/[—!]/); expect(html).not.toMatch(/&mdash;/); expect(html).not.toMatch(BANNED); }
  });
});

describe("the pages carry the markers and build.js injects every one", () => {
  const build = readFileSync(resolve(REPO, "build.js"), "utf8");
  const pages = { "pricing.html": "BUILD:AGENT_ALLOWANCE_FEATURE", "agent-access-guide.html": "BUILD:AGENT_ALLOWANCE_GUIDE", "premium/ai-integrations.html": "BUILD:AGENT_ALLOWANCE_PANEL" };
  it("no page source still promises that nothing is cut off: with a limit, that is false", () => {
    for (const file of Object.keys(pages)) expect(readFileSync(resolve(REPO, file), "utf8")).not.toMatch(/nothing is cut off|never cut off/i);
  });
  it("a marker without an injection is decoration", () => {
    for (const [file, marker] of Object.entries(pages)) {
      expect(readFileSync(resolve(REPO, file), "utf8")).toContain(`<!-- ${marker} -->`);
      expect(build).toContain(`'<!-- ${marker} -->'`);
    }
  });
});

describe("the guide's table of contents", () => {
  it("lists the allowance section only when that section renders, and every listed anchor exists", () => {
    expect(copy.guideTocItem({ CONFIRMED: true, CALLS_PER_MONTH: 5000, OVERAGE_USD_PER_CALL: 0.01 })).toBe('<a href="#allowance">Calls, the monthly allowance and what happens past it</a>');
    expect(copy.guideTocItem({ CONFIRMED: false, CALLS_PER_MONTH: 5000, OVERAGE_USD_PER_CALL: 0.01 })).toBe("");
    const html = readFileSync(resolve(REPO, "agent-access-guide.html"), "utf8");
    const toc = html.slice(html.indexOf('class="guide-toc"'), html.indexOf('class="guide-body"'));
    const anchors = [...toc.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]);
    expect(anchors.length).toBeGreaterThanOrEqual(13);
    for (const a of anchors) expect(html, `#${a} is listed but no section has that id`).toContain(`id="${a}"`);
    expect(toc).toContain("<!-- BUILD:AGENT_ALLOWANCE_TOC -->");
    // Every h2 in the body is reachable from the list (the allowance one through its marker).
    const ids = [...html.slice(html.indexOf('class="guide-body"')).matchAll(/<h2 id="([a-z-]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(anchors, `section #${id} is missing from "On this page"`).toContain(id);
  });
});
