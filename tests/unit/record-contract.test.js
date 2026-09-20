// lib/record-contract.js: the five fields every agent-facing record carries
// (platform spec section 3), the per-type freshness windows, and gap objects
// that name what MMT does not have instead of inferring it.

import { describe, it, expect } from "vitest";
import {
  FRESHNESS_WINDOWS_DAYS, contractRecord, contractReferenceRecord, confidenceFor, confidenceSummary, gapsFrom,
} from "../../netlify/functions/lib/record-contract.js";

const NOW = "2026-09-20T12:00:00Z";

describe("freshness windows", () => {
  it("carry the spec's six windows and MMT's own hand-maintained types", () => {
    expect(FRESHNESS_WINDOWS_DAYS).toEqual(expect.objectContaining({
      opportunity: 1, vehicle_status: 7, contract_award: 7, org_chart: 30, state_procurement: 7, statutory: 90, curated_intel: 45,
    }));
  });
  it("confidence: verified inside the window, reported for medium or no date, stale past the window", () => {
    expect(confidenceFor("vehicle_status", "2026-09-20", "high", NOW)).toBe("verified");
    expect(confidenceFor("vehicle_status", "2026-09-13", "high", NOW)).toBe("verified");   // day 7: inside
    expect(confidenceFor("vehicle_status", "2026-09-12", "high", NOW)).toBe("stale");      // day 8: past
    expect(confidenceFor("statutory", "2026-07-01", "medium", NOW)).toBe("reported");
    expect(confidenceFor("statutory", "2026-05-01", "high", NOW)).toBe("stale");
    expect(confidenceFor("org_chart", null, "high", NOW)).toBe("reported");
    expect(() => confidenceFor("nope", "2026-09-20", "high", NOW)).toThrow(/unknown record type/);
  });
});

describe("contractRecord", () => {
  it("adds source_url, retrieved_at, confidence, as_of, record_type, window and gap without dropping the record's own fields", () => {
    const r = contractRecord({ id: "x", name: "Thing" }, { type: "reference_directory", sourceUrl: "https://a.gov/x", retrievedAt: "2026-09-19", asOf: "2026-09-01", now: NOW });
    expect(r).toEqual(expect.objectContaining({
      id: "x", name: "Thing", source_url: "https://a.gov/x", retrieved_at: "2026-09-19", confidence: "verified", as_of: "2026-09-01",
      record_type: "reference_directory", freshness_window_days: 90, gap: [],
    }));
  });
  it("an MMT-derived record has a null source_url and a gap that names the provenance, never an invented source", () => {
    const r = contractRecord({ fit_score: 80 }, { type: "member_data", retrievedAt: NOW, derived: "scored_model and scored_at", now: NOW });
    expect(r.source_url).toBeNull();
    expect(r.gap).toEqual([{ field: "source_url", reason: "MMT-derived record; provenance is scored_model and scored_at" }]);
  });
  it("a record with no read date is reported and says so in the gap", () => {
    const r = contractRecord({ id: "y" }, { type: "org_chart", sourceUrl: "https://a.gov", now: NOW });
    expect(r.confidence).toBe("reported");
    expect(r.gap).toEqual([{ field: "retrieved_at", reason: "MMT has no read date for this record" }]);
  });
  it("keeps the dataset's own high/medium as mmt_confidence and speaks the contract vocabulary in confidence", () => {
    const r = contractReferenceRecord({ id: "z", confidence: "medium", verified: "2026-09-20", sources: [{ url: "https://a.gov", retrieved: "2026-09-20" }] }, "statutory", NOW);
    expect(r.mmt_confidence).toBe("medium");
    expect(r.confidence).toBe("reported");
    expect(r.source_url).toBe("https://a.gov");
    expect(r.retrieved_at).toBe("2026-09-20");
  });
});

describe("gaps", () => {
  it("field-form pending entries become { field, reason }; prose keeps field null", () => {
    expect(gapsFrom(["procurement_portal_url", "mes_modernization (state notice not yet read)", "state notice pending", "", null])).toEqual([
      { field: "procurement_portal_url", reason: "not yet covered" },
      { field: "mes_modernization", reason: "state notice not yet read" },
      { field: null, reason: "state notice pending" },
    ]);
    expect(gapsFrom(undefined)).toEqual([]);
  });
  it("confidenceSummary counts the three levels", () => {
    expect(confidenceSummary([{ confidence: "verified" }, { confidence: "stale" }, { confidence: "stale" }, {}])).toEqual({ verified: 1, reported: 0, stale: 2 });
  });
});
