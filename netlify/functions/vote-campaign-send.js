// ============================================================
// vote-campaign-send.js — Feature-vote campaign trigger (Sprint 4).
//
// "Code sends it, not the agent." Inserts ONE row into scheduled_emails;
// the existing scheduled-email-worker delivers it to the premium_active
// list on its next cycle. This is NOT a cron — Mary triggers it once:
//
//   curl -X POST -H "Authorization: Bearer $COMMAND_CENTER_KEY" \
//     https://missionmeetstech.com/.netlify/functions/vote-campaign-send
//
// Guards:
//   • Bearer token (COMMAND_CENTER_KEY) — no anonymous sends.
//   • campaign-key dedupe — refuses to insert if a row with the same
//     subject is already queued/processing/sent (no double blast).
//   • Audience is premium_active (per Mary's choice), never the full list.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { buildVoteEmailHtml } = require("./lib/email-templates");
const { VOTE_FORM_ID_DEFAULT } = require("./lib/google-read");

const FROM = "Mary at Mission Meets Tech <mary@missionmeetstech.com>";
const REPLY_TO = "mary@missionmeetstech.com";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  const expected = process.env.COMMAND_CENTER_KEY;
  if (!expected) {
    return { statusCode: 503, body: JSON.stringify({ error: "COMMAND_CENTER_KEY not configured" }) };
  }
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || token !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const formUrl =
    process.env.VOTE_FORM_URL ||
    `https://docs.google.com/forms/d/${process.env.VOTE_FORM_ID || VOTE_FORM_ID_DEFAULT}/viewform`;

  const { subject, html, text } = buildVoteEmailHtml({ formUrl });

  // Dedupe: bail if this campaign is already in flight or sent.
  const { data: existing, error: dupErr } = await supabase
    .from("scheduled_emails")
    .select("id, status")
    .eq("subject", subject)
    .not("status", "in", "(failed,aborted)")
    .limit(1);
  if (dupErr) {
    return { statusCode: 500, body: JSON.stringify({ error: `dedupe check failed: ${dupErr.message}` }) };
  }
  if (existing && existing.length) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, already_queued: true, id: existing[0].id, status: existing[0].status }),
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("scheduled_emails")
    .insert({
      recipient_query: "premium_active",
      subject,
      html,
      text,
      from: FROM,
      reply_to: REPLY_TO,
      status: "queued",
      scheduled_at: now,
      created_at: now,
    })
    .select("id")
    .single();
  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: `insert failed: ${error.message}` }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, queued: true, id: data.id, audience: "premium_active" }),
  };
};
