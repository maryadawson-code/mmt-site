import { describe, it, expect } from "vitest";
import { calculateCostCents } from "../netlify/functions/lib/cost-tracker.js";

describe("cost-tracker", () => {
  const rateCard = [
    { provider: "anthropic", model: "claude-sonnet-4-6", input_cost_per_1k_cents: "0.3", output_cost_per_1k_cents: "1.5", per_call_cost_cents: null, per_email_cost_cents: null },
    { provider: "perplexity", model: "sonar", per_call_cost_cents: "0.5", input_cost_per_1k_cents: null, output_cost_per_1k_cents: null, per_email_cost_cents: null },
    { provider: "resend", model: "transactional", per_email_cost_cents: "0.033", per_call_cost_cents: null, input_cost_per_1k_cents: null, output_cost_per_1k_cents: null },
  ];

  it("calculates Anthropic token-based cost", () => {
    const cost = calculateCostCents(rateCard, "anthropic", "claude-sonnet-4-6", 10000, 2000);
    // (10000/1000)*0.3 + (2000/1000)*1.5 = 3 + 3 = 6
    expect(cost).toBeCloseTo(6, 1);
  });

  it("calculates per-call cost for Perplexity", () => {
    const cost = calculateCostCents(rateCard, "perplexity", "sonar", 0, 0);
    expect(cost).toBeCloseTo(0.5, 1);
  });

  it("calculates per-email cost for Resend", () => {
    const cost = calculateCostCents(rateCard, "resend", "transactional", 0, 0);
    expect(cost).toBeCloseTo(0.03, 2);
  });

  it("returns 0 for unknown provider/model", () => {
    expect(calculateCostCents(rateCard, "unknown", "x", 1000, 1000)).toBe(0);
  });

  it("returns 0 with empty rate card", () => {
    expect(calculateCostCents([], "anthropic", "claude-sonnet-4-6", 1000, 1000)).toBe(0);
  });
});
