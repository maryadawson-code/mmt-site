// ============================================================
// revenue-integrity.test.js
//
// Locks the 2026-05-19 sprint gates so revenue-leak regressions
// fail CI before they reach prod. Covers:
//   - ProposalPulse pricing constants (1999 standard, 1499 premium)
//   - ProposalPulse second unpaid assessment blocks before model work
//   - ProposalPulse webhook grants exactly +1 use
//   - MarketPulse internal-secret gate rejects unauthed direct POSTs
//   - free_* session_id alone does not authorize MP generation
//   - Gateway/webhook authorized MP call carries the secret
//   - Healthcare topic still triggers Tier 1 seed injection (regression
//     guard for the 8a24daa hardening)
// ============================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const REPO = path.resolve(process.cwd());

describe("ProposalPulse — pricing + checkout metadata", () => {
  const checkoutSrc = fs.readFileSync(path.join(REPO, "netlify/functions/create-checkout.js"), "utf8");

  it("pricing constants are unchanged: 1999 standard, 1499 premium", () => {
    expect(checkoutSrc).toMatch(/const PRICE_CENTS = 1999/);
    expect(checkoutSrc).toMatch(/const PREMIUM_PRICE_CENTS = 1499/);
  });

  it("Stripe checkout metadata includes app=mmt, product=proposalpulse, feature=lethality_test, price_cents, price_tier, user_email, mp_user_id", () => {
    // The metadata block is built inline; check for all keys + their values.
    expect(checkoutSrc).toMatch(/app:\s*"mmt"/);
    expect(checkoutSrc).toMatch(/product:\s*"proposalpulse"/);
    expect(checkoutSrc).toMatch(/feature:\s*"lethality_test"/);
    expect(checkoutSrc).toMatch(/price_cents:\s*String\(unitAmount\)/);
    expect(checkoutSrc).toMatch(/price_tier:\s*priceTier/);
    expect(checkoutSrc).toMatch(/user_email:\s*email/);
    expect(checkoutSrc).toMatch(/mp_user_id:\s*user\.id/);
  });

  it("standard checkout uses 1999 + price_tier=standard when user is not premium", () => {
    // price_tier is derived from isPremium; check the assignment.
    expect(checkoutSrc).toMatch(/const priceTier = isPremium\s*\?\s*"premium"\s*:\s*"standard"/);
    expect(checkoutSrc).toMatch(/const unitAmount = isPremium\s*\?\s*PREMIUM_PRICE_CENTS\s*:\s*PRICE_CENTS/);
  });

  it("emits proposalpulse_checkout_started ops_event with email + session id + price_tier", () => {
    expect(checkoutSrc).toMatch(/event_type:\s*"proposalpulse_checkout_started"/);
    expect(checkoutSrc).toMatch(/price_tier:\s*priceTier/);
  });

  it("emits proposalpulse_checkout_failed on error", () => {
    expect(checkoutSrc).toMatch(/event_type:\s*"proposalpulse_checkout_failed"/);
  });
});

describe("ProposalPulse — entitlement gate fires BEFORE scoring/model work", () => {
  const gatewaySrc = fs.readFileSync(path.join(REPO, "netlify/functions/score-deck.js"), "utf8");

  it("limit_reached returns 403 before pending row insert and before background invoke", () => {
    // Order: getFeatureUsage → 403 if uses_remaining <= 0 → THEN insert pending row → THEN call background.
    const gateIdx = gatewaySrc.search(/usage\.uses_remaining\s*<=\s*0/);
    const insertIdx = gatewaySrc.search(/from\(["']mp_scoring_history["']\)\s*\.insert/);
    expect(gateIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(gateIdx); // gate fires first
  });

  it("limit_reached payload exposes checkout_endpoint for working over-limit UX", () => {
    expect(gatewaySrc).toMatch(/checkout_endpoint:\s*["']\/\.netlify\/functions\/create-checkout["']/);
  });

  it("emits proposalpulse_limit_hit ops_event with email + mp_user_id", () => {
    expect(gatewaySrc).toMatch(/event_type:\s*"proposalpulse_limit_hit"/);
  });
});

describe("ProposalPulse — webhook grants exactly +1 paid use", () => {
  const webhookSrc = fs.readFileSync(path.join(REPO, "netlify/functions/stripe-webhook.js"), "utf8");

  it("grants exactly +1 use (not +N) on checkout.session.completed", () => {
    expect(webhookSrc).toMatch(/uses_remaining:\s*usage\.uses_remaining\s*\+\s*1/);
    expect(webhookSrc).toMatch(/uses_remaining:\s*1/);
  });

  it("emits proposalpulse_paid_entitlement_granted on success + proposalpulse_paid_entitlement_failed on error", () => {
    expect(webhookSrc).toMatch(/event_type:\s*"proposalpulse_paid_entitlement_granted"/);
    expect(webhookSrc).toMatch(/event_type:\s*"proposalpulse_paid_entitlement_failed"/);
  });

  it("emits proposalpulse_checkout_completed on Stripe payment success", () => {
    expect(webhookSrc).toMatch(/event_type:\s*"proposalpulse_checkout_completed"/);
  });
});

describe("MarketPulse — internal-secret gate on background generator", () => {
  const bgSrc = fs.readFileSync(path.join(REPO, "netlify/functions/generate-tactical-brief-background.js"), "utf8");

  it("declares MARKETPULSE_INTERNAL_SECRET gate + constant-time compare", () => {
    expect(bgSrc).toMatch(/MARKETPULSE_INTERNAL_SECRET/);
    expect(bgSrc).toMatch(/timingSafeEqual/);
  });

  it("gate fires BEFORE Perplexity/Claude/email — i.e. before ANTHROPIC_API_KEY check + before payload parse", () => {
    const secretIdx = bgSrc.search(/const secretCheck = checkInternalSecret/);
    const anthropicIdx = bgSrc.search(/if \(!ANTHROPIC_API_KEY\)/);
    expect(secretIdx).toBeGreaterThan(0);
    expect(secretIdx).toBeLessThan(anthropicIdx);
    // Reject path returns 401 before doing any work
    expect(bgSrc).toMatch(/Unauthorized — internal call only/);
  });

  it("free_* session_id label does NOT bypass the secret check", () => {
    // The secret check runs before `payload = JSON.parse(event.body)`. So
    // session_id (free_* or anything else) cannot influence the gate result.
    const secretIdx = bgSrc.search(/checkInternalSecret\(event\)/);
    const payloadParseIdx = bgSrc.search(/payload = JSON\.parse\(event\.body\)/);
    expect(secretIdx).toBeLessThan(payloadParseIdx);
  });

  it("emits marketpulse_billing_gate_failed when the secret is missing/invalid", () => {
    expect(bgSrc).toMatch(/event_type:\s*"marketpulse_billing_gate_failed"/);
  });

  it("constantTimeEqual returns false for differing-length inputs (no length oracle)", () => {
    // The compare helper is local to the handler module. Test the equivalent
    // logic against Node's timingSafeEqual to guard the contract.
    const crypto = require("crypto");
    function ctEq(a, b) {
      const A = Buffer.from(String(a || ""), "utf8");
      const B = Buffer.from(String(b || ""), "utf8");
      if (A.length !== B.length) return false;
      return crypto.timingSafeEqual(A, B);
    }
    expect(ctEq("abc", "abcdef")).toBe(false);
    expect(ctEq("abc", "abc")).toBe(true);
    expect(ctEq("abc", "abd")).toBe(false);
  });
});

describe("MarketPulse — callers send the internal secret", () => {
  it("marketpulse-gateway sends x-mp-internal-secret on both admin + free background triggers", () => {
    const src = fs.readFileSync(path.join(REPO, "netlify/functions/marketpulse-gateway.js"), "utf8");
    const hits = (src.match(/x-mp-internal-secret/g) || []).length;
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/MARKETPULSE_INTERNAL_SECRET/);
  });

  it("tactical-brief-webhook sends x-mp-internal-secret on paid trigger", () => {
    const src = fs.readFileSync(path.join(REPO, "netlify/functions/tactical-brief-webhook.js"), "utf8");
    expect(src).toMatch(/x-mp-internal-secret/);
    expect(src).toMatch(/MARKETPULSE_INTERNAL_SECRET/);
  });

  it("replay-tactical-brief-background sends x-mp-internal-secret on admin replay", () => {
    const src = fs.readFileSync(path.join(REPO, "netlify/functions/replay-tactical-brief-background.js"), "utf8");
    expect(src).toMatch(/x-mp-internal-secret/);
    expect(src).toMatch(/MARKETPULSE_INTERNAL_SECRET/);
  });
});

describe("MarketPulse — billing telemetry events", () => {
  it("gateway emits marketpulse_free_entitlement_used + marketpulse_checkout_started", () => {
    const src = fs.readFileSync(path.join(REPO, "netlify/functions/marketpulse-gateway.js"), "utf8");
    expect(src).toMatch(/event_type:\s*"marketpulse_free_entitlement_used"/);
    expect(src).toMatch(/event_type:\s*"marketpulse_checkout_started"/);
  });

  it("tactical-brief-webhook emits marketpulse_checkout_completed on Stripe payment", () => {
    const src = fs.readFileSync(path.join(REPO, "netlify/functions/tactical-brief-webhook.js"), "utf8");
    expect(src).toMatch(/event_type:\s*"marketpulse_checkout_completed"/);
  });
});

describe("MarketPulse — 8a24daa Tier 1 seed injection still in place", () => {
  const bgSrc = fs.readFileSync(path.join(REPO, "netlify/functions/generate-tactical-brief-background.js"), "utf8");

  it("healthcare topic still triggers the seed pack injection", () => {
    expect(bgSrc).toMatch(/isHealthcareProgramIntegrityTopic/);
    expect(bgSrc).toMatch(/getTier1SeedUrls/);
    expect(bgSrc).toMatch(/TIER1 SEEDS/);
  });

  it("seed-pack loader + JSON are unchanged file paths (no rollback)", () => {
    expect(fs.existsSync(path.join(REPO, "netlify/functions/lib/marketpulse-tier1-seeds.js"))).toBe(true);
    expect(fs.existsSync(path.join(REPO, "netlify/functions/data/marketpulse-tier1-seeds-healthcare.json"))).toBe(true);
  });
});

describe("Welcome-name fallback — never use email local-part", () => {
  it("tester-comp-welcome.firstNameFromEmail returns null (forces 'there' fallback)", () => {
    const { firstNameFromEmail } = require("../../netlify/functions/lib/email-templates/tester-comp-welcome.js");
    expect(firstNameFromEmail("j.q.public@example.com")).toBe(null);
    expect(firstNameFromEmail("anything+test@gmail.com")).toBe(null);
  });

  it("founding-member-welcome firstNameFromEmail returns null", () => {
    const founding = fs.readFileSync(path.join(REPO, "netlify/functions/lib/email-templates/founding-member-welcome.js"), "utf8");
    // The literal "Per 2026-05-19 revenue-integrity sprint" sentinel marks
    // the fix-in-place. If someone reverts the local-part-as-name fallback,
    // the comment goes too.
    expect(founding).toMatch(/2026-05-19 revenue-integrity sprint/);
    expect(founding).toMatch(/function firstNameFromEmail\(_email\)\s*\{\s*return null;/);
  });
});

describe("MarketPulse drift cleanup — rescue + archive script exists with right IDs", () => {
  const script = fs.readFileSync(path.join(REPO, "scripts/mp-rescue-and-archive.js"), "utf8");

  it("archives the 3 known admin/internal quality-fail holds", () => {
    expect(script).toMatch(/cac4e969-1cc8-410a-8e87-95d46eef9ad9/);
    expect(script).toMatch(/e27d5e9b-eced-4bd9-8f09-6734758b20bd/);
    expect(script).toMatch(/2bacfaa7-842e-4b13-8c20-c7de68503904/);
  });

  it("rescues stale order_received older than RESCUE_SLA_MIN with 0 perplexity calls and no report_url", () => {
    expect(script).toMatch(/workflow_state.*order_received/);
    expect(script).toMatch(/perplexity_call_count.*0|\(o\.perplexity_call_count \|\| 0\) === 0/);
    expect(script).toMatch(/!o\.report_url/);
  });

  it("terminal-fails after retry_count >= 1", () => {
    expect(script).toMatch(/retryCount >= 1/);
    expect(script).toMatch(/terminal_failed/);
  });

  it("emits cleanup ops events (admin_hold_archived, order_rescued, order_terminal_failed)", () => {
    expect(script).toMatch(/marketpulse_admin_hold_archived/);
    expect(script).toMatch(/marketpulse_order_rescued/);
    expect(script).toMatch(/marketpulse_order_terminal_failed/);
  });
});

describe("Weekly report — per-product billing telemetry + leakage flag", () => {
  const src = fs.readFileSync(path.join(REPO, "netlify/functions/weekly-report.js"), "utf8");

  it("collects ProposalPulse limit_hits, checkout_started/completed, paid_grants", () => {
    expect(src).toMatch(/proposalpulse_limit_hit/);
    expect(src).toMatch(/proposalpulse_checkout_started/);
    expect(src).toMatch(/proposalpulse_checkout_completed/);
    expect(src).toMatch(/proposalpulse_paid_entitlement_granted/);
  });

  it("collects MarketPulse free_used, checkout_started/completed, gate_failures, archives, rescues", () => {
    expect(src).toMatch(/marketpulse_free_entitlement_used/);
    expect(src).toMatch(/marketpulse_checkout_started/);
    expect(src).toMatch(/marketpulse_checkout_completed/);
    expect(src).toMatch(/marketpulse_billing_gate_failed/);
    expect(src).toMatch(/marketpulse_admin_hold_archived/);
    expect(src).toMatch(/marketpulse_order_rescued/);
    expect(src).toMatch(/marketpulse_order_terminal_failed/);
  });

  it("flags revenue_leak per product", () => {
    expect(src).toMatch(/revenue_leak/);
  });
});
