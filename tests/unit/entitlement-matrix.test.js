// Entitlement matrix — covers every user state across the four canonical
// paid-tool gates (Ask MMT, Pursuit Score, Compliance Check, Signal Chain).
// This test exists because the platform shipped with each function rolling
// its own .eq("email").select(...) shape — and one of those shapes (Ask MMT)
// referenced a non-existent `is_founding_member` column. A Founding Member
// (Danielle Applegate) was therefore blocked from a feature she paid for.
//
// The matrix below enforces:
//   - the canonical column is `founding_member` (not `is_founding_member`)
//   - mmt_premium_founding subscription_tier values count as paid
//   - inactive subs do NOT pass
//   - admin/legacy tiers still pass
//   - per-tier monthly caps are correct

import { describe, it, expect } from "vitest";
import {
  loadEntitlement,
  blockMessageFor,
  ASK_MMT_LIMITS,
  PURSUIT_SCORE_LIMITS,
  COMPLIANCE_CHECK_LIMITS,
} from "../../netlify/functions/lib/entitlement.js";

// Minimal Supabase stub — `.from().select().ilike().maybeSingle()`
function makeSupabase(rowByEmail) {
  return {
    from() {
      return {
        select() {
          return {
            ilike(_col, email) {
              return {
                async maybeSingle() {
                  return { data: rowByEmail[email.toLowerCase()] || null };
                },
              };
            },
          };
        },
        // ops_events insert path used by logEntitlementMismatch
        insert() { return Promise.resolve({}); },
      };
    },
  };
}

describe("entitlement matrix", () => {
  it("anonymous (no row) -> ok=false, tier=anonymous, all caps 0", async () => {
    const sb = makeSupabase({});
    const e = await loadEntitlement(sb, "ghost@example.com");
    expect(e.ok).toBe(false);
    expect(e.tier).toBe("anonymous");
    expect(e.askMmtMonthlyCap).toBe(0);
    expect(e.pursuitScoreMonthlyCap).toBe(0);
    expect(e.complianceCheckMonthlyCap).toBe(0);
    expect(blockMessageFor(e).reason_code).toBe("NOT_SIGNED_IN");
  });

  it("free (row exists, no paid sub) -> ok=false, tier=free", async () => {
    const sb = makeSupabase({ "free@example.com": { tier: "subscriber", subscription_tier: null, subscription_status: null, founding_member: false } });
    const e = await loadEntitlement(sb, "free@example.com");
    expect(e.ok).toBe(false);
    expect(e.tier).toBe("free");
    expect(blockMessageFor(e).reason_code).toBe("FREE_TIER");
  });

  it("premium active -> ok=true, premium caps", async () => {
    const sb = makeSupabase({ "p@example.com": { tier: null, subscription_tier: "premium", subscription_status: "active", founding_member: false } });
    const e = await loadEntitlement(sb, "p@example.com");
    expect(e.ok).toBe(true);
    expect(e.tier).toBe("premium");
    expect(e.askMmtMonthlyCap).toBe(ASK_MMT_LIMITS.premium);
    expect(e.pursuitScoreMonthlyCap).toBe(PURSUIT_SCORE_LIMITS.premium);
    expect(e.complianceCheckMonthlyCap).toBe(COMPLIANCE_CHECK_LIMITS.premium);
  });

  it("FOUNDING MEMBER (premium active + founding_member=true) -> tier=founding, founding caps", async () => {
    // The Danielle Applegate scenario.
    const sb = makeSupabase({ "danielle@example.com": { tier: null, subscription_tier: "premium", subscription_status: "active", founding_member: true } });
    const e = await loadEntitlement(sb, "danielle@example.com");
    expect(e.ok).toBe(true);
    expect(e.tier).toBe("founding");
    expect(e.founding_member).toBe(true);
    expect(e.askMmtMonthlyCap).toBe(ASK_MMT_LIMITS.founding);
    expect(e.askMmtMonthlyCap).toBeGreaterThan(ASK_MMT_LIMITS.premium);
  });

  it("legacy mmt_premium_founding subscription_tier value still passes", async () => {
    const sb = makeSupabase({ "legacy@example.com": { tier: null, subscription_tier: "mmt_premium_founding", subscription_status: "active", founding_member: true } });
    const e = await loadEntitlement(sb, "legacy@example.com");
    expect(e.ok).toBe(true);
    expect(e.tier).toBe("founding");
  });

  it("trialing status counts as paid", async () => {
    const sb = makeSupabase({ "trial@example.com": { tier: null, subscription_tier: "premium", subscription_status: "trialing", founding_member: false } });
    const e = await loadEntitlement(sb, "trial@example.com");
    expect(e.ok).toBe(true);
    expect(e.tier).toBe("premium");
  });

  it("inactive subscription does NOT pass and surfaces SUBSCRIPTION_INACTIVE", async () => {
    const sb = makeSupabase({ "lapsed@example.com": { tier: null, subscription_tier: "premium", subscription_status: "canceled", founding_member: true } });
    const e = await loadEntitlement(sb, "lapsed@example.com");
    expect(e.ok).toBe(false);
    expect(e.reason).toBe("inactive");
    expect(blockMessageFor(e).reason_code).toBe("SUBSCRIPTION_INACTIVE");
  });

  it("institutional active -> tier=institutional, higher caps", async () => {
    const sb = makeSupabase({ "i@example.com": { tier: null, subscription_tier: "institutional", subscription_status: "active", founding_member: false } });
    const e = await loadEntitlement(sb, "i@example.com");
    expect(e.tier).toBe("institutional");
    expect(e.askMmtMonthlyCap).toBeGreaterThan(ASK_MMT_LIMITS.founding);
    expect(e.pursuitScoreMonthlyCap).toBeGreaterThan(PURSUIT_SCORE_LIMITS.premium);
  });

  it("admin legacy tier still passes regardless of subscription_tier", async () => {
    const sb = makeSupabase({ "mary@example.com": { tier: "admin", subscription_tier: null, subscription_status: null, founding_member: false } });
    const e = await loadEntitlement(sb, "mary@example.com");
    expect(e.ok).toBe(true);
    expect(e.tier).toBe("admin");
  });

  it("legacy paid tier still passes regardless of subscription_tier", async () => {
    const sb = makeSupabase({ "old@example.com": { tier: "paid", subscription_tier: null, subscription_status: null, founding_member: false } });
    const e = await loadEntitlement(sb, "old@example.com");
    expect(e.ok).toBe(true);
  });

  it("case-insensitive email lookup (Stripe occasionally inserts mixed-case)", async () => {
    const sb = makeSupabase({ "mixed@example.com": { tier: null, subscription_tier: "premium", subscription_status: "active", founding_member: false } });
    const e = await loadEntitlement(sb, "MIXED@example.com");
    expect(e.ok).toBe(true);
  });

  it("ASK_MMT_LIMITS: founding > premium, institutional > founding", () => {
    expect(ASK_MMT_LIMITS.founding).toBeGreaterThan(ASK_MMT_LIMITS.premium);
    expect(ASK_MMT_LIMITS.institutional).toBeGreaterThan(ASK_MMT_LIMITS.founding);
    expect(ASK_MMT_LIMITS.free).toBe(0);
    expect(ASK_MMT_LIMITS.anonymous).toBe(0);
  });
});

describe("premium-chat founding-member access (Sprint B 2026-05-13)", () => {
  // premium-chat previously rolled its own `.eq("email").select("tier,
  // subscription_tier, subscription_status").single()` shape and only
  // matched subscription_tier === "premium" + active. A Founding Member
  // with subscription_tier === "mmt_premium_founding" would FAIL that
  // check unless they also had tier === "admin" / "paid" — same class
  // of bug as the 2026-04-27 Ask MMT incident. Sprint B replaced it
  // with the canonical loadEntitlement helper.
  //
  // This test guards two things:
  //   1. The entitlement-matrix output for a founding member passes
  //      (ok=true, tier="founding"), which is what premium-chat now
  //      checks via entitlement.ok.
  //   2. premium-chat.js literally imports loadEntitlement (a regression
  //      grep that catches anyone re-introducing the inline shape).
  it("founding-member entitlement passes the same gate premium-chat uses", async () => {
    const sb = makeSupabase({ "founding@example.com": { tier: null, subscription_tier: "premium", subscription_status: "active", founding_member: true } });
    const e = await loadEntitlement(sb, "founding@example.com");
    expect(e.ok).toBe(true);
    expect(e.tier).toBe("founding");
  });

  it("mmt_premium_founding subscription_tier also passes (legacy founders)", async () => {
    const sb = makeSupabase({ "legacy-founder@example.com": { tier: null, subscription_tier: "mmt_premium_founding", subscription_status: "active", founding_member: true } });
    const e = await loadEntitlement(sb, "legacy-founder@example.com");
    expect(e.ok).toBe(true);
    expect(e.tier).toBe("founding");
  });

  it("premium-chat.js imports loadEntitlement (no inline mp_users entitlement)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const p = path.resolve(process.cwd(), "netlify/functions/premium-chat.js");
    const txt = fs.readFileSync(p, "utf8");
    expect(txt).toMatch(/require\(["']\.\/lib\/entitlement["']\)/);
    expect(txt).toMatch(/loadEntitlement\s*\(/);
    // Old shape should be gone — no inline subscription_tier-only check.
    expect(txt).not.toMatch(/\.eq\(\s*["']email["'][^)]*\)[\s\S]{0,200}\.single\(\)/);
  });
});

describe("regression guard: no function uses is_founding_member", () => {
  // Tests for the literal typo that caused the 2026-04-27 incident.
  // If anyone reintroduces it, this fails before deploy.
  it("the canonical column is `founding_member`, not `is_founding_member`", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.resolve(process.cwd(), "netlify/functions");
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return walk(p);
      if (e.isFile() && p.endsWith(".js")) return [p];
      return [];
    });
    const files = walk(dir);
    // Match property access (`user.is_founding_member`, `.eq("is_founding_member", ...)`)
    // not documentation prose. The entitlement helper itself documents
    // the legacy column in a comment — that's fine.
    const offenders = files.filter((f) => {
      // Skip the entitlement helper — it documents the legacy column in a comment.
      if (f.endsWith("/lib/entitlement.js")) return false;
      const txt = fs.readFileSync(f, "utf8");
      return /\.is_founding_member\b|"is_founding_member"|'is_founding_member'/.test(txt);
    });
    expect(offenders).toEqual([]);
  });
});
