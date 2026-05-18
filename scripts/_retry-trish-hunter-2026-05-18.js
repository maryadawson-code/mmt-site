#!/usr/bin/env node
// ============================================================
// _retry-trish-hunter-2026-05-18.js — one-shot retry for
// Trish Hunter's MarketPulse v4 order (withheld 2026-05-18).
//
// The general scripts/retry-marketpulse-order.js is hard-coded
// for an earlier VA-telehealth retry. This is a topic-agnostic
// runner that takes ORDER.topic verbatim into the prompts.
//
// Delete after Trish's order is delivered.
//
// Usage (env vars sourced from netlify env:get):
//   eval $(netlify env:list --plain | sed 's/^/export /') \
//     node scripts/_retry-trish-hunter-2026-05-18.js
// ============================================================

const crypto = require("crypto");

const ORDER = {
  id: "68bdaff2-4b14-4506-bc43-9e926ed63151",
  email: "thunter@fhas.com",
  name: "Trish Hunter",
  topic: "What is the full list of contracts that C2C Innovative Solutions is either a prime or subcontractor on? For each of those contracts, what is the estimated contract end date?",
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

async function callPerplexity(systemPrompt, userPrompt, maxTokens = 12000) {
  const start = Date.now();
  console.log(`  [Perplexity] Calling ${PERPLEXITY_MODEL} (max ${maxTokens} tokens)...`);
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      response = await fetch(PERPLEXITY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${PERPLEXITY_API_KEY}` },
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
    } catch (err) {
      if (attempt < 3) {
        const delay = Math.round(5000 * Math.pow(2, attempt));
        console.log(`  [RETRY] ${err.message}, attempt ${attempt + 1}/4, waiting ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
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
  console.log(`  [Perplexity] Done in ${elapsed}s — ${textContent.length} chars, ${citations.length} citations`);
  return { content: textContent, citations };
}

async function callClaude(systemPrompt, userPrompt, maxTokens = 16000) {
  const start = Date.now();
  console.log(`  [Claude] Calling ${CLAUDE_MODEL} (max ${maxTokens} tokens)...`);
  const response = await fetch(ANTHROPIC_URL, {
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
    }),
  });
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

async function runPipeline() {
  const startTime = Date.now();
  console.log(`\n=== MarketPulse Local Retry (one-shot) ===`);
  console.log(`Order: ${ORDER.id}`);
  console.log(`Email: ${ORDER.email}`);
  console.log(`Topic: ${ORDER.topic}\n`);

  // Pass 1: Landscape scan — topic-agnostic
  console.log("Pass 1: Landscape scan...");
  const pass1 = await callPerplexity(
    `You are a senior federal procurement intelligence analyst specializing in federal health IT, VA, DoD health, CMS, and HHS contracting. You are researching a vendor / contracts topic for a paying customer who needs actionable intelligence for business development.

RULES:
- Search for CURRENT data (2024-2026 fiscal years, current administration actions).
- Cite specific contract numbers (PIIDs), award amounts, periods of performance, NAICS codes, agencies, and contracting offices.
- Prioritize .gov sources: SAM.gov (active solicitations + entity records), USASpending.gov (award history + sub-awards), FPDS (legacy archive), GAO (protests), CMS / VA program pages, congress.gov.
- For vendor questions, search SAM.gov entity records, USASpending recipient summary, USASpending sub-award database, and CMS / VA / DoD vendor pages.
- An honest "data not yet published" is better than speculation. Flag any inference as such.
- Do NOT pad with generic context the customer already knows.`,
    `Research this topic thoroughly using web search:

"${ORDER.topic}"

For a vendor / contracts question, search:
1. USASpending.gov "recipient" search for the vendor name (prime contracts).
2. USASpending.gov sub-award search for the vendor name (subcontractor positions).
3. SAM.gov entity records (UEI, DUNS, NAICS profile, contact info).
4. SAM.gov current solicitations naming the vendor (active opportunities).
5. FPDS legacy archive (closed contracts pre-2026 FPDS sunset).
6. CMS, VA, DoD program-office pages naming the vendor or their incumbents.
7. GAO bid-protest decisions involving the vendor (gives visibility into recompete dynamics).
8. Recent press releases / SEC filings (if publicly traded) for total contract value disclosures.

For each contract / task order found:
- Contract or task-order number (PIID)
- Awarding agency + contracting office
- Award date and period of performance (start / end / final option)
- Total contract value (obligated + ceiling)
- Whether vendor is prime or sub (and if sub, the prime)
- Set-aside status (WOSB / SDVOSB / 8(a) / small business / unrestricted)
- Estimated end date and any extension / recompete signal

Provide the most complete contract inventory you can assemble.`,
    14000
  );

  // Pass 2: Deep follow-on — uses Pass 1 findings + topic verbatim
  console.log("\nPass 2: Deep analysis...");
  const pass2 = await callPerplexity(
    `You are a senior federal procurement intelligence analyst. You have initial research findings below. Dig deeper into specific contracts, task orders, sub-award positions, recompete timelines, and any documented contract modifications or extensions.

RULES:
- Use the initial findings as anchors. Cross-reference each PIID against SAM.gov and USASpending.gov to verify dates.
- Look for contract modifications that changed end dates.
- If a contract is on a parent IDIQ / BPA, identify the parent vehicle and remaining ceiling.
- Surface any documented protest, default, or termination affecting the vendor.
- Identify upcoming recompetes (typically signaled by SAM.gov sources sought / draft RFPs in the 12-24 months before contract end).`,
    `Based on initial findings on the vendor / contracts topic below, dig deeper:

ORIGINAL TOPIC: "${ORDER.topic}"

INITIAL FINDINGS:
${pass1.content.substring(0, 6000)}

NOW SEARCH FOR:
1. SAM.gov modification history for each contract listed in initial findings.
2. USASpending.gov "transaction" view for each award (shows modifications + obligated-to-date).
3. The parent IDIQ / BPA each task order sits under (if applicable) and that vehicle's recompete schedule.
4. Sub-award database entries — any contracts where the vendor is positioned as a subcontractor with a named prime.
5. Recent GAO protest decisions naming the vendor as protester or awardee.
6. Any CMS / VA / DoD industry-day or sources-sought notices that name this vendor or the vehicle.
7. Estimated end date for each contract — verify against the latest modification, not the original award.

For each contract, provide the latest verified end date with a source citation. If the contract has an option period, note whether the option has been exercised.`,
    14000
  );

  // Pass 3: Synthesis — topic-agnostic structure
  console.log("\nPass 3: Synthesis...");
  const pass3 = await callClaude(
    `You are a senior federal procurement intelligence analyst producing a final research brief for a paying customer. Synthesize the findings into a structured, actionable intelligence report.

FORMATTING RULES:
- Use clear ## section headers and structured tables where appropriate.
- Include specific dollar amounts, contract numbers (PIIDs), agencies, dates, and source citations.
- Rate confidence of each major finding: VERIFIED (primary source) / CORROBORATED (secondary) / DIRECTIONAL (inferred).
- End with a "Strategic Implications" section.
- End with a "Methodology & Limitations" section.
- Do NOT use banned words: pivotal, comprehensive, robust, transformative, leverage, synergy, paradigm, holistic, streamline, actionable, ecosystem.
- Do NOT use "Furthermore" / "Moreover" / "In conclusion" / "Additionally".
- Write in a direct, professional tone — no filler.`,
    `Synthesize all research into a final MarketPulse intelligence report responding directly to the customer's question.

CUSTOMER TOPIC: "${ORDER.topic}"

LANDSCAPE SCAN FINDINGS:
${pass1.content}

DEEP ANALYSIS FINDINGS:
${pass2.content}

Structure the report as:
1. Executive Summary (3-5 key findings with confidence ratings)
2. Vendor Profile (legal name, UEI / DUNS, NAICS focus, set-aside status, HQ)
3. Prime Contracts (table: PIID, agency, total value, period of performance, end date, confidence)
4. Subcontractor Positions (table: prime + parent PIID + period of performance + value where disclosed)
5. Parent Vehicles (IDIQs, BPAs, schedules the vendor sits on)
6. Recompete Pipeline (upcoming end dates within 24 months + sources-sought / draft RFP signals)
7. Risk Factors (protests, modifications, terminations, set-aside vulnerabilities)
8. Strategic Implications (what this means for the customer's BD posture)
9. Methodology & Limitations (what was searched, data gaps, what to verify before action)

Be specific. Cite PIIDs and source URLs. If a contract's end date is uncertain, label it DIRECTIONAL with the latest verifiable signal. Use the customer's exact topic framing — they asked for the full list of contracts (prime + sub) with estimated end dates. Deliver that list.`,
    18000
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

  const secret = SUPABASE_SERVICE_KEY;
  const token = crypto.createHmac("sha256", secret).update(ORDER.id + "marketpulse").digest("hex");
  const reportUrl = `https://missionmeetstech.com/.netlify/functions/view-report?id=${ORDER.id}&type=marketpulse&token=${token}`;

  const { error: updateErr } = await supabase.from("marketpulse_orders").update({
    status: "delivered",
    report_html: reportHtml,
    report_url: reportUrl,
    error_message: null,
    completed_at: new Date().toISOString(),
  }).eq("id", ORDER.id);

  if (updateErr) {
    console.error("Supabase update failed:", updateErr.message);
  } else {
    console.log(`Order ${ORDER.id} updated to 'delivered' with report URL`);
  }

  // Send delivery email via Resend
  const firstName = (ORDER.name || "").split(" ")[0] || "there";
  const emailPayload = {
    from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    to: [ORDER.email],
    subject: `Your MarketPulse Report: ${ORDER.topic.slice(0, 60)}...`,
    html: `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#0A192F;padding:32px 40px;text-align:center;">
    <div style="font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:0.5px;">MARKETPULSE</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">Federal Health IT Market Intelligence</div>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:16px;color:#0A192F;margin:0 0 16px;">Hi ${firstName},</p>
    <p style="font-size:16px;color:#0A192F;margin:0 0 24px;">Your MarketPulse report is ready.</p>
    <p style="font-size:14px;color:#5C6B7A;margin:0 0 8px;font-weight:600;">Topic</p>
    <p style="font-size:16px;color:#0A192F;margin:0 0 24px;">${ORDER.topic.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${reportUrl}" style="display:inline-block;background:#0A192F;color:#FFFFFF;font-weight:700;font-size:16px;padding:14px 40px;text-decoration:none;border-radius:6px;">View Your Report</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">This link expires in 90 days. Right-click and "Save As" to keep a permanent copy.</p>
  </div>
  <div style="padding:20px 40px;background:#F3F4F6;border-top:1px solid #D8E0E8;text-align:center;font-size:12px;color:#5C6B7A;">
    Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#457B9D;">missionmeetstech.com</a><br>
    AI-assisted research. Verify all claims independently.
  </div>
</div>`,
  };

  console.log("\nSending delivery email...");
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      to: ["mary@missionmeetstech.com"],
      subject: `[MarketPulse] RETRY DELIVERED — ${ORDER.name} (${ORDER.email})`,
      html: `<p>Manual retry delivered via local one-shot.</p>
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
  console.error(err.stack);
  process.exit(1);
});
