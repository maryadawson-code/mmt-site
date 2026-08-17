import { describe, it, expect } from "vitest";
import { acqStateToStatus, extractSolNum, samOk } from "../../scripts/reverify-contract-tracker.js";

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
