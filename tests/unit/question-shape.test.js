// lib/question-shape.js: which optional systems a question switches on.
// A matrix across question shapes, asserting properties: the core always
// runs, research/grant/hiring/rule systems run only when the wording calls
// for them, and every optional id has a catalog row.

import { describe, it, expect } from "vitest";
import { classifyQuestion, systemsFor, OPTIONAL_SYSTEMS, SHAPE_ORDER, queriedWhen } from "../../netlify/functions/lib/question-shape.js";
import { CATALOG_BY_ID } from "../../netlify/functions/lib/ask-mmt-sources.js";

// [question, a shape that must be detected, systems that MUST be on, systems that MUST be off]
const MATRIX = [
  ["Tell me all about data governence awards in the DHA", "procurement", [], ["pubmed", "clinicaltrials", "grants", "sam_assistance", "usajobs", "ecfr", "regulations_gov", "hhs_open", "onc_healthit"]],
  ["Who won the CDC data modernization work?", "procurement", [], ["pubmed", "grants", "usajobs"]],
  ["What has the Department of Defense bought for ambient scribe?", "procurement", [], ["pubmed", "clinicaltrials"]],
  ["Who are the incumbents on T4NG2?", "procurement", [], ["pubmed", "grants", "ecfr"]],
  ["Any TRICARE managed care support recompetes coming?", "procurement", [], ["pubmed"]],
  ["What does the published research say about remote patient monitoring outcomes in VA?", "research", ["pubmed", "clinicaltrials", "hhs_open"], ["grants", "usajobs"]],
  ["Is there clinical evidence for ambient listening in primary care?", "research", ["pubmed", "clinicaltrials"], ["usajobs"]],
  ["Which HRSA grants fund organ transplant IT?", "grants", ["grants", "sam_assistance"], ["pubmed", "usajobs"]],
  ["Is there a NOFO for rural telehealth this year?", "grants", ["grants", "sam_assistance"], ["usajobs"]],
  ["ONC TEFCA rulemaking", "policy", ["ecfr", "regulations_gov"], ["pubmed", "grants", "usajobs"]],
  ["What does FAR 52.204-21 require?", "policy", ["ecfr"], ["pubmed", "grants"]],
  ["Is the HIPAA security rule update final?", "policy", ["ecfr", "regulations_gov"], ["usajobs"]],
  ["Is DHA hiring data scientists?", "workforce", ["usajobs"], ["pubmed", "grants", "ecfr"]],
  ["VA OIT staffing levels", "workforce", ["usajobs"], ["pubmed"]],
  ["Which EHR vendors lead hospital adoption?", "data", ["onc_healthit", "hhs_open"], ["pubmed", "grants", "usajobs"]],
  ["Is Oracle Health certified on the 2015 edition Cures update?", "data", ["onc_healthit"], ["grants"]],
  ["What is moving in DHA's FY2027 IT budget?", "budget", [], ["pubmed", "grants", "usajobs", "onc_healthit"]],
  ["MHS GENESIS", "general", ["ecfr", "regulations_gov"], ["pubmed", "grants", "usajobs", "onc_healthit"]],
  ["Community Care Network", "general", ["ecfr"], ["pubmed", "clinicaltrials"]],
  ["Show me ARPA-H awards", "procurement", [], ["pubmed", "usajobs"]],
];

describe("classifyQuestion + systemsFor", () => {
  for (const [q, primary, mustOn, mustOff] of MATRIX) {
    it(`${primary}: ${q}`, () => {
      const c = classifyQuestion(q);
      expect(c.shapes, `shapes for: ${q}`).toContain(primary);
      const on = systemsFor(c.shapes);
      for (const id of mustOn) expect(on.has(id), `${id} should be ON`).toBe(true);
      for (const id of mustOff) expect(on.has(id), `${id} should be OFF`).toBe(false);
    });
  }

  it("an empty or nonsense question is general, never a crash", () => {
    expect(classifyQuestion("").primary).toBe("general");
    expect(classifyQuestion(null).shapes).toEqual(["general"]);
    expect([...systemsFor(["general"])].sort()).toEqual(["ecfr", "regulations_gov"]);
  });

  it("every optional system has a catalog row and only uses known shapes", () => {
    for (const [id, v] of Object.entries(OPTIONAL_SYSTEMS)) {
      expect(CATALOG_BY_ID[id], `${id} missing from SOURCE_CATALOG`).toBeTruthy();
      for (const s of v.shapes) expect([...SHAPE_ORDER, "general"]).toContain(s);
      expect(queriedWhen(id)).toMatch(/^Queried for /);
    }
    expect(queriedWhen("usaspending")).toBe("Queried for every question.");
  });

  it("carries no em dashes (voice rule)", () => {
    expect(JSON.stringify(OPTIONAL_SYSTEMS)).not.toContain("—");
  });
});
