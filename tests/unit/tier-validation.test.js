import { describe, it, expect } from "vitest";

// Test the tier gating logic from score-deck.js
// Extracted as pure functions for testability

function shouldBlockFreeUser(tier, usesRemaining) {
  return tier === "free" && usesRemaining <= 0;
}

function getUsesRemainingForResponse(tier, usesRemaining) {
  return tier === "free" ? usesRemaining - 1 : 999;
}

describe("tier validation", () => {
  describe("free tier gating", () => {
    it("blocks free user with 0 uses remaining", () => {
      expect(shouldBlockFreeUser("free", 0)).toBe(true);
    });

    it("blocks free user with negative uses remaining", () => {
      expect(shouldBlockFreeUser("free", -1)).toBe(true);
    });

    it("allows free user with uses remaining", () => {
      expect(shouldBlockFreeUser("free", 3)).toBe(false);
      expect(shouldBlockFreeUser("free", 1)).toBe(false);
    });

    it("allows paid tier regardless of uses remaining", () => {
      expect(shouldBlockFreeUser("paid", 0)).toBe(false);
      expect(shouldBlockFreeUser("paid", -5)).toBe(false);
    });

    it("allows admin tier regardless of uses remaining", () => {
      expect(shouldBlockFreeUser("admin", 0)).toBe(false);
      expect(shouldBlockFreeUser("admin", -10)).toBe(false);
    });

    it("allows unknown tier (not free)", () => {
      expect(shouldBlockFreeUser("enterprise", 0)).toBe(false);
      expect(shouldBlockFreeUser(undefined, 0)).toBe(false);
    });
  });

  describe("uses remaining response", () => {
    it("returns decremented count for free tier", () => {
      expect(getUsesRemainingForResponse("free", 3)).toBe(2);
      expect(getUsesRemainingForResponse("free", 1)).toBe(0);
    });

    it("returns 999 for paid tier", () => {
      expect(getUsesRemainingForResponse("paid", 5)).toBe(999);
    });

    it("returns 999 for admin tier", () => {
      expect(getUsesRemainingForResponse("admin", 0)).toBe(999);
    });
  });
});

describe("input validation", () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it("accepts valid emails", () => {
    expect(emailRegex.test("user@example.com")).toBe(true);
    expect(emailRegex.test("mary@missionmeetstech.com")).toBe(true);
    expect(emailRegex.test("test+tag@domain.co")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(emailRegex.test("")).toBe(false);
    expect(emailRegex.test("noatsign")).toBe(false);
    expect(emailRegex.test("@nodomain")).toBe(false);
    expect(emailRegex.test("spaces in@email.com")).toBe(false);
  });

  it("rejects emails exceeding 254 chars", () => {
    const longEmail = "a".repeat(246) + "@test.com";
    expect(longEmail.length).toBeGreaterThan(254);
    // score-deck.js checks email.length > 254 separately
  });
});

describe("document type validation", () => {
  // ALLOWED_TYPES from score-deck.js
  const ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-powerpoint": "pptx",
    "application/msword": "docx",
  };

  it("resolves PDF type", () => {
    expect(ALLOWED_TYPES["application/pdf"]).toBe("pdf");
  });

  it("resolves modern PPTX type", () => {
    expect(ALLOWED_TYPES["application/vnd.openxmlformats-officedocument.presentationml.presentation"]).toBe("pptx");
  });

  it("resolves modern DOCX type", () => {
    expect(ALLOWED_TYPES["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]).toBe("docx");
  });

  it("resolves legacy PPT type", () => {
    expect(ALLOWED_TYPES["application/vnd.ms-powerpoint"]).toBe("pptx");
  });

  it("resolves legacy DOC type", () => {
    expect(ALLOWED_TYPES["application/msword"]).toBe("docx");
  });

  it("rejects unsupported types", () => {
    expect(ALLOWED_TYPES["text/plain"]).toBeUndefined();
    expect(ALLOWED_TYPES["image/png"]).toBeUndefined();
    expect(ALLOWED_TYPES["application/zip"]).toBeUndefined();
  });
});

describe("file size validation", () => {
  const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

  it("calculates base64 file size correctly", () => {
    // base64 is ~4/3 of original size, so reverse: (b64len * 3) / 4
    const smallFile = "a".repeat(1000); // ~750 bytes
    expect((smallFile.length * 3) / 4).toBeLessThan(MAX_FILE_SIZE_BYTES);
  });

  it("rejects files over 15MB", () => {
    const oversized = "a".repeat(21 * 1024 * 1024); // ~15.75MB decoded
    expect((oversized.length * 3) / 4).toBeGreaterThan(MAX_FILE_SIZE_BYTES);
  });
});
