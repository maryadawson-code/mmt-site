// ============================================================
// jun2-build-trigger.js — Netlify Scheduled Function
//
// Fires the Netlify build hook on June 2, 2026 at 13:00 UTC
// (09:00 ET, EDT). The future-dated newsletter article
// "Industry Leader, Out of Scope" (publish_date 2026-06-02) and any
// release-day content gated by `publish_date <= today` in build.js
// loadArticles() appears on the resulting build.
//
// Schedule: daily at 13:00 UTC (09:00 ET) via netlify.toml.
// One-shot guards inside the function:
//   1. DATE GUARD — fires only when today is 2026-06-02 (UTC).
//   2. IDEMPOTENCY GUARD — checks ops_events for a prior
//      `jun2_build_triggered` event; exits if already fired.
//   3. KILL SWITCH — env var JUN2_BUILD_TRIGGER_DISABLED=true halts.
//
// Without this trigger, the existing rebuild-trigger cron (every
// 4h) picks up the article anyway once UTC date >= 2026-06-02 —
// but its next firing might be at 04:00 UTC (= midnight ET) which
// is 9 hours before the 09:00 ET LinkedIn anchor. This function
// ensures a fresh build at the LinkedIn publish time so /latest,
// /sitemap.xml, RSS, and the Capture Corner archive are all in
// sync within minutes of the public announcement.
//
// Retire pattern: delete this function + the netlify.toml cron block
// within ~14 days of the run date (target: by 2026-06-16).
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const RUN_DATE_UTC = "2026-06-02";

function todayIsRunDate() {
  return new Date().toISOString().slice(0, 10) === RUN_DATE_UTC;
}

async function alreadyTriggered(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id, created_at")
    .eq("event_type", "jun2_build_triggered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!data;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();
  console.log("jun2-build-trigger: triggered", checkedAt);

  if (String(process.env.JUN2_BUILD_TRIGGER_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }
  if (!todayIsRunDate()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "not_run_date", today: new Date().toISOString().slice(0, 10), expected: RUN_DATE_UTC }) };
  }

  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hookUrl) {
    console.warn("jun2-build-trigger: NETLIFY_BUILD_HOOK_URL not set");
    return { statusCode: 500, body: JSON.stringify({ error: "build_hook_not_configured" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  let supabase = null;
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    if (await alreadyTriggered(supabase)) {
      return { statusCode: 200, body: JSON.stringify({ skipped: "already_triggered", checkedAt }) };
    }
  }

  let buildResult = "ok";
  try {
    const res = await fetch(hookUrl, { method: "POST", body: JSON.stringify({ trigger_title: "jun2-09:00-ET-release" }) });
    if (!res.ok) {
      buildResult = `http_${res.status}`;
      console.warn(`jun2-build-trigger: hook returned ${res.status}`);
    }
  } catch (err) {
    buildResult = `error: ${err.message}`;
    console.error("jun2-build-trigger: hook fetch failed:", err.message);
  }

  if (supabase) {
    try {
      await supabase.from("ops_events").insert({
        event_type: "jun2_build_triggered",
        details: { build_result: buildResult, checked_at: checkedAt },
      });
    } catch (logErr) {
      console.warn("jun2-build-trigger: ops_events log failed:", logErr.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ triggered: true, build_result: buildResult, checkedAt }) };
};
