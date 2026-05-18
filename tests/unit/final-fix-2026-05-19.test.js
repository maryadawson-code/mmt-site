// ============================================================
// final-fix-2026-05-19.test.js
//
// Locks the post-hardening codebase-review fixes so they can't
// silently regress. Covers:
//   - create-checkout selects founding_member + tier
//   - marketpulse-gateway propagates background-trigger failure
//   - stripe-price-classification helper exists + classifies correctly
//   - stripe-subscriber-sync emits WELCOME_TIER_UNCLASSIFIED
//   - ProposalPulse upload limit = 4MB (matches backend contract)
//   - soft-timeout uses email-input id, not "email"
//   - billing-portal endpoint exists + replaces hardcoded portal links
//   - noscript premium CTA present on /dashboard
//   - ask-mmt month label rendered dynamically
//   - glossary CCN copy updated
// ============================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const REPO = path.resolve(process.cwd());

describe("P0 #2 — create-checkout selects founding_member + tier", () => {
  const src = fs.readFileSync(path.join(REPO, "netlify/functions/create-checkout.js"), "utf8");
  it("mp_users select includes founding_member and tier", () => {
    expect(src).toMatch(/\.select\(["']id, stripe_customer_id, subscription_tier, subscription_status, founding_member, tier["']\)/);
  });
});

describe("P0 #5 — marketpulse-gateway propagates background-trigger failure", () => {
  const src = fs.readFileSync(path.join(REPO, "netlify/functions/marketpulse-gateway.js"), "utf8");
  it("rolls back reports_used and emits marketpulse_background_trigger_failed", () => {
    expect(src).toMatch(/event_type:\s*["']marketpulse_background_trigger_failed["']/);
    expect(src).toMatch(/rolled_back_reports_used/);
  });
  it("returns 502 + retry/contact body when background trigger not accepted", () => {
    expect(src).toMatch(/statusCode:\s*502/);
    expect(src).toMatch(/contact_email/);
    expect(src).toMatch(/background_trigger_failed/);
  });
});

describe("P1 #6 — centralized Stripe price-ID classification", () => {
  const helperPath = path.join(REPO, "netlify/functions/lib/stripe-price-classification.js");
  it("helper module exists", () => {
    expect(fs.existsSync(helperPath)).toBe(true);
  });
  it("exports classifyPriceId, classifySubscription, buildUnclassifiedOpsRow, getAllMmtPremiumPriceIds", () => {
    const m = require(helperPath);
    expect(typeof m.classifyPriceId).toBe("function");
    expect(typeof m.classifySubscription).toBe("function");
    expect(typeof m.buildUnclassifiedOpsRow).toBe("function");
    expect(typeof m.getAllMmtPremiumPriceIds).toBe("function");
  });
  it("classifyPriceId returns null for an empty env (smoke)", () => {
    const { classifyPriceId } = require(helperPath);
    expect(classifyPriceId(undefined)).toBe(null);
    expect(classifyPriceId("")).toBe(null);
    expect(classifyPriceId("price_random_not_configured")).toBe(null);
  });
  it("classifyPriceId honors STRIPE_PRICE_FOUNDING env override (founding tier)", () => {
    const prev = process.env.STRIPE_PRICE_FOUNDING;
    process.env.STRIPE_PRICE_FOUNDING = "price_test_founding_xyz";
    // Reload — the helper reads env at call time, no caching.
    delete require.cache[require.resolve(path.join(REPO, "netlify/functions/lib/stripe-price-classification.js"))];
    const { classifyPriceId, classifySubscription } = require(path.join(REPO, "netlify/functions/lib/stripe-price-classification.js"));
    expect(classifyPriceId("price_test_founding_xyz")).toBe("founding");
    const sub = { id: "sub_t1", customer: "cus_t1", items: { data: [{ price: { id: "price_test_founding_xyz" } }] } };
    expect(classifySubscription(sub).tier).toBe("founding");
    // Cleanup
    if (prev === undefined) delete process.env.STRIPE_PRICE_FOUNDING;
    else process.env.STRIPE_PRICE_FOUNDING = prev;
  });
  it("buildUnclassifiedOpsRow returns the WELCOME_TIER_UNCLASSIFIED row shape", () => {
    const { buildUnclassifiedOpsRow } = require(helperPath);
    const sub = { id: "sub_unk", customer: "cus_unk", items: { data: [{ price: { id: "price_unknown_drifted" } }] } };
    const row = buildUnclassifiedOpsRow(sub, { source_function: "test", email: "x@y.com" });
    expect(row.event_type).toBe("WELCOME_TIER_UNCLASSIFIED");
    expect(row.severity).toBe("warning");
    expect(row.affected_entity).toBe("sub_unk");
    expect(row.details.unknown_price_ids).toContain("price_unknown_drifted");
    expect(row.details.remediation).toMatch(/Add the new Stripe price ID/);
  });
});

describe("P1 #7 — stripe-subscriber-sync emits WELCOME_TIER_UNCLASSIFIED", () => {
  const src = fs.readFileSync(path.join(REPO, "netlify/functions/stripe-subscriber-sync.js"), "utf8");
  it("imports buildUnclassifiedOpsRow from the centralized helper", () => {
    expect(src).toMatch(/require\(["']\.\/lib\/stripe-price-classification["']\)/);
    expect(src).toMatch(/buildUnclassifiedOpsRow/);
  });
  it("inserts an unclassified ops_event for MMT subs that don't match any configured price", () => {
    // The fix wraps the insert in `if (!tier) { ... }`. Verify the
    // structure rather than the exact bytes so future formatting tweaks
    // don't break the test.
    expect(src).toMatch(/if \(!tier\)\s*\{\s*[\s\S]{0,200}?buildUnclassifiedOpsRow/);
  });
});

describe("Frontend #8 — ProposalPulse upload limit aligned to 4MB", () => {
  const src = fs.readFileSync(path.join(REPO, "js/proposal-pulse.js"), "utf8");
  it("MAX_FILE_SIZE = 4 * 1024 * 1024 (NOT 15)", () => {
    expect(src).toMatch(/MAX_FILE_SIZE = 4 \* 1024 \* 1024/);
    expect(src).not.toMatch(/MAX_FILE_SIZE = 15 \* 1024 \* 1024/);
  });
});

describe("Frontend #13 — soft-timeout uses email-input id", () => {
  const src = fs.readFileSync(path.join(REPO, "js/proposal-pulse.js"), "utf8");
  it("showTimeoutMessage looks up email-input first, then email", () => {
    expect(src).toMatch(/getElementById\(['"]email-input['"]\)\s*\|\|\s*document\.getElementById\(['"]email['"]\)/);
  });
  it("fallback wording is 'your inbox', not the literal 'your email'", () => {
    expect(src).toMatch(/['"]your inbox['"]/);
  });
});

describe("Frontend #10 — per-user Stripe billing-portal endpoint", () => {
  it("billing-portal.js exists and is a POST endpoint", () => {
    const p = path.join(REPO, "netlify/functions/billing-portal.js");
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, "utf8");
    expect(src).toMatch(/event\.httpMethod !==\s*["']POST["']/);
    expect(src).toMatch(/stripe\.billingPortal\.sessions\.create/);
  });
  it("dashboard.html no longer links the shared billing.stripe.com login portal", () => {
    const src = fs.readFileSync(path.join(REPO, "premium/dashboard.html"), "utf8");
    expect(src).not.toMatch(/href="https:\/\/billing\.stripe\.com\/p\/login/);
    expect(src).toMatch(/\/\.netlify\/functions\/billing-portal/);
  });
  it("settings.html no longer links the shared billing.stripe.com login portal (2 places)", () => {
    const src = fs.readFileSync(path.join(REPO, "premium/settings.html"), "utf8");
    expect(src).not.toMatch(/href="https:\/\/billing\.stripe\.com\/p\/login/);
    const hits = (src.match(/\/\.netlify\/functions\/billing-portal/g) || []).length;
    expect(hits).toBeGreaterThanOrEqual(2);
  });
});

describe("Frontend #12 — noscript premium CTA on /dashboard", () => {
  const src = fs.readFileSync(path.join(REPO, "dashboard.html"), "utf8");
  it("dashboard.html includes a <noscript> block with a support email + pricing link", () => {
    expect(src).toMatch(/<noscript>[\s\S]+support@missionmeetstech\.com[\s\S]+<\/noscript>/);
    expect(src).toMatch(/<noscript>[\s\S]+\/pricing\.html[\s\S]+<\/noscript>/);
  });
});

describe("Frontend #9 — stale copy fixes", () => {
  it("Ask MMT month label is rendered dynamically (no literal 'April 2026' in HTML default)", () => {
    const src = fs.readFileSync(path.join(REPO, "premium/ask-mmt.html"), "utf8");
    expect(src).not.toMatch(/id="ask-month-label">April 2026</);
    expect(src).toMatch(/toLocaleDateString\(['"]en-US['"],\s*\{ month: ['"]long['"], year: ['"]numeric['"] \}\)/);
  });
  it("Glossary CCN copy reflects post-Apr-17 status (proposals received, award TBD)", () => {
    const src = fs.readFileSync(path.join(REPO, "glossary.html"), "utf8");
    expect(src).not.toMatch(/Proposals due April 17, 2026/);
    expect(src).toMatch(/Proposals received April 17, 2026; award TBD/);
  });
  it("ProposalPulse demo says 1 free assessment (not 3)", () => {
    const src = fs.readFileSync(path.join(REPO, "demos/proposal-pulse-demo.html"), "utf8");
    expect(src).toMatch(/1 free assessment/);
    expect(src).not.toMatch(/3 free assessments/);
  });
});
