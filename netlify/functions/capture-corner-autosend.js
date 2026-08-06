// ============================================================
// capture-corner-autosend.js — Netlify Scheduled Function (daily).
//
// Emails each Capture Corner to active premium subscribers ON ITS OWN DATE.
// Fixes the gap that stranded the 2026-07-03 issue: premium-brief-send only
// reads content/friday-brief/*.md and only runs Friday, so twice-weekly
// premium/briefs/capture-corner-YYYY-MM-DD.html issues (Tue AND Fri) were never
// emailed by a cron. This runs daily and sends only today's Capture Corner.
//
// The email is a PREVIEW, not the whole brief (Mary's standing rule,
// 2026-08-06): send the lead-in portion of the Capture Corner, then point
// subscribers to the full version behind the paywall. The gated page stays the
// canonical home; the email drives the click. See previewFromBody() below.
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

// Build the PREVIEW that actually goes in the email: the lead-in portion of the
// brief plus a CTA to the full version behind the paywall. Never email the whole
// Capture Corner (Mary's standing rule 2026-08-06). Cut at the second <h2>
// section boundary (intro + first section), or at a ~1600-char paragraph
// boundary when the brief has fewer than two sections. Cutting before the second
// <h2> also drops the deep-dive upsell card, which belongs on the page, not in
// the preview.
function previewFromBody(bodyHtml, fullUrl) {
  const h2s = [];
  const re = /<h2[ >]/gi;
  let mm;
  while ((mm = re.exec(bodyHtml))) h2s.push(mm.index);
  let excerpt;
  if (h2s.length >= 2) {
    excerpt = bodyHtml.slice(0, h2s[1]);
  } else {
    const cap = 1600;
    if (bodyHtml.length <= cap) {
      excerpt = bodyHtml;
    } else {
      const cut = bodyHtml.lastIndexOf("</p>", cap);
      excerpt = bodyHtml.slice(0, cut > 0 ? cut + 4 : cap);
    }
  }
  const cta =
    '<div style="background:#FEF9E7;border:1px solid rgba(146,113,10,0.28);border-radius:10px;padding:20px 22px;margin:28px 0 6px;text-align:center;">' +
    '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#92710A;margin-bottom:8px;">Premium Capture Corner</div>' +
    '<p style="font-size:14px;color:#314155;line-height:1.6;margin:0 0 14px;">This is a preview. The full Capture Corner, with the complete breakdown and every action window, is on the site.</p>' +
    '<a href="' + fullUrl + '" style="display:inline-block;background:#0A192F;color:#FFFFFF;font-weight:700;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:8px;">Read the full Capture Corner &rarr;</a>' +
    "</div>";
  return excerpt + cta;
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
  const preview = previewFromBody(body, url); // `url` is the paywalled full brief page
  const emailHtml = buildFridayBriefEmail({ title, subtitle, briefBodyHtml: preview, briefDate: displayDate });
  const subject = `Capture Corner: ${title.replace(/\.$/, "")}`;

  // CLAIM idempotency BEFORE the send loop. Netlify scheduled functions are
  // at-least-once and can double-fire ~15s apart. The early check above reads
  // this marker, but the old code wrote it AFTER the loop, so two overlapping
  // invocations each sent all recipients (the 2026-07-07 storm: 2 runs x 54).
  // Write the marker first, then a deterministic guard: if more than one claim
  // exists for today, only the earliest-created one proceeds.
  const { data: claim, error: claimErr } = await supabase.from("ops_events").insert({
    event_type: EVENT, source_function: "capture-corner-autosend",
    details: { date, title, status: "sending", eligible: recipients.length, checked_at: checkedAt },
  }).select("id").single();
  if (claimErr || !claim) return { statusCode: 200, body: JSON.stringify({ skipped: "claim_failed", date, error: claimErr && claimErr.message }) };
  const { data: claims } = await supabase.from("ops_events").select("id, created_at")
    .eq("event_type", EVENT).filter("details->>date", "eq", date)
    .order("created_at", { ascending: true });
  if (claims && claims.length > 1 && claims[0].id !== claim.id) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "lost_claim_race", date, claim_id: claim.id }) };
  }

  let sent = 0, failed = 0;
  const errors = [];
  for (const r of recipients) {
    try {
      // No adminCopy: this is a bulk send. Copying the admin on every recipient
      // gave Mary one inbox copy per subscriber (54x). The summary email below
      // is the admin's single point of visibility.
      const out = await sendEmail({ to: r.email, subject, html: emailHtml, from: "Mary Womack <mary@missionmeetstech.com>" });
      if (out && out.success) sent++; else { failed++; errors.push({ email: r.email, error: out && out.error }); }
    } catch (e) { failed++; errors.push({ email: r.email, error: e.message }); }
    await new Promise((res2) => setTimeout(res2, 220)); // ~4.5 rps, under Resend's cap
  }

  // Finalize the claimed marker with the actual counts.
  await supabase.from("ops_events").update({
    details: { date, title, status: "sent", sent, failed, eligible: recipients.length, checked_at: checkedAt },
  }).eq("id", claim.id);
  try {
    await sendEmail({ to: ADMIN_EMAIL, subject: `[Premium] Capture Corner sent — ${sent}/${recipients.length} (${date})`,
      html: `<p>Capture Corner "${title}" emailed to premium subscribers.</p><p>Sent ${sent}, failed ${failed}, eligible ${recipients.length}.</p>`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>" });
  } catch { /* best-effort */ }

  return { statusCode: 200, body: JSON.stringify({ date, title, sent, failed, eligible: recipients.length }) };
};
