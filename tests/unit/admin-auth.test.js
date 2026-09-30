// Admin-only functions used to trust a plaintext x-admin-email header
// (2026-09-30 QA pass: anyone who knew the address could email every
// premium subscriber through rhrp-special-report-send, replay an order, or
// run the Stripe reconcile). These tests pin the replacement: a signed
// subscriber token whose email is on ADMIN_EMAILS, and a scheduler-only
// guard for crons whose schedule is switched off.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);
let requireAdmin, scheduledOnly, isSchedulerInvocation, mint;

beforeAll(() => {
  process.env.SUPABASE_SERVICE_KEY = "test-secret-for-admin-auth";
  process.env.ADMIN_EMAILS = "mary@missionmeetstech.com, maryadawson@gmail.com";
  ({ requireAdmin } = cjsRequire("../../netlify/functions/lib/admin-auth.js"));
  ({ scheduledOnly, isSchedulerInvocation } = cjsRequire("../../netlify/functions/lib/scheduled-only.js"));
  ({ mint } = cjsRequire("../../scripts/lib/mint-subscriber-token.js"));
});
afterAll(() => { delete process.env.SUPABASE_SERVICE_KEY; delete process.env.ADMIN_EMAILS; });

const ev = (headers = {}, extra = {}) => ({ httpMethod: "POST", headers, body: "{}", ...extra });

describe("requireAdmin", () => {
  it("rejects the old header-only call with 401", () => {
    const r = requireAdmin(ev({ "x-admin-email": "mary@missionmeetstech.com" }));
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it("accepts a signed token for an admin email, as Bearer or x-subscriber-token", () => {
    const token = mint("Mary@MissionMeetsTech.com");
    expect(requireAdmin(ev({ authorization: `Bearer ${token}` }))).toEqual({ ok: true, email: "mary@missionmeetstech.com" });
    expect(requireAdmin(ev({ "X-Subscriber-Token": token }))).toEqual({ ok: true, email: "mary@missionmeetstech.com" });
  });

  it("refuses a valid token for a non-admin with 403", () => {
    const r = requireAdmin(ev({ authorization: `Bearer ${mint("someone@example.com")}` }));
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a token signed with another secret, and an expired one", () => {
    const forged = mint("mary@missionmeetstech.com", { secret: "not-the-secret" });
    expect(requireAdmin(ev({ authorization: `Bearer ${forged}` }))).toMatchObject({ ok: false, status: 401, reason: "admin token bad_signature" });
    const expired = mint("mary@missionmeetstech.com", { days: -1 });
    expect(requireAdmin(ev({ authorization: `Bearer ${expired}` }))).toMatchObject({ ok: false, status: 401, reason: "admin token expired" });
  });

  it("refuses when x-admin-email claims a different person than the token", () => {
    const r = requireAdmin(ev({ authorization: `Bearer ${mint("mary@missionmeetstech.com")}`, "x-admin-email": "maryadawson@gmail.com" }));
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe("scheduledOnly", () => {
  const inner = async () => ({ statusCode: 200, body: "ran" });
  const guarded = (event) => scheduledOnly("test-fn", inner)(event);

  it("recognises a Netlify scheduler invocation by its next_run body", () => {
    expect(isSchedulerInvocation({ httpMethod: "POST", body: JSON.stringify({ next_run: "2026-10-01T00:00:00Z" }) })).toBe(true);
    expect(isSchedulerInvocation({ httpMethod: "GET", body: "" })).toBe(false);
    expect(isSchedulerInvocation({ httpMethod: "POST", body: "{\"dry_run\":true}" })).toBe(false);
  });

  it("runs for the scheduler and for an admin token, answers 404 to everyone else", async () => {
    expect((await guarded({ httpMethod: "POST", headers: {}, body: JSON.stringify({ next_run: "x" }) })).statusCode).toBe(200);
    expect((await guarded(ev({ authorization: `Bearer ${mint("mary@missionmeetstech.com")}` }))).statusCode).toBe(200);
    expect((await guarded({ httpMethod: "GET", headers: {}, body: "" })).statusCode).toBe(404);
    expect((await guarded(ev({ "x-admin-email": "mary@missionmeetstech.com" }))).statusCode).toBe(404);
  });
});
