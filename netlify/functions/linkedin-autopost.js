// ============================================================================
// linkedin-autopost.js — daily cron that publishes the LinkedIn campaigns in
// data/linkedin-campaign/posts.json (FY-End 2026, Ask MMT 2026) to Mary's
// personal profile via PostPeer, hands-off.
//
// Runs 13:30 UTC daily (= 09:30 America/New_York during the EDT campaign window
// Jun 30 – Sep 30 2026). For "today" it publishes the one approved TEXT post
// whose publish_date == today, exactly once.
//
// SAFETY (ported from the linkedin-publisher SAFETY.md — do not weaken):
//   - KILL SWITCH: LINKEDIN_AUTOPOST_ENABLED must be exactly "true", else no-op.
//   - TEXT ONLY: carousel/document/poll/image/video posts need a human-built
//     asset — the cron SKIPS them and alerts Mary to post manually that day.
//   - IDEMPOTENT: the `linkedin_autopost_sent` marker is CLAIMED before
//     PostPeer is called (lib/cron-claim.js); a post_id with a marker is never
//     posted again, and of two overlapping invocations only the earliest
//     claim publishes (the cron double-fired daily 08-20 to 09-10).
//   - VERIFIED: a PostPeer 2xx is acceptance, not publication. The handler
//     reads LinkedIn's verdict from GET /posts/{id} and records published,
//     accepted (pending) or failed honestly; a rejection emails Mary the
//     reason instead of "went live".
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
const { claimOnce, finalizeClaim } = require("./lib/cron-claim");

const TZ = "America/New_York";
const BASE_URL = process.env.POSTPEER_BASE_URL || "https://api.postpeer.dev/v1";
const SENT_EVENT = "linkedin_autopost_sent";
const RACE_EVENT = "linkedin_autopost_lost_claim_race";
const FAIL_EVENT = "linkedin_autopost_failed";
const SKIP_EVENT = "linkedin_autopost_skipped_asset";
const UNAPPROVED_EVENT = "linkedin_autopost_skipped_unapproved";
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

async function hasEvent(supabase, eventType, postId) {
  const { data } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", eventType)
    .filter("details->>post_id", "eq", postId)
    .limit(1)
    .maybeSingle();
  return !!data;
}
const alreadySent = (supabase, postId) => hasEvent(supabase, SENT_EVENT, postId);

// Which campaign a post belongs to, for the alert emails. Posts added after
// 2026-09-10 carry their own `campaign`; the original FY-End posts inherit
// the file-level name.
function campaignLabel(post, campaign) {
  const key = (post && post.campaign) || (campaign && campaign.campaign) || "campaign";
  const meta = campaign && campaign.campaigns && campaign.campaigns[key];
  return (meta && meta.label) || key;
}

// The autopilot is publish-only and never posts comments, so the "link in
// the first comment" convention is a human step. Every alert carries it.
function firstCommentHtml(post) {
  if (!post || !post.first_comment) return "";
  return `<p style="margin-top:14px;"><b>Paste this as the first comment now</b> (the link stays out of the body on purpose):</p><pre style="white-space:pre-wrap;font-family:inherit;background:#F3F4F6;padding:12px;border-radius:6px;">${String(post.first_comment).replace(/</g, "&lt;")}</pre>`;
}

/**
 * Pick today's post. One publish per day, ever: the first APPROVED post due
 * today. If nothing approved is due but an unapproved one is, return it
 * flagged so the handler can alert Mary instead of silently skipping a
 * campaign day (the placeholder-bearing Ask MMT posts ship approved=false).
 */
function selectDue(posts, today) {
  const dueToday = (posts || []).filter((p) => p.publish_date === today);
  const approved = dueToday.find((p) => p.approved === true);
  if (approved) return { post: approved, unapproved: false };
  const pending = dueToday.find((p) => p.approved !== true);
  return pending ? { post: pending, unapproved: true } : { post: null, unapproved: false };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s == null ? "" : s).replace(/</g, "&lt;");

// Publish via PostPeer. One retry on network/5xx. Verified against postpeer.dev
// docs 2026-07-01: POST /posts, x-access-key auth, content/platforms/publishNow.
// A 2xx here means PostPeer ACCEPTED the post. LinkedIn's verdict arrives
// later on GET /posts/{id} (verifyPostPeer below). Measured 2026-09-14: the
// call takes ~40s to return, and on every double-fired day since 08-20 the
// second copy returned 2xx here and was then rejected by LinkedIn as a
// duplicate (422 DUPLICATE_POST). Acceptance is never logged as "published".
async function publishToPostPeer({ apiKey, accountId, content, fetchImpl = fetch, sleepImpl = sleep }) {
  const body = JSON.stringify({
    content,
    platforms: [{ platform: "linkedin", accountId }],
    publishNow: true,
  });
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchImpl(`${BASE_URL}/posts`, {
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
        const post = json.post || json;
        const lk = Array.isArray(post.platforms) ? post.platforms.find((p) => p.platform === "linkedin") : null;
        return { postId: String(post.postId || post.id || json.postId || json.id || ""), url: (lk && lk.platformPostUrl) || null, raw: json };
      }
    } catch (e) {
      lastErr = e;
      if (attempt === 2 || /PostPeer 4\d\d/.test(e.message)) throw e;
    }
    await sleepImpl(1500 * attempt);
  }
  throw lastErr || new Error("PostPeer publish failed");
}

// LinkedIn's verdict on an accepted post. GET /posts/{id} answers
// { post: { status, platforms: [{ platform, status, platformPostUrl, errorMessage }] } }.
// Returns "published" (with the post URL), "failed" (with LinkedIn's message),
// or "pending" when PostPeer has not heard back inside the bounded poll.
async function verifyPostPeer({ apiKey, postId, fetchImpl = fetch, sleepImpl = sleep, attempts = 4, waitMs = 2000 }) {
  let last = { status: "pending", url: null, error: null };
  if (!postId) return { ...last, error: "PostPeer returned no post id" };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleepImpl(waitMs);
    try {
      const res = await fetchImpl(`${BASE_URL}/posts/${encodeURIComponent(postId)}`, { headers: { "x-access-key": apiKey } });
      if (!res.ok) { last = { ...last, error: `PostPeer status ${res.status}` }; continue; }
      const json = await res.json().catch(() => ({}));
      const post = json.post || json;
      const lk = Array.isArray(post.platforms) ? post.platforms.find((p) => p.platform === "linkedin") || post.platforms[0] : null;
      const status = String((lk && lk.status) || post.status || "").toLowerCase();
      last = {
        status: status === "published" || status === "failed" ? status : "pending",
        url: (lk && lk.platformPostUrl) || null,
        error: (lk && lk.errorMessage) || null,
      };
      if (last.status !== "pending") return last;
    } catch (e) {
      last = { ...last, error: e.message };
    }
  }
  return last;
}

// CLAIM the post's marker BEFORE calling PostPeer (lib/cron-claim.js). This
// cron fired twice, ~38s apart, every day from 2026-08-20 to 2026-09-10, and
// PostPeer takes ~40s to answer a publish, so the old "check, publish, then
// log" order let both invocations pass the check and both publish. LinkedIn
// rejected the second copy as a duplicate each time (422 DUPLICATE_POST),
// which is the only reason the feed stayed clean.
function claimPost(supabase, post, today, label) {
  return claimOnce(supabase, {
    eventType: SENT_EVENT, sourceFunction: "linkedin-autopost", userEmail: MARY,
    keyField: "post_id", key: post.id, loserEventType: RACE_EVENT,
    details: { date: today, campaign: label },
  });
}

/**
 * Build the cron handler. Every side effect is injectable so the double-fire
 * race, the LinkedIn rejection path and the pending path are unit-tested
 * against a scripted Supabase and PostPeer (tests/unit/linkedin-autopost-handler.test.js).
 */
function makeHandler(deps = {}) {
  const createClientImpl = deps.createClient || createClient;
  const sendEmailImpl = deps.sendEmail || sendEmail;
  const fetchImpl = deps.fetch || ((...args) => fetch(...args));
  const sleepImpl = deps.sleep || sleep;
  const todayImpl = deps.today || todayInTz;
  const loadCampaignImpl = deps.loadCampaign || loadCampaign;
  const env = deps.env || process.env;

  async function logEvent(supabase, event_type, details) {
    const { error } = await supabase.from("ops_events").insert({ event_type, source_function: "linkedin-autopost", user_email: MARY, details });
    if (error) console.warn("logEvent:", error.message);
  }

  async function alertMary(subject, html) {
    try { await sendEmailImpl({ to: MARY, from: FROM, subject, html }); }
    catch (e) { console.warn("alertMary:", e.message); }
  }

  return async () => {
    const today = todayImpl();

    if (String(env.LINKEDIN_AUTOPOST_ENABLED || "").toLowerCase() !== "true") {
      return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch_off", today }) };
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
    }
    const apiKey = env.POSTPEER_API_KEY;
    const accountId = env.POSTPEER_LINKEDIN_ACCOUNT_ID;
    if (!apiKey || !accountId) {
      await alertMary("LinkedIn autopost: credentials missing", `<p>The LinkedIn autopost cron ran for ${today} but POSTPEER_API_KEY or POSTPEER_LINKEDIN_ACCOUNT_ID is not set. No post was made.</p>`);
      return { statusCode: 500, body: JSON.stringify({ error: "postpeer_not_configured", today }) };
    }

    const supabase = createClientImpl(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const campaign = loadCampaignImpl();
    if (!campaign) return { statusCode: 500, body: JSON.stringify({ error: "campaign_missing" }) };

    const picked = selectDue(campaign.posts, today);
    const due = picked.post;
    if (!due) return { statusCode: 200, body: JSON.stringify({ noop: "nothing_due", today }) };
    const label = campaignLabel(due, campaign);

    // Unapproved post on its day: tell Mary once, publish nothing.
    if (picked.unapproved) {
      if (!(await hasEvent(supabase, UNAPPROVED_EVENT, due.id))) {
        await logEvent(supabase, UNAPPROVED_EVENT, { post_id: due.id, format: due.format, date: today, campaign: label });
        await alertMary(
          `LinkedIn post today is NOT approved: ${due.id} (${label})`,
          `<p>Today's ${label} post (<b>${due.id}</b>, ${today}) is still <b>approved: false</b>, so the autopilot did not publish it.</p>` +
          (due.approval_note ? `<p><b>What it needs:</b> ${esc(due.approval_note)}</p>` : "") +
          `<p>Either fill it in and post it by hand today, or set <code>approved: true</code> in data/linkedin-campaign/posts.json for a future date. Body as drafted:</p><pre style="white-space:pre-wrap;font-family:inherit;background:#F3F4F6;padding:12px;border-radius:6px;">${esc(due.body)}</pre>` +
          firstCommentHtml(due)
        );
      }
      return { statusCode: 200, body: JSON.stringify({ skipped: "unapproved", id: due.id, today }) };
    }

    // Text-only guard: asset posts need a human. Alert once, don't publish.
    if (due.format !== "text") {
      if (!(await hasEvent(supabase, SKIP_EVENT, due.id))) {
        await logEvent(supabase, SKIP_EVENT, { post_id: due.id, format: due.format, date: today });
        await alertMary(
          `LinkedIn post today needs YOU: ${due.format} (${due.id}, ${label})`,
          `<p>Today's ${label} post (<b>${due.id}</b>, ${today}) is a <b>${due.format}</b> that needs a human-built asset, so the autopilot skipped it.</p>` +
          (due.asset_notes ? `<p><b>Asset:</b> ${esc(due.asset_notes)}</p>` : "") +
          `<p>Post it manually if you want it to run. Body:</p><pre style="white-space:pre-wrap;font-family:inherit;background:#F3F4F6;padding:12px;border-radius:6px;">${esc(due.body)}</pre>` +
          firstCommentHtml(due)
        );
      }
      return { statusCode: 200, body: JSON.stringify({ skipped: "needs_human_asset", id: due.id, format: due.format, today }) };
    }

    // Idempotency: a cheap pre-check (redeploys, manual reruns), then the claim
    // that actually closes the double-fire window.
    if (await alreadySent(supabase, due.id)) {
      return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", id: due.id, today }) };
    }
    const claim = await claimPost(supabase, due, today, label);
    if (!claim.ok) {
      return { statusCode: 200, body: JSON.stringify({ skipped: claim.reason, id: due.id, today, ...(claim.winner ? { winner: claim.winner } : {}), ...(claim.error ? { error: claim.error } : {}) }) };
    }

    // Publish (PostPeer acceptance), then read LinkedIn's verdict.
    let accepted;
    try {
      accepted = await publishToPostPeer({ apiKey, accountId, content: contentFor(due), fetchImpl, sleepImpl });
    } catch (e) {
      await finalizeClaim(supabase, claim.claimId, {
        event_type: FAIL_EVENT, severity: "error",
        details: { post_id: due.id, date: today, campaign: label, status: "failed", stage: "postpeer", error: e.message },
      });
      await alertMary(
        `LinkedIn post FAILED: ${due.id}`,
        `<p>The autopilot could not publish today's post (<b>${due.id}</b>, ${today}).</p><p style="color:#C62828;">${esc(e.message)}</p><p>Nothing was posted. It will NOT retry automatically today. Post manually or fix the PostPeer connection.</p>`
      );
      return { statusCode: 500, body: JSON.stringify({ error: "publish_failed", id: due.id, stage: "postpeer", detail: e.message, today }) };
    }

    const verdict = await verifyPostPeer({ apiKey, postId: accepted.postId, fetchImpl, sleepImpl });
    if (verdict.status === "failed") {
      await finalizeClaim(supabase, claim.claimId, {
        event_type: FAIL_EVENT, severity: "error",
        details: { post_id: due.id, date: today, campaign: label, status: "failed", stage: "linkedin", postpeer_id: accepted.postId, error: verdict.error },
      });
      await alertMary(
        `LinkedIn post FAILED: ${due.id}`,
        `<p>PostPeer accepted today's post (<b>${due.id}</b>, ${today}) but LinkedIn rejected it.</p><p style="color:#C62828;">${esc(verdict.error || "PostPeer reported the LinkedIn publish as failed without a message")}</p><p>Nothing from the autopilot is on your feed. It will NOT retry automatically today. Post manually or check the PostPeer dashboard.</p>`
      );
      return { statusCode: 500, body: JSON.stringify({ error: "publish_failed", id: due.id, stage: "linkedin", detail: verdict.error, today }) };
    }

    const live = verdict.status === "published";
    const url = verdict.url || accepted.url || null;
    await finalizeClaim(supabase, claim.claimId, {
      details: { post_id: due.id, date: today, campaign: label, status: live ? "published" : "accepted", postpeer_id: accepted.postId, url },
    });
    await alertMary(
      live ? `LinkedIn post published: ${due.id} (${label})` : `LinkedIn post accepted, awaiting LinkedIn: ${due.id} (${label})`,
      (live
        ? `<p>Today's ${label} post went live on your LinkedIn.</p>`
        : `<p>PostPeer accepted today's ${label} post, but LinkedIn had not confirmed it inside the check window. Look at your feed in a few minutes; if it is not there, check the PostPeer dashboard.</p>`) +
      `<p><b>${due.id}</b> · ${today}${url ? ` · <a href="${url}">view post</a>` : ""}</p>` +
      firstCommentHtml(due) +
      `<p style="color:#5C6B7A;font-size:13px;">Reply to comments in the first ~90 minutes for reach.</p>`
    );
    return { statusCode: 200, body: JSON.stringify({ published: due.id, platform_status: verdict.status, url, today }) };
  };
}

exports.handler = makeHandler();
exports.makeHandler = makeHandler;

// Exported for tests (pure selection + labels; no I/O).
exports.selectDue = selectDue;
exports.campaignLabel = campaignLabel;
exports.contentFor = contentFor;
exports.verifyPostPeer = verifyPostPeer;
