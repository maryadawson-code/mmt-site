// ============================================================
// member-email-change.js — self-serve email address change.
//
//   POST { token, action: "request", new_email }
//        → emails a confirmation link to the NEW address,
//          and a heads-up notice to the OLD address.
//   GET  ?action=confirm&ct=<one-time token>
//        → applies the change and returns a small HTML page.
//
// SECURITY MODEL
//   1. The requester must hold a valid HMAC subscriber token. The CURRENT
//      email is DERIVED from that token — an email in the body is ignored.
//      (Same IDOR-closing pattern as member-preferences.js.)
//   2. The change is confirmed by clicking a link sent to the NEW address.
//      That proves the requester controls the destination, so a stolen
//      session alone cannot walk a paid account to an attacker's inbox.
//   3. The OLD address is notified on request, so a hijack is visible to
//      the real owner while the link is still unconfirmed.
//   4. The one-time token is stored HASHED (sha256), expires in 60 minutes,
//      and is single-use.
//
// STORAGE
//   Pending requests live in `ops_events` rather than a new table, so the
//   feature works the moment it deploys. A gated migration would have left
//   this inert — the same false-green shape as the 2026-08-20
//   `opportunity_radar.status` outage, where code referenced a column no
//   migration ever created.
//
//   event_type "email_change_requested" — details: { from, to, token_hash, expires_at }
//   event_type "email_change_confirmed" — details: { from, to, token_hash }
// ============================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const { verifySubscriberToken } = require("./lib/subscriber-token");
const { sendEmail } = require("./lib/send-email");
const { migrateMemberEmail, normalizeEmail, isValidEmail } = require("./lib/email-migration");

const SITE = "https://missionmeetstech.com";
const TTL_MS = 60 * 60 * 1000;       // 60 minutes
const MAX_REQUESTS_PER_HOUR = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, obj) {
  return { statusCode, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

function hashToken(t) {
  return crypto.createHash("sha256").update(t).digest("hex");
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// --- Email bodies (MMT voice + canonical palette) ---------------------

function confirmEmailHtml(oldEmail, newEmail, link) {
  return `<div style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0A192F;line-height:1.6;">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#457B9D;font-weight:700;margin:0 0 18px;">MMT Premium</p>
  <h1 style="font-size:24px;margin:0 0 16px;">Confirm your new email</h1>
  <p style="font-size:15px;margin:0 0 16px;">You asked to move your MMT Premium account from <strong>${esc(oldEmail)}</strong> to this address. Click below and the move is done.</p>
  <p style="margin:28px 0;"><a href="${esc(link)}" style="background:#0A192F;color:#fff;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">Confirm this email address</a></p>
  <p style="font-size:14px;margin:0 0 16px;">Your subscription, your founding-member price, and everything you have saved come with you. Nothing about your billing changes.</p>
  <p style="font-size:13px;color:#5A6B7F;margin:0 0 8px;">This link expires in one hour and works once.</p>
  <p style="font-size:13px;color:#5A6B7F;margin:0 0 24px;">If you did not ask for this, ignore this email and nothing happens. The account stays where it is.</p>
  <p style="font-size:13px;color:#5A6B7F;margin:0;">If the button does not work, paste this into your browser:<br><span style="word-break:break-all;color:#457B9D;">${esc(link)}</span></p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 14px;">
  <p style="font-size:12px;color:#5A6B7F;margin:0;">Mission Meets Tech LLC &middot; Federal Health IT Intelligence</p>
</div>`;
}

function noticeEmailHtml(oldEmail, newEmail) {
  return `<div style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0A192F;line-height:1.6;">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#457B9D;font-weight:700;margin:0 0 18px;">MMT Premium</p>
  <h1 style="font-size:24px;margin:0 0 16px;">Someone asked to move this account</h1>
  <p style="font-size:15px;margin:0 0 16px;">A request came in to move your MMT Premium account from <strong>${esc(oldEmail)}</strong> to <strong>${esc(newEmail)}</strong>.</p>
  <p style="font-size:15px;margin:0 0 16px;">If that was you, open the confirmation email we just sent to the new address. Nothing moves until you click the link there.</p>
  <p style="font-size:15px;margin:0 0 16px;"><strong>If that was not you, reply to this email right now.</strong> The request expires on its own in an hour, and your account does not move unless someone can open the new inbox.</p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:28px 0 14px;">
  <p style="font-size:12px;color:#5A6B7F;margin:0;">Mission Meets Tech LLC &middot; Federal Health IT Intelligence</p>
</div>`;
}

function page(title, body, ok = true) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Mission Meets Tech</title>
<style>
 body{margin:0;background:#F3F4F6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0A192F;line-height:1.6;}
 .card{max-width:520px;margin:12vh auto;background:#fff;border-radius:14px;padding:40px 36px;box-shadow:0 1px 3px rgba(10,25,47,.08);}
 h1{font-size:24px;margin:0 0 14px;}
 p{font-size:15px;margin:0 0 14px;}
 .tag{font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${ok ? "#457B9D" : "#E63946"};margin:0 0 18px;}
 a.btn{display:inline-block;background:#0A192F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin-top:10px;}
</style></head><body><div class="card">
<p class="tag">MMT Premium</p><h1>${esc(title)}</h1>${body}
</div></body></html>`,
  };
}

// ----------------------------------------------------------------------

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY, BUTTONDOWN_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(500, { error: "not_configured", message: "Service not configured." });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ============ CONFIRM (link click from the new inbox) ============
  const qs = event.queryStringParameters || {};
  const isConfirm =
    (event.httpMethod === "GET" && qs.action === "confirm") ||
    (event.httpMethod === "POST" && (() => { try { return JSON.parse(event.body || "{}").action === "confirm"; } catch { return false; } })());

  if (isConfirm) {
    let ct = qs.ct;
    if (!ct && event.httpMethod === "POST") {
      try { ct = JSON.parse(event.body || "{}").ct; } catch { /* handled below */ }
    }
    if (!ct || typeof ct !== "string") {
      return page("That link is not valid", "<p>The confirmation link is missing its token. Start the change again from your settings page.</p><a class=\"btn\" href=\"/premium/settings\">Back to settings</a>", false);
    }

    const tokenHash = hashToken(ct);

    const { data: reqRow, error: reqErr } = await supabase
      .from("ops_events")
      .select("id, created_at, details")
      .eq("event_type", "email_change_requested")
      .eq("details->>token_hash", tokenHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reqErr) {
      console.error("member-email-change confirm lookup failed:", reqErr.message);
      return page("Something went wrong", "<p>We could not look up that request. Try again in a minute.</p>", false);
    }
    if (!reqRow) {
      return page("That link is not valid", "<p>This confirmation link does not match a pending request. It may have already been used.</p><a class=\"btn\" href=\"/premium/settings\">Back to settings</a>", false);
    }

    const { from, to, expires_at } = reqRow.details || {};
    if (!from || !to) {
      return page("That link is not valid", "<p>This request is missing its details. Start the change again from your settings page.</p>", false);
    }
    if (!expires_at || Date.now() > Date.parse(expires_at)) {
      return page("That link expired", `<p>Confirmation links are good for one hour. Start the change again from your settings page and we will send a fresh one.</p><a class="btn" href="/premium/settings">Back to settings</a>`, false);
    }

    // Single use.
    const { data: usedRow } = await supabase
      .from("ops_events")
      .select("id")
      .eq("event_type", "email_change_confirmed")
      .eq("details->>token_hash", tokenHash)
      .limit(1)
      .maybeSingle();
    if (usedRow) {
      return page("Already confirmed", `<p>This change was already applied. Your account is at <strong>${esc(to)}</strong>. Sign in with that address.</p><a class="btn" href="/dashboard.html">Go to your dashboard</a>`);
    }

    const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
    const result = await migrateMemberEmail({
      supabase, stripe, buttondownKey: BUTTONDOWN_API_KEY,
      from, to, dryRun: false, actor: "self-serve:member-email-change",
    });

    if (!result.ok && result.error === "source_not_found") {
      return page("This account already moved", `<p>We could not find an account at ${esc(from)} — it looks like this change was already applied. Try signing in with <strong>${esc(to)}</strong>.</p><a class="btn" href="/dashboard.html">Go to your dashboard</a>`);
    }
    if (!result.ok && result.error === "destination_already_has_account") {
      return page("That address already has an account", `<p><strong>${esc(to)}</strong> is already attached to an MMT account, so we did not merge the two. Reply to any MMT email and Mary will sort it out by hand.</p>`, false);
    }
    if (!result.ok) {
      console.error("member-email-change migration failed:", result.error, JSON.stringify(result.steps));
      return page("We could not finish that", "<p>Something failed partway through the change. Nothing is lost — reply to any MMT email and Mary will finish it by hand.</p>", false);
    }

    const { error: confErr } = await supabase.from("ops_events").insert({
      event_type: "email_change_confirmed",
      source_function: "member-email-change",
      user_email: to,
      severity: "info",
      details: { from, to, token_hash: tokenHash, request_event_id: reqRow.id },
    });
    if (confErr) console.error("member-email-change: confirm log failed:", confErr.message);

    return page("Your email is updated", `<p>Your MMT Premium account now lives at <strong>${esc(to)}</strong>. Your subscription, your price, and everything you have saved came with it.</p><p>Sign in with the new address from here on.</p><a class="btn" href="/dashboard.html">Go to your dashboard</a>`);
  }

  // ============ REQUEST ============
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "bad_request", message: "Invalid JSON." }); }

  const auth = verifySubscriberToken(body.token);
  if (!auth.ok) {
    return json(401, { error: "unauthorized", message: "Please sign in again to change your email." });
  }
  const current = auth.email;
  const next = normalizeEmail(body.new_email);

  if (!isValidEmail(next)) {
    return json(400, { error: "invalid_email", message: "That does not look like a valid email address." });
  }
  if (next === current) {
    return json(400, { error: "same_email", message: "That is already the email on your account." });
  }

  // The token proves an entitlement check passed at issue time; re-check the
  // account still exists so we never send a link for a vanished row.
  const { data: srcUser, error: srcErr } = await supabase
    .from("mp_users").select("id").ilike("email", current).maybeSingle();
  if (srcErr) {
    console.error("member-email-change source lookup failed:", srcErr.message);
    return json(500, { error: "internal_error", message: "Something went wrong. Try again." });
  }
  if (!srcUser) {
    return json(404, { error: "no_account", message: "We could not find your account. Sign in again." });
  }

  const { data: dstUser, error: dstErr } = await supabase
    .from("mp_users").select("id").ilike("email", next).maybeSingle();
  if (dstErr) {
    console.error("member-email-change destination lookup failed:", dstErr.message);
    return json(500, { error: "internal_error", message: "Something went wrong. Try again." });
  }
  if (dstUser) {
    return json(409, { error: "destination_exists", message: "That address already has an MMT account. Reply to any MMT email and Mary will merge them by hand." });
  }

  // Rate limit per account.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("ops_events")
    .select("id")
    .eq("event_type", "email_change_requested")
    .eq("user_email", current)
    .gte("created_at", since);
  if ((recent || []).length >= MAX_REQUESTS_PER_HOUR) {
    return json(429, { error: "rate_limited", message: "Too many change requests. Wait an hour and try again." });
  }

  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const { error: insErr } = await supabase.from("ops_events").insert({
    event_type: "email_change_requested",
    source_function: "member-email-change",
    user_email: current,
    severity: "info",
    details: { from: current, to: next, token_hash: tokenHash, expires_at: expiresAt },
  });
  if (insErr) {
    console.error("member-email-change: request insert failed:", insErr.message);
    return json(500, { error: "internal_error", message: "Something went wrong. Try again." });
  }

  const link = `${SITE}/.netlify/functions/member-email-change?action=confirm&ct=${raw}`;

  // sendEmail RETURNS {success:false} on failure — it does not throw.
  const sent = await sendEmail({
    to: next,
    subject: "Confirm your new MMT Premium email address",
    html: confirmEmailHtml(current, next, link),
  });
  if (!sent || !sent.success) {
    console.error("member-email-change: confirmation send failed:", sent && sent.error);
    return json(502, { error: "send_failed", message: "We could not send the confirmation email. Try again in a minute." });
  }

  // Heads-up to the old address. Best effort — the change is already gated
  // on the new inbox, so a failed notice must not fail the request.
  const notice = await sendEmail({
    to: current,
    subject: "Someone asked to move your MMT Premium account",
    html: noticeEmailHtml(current, next),
  });
  if (!notice || !notice.success) {
    console.warn("member-email-change: old-address notice failed:", notice && notice.error);
  }

  return json(200, {
    requested: true,
    message: `Check ${next} for a confirmation link. Your account moves once you click it.`,
  });
};
