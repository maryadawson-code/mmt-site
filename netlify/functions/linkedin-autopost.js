// ============================================================================
// linkedin-autopost.js — daily cron that publishes the FY-End LinkedIn campaign
// to Mary's personal profile via PostPeer, hands-off.
//
// Runs 13:30 UTC daily (= 09:30 America/New_York during the EDT campaign window
// Jun 30 – Sep 30 2026). For "today" it publishes the one approved TEXT post
// whose publish_date == today, exactly once.
//
// SAFETY (ported from the linkedin-publisher SAFETY.md — do not weaken):
//   - KILL SWITCH: LINKEDIN_AUTOPOST_ENABLED must be exactly "true", else no-op.
//   - TEXT ONLY: carousel/document/poll/image/video posts need a human-built
//     asset — the cron SKIPS them and alerts Mary to post manually that day.
//   - IDEMPOTENT: a post_id with a recorded `linkedin_autopost_sent` event is
//     never posted again (survives cron double-fire + redeploys).
//   - ONE/DAY: only today's single post is ever eligible.
//   - FAIL SAFE: one retry with backoff, then abort + alert. Never retry-spam.
//   - PUBLISH ONLY: no connect/like/comment/follow/DM/scrape. Not built, ever.
//
// Credentials (Netlify env): POSTPEER_API_KEY, POSTPEER_LINKEDIN_ACCOUNT_ID.
// Optional: POSTPEER_BASE_URL (default https://api.postpeer.dev/v1).
// ============================================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

const TZ = "America/New_York";
const BASE_URL = process.env.POSTPEER_BASE_URL || "https://api.postpeer.dev/v1";
const SENT_EVENT = "linkedin_autopost_sent";
const FAIL_EVENT = "linkedin_autopost_failed";
const SKIP_EVENT = "linkedin_autopost_skipped_asset";
const MARY = "mary@missionmeetstech.com";
const FROM = "MMT LinkedIn <mary@missionmeetstech.com>";

const CAMPAIGN_PATHS = [
  path.join(__dirname, "..", "..", "data", "linkedin-campaign", "posts.json"),
  path.join(__dirname, "data", "linkedin-campaign", "posts.json"),
];

function todayInTz() {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function loadCampaign() {
  for (const p of CAMPAIGN_PATHS) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { console.warn("loadCampaign:", p, e.message); }
  }
  return null;
}

// Campaign default: the canonical UTM link is already inside the body
// (link_in_body=true), so post the body verbatim. Otherwise append the link.
function contentFor(post) {
  if (post.link_in_body || !post.link_target) return post.body;
  return `${post.body}\n\n${post.link_target}`;
}

async function alreadySent(supabase, postId) {
  const { data } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", SENT_EVENT)
    .filter("details->>post_id", "eq", postId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Publish via PostPeer. One retry on network/5xx. Verified against postpeer.dev
// docs 2026-07-01: POST /posts, x-access-key auth, content/platforms/publishNow.
async function publishToPostPeer({ apiKey, accountId, content }) {
  const body = JSON.stringify({
    content,
    platforms: [{ platform: "linkedin", accountId }],
    publishNow: true,
  });
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/posts`, {
        method: "POST",
        headers: { "x-access-key": apiKey, "Content-Type": "application/json" },
        body,
      });
      const text = await res.text();
      let json = {};
      try { json = JSON.parse(text); } catch { /* keep raw */ }
      if (!res.ok) {
        // 4xx = our request is wrong; do not retry. 5xx = retry once.
        if (res.status < 500 || attempt === 2) throw new Error(`PostPeer ${res.status}: ${text.slice(0, 300)}`);
        lastErr = new Error(`PostPeer ${res.status}`);
      } else {
        const lk = Array.isArray(json.platforms) ? json.platforms.find((p) => p.platform === "linkedin") : null;
        return { postId: String(json.postId || json.id || ""), url: (lk && lk.platformPostUrl) || null, raw: json };
      }
    } catch (e) {
      lastErr = e;
      if (attempt === 2 || /PostPeer 4\d\d/.test(e.message)) throw e;
    }
    await sleep(1500 * attempt);
  }
  throw lastErr || new Error("PostPeer publish failed");
}

async function logEvent(supabase, event_type, details) {
  try { await supabase.from("ops_events").insert({ event_type, source_function: "linkedin-autopost", user_email: MARY, details }); }
  catch (e) { console.warn("logEvent:", e.message); }
}

async function alertMary(subject, html) {
  try { await sendEmail({ to: MARY, from: FROM, subject, html }); }
  catch (e) { console.warn("alertMary:", e.message); }
}

exports.handler = async () => {
  const today = todayInTz();

  if (String(process.env.LINKEDIN_AUTOPOST_ENABLED || "").toLowerCase() !== "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch_off", today }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const apiKey = process.env.POSTPEER_API_KEY;
  const accountId = process.env.POSTPEER_LINKEDIN_ACCOUNT_ID;
  if (!apiKey || !accountId) {
    await alertMary("LinkedIn autopost: credentials missing", `<p>The LinkedIn autopost cron ran for ${today} but POSTPEER_API_KEY or POSTPEER_LINKEDIN_ACCOUNT_ID is not set. No post was made.</p>`);
    return { statusCode: 500, body: JSON.stringify({ error: "postpeer_not_configured", today }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const campaign = loadCampaign();
  if (!campaign) return { statusCode: 500, body: JSON.stringify({ error: "campaign_missing" }) };

  const due = (campaign.posts || []).find((p) => p.publish_date === today && p.approved === true);
  if (!due) return { statusCode: 200, body: JSON.stringify({ noop: "nothing_due", today }) };

  // Text-only guard: asset posts need a human. Alert once, don't publish.
  if (due.format !== "text") {
    if (!(await alreadySent(supabase, due.id))) {
      await logEvent(supabase, SKIP_EVENT, { post_id: due.id, format: due.format, date: today });
      await alertMary(
        `LinkedIn post today needs YOU: ${due.format} (${due.id})`,
        `<p>Today's campaign post (<b>${due.id}</b>, ${today}) is a <b>${due.format}</b> that needs a human-built asset, so the autopilot skipped it.</p><p>Post it manually if you want it to run. Body:</p><pre style="white-space:pre-wrap;font-family:inherit;background:#F3F4F6;padding:12px;border-radius:6px;">${(due.body || "").replace(/</g, "&lt;")}</pre>`
      );
    }
    return { statusCode: 200, body: JSON.stringify({ skipped: "needs_human_asset", id: due.id, format: due.format, today }) };
  }

  // Idempotency.
  if (await alreadySent(supabase, due.id)) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", id: due.id, today }) };
  }

  // Publish.
  try {
    const result = await publishToPostPeer({ apiKey, accountId, content: contentFor(due) });
    await logEvent(supabase, SENT_EVENT, { post_id: due.id, date: today, postpeer_id: result.postId, url: result.url });
    await alertMary(
      `LinkedIn post published: ${due.id}`,
      `<p>Today's FY-End campaign post went live on your LinkedIn.</p><p><b>${due.id}</b> · ${today}${result.url ? ` · <a href="${result.url}">view post</a>` : ""}</p><p style="color:#5C6B7A;font-size:13px;">Reply to comments in the first ~90 minutes for reach.</p>`
    );
    return { statusCode: 200, body: JSON.stringify({ published: due.id, url: result.url, today }) };
  } catch (e) {
    await logEvent(supabase, FAIL_EVENT, { post_id: due.id, date: today, error: e.message });
    await alertMary(
      `LinkedIn post FAILED: ${due.id}`,
      `<p>The autopilot could not publish today's post (<b>${due.id}</b>, ${today}).</p><p style="color:#C62828;">${(e.message || "").replace(/</g, "&lt;")}</p><p>Nothing was posted. It will NOT retry automatically today. Post manually or fix the PostPeer connection.</p>`
    );
    return { statusCode: 500, body: JSON.stringify({ error: "publish_failed", id: due.id, detail: e.message, today }) };
  }
};
