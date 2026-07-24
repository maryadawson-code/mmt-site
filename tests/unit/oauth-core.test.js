// Agent Access — OAuth 2.1 core (PKCE, DCR validation, redirect matching,
// scope resolution, metadata). Pure logic that gates the click-to-connect flow.

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  verifyPkce, base64url, isValidRedirectUri, validateRegistration,
  redirectUriAllowed, resolveScopes, buildRedirect, authServerMetadata, SCOPES,
} from "../../netlify/functions/lib/oauth-core.js";

const s256 = (v) => base64url(crypto.createHash("sha256").update(v).digest());

describe("PKCE (S256)", () => {
  it("accepts a correct verifier, rejects a wrong one", () => {
    const verifier = "abc123~verifier.value_-Long-Enough-0987654321";
    const challenge = s256(verifier);
    expect(verifyPkce(verifier, challenge, "S256")).toBe(true);
    expect(verifyPkce("not-the-verifier", challenge, "S256")).toBe(false);
  });
  it("rejects plain unless it exactly matches, and rejects unknown methods", () => {
    expect(verifyPkce("same", "same", "plain")).toBe(true);
    expect(verifyPkce("a", "b", "plain")).toBe(false);
    expect(verifyPkce("x", "x", "weird")).toBe(false);
    expect(verifyPkce("", "", "S256")).toBe(false);
  });
});

describe("redirect_uri validation (DCR + match)", () => {
  it("allows https, localhost, and custom app schemes; blocks plain http host + fragments", () => {
    expect(isValidRedirectUri("https://claude.ai/api/mcp/callback")).toBe(true);
    expect(isValidRedirectUri("http://localhost:33418/callback")).toBe(true);
    expect(isValidRedirectUri("http://127.0.0.1:5000/cb")).toBe(true);
    expect(isValidRedirectUri("claude://oauth/callback")).toBe(true);
    expect(isValidRedirectUri("http://evil.example.com/cb")).toBe(false);
    expect(isValidRedirectUri("https://ok.com/cb#frag")).toBe(false);
    expect(isValidRedirectUri("not a url")).toBe(false);
  });
  it("exact-matches the registered set (no prefix tricks)", () => {
    const reg = ["https://claude.ai/cb", "claude://cb"];
    expect(redirectUriAllowed("https://claude.ai/cb", reg)).toBe(true);
    expect(redirectUriAllowed("https://claude.ai/cb/evil", reg)).toBe(false);
    expect(redirectUriAllowed("https://claude.ai.evil.com/cb", reg)).toBe(false);
  });
});

describe("validateRegistration (RFC 7591)", () => {
  it("requires at least one valid redirect_uri and returns a public client", () => {
    const bad = validateRegistration({ redirect_uris: [] });
    expect(bad.ok).toBe(false);
    const rejects = validateRegistration({ redirect_uris: ["http://evil.com/x"] });
    expect(rejects.ok).toBe(false);
    const ok = validateRegistration({ client_name: "Claude", redirect_uris: ["https://claude.ai/cb"] });
    expect(ok.ok).toBe(true);
    expect(ok.client.token_endpoint_auth_method).toBe("none"); // PKCE public client
    expect(ok.client.grant_types).toContain("refresh_token");
  });
});

describe("scope resolution", () => {
  it("intersects with granted scopes, defaults when none valid", () => {
    expect(resolveScopes("opportunities:read tracker:read")).toEqual(["opportunities:read", "tracker:read"]);
    expect(resolveScopes("bogus:write")).toEqual(["opportunities:read", "intel:read"]);
    expect(resolveScopes("")).toEqual(["opportunities:read", "intel:read"]);
    // no privilege escalation to a scope we don't offer
    expect(resolveScopes("admin:all opportunities:read")).toEqual(["opportunities:read"]);
  });
});

describe("buildRedirect", () => {
  it("appends params and preserves any existing query", () => {
    const u = buildRedirect("https://claude.ai/cb?x=1", { code: "abc", state: "s1" });
    expect(u).toContain("x=1");
    expect(u).toContain("code=abc");
    expect(u).toContain("state=s1");
  });
  it("omits null params (e.g. absent state)", () => {
    const u = buildRedirect("https://claude.ai/cb", { code: "abc", state: undefined });
    expect(u).toContain("code=abc");
    expect(u).not.toContain("state=");
  });
});

describe("authorization server metadata (RFC 8414)", () => {
  it("advertises the endpoints, PKCE S256, and only our scopes", () => {
    const m = authServerMetadata("https://missionmeetstech.com");
    expect(m.authorization_endpoint).toBe("https://missionmeetstech.com/oauth/authorize");
    expect(m.token_endpoint).toBe("https://missionmeetstech.com/oauth/token");
    expect(m.registration_endpoint).toBe("https://missionmeetstech.com/oauth/register");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(m.scopes_supported).toEqual(SCOPES);
  });
});
