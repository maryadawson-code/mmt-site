// Ask MMT search generalization. The 2026-09-10 fix made ONE question work.
// These tests are the guard that it works for ANY question and ANY agency:
// a matrix of question shapes across the whole agency registry, asserting
// properties rather than hand-checked answers, so a new agency or a new
// phrasing cannot quietly fall back to "no filter, whole sentence as the
// keyword".

import { describe, it, expect } from "vitest";
import {
  extractSearchTerms,
  searchPhrase,
  keywordLadder,
  STOPWORDS,
} from "../../netlify/functions/lib/query-terms.js";
import {
  AGENCIES,
  agencyFor,
  agencyCgac,
  samDeptName,
  federalRegisterSlugs,
  usaspendingAgencyFilter,
  hasSubtier,
  detectAgencies,
} from "../../netlify/functions/lib/federal-agencies.js";

// Words that mean the question was passed through instead of a search term.
const SCAFFOLDING = [
  "tell", "show", "give", "list", "please", "what", "whats", "who", "whos", "how", "why", "when",
  "about", "the", "is", "are", "was", "does", "did", "has", "have", "any", "all", "me", "my",
  "there", "going", "happening", "latest", "recent", "status", "much", "many", "won", "made", "holds",
];

// One row per question shape per agency family. `agency` is what a correct
// answer must scope to; null means the question names no agency.
const MATRIX = [
  // DHA / DoD
  ["Tell me all about data governence awards in the DHA", "DHA", ["data", "governance"]],
  ["What is moving in DHA's FY2027 IT budget?", "DHA", ["fy2027"]],
  ["MHS GENESIS deployment status", "DHA", ["mhs", "genesis"]],
  ["Any TRICARE managed care support recompetes coming?", "DHA", ["tricare"]],
  ["Defense Health Agency telehealth contracts", "DHA", ["telehealth"]],
  ["What has the Department of Defense bought for ambient scribe?", "DoD", ["ambient", "scribe"]],
  ["Any Army medical logistics opportunities?", "Army", ["logistics"]],
  ["Navy BUMED telehealth", "Navy", ["telehealth"]],
  ["Air Force medical readiness software", "AirForce", ["readiness"]],
  ["DLA medical supply chain", "DLA", ["supply"]],
  ["DISA cloud hosting for health records", "DISA", ["cloud"]],
  // VA
  ["How much has VA obligated to Oracle since FY2024?", "VA", ["oracle"]],
  ["Who are the incumbents on the Veterans Health Administration imaging work?", "VHA", ["imaging"]],
  ["Veterans Benefits Administration claims automation", "VBA", ["claims"]],
  ["What does the published research say about remote patient monitoring outcomes in VA?", "VA", ["monitoring"]],
  // HHS family
  ["What FDA contracts are out for medical device software?", "FDA", ["medical", "device", "software"]],
  ["Who won the CDC data modernization work?", "CDC", ["data", "modernization"]],
  ["What is HRSA doing about organ transplant IT?", "HRSA", ["transplant"]],
  ["Show me ARPA-H awards", "ARPA-H", []],
  ["SAMHSA behavioral health data platform", "SAMHSA", ["behavioral"]],
  ["AHRQ patient safety research funding", "AHRQ", ["patient", "safety"]],
  ["ONC TEFCA rulemaking", "ONC", ["tefca"]],
  ["BARDA vaccine contracts", "ASPR", ["barda", "vaccine"]],
  ["Who holds the CIO-SP3 bridge at NITAAC?", "NIH", ["cio-sp3", "nitaac"]],
  ["Any IHS RPMS modernization activity?", "IHS", ["rpms"]],
  ["What is CMS doing on interoperability?", "CMS", ["interoperability"]],
  ["Medicare claims processing vendors", "CMS", ["medicare", "claims"]],
  ["Health and Human Services acquisition consolidation", "HHS", ["acquisition"]],
  // Other departments and vehicles
  ["What has NASA SEWP awarded for health IT?", "NASA", ["sewp"]],
  ["GSA OASIS+ on-ramp timing", "GSA", ["oasis+"]],
  ["Social Security Administration disability systems", "SSA", ["disability"]],
  ["Homeland Security medical countermeasures", "DHS", ["medical"]],
  // No agency named
  ["Who are the incumbents on T4NG2?", null, ["t4ng2"]],
  ["What is the status of CCN Next Gen?", null, ["ccn"]],
  ["What did the FY2027 NDAA change for federal EHR programs?", null, ["fy2027", "ndaa"]],
  ["ambient scribe pilots", null, ["ambient", "scribe"]],
];

describe("search terms generalize across questions and agencies", () => {
  it.each(MATRIX)("%s", (question, agency, mustKeep) => {
    const t = extractSearchTerms(question);

    // 1. the agency the question names is the agency the APIs get
    expect(t.agency).toBe(agency);

    // 2. no question scaffolding reaches the keyword. An ALL-CAPS acronym in
    // the question is exempt from the stopword list on purpose: "IT" in
    // "organ transplant IT" is the subject, the pronoun "it" is not.
    const acronyms = new Set([...question.matchAll(/\b[A-Z][A-Z0-9-]{1,}\b/g)].map((m) => m[0].toLowerCase()));
    for (const tok of t.phraseTokens) {
      expect(SCAFFOLDING, `"${tok}" leaked into the keyword for: ${question}`).not.toContain(tok);
      if (!acronyms.has(tok)) {
        expect(STOPWORDS.has(tok), `stopword "${tok}" leaked from: ${question}`).toBe(false);
      }
    }

    // 3. the terms that carry the question's meaning survive
    for (const keep of mustKeep) {
      expect(t.phraseTokens, `lost "${keep}" from: ${question}`).toContain(keep);
    }

    // 4. the agency's own code never doubles as a keyword (it is a filter)
    if (agency) {
      const code = agency.toLowerCase().replace(/[^a-z0-9]/g, "");
      expect(t.phraseTokens.map((x) => x.replace(/[^a-z0-9]/g, ""))).not.toContain(code);
    }

    // 5. the keyword is never the sentence. A question that carries
    // scaffolding or an agency always comes out strictly shorter; a question
    // that is already pure search terms ("ambient scribe pilots") passes
    // through unchanged, which is correct.
    const phrase = searchPhrase(t);
    const hadScaffolding = SCAFFOLDING.some((w) => new RegExp(`\\b${w}\\b`, "i").test(question));
    if (hadScaffolding || agency) {
      expect(phrase.length, `not shortened: ${question}`).toBeLessThan(question.length);
    } else {
      expect(phrase.length).toBeLessThanOrEqual(question.length);
    }
  });

  it("a question with no specific term becomes an agency-only search, never a generic-noun search", () => {
    for (const q of ["Show me ARPA-H awards", "What awards has CDC made?", "Any CMS opportunities?", "VA contracts"]) {
      const t = extractSearchTerms(q);
      expect(t.agency, q).toBeTruthy();
      expect(searchPhrase(t), q).toBe("");
      expect(keywordLadder(t), q).toEqual([""]);
    }
  });

  it("with no agency and no specific term, the content tokens are the keyword", () => {
    const t = extractSearchTerms("Show me the latest awards");
    expect(t.agency).toBe(null);
    expect(searchPhrase(t)).toBe("awards");
  });

  it("never returns the raw sentence as the keyword, for any row in the matrix", () => {
    for (const [question] of MATRIX) {
      const phrase = searchPhrase(question);
      const wordsInPhrase = phrase ? phrase.split(" ").length : 0;
      expect(wordsInPhrase, question).toBeLessThanOrEqual(6);
    }
  });
});

describe("keywordLadder", () => {
  it("relaxes monotonically and always ends with an agency-only rung", () => {
    for (const [question] of MATRIX) {
      const ladder = keywordLadder(question);
      expect(ladder[ladder.length - 1], question).toBe("");
      const lengths = ladder.map((r) => (r ? r.split(" ").length : 0));
      for (let i = 1; i < lengths.length; i++) {
        expect(lengths[i], `${question} rung ${i}`).toBeLessThanOrEqual(lengths[i - 1]);
      }
      expect(new Set(ladder).size).toBe(ladder.length); // no wasted repeat call
    }
  });

  it("keeps the most specific term longest", () => {
    // identifiers and acronyms outrank domain words, which outrank the rest
    expect(keywordLadder("modernization of the T4NG2 vehicle")).toContain("t4ng2");
    expect(keywordLadder("What is HRSA doing about organ transplant IT?")).toContain("it");
    const ladder = keywordLadder("telehealth scheduling backlog");
    expect(ladder[0]).toBe("telehealth scheduling backlog");
    expect(ladder[ladder.length - 2]).toBe("telehealth");
  });

  it("a one-term question relaxes straight to agency-only", () => {
    expect(keywordLadder("VA prosthetics")).toEqual(["prosthetics", ""]);
  });
});

describe("agency registry integrity", () => {
  it("every agency is complete enough to filter every API", () => {
    const codes = new Set();
    for (const a of AGENCIES) {
      expect(codes.has(a.code), `duplicate code ${a.code}`).toBe(false);
      codes.add(a.code);
      expect(a.name.length, a.code).toBeGreaterThan(3);
      expect(a.usaspending.toptier, a.code).toBeTruthy();
      expect(samDeptName(a.code), a.code).toBeTruthy();
      expect(federalRegisterSlugs(a.code).length, a.code).toBeGreaterThan(0);
      expect(agencyCgac(a.code), a.code).toMatch(/^\d{3}$/);
      expect(Array.isArray(a.acronyms) && a.acronyms.length > 0, a.code).toBe(true);
    }
    expect(AGENCIES.length).toBeGreaterThanOrEqual(25);
  });

  it("every alias and acronym resolves back to its own agency", () => {
    for (const a of AGENCIES) {
      expect(agencyFor(a.code).code).toBe(a.code);
      expect(agencyFor(a.name).code).toBe(a.code);
      for (const al of a.aliases || []) expect(agencyFor(al).code, al).toBe(a.code);
    }
    expect(agencyFor("nope")).toBe(null);
    expect(agencyFor("")).toBe(null);
  });

  it("a sub-agency filters at subtier and widens to its department", () => {
    expect(usaspendingAgencyFilter("DHA")).toEqual({ type: "funding", tier: "subtier", name: "Defense Health Agency" });
    expect(usaspendingAgencyFilter("DHA", { tier: "toptier" })).toEqual({ type: "funding", tier: "toptier", name: "Department of Defense" });
    expect(usaspendingAgencyFilter("FDA").name).toBe("Food and Drug Administration");
    expect(usaspendingAgencyFilter("FDA", { tier: "toptier" }).name).toBe("Department of Health and Human Services");
    expect(hasSubtier("FDA")).toBe(true);
    // a department has no sub-agency to widen from
    expect(usaspendingAgencyFilter("HHS")).toEqual({ type: "funding", tier: "toptier", name: "Department of Health and Human Services" });
    expect(hasSubtier("HHS")).toBe(false);
    expect(usaspendingAgencyFilter("nope")).toBe(null);
  });

  it("every sub-agency rolls up to a department that is itself in the registry", () => {
    const toptiers = new Set(AGENCIES.filter((a) => !a.usaspending.subtier).map((a) => a.usaspending.toptier));
    for (const a of AGENCIES.filter((x) => x.usaspending.subtier)) {
      expect(toptiers, `${a.code} rolls up to an unregistered department`).toContain(a.usaspending.toptier);
    }
  });

  it("longest agency wording wins, so a component is never read as its parent", () => {
    expect(detectAgencies("Defense Health Agency budget")[0]).toBe("DHA");
    expect(detectAgencies("Department of the Air Force medical")[0]).toBe("AirForce");
    expect(detectAgencies("Veterans Health Administration imaging")[0]).toBe("VHA");
    expect(detectAgencies("Centers for Medicare and Medicaid Services rule")[0]).toBe("CMS");
  });

  it("finds every agency named, in first-mention order", () => {
    expect(detectAgencies("a VA and DHA joint program")).toEqual(["VA", "DHA"]);
    expect(detectAgencies("no agency here")).toEqual([]);
  });
});
