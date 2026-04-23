#!/usr/bin/env node
// ============================================================
// publish-premium-deliverable.js — schedule a premium deliverable
// (portal row + scheduled email) for future release.
//
// Usage:
//   node scripts/publish-premium-deliverable.js \
//     --file drops/.../*.md \
//     --slug /premium/capture-corner/biosurveillance-reframing-playbook \
//     --title "Capture Corner: The Biosurveillance Reframing Playbook" \
//     --email-subject "Capture Corner: The Biosurveillance Reframing Playbook" \
//     --preheader "..." \
//     --release-id biosurveillance-reframing-playbook \
//     --datetime 2026-04-24T13:00:00Z \
//     --capture-corner
//
// Idempotent: existing release_id rows are updated in place.
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  return process.argv[i + 1];
}
function flag(name) {
  return process.argv.includes(name);
}

async function main() {
  const file = arg("--file");
  const slug = arg("--slug");
  const title = arg("--title");
  const emailSubject = arg("--email-subject") || title;
  const preheader = arg("--preheader") || "";
  const releaseId = arg("--release-id");
  const datetime = arg("--datetime");
  const isCaptureCorner = flag("--capture-corner");

  if (!file || !slug || !title || !releaseId || !datetime) {
    console.error("usage: publish-premium-deliverable.js --file PATH --slug /premium/... --title T --release-id ID --datetime ISO8601 [--email-subject S] [--preheader P] [--capture-corner]");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`source file not found: ${file}`);
    process.exit(1);
  }
  const publishAt = new Date(datetime).toISOString();
  const body = fs.readFileSync(file, "utf8");

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env.");
    process.exit(1);
  }
  const s = createClient(SUPABASE_URL, SERVICE_KEY);

  // Extract summary bullets from H2/H3 (up to 5) for email rendering.
  const headings = [...body.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 5);

  // Upsert portal row.
  const { data: existing } = await s.from("premium_deliverables").select("id").eq("slug", slug).maybeSingle();
  const portalRow = {
    release_id: releaseId,
    slug,
    title,
    body_markdown: body,
    source_file: path.relative(process.cwd(), file),
    publish_at: publishAt,
    published: false,
    email_subject: emailSubject,
    preheader,
    summary_bullets: headings,
    is_capture_corner_release: isCaptureCorner,
    updated_at: new Date().toISOString(),
  };
  let portalId;
  if (existing) {
    const { data, error } = await s.from("premium_deliverables").update(portalRow).eq("id", existing.id).select().single();
    if (error) { console.error("portal upsert failed:", error.message); process.exit(1); }
    portalId = data.id;
    console.log(`portal row updated: ${portalId}  slug=${slug}`);
  } else {
    const { data, error } = await s.from("premium_deliverables").insert(portalRow).select().single();
    if (error) { console.error("portal insert failed:", error.message); process.exit(1); }
    portalId = data.id;
    console.log(`portal row inserted: ${portalId}  slug=${slug}`);
  }

  // Build email HTML.
  const { buildCaptureCornerEmail } = require("./lib/capture-corner-email");
  const { html: emailHtml, foundingHtml, text: emailText } = buildCaptureCornerEmail({
    title,
    preheader,
    openingParagraph: body.split(/\n\n/).filter((p) => p.trim() && !p.startsWith("#")).slice(0, 1).join(" ").substring(0, 600),
    bullets: headings,
    slug,
  });

  // ADMIN_BCC_EMAILS + hard-coded mary@
  const adminBcc = (process.env.ADMIN_BCC_EMAILS || "")
    .split(",").map((e) => e.trim()).filter(Boolean);
  const bccSet = new Set([...adminBcc.map((e) => e.toLowerCase()), "mary@missionmeetstech.com"]);
  const bcc = Array.from(bccSet);

  const scheduledEmailRow = {
    release_id: releaseId,
    subject: emailSubject,
    from_address: "MMT Premium <premium@missionmeetstech.com>",
    reply_to: "mary@missionmeetstech.com",
    bcc,
    html: emailHtml,
    founding_variant_html: foundingHtml,
    text_body: emailText,
    recipient_query: "premium_active",
    scheduled_at: publishAt,
    status: "queued",
  };

  const { data: existingEmail } = await s.from("scheduled_emails").select("id, status").eq("release_id", releaseId).maybeSingle();
  let emailId;
  if (existingEmail) {
    if (existingEmail.status !== "queued") {
      console.log(`scheduled email exists for ${releaseId} with status=${existingEmail.status}; not overwriting`);
      emailId = existingEmail.id;
    } else {
      const { data, error } = await s.from("scheduled_emails").update(scheduledEmailRow).eq("id", existingEmail.id).select().single();
      if (error) { console.error("scheduled_emails update failed:", error.message); process.exit(1); }
      emailId = data.id;
      console.log(`scheduled_emails updated: ${emailId}`);
    }
  } else {
    const { data, error } = await s.from("scheduled_emails").insert(scheduledEmailRow).select().single();
    if (error) { console.error("scheduled_emails insert failed:", error.message); process.exit(1); }
    emailId = data.id;
    console.log(`scheduled_emails inserted: ${emailId}`);
  }

  console.log(JSON.stringify({
    release_id: releaseId,
    portal_row_id: portalId,
    scheduled_email_id: emailId,
    publish_at: publishAt,
    bcc,
    from: "MMT Premium <premium@missionmeetstech.com>",
    reply_to: "mary@missionmeetstech.com",
  }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
