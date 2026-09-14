// ask-mmt-campaign-emails.js handler — the run is claimed before any send.
// On 2026-09-14 Netlify fired the 13:15 UTC tick three times; two invocations
// each mailed all 70 Premium members the soft-launch note because the marker
// was written after the loop. These tests pin the day and prove one run wins.

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { fakeSupabase, rowsOf } from "./helpers/fake-supabase.js";

const require = createRequire(import.meta.url);
const { makeHandler } = require("../../netlify/functions/ask-mmt-campaign-emails.js");
const campaign = require("../../netlify/functions/lib/ask-mmt-campaign.js");

const ENV = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_KEY: "k" }; // no BUTTONDOWN_API_KEY: gate answers "ok"
const MEMBERS = ["a@example.com", "b@example.com", "c@example.com"];
const seedMembers = () => MEMBERS.map((email) => ({ __table: "mp_users", email, subscription_tier: "premium", subscription_status: "active" }));

function setup({ store = seedMembers(), now = "2026-09-14T13:15:00Z", onSend } = {}) {
  const sends = [];
  const handler = makeHandler({
    env: ENV, now: () => new Date(now),
    createClient: () => fakeSupabase(store, { clock: () => new Date(now) }),
    sendEmail: async (m) => { if (onSend) onSend(m, store); sends.push(m); return { success: true }; },
  });
  const run = () => handler().then((r) => JSON.parse(r.body));
  return { run, store, sends };
}
const memberSends = (sends) => sends.filter((m) => MEMBERS.includes(m.to));

describe("ask-mmt-campaign-emails: the run is claimed before any send", () => {
  it("emails.json still carries the 2026-09-14 soft launch these tests pin", () => {
    const emails = campaign.loadEmails();
    expect(emails.soft_launch.send_on).toBe("2026-09-14");
    expect(emails.soft_launch.key).toBe("soft-launch-2026-09-14");
  });

  it("two overlapping invocations send the soft launch ONCE; the second run is recorded as a lost race", async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.run(), t.run()]);
    expect(memberSends(t.sends)).toHaveLength(MEMBERS.length);
    expect([a, b].map((r) => r.skipped || r.soft_launch.status).sort()).toEqual(["lost_claim_race", "sent"]);
    expect(rowsOf(t.store, "ops_events", "ASK_MMT_CAMPAIGN_RUN")).toHaveLength(1);
    expect(rowsOf(t.store, "ops_events", "ASK_MMT_CAMPAIGN_RUN")[0].details).toMatchObject({ today: "2026-09-14", status: "done", sends: MEMBERS.length });
    expect(rowsOf(t.store, "ops_events", "ASK_MMT_CAMPAIGN_RUN_LOST_CLAIM_RACE")).toHaveLength(1);
    expect(rowsOf(t.store, "ops_events", campaign.EVENTS.CAMPAIGN_SENT)).toHaveLength(1);
  });

  it("the soft-launch marker exists, as claimed, before the first member email goes out", async () => {
    let markerAtFirstSend = null;
    const t = setup({
      onSend: (m, store) => { if (markerAtFirstSend === null && MEMBERS.includes(m.to)) markerAtFirstSend = rowsOf(store, "ops_events", campaign.EVENTS.CAMPAIGN_SENT).map((r) => r.details.status); },
    });
    await t.run();
    expect(markerAtFirstSend).toEqual(["claimed"]);
    const marker = rowsOf(t.store, "ops_events", campaign.EVENTS.CAMPAIGN_SENT)[0];
    expect(marker.details).toMatchObject({ key: "soft-launch-2026-09-14", status: "sent", sent: MEMBERS.length, failed: 0, recipients: MEMBERS.length });
    expect(t.sends.find((m) => m.to === "mary@missionmeetstech.com").subject).toMatch(/3 sent/);
  });

  it("a later run the same day is skipped, and the next day's run does not re-send the soft launch", async () => {
    const t = setup();
    await t.run();
    expect(await t.run()).toMatchObject({ skipped: "lost_claim_race" });
    const next = setup({ store: t.store, now: "2026-09-15T13:15:00Z" });
    const out = await next.run();
    expect(out.soft_launch).toEqual({ status: "already_sent" });
    expect(memberSends(next.sends)).toHaveLength(0);
    expect(rowsOf(t.store, "ops_events", "ASK_MMT_CAMPAIGN_RUN").map((r) => r.details.today)).toEqual(["2026-09-14", "2026-09-15"]);
  });

  it("the kill switch runs nothing and claims nothing", async () => {
    const store = seedMembers();
    const handler = makeHandler({ env: { ...ENV, ASK_MMT_CAMPAIGN_EMAILS_DISABLED: "true" }, createClient: () => fakeSupabase(store), sendEmail: async () => { throw new Error("no"); } });
    expect(JSON.parse((await handler()).body)).toMatchObject({ skipped: "kill_switch" });
    expect(rowsOf(store, "ops_events")).toHaveLength(0);
  });
});
