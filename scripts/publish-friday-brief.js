#!/usr/bin/env node
// ============================================================
// publish-friday-brief.js
//
// Inserts the scheduled_emails + premium_deliverables rows that drive the
// Friday-brief pipeline. Mirrors the Capture Corner publish pattern
// — no new scheduled function; the existing scheduled-portal-publisher
// flips premium_deliverables.published=true and the hardened
// scheduled-email-worker dispatches scheduled_emails rows.
//
// Usage:
//   node scripts/publish-friday-brief.js                         # most recent Friday in America/New_York
//   node scripts/publish-friday-brief.js --date 2026-05-01        # explicit Friday
//   node scripts/publish-friday-brief.js --date 2026-04-26 --force-date  # non-Friday (test only)
//   node scripts/publish-friday-brief.js --dry-run                # plan + audience count, no writes
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  (required)
//
// Idempotent: a partial-unique index on (target_date) WHERE stream='friday_brief'
// prevents double-insert. Re-running is a safe no-op.
// ============================================================

const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const {
  loadFridayBrief,
  renderBriefEmailHtml,
  renderBriefTextBody,
} = require("../netlify/functions/lib/friday-brief-loader");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const FROM_ADDRESS = "Mission Meets Tech <noreply@missionmeetstech.com>";
const REPLY_TO = "mary@missionmeetstech.com";
const ADMIN_BCC_EMAILS = process.env.ADMIN_BCC_EMAILS || "";

// Fri 08:00 ET is the send target (= 12:00 UTC during DST, 13:00 UTC during EST).
// We pick UTC offset based on the date. Simpler than a tz library for this use.
const DEFAULT_SEND_HOUR_ET = 8;

function parseArgs(argv) {
  const args = { dryRun: false, forceDate: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force-date") args.forceDate = true;
    else if (a === "--date") args.date = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/publish-friday-brief.js [--date YYYY-MM-DD] [--force-date] [--dry-run]"
      );
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return args;
}

// Compute the most recent Friday in America/New_York (intl-locale aware).
function mostRecentFridayET() {
  const nowUtc = new Date();
  // Convert to ET using Intl.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(nowUtc);
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const etDate = new Date(`${partMap.year}-${partMap.month}-${partMap.day}T12:00:00Z`);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const etWeekday = weekdayMap[partMap.weekday];
  const daysSinceFriday = (etWeekday + 2) % 7; // Fri=5 → 0, Sat=6 → 1, Sun=0 → 2...
  const fri = new Date(etDate.getTime());
  fri.setUTCDate(etDate.getUTCDate() - daysSinceFriday);
  return fri.toISOString().slice(0, 10);
}

function isFridayET(dateStr) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(`${dateStr}T12:00:00Z`));
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  return weekday === "Fri";
}

// Compute Fri 08:00 ET → UTC ISO for scheduled_at (send trigger time).
function sendAtUtcFromEtDate(dateStr) {
  // Use Intl to figure out the ET offset at 08:00 local on that date.
  const local = new Date(`${dateStr}T${String(DEFAULT_SEND_HOUR_ET).padStart(2, "0")}:00:00`);
  // America/New_York is UTC-5 (EST) or UTC-4 (EDT). Use DateTimeFormat to
  // extract the offset for the target date.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(new Date(`${dateStr}T12:00:00Z`));
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "GMT-5";
  const m = tzPart.match(/GMT([+-]\d+)/);
  const offsetHours = m ? parseInt(m[1], 10) : -5;
  // Construct the UTC moment: local time minus offset.
  const utcMs = Date.UTC(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    DEFAULT_SEND_HOUR_ET - offsetHours,
    0,
    0
  );
  return new Date(utcMs).toISOString();
}

// Publish_at for the portal row: 5 minutes before email send.
function publishAtUtcFromEtDate(dateStr) {
  const sendIso = sendAtUtcFromEtDate(dateStr);
  return new Date(new Date(sendIso).getTime() - 5 * 60 * 1000).toISOString();
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

async function audienceCount(supabase) {
  // Same union as the worker's premium_brief_audience selector.
  const [{ data: prem, error: ep }, { data: admin, error: ea }] = await Promise.all([
    supabase
      .from("mp_users")
      .select("email")
      .eq("subscription_tier", "premium")
      .eq("subscription_status", "active"),
    supabase.from("mp_users").select("email").in("tier", ["admin", "paid"]),
  ]);
  if (ep) throw ep;
  if (ea) throw ea;
  const seen = new Set();
  for (const u of [...(prem || []), ...(admin || [])]) {
    const k = (u.email || "").toLowerCase();
    if (k) seen.add(k);
  }
  return seen.size;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY");
  }
  const args = parseArgs(process.argv);
  const targetDate = args.date || mostRecentFridayET();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error(`bad --date ${targetDate}; expected YYYY-MM-DD`);
  }

  if (!isFridayET(targetDate) && !args.forceDate) {
    throw new Error(
      `${targetDate} is not a Friday in America/New_York. Re-run with --force-date to override (out-of-band test).`
    );
  }

  const brief = loadFridayBrief(targetDate);
  if (!brief) {
    console.error(
      `[BRIEF_NO_CONTENT] content/friday-briefs/${targetDate}.md not found. Nothing to publish.`
    );
    process.exit(1);
  }

  const html = renderBriefEmailHtml(brief, { isFoundingVariant: false });
  const foundingHtml = brief.founding_variant
    ? renderBriefEmailHtml(brief, { isFoundingVariant: true })
    : null;
  const textBody = renderBriefTextBody(brief, { isFoundingVariant: false });

  const scheduledAtIso = sendAtUtcFromEtDate(targetDate);
  const publishAtIso = publishAtUtcFromEtDate(targetDate);

  const bcc = dedupBccCaseInsensitive([
    "mary@missionmeetstech.com",
    ...ADMIN_BCC_EMAILS.split(",").map((s) => s.trim()).filter(Boolean),
  ]);

  const displayDate = new Date(targetDate + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const subject = `MMT Friday Brief — ${displayDate}: ${brief.frontmatter.title}`;
  const slug = `/premium/friday-briefs/${targetDate}.html`;
  const releaseId = `friday_brief_${targetDate}`;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const audience = await audienceCount(supabase);

  console.log("== Friday Brief publish plan ==");
  console.log(`  target_date:      ${targetDate}${args.forceDate ? " (forced)" : ""}`);
  console.log(`  title:            ${brief.frontmatter.title}`);
  console.log(`  summary:          ${brief.frontmatter.summary}`);
  console.log(`  scheduled_at:     ${scheduledAtIso}  (Fri 08:00 ET)`);
  console.log(`  publish_at:       ${publishAtIso}    (portal row; -5min)`);
  console.log(`  release_id:       ${releaseId}`);
  console.log(`  slug:             ${slug}`);
  console.log(`  from:             ${FROM_ADDRESS}`);
  console.log(`  reply_to:         ${REPLY_TO}`);
  console.log(`  bcc:              ${JSON.stringify(bcc)}`);
  console.log(`  audience:         ${audience} recipients (premium_active ∪ admin/paid)`);
  console.log(`  html size:        ${html.length} chars`);
  console.log(`  founding variant: ${foundingHtml ? foundingHtml.length + " chars" : "none"}`);
  console.log(`  text body:        ${textBody.length} chars`);

  if (args.dryRun) {
    console.log(
      `\n[DRY-RUN] would insert 1 scheduled_emails row, 1 premium_deliverables row, audience=${audience} recipients`
    );
    return;
  }

  // Idempotency check — partial unique index enforces at the DB level, but
  // we check here for a cleaner error message.
  const { data: existing, error: existingErr } = await supabase
    .from("scheduled_emails")
    .select("id, status, scheduled_at")
    .eq("stream", "friday_brief")
    .eq("target_date", targetDate)
    .limit(1);
  if (existingErr) throw existingErr;
  if (existing && existing.length > 0) {
    console.log(
      `[idempotent-skip] scheduled_emails row already exists for ${targetDate}: id=${existing[0].id} status=${existing[0].status}`
    );
    return;
  }

  const { data: emailRow, error: insErr } = await supabase
    .from("scheduled_emails")
    .insert({
      release_id: releaseId,
      stream: "friday_brief",
      target_date: targetDate,
      subject,
      from_address: FROM_ADDRESS,
      reply_to: REPLY_TO,
      bcc,
      html,
      founding_variant_html: foundingHtml,
      text_body: textBody,
      recipient_query: "premium_brief_audience",
      scheduled_at: scheduledAtIso,
      status: "queued",
      attempts: 0,
    })
    .select()
    .single();
  if (insErr) throw insErr;

  // Portal row — mirrors Capture Corner pattern so the existing
  // scheduled-portal-publisher flips published=true at publish_at.
  const { error: portalErr } = await supabase.from("premium_deliverables").insert({
    release_id: releaseId,
    slug,
    title: brief.frontmatter.title,
    body_markdown: brief.body,
    source_file: `content/friday-briefs/${targetDate}.md`,
    publish_at: publishAtIso,
    published: false,
    email_subject: subject,
    preheader: brief.frontmatter.summary,
    is_capture_corner_release: false,
  });
  if (portalErr) {
    console.warn(`[warn] premium_deliverables insert failed: ${portalErr.message}`);
    console.warn("       scheduled_emails row was inserted; portal row missing.");
  }

  console.log(`\n[inserted] scheduled_emails.id=${emailRow.id}`);
  console.log(`[inserted] premium_deliverables for ${releaseId}`);
  console.log(`Worker will process on its next 5-min cycle at or after ${scheduledAtIso}.`);
}

main().catch((err) => {
  console.error(`\n[fatal] ${err.message || err}`);
  process.exit(1);
});
