// ============================================================================
// agent-oauth.js — OAuth 2.1 authorization server for the Agent Access MCP
// connector. This is what turns "add a connector" in Claude Desktop / Claude.ai
// into a click-to-connect experience: the client discovers this server, the
// member clicks "Sign in", proves their email via a magic link, approves, and
// the client gets a token. NO pasted token, which is what non-technical
// members need (Claude's connector UI has no token field).
//
// Endpoints (paths preserved through netlify.toml rewrites):
//   GET  /.well-known/oauth-authorization-server  → RFC 8414 metadata (public)
//   POST /oauth/register                          → RFC 7591 DCR (public)
//   GET  /oauth/authorize                         → sign-in / consent (HTML)
//   POST /oauth/authorize                         → signin | approve | deny
//   POST /oauth/token                             → code + refresh grants (JSON)
//
// The issued access_token is a normal api_tokens row (mmt_pat_*), so
// lib/agent-auth validates it unchanged and the member can revoke it from
// /premium/ai-integrations like any other connection.
// ============================================================================

const { createClient } = require("@supabase/supabase-js");
const oauth = require("./lib/oauth-core");
const { generateToken } = require("./lib/agent-tokens");
const { loadEntitlement } = require("./lib/entitlement");
const { computeAgentAccess } = require("./lib/agent-entitlement");
const { sendEmail } = require("./lib/send-email");

const BASE = "https://missionmeetstech.com";
const JSON_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Vary": "Origin",
};

let _db = null;
const db = () => (_db = _db || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY));

const json = (status, body, extra) => ({ statusCode: status, headers: { ...JSON_CORS, "Content-Type": "application/json", "Cache-Control": "no-store", ...(extra || {}) }, body: JSON.stringify(body) });
const html = (status, body) => ({ statusCode: status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, body });
const redirect = (location) => ({ statusCode: 302, headers: { Location: location, "Cache-Control": "no-store" }, body: "" });

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function parseForm(bodyStr) {
  const out = {};
  for (const [k, v] of new URLSearchParams(bodyStr || "")) out[k] = v;
  return out;
}
function parseBody(event) {
  const ct = (event.headers && (event.headers["content-type"] || event.headers["Content-Type"])) || "";
  if (/application\/json/i.test(ct)) { try { return JSON.parse(event.body || "{}"); } catch { return {}; } }
  return parseForm(event.body);
}

// ---- HTML shell (MMT tokens: white / navy / teal / Inter, no dark mode) -----
function page(title, inner) {
  return html(200, `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Mission Meets Tech</title><style>
:root{--navy:#0A192F;--teal:#457B9D;--soft:#F3F4F6;--red:#E63946}
*{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--navy);background:var(--soft);line-height:1.55}
.wrap{max-width:460px;margin:8vh auto;padding:0 20px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px}
.brand{font-weight:700;letter-spacing:-.01em;margin:0 0 4px;font-size:15px;color:var(--teal)}
h1{font-size:22px;line-height:1.25;margin:0 0 14px}
p{margin:0 0 14px;font-size:15px}
label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}
input[type=email]{width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:9px;font-size:15px;font-family:inherit}
.btn{display:inline-block;border:0;border-radius:9px;padding:12px 18px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit}
.btn-primary{background:var(--navy);color:#fff;width:100%}
.btn-ghost{background:#fff;color:var(--navy);border:1px solid #cbd5e1}
.row{display:flex;gap:10px;margin-top:8px}.row form{flex:1}
.scopes{background:var(--soft);border-radius:9px;padding:14px 16px;margin:0 0 18px}
.scopes li{font-size:14px;margin:4px 0}.scopes b{color:var(--navy)}
.muted{color:#64748b;font-size:13px}.err{color:var(--red);font-weight:600}
.client{font-weight:700}
</style></head><body><div class="wrap"><div class="card"><p class="brand">★ Mission Meets Tech</p>${inner}</div>
<p class="muted" style="text-align:center;margin-top:16px">Read-only access. Nothing of yours is sent into MMT. Revoke anytime in your member dashboard.</p></div></body></html>`);
}

const scopeLabel = (s) => ({ "opportunities:read": "Live federal opportunities MMT is tracking", "tracker:read": "Your own saved pipeline / watchlist", "intel:read": "Your personalized fit recommendations" }[s] || s);

function errorPage(message) {
  return page("Can't connect", `<h1>We couldn't finish connecting</h1><p class="err">${esc(message)}</p><p class="muted">Close this window and try again from your assistant. If it keeps happening, email support@missionmeetstech.com.</p>`);
}

// ---- authorize: entry (validate + sign-in) ---------------------------------
async function authorizeEntry(q) {
  const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method, scope, state, resource } = q;
  if (!client_id || !redirect_uri) return errorPage("Missing client or redirect.");

  let client;
  try {
    const { data } = await db().from("oauth_clients").select("client_id, client_name, redirect_uris").eq("client_id", client_id).limit(1).single();
    client = data;
  } catch (e) { console.error("oauth authorize client lookup:", e.message); return errorPage("Sign-in is temporarily unavailable."); }
  if (!client) return errorPage("Unknown application. Try adding the connector again.");
  if (!oauth.redirectUriAllowed(redirect_uri, client.redirect_uris)) return errorPage("This application's redirect address isn't registered.");

  // From here, errors can safely go back to the (validated) redirect_uri.
  if (response_type !== "code") return redirect(oauth.buildRedirect(redirect_uri, { error: "unsupported_response_type", state }));
  if (!code_challenge || (code_challenge_method && code_challenge_method !== "S256")) {
    return redirect(oauth.buildRedirect(redirect_uri, { error: "invalid_request", error_description: "PKCE S256 required", state }));
  }

  const id = oauth.randomId(18);
  const grantedScope = oauth.resolveScopes(scope).join(" ");
  try {
    const { error } = await db().from("oauth_auth_requests").insert({
      id, client_id, redirect_uri, code_challenge, code_challenge_method: code_challenge_method || "S256",
      scope: grantedScope, state: state || null, resource: resource || null,
      expires_at: new Date(Date.now() + oauth.AUTH_REQUEST_TTL_MS).toISOString(),
    });
    if (error) throw new Error(error.message);
  } catch (e) { console.error("oauth authorize insert:", e.message); return errorPage("Sign-in is temporarily unavailable."); }

  return page("Sign in", `<h1>Connect <span class="client">${esc(client.client_name)}</span> to your MMT intelligence</h1>
<p>Enter the email on your MMT membership. We'll send you a one-time sign-in link to approve the connection.</p>
<form method="POST" action="/oauth/authorize">
<input type="hidden" name="action" value="signin"><input type="hidden" name="req" value="${esc(id)}">
<label for="email">Membership email</label>
<input id="email" name="email" type="email" required autocomplete="email" placeholder="you@company.com">
<div style="height:14px"></div><button class="btn btn-primary" type="submit">Email me a sign-in link</button></form>`);
}

// ---- authorize: send the magic link ----------------------------------------
async function authorizeSignin(form) {
  const req = await loadRequest(form.req);
  if (!req) return errorPage("This sign-in expired. Start again from your assistant.");
  const email = String(form.email || "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) return errorPage("Enter a valid email.");

  const loginToken = oauth.randomId(24);
  try {
    const { error } = await db().from("oauth_auth_requests").update({
      login_token_hash: oauth.sha256(loginToken),
      login_expires_at: new Date(Date.now() + oauth.LOGIN_TOKEN_TTL_MS).toISOString(),
      email,
    }).eq("id", req.id);
    if (error) throw new Error(error.message);
  } catch (e) { console.error("oauth signin update:", e.message); return errorPage("Sign-in is temporarily unavailable."); }

  const link = `${BASE}/oauth/authorize?req=${encodeURIComponent(req.id)}&login=${encodeURIComponent(loginToken)}`;
  const sent = await sendEmail({
    to: email,
    subject: "Approve your AI connection to Mission Meets Tech",
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#0A192F;max-width:480px">
<p>You're connecting your AI assistant to your Mission Meets Tech intelligence.</p>
<p>Click to review and approve the connection. This link works once and expires in 10 minutes.</p>
<p><a href="${link}" style="display:inline-block;background:#0A192F;color:#fff;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:600">Review and approve</a></p>
<p style="color:#64748b;font-size:13px">If you didn't start this, ignore this email and nothing will connect.</p></div>`,
  });
  if (!sent || !sent.success) {
    console.error("oauth signin email failed:", sent && sent.error);
    return errorPage("We couldn't send the sign-in email. Try again in a moment.");
  }
  return page("Check your email", `<h1>Check your email</h1><p>We sent a one-time sign-in link to <b>${esc(email)}</b>. Open it on this device to approve the connection.</p><p class="muted">The link expires in 10 minutes. You can close this tab.</p>`);
}

// ---- authorize: verify magic link → consent --------------------------------
async function authorizeConsent(q) {
  const req = await loadRequest(q.req);
  if (!req) return errorPage("This sign-in expired. Start again from your assistant.");
  if (!req.login_token_hash || !req.login_expires_at || new Date(req.login_expires_at) < new Date() ||
      oauth.sha256(q.login) !== req.login_token_hash) {
    return errorPage("This sign-in link is invalid or expired. Start again from your assistant.");
  }
  const email = String(req.email || "").toLowerCase();
  const ent = await loadEntitlement(db(), email);
  let userId = null;
  let seats = 0;
  try {
    const { data: u } = await db().from("mp_users").select("id, agent_seats").eq("email", email).limit(1).single();
    if (u) { userId = u.id; seats = u.agent_seats || 0; }
  } catch (e) { console.error("oauth consent user lookup:", e.message); }
  const access = computeAgentAccess(ent, { agent_seats: seats });
  if (!userId || !access.eligible) {
    return page("Membership needed", `<h1>Agent Access isn't active on this account</h1>
<p>Agent Access is an add-on to MMT Premium. Once it's active on <b>${esc(email)}</b>, connect again from your assistant.</p>
<p><a class="btn btn-primary" href="${BASE}/pricing" style="text-decoration:none;text-align:center">See premium plans</a></p>`);
  }

  try {
    await db().from("oauth_auth_requests").update({ user_id: userId, login_token_hash: null, login_expires_at: null }).eq("id", req.id);
  } catch (e) { console.error("oauth consent stamp:", e.message); return errorPage("Sign-in is temporarily unavailable."); }

  const scopes = (req.scope || "").split(" ").filter(Boolean);
  const client = await loadClientName(req.client_id);
  return page("Approve", `<h1>Give <span class="client">${esc(client)}</span> read-only access?</h1>
<p>Signed in as <b>${esc(email)}</b>. Your assistant will be able to read:</p>
<ul class="scopes">${scopes.map((s) => `<li>• <b>${esc(scopeLabel(s))}</b></li>`).join("")}</ul>
<div class="row">
<form method="POST" action="/oauth/authorize"><input type="hidden" name="action" value="approve"><input type="hidden" name="req" value="${esc(req.id)}"><button class="btn btn-primary" type="submit">Approve</button></form>
<form method="POST" action="/oauth/authorize"><input type="hidden" name="action" value="deny"><input type="hidden" name="req" value="${esc(req.id)}"><button class="btn btn-ghost" type="submit">Cancel</button></form>
</div>`);
}

// ---- authorize: approve / deny ---------------------------------------------
async function authorizeDecide(form) {
  const req = await loadRequest(form.req);
  if (!req) return errorPage("This sign-in expired. Start again from your assistant.");
  if (form.action === "deny") {
    await db().from("oauth_auth_requests").delete().eq("id", req.id).then(() => {}, () => {});
    return redirect(oauth.buildRedirect(req.redirect_uri, { error: "access_denied", state: req.state || undefined }));
  }
  if (!req.user_id) return errorPage("Please open the sign-in link from your email first.");

  const code = oauth.randomId(24);
  try {
    const { error } = await db().from("oauth_auth_codes").insert({
      code_hash: oauth.sha256(code), client_id: req.client_id, redirect_uri: req.redirect_uri,
      code_challenge: req.code_challenge, user_id: req.user_id, scope: req.scope,
      expires_at: new Date(Date.now() + oauth.AUTH_CODE_TTL_MS).toISOString(),
    });
    if (error) throw new Error(error.message);
    await db().from("oauth_auth_requests").delete().eq("id", req.id);
  } catch (e) { console.error("oauth code insert:", e.message); return errorPage("Sign-in is temporarily unavailable."); }

  return redirect(oauth.buildRedirect(req.redirect_uri, { code, state: req.state || undefined }));
}

// ---- token endpoint --------------------------------------------------------
async function tokenGrant(body) {
  const grant = body.grant_type;
  if (grant === "authorization_code") return codeGrant(body);
  if (grant === "refresh_token") return refreshGrant(body);
  return json(400, { error: "unsupported_grant_type" });
}

async function codeGrant(body) {
  const { code, code_verifier, redirect_uri, client_id } = body;
  if (!code || !code_verifier || !redirect_uri || !client_id) return json(400, { error: "invalid_request", error_description: "code, code_verifier, redirect_uri, client_id required" });

  let row;
  try {
    const { data } = await db().from("oauth_auth_codes").select("*").eq("code_hash", oauth.sha256(code)).limit(1).single();
    row = data;
  } catch (e) { console.error("oauth token code lookup:", e.message); return json(503, { error: "temporarily_unavailable" }); }
  if (!row || row.used || new Date(row.expires_at) < new Date()) return json(400, { error: "invalid_grant", error_description: "Authorization code invalid or expired." });
  if (row.client_id !== client_id || row.redirect_uri !== redirect_uri) return json(400, { error: "invalid_grant", error_description: "client_id / redirect_uri mismatch." });
  if (!oauth.verifyPkce(code_verifier, row.code_challenge, "S256")) return json(400, { error: "invalid_grant", error_description: "PKCE verification failed." });

  await db().from("oauth_auth_codes").update({ used: true }).eq("code_hash", row.code_hash);
  return issueTokens(row.user_id, row.client_id, row.scope);
}

async function refreshGrant(body) {
  const { refresh_token, client_id } = body;
  if (!refresh_token || !client_id) return json(400, { error: "invalid_request" });
  let row;
  try {
    const { data } = await db().from("oauth_refresh_tokens").select("*").eq("token_hash", oauth.sha256(refresh_token)).limit(1).single();
    row = data;
  } catch (e) { console.error("oauth refresh lookup:", e.message); return json(503, { error: "temporarily_unavailable" }); }
  if (!row || row.revoked || row.client_id !== client_id || new Date(row.expires_at) < new Date()) return json(400, { error: "invalid_grant" });

  // Rotate: revoke the old refresh + its api_token, issue a fresh pair.
  await db().from("oauth_refresh_tokens").update({ revoked: true }).eq("token_hash", row.token_hash);
  if (row.api_token_id) await db().from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", row.api_token_id).then(() => {}, () => {});
  return issueTokens(row.user_id, row.client_id, row.scope);
}

/** Mint the api_tokens access token + a rotating refresh token. */
async function issueTokens(userId, clientId, scopeStr) {
  const scopes = scopeStr.split(" ").filter(Boolean);
  const clientName = await loadClientName(clientId);
  const tok = generateToken();
  const expiresAt = new Date(Date.now() + oauth.ACCESS_TOKEN_TTL_DAYS * 864e5).toISOString();
  let apiTokenId;
  try {
    const { data, error } = await db().from("api_tokens").insert({
      user_id: userId, name: `${clientName} (AI connection)`.slice(0, 120),
      token_hash: tok.hash, token_prefix: tok.prefix, scopes, expires_at: expiresAt,
    }).select("id").single();
    if (error || !data) throw new Error(error && error.message);
    apiTokenId = data.id;
  } catch (e) { console.error("oauth issue api_token:", e.message); return json(503, { error: "temporarily_unavailable" }); }

  const refresh = "mmt_rt_" + oauth.randomId(24);
  try {
    await db().from("oauth_refresh_tokens").insert({
      token_hash: oauth.sha256(refresh), client_id: clientId, user_id: userId,
      api_token_id: apiTokenId, scope: scopeStr,
      expires_at: new Date(Date.now() + oauth.REFRESH_TOKEN_TTL_MS).toISOString(),
    });
    await db().from("oauth_clients").update({ last_used_at: new Date().toISOString() }).eq("client_id", clientId).then(() => {}, () => {});
  } catch (e) { console.error("oauth issue refresh:", e.message); /* access token still valid */ }

  return json(200, {
    access_token: tok.raw, token_type: "Bearer",
    expires_in: oauth.ACCESS_TOKEN_TTL_DAYS * 86400, refresh_token: refresh, scope: scopeStr,
  });
}

// ---- DCR -------------------------------------------------------------------
async function register(body) {
  const v = oauth.validateRegistration(body);
  if (!v.ok) return json(400, { error: v.error, error_description: v.message });
  const client_id = "mmtc_" + oauth.randomId(16);
  try {
    const { error } = await db().from("oauth_clients").insert({ client_id, client_name: v.client.client_name, redirect_uris: v.client.redirect_uris });
    if (error) throw new Error(error.message);
  } catch (e) { console.error("oauth register:", e.message); return json(503, { error: "temporarily_unavailable", error_description: "Registration is temporarily unavailable." }); }
  return json(201, {
    client_id, client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: v.client.redirect_uris, client_name: v.client.client_name,
    grant_types: v.client.grant_types, response_types: v.client.response_types,
    token_endpoint_auth_method: v.client.token_endpoint_auth_method,
  });
}

// ---- helpers ---------------------------------------------------------------
async function loadRequest(id) {
  if (!id) return null;
  try {
    const { data } = await db().from("oauth_auth_requests").select("*").eq("id", id).limit(1).single();
    if (!data || new Date(data.expires_at) < new Date()) return null;
    return data;
  } catch { return null; }
}
async function loadClientName(clientId) {
  try {
    const { data } = await db().from("oauth_clients").select("client_name").eq("client_id", clientId).limit(1).single();
    return (data && data.client_name) || "Your AI assistant";
  } catch { return "Your AI assistant"; }
}

// ---- router ----------------------------------------------------------------
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: JSON_CORS, body: "" };
  const path = event.path || "";
  const q = event.queryStringParameters || {};

  try {
    if (/oauth-authorization-server/.test(path)) return json(200, oauth.authServerMetadata(BASE));

    if (/\/oauth\/register$/.test(path)) {
      if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
      return await register(parseBody(event));
    }

    if (/\/oauth\/token$/.test(path)) {
      if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
      return await tokenGrant(parseBody(event));
    }

    if (/\/oauth\/authorize$/.test(path)) {
      if (event.httpMethod === "GET") {
        if (q.login && q.req) return await authorizeConsent(q);
        return await authorizeEntry(q);
      }
      if (event.httpMethod === "POST") {
        const form = parseBody(event);
        if (form.action === "signin") return await authorizeSignin(form);
        return await authorizeDecide(form); // approve | deny
      }
      return json(405, { error: "method_not_allowed" });
    }

    return json(404, { error: "not_found" });
  } catch (e) {
    console.error("agent-oauth fatal:", e.message);
    return json(500, { error: "server_error" });
  }
};

module.exports.__test = { esc, scopeLabel };
