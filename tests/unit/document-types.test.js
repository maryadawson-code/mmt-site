import { describe, it, expect } from "vitest";
import { DOCUMENT_TYPES } from "../../netlify/functions/lib/document-types.js";

describe("DOCUMENT_TYPES config", () => {
  const expectedTypes = [
    "pitch_deck",
    "white_paper",
    "rfp_response",
    "capabilities_statement",
    "pricing_volume",
    "executive_summary",
  ];

  it("has all 6 document types", () => {
    expect(Object.keys(DOCUMENT_TYPES)).toEqual(
      expect.arrayContaining(expectedTypes)
    );
    expect(Object.keys(DOCUMENT_TYPES).length).toBe(6);
  });

  for (const type of expectedTypes) {
    describe(type, () => {
      it("has required fields", () => {
        const dt = DOCUMENT_TYPES[type];
        expect(dt).toBeDefined();
        expect(dt.label).toBeTruthy();
        expect(dt.noun).toBeTruthy();
        expect(dt.intro).toBeTruthy();
        expect(dt.criteria).toBeTruthy();
        expect(dt.red_flags).toBeTruthy();
        expect(dt.score_ids).toBeDefined();
      });

      it("has exactly 9 score_ids", () => {
        expect(DOCUMENT_TYPES[type].score_ids.length).toBe(9);
      });

      it("score_ids have id and title", () => {
        for (const sid of DOCUMENT_TYPES[type].score_ids) {
          expect(sid.id).toBeTruthy();
          expect(sid.title).toBeTruthy();
        }
      });

      it("intro mentions ProposalPulse or Mission Meets Tech", () => {
        const intro = DOCUMENT_TYPES[type].intro;
        expect(
          intro.includes("ProposalPulse") ||
            intro.includes("Mission Meets Tech")
        ).toBe(true);
      });
    });
  }
});
