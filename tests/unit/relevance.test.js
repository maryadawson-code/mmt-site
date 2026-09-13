// lib/relevance.js: a returned record earns its place in the sources list
// only if it carries the question's phrase or enough of its specific terms.

import { describe, it, expect } from "vitest";
import { isRelevant, filterRelevant, specificTerms } from "../../netlify/functions/lib/relevance.js";

const DHA_Q = "Tell me all about data governence awards in the DHA";

describe("isRelevant", () => {
  it("drops the loose full-text hits from the 2026-09-13 pass", () => {
    expect(isRelevant("Renewal of Department of Defense Federal Advisory Committees; Defense Business Board", DHA_Q)).toBe(false);
    expect(isRelevant("Title 12 § 1033.341 Data provider access requirements", "data governance")).toBe(false);
    expect(isRelevant("Title 17 § 49.20 Duties and core principles of swap data repositories", "data governance")).toBe(false);
    expect(isRelevant("Regulation for Federal Financial Assistance", DHA_Q)).toBe(false);
  });

  it("keeps records that carry the phrase or the specific term", () => {
    expect(isRelevant("IMMUTA SOFTWARE FOR DATA GOVERNANCE", DHA_Q)).toBe(true);
    expect(isRelevant("HHS Data Governance Board Membership", "data governance")).toBe(true);
    expect(isRelevant("DHA Enterprise Governance Charter", DHA_Q)).toBe(true);
  });

  it("generic words never carry relevance on their own", () => {
    expect(specificTerms(DHA_Q)).toEqual(["governance"]);
    expect(isRelevant("Federal health data systems modernization", DHA_Q)).toBe(false);
  });

  it("with several specific terms, half of them is enough", () => {
    const q = "What has the Department of Defense bought for ambient scribe?";
    expect(specificTerms(q).sort()).toEqual(["ambient", "scribe"]);
    expect(isRelevant("Ambient AI documentation pilot", q)).toBe(true);
    expect(isRelevant("Clinical documentation improvement", q)).toBe(false);
  });

  it("an agency-only question has nothing to judge by and keeps the record", () => {
    expect(isRelevant("CDC Data Modernization Initiative awards", "Show me CDC awards")).toBe(true);
  });

  it("filterRelevant judges on the named fields and never throws", () => {
    const rows = [
      { title: "Something else", abstract: "governance of data at the department" },
      { title: "Unrelated notice", abstract: "advisory committee renewal" },
      null,
    ];
    expect(filterRelevant(rows, "data governance", ["title", "abstract"]).length).toBe(1);
    expect(filterRelevant(rows, "data governance", ["title"]).length).toBe(0);
    expect(filterRelevant(undefined, "x")).toEqual([]);
  });
});
