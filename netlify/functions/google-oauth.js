// google-oauth.js — OAuth flow for Gmail read-only access (receipt scanning)
// ?action=connect  → redirect to Google OAuth
// ?code=...        → OAuth callback, store tokens
// ?action=status   → check connection status
// ?action=disconnect → revoke access

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  // Feature-vote (Sprint 4): read Google Form responses + linked Sheet for
  // the tally. Reuses this same google connection / refresh token — no
  // service account. Adding these scopes requires a ONE-TIME re-consent
  // (re-run ?action=connect) so the stored token carries the new scopes.
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  // forms.body: lets vote-form-create.js build the vote form via the Forms
  // API using this same connection (no manual form-building).
  "https://www.googleapis.com/auth/forms.body",
];
const REDIRECT_URI = "https://missionmeetstech.com/.netlify/functions/google-oauth";

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const params = event.queryStringParameters || {};

  // Step 1: Initiate OAuth
  if (params.action === "connect") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return { statusCode: 500, body: "GOOGLE_CLIENT_ID not configured" };

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(SCOPES.join(" "))}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=mmt_billing_connect`;

    return { statusCode: 302, headers: { Location: authUrl } };
  }

  // Step 2: OAuth callback
  if (params.code && params.state === "mmt_billing_connect") {
    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: params.code,
          redirect_uri: REDIRECT_URI,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      });

      const tokens = await tokenResp.json();

      if (tokens.error) {
        return {
          statusCode: 302,
          headers: {
            Location:
              "/command-center.html?gmail=error&msg=" +
              encodeURIComponent(tokens.error_description || tokens.error),
          },
        };
      }

      // Get user email
      const userResp = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await userResp.json();

      // Store tokens
      await supabase.from("oauth_tokens").upsert(
        {
          provider: "google",
          account_email: profile.emailAddress,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          scopes: SCOPES,
          is_active: true,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,account_email" }
      );

      // Enable Gmail collector
      await supabase.from("billing_sync_status").update({ is_enabled: true }).eq("source", "gmail_receipts");

      // Log
      await supabase.from("ops_events").insert({
        source: "google-oauth",
        signal: "gmail_connected",
        detail: { email: profile.emailAddress },
        severity: "info",
      });

      return {
        statusCode: 302,
        headers: {
          Location:
            "/command-center.html?gmail=connected&email=" + encodeURIComponent(profile.emailAddress),
        },
      };
    } catch (err) {
      return {
        statusCode: 302,
        headers: {
          Location: "/command-center.html?gmail=error&msg=" + encodeURIComponent(err.message),
        },
      };
    }
  }

  // Step 3: Check connection status
  if (params.action === "status") {
    const auth = await validateAuth(event, supabase);
    if (!auth.authenticated) return { statusCode: 401, body: "Unauthorized" };

    const { data } = await supabase
      .from("oauth_tokens")
      .select("account_email, is_active, last_used_at, expires_at, updated_at")
      .eq("provider", "google");

    const { data: syncStatus } = await supabase
      .from("billing_sync_status")
      .select("*")
      .eq("source", "gmail_receipts")
      .single();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connected: data?.length > 0 && data[0].is_active,
        accounts: data || [],
        syncStatus: syncStatus,
      }),
    };
  }

  // Step 4: Disconnect
  if (params.action === "disconnect") {
    await supabase
      .from("oauth_tokens")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("provider", "google");

    await supabase.from("billing_sync_status").update({ is_enabled: false }).eq("source", "gmail_receipts");

    return {
      statusCode: 302,
      headers: { Location: "/command-center.html?gmail=disconnected" },
    };
  }

  return { statusCode: 400, body: "Unknown action. Use ?action=connect|status|disconnect" };
};
