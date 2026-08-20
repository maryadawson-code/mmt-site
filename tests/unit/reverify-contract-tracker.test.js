import { describe, it, expect } from "vitest";
import { acqStateToStatus, extractSolNum, samOk, samFailure } from "../../scripts/reverify-contract-tracker.js";

describe("reverify-contract-tracker pure logic", () => {
  it("maps SAM acquisition states to tracker statuses conservatively", () => {
    expect(acqStateToStatus("AWARDED")).toBe("awarded");
    expect(acqStateToStatus("RFP_OPEN")).toBe("active");
    expect(acqStateToStatus("RFP_CLOSED")).toBe("active");
    expect(acqStateToStatus("RFI_OPEN")).toBe("upcoming");
    expect(acqStateToStatus("DRAFT_RFP")).toBe("upcoming");
    expect(acqStateToStatus("RFI_CLOSED_RECENT")).toBe("upcoming");
  });

  it("returns null (flag, do not auto-change) for ambiguous/unknown states", () => {
    expect(acqStateToStatus("RFI_CLOSED_STALE")).toBeNull();
    expect(acqStateToStatus("UNKNOWN")).toBeNull();
    expect(acqStateToStatus(undefined)).toBeNull();
  });

  it("extracts real federal-health solicitation numbers", () => {
    expect(extractSolNum({ name: "PEO DHMS", description: "Solicitation HT003826RE001 IDIQ" })).toBe("HT003826RE001");
    expect(extractSolNum({ name: "CCN", description: "solicitation 36C10G26R0003" })).toBe("36C10G26R0003");
    expect(extractSolNum({ name: "FDA Sentinel", description: "reference 75F40126SSN00100" })).toBe("75F40126SSN00100");
    expect(extractSolNum({ name: "ASPR", description: "75A50126R00001 Sources Sought" })).toBe("75A50126R00001");
    expect(extractSolNum({ name: "IHS 4DW", description: "award 140D0424C0039" })).toBe("140D0424C0039");
  });

  it("returns null when no solicitation number is present", () => {
    expect(extractSolNum({ name: "VA EHRM", description: "Oracle Health deployment resumes" })).toBeNull();
    expect(extractSolNum({ name: "", description: "" })).toBeNull();
  });

  it("enforces the SAM 32-hex permalink rule", () => {
    expect(samOk("https://sam.gov/opp/" + "a".repeat(32) + "/view")).toBe(true);
    expect(samOk("https://sam.gov/workspace/contract/opp/" + "0".repeat(32) + "/view")).toBe(true);
    expect(samOk("https://sam.gov/opp/HT003826RE001")).toBe(false); // solicitation-number URL, not a permalink
    expect(samOk("https://sam.gov/opp/abc123/view")).toBe(false);
    expect(samOk("https://www.usaspending.gov/award/123")).toBe(true); // non-SAM urls pass
  });
});

// searchSAMOpportunities RESOLVES on upstream failure instead of throwing. If an
// unanswered lookup is treated as a real answer, the run reports "checked, no SAM
// match" for a check that never happened -- the same fake-verification failure as
// the removed auto-repair REPAIR 3. An unanswered lookup is NOT a check.
describe("reverify-contract-tracker upstream-failure classification", () => {
  it("treats a SAM quota 429 as a failure, never as a checked no-match", () => {
    const f = samFailure({
      opportunities: [], total: 0,
      error: "SAM.gov rate-limit (quota exceeded). Resets: 2026-Aug-21 00:00:00+0000 UTC.",
      status: 429, rateLimited: true, resetAt: "2026-Aug-21 00:00:00+0000 UTC",
    });
    expect(f).not.toBeNull();
    expect(f.rateLimited).toBe(true);
    expect(f.reason).toContain("SAM quota exhausted");
    expect(f.reason).toContain("resets 2026-Aug-21");
  });

  it("treats a non-quota SAM error as a failure but not rate-limited", () => {
    const f = samFailure({ opportunities: [], total: 0, error: "SAM.gov API 503", status: 503 });
    expect(f).not.toBeNull();
    expect(f.rateLimited).toBe(false);
    expect(f.reason).toContain("SAM lookup error");
  });

  it("treats a genuine empty answer as a real check, not a failure", () => {
    expect(samFailure({ opportunities: [], total: 0 })).toBeNull();
    expect(samFailure({ opportunities: [{ title: "x" }], total: 1 })).toBeNull();
  });

  it("treats a missing/garbage response as a failure", () => {
    expect(samFailure(null).reason).toContain("no response");
    expect(samFailure(undefined).reason).toContain("no response");
  });
});
