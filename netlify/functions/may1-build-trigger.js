// ============================================================
// may1-build-trigger.js — Netlify Scheduled Function
//
// Fires the Netlify build hook on May 1, 2026 at 13:00 UTC
// (09:00 ET). The newsletter article and any release-day
// content gated by `publish_date <= today` in build.js
// loadArticles() will appear on the next build.
//
// Schedule: daily at 13:00 UTC (09:00 ET) via netlify.toml.
// One-shot guards inside the function:
//   1. DATE GUARD — fires only when today is 2026-05-01 (UTC).
//   2. IDEMPOTENCY GUARD — checks ops_events for a prior
//      `may1_build_triggered` event; exits if already fired.
//   3. KILL SWITCH — env var MAY1_BUILD_TRIGGER_DISABLED=true halts.
//
// Without this trigger, the existing rebuild-trigger cron (every
// 4h) picks up the article anyway — but its next firing might be
// at 04:00 ET which is 5 hours before the LinkedIn anchor. This
// function ensures the site refreshes within minutes of the 09:00 ET
// LinkedIn newsletter publish.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const RUN_DATE_UTC = "2026-05-01";

function todayIsRunDate() {
  return new Date().toISOString().slice(0, 10) === RUN_DATE_UTC;
}

async function alreadyTriggered(supabase) {
  const { data } = await supabase
    .from("ops_events")
    .select("id, created_at")
    .eq("event_type", "may1_build_triggered")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!data;
}

exports.handler = async () => {
  const checkedAt = new Date().toISOString();
  console.log("may1-build-trigger: triggered", checkedAt);

  if (String(process.env.MAY1_BUILD_TRIGGER_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", checkedAt }) };
  }
  if (!todayIsRunDate()) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "not_run_date", today: new Date().toISOString().slice(0, 10), expected: RUN_DATE_UTC }) };
  }

  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hookUrl) {
    console.warn("may1-build-trigger: NETLIFY_BUILD_HOOK_URL not set");
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
    const res = await fetch(hookUrl, { method: "POST", body: JSON.stringify({ trigger_title: "may1-09:00-ET-release" }) });
    if (!res.ok) {
      buildResult = `http_${res.status}`;
      console.warn(`may1-build-trigger: hook returned ${res.status}`);
    }
  } catch (err) {
    buildResult = `error: ${err.message}`;
    console.error("may1-build-trigger: hook fetch failed:", err.message);
  }

  if (supabase) {
    try {
      await supabase.from("ops_events").insert({
        event_type: "may1_build_triggered",
        details: { build_result: buildResult, checked_at: checkedAt },
      });
    } catch (logErr) {
      console.warn("may1-build-trigger: ops_events log failed:", logErr.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ triggered: true, build_result: buildResult, checkedAt }) };
};
