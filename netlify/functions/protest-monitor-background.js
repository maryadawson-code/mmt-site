// ============================================================
// protest-monitor-background.js — Netlify Background Function
//
// Daily at 8 AM ET (12:00 UTC): checks GAO protest status for
// all active cases in the protest_monitor table using Perplexity
// Sonar Pro. Sends email alert on status changes.
//
// Schedule configured in netlify.toml:
//   [functions."protest-monitor"]
//     schedule = "0 12 * * *"
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
  }));

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
      await trackPerplexity(_supabase, { functionName: 'protest-monitor-background', product: 'mmt-intel', model, usage: { input_tokens: finalData.usage?.prompt_tokens, output_tokens: finalData.usage?.completion_tokens }, latencyMs: Date.now() - _t });
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

// --- Email template for protest status alert ---

function buildProtestAlertHtml(caseData, result) {
  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  const developmentRows = (result.developments || [])
    .map((d) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;white-space:nowrap;">${escapeHtml(d.date)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(d.event)}${d.source_url ? ` <a href="${escapeHtml(d.source_url)}" style="color:#0369a1;text-decoration:none;font-size:12px;">[source]</a>` : ""}</td>
      </tr>`)
    .join("");

  const sourcesHtml = (result.sources || [])
    .map((url) => `<li style="margin-bottom:4px;"><a href="${escapeHtml(url)}" style="color:#0369a1;text-decoration:none;font-size:13px;word-break:break-all;">${escapeHtml(url)}</a></li>`)
    .join("");

  const statusColor = result.current_status === "Case Currently Open" ? "#eab308"
    : result.current_status === "Sustained" ? "#16a34a"
    : result.current_status === "Denied" ? "#ef4444"
    : "#6b7280";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div style="background-color:#00050f;padding:24px 32px;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#00E5FA;letter-spacing:0.5px;">MISSION MEETS TECH</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">GAO Protest Monitor</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px 0;">Protest Status Update</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
        Case ${escapeHtml(caseData.case_number)} &mdash; ${escapeHtml(caseData.protester)} v. ${escapeHtml(caseData.agency)}
      </p>

      <!-- Status Badge -->
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;padding:12px 24px;border-radius:8px;border:2px solid ${statusColor};background-color:rgba(0,0,0,0.02);">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Current Status</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:${statusColor};">${escapeHtml(result.current_status)}</p>
        </div>
      </div>

      ${result.status_changed ? `
      <div style="padding:12px 16px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:20px;">
        <p style="margin:0;font-size:14px;color:#991b1b;"><strong>Status Changed</strong> from "${escapeHtml(caseData.last_status)}" to "${escapeHtml(result.current_status)}"</p>
      </div>` : ""}

      <!-- Details -->
      <div style="margin-bottom:24px;padding:16px 20px;border-left:4px solid #00E5FA;background-color:#f0f9ff;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:15px;color:#1e3a5f;line-height:1.5;">${escapeHtml(result.details)}</p>
      </div>

      ${result.corrective_action ? `
      <div style="margin-bottom:24px;padding:16px 20px;background-color:#fefce8;border:1px solid #fde68a;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#854d0e;">Corrective Action</p>
        <p style="margin:0;font-size:14px;color:#854d0e;line-height:1.5;">${escapeHtml(result.corrective_action)}</p>
      </div>` : ""}

      ${result.next_milestone ? `
      <div style="margin-bottom:24px;padding:16px 20px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#16a34a;">Next Milestone</p>
        <p style="margin:0;font-size:14px;color:#166534;line-height:1.5;">${escapeHtml(result.next_milestone)}</p>
      </div>` : ""}

      <!-- Developments -->
      ${developmentRows ? `
      <h3 style="font-size:15px;font-weight:600;color:#374151;margin:0 0 8px;">Recent Developments</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        ${developmentRows}
      </table>` : ""}

      <!-- Case Details -->
      <div style="margin-top:24px;padding:16px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <h3 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Case Details</h3>
        <p style="margin:0;font-size:14px;color:#374151;">
          <strong>Solicitation:</strong> ${escapeHtml(caseData.solicitation_number || "N/A")}<br>
          <strong>Filed:</strong> ${escapeHtml(caseData.filed_date)}<br>
          <strong>Due Date:</strong> ${escapeHtml(caseData.due_date)}
        </p>
      </div>

      <!-- Sources -->
      ${sourcesHtml ? `
      <div style="margin-top:20px;">
        <h3 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Sources</h3>
        <ul style="margin:0;padding-left:20px;">${sourcesHtml}</ul>
      </div>` : ""}

    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">
        <a href="https://missionmeetstech.com" style="color:#0369a1;text-decoration:none;">Mission Meets Tech</a> &mdash; Federal Health IT Intelligence
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        This is an automated alert. Do not reply to this email.
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
  const killCheck = checkKillSwitch("protest-monitor-background");
  if (killCheck.blocked) return killCheck.response;

  console.log("Protest monitor triggered:", new Date().toISOString());

  if (!PERPLEXITY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars (PERPLEXITY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY)");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Read all active cases (not decided, dismissed, or withdrawn)
  const { data: activeCases, error: fetchErr } = await supabase
    .from("protest_monitor")
    .select("*")
    .not("status", "in", '("Decided","Dismissed","Withdrawn")');

  if (fetchErr) {
    console.error("Failed to fetch active cases:", fetchErr);
    return { statusCode: 500, body: JSON.stringify({ error: fetchErr.message }) };
  }

  if (!activeCases || activeCases.length === 0) {
    console.log("No active protest cases to monitor.");
    return { statusCode: 200, body: JSON.stringify({ message: "No active cases" }) };
  }

  console.log(`Monitoring ${activeCases.length} active protest case(s)`);

  const modelConfig = await getModelConfig(null, "protest_monitor");
  let updatedCount = 0;
  let alertCount = 0;

  for (const caseRow of activeCases) {
    try {
      console.log(`Checking case ${caseRow.case_number}...`);

      const systemPrompt = `You are a federal procurement protest analyst. Search for the current status of GAO protest case ${caseRow.case_number}.

Search these sources:
1. GAO.gov protest docket (gao.gov/products) for case ${caseRow.case_number}
2. Any news coverage of solicitation ${caseRow.solicitation_number}
3. Agency corrective action notices related to ${caseRow.solicitation_number}

Return a JSON object:
{
  "current_status": "Case Currently Open | Sustained | Denied | Dismissed | Withdrawn | Corrective Action Taken",
  "status_changed": true/false,
  "details": "2-3 sentence summary of current state",
  "developments": [
    { "date": "YYYY-MM-DD", "event": "description", "source_url": "url" }
  ],
  "corrective_action": null or "description of corrective action if any",
  "next_milestone": "description of next expected event and approximate date",
  "sources": ["url1", "url2"]
}

Return ONLY valid JSON.`;

      const userMessage = `Check the current status of GAO protest case ${caseRow.case_number} filed by ${caseRow.protester} against ${caseRow.agency} regarding solicitation ${caseRow.solicitation_number}. The case was filed on ${caseRow.filed_date} with a due date of ${caseRow.due_date}. Last known status: ${caseRow.status}.`;

      const result = await callPerplexity(systemPrompt, userMessage, modelConfig.model, 4000, supabase);

      // Compare status
      const statusChanged = result.current_status && result.current_status !== caseRow.last_status;
      const hasDevelopments = result.developments && result.developments.length > 0;

      if (statusChanged || hasDevelopments) {
        // Build updated status history
        const statusHistory = Array.isArray(caseRow.status_history) ? [...caseRow.status_history] : [];
        if (statusChanged) {
          statusHistory.push({
            from: caseRow.status,
            to: result.current_status,
            date: new Date().toISOString(),
            details: result.details,
          });
        }

        // Update Supabase row
        const { error: updateErr } = await supabase
          .from("protest_monitor")
          .update({
            status: result.current_status || caseRow.status,
            last_status: caseRow.status,
            last_checked: new Date().toISOString(),
            status_history: statusHistory,
            details: {
              summary: result.details,
              developments: result.developments,
              corrective_action: result.corrective_action,
              next_milestone: result.next_milestone,
              sources: result.sources,
              checked_at: new Date().toISOString(),
            },
            alert_sent: true,
          })
          .eq("id", caseRow.id);

        if (updateErr) {
          console.error(`Failed to update case ${caseRow.case_number}:`, updateErr);
          continue;
        }

        updatedCount++;

        // Send alert email
        const emailHtml = buildProtestAlertHtml(caseRow, result);
        const emailResult = await sendEmail({
          to: "mary@missionmeetstech.com",
          subject: `GAO Protest Update: ${caseRow.case_number}`,
          html: emailHtml,
          from: "MMT Intel <noreply@missionmeetstech.com>",
        });

        if (emailResult.success) {
          console.log(`  Alert sent for case ${caseRow.case_number}`);
          alertCount++;
        } else {
          console.error(`  Email failed for case ${caseRow.case_number}:`, emailResult.error);
        }
      } else {
        // No change — update last_checked only
        await supabase
          .from("protest_monitor")
          .update({ last_checked: new Date().toISOString() })
          .eq("id", caseRow.id);

        console.log(`  No change for case ${caseRow.case_number}`);
      }
    } catch (err) {
      console.error(`Error checking case ${caseRow.case_number}:`, err.message);
    }
  }

  console.log(`Protest monitor complete: ${updatedCount} updated, ${alertCount} alerts sent`);

  return {
    statusCode: 200,
    body: JSON.stringify({ updated: updatedCount, alerts: alertCount }),
  };
};
