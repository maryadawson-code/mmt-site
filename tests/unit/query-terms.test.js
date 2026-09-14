// query-terms: the question-to-keyword step that was missing on 2026-09-10.
// The first case is the exact question Mary asked, verbatim, misspelling
// included. If it ever goes back to the API as a sentence, this fails.

import { describe, it, expect } from "vitest";
import { extractSearchTerms, levenshtein, extractYears, extractSetAside, obligationsIntent, fiscalYearOf, ALL_SMALL_BUSINESS_CODES } from "../../netlify/functions/lib/query-terms.js";

// Pinned: "last year" and "a future fiscal year" depend on today.
const TODAY = "2026-09-14";

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
    // the fiscal year is a window, not a keyword (2026-09-14)
    expect(extractSearchTerms("How much has VA obligated to Oracle since FY2024?").phrase).toBe("oracle");
  });

  it("detects the agency from long form or acronym and removes it from the phrase", () => {
    expect(extractSearchTerms("Defense Health Agency telehealth contracts").agency).toBe("DHA");
    expect(extractSearchTerms("Defense Health Agency telehealth contracts").phrase).toBe("telehealth");
    expect(extractSearchTerms("veterans affairs community care").agency).toBe("VA");
    expect(extractSearchTerms("cms interoperability rule").agency).toBe("CMS");
    expect(extractSearchTerms("ambient scribe pilots").agency).toBe(null);
  });

  it("keeps acronyms like IT and EHR that the stopword list would otherwise drop", () => {
    expect(extractSearchTerms("What is moving in DHA FY2027 IT budget?").phrase).toBe("it budget");
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

  describe("fiscal and calendar years leave the phrase and become a window", () => {
    it("FY2024 in 'since FY2024' is years [2024], since the FY start (Oct 1 of the prior year), and never a token", () => {
      const t = extractSearchTerms("How much has VA obligated to Oracle since FY2024?", { today: TODAY });
      expect(t.phrase).toBe("oracle");
      expect(t.years).toEqual([2024]);
      expect(t.since).toBe("2023-10-01");
      expect(t.rankedTokens).toEqual(["oracle"]);
      expect(t.phraseTokens.some((x) => /\d{4}|^fy/.test(x))).toBe(false);
      expect(t.wantsObligations).toBe(true);
    });
    it("FY24, FY 24 and fiscal year 2024 all mean FY2024", () => {
      for (const q of ["telehealth awards in FY24", "telehealth awards FY 24", "telehealth awards fiscal year 2024", "telehealth awards for fiscal 2024"]) {
        const t = extractSearchTerms(q, { today: TODAY });
        expect(t.years, q).toEqual([2024]);
        expect(t.since, q).toBe("2023-10-01");
        expect(t.phrase, q).toBe("telehealth");
      }
    });
    it("a calendar year starts Jan 1; 'in 2025' and 'since 2024'", () => {
      expect(extractSearchTerms("ambient scribe buys in 2025", { today: TODAY }).since).toBe("2025-01-01");
      const t = extractSearchTerms("what has DHA bought since 2024", { today: TODAY });
      expect(t.since).toBe("2024-01-01");
      expect(t.years).toEqual([2024]);
      expect(t.phrase).toBe("");
    });
    it("'last year' and 'last fiscal year' are relative to the injected today", () => {
      expect(extractSearchTerms("WOSB awards last year", { today: TODAY }).since).toBe("2025-01-01");
      expect(extractSearchTerms("WOSB awards last fiscal year", { today: TODAY }).since).toBe("2024-10-01");
      // Sep 14 2026 is FY2026; Oct 2 2026 is FY2027
      expect(fiscalYearOf(new Date("2026-09-14T00:00:00Z"))).toBe(2026);
      expect(fiscalYearOf(new Date("2026-10-02T00:00:00Z"))).toBe(2027);
      expect(extractSearchTerms("WOSB awards last fiscal year", { today: "2026-10-02" }).since).toBe("2025-10-01");
    });
    it("a fiscal year that has not started is named but cannot bound the window", () => {
      const t = extractSearchTerms("What is moving in DHA FY2027 IT budget?", { today: TODAY });
      expect(t.years).toEqual([2027]);
      expect(t.since).toBe(null);
      expect(t.phrase).toBe("it budget");
    });
    it("the earliest mention wins when several years are named", () => {
      const t = extractSearchTerms("Oracle obligations FY2024 through FY2026", { today: TODAY });
      expect(t.years).toEqual([2024, 2026]);
      expect(t.since).toBe("2023-10-01");
    });
    it("identifiers with digits are not years", () => {
      const t = extractSearchTerms("Who are the incumbents on T4NG2?", { today: TODAY });
      expect(t.years).toEqual([]);
      expect(t.phrase).toBe("t4ng2");
      expect(extractYears("HT003826SC005 and 36C10G26R0004").years).toEqual([]);
    });
  });

  describe("set-aside wording becomes USASpending set_aside_type_codes, not a keyword", () => {
    it("'small business' alone maps to every small-business code and leaves the phrase", () => {
      const t = extractSearchTerms("small business data governance awards at DHA");
      expect(t.phrase).toBe("data governance");
      expect(t.setAside.kinds).toEqual(["small business"]);
      expect(t.setAside.codes).toEqual(ALL_SMALL_BUSINESS_CODES);
      expect(t.tokens).not.toContain("small");
      expect(t.tokens).not.toContain("business");
    });
    it("a named kind maps to its own codes; the generic words are still stripped", () => {
      const t = extractSearchTerms("SDVOSB set-aside telehealth awards");
      expect(t.phrase).toBe("telehealth");
      expect(t.setAside.codes).toEqual(["SDVOSBC", "SDVOSBS"]);
      expect(extractSearchTerms("What WOSB awards did VA make?").setAside.codes).toEqual(["WOSB", "WOSBSS", "EDWOSB", "EDWOSBSS"]);
      expect(extractSearchTerms("EDWOSB imaging").setAside.codes).toEqual(["EDWOSB", "EDWOSBSS"]);
      expect(extractSearchTerms("8(a) and HUBZone telehealth").setAside.codes).toEqual(["8A", "8AN", "HZC", "HZS"]);
      expect(extractSearchTerms("veteran-owned small business cloud").setAside.codes).toEqual(["VSA", "VSS", "SDVOSBC", "SDVOSBS"]);
      expect(extractSearchTerms("service-disabled veteran-owned cloud").setAside.codes).toEqual(["SDVOSBC", "SDVOSBS"]);
    });
    it("no set-aside wording, no filter", () => {
      expect(extractSearchTerms("data governance awards at DHA").setAside).toBe(null);
      expect(extractSetAside("plain text").setAside).toBe(null);
    });
  });

  it("obligationsIntent fires on money-over-time wording only", () => {
    expect(obligationsIntent("How much has VA obligated to Oracle since FY2024?")).toBe(true);
    expect(obligationsIntent("what did DHA spend on GetWell")).toBe(true);
    expect(obligationsIntent("tell me about all GetWell awards")).toBe(false);
  });

  it("levenshtein basics", () => {
    expect(levenshtein("governence", "governance")).toBe(1);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("a", "abcd")).toBe(3);
  });
});
