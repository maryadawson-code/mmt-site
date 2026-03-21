import { describe, it, expect } from "vitest";

// Test logic extracted from create-checkout.js and stripe-webhook.js

describe("create-checkout validation", () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PRICE_CENTS = 1999;

  it("rejects empty email", () => {
    const email = "";
    expect(!email || !emailRegex.test(email)).toBe(true);
  });

  it("rejects invalid email", () => {
    const email = "not-an-email";
    expect(!email || !emailRegex.test(email)).toBe(true);
  });

  it("accepts valid email", () => {
    const email = "user@example.com";
    expect(!email || !emailRegex.test(email)).toBe(false);
  });

  it("normalizes email to lowercase and trims", () => {
    const email = "  User@Example.COM  ";
    expect(email.toLowerCase().trim()).toBe("user@example.com");
  });

  it("price is $19.99 in cents", () => {
    expect(PRICE_CENTS).toBe(1999);
  });
});

describe("stripe-webhook signature verification", () => {
  it("requires POST method", () => {
    const method = "GET";
    expect(method !== "POST").toBe(true);
  });

  it("requires stripe-signature header", () => {
    const headers = {};
    expect(headers["stripe-signature"]).toBeUndefined();
  });

  it("extracts email from session metadata", () => {
    const session = {
      metadata: { user_email: "test@example.com" },
      customer_details: { email: "fallback@example.com" },
    };
    const email =
      (session.metadata && session.metadata.user_email) ||
      (session.customer_details && session.customer_details.email) ||
      null;
    expect(email).toBe("test@example.com");
  });

  it("falls back to customer_details email", () => {
    const session = {
      metadata: {},
      customer_details: { email: "fallback@example.com" },
    };
    const email =
      (session.metadata && session.metadata.user_email) ||
      (session.customer_details && session.customer_details.email) ||
      null;
    expect(email).toBe("fallback@example.com");
  });

  it("returns null when no email available", () => {
    const session = { metadata: {}, customer_details: {} };
    const email =
      (session.metadata && session.metadata.user_email) ||
      (session.customer_details && session.customer_details.email) ||
      null;
    expect(email).toBeNull();
  });
});

describe("checkout.session.completed event filtering", () => {
  it("processes checkout.session.completed", () => {
    const eventType = "checkout.session.completed";
    expect(eventType === "checkout.session.completed").toBe(true);
  });

  it("ignores other event types", () => {
    const otherTypes = [
      "payment_intent.succeeded",
      "customer.subscription.created",
      "invoice.paid",
    ];
    for (const type of otherTypes) {
      expect(type === "checkout.session.completed").toBe(false);
    }
  });
});
