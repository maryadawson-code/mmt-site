#!/usr/bin/env node
// ============================================================
// replay-stranded-recipients.js
//
// One-shot replay for scheduled_emails rows where some recipients hit
// Resend 429 rate-limit (or other non-terminal failures) and were left
// behind. Parses last_error JSON from the row, re-sends to those
// recipients only, with per-call throttle.
//
// Usage:
//   node scripts/replay-stranded-recipients.js --scheduled-email-id <uuid> [--dry-run]
//   node scripts/replay-stranded-recipients.js --release <release_id>      [--dry-run]
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY  (required)
//
// Behavior:
//   - Dry-run: prints plan + rendered email preview + per-recipient
//     eligibility checks. No DB writes, no Resend calls.
//   - Live (no --dry-run): sends with 220ms between calls, logs per-recipient
//     CAPTURE_CORNER_RELEASE_REPLAYED to ops_events, appends to
//     scheduled_emails.replayed_recipients. Does NOT touch status column.
//
// Idempotency:
//   - Skips any recipient already present in scheduled_emails.resend_ids
//     (means the original send succeeded for them — don't double-send)
//   - Skips any recipient already present in scheduled_emails.replayed_recipients
//     (means a prior invocation of this script already replayed them)
//   - Skips any recipient not currently premium_active in mp_users
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_BCC_EMAILS = process.env.ADMIN_BCC_EMAILS || "";

const THROTTLE_MS = 220; // 4.5 rps, safely under Resend's 5 rps cap

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--scheduled-email-id") args.scheduledEmailId = argv[++i];
    else if (a === "--release") args.release = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage:\n" +
          "  node scripts/replay-stranded-recipients.js --scheduled-email-id <uuid> [--dry-run]\n" +
          "  node scripts/replay-stranded-recipients.js --release <release_id>      [--dry-run]"
      );
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  if (!args.scheduledEmailId && !args.release) {
    throw new Error("must supply --scheduled-email-id or --release");
  }
  return args;
}

function parseStrandedRecipients(lastErrorRaw) {
  // last_error is a JSON array of {email, status, body} rows.
  if (!lastErrorRaw) return [];
  let parsed;
  try {
    parsed = JSON.parse(lastErrorRaw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((e) => e && e.email && e.status)
    .map((e) => ({ email: e.email, status: e.status, body: e.body || "" }));
}

function dedupBccCaseInsensitive(addresses) {
  const seen = new Set();
  const out = [];
  for (const a of addresses) {
    if (!a) continue;
    const k = String(a).trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(String(a).trim());
    }
  }
  return out;
}

async function resendSend({ from, to, reply_to, bcc, subject, html, text }) {
  const rsp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], reply_to, bcc, subject, html, text }),
  });
  const body = await rsp.json().catch(() => ({}));
  return { status: rsp.status, body };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function logOpsEvent(supabase, row) {
  // ops_events uses `user_email`, not `email`. Schema:
  // id, created_at, event_type, source_function, scoring_id, order_id,
  // user_email, severity, auto_resolved, resolution, details,
  // error_signature, failure_class, cost_estimate, duration_ms, tokens_used.
  const { error } = await supabase.from("ops_events").insert({
    event_type: row.event_type,
    source_function: row.source_function,
    severity: row.severity || "info",
    user_email: row.email || null,
    details: row.details || {},
  });
  if (error) {
    console.warn(`  [warn] ops_events insert failed: ${error.message}`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RESEND_API_KEY) {
    throw new Error(
      "missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY must all be set"
    );
  }

  const args = parseArgs(process.argv);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // --- Load scheduled_emails row ---
  let rowQuery = supabase.from("scheduled_emails").select("*").limit(1);
  if (args.scheduledEmailId) {
    rowQuery = rowQuery.eq("id", args.scheduledEmailId);
  } else {
    rowQuery = rowQuery.eq("release_id", args.release).order("scheduled_at", { ascending: false });
  }
  const { data: rows, error: rowErr } = await rowQuery;
  if (rowErr) throw new Error(`scheduled_emails fetch: ${rowErr.message}`);
  if (!rows || rows.length === 0) throw new Error("no scheduled_emails row matched");
  const row = rows[0];

  console.log("== Scheduled email row ==");
  console.log(`  id:          ${row.id}`);
  console.log(`  release_id:  ${row.release_id}`);
  console.log(`  subject:     ${row.subject}`);
  console.log(`  status:      ${row.status}`);
  console.log(`  sent_at:     ${row.sent_at}`);
  console.log(`  attempts:    ${row.attempts}`);
  console.log(
    `  resend_ids:  ${Array.isArray(row.resend_ids) ? row.resend_ids.length : 0} sent on original`
  );

  // --- Parse stranded recipients from last_error ---
  const stranded = parseStrandedRecipients(row.last_error);
  console.log(`\n== Stranded recipients (parsed from last_error) ==`);
  for (const s of stranded) {
    console.log(`  ${s.email}  status=${s.status}`);
  }
  if (stranded.length === 0) {
    console.log("  [none] — nothing to replay. Exiting clean.");
    return;
  }

  // --- Idempotency: filter out recipients already in resend_ids OR replayed_recipients ---
  const alreadySent = new Set(
    (row.resend_ids || [])
      .map((r) => (r && r.email ? String(r.email).toLowerCase() : null))
      .filter(Boolean)
  );
  const alreadyReplayed = new Set(
    (row.replayed_recipients || [])
      .map((r) => (r && r.email ? String(r.email).toLowerCase() : null))
      .filter(Boolean)
  );

  const candidates = [];
  const skipped = [];
  for (const s of stranded) {
    const key = s.email.toLowerCase();
    if (alreadySent.has(key)) {
      skipped.push({ email: s.email, reason: "already in resend_ids — do NOT double-send" });
      continue;
    }
    if (alreadyReplayed.has(key)) {
      skipped.push({ email: s.email, reason: "already in replayed_recipients" });
      continue;
    }
    candidates.push(s);
  }

  // --- Idempotency check against ops_events (belt-and-suspenders) ---
  const { data: prevReplayEvents } = await supabase
    .from("ops_events")
    .select("user_email")
    .eq("source_function", "replay-stranded-recipients")
    .eq("event_type", "CAPTURE_CORNER_RELEASE_REPLAYED")
    .contains("details", { release_id: row.release_id });
  const prevReplaySet = new Set(
    (prevReplayEvents || []).map((e) => (e.user_email || "").toLowerCase())
  );
  const prevOverlap = candidates.filter((c) => prevReplaySet.has(c.email.toLowerCase()));
  if (prevOverlap.length) {
    console.log(
      `\n  [warn] ops_events shows prior replay for: ${prevOverlap.map((c) => c.email).join(", ")}`
    );
    console.log("         These will be skipped to prevent double-send.");
  }
  const finalCandidates = candidates.filter((c) => !prevReplaySet.has(c.email.toLowerCase()));
  for (const c of candidates.filter((c) => prevReplaySet.has(c.email.toLowerCase()))) {
    skipped.push({ email: c.email, reason: "ops_events CAPTURE_CORNER_RELEASE_REPLAYED already exists" });
  }

  // --- Eligibility: each recipient still premium_active in mp_users ---
  const emails = finalCandidates.map((c) => c.email);
  const { data: users } = await supabase
    .from("mp_users")
    .select("email, subscription_tier, subscription_status, founding_member")
    .in("email", emails);
  const userMap = new Map((users || []).map((u) => [u.email.toLowerCase(), u]));

  const eligible = [];
  for (const c of finalCandidates) {
    const u = userMap.get(c.email.toLowerCase());
    if (!u) {
      skipped.push({ email: c.email, reason: "not in mp_users" });
      continue;
    }
    if (u.subscription_tier !== "premium" || u.subscription_status !== "active") {
      skipped.push({
        email: c.email,
        reason: `not premium_active (tier=${u.subscription_tier}, status=${u.subscription_status})`,
      });
      continue;
    }
    eligible.push({ ...c, founding_member: !!u.founding_member });
  }

  console.log(`\n== Plan ==`);
  console.log(`  Eligible to replay:  ${eligible.length}`);
  for (const e of eligible) {
    console.log(`    ${e.email}  founding=${e.founding_member}`);
  }
  console.log(`  Skipped:             ${skipped.length}`);
  for (const s of skipped) {
    console.log(`    ${s.email}  — ${s.reason}`);
  }

  // --- Resolve BCC: row.bcc (hydrate from the original send) ∪ ADMIN_BCC_EMAILS ∪ mary@ ---
  const rowBcc = Array.isArray(row.bcc) ? row.bcc : [];
  const adminBcc = ADMIN_BCC_EMAILS.split(",").map((s) => s.trim()).filter(Boolean);
  const bcc = dedupBccCaseInsensitive([...rowBcc, ...adminBcc, "mary@missionmeetstech.com"]);

  console.log(`\n== Email wiring ==`);
  console.log(`  From:      ${row.from_address}`);
  console.log(`  Reply-To:  ${row.reply_to}`);
  console.log(`  Subject:   ${row.subject}`);
  console.log(`  BCC:       ${JSON.stringify(bcc)}`);
  console.log(`  HTML size (standard):  ${(row.html || "").length} chars`);
  console.log(`  HTML size (founding):  ${(row.founding_variant_html || "").length} chars`);
  console.log(`  Text size:             ${(row.text_body || "").length} chars`);

  if (eligible.length === 0) {
    console.log("\n[exit] No eligible recipients after filters. No sends performed.");
    return;
  }

  // --- DRY-RUN ---
  if (args.dryRun) {
    console.log(`\n== DRY-RUN — rendered preview for first eligible recipient ==`);
    const r = eligible[0];
    const html = r.founding_member && row.founding_variant_html ? row.founding_variant_html : row.html;
    console.log(`  (${html.length} chars; first 400:)`);
    console.log(`  ${html.substring(0, 400).replace(/\n/g, "\n  ")}`);
    console.log(`\n[DRY-RUN] Would send to ${eligible.length} recipient(s) with ${THROTTLE_MS}ms between calls.`);
    console.log("[DRY-RUN] No DB writes performed. No Resend calls performed.");
    return;
  }

  // --- LIVE SEND ---
  console.log(`\n== LIVE SEND — ${eligible.length} recipient(s), ${THROTTLE_MS}ms throttle ==`);
  const results = [];
  for (let i = 0; i < eligible.length; i++) {
    const r = eligible[i];
    if (i > 0) await sleep(THROTTLE_MS);
    const html =
      r.founding_member && row.founding_variant_html ? row.founding_variant_html : row.html;
    let outcome;
    try {
      const { status, body } = await resendSend({
        from: row.from_address,
        to: r.email,
        reply_to: row.reply_to,
        bcc,
        subject: row.subject,
        html,
        text: row.text_body,
      });
      if (status >= 200 && status < 300 && body.id) {
        outcome = { email: r.email, ok: true, resend_id: body.id, founding: r.founding_member };
      } else {
        outcome = {
          email: r.email,
          ok: false,
          status,
          error: JSON.stringify(body).substring(0, 300),
        };
      }
    } catch (err) {
      outcome = { email: r.email, ok: false, error: String(err.message || err).substring(0, 300) };
    }
    console.log(
      `  ${outcome.ok ? "[OK] " : "[FAIL]"} ${outcome.email}  ${outcome.ok ? outcome.resend_id : outcome.error}`
    );
    results.push(outcome);

    await logOpsEvent(supabase, {
      event_type: "CAPTURE_CORNER_RELEASE_REPLAYED",
      source_function: "replay-stranded-recipients",
      severity: outcome.ok ? "info" : "warn",
      email: outcome.email,
      details: {
        release_id: row.release_id,
        scheduled_email_id: row.id,
        resend_id: outcome.resend_id || null,
        ok: outcome.ok,
        error: outcome.ok ? null : outcome.error,
      },
    });
  }

  // --- Append to scheduled_emails.replayed_recipients (do NOT touch status) ---
  const now = new Date().toISOString();
  const newReplayEntries = results
    .filter((r) => r.ok)
    .map((r) => ({ email: r.email, resend_id: r.resend_id, replayed_at: now }));
  if (newReplayEntries.length > 0) {
    const { data: reread } = await supabase
      .from("scheduled_emails")
      .select("replayed_recipients")
      .eq("id", row.id)
      .single();
    const merged = [...(reread?.replayed_recipients || []), ...newReplayEntries];
    const { error: updErr } = await supabase
      .from("scheduled_emails")
      .update({ replayed_recipients: merged, updated_at: now })
      .eq("id", row.id);
    if (updErr) {
      console.warn(`  [warn] scheduled_emails update failed: ${updErr.message}`);
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`\n== Summary ==  ${okCount} sent, ${failCount} failed, ${skipped.length} skipped (filtered).`);

  // Non-zero exit on partial fail so the wrapping shell sees it
  if (failCount > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(`\n[fatal] ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
