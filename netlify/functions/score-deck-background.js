// ============================================================
// score-deck-background.js — Netlify Background Function
//
// Heavy scoring logic for ProposalPulse. Runs as a background
// function (returns 202 immediately, up to 15 min execution).
//
// Receives ONLY { scoring_id } in the request body.
// Reads the full scoring payload from the DB (stored by the
// gateway in the `scores` column with _pending: true).
//
// Flow:
//   1. Read payload from scores column
//   2. Clear scores to null (= "processing" state for polling)
//   3. Call Claude API
//   4. Update row with real scorecard
//   5. Send score receipt email
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { DOCUMENT_TYPES } = require("./lib/document-types");
const { getModelConfig } = require("./lib/model-router");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");

// --- Environment Variables ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Constants ---
const MAX_OUTPUT_TOKENS = 2000;
const MAX_TEXT_CHARS = 80000;


// ============================================================
// PROMPT BUILDER
// ============================================================

const GRADING_SCALE = `GRADING SCALE:
A = Exceeds expectations (4.0 pts)
B+ = Strong (3.5 pts)
B = Meets the bar (3.0 pts)
B- = Acceptable, some gaps (2.5 pts)
C+ = Below bar, needs work (2.0 pts)
C = Weak, significant revision (1.5 pts)
D = Missing or fundamentally flawed (1.0 pts)
F = Absent or counterproductive (0.0 pts)`;

const SCORING_RULES = `RULES:
- Score what is in the document. Do not infer what might be said verbally or in other volumes.
- If a criterion cannot be evaluated (e.g., missing section), grade it D with a note.
- Be direct. "This section is weak because..." not "This could perhaps be strengthened by..."
- The assessment field should be specific to this document, not generic advice.
- Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;

function buildResponseFormat(scoreIds) {
  const exampleGrades = ["B+", "C+", "B", "C", "B-", "B", "D", "D", "B-"];
  const examplePoints = [3.5, 2.0, 3.0, 1.5, 2.5, 3.0, 1.0, 1.0, 2.5];
  const examples = scoreIds.map((s, i) => `    {
      "id": "${s.id}",
      "title": "${s.title}",
      "grade": "${exampleGrades[i % exampleGrades.length]}",
      "points": ${examplePoints[i % examplePoints.length]},
      "assessment": "Two sentences max. What's working and what's not."
    }`);

  return `RESPONSE FORMAT — You MUST respond with valid JSON only. No markdown, no preamble, no explanation outside the JSON structure:

{
  "scores": [
${examples.join(",\n")}
  ],
  "red_flags": [
    "Specific red flag found in this document",
    "Another red flag if applicable"
  ],
  "verdict": "PASS | CONDITIONAL | FAIL",
  "verdict_title": "One sentence verdict headline",
  "verdict_summary": "2-3 sentence summary of the overall assessment. Be specific to this document.",
  "top_fix": "The single most impactful change the author should make before the next submission."
}`;
}

function buildSystemPrompt(documentType, sowText = null) {
  const config = DOCUMENT_TYPES[documentType];

  let criteriaSection;
  let redFlagsSection;
  let responseFormat;

  if (sowText) {
    criteriaSection = `The following is the Statement of Work (SOW) or Performance Work Statement (PWS) for this procurement. Extract the evaluation factors and scoring criteria from this document. Use THESE as your 9 scoring criteria instead of the generic ones below.

If the SOW has fewer than 9 distinct evaluation factors, group related requirements into logical categories to reach 9. If it has more than 9, prioritize the ones weighted most heavily or listed as "significant" evaluation factors.

SOW/PWS TEXT:
---
${sowText}
---

Score the uploaded document against the evaluation factors you extracted above.`;
    redFlagsSection = `RED FLAGS — Flag any of the following:
- Document does not address requirements stated in the SOW/PWS
- Key evaluation factors from the SOW are ignored or inadequately addressed
- Claims made without supporting evidence or past performance
- Non-compliance with any mandatory requirements in the SOW`;
    const sowScoreIds = Array.from({ length: 9 }, (_, i) => ({
      id: `sow-factor-${i + 1}`,
      title: `Evaluation Factor ${i + 1}`,
    }));
    responseFormat = buildResponseFormat(sowScoreIds);
  } else {
    criteriaSection = `SCORING CRITERIA (Grade A through F):

${config.criteria}`;
    redFlagsSection = `RED FLAGS (auto-fail triggers):
${config.red_flags}`;
    responseFormat = buildResponseFormat(config.score_ids);
  }

  return `${config.intro}

NOTE: The document may be provided as a PDF (with visual layout) or as extracted text from a PowerPoint or Word document. If provided as text, evaluate based on content quality regardless of visual formatting. If layout details are missing, note that in relevant criteria but focus on substance.

${criteriaSection}

${GRADING_SCALE}

${redFlagsSection}

${responseFormat}

IMPORTANT: For each criterion, use a descriptive "title" field that names the actual evaluation factor (e.g., "Technical Approach" not "Evaluation Factor 1").

${SCORING_RULES}`;
}


// ============================================================
// MESSAGE CONTENT BUILDER
// ============================================================

function buildMessageContent(fileType, base64Data, extractedText, documentType) {
  const config = DOCUMENT_TYPES[documentType];
  const noun = config.noun;
  const userPrompt = `Score this ${noun} using ProposalPulse. Return only the JSON scorecard.`;

  if (fileType === "pdf" && base64Data) {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Data },
      },
      { type: "text", text: userPrompt },
    ];
  }

  const formatLabel = fileType === "pptx" ? "PowerPoint" : "Word document";
  const textContent = extractedText.length > MAX_TEXT_CHARS
    ? extractedText.substring(0, MAX_TEXT_CHARS) + `\n\n[TEXT TRUNCATED — ${noun} exceeds maximum length]`
    : extractedText;

  return [
    {
      type: "text",
      text: `The following is the full text content extracted from a ${formatLabel} ${noun}. Evaluate it as you would a visual document, but note that formatting and visual layout are not available for this file type.\n\n---\n\n${textContent}\n\n---\n\n${userPrompt}`,
    },
  ];
}


// ============================================================
// GRADING
// ============================================================

function computeOverallGrade(scorecard) {
  const avgScore = scorecard.scores
    ? scorecard.scores.reduce((sum, s) => sum + (s.points || 0), 0) / scorecard.scores.length
    : null;

  let grade;
  if (avgScore >= 3.75) grade = "A";
  else if (avgScore >= 3.25) grade = "B+";
  else if (avgScore >= 2.75) grade = "B";
  else if (avgScore >= 2.25) grade = "B-";
  else if (avgScore >= 1.75) grade = "C+";
  else if (avgScore >= 1.25) grade = "C";
  else if (avgScore >= 0.75) grade = "D";
  else grade = "F";

  return { avgScore, overallGrade: grade };
}


// ============================================================
// MAIN HANDLER (Background Function)
// ============================================================

exports.handler = async (event) => {
  console.log("score-deck-background invoked");

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let scoring_id;
  try {
    const body = JSON.parse(event.body);
    scoring_id = body.scoring_id;

    if (!scoring_id) {
      console.error("Missing scoring_id in background function");
      return { statusCode: 400, body: "Missing scoring_id" };
    }

    console.log(`Background function started for scoring_id=${scoring_id}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // --- Read payload from DB ---
    const { data: record, error: lookupErr } = await supabase
      .from("mp_scoring_history")
      .select("id, scores, verdict, user_id")
      .eq("id", scoring_id)
      .single();

    if (lookupErr || !record) {
      console.error("Scoring record not found:", scoring_id);
      return { statusCode: 404, body: "Scoring record not found" };
    }

    // Check for pending payload
    if (!record.scores || !record.scores._pending) {
      console.log("No pending payload (already processed or missing):", scoring_id);
      return { statusCode: 200, body: "Already completed or no payload" };
    }

    const payload = record.scores;
    const email = payload.email;
    const documentType = payload.document_type || "pitch_deck";
    const fileType = payload.file_type || "pdf";
    const fileName = payload.file_name;
    const extractedText = payload.extracted_text || null;
    const fileBase64 = payload.file_base64 || null;
    const sowText = payload.sow_text || null;
    const sowBase64 = payload.sow_base64 || null;
    const sowContentType = payload.sow_content_type || null;

    if (!email) {
      console.error("No email in payload for:", scoring_id);
      await markError(supabase, scoring_id, "Missing email. Please try again.");
      return { statusCode: 200, body: "Missing email" };
    }

    if (!extractedText && !fileBase64) {
      console.error("No text or file data in payload for:", scoring_id);
      await markError(supabase, scoring_id, "Missing document data. Please try again.");
      return { statusCode: 200, body: "Missing data" };
    }

    // --- Clear the pending payload (= "processing" state for polling) ---
    await supabase
      .from("mp_scoring_history")
      .update({ scores: null })
      .eq("id", scoring_id);

    console.log(`Processing ${scoring_id}: type=${fileType}, hasText=${!!extractedText}, hasBase64=${!!fileBase64}`);

    // --- Process SOW if base64 provided (PDF SOW case) ---
    let finalSowText = sowText;
    if (!finalSowText && sowBase64) {
      try {
        const sowResolvedType = sowContentType
          ? ({ "application/pdf": "pdf" }[sowContentType] || null)
          : null;
        if (sowResolvedType === "pdf") {
          const pdfParse = require("pdf-parse");
          const sowBuffer = Buffer.from(sowBase64, "base64");
          const pdfData = await pdfParse(sowBuffer);
          finalSowText = pdfData.text;
          if (finalSowText && finalSowText.length > MAX_TEXT_CHARS) {
            finalSowText = finalSowText.substring(0, MAX_TEXT_CHARS);
          }
          if (!finalSowText || finalSowText.trim().length < 50) {
            finalSowText = null;
          }
        }
      } catch (sowErr) {
        console.error("SOW extraction error (proceeding without SOW):", sowErr);
        finalSowText = null;
      }
    }

    // --- Build prompt and call Claude API ---
    const scoringModelConfig = await getModelConfig(supabase, "scoring");
    console.log(`Calling Claude API for ${scoring_id} (${fileType}, textLen=${extractedText?.length || 0}, model=${scoringModelConfig.model} [${scoringModelConfig.reason}])`);
    const systemPrompt = buildSystemPrompt(documentType, finalSowText);
    const messageContent = buildMessageContent(fileType, fileBase64, extractedText, documentType);

    const claudeResponse = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: scoringModelConfig.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: messageContent }],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude API error:", claudeResponse.status, errText);
      await markError(supabase, scoring_id, "AI scoring service error. Please try again.");
      return { statusCode: 200, body: "Claude API error" };
    }

    const claudeData = await claudeResponse.json();

    const tokenUsage = {
      input: claudeData.usage?.input_tokens || null,
      output: claudeData.usage?.output_tokens || null,
    };

    const responseText = claudeData.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse JSON
    let scorecard;
    try {
      const cleaned = responseText.replace(/```json\s?/g, "").replace(/```/g, "").trim();
      scorecard = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Raw:", responseText.substring(0, 500));
      await markError(supabase, scoring_id, "AI returned invalid scoring format. Please try again.");
      return { statusCode: 200, body: "JSON parse error" };
    }

    // --- Compute grade and update row ---
    const { avgScore, overallGrade } = computeOverallGrade(scorecard);

    // Extract document text for Gold Team Review (all file types)
    // For DOCX/PPTX, extractedText is already available from the gateway.
    // For PDFs, extract text now using pdf-parse (Gold Team needs text, not base64).
    let documentText = extractedText;
    if (!documentText && fileBase64 && fileType === "pdf") {
      try {
        const pdfParse = require("pdf-parse");
        const pdfBuffer = Buffer.from(fileBase64, "base64");
        const pdfData = await pdfParse(pdfBuffer);
        documentText = pdfData.text;
        if (documentText && documentText.length > MAX_TEXT_CHARS) {
          documentText = documentText.substring(0, MAX_TEXT_CHARS);
        }
      } catch (pdfErr) {
        console.error("PDF text extraction for Gold Team failed:", pdfErr);
      }
    }

    // Store scorecard + document text + model routing metadata
    const scorecardWithMeta = {
      ...scorecard,
      _document_text: documentText || null,
      _model_routing: {
        scoring: { model: scoringModelConfig.model, reason: scoringModelConfig.reason },
      },
    };

    const { error: updateErr } = await supabase
      .from("mp_scoring_history")
      .update({
        verdict: scorecard.verdict || null,
        overall_grade: overallGrade,
        avg_score: avgScore ? parseFloat(avgScore.toFixed(2)) : null,
        scores: scorecardWithMeta,
        red_flags: scorecard.red_flags || null,
        top_fix: scorecard.top_fix || null,
        model_used: scoringModelConfig.model,
        tokens_input: tokenUsage.input || null,
        tokens_output: tokenUsage.output || null,
      })
      .eq("id", scoring_id);

    if (updateErr) {
      console.error("Failed to update scoring row:", updateErr);
    }

    console.log(`Scoring complete for ${scoring_id}: ${overallGrade} (${scorecard.verdict})`);

    // --- Send score receipt email ---
    try {
      const { sendEmail } = require("./lib/send-email");
      const { buildScoreReceiptHtml } = require("./lib/email-templates");
      const config = DOCUMENT_TYPES[documentType];

      let usesRemaining = null;
      const { data: featureUsage } = await supabase
        .from("mp_feature_usage")
        .select("uses_remaining")
        .eq("user_id", record.user_id)
        .eq("feature", "lethality_test")
        .single();
      if (featureUsage) usesRemaining = featureUsage.uses_remaining;

      await sendEmail({
        to: email,
        subject: `Your ProposalPulse Results: ${scorecard.verdict} — ${config.label}`,
        html: buildScoreReceiptHtml({
          scorecard,
          documentType,
          documentLabel: config.label,
          overallGrade,
          usesRemaining: usesRemaining,
          fileName: fileName,
        }),
      });
      console.log(`Receipt email sent for ${scoring_id}`);
    } catch (emailErr) {
      console.error("Receipt email error:", emailErr);
    }

    return { statusCode: 200, body: "Scoring complete" };

  } catch (err) {
    console.error("Unhandled error in score-deck-background:", err);

    if (scoring_id) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await markError(supabase, scoring_id, "Internal server error. Please try again.");
      } catch (dbErr) {
        console.error("Failed to mark error in DB:", dbErr);
      }
    }

    return { statusCode: 200, body: "Error handled" };
  }
};


/**
 * Mark a scoring record as errored.
 * Convention: verdict = 'ERROR', top_fix = error message, scores = null.
 */
async function markError(supabase, scoringId, errorMessage) {
  const { error } = await supabase
    .from("mp_scoring_history")
    .update({
      scores: null,
      verdict: "ERROR",
      top_fix: errorMessage,
    })
    .eq("id", scoringId);

  if (error) {
    console.error("Failed to mark error for", scoringId, error);
  }
}
