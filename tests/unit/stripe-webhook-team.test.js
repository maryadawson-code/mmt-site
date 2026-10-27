// The webhook's foreign-event filter must let team-plan traffic through:
// the subscription (by metadata or by the seat price lookup key) and its
// invoices (invoice.paid is what turns seats on), while still dropping
// MissionPulse traffic from the shared Stripe account.
import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
let isMmtEvent;

beforeAll(() => {
  process.env.STRIPE_PRICE_FOUNDING_YEARLY = process.env.STRIPE_PRICE_FOUNDING_YEARLY || "price_test_founding_yearly";
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_placeholder";
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "placeholder";
  ({ _isMmtEvent: isMmtEvent } = cjsRequire("../../netlify/functions/stripe-webhook.js"));
});

const ev = (object) => ({ id: "evt_1", type: "x", data: { object } });

describe("stripe-webhook isMmtEvent: team plan", () => {
  it("accepts a team subscription by metadata.product", () => {
    expect(isMmtEvent(ev({ object: "subscription", metadata: { product: "mmt_team" }, items: { data: [] } }))).toEqual({ mmt: true, reason: "metadata_product_mmt_team" });
  });
  it("accepts a team subscription Mary builds in the dashboard with no metadata, by the seat price lookup key", () => {
    expect(isMmtEvent(ev({ object: "subscription", metadata: {}, items: { data: [{ price: { id: "price_x", lookup_key: "mmt_team_seat_year" } }] } }))).toEqual({ mmt: true, reason: "team_seat_price" });
  });
  it("accepts the team's invoice through the subscription metadata it carries, in both API shapes", () => {
    expect(isMmtEvent(ev({ object: "invoice", metadata: {}, parent: { subscription_details: { subscription: "sub_t", metadata: { app: "mmt", product: "mmt_team" } } } }))).toEqual({ mmt: true, reason: "invoice_subscription_metadata" });
    expect(isMmtEvent(ev({ object: "invoice", metadata: {}, subscription: "sub_t", subscription_details: { metadata: { product: "mmt_premium" } } }))).toEqual({ mmt: true, reason: "invoice_subscription_metadata" });
  });
  it("still drops a MissionPulse invoice and an invoice with no MMT signal", () => {
    expect(isMmtEvent(ev({ object: "invoice", metadata: {}, parent: { subscription_details: { metadata: { app: "missionpulse" } } } })).mmt).toBe(false);
    expect(isMmtEvent(ev({ object: "invoice", metadata: {}, lines: { data: [] } })).mmt).toBe(false);
  });
});
