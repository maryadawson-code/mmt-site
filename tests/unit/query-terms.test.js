// query-terms: the question-to-keyword step that was missing on 2026-09-10.
// The first case is the exact question Mary asked, verbatim, misspelling
// included. If it ever goes back to the API as a sentence, this fails.

import { describe, it, expect } from "vitest";
import { extractSearchTerms, levenshtein } from "../../netlify/functions/lib/query-terms.js";

describe("extractSearchTerms", () => {
  it("turns the failing question into 'data governance' scoped to DHA, with the typo corrected", () => {
    const t = extractSearchTerms("Tell me all about data governence awards in the DHA");
    expect(t.phrase).toBe("data governance");
    expect(t.agency).toBe("DHA");
    expect(t.corrections).toEqual([{ from: "governence", to: "governance" }]);
    expect(t.corrected).toBe("Tell me all about data governance awards in the DHA");
    expect(t.tokens).toContain("governance");
  });

  it("strips question scaffolding, keeps the topic", () => {
    expect(extractSearchTerms("What's the status of CCN Next Gen?").phrase).toBe("ccn next gen");
    expect(extractSearchTerms("Who are the incumbents on T4NG2?").phrase).toBe("t4ng2");
    expect(extractSearchTerms("How much has VA obligated to Oracle since FY2024?").phrase).toBe("oracle fy2024");
  });

  it("detects the agency from long form or acronym and removes it from the phrase", () => {
    expect(extractSearchTerms("Defense Health Agency telehealth contracts").agency).toBe("DHA");
    expect(extractSearchTerms("Defense Health Agency telehealth contracts").phrase).toBe("telehealth");
    expect(extractSearchTerms("veterans affairs community care").agency).toBe("VA");
    expect(extractSearchTerms("cms interoperability rule").agency).toBe("CMS");
    expect(extractSearchTerms("ambient scribe pilots").agency).toBe(null);
  });

  it("keeps acronyms like IT and EHR that the stopword list would otherwise drop", () => {
    expect(extractSearchTerms("What is moving in DHA FY2027 IT budget?").phrase).toBe("fy2027 it budget");
    expect(extractSearchTerms("federal EHR programs").phrase).toBe("federal ehr programs");
  });

  it("entity names pass through unchanged", () => {
    expect(extractSearchTerms("Community Care Network").phrase).toBe("community care network");
    expect(extractSearchTerms("Enterprise Imaging").phrase).toBe("enterprise imaging");
  });

  it("generic procurement nouns are dropped from the phrase but kept in tokens; only-generic questions leave the phrase empty", () => {
    const t = extractSearchTerms("DHA awards and contracts");
    expect(t.phrase).toBe("");
    expect(t.tokens).toEqual(["awards", "contracts"]);
    expect(t.agency).toBe("DHA");
  });

  it("corrects only unambiguous domain typos of six or more letters, never short words or acronyms", () => {
    expect(extractSearchTerms("interoperabilty standards").corrections).toEqual([{ from: "interoperabilty", to: "interoperability" }]);
    expect(extractSearchTerms("telehelth").corrections).toEqual([{ from: "telehelth", to: "telehealth" }]);
    expect(extractSearchTerms("HCDSM data").corrections).toEqual([]);
    expect(extractSearchTerms("datta").corrections).toEqual([]);
  });

  it("never throws on empty or odd input", () => {
    expect(extractSearchTerms("").phrase).toBe("");
    expect(extractSearchTerms(null).tokens).toEqual([]);
    expect(extractSearchTerms("???").phrase).toBe("");
  });

  it("levenshtein basics", () => {
    expect(levenshtein("governence", "governance")).toBe(1);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("a", "abcd")).toBe(3);
  });
});
