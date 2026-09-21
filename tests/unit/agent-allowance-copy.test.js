// lib/agent-allowance-copy.js: the disclosure every page and the guide share.
// Numbers come from config, unconfirmed pricing renders nothing, and the words
// follow the house voice rules.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as copy from "../../netlify/functions/lib/agent-allowance-copy.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SET = { CONFIRMED: true, CALLS_PER_MONTH: 5000, OVERAGE_USD_PER_CALL: 0.01, BILLING_STARTS_MONTH: "2026-10" };
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
    for (const html of all({ ...SET, CALLS_PER_MONTH: 7500, OVERAGE_USD_PER_CALL: 0.02 })) { expect(html).toMatch(/7,500/); expect(html).toMatch(/\$0\.02/); expect(html).not.toMatch(/5,000|\$0\.01/); }
  });
  it("says only calls that return data count, that nothing is cut off, and when billing starts", () => {
    const g = copy.guideSection(SET);
    expect(g).toMatch(/Only calls that return data count/);
    expect(g).toMatch(/never billed/);
    expect(g).toMatch(/nothing is cut off/i);
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
  it("a marker without an injection is decoration", () => {
    for (const [file, marker] of Object.entries(pages)) {
      expect(readFileSync(resolve(REPO, file), "utf8")).toContain(`<!-- ${marker} -->`);
      expect(build).toContain(`'<!-- ${marker} -->'`);
    }
  });
});
