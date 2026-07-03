// ============================================================
// capture-corner-autosend.js — Netlify Scheduled Function (daily).
//
// Emails each Capture Corner to active premium subscribers ON ITS OWN DATE.
// Fixes the gap that stranded the 2026-07-03 issue: premium-brief-send only
// reads content/friday-brief/*.md and only runs Friday, so twice-weekly
// premium/briefs/capture-corner-YYYY-MM-DD.html issues (Tue AND Fri) were never
// emailed by a cron. This runs daily and sends only today's Capture Corner.
//
// Publish path stays: stage-newsletter.js drops premium/briefs/
// capture-corner-<date>.html (date-gated by build.js). Once that page is live,
// this cron emails it on <date>.
//
// Schedule (netlify.toml): "0 13 * * *" (13:00 UTC / ~9 AM ET) — after the
// 00:00 UTC date-gate opens and the 4-hourly rebuild-trigger publishes.
// Guards: date-scoped (only today's issue), idempotent (ops_events
// capture_corner_sent by details.date), kill switch CAPTURE_CORNER_AUTOSEND_DISABLED.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { buildFridayBriefEmail } = require("./lib/premium-brief-templates");

const SITE_URL = "https://missionmeetstech.com";
const ADMIN_EMAIL = "mary@missionmeetstech.com";
const EVENT = "capture_corner_sent";
const TZ = "America/New_York";

function todayET() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

// The Capture Corner's premium body is client-gated (CSS/JS), so it is present
// in the served HTML. Pull the brief-body inner content (through the deep-dive
// card) — matches the premium/briefs/capture-corner template shape.
function extractBody(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1 ? h1[1].replace(/<[^>]+>/g, "").trim() : "Capture Corner";
  const sub = html.match(/<h1[\s\S]*?<\/h1>\s*<p[^>]*><em>([\s\S]*?)<\/em><\/p>/);
  const subtitle = sub ? sub[1].replace(/<[^>]+>/g, "").trim() : "";
  const mark = 'class="brief-body">';
  const oi = html.indexOf(mark);
  if (oi === -1) return { title, subtitle, body: "" };
  const start = oi + mark.length;
  const mainIdx = html.indexOf("</main>", start);
  const close = html.lastIndexOf("</div>", mainIdx);
  return { title, subtitle, body: html.slice(start, close).trim() };
}

exports.handler = async () => {
  const date = todayET();
  const checkedAt = new Date().toISOString();

  if (String(process.env.CAPTURE_CORNER_AUTOSEND_DISABLED || "").toLowerCase() === "true") {
    return { statusCode: 200, body: JSON.stringify({ skipped: "kill_switch", date }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Already sent today's issue? (recognizes both this fn and any manual send)
  const { data: already } = await supabase
    .from("ops_events").select("id")
    .eq("event_type", EVENT).filter("details->>date", "eq", date).limit(1).maybeSingle();
  if (already) return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent", date }) };

  // Is there a Capture Corner published for today?
  const url = `${SITE_URL}/premium/briefs/capture-corner-${date}.html`;
  let res;
  try { res = await fetch(url); } catch (e) { return { statusCode: 200, body: JSON.stringify({ skipped: "fetch_error", date, error: e.message }) }; }
  if (!res.ok) return { statusCode: 200, body: JSON.stringify({ noop: "no_capture_corner_today", date, status: res.status }) };
  const html = await res.text();
  const { title, subtitle, body } = extractBody(html);
  if (!body || body.length < 500) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "body_too_short", date, len: (body || "").length }) };
  }

  // Active premium subscribers (every paid tier) + admin/paid.
  const { data: subs, error: subErr } = await supabase
    .from("mp_users").select("email, subscription_tier, subscription_status")
    .in("subscription_tier", ["premium", "mmt_premium_founding", "institutional"])
    .in("subscription_status", ["active", "trialing"]);
  if (subErr) return { statusCode: 500, body: JSON.stringify({ error: "subscriber_query_failed", detail: subErr.message }) };
  const { data: adminU } = await supabase.from("mp_users").select("email").in("tier", ["admin", "paid"]);
  const seen = new Set();
  const recipients = [...(subs || []), ...(adminU || [])].filter((u) => {
    if (!u.email) return false; const e = u.email.toLowerCase(); if (seen.has(e)) return false; seen.add(e); return true;
  });
  if (recipients.length === 0) return { statusCode: 200, body: JSON.stringify({ skipped: "no_subscribers", date }) };

  const displayDate = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const emailHtml = buildFridayBriefEmail({ title, subtitle, briefBodyHtml: body, briefDate: displayDate });
  const subject = `Capture Corner: ${title.replace(/\.$/, "")}`;

  let sent = 0, failed = 0;
  const errors = [];
  for (const r of recipients) {
    try {
      const out = await sendEmail({ to: r.email, subject, html: emailHtml, from: "Mary Womack <mary@missionmeetstech.com>", adminCopy: true });
      if (out && out.success) sent++; else { failed++; errors.push({ email: r.email, error: out && out.error }); }
    } catch (e) { failed++; errors.push({ email: r.email, error: e.message }); }
    await new Promise((res2) => setTimeout(res2, 220)); // ~4.5 rps, under Resend's cap
  }

  await supabase.from("ops_events").insert({
    event_type: EVENT, source_function: "capture-corner-autosend",
    details: { date, title, sent, failed, eligible: recipients.length, checked_at: checkedAt },
  });
  try {
    await sendEmail({ to: ADMIN_EMAIL, subject: `[Premium] Capture Corner sent — ${sent}/${recipients.length} (${date})`,
      html: `<p>Capture Corner "${title}" emailed to premium subscribers.</p><p>Sent ${sent}, failed ${failed}, eligible ${recipients.length}.</p>`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>" });
  } catch { /* best-effort */ }

  return { statusCode: 200, body: JSON.stringify({ date, title, sent, failed, eligible: recipients.length }) };
};
