#!/usr/bin/env node
// ============================================================
// send-capture-corner-now.js — operator re-send for a MISSED Capture Corner.
//
// Why this exists (2026-08-25 incident):
// `capture-corner-autosend` fired ONCE a day at 13:00 UTC and only ever looked
// for TODAY's issue. If the issue was not live at that instant — a late merge,
// a slow deploy, a red build — the run fetched a 404, returned
// `no_capture_corner_today`, wrote NO marker, and the next run 24h later asked
// for the NEXT day's issue. The missed one was skipped permanently. That is
// what stranded the 2026-08-25 issue: merged 13:47 UTC, 47 minutes late.
//
// The cron now carries a catch-up window and heals that case by itself on the
// next daily run, so this script is no longer the only way out. Keep it for
// when you do not want to wait for that run — the same-day rescue.
//
// It calls the handler's own selectIssue(), so "which issue is outstanding" is
// decided in ONE place. A private copy of that rule here could disagree with
// the cron and mail the wrong day.
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
// will actually pick. A mismatch aborts rather than silently mailing the wrong
// issue.
// ============================================================

const DRY = process.argv.includes("--dry-run");
const dateArg = (process.argv.find((a) => a.startsWith("--date=")) || "").split("=")[1];

async function main() {
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

  // ---- Preflight (read-only), using the handler's OWN selection ----
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { selectIssue, todayET } = require("../netlify/functions/capture-corner-autosend.js");

  const examined = [];
  const picked = await selectIssue(supabase, examined);
  if (!picked) {
    console.log(`Nothing outstanding as of ${todayET()} (America/New_York). Nothing to do.`);
    for (const e of examined) {
      console.log(`  ${e.date}: ${e.skip}${e.status ? ` (HTTP ${e.status})` : ""}${e.error ? ` (${e.error})` : ""}`);
    }
    return;
  }
  const { date, url, html, rescued } = picked;

  if (dateArg && dateArg !== date) {
    console.error(`ABORT: --date=${dateArg} but the outstanding issue is ${date}.`);
    console.error("Re-run with the correct date, or without --date to accept the handler's pick.");
    process.exitCode = 1;
    return;
  }

  console.log(`Capture Corner re-send · target date ${date} (America/New_York)`);
  if (rescued) console.log(`  NOTE               : this is a CATCH-UP for ${date}, not today's issue.`);
  console.log("  idempotency marker : none (this issue has not been emailed)");
  const mark = 'class="brief-body">';
  const bodyLen = html.indexOf(mark) === -1 ? 0 : html.length - html.indexOf(mark);
  console.log(`  live page          : ${url}`);
  console.log(`  page body          : ${(html.length / 1024) | 0}KB, brief-body present: ${bodyLen > 0}`);

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
