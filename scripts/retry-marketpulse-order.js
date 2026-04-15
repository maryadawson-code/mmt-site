#!/usr/bin/env node
// ============================================================
// retry-marketpulse-order.js — Local runner for failed MarketPulse orders
//
// Bypasses Netlify function execution entirely. Runs the same
// research pipeline locally, stores the report, and delivers via email.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... RESEND_API_KEY=re_... SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=ey... \
//     node scripts/retry-marketpulse-order.js
//
// Or just: source .env.local && node scripts/retry-marketpulse-order.js
// ============================================================

const crypto = require("crypto");

// --- Configuration (edit these for the order to retry) ---
const ORDER = {
  id: "admin_1776284690564_maryadawsongmailcom",
  email: "maryadawson@gmail.com",
  name: "mary Womack",
  topic: "I want to know exactly where telehealth dollars are going in the VA aligned to the 2027 budget and the presidential budget.",
  audience: "",
  company: null,
};

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

if (!PERPLEXITY_API_KEY || !ANTHROPIC_API_KEY || !RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing env vars. Need: PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY");
  process.exit(1);
}

// --- Helpers ---
async function callClaudeSearch(systemPrompt, userPrompt, maxTokens = 8000) {
  console.log(`  [Perplexity] Calling ${PERPLEXITY_MODEL} (max ${maxTokens} tokens)...`);
  const start = Date.now();
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      response = await fetch(PERPLEXITY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify({
          model: PERPLEXITY_MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          web_search_options: { search_context_size: "high" },
        }),
      });
      if (response.ok) break;
      if ([429, 500, 502, 503, 529].includes(response.status) && attempt < 3) {
        const delay = Math.round(5000 * Math.pow(2, attempt));
        console.log(`  [RETRY] HTTP ${response.status}, attempt ${attempt + 1}/4, waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    } catch (fetchErr) {
      if (attempt < 3) {
        const delay = Math.round(5000 * Math.pow(2, attempt));
        console.log(`  [RETRY] ${fetchErr.message}, attempt ${attempt + 1}/4, waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw fetchErr;
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Perplexity API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textContent = data.choices?.[0]?.message?.content || "";
  const citations = data.citations || [];
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`  [Claude+Search] Done in ${elapsed}s — ${textContent.length} chars, ${citations.length} citations`);
  return { content: textContent, citations };
}

async function callClaude(systemPrompt, userPrompt, maxTokens = 8000) {
  console.log(`  [Claude] Calling ${CLAUDE_MODEL} (no search, max ${maxTokens} tokens)...`);
  const start = Date.now();
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          temperature: 0.1,
        }),
      });
      if (response.ok) break;
      if ([429, 500, 502, 503, 529].includes(response.status) && attempt < 3) {
        const delay = Math.round(5000 * Math.pow(2, attempt));
        console.log(`  [RETRY] HTTP ${response.status}, attempt ${attempt + 1}/4, waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    } catch (fetchErr) {
      if (attempt < 3) {
        const delay = Math.round(5000 * Math.pow(2, attempt));
        console.log(`  [RETRY] ${fetchErr.message}, attempt ${attempt + 1}/4, waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw fetchErr;
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.content?.find(b => b.type === "text")?.text || "";
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`  [Claude] Done in ${elapsed}s — ${text.length} chars`);
  return { content: text, citations: [] };
}

// --- Pipeline ---
async function runPipeline() {
  const startTime = Date.now();
  console.log(`\n=== MarketPulse Local Retry ===`);
  console.log(`Order: ${ORDER.id}`);
  console.log(`Email: ${ORDER.email}`);
  console.log(`Topic: ${ORDER.topic}\n`);

  // Pass 1: Landscape scan with web search
  console.log("Pass 1: Landscape scan...");
  const pass1 = await callClaudeSearch(
    `You are a senior federal procurement intelligence analyst specializing in federal health IT, VA, DoD health, and HHS. You are researching a topic for a paying customer who needs actionable intelligence for business development.

RULES:
- Search for CURRENT data (2025-2026 fiscal years, current administration actions)
- Cite specific dollar amounts, contract numbers, NAICS codes, vendors, and timelines
- Prioritize .gov sources (SAM.gov, USASpending.gov, VA.gov, congress.gov, CBO, GAO)
- If you find budget documents, cite the exact line items and amounts
- Do NOT pad with generic program descriptions the customer already knows
- An honest "data not yet published" is better than speculation`,
    `Research this topic thoroughly using web search:

"${ORDER.topic}"

Search for:
1. VA FY2027 budget request / presidential budget — telehealth and virtual health line items
2. VA FY2026 and FY2025 telehealth spending for comparison
3. VA Connected Care / Office of Connected Care budget and programs
4. VA Video Connect (VVC) usage statistics and funding
5. ATLAS (Accessing Telehealth through Local Area Stations) program funding
6. VA EHRM (Electronic Health Record Modernization) telehealth components
7. Recent GAO or OIG reports on VA telehealth spending
8. Congressional testimony or committee reports on VA telehealth funding

For each finding, provide the specific dollar amount, source, and fiscal year.`,
    12000
  );

  // Pass 2: Deep analysis and competitive landscape
  console.log("\nPass 2: Deep analysis...");
  const pass2 = await callClaudeSearch(
    `You are a senior federal procurement intelligence analyst. You have initial research findings below. Now dig deeper into specific contract vehicles, vendor incumbents, and upcoming opportunities.

RULES:
- Search for SPECIFIC contracts, task orders, and solicitations
- Identify incumbent vendors and their contract values
- Look for recompete timelines and upcoming solicitations
- Check for any DOGE-related impacts on VA telehealth programs
- Cross-reference with USASpending.gov award data
- If budget documents aren't published yet, say so clearly and provide the expected release date`,
    `Based on initial research on VA telehealth/virtual health budget allocation, dig deeper:

INITIAL FINDINGS:
${pass1.content.substring(0, 6000)}

NOW SEARCH FOR:
1. Specific VA telehealth contracts on SAM.gov and USASpending.gov (search "VA telehealth" "VA virtual health" "VA connected care")
2. VA Office of Connected Care contract awards 2024-2026
3. T4NG and T4NG2 task orders related to telehealth
4. VA Video Connect platform contracts and vendors
5. Any FY2027 budget justification documents published by VA
6. House/Senate Veterans Affairs Committee markups of VA budget
7. Vendor-specific intelligence: who holds VA telehealth contracts (e.g., Booz Allen, Accenture, etc.)
8. Set-aside status of VA telehealth contracts (small business, SDVOSB, etc.)

Provide contract numbers, award amounts, vendors, period of performance, and NAICS codes where available.`,
    12000
  );

  // Pass 3: Synthesis into structured report
  console.log("\nPass 3: Synthesis...");
  const pass3 = await callClaude(
    `You are a senior federal procurement intelligence analyst producing a final research report. Synthesize all findings into a structured, actionable intelligence brief.

FORMATTING RULES:
- Use clear section headers with ## markdown
- Include specific dollar amounts, dates, and source citations
- Rate confidence of each major finding as HIGH / MEDIUM / LOW
- End with a "Strategic Implications" section with actionable takeaways
- End with a "Methodology & Limitations" section noting what was searched, what was found, and what data gaps remain
- Do NOT use banned words: pivotal, comprehensive, robust, transformative, leverage, synergy, paradigm, holistic, streamline, actionable, ecosystem
- Do NOT use "Furthermore" or "Moreover" or "In conclusion" or "Additionally"
- Write in a direct, professional tone — no filler, no padding`,
    `Synthesize all research into a final MarketPulse intelligence report.

TOPIC: ${ORDER.topic}

LANDSCAPE SCAN FINDINGS:
${pass1.content}

DEEP ANALYSIS FINDINGS:
${pass2.content}

Structure the report as:
1. Executive Summary (3-5 key findings with confidence ratings)
2. Budget Overview (FY2027 telehealth allocation, comparison to prior years)
3. Where the Money Is Going (specific programs, line items, dollar amounts)
4. Contract Landscape (active contracts, incumbents, vehicles)
5. Upcoming Opportunities (recompetes, new solicitations, timelines)
6. Key Players (decision-makers, contracting officers, program managers)
7. Risk Factors (DOGE impacts, budget uncertainty, policy changes)
8. Strategic Implications (what this means for a federal health IT contractor)
9. Methodology & Limitations (what was searched, data gaps, confidence assessment)

Be specific. Cite sources. If data isn't available, say so and explain when it will be.`,
    16000
  );

  // Collect all citations
  const allCitations = [...new Set([...pass1.citations, ...pass2.citations])];
  console.log(`\nTotal unique citations: ${allCitations.length}`);

  // Render HTML using the project's renderer
  const { renderMarketPulseHTML } = require("../netlify/functions/lib/report-html-renderer");
  const generatedAt = new Date().toISOString();
  const reportHtml = renderMarketPulseHTML({
    name: ORDER.name,
    company: ORDER.company,
    topic: ORDER.topic,
    audience: ORDER.audience,
    generatedAt,
    synthesis: pass3.content,
    citations: allCitations,
  });
  console.log(`Report HTML: ${Math.round(reportHtml.length / 1024)}KB`);

  // Store in Supabase
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Generate report URL
  const secret = SUPABASE_SERVICE_KEY; // fallback, same as report-url.js
  const token = crypto.createHmac("sha256", secret).update(ORDER.id + "marketpulse").digest("hex");
  const reportUrl = `https://missionmeetstech.com/.netlify/functions/view-report?id=${ORDER.id}&type=marketpulse&token=${token}`;

  // Update the existing order
  const { error: updateErr } = await supabase.from("marketpulse_orders").update({
    status: "delivered",
    report_html: reportHtml,
    report_url: reportUrl,
    error_message: null,
  }).eq("id", ORDER.id);

  if (updateErr) {
    console.error("Supabase update failed:", updateErr.message);
    // Still try to send email
  } else {
    console.log(`Order ${ORDER.id} updated to 'delivered' with report URL`);
  }

  // Send delivery email via Resend
  const firstName = (ORDER.name || "").split(" ")[0] || "there";
  const emailPayload = {
    from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    to: [ORDER.email],
    subject: `Your MarketPulse Report: ${ORDER.topic.slice(0, 60)}...`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#0a0e17;padding:32px 40px;text-align:center;">
    <div style="font-size:24px;font-weight:700;color:#00e5fa;letter-spacing:0.5px;">MARKETPULSE</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">Federal Health IT Market Intelligence</div>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:16px;color:#1e293b;margin:0 0 16px;">Hi ${firstName},</p>
    <p style="font-size:16px;color:#1e293b;margin:0 0 24px;">Your MarketPulse report is ready.</p>
    <p style="font-size:14px;color:#475569;margin:0 0 8px;font-weight:600;">Topic</p>
    <p style="font-size:16px;color:#1e293b;margin:0 0 24px;">${ORDER.topic.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${reportUrl}" style="display:inline-block;background:#00e5fa;color:#0a0e17;font-weight:700;font-size:16px;padding:14px 40px;text-decoration:none;border-radius:6px;">View Your Report</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">This link expires in 90 days. Right-click and "Save As" to keep a permanent copy.</p>
  </div>
  <div style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#9ca3af;">
    Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#0369a1;">missionmeetstech.com</a><br>
    AI-assisted research. Verify all claims independently.
  </div>
</div>`,
  };

  console.log("\nSending delivery email...");
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(emailPayload),
  });

  if (!emailResponse.ok) {
    const errBody = await emailResponse.text();
    console.error(`Resend API error: ${emailResponse.status} — ${errBody}`);
  } else {
    const emailData = await emailResponse.json();
    console.log(`Delivery email sent: ${emailData.id}`);
  }

  // Notify Mary
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      to: ["mary@missionmeetstech.com"],
      subject: `[MarketPulse] RETRY DELIVERED — ${ORDER.name} (${ORDER.email})`,
      html: `<p>Manual retry delivered via local script.</p>
        <p><strong>Order:</strong> ${ORDER.id}</p>
        <p><strong>Topic:</strong> ${ORDER.topic}</p>
        <p><strong>Report URL:</strong> <a href="${reportUrl}">${reportUrl}</a></p>
        <p><strong>Pipeline time:</strong> ${Math.round((Date.now() - startTime) / 1000)}s</p>`,
    }),
  });

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n=== COMPLETE in ${totalTime}s ===`);
  console.log(`Report URL: ${reportUrl}`);
}

runPipeline().catch(err => {
  console.error("\nPIPELINE FAILED:", err.message);
  process.exit(1);
});
