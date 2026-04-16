// dashboard-auth.js — Magic link login, session management, user admin
//
// POST: request_link, verify, logout, add_user, remove_user
// GET:  ?action=validate, ?action=users
// Auth: Session tokens (bcrypt-hashed), backward-compat with COMMAND_CENTER_KEY

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "Content-Type": "application/json",
};

function ok(body) {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(body) };
}
function err(code, msg) {
  return { statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const ip = event.headers["x-forwarded-for"] || event.headers["client-ip"] || "unknown";
  const ua = event.headers["user-agent"] || "unknown";

  // ─── GET: validate session or list users ───
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};

    if (params.action === "validate") {
      const token = params.token || (event.headers.authorization || "").replace("Bearer ", "");
      if (!token) return err(401, "No token");

      const { data: sessions } = await supabase
        .from("dashboard_sessions")
        .select("id, email, user_id, expires_at, token_hash")
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString());

      if (!sessions || sessions.length === 0) return err(401, "No valid sessions");

      for (const session of sessions) {
        const match = await bcrypt.compare(token, session.token_hash);
        if (match) {
          const { data: user } = await supabase
            .from("dashboard_users")
            .select("id, email, name, role, default_view")
            .eq("id", session.user_id)
            .eq("is_active", true)
            .single();

          if (!user) return err(401, "User inactive");

          return ok({
            authenticated: true,
            user: { id: user.id, email: user.email, name: user.name, role: user.role, defaultView: user.default_view },
            expiresAt: session.expires_at,
          });
        }
      }
      return err(401, "Invalid token");
    }

    if (params.action === "users") {
      const token = (event.headers.authorization || "").replace("Bearer ", "");
      const isAgent = token === process.env.COMMAND_CENTER_KEY;
      if (!isAgent) {
        const authed = await validateHumanToken(token, supabase);
        if (!authed) return err(401, "Unauthorized");
      }

      const { data: users } = await supabase
        .from("dashboard_users")
        .select("id, email, name, role, is_active, last_login_at, login_count, created_at")
        .order("created_at");
      return ok({ users: users || [] });
    }

    return err(400, "Unknown action");
  }

  // ─── POST: login flow + user management ───
  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body || "{}");

    // ─── REQUEST MAGIC LINK ───
    if (body.action === "request_link") {
      const email = (body.email || "").toLowerCase().trim();
      if (!email) return err(400, "Email required");

      const { data: user } = await supabase
        .from("dashboard_users")
        .select("id, name, is_active")
        .eq("email", email)
        .single();

      await supabase.from("dashboard_audit_log").insert({ email, action: "login_request", ip_address: ip, user_agent: ua });

      if (!user || !user.is_active) {
        return ok({ message: "If that email has access, a login link has been sent." });
      }

      // Rate limit: max 5 per hour
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { count } = await supabase
        .from("dashboard_magic_links")
        .select("*", { count: "exact", head: true })
        .eq("email", email)
        .gt("created_at", oneHourAgo);

      if (count >= 5) {
        return ok({ message: "If that email has access, a login link has been sent." });
      }

      // Generate magic link
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = await bcrypt.hash(rawToken, 10);
      const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();

      await supabase.from("dashboard_magic_links").insert({ email, token_hash: tokenHash, expires_at: expiresAt });

      // Send email via Resend (fetch-based, no SDK)
      try {
        const loginUrl = `https://missionmeetstech.com/command-center.html?auth=${rawToken}&email=${encodeURIComponent(email)}`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Mission Meets Tech <ops@missionmeetstech.com>",
            to: email,
            subject: "Your Command Center Login Link",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
                <div style="background: #0A192F; padding: 24px; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; color: #FFFFFF; font-size: 18px; letter-spacing: 0.5px;">Mission Meets Tech</h1>
                  <p style="margin: 4px 0 0; color: rgba(255,255,255,0.6); font-size: 13px;">Command Center</p>
                </div>
                <div style="background: #fff; border: 1px solid #e2e8f0; border-top: none; padding: 32px 24px; border-radius: 0 0 8px 8px;">
                  <p style="margin: 0 0 16px; color: #1e293b; font-size: 15px;">Hi ${user.name},</p>
                  <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                    Click below to log into the MMT Command Center. This link expires in 15 minutes.
                  </p>
                  <a href="${loginUrl}" style="display: inline-block; background: #0A192F; color: #FFFFFF; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 14px; text-decoration: none;">
                    Log In
                  </a>
                  <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                    If you didn't request this, ignore this email. The link will expire automatically.
                    <br>IP: ${ip}
                  </p>
                </div>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.error("[dashboard-auth] Email send failed:", emailErr.message);
      }

      return ok({ message: "If that email has access, a login link has been sent." });
    }

    // ─── VERIFY MAGIC LINK → CREATE SESSION ───
    if (body.action === "verify") {
      const { token, email: rawEmail } = body;
      const email = (rawEmail || "").toLowerCase().trim();
      if (!token || !email) return err(400, "Token and email required");

      const { data: links } = await supabase
        .from("dashboard_magic_links")
        .select("id, token_hash, expires_at")
        .eq("email", email)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(10);

      if (!links || links.length === 0) {
        await supabase.from("dashboard_audit_log").insert({ email, action: "login_failed", ip_address: ip, user_agent: ua, metadata: { reason: "no_valid_links" } });
        return err(401, "Invalid or expired login link. Request a new one.");
      }

      let matchedLink = null;
      for (const link of links) {
        if (await bcrypt.compare(token, link.token_hash)) {
          matchedLink = link;
          break;
        }
      }

      if (!matchedLink) {
        await supabase.from("dashboard_audit_log").insert({ email, action: "login_failed", ip_address: ip, user_agent: ua, metadata: { reason: "token_mismatch" } });
        return err(401, "Invalid or expired login link. Request a new one.");
      }

      // Mark link as used
      await supabase.from("dashboard_magic_links").update({ used: true, used_at: new Date().toISOString() }).eq("id", matchedLink.id);

      // Get user
      const { data: user } = await supabase
        .from("dashboard_users")
        .select("id, email, name, role, is_active, default_view, login_count")
        .eq("email", email)
        .eq("is_active", true)
        .single();

      if (!user) {
        await supabase.from("dashboard_audit_log").insert({ email, action: "login_failed", ip_address: ip, user_agent: ua, metadata: { reason: "user_inactive" } });
        return err(401, "Account not active");
      }

      // Create session (30 days)
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const sessionHash = await bcrypt.hash(sessionToken, 10);
      const sessionExpiry = new Date(Date.now() + 30 * 24 * 3600000).toISOString();

      await supabase.from("dashboard_sessions").insert({
        user_id: user.id,
        email,
        token_hash: sessionHash,
        expires_at: sessionExpiry,
        ip_address: ip,
        user_agent: ua,
      });

      // Update user login stats
      await supabase
        .from("dashboard_users")
        .update({
          last_login_at: new Date().toISOString(),
          login_count: (user.login_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      await supabase.from("dashboard_audit_log").insert({ email, action: "login_success", ip_address: ip, user_agent: ua });

      return ok({
        authenticated: true,
        token: sessionToken,
        expiresAt: sessionExpiry,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, defaultView: user.default_view },
      });
    }

    // ─── LOGOUT ───
    if (body.action === "logout") {
      const token = body.token || (event.headers.authorization || "").replace("Bearer ", "");
      if (token) {
        const { data: sessions } = await supabase
          .from("dashboard_sessions")
          .select("id, email, token_hash")
          .eq("is_valid", true);

        for (const session of sessions || []) {
          if (await bcrypt.compare(token, session.token_hash)) {
            await supabase
              .from("dashboard_sessions")
              .update({ is_valid: false, revoked_at: new Date().toISOString(), revoked_reason: "user_logout" })
              .eq("id", session.id);

            await supabase.from("dashboard_audit_log").insert({ email: session.email, action: "logout", ip_address: ip, user_agent: ua });
            break;
          }
        }
      }
      return ok({ message: "Logged out" });
    }

    // ─── ADD USER (admin only) ───
    if (body.action === "add_user") {
      const callerToken = (event.headers.authorization || "").replace("Bearer ", "");
      const isAgent = callerToken === process.env.COMMAND_CENTER_KEY;

      if (!isAgent) {
        const callerId = await validateHumanToken(callerToken, supabase);
        if (!callerId) return err(401, "Unauthorized");

        const { data: caller } = await supabase.from("dashboard_users").select("role").eq("id", callerId).single();
        if (caller?.role !== "admin") return err(403, "Admin required");
      }

      const { email: newEmail, name: newName, role: newRole } = body;
      if (!newEmail || !newName) return err(400, "Email and name required");

      const { data, error } = await supabase
        .from("dashboard_users")
        .insert({ email: newEmail.toLowerCase().trim(), name: newName, role: newRole || "admin" })
        .select("id, email, name, role")
        .single();

      if (error) {
        if (error.message?.includes("duplicate")) return err(409, "User already exists");
        return err(500, error.message);
      }

      return ok({ user: data, message: `User ${newName} added. They can now log in with their email.` });
    }

    // ─── REMOVE USER ───
    if (body.action === "remove_user") {
      const callerToken = (event.headers.authorization || "").replace("Bearer ", "");
      const isAgent = callerToken === process.env.COMMAND_CENTER_KEY;
      if (!isAgent) return err(401, "Agent auth required for user removal");

      const { email: removeEmail } = body;
      if (!removeEmail) return err(400, "Email required");

      await supabase.from("dashboard_users").update({ is_active: false, updated_at: new Date().toISOString() }).eq("email", removeEmail.toLowerCase().trim());
      await supabase.from("dashboard_sessions").update({ is_valid: false, revoked_at: new Date().toISOString(), revoked_reason: "user_removed" }).eq("email", removeEmail.toLowerCase().trim());

      return ok({ message: `User ${removeEmail} deactivated` });
    }

    return err(400, "Unknown action");
  }

  return err(405, "Method not allowed");
};

// Helper: validate a human session token, returns user_id or null
async function validateHumanToken(token, supabase) {
  if (!token) return null;
  try {
    const { data: sessions } = await supabase
      .from("dashboard_sessions")
      .select("user_id, token_hash")
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString());

    for (const s of sessions || []) {
      if (await bcrypt.compare(token, s.token_hash)) return s.user_id;
    }
  } catch (e) {
    console.error("[dashboard-auth] validate error:", e.message);
  }
  return null;
}
