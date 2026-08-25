#!/usr/bin/env node
// ============================================================
// send-capture-corner-now.js — operator re-send for a MISSED Capture Corner.
//
// Why this exists (2026-08-25 incident):
// `capture-corner-autosend` fires ONCE a day at 13:00 UTC and only ever looks
// for TODAY's issue. If the issue is not live on the site at that instant — a
// late merge, a slow deploy, a red build — the run fetches a 404, returns
// `no_capture_corner_today`, and deliberately writes NO idempotency marker.
// The next run is 24h later, by which point todayET() has advanced and that
// issue is skipped PERMANENTLY. On 2026-08-25 the issue merged at ~13:47 UTC,
// 47 minutes after the cron had already given up, and there was no way to
// re-fire it. This is that missing path.
//
// It invokes the REAL handler, so the preview cut, recipient query, idempotency
// claim, 220ms throttle and admin summary cannot drift from the scheduled path.
// The handler's own marker check makes a double-run safe: if the issue already
// went out, this returns `already_sent` and mails nobody.
//
// Usage (prod env supplied by the Netlify CLI):
//   netlify dev:exec -- node scripts/send-capture-corner-now.js --dry-run
//   netlify dev:exec -- node scripts/send-capture-corner-now.js
//
// NOTE the `--`, or the Netlify CLI eats the flags.
//
// --date=YYYY-MM-DD is accepted ONLY to confirm you mean the issue the handler
// will actually pick (it always uses today in America/New_York). A mismatch
// aborts rather than silently mailing the wrong issue.
// ============================================================

const DRY = process.argv.includes("--dry-run");
const dateArg = (process.argv.find((a) => a.startsWith("--date=")) || "").split("=")[1];

const SITE_URL = "https://missionmeetstech.com";
const EVENT = "capture_corner_sent";

function todayET() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

async function main() {
  const date = todayET();

  if (dateArg && dateArg !== date) {
    console.error(`ABORT: --date=${dateArg} but the handler will send today's issue (${date}).`);
    console.error("The scheduled path is hardcoded to today in America/New_York. It cannot send a back-dated issue.");
    process.exitCode = 1;
    return;
  }

  console.log(`Capture Corner re-send · target date ${date} (America/New_York)`);

  if (String(process.env.CAPTURE_CORNER_AUTOSEND_DISABLED || "").toLowerCase() === "true") {
    console.error("ABORT: CAPTURE_CORNER_AUTOSEND_DISABLED=true. Unset the kill switch first.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("ABORT: SUPABASE_URL / SUPABASE_SERVICE_KEY missing. Run under `netlify dev:exec --`.");
    process.exitCode = 1;
    return;
  }

  // ---- Preflight (read-only; the same three things the handler gates on) ----
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: already } = await supabase
    .from("ops_events").select("id, details")
    .eq("event_type", EVENT).filter("details->>date", "eq", date).limit(1).maybeSingle();
  if (already) {
    console.log(`ALREADY SENT: an ops_event marker exists for ${date}. Nothing to do.`);
    console.log(`  ${JSON.stringify(already.details)}`);
    return;
  }
  console.log("  idempotency marker : none (this issue has not been emailed)");

  const url = `${SITE_URL}/premium/briefs/capture-corner-${date}.html`;
  let res;
  try { res = await fetch(url); }
  catch (e) {
    console.error(`ABORT: cannot reach ${url} — ${e.message}`);
    process.exitCode = 1;
    return;
  }
  if (!res.ok) {
    console.error(`ABORT: ${url} returned HTTP ${res.status}. The issue is not live yet.`);
    console.error("Wait for the Netlify deploy to finish, then re-run. Sending is pointless until the page is up.");
    process.exitCode = 1;
    return;
  }
  const html = await res.text();
  const mark = 'class="brief-body">';
  const bodyLen = html.indexOf(mark) === -1 ? 0 : html.length - html.indexOf(mark);
  console.log(`  live page          : HTTP ${res.status} (${(html.length / 1024) | 0}KB, brief-body present: ${bodyLen > 0})`);

  const { data: subs } = await supabase
    .from("mp_users").select("email")
    .in("subscription_tier", ["premium", "mmt_premium_founding", "institutional"])
    .in("subscription_status", ["active", "trialing"]);
  const { data: adminU } = await supabase.from("mp_users").select("email").in("tier", ["admin", "paid"]);
  const seen = new Set();
  const recipients = [...(subs || []), ...(adminU || [])]
    .filter((u) => u.email && !seen.has(u.email.toLowerCase()) && seen.add(u.email.toLowerCase()));
  console.log(`  eligible recipients: ${recipients.length}`);

  if (DRY) {
    console.log("\nDRY RUN — nothing sent. Re-run without --dry-run to send.");
    return;
  }

  // ---- Real send, through the scheduled handler itself ----
  console.log("\nInvoking capture-corner-autosend handler...");
  const { handler } = require("../netlify/functions/capture-corner-autosend.js");
  const out = await handler();
  console.log(`HTTP ${out.statusCode}  ${out.body}`);
  const parsed = JSON.parse(out.body || "{}");
  if (parsed.failed > 0) process.exitCode = 1;
}

main().catch((e) => { console.error("FAILED:", e); process.exitCode = 1; });
