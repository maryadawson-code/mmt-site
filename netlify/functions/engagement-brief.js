// ============================================================
// engagement-brief.js — LinkedIn engagement intelligence endpoint
//
// GET: Generate engagement brief (JSON)
// GET ?deliver=true: Generate and email to Mary
// Auth: ?key= checked against COMMAND_CENTER_KEY
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { generateEngagementBrief } = require("./lib/engagement-intel");
const { sendEmail } = require("./lib/send-email");
const { validateAuth } = require("./lib/auth");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS_HEADERS, body: '{"error":"Method not allowed"}' };
  }

  let supabase = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }

  const authResult = await validateAuth(event, supabase);
  if (!authResult.authenticated) {
    return { statusCode: 401, headers: CORS_HEADERS, body: '{"error":"Unauthorized"}' };
  }

  const topics = [
    "MHS GENESIS",
    "VA EHR modernization",
    "federal health IT AI",
    "DOGE contract terminations",
    "DHA cybersecurity",
    "SDVOSB federal health",
  ];

  const brief = await generateEngagementBrief(supabase, { topics });

  // Optionally deliver via email
  if (params.deliver === "true") {
    const emailHtml = buildBriefEmail(brief);
    await sendEmail({
      to: "maryadawson@gmail.com",
      subject: `MMT Engagement Brief — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`,
      html: emailHtml,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
    brief._delivered = true;
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(brief) };
};

function buildBriefEmail(brief) {
  const highPriorityRows = (brief.high_priority || []).map(item => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;">
        <strong>${esc(item.person_or_source)}</strong><br>
        <span style="color:#555;">${esc(item.title_or_context)}</span><br>
        ${item.url ? `<a href="${esc(item.url)}" style="color:#0066cc;">${esc(item.url).substring(0, 60)}...</a><br>` : ""}
        <em style="color:#888;">Why: ${esc(item.why_engage)}</em><br>
        <div style="background:#f0f7ff;padding:8px;margin-top:6px;border-radius:4px;font-style:italic;">${esc(item.suggested_comment)}</div>
      </td>
    </tr>`).join("");

  const trendingRows = (brief.trending_topics || []).map(item => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;">
        <strong>${esc(item.topic)}</strong> <span style="color:${item.urgency === "high" ? "#dc2626" : item.urgency === "medium" ? "#d97706" : "#059669"};">[${item.urgency}]</span><br>
        <span style="color:#555;">Source: ${esc(item.source)}</span><br>
        ${item.url ? `<a href="${esc(item.url)}" style="color:#0066cc;">${esc(item.url).substring(0, 60)}...</a><br>` : ""}
        <em style="color:#888;">MMT angle: ${esc(item.mmt_angle)}</em>
      </td>
    </tr>`).join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#0A192F;border-bottom:2px solid #457B9D;padding-bottom:8px;">MMT Engagement Brief</h2>
      <p style="color:#888;font-size:12px;">Generated: ${brief.generated_at}</p>

      <h3 style="color:#0A192F;margin-top:20px;">High Priority Engagements</h3>
      ${highPriorityRows.length > 0 ? `<table style="width:100%;border-collapse:collapse;">${highPriorityRows}</table>` : "<p style='color:#888;'>No high-priority opportunities found.</p>"}

      <h3 style="color:#0A192F;margin-top:20px;">Trending Topics</h3>
      ${trendingRows.length > 0 ? `<table style="width:100%;border-collapse:collapse;">${trendingRows}</table>` : "<p style='color:#888;'>No trending topics found.</p>"}

      <p style="color:#aaa;font-size:11px;margin-top:20px;border-top:1px solid #eee;padding-top:10px;">Mission Meets Tech — Engagement Intelligence</p>
    </div>`;
}

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
