// tests/unit/vote-watchlist-match.test.js
//
// Covers the PURE matching logic for feature-vote custom_watchlists (F) +
// recompete_alerts (G): matchesCriteria, monthsToExpiry, recompeteDue.
// No I/O — these are the unit-test seam for the watchlist-alert cron.

import { describe, it, expect } from "vitest";
import {
  matchesCriteria,
  monthsToExpiry,
  recompeteDue,
  expiryMs,
} from "../../netlify/functions/lib/vote-watchlist-match.js";

const base = {
  name: "Community Care Network Next Gen",
  agency: "Department of Veterans Affairs",
  status: "upcoming",
  naics: "524292",
  small_business_eligible: false,
  description: "Next-generation VA community care MA-IDIQ replacing CCN regional contracts with value-based payments.",
};

describe("matchesCriteria", () => {
  it("empty criteria matches everything", () => {
    expect(matchesCriteria(base, {})).toBe(true);
    expect(matchesCriteria(base, undefined)).toBe(true);
  });

  it("status must match exactly", () => {
    expect(matchesCriteria(base, { status: "upcoming" })).toBe(true);
    expect(matchesCriteria(base, { status: "active" })).toBe(false);
  });

  it("agency is substring + case-insensitive", () => {
    expect(matchesCriteria(base, { agency: "veterans" })).toBe(true);
    expect(matchesCriteria(base, { agency: "Defense" })).toBe(false);
  });

  it("naics is substring match", () => {
    expect(matchesCriteria(base, { naics: "524292" })).toBe(true);
    expect(matchesCriteria(base, { naics: "5242" })).toBe(true);
    expect(matchesCriteria(base, { naics: "541512" })).toBe(false);
  });

  it("q requires all terms present in public text", () => {
    expect(matchesCriteria(base, { q: "community care" })).toBe(true);
    expect(matchesCriteria(base, { q: "community spaceforce" })).toBe(false);
  });

  it("sb=true filters out non-small-business contracts", () => {
    expect(matchesCriteria(base, { sb: true })).toBe(false);
    expect(matchesCriteria({ ...base, small_business_eligible: true }, { sb: true })).toBe(true);
  });

  it("ANDs multiple criteria", () => {
    expect(matchesCriteria(base, { agency: "veterans", status: "upcoming" })).toBe(true);
    expect(matchesCriteria(base, { agency: "veterans", status: "awarded" })).toBe(false);
  });

  it("does not match premium-only fields (vendor/value never in public text)", () => {
    const c = { ...base, vendor: "Leidos", value: "$700B" };
    expect(matchesCriteria(c, { q: "leidos" })).toBe(false);
  });
});

describe("expiryMs / monthsToExpiry", () => {
  it("returns null when no structured expiry exists", () => {
    expect(expiryMs(base)).toBe(null);
    expect(monthsToExpiry(base)).toBe(null);
  });

  it("reads recompete_date / period_of_performance_end / expiry_date", () => {
    expect(expiryMs({ recompete_date: "2027-01-01" })).toBeTypeOf("number");
    expect(expiryMs({ period_of_performance_end: "2027-01-01" })).toBeTypeOf("number");
    expect(expiryMs({ expiry_date: "2027-01-01" })).toBeTypeOf("number");
  });

  it("computes whole months to expiry", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const m = monthsToExpiry({ recompete_date: "2026-07-01T00:00:00Z" }, now);
    expect(m).toBeGreaterThanOrEqual(5);
    expect(m).toBeLessThanOrEqual(6);
  });
});

describe("recompeteDue", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("false when no expiry data (no fabricated countdowns)", () => {
    expect(recompeteDue(base, 90, now)).toBe(false);
  });

  it("true when expiry is within the lead window", () => {
    expect(recompeteDue({ recompete_date: "2026-02-15T00:00:00Z" }, 90, now)).toBe(true);
  });

  it("false when expiry is beyond the lead window", () => {
    expect(recompeteDue({ recompete_date: "2026-09-01T00:00:00Z" }, 90, now)).toBe(false);
  });

  it("false when already expired", () => {
    expect(recompeteDue({ recompete_date: "2025-12-01T00:00:00Z" }, 90, now)).toBe(false);
  });
});
