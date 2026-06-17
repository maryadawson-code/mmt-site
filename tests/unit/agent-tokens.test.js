// Agent Access — token crypto + scope/expiry helpers (Phase 2, GATE 2).
// Enforces the security invariants the read API depends on:
//   - raw token is mmt_pat_ + 48 hex (192 bits entropy)
//   - stored hash is 64-char SHA-256 hex, never the raw token
//   - prefix is display-only (8 hex), reveals nothing
//   - unknown scopes are rejected (no silent drop)
//   - expiry is constrained to the friendly options 30/90/365/never

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  generateToken, hashToken, looksLikeToken, normalizeScopes, expiryToIso,
  VALID_SCOPES, DEFAULT_SCOPES, MAX_ACTIVE_TOKENS_PER_USER, DEFAULT_EXPIRY_DAYS,
} from "../../netlify/functions/lib/agent-tokens.js";

describe("generateToken", () => {
  it("produces mmt_pat_ + 48 hex chars", () => {
    const { raw } = generateToken();
    expect(raw).toMatch(/^mmt_pat_[0-9a-f]{48}$/);
  });
  it("stores a 64-char SHA-256 hex hash, never the raw token", () => {
    const { raw, hash } = generateToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(raw);
    expect(hash).toBe(crypto.createHash("sha256").update(raw).digest("hex"));
  });
  it("prefix is 8 hex chars and is a substring of the random part, not the whole token", () => {
    const { raw, prefix } = generateToken();
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
    expect(raw).toContain(prefix);
    expect(prefix.length).toBeLessThan(raw.length);
  });
  it("is unique across calls", () => {
    const a = generateToken(), b = generateToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashToken", () => {
  it("is deterministic and 64-hex", () => {
    expect(hashToken("mmt_pat_abc")).toBe(hashToken("mmt_pat_abc"));
    expect(hashToken("mmt_pat_abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("looksLikeToken", () => {
  it("accepts a well-formed token and rejects junk", () => {
    expect(looksLikeToken(generateToken().raw)).toBe(true);
    expect(looksLikeToken("mmt_pat_short")).toBe(false);
    expect(looksLikeToken("Bearer xyz")).toBe(false);
    expect(looksLikeToken(null)).toBe(false);
  });
});

describe("normalizeScopes", () => {
  it("defaults to opportunities:read", () => {
    expect(normalizeScopes(null)).toEqual({ ok: true, scopes: [...DEFAULT_SCOPES] });
    expect(normalizeScopes([])).toEqual({ ok: true, scopes: [...DEFAULT_SCOPES] });
  });
  it("accepts every valid scope and dedupes", () => {
    const r = normalizeScopes([...VALID_SCOPES, "intel:read"]);
    expect(r.ok).toBe(true);
    expect(new Set(r.scopes)).toEqual(new Set(VALID_SCOPES));
  });
  it("rejects unknown scopes (no silent drop)", () => {
    const r = normalizeScopes(["opportunities:read", "opportunities:write"]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/opportunities:write/);
  });
});

describe("expiryToIso", () => {
  it("default expiry is 90 days", () => {
    expect(DEFAULT_EXPIRY_DAYS).toBe(90);
    const iso = expiryToIso(90);
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });
  it("null = never", () => {
    expect(expiryToIso(null)).toBeNull();
  });
  it("rejects out-of-range values with undefined", () => {
    expect(expiryToIso(7)).toBeUndefined();
    expect(expiryToIso(99999)).toBeUndefined();
  });
  it("accepts 30 and 365", () => {
    expect(typeof expiryToIso(30)).toBe("string");
    expect(typeof expiryToIso(365)).toBe("string");
  });
});

describe("policy constants", () => {
  it("max 5 active tokens per user", () => {
    expect(MAX_ACTIVE_TOKENS_PER_USER).toBe(5);
  });
});
