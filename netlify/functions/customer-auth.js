// customer-auth.js — Magic link auth for customer portal (/my-reports)
//
// POST { action: "request_link", email } — sends magic link email
// POST { action: "verify", token } — verifies token, returns session
// POST { action: "me",      token } — returns customer profile (Sprint B 2026-05-13)
// POST { action: "orders",  token } — returns customer orders     (Sprint B 2026-05-13)
// POST { action: "pending", token } — returns pending approvals   (Sprint B 2026-05-13)
//
// Legacy GET handlers (?action=me|orders|pending&token=X) are still
// supported for inbound magic-link URLs and any cached front-ends in
// flight, but the my-reports.html page now POSTs the token in the
// JSON body so it no longer appears in server access logs / CDN
// logs / browser history. The token is also never logged by this
// function itself.

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const crypto = require("crypto");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // === GET: session check ===
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    if (params.action === "me" && params.token) {
      const tokenHash = hashToken(params.token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email, expires_at")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid or expired session");

      // Get customer profile
      const { data: profile } = await sb.from("customer_profiles").select("*").eq("email", session.email).single();
      // Get preferences
      const { data: prefs } = await sb.from("customer_preferences").select("*").eq("email", session.email).single();
      return ok({ email: session.email, profile: profile || null, preferences: prefs || null });
    }

    // Get customer orders
    if (params.action === "orders" && params.token) {
      const tokenHash = hashToken(params.token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid or expired session");

      const [mpRes, ppRes] = await Promise.all([
        sb.from("marketpulse_orders").select("*").eq("email", session.email).order("created_at", { ascending: false }).limit(50),
        sb.from("mp_scoring_history").select("*").eq("email", session.email).order("created_at", { ascending: false }).limit(50),
      ]);
      return ok({ marketpulse: mpRes.data || [], proposalpulse: ppRes.data || [] });
    }

    // Get pending approvals for customer
    if (params.action === "pending" && params.token) {
      const tokenHash = hashToken(params.token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid or expired session");

      const { data } = await sb.from("approval_queue")
        .select("*")
        .eq("target_role", "customer")
        .eq("target_email", session.email)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return ok({ approvals: data || [] });
    }

    return err(400, "Unknown action");
  }

  // === POST ===
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    // Sprint B 2026-05-13: POST-with-token-in-body handlers for the
    // three session-bearing reads (me / orders / pending). Moved off
    // the legacy GET shape so tokens stop appearing in server access
    // logs, CDN logs, and browser history. Logic identical to the GET
    // handler above — only the transport changes.
    if (body.action === "me" && body.token) {
      const tokenHash = hashToken(body.token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email, expires_at")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid or expired session");
      const { data: profile } = await sb.from("customer_profiles").select("*").eq("email", session.email).single();
      const { data: prefs } = await sb.from("customer_preferences").select("*").eq("email", session.email).single();
      return ok({ email: session.email, profile: profile || null, preferences: prefs || null });
    }

    if (body.action === "orders" && body.token) {
      const tokenHash = hashToken(body.token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid or expired session");
      const [mpRes, ppRes] = await Promise.all([
        sb.from("marketpulse_orders").select("*").eq("email", session.email).order("created_at", { ascending: false }).limit(50),
        sb.from("mp_scoring_history").select("*").eq("email", session.email).order("created_at", { ascending: false }).limit(50),
      ]);
      return ok({ marketpulse: mpRes.data || [], proposalpulse: ppRes.data || [] });
    }

    if (body.action === "pending" && body.token) {
      const tokenHash = hashToken(body.token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid or expired session");
      const { data } = await sb.from("approval_queue")
        .select("*")
        .eq("target_role", "customer")
        .eq("target_email", session.email)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return ok({ approvals: data || [] });
    }

    if (body.action === "request_link") {
      const { email } = body;
      if (!email) return err(400, "email required");
      const normalizedEmail = email.trim().toLowerCase();

      // Rate limit: max 3 requests per email per hour
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { data: recent } = await sb.from("customer_sessions")
        .select("id")
        .eq("email", normalizedEmail)
        .gte("created_at", oneHourAgo);
      if (recent && recent.length >= 3) {
        return err(429, "Too many login requests. Please try again later.");
      }

      // Check if email exists in customer_profiles or has any orders
      const [profileRes, mpRes, ppRes] = await Promise.all([
        sb.from("customer_profiles").select("id").eq("email", normalizedEmail).limit(1),
        sb.from("marketpulse_orders").select("id").eq("email", normalizedEmail).limit(1),
        sb.from("mp_scoring_history").select("id").eq("email", normalizedEmail).limit(1),
      ]);
      const hasAccount = (profileRes.data?.length > 0) || (mpRes.data?.length > 0) || (ppRes.data?.length > 0);
      if (!hasAccount) {
        // Don't reveal whether account exists — always return success
        return ok({ sent: true });
      }

      // Generate token
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);

      await sb.from("customer_sessions").insert({
        email: normalizedEmail,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
      });

      const portalUrl = `https://missionmeetstech.com/my-reports?token=${token}`;

      await sendEmail({
        to: normalizedEmail,
        subject: "Your Mission Meets Tech login link",
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#0A192F;padding:24px 32px;">
    <span style="color:#FFFFFF;font-size:18px;font-weight:700;">Mission Meets Tech</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 16px;font-size:22px;color:#0A192F;">Sign in to My Reports</h1>
    <p style="margin:0 0 24px;color:#5C6B7A;font-size:15px;line-height:1.6;">Click the button below to access your reports, scorecards, and order history.</p>
    <a href="${portalUrl}" style="display:inline-block;background:#0A192F;color:#FFFFFF;padding:12px 28px;border-radius:6px;font-weight:700;font-size:15px;text-decoration:none;">Sign In</a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">This link expires in 7 days. If you didn't request this, you can ignore it.</p>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">Mission Meets Tech | Federal Health IT Intelligence</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
      });

      return ok({ sent: true });
    }

    if (body.action === "verify") {
      const { token } = body;
      if (!token) return err(400, "token required");
      const tokenHash = hashToken(token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email, expires_at")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid or expired token");
      return ok({ email: session.email, expiresAt: session.expires_at });
    }

    if (body.action === "feedback") {
      const { token, orderId, rating, comment, product } = body;
      if (!token || !orderId || !rating) return err(400, "token, orderId, rating required");
      const tokenHash = hashToken(token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid session");

      // Store feedback in the appropriate orders table
      if (product === "marketpulse") {
        await sb.from("marketpulse_orders").update({ feedback_rating: rating, feedback_comment: comment }).eq("id", orderId).eq("email", session.email);
      } else {
        await sb.from("mp_scoring_history").update({ feedback_rating: rating, feedback_comment: comment }).eq("id", orderId).eq("email", session.email);
      }
      return ok({ saved: true });
    }

    if (body.action === "update_preferences") {
      const { token, preferences } = body;
      if (!token || !preferences) return err(400, "token and preferences required");
      const tokenHash = hashToken(token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid session");

      await sb.from("customer_preferences").upsert({
        email: session.email,
        ...preferences,
      }, { onConflict: "email" });
      return ok({ updated: true });
    }

    if (body.action === "request_rerun") {
      const { token, orderId, reason } = body;
      if (!token || !orderId) return err(400, "token and orderId required");
      const tokenHash = hashToken(token);
      const { data: session } = await sb.from("customer_sessions")
        .select("email")
        .eq("token_hash", tokenHash)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!session) return err(401, "Invalid session");

      // Create approval queue item for COO review
      await sb.from("approval_queue").insert({
        title: "Re-run request from " + session.email,
        category: "rerun-request",
        target_role: "coo",
        target_email: null,
        submitted_by: session.email,
        submitted_by_type: "human",
        payload_type: "data",
        payload: { orderId, reason: reason || "", customerEmail: session.email },
        context: {},
        status: "pending",
        expires_at: new Date(Date.now() + 168 * 3600000).toISOString(),
      });
      return ok({ requested: true });
    }

    return err(400, "Unknown action");
  }

  return err(405, "Method not allowed");
};
