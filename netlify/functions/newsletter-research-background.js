// ============================================================
// newsletter-research-background.js — Netlify Background Function
//
// Monday and Thursday at 7 AM ET (11:00 UTC): compiles a
// research package for the Mission Meets Tech newsletter using
// Perplexity Sonar Pro for live web intelligence.
//
// Schedule configured in netlify.toml:
//   [functions."newsletter-research"]
//     schedule = "0 11 * * 1,4"
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getModelConfig } = require("./lib/model-router");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");
const { withRetry } = require("./lib/retry");
const { sendEmail } = require("./lib/send-email");
const { checkKillSwitch } = require("./lib/kill-switch");
const { trackPerplexity } = require("./lib/cost-tracker");

// --- Constants ---
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Perplexity API call (reused pattern from contract-intel-refresh) ---

async function callPerplexity(systemPrompt, userMessage, model, maxTokens, _supabase) {
  const _t = Date.now();
  const response = await withRetry(() => fetchWithTimeout("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  }, 120000)); // 2 min timeout for research calls

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${errText}`);
  }

  const finalData = await response.json();

  if (finalData.usage) {
    const u = finalData.usage;
    console.log(`  AI cost: model=${model}, input=${u.prompt_tokens}, output=${u.completion_tokens}`);
  }

  // Cost tracking
  if (_supabase) {
    try {
      await trackPerplexity(_supabase, { functionName: 'newsletter-research-background', product: 'mmt-intel', model, usage: { input_tokens: finalData.usage?.prompt_tokens, output_tokens: finalData.usage?.completion_tokens }, latencyMs: Date.now() - _t });
    } catch (_costErr) { /* never break parent */ }
  }

  let textContent = finalData.choices?.[0]?.message?.content || "";

  // Strip inline citation markers
  textContent = textContent.replace(/\[\d+\]/g, "");

  // Clean and parse JSON
  function cleanJson(str) {
    str = str.replace(/,\s*([\]}])/g, "$1");
    str = str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    return str;
  }

  function extractJsonString(text) {
    try { return JSON.parse(cleanJson(text)); } catch { /* continue */ }

    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(cleanJson(jsonMatch[1].trim())); } catch { /* continue */ }
    }

    const braceStart = text.indexOf("{");
    const braceEnd = text.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      const candidate = text.substring(braceStart, braceEnd + 1);
      try { return JSON.parse(cleanJson(candidate)); } catch { /* continue */ }
    }

    return null;
  }

  const parsed = extractJsonString(textContent);
  if (!parsed) {
    console.error("JSON parse failed. First 500 chars:", textContent.substring(0, 500));
    throw new Error(`Could not parse JSON from Perplexity response (${textContent.length} chars)`);
  }

  return parsed;
}

// --- Email template for newsletter research summary ---

function buildResearchSummaryHtml(publishDate, research) {
  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  // Gather top items across categories
  const topItems = [];

  if (research.top_stories && research.top_stories.length > 0) {
    research.top_stories.slice(0, 2).forEach((s) => {
      topItems.push({ category: "Top Story", headline: s.headline, summary: s.summary, url: s.source_url });
    });
  }
  if (research.procurement_moves && research.procurement_moves.length > 0) {
    research.procurement_moves.slice(0, 1).forEach((s) => {
      topItems.push({ category: "Procurement", headline: s.title, summary: s.detail, url: s.source_url });
    });
  }
  if (research.industry_news && research.industry_news.length > 0) {
    research.industry_news.slice(0, 1).forEach((s) => {
      topItems.push({ category: "Industry", headline: s.headline, summary: s.detail, url: s.source_url });
    });
  }
  if (research.policy_legislative && research.policy_legislative.length > 0) {
    research.policy_legislative.slice(0, 1).forEach((s) => {
      topItems.push({ category: "Policy", headline: s.headline, summary: s.detail, url: s.source_url });
    });
  }

  const itemsHtml = topItems
    .map((item) => `
      <div style="margin-bottom:16px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369a1;">${escapeHtml(item.category)}</p>
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#111827;">${escapeHtml(item.headline)}</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(item.summary)}</p>
        ${item.url ? `<a href="${escapeHtml(item.url)}" style="display:inline-block;margin-top:6px;font-size:13px;color:#0369a1;text-decoration:none;">[source]</a>` : ""}
      </div>`)
    .join("");

  const anglesHtml = (research.editorial_angles || [])
    .map((a) => `<li style="margin-bottom:6px;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(a)}</li>`)
    .join("");

  // Count totals
  const totalItems = (research.top_stories?.length || 0)
    + (research.procurement_moves?.length || 0)
    + (research.industry_news?.length || 0)
    + (research.policy_legislative?.length || 0)
    + (research.emerging_tech?.length || 0);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div style="background-color:#00050f;padding:24px 32px;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#00E5FA;letter-spacing:0.5px;">MISSION MEETS TECH</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">Newsletter Research Package</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px 0;">Research Package Ready</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
        Target publish date: ${escapeHtml(publishDate)} &mdash; ${totalItems} items compiled
      </p>

      <!-- Top Items Preview -->
      <h3 style="font-size:15px;font-weight:600;color:#374151;margin:0 0 12px;">Top Items</h3>
      ${itemsHtml}

      <!-- Editorial Angles -->
      ${anglesHtml ? `
      <div style="margin-top:24px;padding:16px 20px;border-left:4px solid #00E5FA;background-color:#f0f9ff;border-radius:0 8px 8px 0;">
        <h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.5px;">Suggested Angles</h3>
        <ul style="margin:0;padding-left:20px;">${anglesHtml}</ul>
      </div>` : ""}

      <!-- Stats -->
      <div style="margin-top:24px;padding:16px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <h3 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Package Contents</h3>
        <p style="margin:0;font-size:14px;color:#374151;">
          <strong>${research.top_stories?.length || 0}</strong> top stories &middot;
          <strong>${research.procurement_moves?.length || 0}</strong> procurement moves &middot;
          <strong>${research.industry_news?.length || 0}</strong> industry items &middot;
          <strong>${research.policy_legislative?.length || 0}</strong> policy items &middot;
          <strong>${research.emerging_tech?.length || 0}</strong> emerging tech
        </p>
        <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Full package available in Supabase <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:12px;">newsletter_research</code> table.</p>
      </div>

    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">
        <a href="https://missionmeetstech.com" style="color:#0369a1;text-decoration:none;">Mission Meets Tech</a> &mdash; Federal Health IT Intelligence
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        This is an automated report. Do not reply to this email.
      </p>
    </div>

  </div>
</body>
</html>`;
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
  const killCheck = checkKillSwitch("newsletter-research-background");
  if (killCheck.blocked) return killCheck.response;

  console.log("Newsletter research triggered:", new Date().toISOString());

  if (!PERPLEXITY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars (PERPLEXITY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY)");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Determine target publish date
  // If Monday run → Tuesday; if Thursday run → Friday; otherwise next day
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, 4=Thu
  const publishDate = new Date(now);
  publishDate.setUTCDate(publishDate.getUTCDate() + 1); // Default: next day
  const publishDateStr = publishDate.toISOString().split("T")[0];

  console.log(`Target publish date: ${publishDateStr} (today is day ${dayOfWeek})`);

  const modelConfig = await getModelConfig(null, "newsletter_research");

  const systemPrompt = `You are a federal health IT intelligence analyst compiling a research package for the Mission Meets Tech newsletter. Search for developments from the past 3-4 days.

Research these five categories using targeted web searches:

1. TOP STORIES: Major federal health IT developments across DHA, VA, DoD health, CMS health tech, ARPA-H. Include policy changes, budget moves, leadership changes, program milestones, and industry news.

2. PROCUREMENT MOVES: New solicitations, awards, modifications, protests, or contract actions related to military health system, VA health IT, and federal health agencies. Check SAM.gov, USAspending.gov, and trade press.

3. INDUSTRY & VENDOR NEWS: Moves by key contractors (Leidos, Oracle Health, Booz Allen, GDIT, Accenture Federal, Maximus, Peraton, TriWest, Humana Military) in the federal health space.

4. POLICY & LEGISLATIVE: NDAA provisions, appropriations, FAR/DFARS changes, executive orders, or congressional actions affecting federal health IT procurement.

5. EMERGING TECH: AI in federal healthcare, interoperability standards (FHIR, HL7, TEFCA), cybersecurity in health IT, telehealth policy changes.

Return a JSON object:
{
  "compiled_date": "YYYY-MM-DD",
  "target_publish_date": "YYYY-MM-DD",
  "top_stories": [
    { "headline": "...", "summary": "2-3 sentences", "source_url": "...", "significance": "high|medium", "category": "DHA|VA|CMS|ARPA-H|DoD" }
  ],
  "procurement_moves": [
    { "action_type": "solicitation|award|modification|protest|sources_sought", "title": "...", "agency": "...", "detail": "1-2 sentences", "source_url": "...", "solicitation_number": "if available" }
  ],
  "industry_news": [
    { "company": "...", "headline": "...", "detail": "1-2 sentences", "source_url": "..." }
  ],
  "policy_legislative": [
    { "type": "NDAA|appropriations|FAR|executive_order|congressional", "headline": "...", "detail": "1-2 sentences", "source_url": "..." }
  ],
  "emerging_tech": [
    { "topic": "AI|FHIR|cybersecurity|telehealth|interoperability", "headline": "...", "detail": "1-2 sentences", "source_url": "..." }
  ],
  "editorial_angles": [
    "Suggested newsletter angle 1 based on what's most significant this week",
    "Suggested newsletter angle 2"
  ]
}

Return ONLY valid JSON. Every item must include a source_url.`;

  const userMessage = `Compile the research package for the Mission Meets Tech newsletter targeting publish date ${publishDateStr}. Today is ${now.toISOString().split("T")[0]}. Search for federal health IT developments from the past 3-4 days across all five categories.`;

  try {
    console.log(`Calling Perplexity (${modelConfig.model}) for newsletter research...`);
    const research = await callPerplexity(systemPrompt, userMessage, modelConfig.model, 8000, supabase);

    // Ensure required fields
    research.compiled_date = research.compiled_date || now.toISOString().split("T")[0];
    research.target_publish_date = research.target_publish_date || publishDateStr;

    // Insert into Supabase
    const { error: insertErr } = await supabase
      .from("newsletter_research")
      .insert({
        publish_date: publishDateStr,
        research_json: research,
        status: "ready",
      });

    if (insertErr) {
      console.error("Failed to insert research into Supabase:", insertErr);
      return { statusCode: 500, body: JSON.stringify({ error: insertErr.message }) };
    }

    console.log("Research package stored in Supabase");

    // Send summary email
    const emailHtml = buildResearchSummaryHtml(publishDateStr, research);
    const emailResult = await sendEmail({
      to: "mary@missionmeetstech.com",
      subject: `Newsletter Research Package Ready — ${publishDateStr}`,
      html: emailHtml,
      from: "MMT Intel <noreply@missionmeetstech.com>",
    });

    if (emailResult.success) {
      console.log("Research summary email sent");
    } else {
      console.error("Email send failed:", emailResult.error);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        publish_date: publishDateStr,
        items: {
          top_stories: research.top_stories?.length || 0,
          procurement_moves: research.procurement_moves?.length || 0,
          industry_news: research.industry_news?.length || 0,
          policy_legislative: research.policy_legislative?.length || 0,
          emerging_tech: research.emerging_tech?.length || 0,
        },
      }),
    };
  } catch (err) {
    console.error("Newsletter research failed:", err.message, err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
