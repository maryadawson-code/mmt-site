// Agent Access — model router (Phase 4, GATE 4) + observability (Phase 5, GATE 5).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PROVIDERS, BANNED_SUBSTRINGS, classifyPayload, route, invoke,
} from "../../netlify/functions/lib/agent-model-router.js";
import { evaluateAlerts, evaluateBreaker } from "../../netlify/functions/lib/agent-observability.js";

describe("model router — classification + routing (GATE 4)", () => {
  it("public payload routes to Gemini by default", () => {
    expect(route("VA wants a cloud migration RFP").model).toBe("gemini-3-flash");
  });
  it("batch routes to GPT-5.4 nano, self-host to Llama 4", () => {
    expect(route("x", { batch: true }).model).toBe("gpt-5.4-nano");
    expect(route("x", { selfHost: true }).model).toBe("llama-4");
  });
  it("escalation goes to Claude Haiku", () => {
    expect(route("x", { escalate: true }).model).toBe("claude-haiku-4-5");
  });
  it("CUI/PII classifies sensitive → Bedrock GovCloud", () => {
    expect(classifyPayload("This doc is marked CUI")).toBe("sensitive");
    expect(classifyPayload("SSN 123-45-6789")).toBe("sensitive");
    expect(route("marked CUI//FOUO").model).toBe("bedrock-claude-govcloud");
    expect(route("marked CUI//FOUO").boundary).toBe("sensitive");
  });
  it("every routing decision carries max_tokens (§2c)", () => {
    expect(route("x").maxTokens).toBeGreaterThan(0);
    expect(route("x", { maxTokens: 256 }).maxTokens).toBe(256);
  });
  it("NO Chinese-origin models in the provider allow-list", () => {
    const ids = Object.keys(PROVIDERS).join(" ").toLowerCase();
    for (const banned of BANNED_SUBSTRINGS) expect(ids).not.toContain(banned);
  });
});

describe("model router — fail-closed invoke (GATE 4)", () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.CUI_PATH_CLEARED; delete process.env.GEMINI_API_KEY; });
  afterEach(() => { process.env = { ...saved }; });

  it("sensitive payload without CUI_PATH_CLEARED → 503 COMPLIANCE_HOLD", async () => {
    const r = await invoke("contains CUI marking");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.code).toBe("COMPLIANCE_HOLD");
  });
  it("public payload with no provider key → 503 PROVIDER_NOT_CONFIGURED (no call)", async () => {
    const r = await invoke("public opportunity text");
    expect(r.status).toBe(503);
    expect(r.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(r.decision.model).toBe("gemini-3-flash");
  });
  it("oversized input is rejected before routing (§2c)", async () => {
    const r = await invoke("a".repeat(30000));
    expect(r.code).toBe("INPUT_TOO_LARGE");
  });
});

describe("observability — alert thresholds (§5) + breaker (§4)", () => {
  it("fires AUTH_SPIKE/SCOPE_SPIKE/THROTTLE_SPIKE/HARVEST over thresholds", () => {
    const fired = evaluateAlerts({ unauthedPerMin: 51, forbiddenPerMin: 101, throttledPerMin: 11, mbPerHr: 60 });
    const kinds = fired.map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(["AUTH_SPIKE", "SCOPE_SPIKE", "THROTTLE_SPIKE", "HARVEST"]));
  });
  it("stays quiet under thresholds", () => {
    expect(evaluateAlerts({ unauthedPerMin: 1, forbiddenPerMin: 1, throttledPerMin: 1, mbPerHr: 1 })).toEqual([]);
  });
  it("breaker opens only with a meaningful sample + high error rate", () => {
    expect(evaluateBreaker(5, 5).open).toBe(false);       // sample too small
    expect(evaluateBreaker(40, 30).open).toBe(true);      // 75% errors
    expect(evaluateBreaker(40, 2).open).toBe(false);      // healthy
  });
});
