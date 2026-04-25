import { describe, it, expect, beforeAll, vi } from "vitest";
import crypto from "node:crypto";

let webhookMod;
let handler;

beforeAll(async () => {
  webhookMod = await import("../netlify/functions/resend-webhook.js");
  handler = webhookMod.handler;
});

/* ---------- Mocks ---------- */

// Mock Supabase client that records every from(table).upsert/insert call
// plus the ops_ledger writes via logOpsEvent (which goes through
// supabase.from("ops_ledger").insert + supabase.from("ops_events").insert).
function mockSupabase() {
  const calls = [];
  return {
    _calls: calls,
    from(table) {
      return {
        upsert(payload, opts) {
          calls.push({ op: "upsert", table, payload, opts });
          return Promise.resolve({ error: null });
        },
        insert(row) {
          calls.push({ op: "insert", table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function makeEvent({ eventType, recipient = "kirk@example.com", emailId = "rid-abc" }) {
  return {
    type: eventType,
    created_at: "2026-04-25T00:00:00.000Z",
    data: {
      email_id: emailId,
      to: [recipient],
      from: "MMT Premium <premium@missionmeetstech.com>",
      subject: "Test subject",
      bounce: eventType === "email.bounced" ? { type: "Permanent", message: "smtp_550" } : undefined,
      complaint: eventType === "email.complained" ? { type: "Spam" } : undefined,
    },
  };
}

function svixHeadersFor({ secret, body }) {
  // Replicate the exact signing scheme verifySvixSignature expects.
  const id = "msg_test_id";
  const ts = String(Math.floor(Date.now() / 1000));
  const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(cleanSecret, "base64");
  const sig = crypto.createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": `v1,${sig}`,
  };
}

/* ---------- Tests ---------- */

describe("resend-webhook / handleEvent (unit)", () => {
  it("delivered event → resend_events upsert + resend_delivered ops row", async () => {
    const supabase = mockSupabase();
    const payload = makeEvent({ eventType: "email.delivered" });
    const result = await webhookMod.handleEvent({
      supabase,
      payload,
      headers: { "svix-id": "msg_d1" },
    });
    expect(result.handled).toBe(true);
    expect(result.opsType).toBe("resend_delivered");
    const tables = supabase._calls.map((c) => c.table);
    expect(tables).toContain("resend_events");
    expect(tables).toContain("ops_ledger");
    const opsCall = supabase._calls.find((c) => c.table === "ops_ledger");
    expect(opsCall.row.event_type).toBe("resend_delivered");
    expect(opsCall.row.severity).toBe("info");
    // ops-ledger.js maps user_email → affected_entity (when no scoring_id /
    // order_id / explicit affected_entity is supplied) and also stuffs it
    // into details.user_email. Either is a fine assertion target.
    expect(opsCall.row.affected_entity).toBe("kirk@example.com");
    expect(opsCall.row.details.resend_message_id).toBe("rid-abc");
  });

  it("bounced event → ops_ledger 'resend_bounced' (warn) + bounce_suppression upsert", async () => {
    const supabase = mockSupabase();
    const payload = makeEvent({ eventType: "email.bounced" });
    const result = await webhookMod.handleEvent({
      supabase,
      payload,
      headers: { "svix-id": "msg_b1" },
    });
    expect(result.handled).toBe(true);
    expect(result.opsType).toBe("resend_bounced");
    const tables = supabase._calls.map((c) => c.table);
    expect(tables).toContain("bounce_suppression");
    const opsCall = supabase._calls.find(
      (c) => c.table === "ops_ledger" && c.row.event_type === "resend_bounced"
    );
    expect(opsCall.row.severity).toBe("warn");
  });

  it("complained event → ops_ledger 'resend_complained' with severity warn", async () => {
    const supabase = mockSupabase();
    const payload = makeEvent({ eventType: "email.complained" });
    await webhookMod.handleEvent({ supabase, payload, headers: { "svix-id": "msg_c1" } });
    const opsCall = supabase._calls.find(
      (c) => c.table === "ops_ledger" && c.row.event_type === "resend_complained"
    );
    expect(opsCall).toBeDefined();
    expect(opsCall.row.severity).toBe("warn");
  });

  it("opened event → resend_opened ops row", async () => {
    const supabase = mockSupabase();
    await webhookMod.handleEvent({
      supabase,
      payload: makeEvent({ eventType: "email.opened" }),
      headers: { "svix-id": "msg_o1" },
    });
    const opsCall = supabase._calls.find(
      (c) => c.table === "ops_ledger" && c.row.event_type === "resend_opened"
    );
    expect(opsCall).toBeDefined();
    expect(opsCall.row.severity).toBe("info");
  });

  it("untracked event type → returns handled:false, no DB writes", async () => {
    const supabase = mockSupabase();
    const result = await webhookMod.handleEvent({
      supabase,
      payload: { type: "email.something_new", data: {} },
      headers: {},
    });
    expect(result.handled).toBe(false);
    expect(result.reason).toBe("untracked");
    expect(supabase._calls).toHaveLength(0);
  });

  it("OPS_EVENT_MAP shape", () => {
    expect(webhookMod.OPS_EVENT_MAP).toEqual({
      "email.delivered": "resend_delivered",
      "email.bounced": "resend_bounced",
      "email.complained": "resend_complained",
      "email.opened": "resend_opened",
    });
  });
});

describe("resend-webhook / verifySvixSignature", () => {
  const SECRET = "whsec_" + Buffer.from("test-secret-32-bytes-1234567890ab").toString("base64");

  it("verified=true on a correctly-signed payload", () => {
    const body = JSON.stringify({ type: "email.delivered" });
    const headers = svixHeadersFor({ secret: SECRET, body });
    const result = webhookMod.verifySvixSignature({ headers, body, secret: SECRET });
    expect(result.verified).toBe(true);
  });

  it("verified=null when secret is unset (graceful WARN path, not a 500)", () => {
    const result = webhookMod.verifySvixSignature({
      headers: {},
      body: "{}",
      secret: undefined,
    });
    expect(result.verified).toBeNull();
    expect(result.reason).toBe("no_secret");
  });

  it("verified=false / missing_headers when secret set but svix-* headers absent", () => {
    const result = webhookMod.verifySvixSignature({
      headers: {},
      body: "{}",
      secret: SECRET,
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("missing_headers");
  });

  it("verified=false / signature_mismatch on tampered body", () => {
    const body = JSON.stringify({ type: "email.delivered" });
    const headers = svixHeadersFor({ secret: SECRET, body });
    const result = webhookMod.verifySvixSignature({
      headers,
      body: body + "tampered",
      secret: SECRET,
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });
});

describe("resend-webhook / handler (HTTP)", () => {
  // Capture the test env's SUPABASE_URL so the handler treats env as configured.
  const originalEnv = { ...process.env };
  beforeAll(() => {
    process.env.SUPABASE_URL = "https://dummy.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "dummy";
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it("malformed JSON → 200 (per Resend best practice) with malformed_json body", async () => {
    const event = {
      httpMethod: "POST",
      headers: {},
      body: "{not-json",
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("malformed_json");
  });

  it("non-POST → 405", async () => {
    const res = await handler({ httpMethod: "GET", headers: {}, body: "" });
    expect(res.statusCode).toBe(405);
  });

  it("returns 200 even on unknown event types (so Resend doesn't retry)", async () => {
    const event = {
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ type: "email.something_unknown", data: {} }),
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
  });
});
