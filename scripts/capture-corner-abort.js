#!/usr/bin/env node
// ============================================================
// capture-corner-abort.js — abort or reschedule a queued release.
//
// Usage:
//   node scripts/capture-corner-abort.js --release biosurveillance-reframing-playbook
//   node scripts/capture-corner-abort.js --release biosurveillance-reframing-playbook --reschedule 2026-04-25T13:00:00Z
//
// Rejects if current time > publish_at - 6h.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  return process.argv[i + 1];
}

async function main() {
  const releaseId = arg("--release");
  const reschedule = arg("--reschedule");
  if (!releaseId) {
    console.error("usage: capture-corner-abort.js --release RELEASE_ID [--reschedule ISO8601]");
    process.exit(1);
  }

  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const now = Date.now();
  const SIX_HOUR_MS = 6 * 60 * 60 * 1000;

  const { data: portal } = await s.from("premium_deliverables").select("*").eq("release_id", releaseId).maybeSingle();
  const { data: email } = await s.from("scheduled_emails").select("*").eq("release_id", releaseId).maybeSingle();
  if (!portal && !email) {
    console.error(`No portal or scheduled_emails row for release_id=${releaseId}`);
    process.exit(1);
  }

  const publishAt = new Date(portal?.publish_at || email?.scheduled_at).getTime();
  const abortDeadline = publishAt - SIX_HOUR_MS;
  if (now > abortDeadline && !reschedule) {
    console.error(`Abort window violated. now=${new Date(now).toISOString()} deadline=${new Date(abortDeadline).toISOString()} publish_at=${new Date(publishAt).toISOString()}`);
    process.exit(2);
  }

  if (reschedule) {
    const newAt = new Date(reschedule).toISOString();
    if (portal) await s.from("premium_deliverables").update({ publish_at: newAt, published: false, updated_at: new Date().toISOString() }).eq("id", portal.id);
    if (email) await s.from("scheduled_emails").update({ scheduled_at: newAt, status: "queued", attempts: 0, last_error: null, updated_at: new Date().toISOString() }).eq("id", email.id);
    console.log(`release_id=${releaseId} rescheduled to ${newAt}`);
  } else {
    if (portal) await s.from("premium_deliverables").update({ published: false, publish_at: new Date("2099-01-01T00:00:00Z").toISOString(), updated_at: new Date().toISOString() }).eq("id", portal.id);
    if (email) await s.from("scheduled_emails").update({ status: "aborted", updated_at: new Date().toISOString() }).eq("id", email.id);
    console.log(`release_id=${releaseId} aborted. Note: if Resend scheduled_at was used natively, you may also need to cancel via Resend dashboard.`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
