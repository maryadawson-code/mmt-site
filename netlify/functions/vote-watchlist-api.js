// ============================================================
// vote-watchlist-api.js — CRUD for feature-vote custom_watchlists (F).
//
// Criteria-based watchlists (distinct from member-watchlist.js, which is
// entry-based). Premium-gated via loadEntitlement; dormant via the
// vote_feature.custom_watchlists flag (returns 404 until released).
//
//   GET  ?email=x                                  → list a member's watchlists
//   POST { email, action:'save', name, criteria, lead_time_days } → create
//   POST { email, action:'delete', id }            → deactivate (active=false)
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { loadEntitlement, blockMessageFor } = require("./lib/entitlement");
const { isFlagEnabled } = require("./lib/vote-flags");

const HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const ALLOWED_CRITERIA = ["q", "agency", "naics", "status", "platform", "sb"];
function cleanCriteria(raw) {
  const out = {};
  if (raw && typeof raw === "object") {
    for (const k of ALLOWED_CRITERIA) {
      if (raw[k] != null && raw[k] !== "") out[k] = k === "sb" ? raw[k] === true || raw[k] === "true" : String(raw[k]).slice(0, 200);
    }
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS };

  const supabase =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      : null;
  if (!supabase) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: "supabase_not_configured" }) };

  // Dormant gate.
  if (!(await isFlagEnabled(supabase, "vote_feature.custom_watchlists"))) {
    return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "not_found" }) };
  }

  const email =
    event.httpMethod === "GET"
      ? (event.queryStringParameters || {}).email
      : (() => { try { return JSON.parse(event.body || "{}").email; } catch { return null; } })();
  if (!email) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "email required" }) };

  // Premium gate.
  const entitlement = await loadEntitlement(supabase, email);
  if (!entitlement || entitlement.tier === "free") {
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify(blockMessageFor(entitlement)) };
  }
  const userEmail = email.toLowerCase().trim();

  try {
    if (event.httpMethod === "GET") {
      const { data, error } = await supabase
        .from("vote_watchlists")
        .select("id, name, criteria, lead_time_days, active, created_at")
        .eq("user_email", userEmail)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ watchlists: data || [] }) };
    }

    const body = JSON.parse(event.body || "{}");
    if (body.action === "save") {
      const criteria = cleanCriteria(body.criteria);
      if (!Object.keys(criteria).length) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "at least one criterion required" }) };
      }
      const lead = Math.min(Math.max(parseInt(body.lead_time_days, 10) || 90, 7), 365);
      const { data, error } = await supabase
        .from("vote_watchlists")
        .insert({ user_email: userEmail, name: String(body.name || "My watchlist").slice(0, 120), criteria, lead_time_days: lead })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, id: data.id }) };
    }
    if (body.action === "delete") {
      if (!body.id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "id required" }) };
      const { error } = await supabase
        .from("vote_watchlists")
        .update({ active: false })
        .eq("id", body.id)
        .eq("user_email", userEmail);
      if (error) throw new Error(error.message);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "unknown action" }) };
  } catch (e) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
  }
};
