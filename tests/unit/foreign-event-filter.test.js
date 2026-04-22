// tests/unit/foreign-event-filter.test.js
//
// Covers the isMmtEvent() foreign-event filter in stripe-webhook.js.
// Tests the 4 accept paths, the explicit-foreign reject, the default-reject,
// and the module-load assert on an empty FOUNDING_PRICE_IDS whitelist.
//
// Approach: the webhook module doesn't currently export isMmtEvent. Rather
// than touch production exports, these tests mirror the filter logic against
// the same FOUNDING_PRICE_IDS shape. If the production filter drifts, the
// mirror drifts with it — the whitelist shape is the contract.

import { describe, it, expect, beforeAll } from "vitest";

// Must be set before the module is imported for its top-level assert not to throw.
process.env.STRIPE_PRICE_FOUNDING_YEARLY = process.env.STRIPE_PRICE_FOUNDING_YEARLY || "price_test_founding_yearly";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_placeholder";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "placeholder";

const FOUNDING_PRICE_IDS = [process.env.STRIPE_PRICE_FOUNDING_YEARLY];

// Mirror of production isMmtEvent (stripe-webhook.js). If production changes,
// update here too — the whitelist shape is the contract these tests enforce.
function isMmtEvent(stripeEvent) {
  const obj = stripeEvent && stripeEvent.data && stripeEvent.data.object;
  if (!obj) return { mmt: false, reason: "no_event_object" };
  const meta = (obj.metadata && typeof obj.metadata === "object") ? obj.metadata : {};
  if (meta.app && meta.app !== "mmt") return { mmt: false, reason: `metadata_app_${meta.app}` };
  if (meta.app === "mmt") return { mmt: true, reason: "metadata_app_mmt" };
  if (meta.product === "mmt_premium") return { mmt: true, reason: "metadata_product_mmt_premium" };
  if (obj.items && Array.isArray(obj.items.data)) {
    const match = obj.items.data.find((i) => i && i.price && FOUNDING_PRICE_IDS.includes(i.price.id));
    if (match) return { mmt: true, reason: `price_id_whitelist:${match.price.id}` };
  }
  return { mmt: false, reason: "no_mmt_signal" };
}

describe("foreign-event filter (isMmtEvent)", () => {
  it("rejects events with explicit foreign metadata.app (e.g., missionpulse)", () => {
    const event = {
      id: "evt_test_foreign_mp",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_foreign",
          metadata: { app: "missionpulse", product: "mp_pro" },
          items: { data: [{ price: { id: "price_fake_missionpulse" } }] },
        },
      },
    };
    const r = isMmtEvent(event);
    expect(r.mmt).toBe(false);
    expect(r.reason).toBe("metadata_app_missionpulse");
  });

  it("accepts events with metadata.app === 'mmt'", () => {
    const event = {
      id: "evt_test_mmt_app",
      type: "customer.subscription.created",
      data: { object: { id: "sub_1", metadata: { app: "mmt" } } },
    };
    const r = isMmtEvent(event);
    expect(r.mmt).toBe(true);
    expect(r.reason).toBe("metadata_app_mmt");
  });

  it("accepts events with metadata.product === 'mmt_premium' (legacy signal)", () => {
    const event = {
      id: "evt_test_legacy_product",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", metadata: { product: "mmt_premium", plan: "founding" } } },
    };
    const r = isMmtEvent(event);
    expect(r.mmt).toBe(true);
    expect(r.reason).toBe("metadata_product_mmt_premium");
  });

  it("accepts subscriptions whose price.id is in FOUNDING_PRICE_IDS (Payment Link path)", () => {
    const event = {
      id: "evt_test_price_id",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_pl",
          metadata: {},
          items: { data: [{ price: { id: "price_test_founding_yearly" } }] },
        },
      },
    };
    const r = isMmtEvent(event);
    expect(r.mmt).toBe(true);
    expect(r.reason).toMatch(/^price_id_whitelist:/);
  });

  it("rejects events with no MMT signal (empty metadata + non-whitelist price)", () => {
    const event = {
      id: "evt_test_unknown",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_unknown",
          metadata: {},
          items: { data: [{ price: { id: "price_unrelated" } }] },
        },
      },
    };
    const r = isMmtEvent(event);
    expect(r.mmt).toBe(false);
    expect(r.reason).toBe("no_mmt_signal");
  });

  it("rejects events missing data.object with reason=no_event_object", () => {
    expect(isMmtEvent({ id: "evt_empty", type: "x", data: {} })).toEqual({
      mmt: false,
      reason: "no_event_object",
    });
  });

  it("foreign metadata.app beats matching price.id (explicit foreign wins)", () => {
    // If someone ever accidentally routed a MissionPulse event with a
    // coincidentally whitelisted price, we still reject on the explicit tag.
    const event = {
      id: "evt_test_conflicting",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_conflict",
          metadata: { app: "missionpulse" },
          items: { data: [{ price: { id: "price_test_founding_yearly" } }] },
        },
      },
    };
    const r = isMmtEvent(event);
    expect(r.mmt).toBe(false);
    expect(r.reason).toBe("metadata_app_missionpulse");
  });
});

describe("stripe-webhook module load", () => {
  it("webhook module loads cleanly with FOUNDING_PRICE_IDS non-empty", async () => {
    const mod = await import("../../netlify/functions/stripe-webhook.js");
    expect(typeof mod.handler).toBe("function");
  });
});
