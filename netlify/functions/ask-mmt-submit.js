// ============================================================
// ask-mmt-submit.js — Ask MMT question submission endpoint
//
// POST body: { email, question }
// Enforces 2 questions/month per email (server-side).
// Stores in Supabase ops_events, emails Mary via Resend.
// Returns: { success, remaining } or { error }
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { logOpsEvent } = require("./lib/ops-ledger");
const { answerQuestion } = require("./lib/premium-assistant");

// Escape user-supplied strings before dropping them into HTML templates.
function escapeHtml(s) {
  return String(s || "").replace(/[<>&"']/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Minimal markdown → HTML for the assisted draft block in the confirmation email.
// Handles paragraphs, bold, italics, bullets, and links. Not a full parser.
function renderAnswerHtml(md) {
  if (!md) return "";
  const safe = escapeHtml(md);
  return safe
    .replace(/^### (.+)$/gm, '<h4 style="margin:16px 0 8px;color:#0A192F;font-size:14px;">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:16px 0 8px;color:#0A192F;font-size:15px;">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#457B9D;">$1</a>')
    .replace(/(^|\n)- (.+)/g, (_, p, t) => `${p}<li style="margin:4px 0;">${t}</li>`)
    .replace(/(<li[^>]*>.+<\/li>\n?)+/g, (list) => `<ul style="margin:8px 0 12px;padding-left:20px;">${list}</ul>`)
    .replace(/\n{2,}/g, '</p><p style="margin:0 0 12px;font-size:14px;color:#314155;line-height:1.6;">')
    .replace(/^/, '<p style="margin:0 0 12px;font-size:14px;color:#314155;line-height:1.6;">')
    .concat('</p>');
}

const MONTHLY_LIMIT = 2;
const ADMIN_EMAIL = "mary@missionmeetstech.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Email and question are required" }) };
  }

  if (question.length > 500) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Question exceeds 500 characters" }) };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid email" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Verify premium status
  const { data: user } = await supabase
    .from("mp_users")
    .select("tier, subscription_tier, subscription_status")
    .eq("email", email)
    .single();

  const isPremium = user && (
    (user.subscription_tier === "premium" && user.subscription_status === "active") ||
    user.tier === "admin" ||
    user.tier === "paid"
  );

  if (!isPremium) {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "Ask MMT is a Premium feature. Subscribe at missionmeetstech.com/pricing" }) };
  }

  // Check monthly quota — count questions this month
  const now = new Date();
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString();
  const { count, error: countErr } = await supabase
    .from("ops_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "ask_mmt_question")
    .eq("details->>email", email)
    .gte("created_at", monthStart);

  if (countErr) {
    console.error("ask-mmt-submit: quota check failed:", countErr.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Could not check quota" }) };
  }

  const used = count || 0;
  if (used >= MONTHLY_LIMIT) {
    return {
      statusCode: 429,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Monthly limit reached (2 questions). Resets on the 1st.", remaining: 0 }),
    };
  }

  // Generate an AI-assisted draft answer using the federal-data enrichment stack.
  // This runs BEFORE insert so the draft can be persisted alongside the question.
  // Non-blocking: if it fails, the subscriber still gets the normal "Mary will
  // respond in 5 business days" confirmation.
  let assistedDraft = null;
  let assistedMeta = null;
  try {
    const result = await answerQuestion({ question, maxTokens: 1500 });
    if (result.answer) {
      assistedDraft = result.answer;
      assistedMeta = { agency: result.agency, hasData: result.hasData, model: result.model };
    } else if (result.error) {
      console.warn("ask-mmt-submit: assisted draft failed:", result.error);
    }
  } catch (draftErr) {
    console.warn("ask-mmt-submit: assisted draft threw:", draftErr.message);
  }

  // Store the question
  const { error: insertErr } = await supabase.from("ops_events").insert({
    event_type: "ask_mmt_question",
    details: {
      email,
      question,
      submitted_at: now.toISOString(),
      month: now.toISOString().slice(0, 7),
      assisted_draft: assistedDraft,
      assisted_meta: assistedMeta,
    },
  });

  if (insertErr) {
    console.error("ask-mmt-submit: insert failed:", insertErr.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Could not save question" }) };
  }

  // Email Mary
  const remaining = MONTHLY_LIMIT - used - 1;
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Ask MMT] New question from ${email}`,
      html: `<div style="font-family:sans-serif;max-width:600px;padding:24px;color:#333;">
  <h2 style="margin:0 0 16px;color:#0A192F;">Ask MMT — New Question</h2>
  <p style="margin:0 0 8px;"><strong>From:</strong> ${email}</p>
  <p style="margin:0 0 8px;"><strong>Question:</strong></p>
  <div style="background:#F3F4F6;border-radius:8px;padding:16px;margin:0 0 16px;font-size:15px;line-height:1.6;">${question.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]))}</div>
  <p style="font-size:13px;color:#5C6B7A;">This subscriber has ${remaining} question${remaining === 1 ? "" : "s"} remaining this month.</p>
  <p style="font-size:13px;color:#5C6B7A;">Reply directly to the subscriber at <a href="mailto:${email}" style="color:#457B9D;">${email}</a>.</p>
</div>`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
  } catch (emailErr) {
    console.error("ask-mmt-submit: notification failed:", emailErr.message);
  }

  // Send confirmation to subscriber — includes the assisted draft if we got one
  const draftBlock = assistedDraft ? `
    <div style="border-left:3px solid #457B9D;background:#F3F4F6;border-radius:8px;padding:20px;margin:0 0 20px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#457B9D;letter-spacing:0.05em;text-transform:uppercase;">Assisted draft — verified federal data</p>
      ${renderAnswerHtml(assistedDraft)}
      <p style="margin:12px 0 0;font-size:12px;color:#5C6B7A;font-style:italic;">This draft was generated from direct API queries to USASpending, SAM.gov, Congress.gov, PubMed, and related sources. Mary will review and send her own response within 5 business days.</p>
    </div>
  ` : "";

  try {
    await sendEmail({
      to: email,
      subject: "Your Ask MMT question has been received",
      html: `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#0A192F;padding:24px 32px;">
    <span style="color:#FFFFFF;font-size:18px;font-weight:700;">Mission Meets Tech</span>
  </div>
  <div style="padding:32px;">
    <p style="font-size:16px;color:#0A192F;margin:0 0 16px;">Your question has been received.</p>
    <div style="background:#F3F4F6;border-radius:8px;padding:16px;margin:0 0 16px;font-size:14px;color:#314155;line-height:1.6;">${escapeHtml(question)}</div>
    ${draftBlock}
    <p style="font-size:14px;color:#5C6B7A;margin:0 0 8px;">Mary will respond within 5 business days via email.</p>
    <p style="font-size:13px;color:#5C6B7A;margin:0;">You have ${remaining} question${remaining === 1 ? "" : "s"} remaining this month.</p>
  </div>
  <div style="padding:16px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;text-align:center;">
    Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a>
  </div>
</div>`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });
  } catch (confirmErr) {
    console.error("ask-mmt-submit: confirmation email failed:", confirmErr.message);
  }

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      remaining,
      assistedDraft: assistedDraft || null,
    }),
  };
};
