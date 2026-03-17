require("./lib/sentry");
// ============================================================
// generate-tactical-brief-background.js — Netlify Background Function
//
// Filename ends in -background.js → Netlify gives 15-minute timeout.
// 3-pass Perplexity pipeline (sonar-pro) → PDF generation → email delivery.
//
// POST body: { session_id, name, email, company, topic, audience, amount_paid }
// ============================================================

const { Sentry } = require("./lib/sentry");
const { generateTacticalBriefPdf } = require("./lib/tactical-brief-pdf");
const { buildDeliveryEmail, buildNotificationEmail } = require("./lib/tactical-brief-email");
const { sendEmail } = require("./lib/send-email");
const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

// Claude API for Pass 3 synthesis (Perplexity cannot follow formatting rules)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

// --- Perplexity API call ---
async function callPerplexity(systemPrompt, userPrompt) {
  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Perplexity API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    citations: data.citations || [],
  };
}

// --- Federal acronym expansion for Perplexity search disambiguation ---
function expandFederalAcronyms(topic) {
  const expansions = [
    [/\bDHA\b/g, 'Defense Health Agency (DHA)'],
    [/\bVHA\b/g, 'Veterans Health Administration (VHA)'],
    [/\bVA\b(?!\s*[A-Z]{2,})/g, 'Department of Veterans Affairs (VA)'],
    [/\bMHS\b/g, 'Military Health System (MHS)'],
    [/\bPEO-DHMS\b/gi, 'Program Executive Office Defense Healthcare Management Systems (PEO-DHMS)'],
    [/\bFEHRM\b/g, 'Federal Electronic Health Record Modernization (FEHRM)'],
    [/\bCMS\b(?!\s*[a-z])/g, 'Centers for Medicare and Medicaid Services (CMS)'],
    [/\bNIH\b/g, 'National Institutes of Health (NIH)'],
    [/\bHHS\b/g, 'Department of Health and Human Services (HHS)'],
    [/\bONC\b/g, 'Office of the National Coordinator for Health IT (ONC)'],
  ];
  let expanded = topic;
  for (const [pattern, replacement] of expansions) {
    expanded = expanded.replace(pattern, replacement);
  }
  return expanded;
}

// --- Claude synthesis (Pass 3) ---
async function synthesizeWithClaude(topic, pass1Content, pass2Content, audienceContext, companyContext) {
  const systemPrompt = `You are a senior intelligence analyst at a federal health IT research firm. You are writing a premium briefing report that costs $50. It will be rendered into a polished PDF. ${audienceContext} ${companyContext}

CRITICAL FORMATTING RULES — violation makes the PDF unusable:
1. NO citation brackets. Do not write [1] or [2] or [1,3] anywhere. Ever.
2. NO markdown. No **bold**, no *italic*, no # headers, no pipe tables (|---|).
3. Use ONLY these exact section headers on their own line in ALL CAPS:
   EXECUTIVE SUMMARY
   SITUATION OVERVIEW
   KEY FINDINGS
   COMPETITIVE LANDSCAPE
   RISKS AND WATCH ITEMS
   OPPORTUNITIES AND RECOMMENDATIONS
   TIMELINE AND MILESTONES
   METHODOLOGY
4. Confidence ratings: write (Confidence: High), (Confidence: Medium), or (Confidence: Low) inline.
5. Write numbered lists as: 1. text on its own line, 2. text on its own line
6. Write bullets as: - text on its own line
7. Competitor entries: start with COMPETITOR NAME: then prose description
8. Timeline entries: Month Year — description of event`;

  const userPrompt = `Topic: ${topic}

Research findings from Pass 1 (landscape scan):
${pass1Content}

Analysis from Pass 2 (strategic analysis):
${pass2Content}

Write the final intelligence brief. This is a $50 premium product — it must deliver maximum value. Write at least 1500 words of substantive content. Every section must be fully developed with specific facts, names, dollar values, and dates. Do not summarize when you can analyze. Do not list when you can explain.

EXECUTIVE SUMMARY: 5-6 bullet points starting with "- ". Each bullet names specific programs, dollar values, dates, or companies.

SITUATION OVERVIEW: 3-4 paragraphs on current state, why it matters now, and near-term trajectory.

KEY FINDINGS: 7-9 numbered findings. Each: number and title in caps on one line, then 2-3 sentences, then confidence rating.

COMPETITIVE LANDSCAPE: 4-6 competitor entries. Each: COMPANY NAME: then 3-4 sentences.

RISKS AND WATCH ITEMS: 5-7 numbered risks. Each: number and risk title, then 2-3 sentences.

OPPORTUNITIES AND RECOMMENDATIONS: 2-paragraph strategic overview, then 5-7 numbered actions.

TIMELINE AND MILESTONES: 8-12 entries. Format: Month Year — what happens and why.

METHODOLOGY: 2-3 sentences on research approach.`;

  const response = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude synthesis API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.content.filter(b => b.type === "text").map(b => b.text).join("");
}

// --- 3-Pass Research Pipeline ---
async function runResearchPipeline(topic, audience, company) {
  const audienceContext = audience ? `The audience for this brief is: ${audience}.` : "";
  const companyContext = company ? `The requesting organization is: ${company}.` : "";
  const searchTopic = expandFederalAcronyms(topic);
  console.log("Original topic:", topic);
  console.log("Search topic (expanded):", searchTopic);

  // Pass 1: Landscape scan
  console.log("Pass 1: Landscape scan...");
  const pass1 = await callPerplexity(
    `You are a federal health IT market intelligence analyst specializing in defense health, VA, DHA, and CMS programs. ${audienceContext} ${companyContext} Provide a comprehensive landscape scan with current facts, key players, recent developments, and relevant contract/program details. Use specific dates, dollar amounts, contract numbers, and agency names. Cite your sources.`,
    `Research topic: ${searchTopic}\n\nIMPORTANT: This is a federal government procurement and market intelligence request. Focus exclusively on US federal government programs, contracts, agencies, and vendors — NOT commercial markets, supplements, chemicals, or consumer products.\n\nProvide a thorough landscape scan covering:\n1. Current state and recent developments (last 6 months)\n2. Key agencies, programs, and stakeholders involved\n3. Relevant contracts, solicitations, or procurement activity\n4. Budget context and funding status\n5. Policy or regulatory factors\n\nBe specific with names, dates, and numbers. This will be used as input for deeper analysis.`
  );

  // Pass 2: Deep analysis using Pass 1 findings
  console.log("Pass 2: Deep analysis...");
  const pass2 = await callPerplexity(
    `You are a senior federal health IT strategy advisor. ${audienceContext} ${companyContext} You have been given a landscape scan on a topic. Now provide deep strategic analysis: implications, competitive dynamics, risks, opportunities, and actionable recommendations. Cross-reference and verify claims from the landscape scan. Add any missing context. Cite your sources.`,
    `Topic: ${searchTopic}\n\nLandscape scan findings:\n${pass1.content}\n\nIMPORTANT: This is a federal government procurement and market intelligence request. Focus exclusively on US federal programs, contracts, and agencies.\n\nNow provide:\n1. Strategic implications and what this means for stakeholders\n2. Competitive landscape and key vendor positions\n3. Risks and potential obstacles\n4. Opportunities for action\n5. Timeline of upcoming milestones or decision points\n6. Specific, actionable recommendations\n\nVerify and cross-reference the landscape scan. Flag any claims that cannot be confirmed.`
  );

  // Pass 3: Synthesis via Claude (not Perplexity — Perplexity cannot follow formatting rules)
  console.log("Pass 3: Claude synthesis...");
  const pass3Content = await synthesizeWithClaude(topic, pass1.content, pass2.content, audienceContext, companyContext);
  const pass3 = { content: pass3Content, citations: [] };

  // Merge all citations
  const allCitations = [...new Set([...pass1.citations, ...pass2.citations, ...pass3.citations])];

  return {
    landscape: pass1.content,
    analysis: pass2.content,
    synthesis: pass3.content,
    citations: allCitations,
  };
}

// --- Main handler ---
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!PERPLEXITY_API_KEY) {
    console.error("generate-tactical-brief-background: PERPLEXITY_API_KEY not configured");
    return { statusCode: 500, body: "Research pipeline not configured" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { session_id, name, email, company, topic, audience } = payload;

  if (!email || !topic) {
    console.error("generate-tactical-brief-background: missing email or topic");
    return { statusCode: 400, body: "Email and topic are required" };
  }

  console.log(`generate-tactical-brief-background: starting for ${email} (session ${session_id})`);
  const startTime = Date.now();

  // Initialize Supabase for order tracking
  const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

  // Mark order as processing
  if (supabase && session_id) {
    try {
      await supabase
        .from("marketpulse_orders")
        .update({ status: "processing" })
        .eq("session_id", session_id);
    } catch (trackErr) {
      console.error("marketpulse order tracking (processing) failed:", trackErr.message);
    }
  }

  try {
    // Run 3-pass research pipeline
    const research = await runResearchPipeline(topic, audience, company);
    const researchTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`Research pipeline completed in ${researchTime}s`);

    // Generate PDF
    console.log("Generating PDF...");
    const pdfBuffer = await generateTacticalBriefPdf({
      name,
      email,
      company,
      topic,
      audience,
      synthesis: research.synthesis,
      citations: research.citations,
      generatedAt: new Date().toISOString(),
    });
    console.log(`PDF generated: ${Math.round(pdfBuffer.length / 1024)}KB`);

    // Send delivery email with PDF attachment
    console.log("Sending delivery email...");
    const deliveryHtml = buildDeliveryEmail({ name, topic });
    const deliveryResult = await sendEmail({
      to: email,
      subject: `Your MarketPulse Report: ${topic.slice(0, 60)}${topic.length > 60 ? "..." : ""}`,
      html: deliveryHtml,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      attachments: [
        {
          filename: "tactical-brief.pdf",
          content: pdfBuffer.toString("base64"),
        },
      ],
    });

    if (!deliveryResult.success) {
      console.error("Delivery email failed:", deliveryResult.error);
    }

    // Send notification email to Mary
    const notifyHtml = buildNotificationEmail({ name, email, company, topic, audience, session_id });
    await sendEmail({
      to: "mary@missionmeetstech.com",
      subject: `[MarketPulse] New order from ${name}`,
      html: notifyHtml,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`generate-tactical-brief-background: completed in ${totalTime}s for ${email}`);

    // Mark order as delivered
    if (supabase && session_id) {
      try {
        await supabase
          .from("marketpulse_orders")
          .update({
            status: "delivered",
            pdf_size_kb: Math.round(pdfBuffer.length / 1024),
            duration_seconds: totalTime,
            completed_at: new Date().toISOString(),
          })
          .eq("session_id", session_id);
      } catch (trackErr) {
        console.error("marketpulse order tracking (delivered) failed:", trackErr.message);
      }
    }

    await logOpsEvent(supabase, { event_type: "brief_complete", source_function: "generate-tactical-brief-background", order_id: session_id, user_email: email, severity: "info", details: { topic, duration_seconds: totalTime } });
    return { statusCode: 200, body: JSON.stringify({ success: true, duration_seconds: totalTime }) };
  } catch (err) {
    console.error("generate-tactical-brief-background: pipeline error:", err);
    Sentry.captureException(err, { extra: { session_id, email, topic } });
    await Sentry.flush(2000);

    // Notify Mary of failure
    try {
      await sendEmail({
        to: "mary@missionmeetstech.com",
        subject: `[MarketPulse] FAILED — ${name} (${email})`,
        html: `<p>MarketPulse generation failed for:</p><p><strong>Name:</strong> ${name}<br><strong>Email:</strong> ${email}<br><strong>Topic:</strong> ${topic}<br><strong>Error:</strong> ${err.message}</p><p>Session ID: ${session_id}</p>`,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });
    } catch (notifyErr) {
      console.error("Failed to send failure notification:", notifyErr.message);
    }

    // Mark order as failed
    if (supabase && session_id) {
      try {
        const failTime = Math.round((Date.now() - startTime) / 1000);
        await supabase
          .from("marketpulse_orders")
          .update({
            status: "failed",
            error_message: err.message,
            duration_seconds: failTime,
            completed_at: new Date().toISOString(),
          })
          .eq("session_id", session_id);
      } catch (trackErr) {
        console.error("marketpulse order tracking (failed) failed:", trackErr.message);
      }
    }

    await logOpsEvent(supabase, { event_type: "brief_failed", source_function: "generate-tactical-brief-background", order_id: session_id, user_email: email, severity: "error", details: { error: err.message, topic }, error_signature: `brief_${err.name || "Error"}` });

    // Auto-refund: if this was a paid order, refund via Stripe
    if (session_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = require("stripe");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(session_id);
        if (session.payment_intent) {
          await stripe.refunds.create({
            payment_intent: session.payment_intent,
            reason: "product_not_delivered",
          });
          console.log(`Auto-refund issued for session ${session_id}`);
        }
      } catch (refundErr) {
        console.error("Auto-refund failed (manual refund needed):", refundErr.message);
      }
    }

    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
