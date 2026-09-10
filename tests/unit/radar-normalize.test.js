// Unit tests for lib/radar-normalize.js — safe coercion for model-returned
// radar fields. Locks the 2026-09-07 EBUY_SCAN_FAILED failure mode: the
// web-search LLM returned a non-string field (a bare-number solicitation
// number / value estimate) and a direct .toLowerCase()/.substring() call
// threw a TypeError that aborted the entire scan. These tests feed the
// exact hostile shapes and assert nothing throws and output stays string.

import { describe, it, expect } from "vitest";
import { toStr, dedupeKey } from "../../netlify/functions/lib/radar-normalize.js";

describe("toStr", () => {
  it("passes strings through and applies the cap", () => {
    expect(toStr("RFQ1810815")).toBe("RFQ1810815");
    expect(toStr("abcdef", 3)).toBe("abc");
  });

  it("coerces a bare-number solicitation number instead of throwing", () => {
    expect(toStr(1810815)).toBe("1810815");
  });

  it("coerces a numeric value_estimate instead of throwing", () => {
    expect(toStr(2500000, 100)).toBe("2500000");
  });

  it("returns empty string for null and undefined", () => {
    expect(toStr(null)).toBe("");
    expect(toStr(undefined)).toBe("");
    expect(toStr(null, 50)).toBe("");
  });

  it("coerces booleans, arrays, and objects without throwing", () => {
    expect(toStr(true)).toBe("true");
    expect(toStr([541512, 541511])).toBe("[541512,541511]");
    expect(toStr({ min: 1, max: 5 }, 8)).toBe('{"min":1');
  });

  it("never returns a non-string even for unstringifiable input", () => {
    const circular = {};
    circular.self = circular; // JSON.stringify throws on this
    expect(toStr(circular)).toBe("");
    expect(toStr(Symbol("x"))).toBe(""); // String(Symbol) is fine but JSON path returns undefined
  });
});

describe("dedupeKey", () => {
  it("lowercases the solicitation number", () => {
    expect(dedupeKey({ solicitation_number: "RFQ1810815" })).toBe("rfq1810815");
  });

  it("survives a bare-number solicitation number (the crash input)", () => {
    expect(dedupeKey({ solicitation_number: 1810815 })).toBe("1810815");
  });

  it("falls back to title when solicitation number is missing or blank", () => {
    expect(dedupeKey({ title: "VA Telehealth Support" })).toBe("va telehealth support");
    expect(dedupeKey({ solicitation_number: "  ", title: "X" })).toBe("x");
  });

  it("returns null when neither field yields text", () => {
    expect(dedupeKey({})).toBe(null);
    expect(dedupeKey({ solicitation_number: null, title: "" })).toBe(null);
    expect(dedupeKey(null)).toBe(null);
    expect(dedupeKey("not-an-object")).toBe(null);
  });
});
