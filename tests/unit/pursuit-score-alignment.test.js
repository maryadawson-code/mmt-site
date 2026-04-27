// Unit tests for Pursuit Score company-alignment overlay.
//
// Locked to the deterministic helpers (no API calls). Anchors the
// 2026-04-27 incident: VA Infrastructure Operations Franchise Fund must
// not auto-NO-BID purely because USASpending was thin.

import { describe, it, expect } from "vitest";
import {
  detectPositiveSignals,
  agencyMatches,
  classifyCapturePosition,
  scoreCompanyFit,
  combineVerdict,
} from "../../netlify/functions/lib/company-alignment.js";

const danielleProfile = {
  email: "danielle@example.com",
  entity_name: "Danielle's Federal IT LLC",
  set_aside_certifications: ["WOSB"],
  target_agencies: ["VA", "DHA"],
  capabilities: ["infrastructure operations", "VA OIT", "data center", "cloud migration"],
  naics_codes: ["541512", "541519"],
  capture_priorities: ["VA OIT Franchise Fund recompetes", "FY27 infrastructure"],
  vehicle_holdings: [{ vehicle: "GSA MAS" }, { vehicle: "SeaPort-NxG" }],
  active_pursuits: [],
  incumbent_positions: [],
  no_go_list: [],
  oci_exclusions: [],
};

describe("detectPositiveSignals", () => {
  it("detects RFI / Industry Day / VA OIT / Franchise Fund / FY27 / $1B", () => {
    const tags = detectPositiveSignals(
      "VA OIT Infrastructure Operations Franchise Fund Support Services RFI Industry Day FY27 $1B incumbent recompete"
    ).map((s) => s.tag);
    expect(tags).toContain("RFI");
    expect(tags).toContain("INDUSTRY_DAY");
    expect(tags).toContain("VA_OIT");
    expect(tags).toContain("FRANCHISE_FUND");
    expect(tags).toContain("FY27");
    expect(tags).toContain("DOLLAR_1B_PLUS");
    expect(tags).toContain("INCUMBENT");
    expect(tags).toContain("RECOMPETE");
  });

  it("returns empty for plain market keywords", () => {
    expect(detectPositiveSignals("EHR modernization")).toEqual([]);
  });
});

describe("agencyMatches", () => {
  it("matches via alias expansion", () => {
    expect(agencyMatches(["VA"], "Department of Veterans Affairs")).toBe(true);
    expect(agencyMatches(["DHA"], "Defense Health Agency")).toBe(true);
  });
  it("returns false on mismatch", () => {
    expect(agencyMatches(["VA"], "GSA")).toBe(false);
  });
  it("returns false when profile is empty", () => {
    expect(agencyMatches([], "VA")).toBe(false);
  });
});

describe("scoreCompanyFit", () => {
  it("returns null score and 'no_profile' band when subscriberContext is missing", () => {
    const fit = scoreCompanyFit(null, { keyword: "anything", agency: "VA" });
    expect(fit.score).toBeNull();
    expect(fit.band).toBe("no_profile");
  });

  it("scores Danielle's profile high on VA Infrastructure Operations Franchise Fund", () => {
    const fit = scoreCompanyFit(danielleProfile, {
      keyword: "VA Infrastructure Operations Franchise Fund Support Services",
      agency: "VA",
      naics: ["541512"],
    });
    expect(fit.score).toBeGreaterThanOrEqual(75);
    expect(fit.reasoning.length).toBeGreaterThan(0);
    expect(fit.known.some((k) => /target-agency/.test(k))).toBe(true);
  });

  it("never drops below the 50 floor when the profile is loaded", () => {
    const fit = scoreCompanyFit(
      { ...danielleProfile, target_agencies: ["GSA"], capabilities: ["something else"], naics_codes: ["999999"], capture_priorities: [] },
      { keyword: "VA EHR Modernization", agency: "VA", naics: ["541512"] }
    );
    expect(fit.score).toBeGreaterThanOrEqual(50);
  });

  it("changes when the profile changes", () => {
    const fitA = scoreCompanyFit(
      { ...danielleProfile, capabilities: ["unrelated"] },
      { keyword: "VA Infrastructure Operations Franchise Fund", agency: "VA" }
    );
    const fitB = scoreCompanyFit(
      { ...danielleProfile, capabilities: ["infrastructure operations", "data center"] },
      { keyword: "VA Infrastructure Operations Franchise Fund", agency: "VA" }
    );
    expect(fitB.score).toBeGreaterThan(fitA.score);
  });
});

describe("classifyCapturePosition", () => {
  it("tags IN_FLIGHT when an active pursuit name overlaps the keyword", () => {
    const ctx = { ...danielleProfile, active_pursuits: [{ solicitation_number: "ABC123", name: "VA Franchise Fund Support", role: "prime", stage: "submitted" }] };
    const cp = classifyCapturePosition(ctx, { keyword: "VA Franchise Fund Support Services", agency: "VA" });
    expect(cp.tag).toBe("IN_FLIGHT");
  });

  it("tags INCUMBENT_RECOMPETE when an incumbent name matches", () => {
    const ctx = { ...danielleProfile, incumbent_positions: [{ contract_number: "X", name: "VA Infrastructure Operations" }] };
    const cp = classifyCapturePosition(ctx, { keyword: "VA Infrastructure Operations Franchise Fund", agency: "VA" });
    expect(cp.tag).toBe("INCUMBENT_RECOMPETE");
  });

  it("tags OCI_BLOCKED when scope overlaps", () => {
    const ctx = { ...danielleProfile, oci_exclusions: [{ blocked_scope: "Franchise Fund support", notes: "Conflicts with X" }] };
    const cp = classifyCapturePosition(ctx, { keyword: "VA Franchise Fund Support Services", agency: "VA" });
    expect(cp.tag).toBe("OCI_BLOCKED");
  });

  it("tags NEW for a clean opportunity", () => {
    const cp = classifyCapturePosition(danielleProfile, { keyword: "VA Infrastructure Operations Franchise Fund Support Services", agency: "VA" });
    // ON_LANE is also a valid clean tag if a lane keyword overlaps.
    expect(["NEW", "ON_LANE"]).toContain(cp.tag);
  });

  it("returns NO_PROFILE when ctx is missing", () => {
    expect(classifyCapturePosition(null, { keyword: "x" }).tag).toBe("NO_PROFILE");
  });
});

describe("combineVerdict — VA Franchise Fund safeguards", () => {
  it("does NOT return NO-BID when no profile is loaded, even with very weak market data", () => {
    const v = combineVerdict({
      marketScore: 12,
      partial: false,
      companyFit: scoreCompanyFit(null, { keyword: "x" }),
      capturePosition: classifyCapturePosition(null, { keyword: "x" }),
      signals: [],
    });
    expect(v.verdict).not.toBe("NO-BID");
    expect(v.verdict).toBe("CAPTURE_VALIDATION");
  });

  it("returns MONITOR (not NO-BID) when sources are partial and no profile", () => {
    const v = combineVerdict({
      marketScore: 5,
      partial: true,
      companyFit: scoreCompanyFit(null, { keyword: "x" }),
      capturePosition: classifyCapturePosition(null, { keyword: "x" }),
      signals: [],
    });
    expect(v.verdict).toBe("MONITOR");
  });

  it("returns CAPTURE_VALIDATION (not NO-BID) when positive signals are present", () => {
    const fit = scoreCompanyFit(danielleProfile, { keyword: "VA OIT Franchise Fund FY27 $1B RFI", agency: "VA" });
    const v = combineVerdict({
      marketScore: 10,
      partial: false,
      companyFit: fit,
      capturePosition: classifyCapturePosition(danielleProfile, { keyword: "VA OIT Franchise Fund FY27 RFI", agency: "VA" }),
      signals: detectPositiveSignals("VA OIT Franchise Fund FY27 $1B RFI"),
    });
    expect(v.verdict).not.toBe("NO-BID");
    expect(["CAPTURE_VALIDATION", "MONITOR", "QUALIFY", "PURSUE"]).toContain(v.verdict);
  });

  it("hard-blocks OCI_BLOCKED to NO-BID", () => {
    const v = combineVerdict({
      marketScore: 90,
      partial: false,
      companyFit: { score: 80, band: "high", known: [], inferred: [], missing: [], reasoning: [] },
      capturePosition: { tag: "OCI_BLOCKED", detail: "OCI" },
      signals: [],
    });
    expect(v.verdict).toBe("NO-BID");
  });

  it("returns DEFEND when subscriber is the incumbent", () => {
    const v = combineVerdict({
      marketScore: 50,
      partial: false,
      companyFit: { score: 75, band: "medium", known: [], inferred: [], missing: [], reasoning: [] },
      capturePosition: { tag: "INCUMBENT_RECOMPETE", detail: "current" },
      signals: [],
    });
    expect(v.verdict).toBe("DEFEND");
  });

  it("returns MONITOR when in-flight (do-not-double-pursue safeguard)", () => {
    const v = combineVerdict({
      marketScore: 90,
      partial: false,
      companyFit: { score: 80, band: "high", known: [], inferred: [], missing: [], reasoning: [] },
      capturePosition: { tag: "IN_FLIGHT", detail: "submitted" },
      signals: [],
    });
    expect(v.verdict).toBe("MONITOR");
  });
});

describe("VA Franchise Fund integration scenario (Danielle)", () => {
  it("avoids auto-NO-BID with thin market data when profile + signals exist", () => {
    const keyword = "VA Infrastructure Operations Franchise Fund Support Services RFI FY27 $1B";
    const fit = scoreCompanyFit(danielleProfile, { keyword, agency: "VA" });
    const cp  = classifyCapturePosition(danielleProfile, { keyword, agency: "VA" });
    const sg  = detectPositiveSignals(keyword);
    const v   = combineVerdict({
      marketScore: 18, // simulating thin USASpending
      partial: false,
      companyFit: fit,
      capturePosition: cp,
      signals: sg,
    });
    expect(v.verdict).not.toBe("NO-BID");
    expect(sg.length).toBeGreaterThanOrEqual(4);
    expect(fit.score).toBeGreaterThanOrEqual(70);
  });
});
