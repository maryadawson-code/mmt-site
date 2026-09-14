// answer-guards: pure post-processing on a finished Ask MMT answer.
// Each guard is mutation-tested: remove the guard's effect and the matching
// test here fails (Sources tail kept, unlisted link kept, count off).

import { describe, it, expect } from "vitest";
import {
  stripSourcesSection,
  enforceLinks,
  dollarGuard,
  dollarFigures,
  allowedUrlKeys,
} from "../../netlify/functions/lib/answer-guards.js";

describe("stripSourcesSection", () => {
  it("removes a **Sources** tail and keeps the inline citation", () => {
    const answer = "**Bottom line:** DHA closed proposals in January (Mission Meets Tech, Apr 4 2026).\n\nMore detail (USASpending: PIID HT001524F0063).\n\n**Sources**\n- [Brief](https://missionmeetstech.com/x)\n- [Award](https://www.usaspending.gov/award/1)\n";
    const out = stripSourcesSection(answer);
    expect(out).toContain("(Mission Meets Tech, Apr 4 2026)");
    expect(out).toContain("(USASpending: PIID HT001524F0063)");
    expect(out).not.toMatch(/Sources/);
    expect(out).not.toContain("usaspending.gov/award/1");
    expect(out.endsWith("HT001524F0063).")).toBe(true);
  });

  it("matches the heading forms the model uses and nothing else", () => {
    expect(stripSourcesSection("Body.\n\n## Sources\n- a")).toBe("Body.");
    expect(stripSourcesSection("Body.\n\nSources:\n- a")).toBe("Body.");
    expect(stripSourcesSection("Body.\n\n**Sources:**\n- a")).toBe("Body.");
    expect(stripSourcesSection("Body.\n\n### Sources (12)\n- a")).toBe("Body.");
    // an inline mention is prose, not a heading
    expect(stripSourcesSection("Two sources disagree. Sources: both are dated.")).toBe("Two sources disagree. Sources: both are dated.");
    expect(stripSourcesSection("")).toBe("");
    expect(stripSourcesSection(null)).toBe("");
  });
});

describe("enforceLinks", () => {
  const context = "MMT ORIGINAL CONTENT\n- DHA Data Governance https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/ (2026-04-04)\nUSASPENDING\n- HT001524F0063 https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700";
  const sources = [
    { id: "usaspending", url: "https://www.usaspending.gov", links: ["https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700"] },
    { id: "congress", url: "https://www.congress.gov", links: [{ url: "https://www.congress.gov/bill/119th-congress/house-bill/1234", label: "HR 1234" }] },
  ];

  it("de-links a SAM.gov permalink that is in neither the context nor the sources", () => {
    const r = enforceLinks("See the [notice](https://sam.gov/opp/abc123/view) on SAM.gov.", context, sources);
    expect(r.answer).toBe("See the notice on SAM.gov.");
    expect(r.unlisted_link_count).toBe(1);
    expect(r.unlisted).toEqual(["https://sam.gov/opp/abc123/view"]);
  });

  it("keeps a link present in sources[].links as a string, as a {url} object, or in the context", () => {
    const answer = [
      "[award](https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700)",
      "[bill](https://www.congress.gov/bill/119th-congress/house-bill/1234)",
      "[tracker](https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/)",
      "[home](https://www.usaspending.gov)",
    ].join(" and ");
    const r = enforceLinks(answer, context, sources);
    expect(r.answer).toBe(answer);
    expect(r.unlisted_link_count).toBe(0);
  });

  it("de-links a bare URL to its hostname and leaves the sentence punctuation", () => {
    const r = enforceLinks("Check https://www.gao.gov/products/gao-26-1234. Then https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/ again.", context, sources);
    expect(r.answer).toBe("Check gao.gov. Then https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside/ again.");
    expect(r.unlisted).toEqual(["https://www.gao.gov/products/gao-26-1234"]);
  });

  it("a trailing slash is not a difference", () => {
    const r = enforceLinks("[t](https://missionmeetstech.com/contracts/dha-data-governance-wosb-set-aside)", context, sources);
    expect(r.unlisted_link_count).toBe(0);
  });

  it("tolerates missing inputs", () => {
    expect(enforceLinks("", "", [])).toEqual({ answer: "", unlisted_link_count: 0, unlisted: [] });
    expect(enforceLinks("plain text", null, null).answer).toBe("plain text");
    expect(allowedUrlKeys("", [{ links: [null, 5, { label: "x" }] }]).size).toBe(0);
  });
});

describe("dollarGuard (shadow mode)", () => {
  it("counts $34 million with no 34,000,000 in the context and leaves the answer byte-identical", () => {
    const answer = "The follow-on is worth $34 million according to the office.";
    const r = dollarGuard(answer, "USASpending: award $0.29M obligated $0.00M");
    expect(r).toEqual({ unsupported_dollar_count: 1, unsupported: ["$34 million"] });
    expect(answer).toBe("The follow-on is worth $34 million according to the office.");
  });

  it("$888.0M matches a context figure of $888,005,560.90", () => {
    expect(dollarGuard("The ceiling is $888.0M.", "Award Amount $888,005,560.90").unsupported_dollar_count).toBe(0);
  });

  it("$0.29M matches 'award $0.29M', and $286,673 matches the same rounded figure", () => {
    expect(dollarGuard("New Tech Solutions got $0.29M.", "award $0.29M").unsupported_dollar_count).toBe(0);
    expect(dollarGuard("New Tech Solutions got $286,673.", "award $0.29M").unsupported_dollar_count).toBe(0);
  });

  it("reads a context figure with no dollar sign, and counts each unsupported figure once", () => {
    const r = dollarGuard("It was $12.9 million, then $2.6B, then $15K.", "Award Amount: 12952798 ... 2.6 billion ceiling");
    expect(r.unsupported_dollar_count).toBe(1);
    expect(r.unsupported).toEqual(["$15K"]);
  });

  it("parses the forms the model writes", () => {
    expect(dollarFigures("$1.2M, $286,673, $59.5 million, $2.6B, $888,005,560.90 and $5 Tier").map((f) => f.value))
      .toEqual([1200000, 286673, 59500000, 2600000000, 888005560.9, 5]);
    expect(dollarGuard("", "")).toEqual({ unsupported_dollar_count: 0, unsupported: [] });
  });
});
