// ============================================================
// google-read.js — Read Google Form responses for the feature-vote tally.
//
// Reuses the EXISTING google connection (oauth_tokens row, provider=google)
// — refreshes an access token from the stored refresh_token. No service
// account. Requires the Forms/Sheets read scopes added to google-oauth.js
// (one-time re-consent).
//
// getFormResponses() returns the raw Forms API `responses` array. Parsing
// answers → letters happens in the pure computeRanking() (Sprint 5), so this
// module stays I/O-only and easy to stub in tests.
// ============================================================

const { createClient } = require("@supabase/supabase-js");

// Default form id per FEATURE_VOTE_SYSTEM_SPEC.md §6. Override with VOTE_FORM_ID.
const VOTE_FORM_ID_DEFAULT = "1eE0PsmizjS6Cz4amp6SxMZWia1QrUS4MlVBIiCKqhGg";

function resolveSupabase(injected) {
  if (injected) return injected;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Mint a fresh access token from the stored google refresh_token.
async function getAccessToken(supabase) {
  const sb = resolveSupabase(supabase);
  if (!sb) throw new Error("supabase_not_configured");
  const { data, error } = await sb
    .from("oauth_tokens")
    .select("refresh_token, is_active, scopes")
    .eq("provider", "google")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`oauth_tokens read failed: ${error.message}`);
  if (!data || !data.refresh_token) throw new Error("no active google oauth token — connect via google-oauth ?action=connect");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  });
  const tok = await resp.json();
  if (!resp.ok || tok.error || !tok.access_token) {
    throw new Error(`token refresh failed: ${tok.error_description || tok.error || resp.status}`);
  }
  return tok.access_token;
}

/**
 * Read all responses for a Google Form (paginated).
 * @returns {Promise<Array>} raw Forms API response objects.
 */
async function getFormResponses({ supabase, formId } = {}) {
  const sb = resolveSupabase(supabase);
  const fid = formId || process.env.VOTE_FORM_ID || VOTE_FORM_ID_DEFAULT;
  const token = await getAccessToken(sb);

  let rows = [];
  let pageToken = null;
  let guard = 0;
  do {
    const url = new URL(`https://forms.googleapis.com/v1/forms/${fid}/responses`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`forms api ${r.status}: ${body.slice(0, 200)}`);
    }
    const j = await r.json();
    rows = rows.concat(j.responses || []);
    pageToken = j.nextPageToken || null;
  } while (pageToken && ++guard < 50);
  return rows;
}

module.exports = { getFormResponses, getAccessToken, VOTE_FORM_ID_DEFAULT };
