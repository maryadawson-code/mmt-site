// Unit tests for lib/radar-hygiene.js — the read-time Opportunity Radar
// guard. Pure logic, no Supabase/network. Locks the three failure modes
// the 2026-08-05 workbook cross-check surfaced: archived rows leaking,
// past-deadline rows leaking, and duplicate notices piling up.

import { describe, it, expect } from "vitest";
import {
  isClosed,
  isArchived,
  isFabricated,
  dedupKey,
  dedupeOpportunities,
  applyRadarHygiene,
} from "../../netlify/functions/lib/radar-hygiene.js";

const NOW = new Date("2026-08-05T13:00:00Z");

describe("isClosed", () => {
  it("keeps a row with no deadline (award notice / forecast)", () => {
    expect(isClosed({ response_deadline: null }, NOW)).toBe(false);
    expect(isClosed({ response_deadline: "" }, NOW)).toBe(false);
    expect(isClosed({}, NOW)).toBe(false);
  });

  it("drops a row whose deadline is strictly before today", () => {
    expect(isClosed({ response_deadline: "2019-05-22" }, NOW)).toBe(true);
    expect(isClosed({ response_deadline: "2026-08-04T23:59:00Z" }, NOW)).toBe(true);
  });

  it("keeps a row due later today", () => {
    expect(isClosed({ response_deadline: "2026-08-05T17:00:00Z" }, NOW)).toBe(false);
    expect(isClosed({ response_deadline: "2026-08-05" }, NOW)).toBe(false);
  });

  it("keeps a future deadline", () => {
    expect(isClosed({ response_deadline: "2026-08-30" }, NOW)).toBe(false);
  });

  it("keeps an unparseable deadline rather than guessing it dead", () => {
    expect(isClosed({ response_deadline: "not listed" }, NOW)).toBe(false);
    expect(isClosed({ response_deadline: "TBD" }, NOW)).toBe(false);
  });
});

describe("isArchived", () => {
  it("flags only status === 'archived'", () => {
    expect(isArchived({ status: "archived" })).toBe(true);
    expect(isArchived({ status: "active" })).toBe(false);
    expect(isArchived({ status: null })).toBe(false);
    expect(isArchived({})).toBe(false); // legacy row, no status column value
  });
});

describe("isFabricated", () => {
  it("flags a built-from-solicitation SAM permalink (the 2026-08-05 signature)", () => {
    expect(isFabricated({ source_url: "https://sam.gov/opp/HT001126R00TH" })).toBe(true);
    expect(isFabricated({ source_url: "https://sam.gov/opp/ihs-26-it-0037" })).toBe(true);
    expect(isFabricated({ source_url: "https://sam.gov/workspace/contract/opp/7571TE26Q00034/view" })).toBe(true);
  });
  it("does not flag a real 32-hex SAM permalink", () => {
    expect(isFabricated({ source_url: "https://sam.gov/opp/87dc4f3023da450091576425c98bae2a/view" })).toBe(false);
  });
  it("does not flag legitimate aggregator / USAspending / gov links", () => {
    expect(isFabricated({ source_url: "https://www.highergov.com/contract-opportunity/x" })).toBe(false);
    expect(isFabricated({ source_url: "https://www.usaspending.gov/award/CONT_AWD_36C10B26F0207_3600" })).toBe(false);
    expect(isFabricated({ source_url: "https://health.mil/Reference-Center/x" })).toBe(false);
    expect(isFabricated({ source_url: null })).toBe(false);
    expect(isFabricated({})).toBe(false);
  });
});

describe("dedupKey", () => {
  it("prefers a normalized solicitation number", () => {
    expect(dedupKey({ solicitation_number: "36C10X26F0113", title: "x" })).toBe("sol:36c10x26f0113");
    expect(dedupKey({ solicitation_number: "  HT003826X0000 " })).toBe("sol:ht003826x0000");
  });
  it("falls back to a normalized title", () => {
    expect(dedupKey({ title: "VA Says FedRAMP Certification" })).toBe("title:va says fedramp certification");
    expect(dedupKey({ title: "VA  says   FedRAMP  certification" })).toBe("title:va says fedramp certification");
  });
  it("returns null when there is nothing to key on", () => {
    expect(dedupKey({})).toBe(null);
  });
});

describe("dedupeOpportunities", () => {
  it("collapses same-solicitation rows, keeping the newest scan", () => {
    const rows = [
      { id: 1, solicitation_number: "SOL1", scan_date: "2026-08-01", relevance_score: 90 },
      { id: 2, solicitation_number: "SOL1", scan_date: "2026-08-04", relevance_score: 70 },
    ];
    const { kept, duplicates } = dedupeOpportunities(rows);
    expect(duplicates).toBe(1);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(2); // newer scan_date wins over higher relevance
  });

  it("collapses no-solicitation duplicates by normalized title (the triple-clinic case)", () => {
    const rows = [
      { id: 57, title: "Bangor, ME Outpatient Clinic", scan_date: "2026-08-03", relevance_score: 70 },
      { id: 60, title: "Bangor,  ME  Outpatient Clinic", scan_date: "2026-08-03", relevance_score: 65 },
      { id: 61, title: "bangor, me outpatient clinic", scan_date: "2026-08-02", relevance_score: 58 },
    ];
    const { kept, duplicates } = dedupeOpportunities(rows);
    expect(duplicates).toBe(2);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(57); // tie on scan_date → higher relevance
  });

  it("never collapses two distinct keyless rows together", () => {
    const rows = [{ agency: "VA" }, { agency: "DHA" }];
    const { kept, duplicates } = dedupeOpportunities(rows);
    expect(duplicates).toBe(0);
    expect(kept).toHaveLength(2);
  });

  it("preserves input order of kept rows", () => {
    const rows = [
      { id: 1, solicitation_number: "A", scan_date: "2026-08-01" },
      { id: 2, solicitation_number: "B", scan_date: "2026-08-01" },
      { id: 3, solicitation_number: "A", scan_date: "2026-08-02" },
    ];
    const { kept } = dedupeOpportunities(rows);
    expect(kept.map((r) => r.solicitation_number)).toEqual(["A", "B"]);
    expect(kept[0].id).toBe(3); // A resolved to its newest instance
  });
});

describe("applyRadarHygiene", () => {
  it("removes fabricated, archived, closed, and duplicate rows in one pass", () => {
    const rows = [
      { id: 1, title: "Open A", solicitation_number: "A", response_deadline: "2026-08-30", scan_date: "2026-08-05" },
      { id: 2, title: "Archived", solicitation_number: "B", status: "archived", response_deadline: "2026-08-30", scan_date: "2026-08-05" },
      { id: 3, title: "Closed", solicitation_number: "C", response_deadline: "2019-05-22", scan_date: "2026-08-05" },
      { id: 4, title: "Open A dup", solicitation_number: "A", response_deadline: "2026-09-01", scan_date: "2026-08-04" },
      { id: 5, title: "Award, no deadline", solicitation_number: "D", response_deadline: null, scan_date: "2026-08-05" },
      { id: 6, title: "Fabricated", solicitation_number: "HT001126R00TH", source_url: "https://sam.gov/opp/HT001126R00TH", response_deadline: "2026-08-30", scan_date: "2026-08-05" },
    ];
    const out = applyRadarHygiene(rows, { now: NOW });
    expect(out.removed).toEqual({ fabricated: 1, archived: 1, closed: 1, duplicates: 1 });
    const ids = out.opportunities.map((r) => r.id).sort();
    expect(ids).toEqual([1, 5]); // A kept as newest instance (id 1), award kept
  });

  it("keeps closed rows when includeClosed is set", () => {
    const rows = [
      { id: 1, solicitation_number: "A", response_deadline: "2019-05-22", scan_date: "2026-08-05" },
    ];
    expect(applyRadarHygiene(rows, { now: NOW, includeClosed: true }).opportunities).toHaveLength(1);
    expect(applyRadarHygiene(rows, { now: NOW, includeClosed: false }).opportunities).toHaveLength(0);
  });

  it("is null-safe", () => {
    expect(applyRadarHygiene(null).opportunities).toEqual([]);
    expect(applyRadarHygiene(undefined).removed).toEqual({ fabricated: 0, archived: 0, closed: 0, duplicates: 0 });
  });
});
