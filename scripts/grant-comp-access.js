#!/usr/bin/env node
// ============================================================
// grant-comp-access.js — Manual premium-access grant CLI
//
// Grants comp (tester / partner) access to MMT Premium without a Stripe
// subscription. Upserts mp_users, inserts an audit row in
// comp_access_grants, logs MANUAL_ACCESS_GRANT to ops_ledger, and sends
// a welcome email via Resend.
//
// Usage:
//   node scripts/grant-comp-access.js --email <addr> --name <"Full Name"> \
//        --reason <code> --months <N> [--granted-by <admin_email>] \
//        [--notes <text>] [--dry-run]
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY
//
// Idempotency:
//   - If mp_users already shows an active grant whose expires_at is on or
//     after the newly-computed expiry, the script logs a no-op and skips
//     the welcome email + audit row insert.
//   - If the existing expires_at is earlier than the new one, the script
//     extends expires_at, logs GRANT_EXTENDED, and still skips the welcome.
//   - Re-running with the same params is safe: no dup emails, no dup rows.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("../netlify/functions/lib/send-email");
const { logOpsEvent } = require("../netlify/functions/lib/ops-ledger");
const {
  buildTesterCompWelcome,
} = require("../netlify/functions/lib/email-templates/tester-comp-welcome");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_BCC_EMAILS = process.env.ADMIN_BCC_EMAILS || "";

function parseArgs(argv) {
  const args = { grantedBy: "mary@missionmeetstech.com", months: 6, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") args.email = argv[++i];
    else if (a === "--name") args.name = argv[++i];
    else if (a === "--reason") args.reason = argv[++i];
    else if (a === "--months") args.months = parseInt(argv[++i], 10);
    else if (a === "--granted-by") args.grantedBy = argv[++i];
    else if (a === "--notes") args.notes = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/grant-comp-access.js --email <addr> --name <\"Full Name\"> --reason <code> --months <N> [--granted-by <addr>] [--notes <text>] [--dry-run]"
      );
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  if (!args.email) throw new Error("--email required");
  if (!args.reason) throw new Error("--reason required (e.g. tester_comp)");
  if (!Number.isFinite(args.months) || args.months <= 0) {
    throw new Error("--months must be a positive integer");
  }
  return args;
}

function addMonthsIso(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

function dedupLowerCase(list) {
  const seen = new Set();
  const out = [];
  for (const a of list) {
    if (!a) continue;
    const k = String(a).trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(String(a).trim());
    }
  }
  return out;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY");
  }
  const args = parseArgs(process.argv);
  const email = args.email.toLowerCase().trim();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const nowIso = new Date().toISOString();
  const newExpiresIso = addMonthsIso(args.months);

  console.log("== Comp access grant plan ==");
  console.log(`  email:        ${email}`);
  console.log(`  name:         ${args.name || "(derived from email)"}`);
  console.log(`  reason:       ${args.reason}`);
  console.log(`  months:       ${args.months}`);
  console.log(`  granted_by:   ${args.grantedBy}`);
  console.log(`  granted_at:   ${nowIso}`);
  console.log(`  expires_at:   ${newExpiresIso}`);
  console.log(`  notes:        ${args.notes || "(none)"}`);

  // Check existing mp_users row.
  const { data: existingRows, error: fetchErr } = await supabase
    .from("mp_users")
    .select(
      "email, full_name, subscription_tier, subscription_status, tier, founding_member, granted_by, grant_reason, granted_at, expires_at, stripe_customer_id, stripe_subscription_id"
    )
    .eq("email", email)
    .limit(1);
  if (fetchErr) throw fetchErr;
  const existing = existingRows && existingRows[0];

  // Idempotency — if the user already has a valid grant that covers the
  // requested window (within a 30-day tolerance), do nothing. The
  // tolerance prevents a re-run with the same --months flag from being
  // interpreted as a meaningful extension just because `now()` ticked
  // forward a few minutes.
  const MIN_EXTENSION_DAYS = 30;
  const existingExpMs = existing?.expires_at ? new Date(existing.expires_at).getTime() : 0;
  const requestedExpMs = new Date(newExpiresIso).getTime();
  const deltaDays = (requestedExpMs - existingExpMs) / (1000 * 60 * 60 * 24);

  if (
    existing &&
    existing.subscription_tier === "premium" &&
    existing.subscription_status === "active" &&
    existing.expires_at &&
    deltaDays < MIN_EXTENSION_DAYS
  ) {
    console.log("\n[noop_already_granted] existing grant already covers the requested window.");
    console.log(`  existing expires_at:  ${existing.expires_at}`);
    console.log(`  requested expires_at: ${newExpiresIso}`);
    console.log(`  delta:                ${deltaDays.toFixed(1)}d (threshold: ${MIN_EXTENSION_DAYS}d)`);
    if (!args.dryRun) {
      await logOpsEvent(supabase, {
        event_type: "MANUAL_ACCESS_GRANT",
        source_function: "grant-comp-access",
        severity: "info",
        signature: "noop_already_granted",
        affected_entity: email,
        details: {
          email,
          action: "noop_already_granted",
          existing_expires_at: existing.expires_at,
          requested_expires_at: newExpiresIso,
          delta_days: Number(deltaDays.toFixed(2)),
          granted_by: args.grantedBy,
          reason: args.reason,
        },
      });
    }
    return;
  }

  // An extension is a meaningful forward-move of expires_at (>= 30 days
  // later than what's currently on file). A regrant is re-granting after
  // a prior revoke/expire. A grant is the first touch.
  const isExtension = existing && existing.expires_at && deltaDays >= MIN_EXTENSION_DAYS;
  const action = isExtension ? "extended" : existing ? "regranted" : "granted";

  if (args.dryRun) {
    const verb =
      action === "granted" ? "grant" : action === "regranted" ? "regrant" : "extend";
    console.log(`\n[DRY-RUN] would ${verb}. No DB writes, no welcome email.`);
    return;
  }

  // Upsert mp_users.
  const upsertPayload = {
    email,
    full_name: args.name || existing?.full_name || null,
    subscription_tier: "premium",
    subscription_status: "active",
    tier: "paid",
    founding_member: existing?.founding_member || false,
    granted_by: args.grantedBy,
    grant_reason: args.reason,
    granted_at: nowIso,
    expires_at: newExpiresIso,
    mp_quota_override: null,
    pp_quota_override: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    updated_at: nowIso,
  };
  const { error: upsertErr } = await supabase
    .from("mp_users")
    .upsert(upsertPayload, { onConflict: "email" });
  if (upsertErr) throw upsertErr;
  console.log(`[mp_users] upserted (${action})`);

  // Insert audit row (warn-skip if table missing per spec).
  // Only on fresh `granted` action; extensions mutate mp_users.expires_at
  // and are traced via ops_events MANUAL_ACCESS_GRANT so the audit table
  // stays a clean one-row-per-identity log of initial grants.
  let auditInserted = false;
  if (action === "granted" || action === "regranted") {
    try {
      const { error: auditErr } = await supabase.from("comp_access_grants").insert({
        email,
        name: args.name || null,
        granted_by: args.grantedBy,
        grant_reason: args.reason,
        granted_at: nowIso,
        expires_at: newExpiresIso,
        notes: args.notes || null,
      });
      if (auditErr) throw auditErr;
      auditInserted = true;
      console.log(`[comp_access_grants] audit row inserted`);
    } catch (auditErr) {
      console.warn(
        `[warn] comp_access_grants insert failed: ${auditErr.message} — grant itself succeeded; audit row missing.`
      );
    }
  } else {
    console.log(`[comp_access_grants] skipped (action=${action}; audit table logs initial grants only)`);
  }

  // Welcome email — skip if this is an extension of an active grant.
  let resendId = null;
  if (isExtension) {
    console.log("[welcome-email] skipped — this is an extension, not a fresh grant.");
  } else {
    const { subject, html, text } = buildTesterCompWelcome({
      customerEmail: email,
      name: args.name,
      reason: args.reason,
      expiresAt: newExpiresIso,
      months: args.months,
    });
    const bcc = dedupLowerCase([
      "mary@missionmeetstech.com",
      ...ADMIN_BCC_EMAILS.split(",").map((s) => s.trim()).filter(Boolean),
    ]).filter((a) => a.toLowerCase() !== email);
    try {
      const result = await sendEmail({
        to: email,
        subject,
        html,
        text,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        bcc,
        tags: [
          { name: "app", value: "mmt" },
          { name: "stream", value: "comp_welcome" },
        ],
      });
      if (result && result.success) {
        resendId = result.id || result.messageId || null;
        console.log(`[welcome-email] sent — resend_id=${resendId}`);
      } else {
        console.warn(
          `[warn] welcome email failed: ${(result && result.error) || "unknown error"}`
        );
      }
    } catch (emailErr) {
      console.warn(`[warn] welcome email threw: ${emailErr.message}`);
    }
  }

  await logOpsEvent(supabase, {
    event_type: "MANUAL_ACCESS_GRANT",
    source_function: "grant-comp-access",
    severity: "info",
    signature: args.reason,
    affected_entity: email,
    details: {
      email,
      name: args.name || null,
      action,
      reason: args.reason,
      months: args.months,
      granted_by: args.grantedBy,
      granted_at: nowIso,
      expires_at: newExpiresIso,
      resend_message_id: resendId,
      audit_row_inserted: auditInserted,
    },
  });

  console.log(`\n[done] ${action} — expires ${newExpiresIso}`);
}

main().catch((err) => {
  console.error(`\n[fatal] ${err.message || err}`);
  process.exit(1);
});
