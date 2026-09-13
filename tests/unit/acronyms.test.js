// lib/acronyms.js: the model may expand an acronym only from a verified
// reference, and it is told which acronyms in its sources it must leave alone.

import { describe, it, expect, afterEach } from "vitest";
import { acronymReference, expandAcronym, setGlossaryLoader, candidates } from "../../netlify/functions/lib/acronyms.js";

afterEach(() => setGlossaryLoader(null));

describe("acronymReference", () => {
  it("lists FOC and friends when they appear in the context, and nothing else", () => {
    const ctx = "FY2027 DHP Medical Digital Solutions $45.7B Request FOC July 19. PEO DHMS folds into a PAE. GAO protest B-424295.1. Award HT001524F0063.";
    const r = acronymReference({ question: "DHA data governance", context: ctx });
    const known = Object.fromEntries(r.known);
    expect(known.FOC).toBe("Full Operational Capability");
    expect(known.PEO).toBe("Program Executive Office");
    expect(known.PAE).toBe("Program Acquisition Executive");
    expect(known.DHA).toBe("Defense Health Agency");
    expect(known.EHR).toBeUndefined(); // not in the context
    expect(r.block).toContain("never invent what letters stand for");
    expect(r.block).not.toContain("FY2027");
    expect(r.block).not.toContain("HT001524F0063");
  });

  it("names the acronyms it cannot verify so the model writes them as-is", () => {
    const r = acronymReference({ question: "What is the XQZP program?", context: "XQZP and MDS are mentioned." });
    expect(r.unknown).toEqual(["XQZP"]);
    expect(r.block).toContain("write them exactly as-is");
    expect(Object.fromEntries(r.known).MDS).toBe("Medical Digital Solutions");
  });

  it("MMT's glossary outranks the curated table", () => {
    setGlossaryLoader(() => new Map([["MDS", "Medical Digital Solutions (PAE)"], ["ZZQ", "Zebra Zone Quotient"]]));
    expect(expandAcronym("mds")).toBe("Medical Digital Solutions (PAE)");
    expect(expandAcronym("ZZQ")).toBe("Zebra Zone Quotient");
    expect(acronymReference({ context: "ZZQ" }).unknown).toEqual([]);
  });

  it("a broken glossary loader is ignored", () => {
    setGlossaryLoader(() => { throw new Error("corpus missing"); });
    expect(expandAcronym("FOC")).toBe("Full Operational Capability");
  });

  it("returns no block when the text carries no acronyms", () => {
    expect(acronymReference({ question: "how is the weather", context: "warm and sunny" }).block).toBe("");
  });

  it("headings and shouted records never produce 'write as-is' noise; slash pairs split; roman numerals and common words are ignored", () => {
    const ctx = [
      "MMT ORIGINAL CONTENT (Mary's own articles)",
      "USASPENDING.GOV VERIFIED AWARDS (1 total):",
      '- HT001524F0063: NEW TECH SOLUTIONS, INC. | "IMMUTA SOFTWARE FOR DATA GOVERNANCE" | award $0.29M',
      "SYSTEMS NOT REACHED THIS TURN: SAM.gov Opportunities",
      "The HHS/ONC rule and the AI/ML pilot; CMS SPARC II recompete; the XQZP program is new.",
    ].join("\n");
    const r = acronymReference({ question: "What is HHS doing?", context: ctx });
    expect(r.unknown).toEqual(["XQZP"]);
    const known = Object.fromEntries(r.known);
    expect(known.HHS).toBeTruthy();
    expect(known.ONC).toBeTruthy();
    expect(known.ML).toBe("Machine Learning");
    expect(known.SPARC).toContain("Strategic Partners");
    expect(known.SAM).toBe("System for Award Management");
    expect(r.block).not.toMatch(/\b(VERIFIED|IMMUTA|SOFTWARE|GOVERNANCE|SOLUTIONS|INC|II|GOV|SYSTEMS|REACHED)\b/);
  });

  it("candidate scan skips fiscal years, identifiers, and single capitals", () => {
    expect(candidates("FY2027 I saw a PIID HT001524F0063 and GAO-26-106756 and the NDAA")).toEqual(["PIID", "NDAA"]);
    expect(expandAcronym("PIID")).toBe("Procurement Instrument Identifier");
  });
});
