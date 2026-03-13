// ============================================================
// generate-tactical-brief-background.js — Netlify Background Function
//
// Filename ends in -background.js → Netlify gives 15-minute timeout.
// 3-pass Perplexity pipeline (sonar-pro) → PDF generation → email delivery.
//
// POST body: { session_id, name, email, company, topic, audience, amount_paid }
// ============================================================

const { generateTacticalBriefPdf } = require("./lib/tactical-brief-pdf");
const { buildDeliveryEmail, buildNotificationEmail } = require("./lib/tactical-brief-email");
const { sendEmail } = require("./lib/send-email");

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

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

// --- 3-Pass Research Pipeline ---
async function runResearchPipeline(topic, audience, company) {
  const audienceContext = audience ? `The audience for this brief is: ${audience}.` : "";
  const companyContext = company ? `The requesting organization is: ${company}.` : "";

  // Pass 1: Landscape scan
  console.log("Pass 1: Landscape scan...");
  const pass1 = await callPerplexity(
    `You are a federal health IT market intelligence analyst specializing in defense health, VA, DHA, and CMS programs. ${audienceContext} ${companyContext} Provide a comprehensive landscape scan with current facts, key players, recent developments, and relevant contract/program details. Use specific dates, dollar amounts, contract numbers, and agency names. Cite your sources.`,
    `Research topic: ${topic}\n\nProvide a thorough landscape scan covering:\n1. Current state and recent developments (last 6 months)\n2. Key agencies, programs, and stakeholders involved\n3. Relevant contracts, solicitations, or procurement activity\n4. Budget context and funding status\n5. Policy or regulatory factors\n\nBe specific with names, dates, and numbers. This will be used as input for deeper analysis.`
  );

  // Pass 2: Deep analysis using Pass 1 findings
  console.log("Pass 2: Deep analysis...");
  const pass2 = await callPerplexity(
    `You are a senior federal health IT strategy advisor. ${audienceContext} ${companyContext} You have been given a landscape scan on a topic. Now provide deep strategic analysis: implications, competitive dynamics, risks, opportunities, and actionable recommendations. Cross-reference and verify claims from the landscape scan. Add any missing context. Cite your sources.`,
    `Topic: ${topic}\n\nLandscape scan findings:\n${pass1.content}\n\nNow provide:\n1. Strategic implications and what this means for stakeholders\n2. Competitive landscape and key vendor positions\n3. Risks and potential obstacles\n4. Opportunities for action\n5. Timeline of upcoming milestones or decision points\n6. Specific, actionable recommendations\n\nVerify and cross-reference the landscape scan. Flag any claims that cannot be confirmed.`
  );

  // Pass 3: Fact-check and synthesis
  console.log("Pass 3: Fact-check and synthesis...");
  const pass3 = await callPerplexity(
    `You are a fact-checker and editor for a federal health IT intelligence publication. ${audienceContext} ${companyContext} You have a landscape scan and a deep analysis on a topic. Your job is to:\n1. Verify key claims against current sources\n2. Flag anything that cannot be confirmed or appears outdated\n3. Synthesize everything into a clean, structured executive brief\n4. Add a confidence rating (High/Medium/Low) for each major finding\n\nOutput a structured brief with these sections:\n- EXECUTIVE SUMMARY (3-5 bullet points)\n- KEY FINDINGS (numbered, with confidence ratings)\n- COMPETITIVE LANDSCAPE\n- RISKS & WATCH ITEMS\n- OPPORTUNITIES & RECOMMENDATIONS\n- TIMELINE & MILESTONES\n- SOURCES & METHODOLOGY`,
    `Topic: ${topic}\n\nLandscape scan:\n${pass1.content}\n\nDeep analysis:\n${pass2.content}\n\nSynthesize into a final executive brief. Verify claims, flag uncertainties, and provide confidence ratings.`
  );

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

    return { statusCode: 200, body: JSON.stringify({ success: true, duration_seconds: totalTime }) };
  } catch (err) {
    console.error("generate-tactical-brief-background: pipeline error:", err);

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

    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
