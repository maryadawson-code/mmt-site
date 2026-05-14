// ============================================================
// premium-chat.js — Premium subscriber live chat endpoint
//
// POST body: { email, question, history? }
//
// - Verifies premium status via mp_users (same gate as Ask MMT)
// - Calls the shared premium-assistant helper which runs the
//   federal-data enrichment stack + Claude
// - Logs each turn to ops_events (event_type: "premium_chat_turn")
// - Returns: { answer, agency, hasData, model }
//
// Quota: soft cap at 50 turns/month/subscriber. Institutional tier
// gets 200. This is quiet abuse protection, not a primary gate.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { answerQuestion } = require("./lib/premium-assistant");
const { loadEntitlement, blockMessageFor, logEntitlementMismatch } = require("./lib/entitlement");

const MONTHLY_TURN_CAP = 50;
const INSTITUTIONAL_TURN_CAP = 200;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const email = (body.email || "").toLowerCase().trim();
  const question = (body.question || "").trim();

  if (!email || !question) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email and question are required" }) };
  }
  if (question.length > 1000) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "question exceeds 1000 characters" }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid email" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Canonical entitlement check (Sprint B 2026-05-13 — replaces the
  // inline mp_users / subscription_tier query that was the regression
  // pattern documented in CLAUDE.md after the 2026-04-27 founding-member
  // incident. The previous shape required subscription_tier === "premium"
  // AND active, which incorrectly excluded mmt_premium_founding subscribers
  // who weren't also tier === "admin" / "paid".)
  const entitlement = await loadEntitlement(supabase, email);
  const isInstitutional = entitlement.tier === "institutional";
  if (!entitlement.ok) {
    const block = blockMessageFor(entitlement);
    try { await logEntitlementMismatch(supabase, { email, tool: "premium_chat", entitlement, expected: "premium|founding|institutional|admin" }); } catch {}
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: block.message, reason_code: block.reason_code, tier: entitlement.tier }),
    };
  }

  // Monthly turn quota
  const now = new Date();
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString();
  const { count } = await supabase
    .from("ops_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "premium_chat_turn")
    .eq("details->>email", email)
    .gte("created_at", monthStart);

  const cap = isInstitutional ? INSTITUTIONAL_TURN_CAP : MONTHLY_TURN_CAP;
  const used = count || 0;
  if (used >= cap) {
    return {
      statusCode: 429,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: `Monthly chat limit reached (${cap} turns). Resets on the 1st.`,
        remaining: 0,
      }),
    };
  }

  // Run the assistant
  const result = await answerQuestion({ question, maxTokens: 1500 });

  if (result.error || !result.answer) {
    // Log failure to ops_events for visibility, but don't burn the subscriber's quota
    try {
      await supabase.from("ops_events").insert({
        event_type: "premium_chat_error",
        details: {
          email,
          question,
          error: result.error || "empty_answer",
          submitted_at: now.toISOString(),
        },
      });
    } catch (_) { /* swallow — logging must not break the response */ }
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "Could not generate an answer right now. Try again in a moment or email mary@missionmeetstech.com.",
      }),
    };
  }

  // Log the successful turn
  try {
    await supabase.from("ops_events").insert({
      event_type: "premium_chat_turn",
      details: {
        email,
        question,
        answer: result.answer,
        agency: result.agency,
        has_data: result.hasData,
        model: result.model,
        submitted_at: now.toISOString(),
        month: now.toISOString().slice(0, 7),
      },
    });
  } catch (logErr) {
    console.warn("premium-chat: ops_events log failed:", logErr.message);
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      answer: result.answer,
      agency: result.agency,
      hasData: result.hasData,
      model: result.model,
      remaining: Math.max(cap - used - 1, 0),
    }),
  };
};
