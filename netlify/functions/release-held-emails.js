/**
 * release-held-emails.js — Netlify Function
 *
 * Releases held emails from degraded mode. Sends each via Resend,
 * then marks as released in the held_emails table.
 *
 * POST /.netlify/functions/release-held-emails
 * Auth: X-Ops-Token header matching OPS_DASHBOARD_TOKEN env var
 */

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPS_TOKEN = process.env.OPS_DASHBOARD_TOKEN;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const token = event.headers["x-ops-token"];
  if (!OPS_TOKEN || token !== OPS_TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Supabase not configured" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { data: held, error: fetchErr } = await supabase
      .from("held_emails")
      .select("*")
      .eq("released", false)
      .order("created_at", { ascending: true })
      .limit(50);

    if (fetchErr) {
      return { statusCode: 500, body: JSON.stringify({ error: fetchErr.message }) };
    }

    if (!held || held.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ released: 0, failed: 0, total: 0 }),
      };
    }

    let released = 0;
    let failed = 0;

    for (const email of held) {
      try {
        const result = await sendEmail({
          to: email.recipient,
          subject: email.subject,
          html: email.html,
          from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        });

        if (result.success) {
          await supabase
            .from("held_emails")
            .update({ released: true, released_at: new Date().toISOString() })
            .eq("id", email.id);
          released++;
        } else {
          console.error(`Failed to send held email ${email.id}:`, result.error);
          failed++;
        }
      } catch (err) {
        console.error(`Exception sending held email ${email.id}:`, err.message);
        failed++;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ released, failed, total: held.length }),
    };
  } catch (err) {
    console.error("release-held-emails error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
