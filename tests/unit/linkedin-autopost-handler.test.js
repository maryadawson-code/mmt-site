// linkedin-autopost.js handler — the parts that have to be true when the cron
// double-fires and when PostPeer accepts a post LinkedIn then rejects.
// Measured 2026-09-14: the cron fired twice a day ~38s apart from 08-20 to
// 09-10, PostPeer takes ~40s to answer a publish, and every second copy was
// rejected by LinkedIn as a duplicate while our log said "sent".

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { fakeSupabase, rowsOf } from "./helpers/fake-supabase.js";

const require = createRequire(import.meta.url);
const { makeHandler, verifyPostPeer } = require("../../netlify/functions/linkedin-autopost.js");

const ENV = { LINKEDIN_AUTOPOST_ENABLED: "true", SUPABASE_URL: "http://x", SUPABASE_SERVICE_KEY: "k", POSTPEER_API_KEY: "pp", POSTPEER_LINKEDIN_ACCOUNT_ID: "acct" };
const CAMPAIGN = {
  campaign: "fy-end", campaigns: { "fy-end": { label: "FY-End 2026" } },
  posts: [
    { id: "t-029", publish_date: "2026-09-16", format: "text", approved: true, body: "Post body.", link_in_body: true, first_comment: "https://missionmeetstech.com/ask" },
    { id: "t-028", publish_date: "2026-09-15", format: "video", approved: true, body: "Video day." },
  ],
};
const LI_URL = "https://www.linkedin.com/feed/update/urn:li:share:1/";

// PostPeer double: POST /posts accepts (after a short delay, like the real
// ~40s), GET /posts/{id} answers with the scripted platform verdict.
function fakePostPeer({ verdict = "published", error = null, verdictAfter = 1 } = {}) {
  const calls = { posts: 0, gets: 0 };
  const fetchImpl = async (url, init = {}) => {
    if (/\/posts$/.test(url) && init.method === "POST") {
      calls.posts += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, postId: `pp-${calls.posts}` }) };
    }
    calls.gets += 1;
    const settled = calls.gets >= verdictAfter;
    const status = settled ? verdict : "scheduled";
    return { ok: true, status: 200, json: async () => ({ success: true, post: { status, platforms: [{ platform: "linkedin", status, platformPostUrl: settled && verdict === "published" ? LI_URL : null, errorMessage: settled ? error : null }] } }) };
  };
  return { fetchImpl, calls };
}

function setup({ store = [], postpeer = {}, today = "2026-09-16" } = {}) {
  const pp = fakePostPeer(postpeer);
  const emails = [];
  const handler = makeHandler({
    env: ENV, today: () => today, loadCampaign: () => CAMPAIGN,
    createClient: () => fakeSupabase(store),
    sendEmail: async (m) => { emails.push(m); return { success: true }; },
    fetch: pp.fetchImpl, sleep: async () => {},
  });
  const run = () => handler().then((r) => JSON.parse(r.body));
  return { run, store, emails, calls: pp.calls };
}

describe("linkedin-autopost: double-fire", () => {
  it("two overlapping invocations publish exactly once; the loser's row is relabeled, not a second 'sent'", async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.run(), t.run()]);
    expect(t.calls.posts).toBe(1);
    const outcomes = [a, b].map((r) => r.published || r.skipped).sort();
    expect(outcomes).toEqual(["lost_claim_race", "t-029"]);
    expect(rowsOf(t.store, "ops_events", "linkedin_autopost_sent")).toHaveLength(1);
    expect(rowsOf(t.store, "ops_events", "linkedin_autopost_lost_claim_race")).toHaveLength(1);
    expect(t.emails.filter((m) => /published/.test(m.subject))).toHaveLength(1);
  });

  it("the marker is claimed BEFORE PostPeer is called", async () => {
    const t = setup();
    let markerAtPublish = null;
    const pp = fakePostPeer();
    const handler = makeHandler({
      env: ENV, today: () => "2026-09-16", loadCampaign: () => CAMPAIGN,
      createClient: () => fakeSupabase(t.store),
      sendEmail: async () => ({ success: true }),
      sleep: async () => {},
      fetch: async (url, init) => {
        if (init && init.method === "POST") markerAtPublish = rowsOf(t.store, "ops_events", "linkedin_autopost_sent").map((r) => r.details.status);
        return pp.fetchImpl(url, init);
      },
    });
    await handler();
    expect(markerAtPublish).toEqual(["claimed"]);
  });

  it("a post that already has a marker is never posted again", async () => {
    const store = [{ __table: "ops_events", id: "old", event_type: "linkedin_autopost_sent", created_at: "2026-09-16T13:30:00Z", details: { post_id: "t-029", status: "published" } }];
    const t = setup({ store });
    expect(await t.run()).toMatchObject({ skipped: "already_sent", id: "t-029" });
    expect(t.calls.posts).toBe(0);
  });
});

describe("linkedin-autopost: LinkedIn's verdict", () => {
  it("a published post records the LinkedIn URL and the email links it", async () => {
    const t = setup({ postpeer: { verdict: "published", verdictAfter: 2 } });
    const out = await t.run();
    expect(out).toMatchObject({ published: "t-029", platform_status: "published", url: LI_URL });
    const row = rowsOf(t.store, "ops_events", "linkedin_autopost_sent")[0];
    expect(row.details).toMatchObject({ post_id: "t-029", status: "published", postpeer_id: "pp-1", url: LI_URL, campaign: "FY-End 2026" });
    expect(t.emails[0].subject).toMatch(/^LinkedIn post published: t-029/);
    expect(t.emails[0].html).toContain(LI_URL);
    expect(t.emails[0].html).toContain("Paste this as the first comment");
  });

  it("a post LinkedIn rejects is recorded as FAILED with LinkedIn's reason, and Mary is not told it went live", async () => {
    const reason = "LinkedIn post creation failed: HTTP 422 — Content is a duplicate of urn:li:share:7503082649293471744";
    const t = setup({ postpeer: { verdict: "failed", error: reason } });
    const out = await t.run();
    expect(out).toMatchObject({ error: "publish_failed", stage: "linkedin", detail: reason });
    expect(rowsOf(t.store, "ops_events", "linkedin_autopost_sent")).toHaveLength(0);
    const fail = rowsOf(t.store, "ops_events", "linkedin_autopost_failed")[0];
    expect(fail.details).toMatchObject({ post_id: "t-029", status: "failed", stage: "linkedin", postpeer_id: "pp-1", error: reason });
    expect(fail.severity).toBe("error");
    expect(t.emails[0].subject).toBe("LinkedIn post FAILED: t-029");
    expect(t.emails[0].html).toContain("duplicate");
    expect(t.emails[0].html).not.toContain("went live");
  });

  it("no verdict inside the poll window is reported as accepted, never as live", async () => {
    const t = setup({ postpeer: { verdict: "published", verdictAfter: 99 } });
    const out = await t.run();
    expect(out).toMatchObject({ published: "t-029", platform_status: "pending", url: null });
    expect(rowsOf(t.store, "ops_events", "linkedin_autopost_sent")[0].details.status).toBe("accepted");
    expect(t.emails[0].subject).toMatch(/accepted, awaiting LinkedIn/);
    expect(t.emails[0].html).not.toContain("went live");
  });

  it("a PostPeer rejection at accept time converts the claim into the failure record", async () => {
    const t = setup();
    const store = [];
    const handler = makeHandler({
      env: ENV, today: () => "2026-09-16", loadCampaign: () => CAMPAIGN,
      createClient: () => fakeSupabase(store), sendEmail: async () => ({ success: true }), sleep: async () => {},
      fetch: async () => ({ ok: false, status: 401, text: async () => "bad key" }),
    });
    const out = JSON.parse((await handler()).body);
    expect(out).toMatchObject({ error: "publish_failed", stage: "postpeer" });
    expect(rowsOf(store, "ops_events", "linkedin_autopost_sent")).toHaveLength(0);
    expect(rowsOf(store, "ops_events", "linkedin_autopost_failed")[0].details.error).toMatch(/PostPeer 401/);
    expect(t.calls.posts).toBe(0);
  });

  it("an asset post still alerts and never publishes", async () => {
    const t = setup({ today: "2026-09-15" });
    expect(await t.run()).toMatchObject({ skipped: "needs_human_asset", id: "t-028", format: "video" });
    expect(t.calls.posts).toBe(0);
    expect(t.emails[0].subject).toMatch(/needs YOU: video/);
  });
});

describe("verifyPostPeer", () => {
  const get = (bodies) => { let i = 0; return async () => { const b = bodies[Math.min(i, bodies.length - 1)]; i += 1; return b; }; };
  const body = (status, extra = {}) => ({ ok: true, status: 200, json: async () => ({ post: { status, platforms: [{ platform: "linkedin", status, ...extra }] } }) });

  it("keeps polling until PostPeer reports published, then returns the URL", async () => {
    const out = await verifyPostPeer({ apiKey: "k", postId: "p", sleepImpl: async () => {}, fetchImpl: get([body("scheduled"), body("scheduled"), body("published", { platformPostUrl: LI_URL })]) });
    expect(out).toEqual({ status: "published", url: LI_URL, error: null });
  });
  it("returns failed with LinkedIn's message", async () => {
    const out = await verifyPostPeer({ apiKey: "k", postId: "p", sleepImpl: async () => {}, fetchImpl: get([body("failed", { errorMessage: "DUPLICATE_POST" })]) });
    expect(out).toEqual({ status: "failed", url: null, error: "DUPLICATE_POST" });
  });
  it("is pending after the bounded poll, and pending with the reason when PostPeer cannot be read", async () => {
    expect((await verifyPostPeer({ apiKey: "k", postId: "p", attempts: 2, sleepImpl: async () => {}, fetchImpl: get([body("scheduled")]) })).status).toBe("pending");
    const out = await verifyPostPeer({ apiKey: "k", postId: "p", attempts: 1, sleepImpl: async () => {}, fetchImpl: async () => ({ ok: false, status: 503 }) });
    expect(out).toMatchObject({ status: "pending", error: "PostPeer status 503" });
    expect((await verifyPostPeer({ apiKey: "k", postId: "", fetchImpl: async () => { throw new Error("must not be called"); } })).status).toBe("pending");
  });
});
