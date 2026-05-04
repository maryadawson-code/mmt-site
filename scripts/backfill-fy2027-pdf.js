#!/usr/bin/env node
// ============================================================
// backfill-fy2027-pdf.js — one-shot script to deliver the FY2027
// Forecast PDF to the 20 subscribers who submitted between
// 2026-03-01 and 2026-04-24 and never received it (the original
// form posted directly to Buttondown and emailed nothing).
//
// Reads data/fy2027-backfill-list.csv. For each row:
//   1. Sends the PDF via Resend with the apology preface
//   2. Adds (or updates) the Buttondown subscriber with the
//      fy2027-forecast tag and a backfill source note
//   3. Sleeps 1000ms between sends to stay well under the Resend
//      5 rps cap (same precaution that surfaced in the 2026-04-24
//      biosurveillance incident — see reports/biosurveillance-replay-).
//
// Run from a local laptop with the Netlify env loaded — NOT from CI.
// Form submission is affirmative consent under CAN-SPAM, but the
// backfill should still be a deliberate human-initiated send.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//   RESEND_API_KEY=... BUTTONDOWN_API_KEY=... \
//   node scripts/backfill-fy2027-pdf.js              # live
//   node scripts/backfill-fy2027-pdf.js --dry-run    # plan + skip checks
//
// Idempotent-ish: re-runs will resend the PDF (Resend has no built-in
// dedupe). Use --dry-run first; if you re-run live within minutes
// you'll re-send. Track the report from the previous run.
// ============================================================

const fs = require("fs");
const path = require("path");
const { sendLeadMagnet } = require("../netlify/functions/lead-magnet-fy2027");

const CSV_PATH = path.resolve(__dirname, "..", "data", "fy2027-backfill-list.csv");
const SLEEP_MS = 1000;

function parseArgs(argv) {
  const args = { dryRun: false, email: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--email") {
      args.email = (rest[i + 1] || "").toLowerCase().trim();
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log("Usage: node scripts/backfill-fy2027-pdf.js [--dry-run] [--email addr]");
      console.log("  --email addr   send only to the row matching this email (safe re-run)");
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cells[j] || "";
    rows.push(row);
  }
  return rows;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);

  if (!process.env.RESEND_API_KEY) {
    console.error("[fatal] RESEND_API_KEY not set");
    process.exit(1);
  }
  if (!process.env.BUTTONDOWN_API_KEY) {
    console.warn("[warn] BUTTONDOWN_API_KEY not set — Resend send will run, Buttondown step will fail per-row but won't block the PDF delivery");
  }
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[fatal] CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const allRows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const rows = args.email
    ? allRows.filter((r) => (r.email || "").toLowerCase().trim() === args.email)
    : allRows;
  if (args.email && rows.length === 0) {
    console.error(`[fatal] --email ${args.email} not found in ${path.basename(CSV_PATH)}. Append the row first.`);
    process.exit(1);
  }
  console.log(`Loaded ${allRows.length} subscribers from ${path.basename(CSV_PATH)}; targeting ${rows.length}.`);
  if (args.email) console.log(`Single-recipient mode: ${args.email}`);
  console.log(`Mode: ${args.dryRun ? "DRY-RUN (no sends)" : "LIVE — sending PDF + apology"}`);
  console.log("");

  let okCount = 0;
  let failCount = 0;
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = (row.email || "").toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log(`[${i + 1}/${rows.length}] SKIP invalid email: ${JSON.stringify(row)}`);
      continue;
    }

    if (args.dryRun) {
      console.log(`[${i + 1}/${rows.length}] DRY would send PDF + apology to ${email} (status=${row.status}, subscribed=${row.subscribed_at})`);
      continue;
    }

    try {
      const result = await sendLeadMagnet({
        email,
        name: null,
        company: null,
        isBackfill: true,
      });
      const resendOk = !!(result.resend && result.resend.success);
      const bdOk = !!(result.buttondown && result.buttondown.ok);
      if (resendOk) {
        okCount++;
        console.log(
          `[${i + 1}/${rows.length}] OK  ${email}  resend=${result.resend.id || "?"}  buttondown=${bdOk ? "ok" : "fail:" + (result.buttondown.error || "?")}`
        );
      } else {
        failCount++;
        console.error(
          `[${i + 1}/${rows.length}] FAIL ${email}  resend=${result.resend && result.resend.error}  buttondown=${result.buttondown && result.buttondown.error}`
        );
      }
      results.push({ email, resendOk, bdOk, resend_id: result.resend?.id, error: result.resend?.error });
    } catch (err) {
      failCount++;
      console.error(`[${i + 1}/${rows.length}] THROW ${email}  ${err.message}`);
      results.push({ email, resendOk: false, bdOk: false, error: err.message });
    }

    // Throttle 1000ms between sends — well under Resend's 5 rps cap
    if (i < rows.length - 1) await sleep(SLEEP_MS);
  }

  console.log("");
  console.log(`== Summary ==  ${okCount} sent · ${failCount} failed · ${rows.length} total`);
  if (failCount > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(`[fatal] ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
