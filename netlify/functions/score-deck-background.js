// ============================================================
// score-deck-background.js — Netlify Background Function
//
// Heavy scoring logic for Proposal Pulse. Runs as a background
// function (returns 202 immediately, up to 15 min execution).
//
// Called by score-deck.js (gateway) after validation + usage gate.
// Receives scoring_id, extracts text, calls Claude, updates
// mp_scoring_history row, sends receipt email, triggers Gold Team.
//
// PDF  → sent as native document to Claude (visual layout preserved)
// PPTX → text extracted via officeparser → sent as text
// DOCX → text extracted via mammoth → sent as text
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const mammoth = require("mammoth");
const officeparser = require("officeparser");
const { DOCUMENT_TYPES } = require("./lib/document-types");

// --- Environment Variables ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Constants ---
const MAX_OUTPUT_TOKENS = 2000;
const MAX_TEXT_CHARS = 80000;
const MODEL = "claude-sonnet-4-5-20250929";


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
// FILE PROCESSING
// ============================================================

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractPptxText(buffer) {
  return await officeparser.parseOfficeAsync(buffer);
}

function buildMessageContent(fileType, base64Data, extractedText, documentType) {
  const config = DOCUMENT_TYPES[documentType];
  const noun = config.noun;
  const userPrompt = `Score this ${noun} using Proposal Pulse. Return only the JSON scorecard.`;

  if (fileType === "pdf") {
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
// ALLOWED FILE TYPES
// ============================================================

const ALLOWED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "pptx",
  "application/msword": "docx",
};


// ============================================================
// MAIN HANDLER (Background Function)
// ============================================================

exports.handler = async (event) => {
  // Background functions only accept POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let scoring_id;
  try {
    const body = JSON.parse(event.body);
    scoring_id = body.scoring_id;
    const { email, file_base64, file_type, file_name } = body;
    const documentType = body.document_type || "pitch_deck";
    const sowBase64 = body.sow_base64 || null;
    const sowContentType = body.sow_content_type || null;

    if (!scoring_id || !email || !file_base64 || !file_type) {
      console.error("Missing required fields in background function");
      return { statusCode: 400, body: "Missing required fields" };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Anti-abuse: verify scoring_id exists and is still pending
    const { data: record, error: lookupErr } = await supabase
      .from("mp_scoring_history")
      .select("id, scores, verdict")
      .eq("id", scoring_id)
      .single();

    if (lookupErr || !record) {
      console.error("Scoring record not found:", scoring_id);
      return { statusCode: 404, body: "Scoring record not found" };
    }

    if (record.scores !== null) {
      console.log("Scoring already completed for:", scoring_id);
      return { statusCode: 200, body: "Already completed" };
    }

    // --- Process file ---
    const resolvedType = ALLOWED_TYPES[file_type] || "pdf";
    let extractedText = null;
    const fileBuffer = Buffer.from(file_base64, "base64");

    if (resolvedType === "docx") {
      try {
        extractedText = await extractDocxText(fileBuffer);
        if (!extractedText || extractedText.trim().length < 50) {
          await markError(supabase, scoring_id, "Could not extract enough text from this Word document. Try exporting as PDF.");
          return { statusCode: 200, body: "Extraction failed" };
        }
      } catch (parseErr) {
        console.error("DOCX parse error:", parseErr);
        await markError(supabase, scoring_id, "Failed to read this Word document. Make sure it's a valid .docx file. Try exporting as PDF.");
        return { statusCode: 200, body: "Parse failed" };
      }
    }

    if (resolvedType === "pptx") {
      try {
        extractedText = await extractPptxText(fileBuffer);
        if (!extractedText || extractedText.trim().length < 50) {
          await markError(supabase, scoring_id, "Could not extract enough text from this PowerPoint. Try exporting as PDF.");
          return { statusCode: 200, body: "Extraction failed" };
        }
      } catch (parseErr) {
        console.error("PPTX parse error:", parseErr);
        await markError(supabase, scoring_id, "Failed to read this PowerPoint file. Make sure it's a valid .pptx file. Try exporting as PDF.");
        return { statusCode: 200, body: "Parse failed" };
      }
    }

    // --- Process SOW (optional) ---
    let sowText = null;
    if (sowBase64) {
      try {
        const sowResolvedType = sowContentType ? (ALLOWED_TYPES[sowContentType] || null) : null;
        const sowBuffer = Buffer.from(sowBase64, "base64");

        if (sowResolvedType === "pdf") {
          const pdfParse = require("pdf-parse");
          const pdfData = await pdfParse(sowBuffer);
          sowText = pdfData.text;
        } else if (sowResolvedType === "docx") {
          sowText = await extractDocxText(sowBuffer);
        } else if (sowResolvedType === "pptx") {
          sowText = await extractPptxText(sowBuffer);
        }

        if (sowText && sowText.length > MAX_TEXT_CHARS) {
          sowText = sowText.substring(0, MAX_TEXT_CHARS);
        }

        if (!sowText || sowText.trim().length < 50) {
          sowText = null;
        }
      } catch (sowErr) {
        console.error("SOW extraction error (proceeding without SOW):", sowErr);
        sowText = null;
      }
    }

    // --- Build prompt and call Claude API ---
    const systemPrompt = buildSystemPrompt(documentType, sowText);
    const messageContent = buildMessageContent(resolvedType, file_base64, extractedText, documentType);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
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

    const { error: updateErr } = await supabase
      .from("mp_scoring_history")
      .update({
        verdict: scorecard.verdict || null,
        overall_grade: overallGrade,
        avg_score: avgScore ? parseFloat(avgScore.toFixed(2)) : null,
        scores: scorecard,
        red_flags: scorecard.red_flags || null,
        top_fix: scorecard.top_fix || null,
        model_used: MODEL,
        tokens_input: tokenUsage.input || null,
        tokens_output: tokenUsage.output || null,
      })
      .eq("id", scoring_id);

    if (updateErr) {
      console.error("Failed to update scoring row:", updateErr);
    }

    // --- Send score receipt email ---
    try {
      const { sendEmail } = require("./lib/send-email");
      const { buildScoreReceiptHtml } = require("./lib/email-templates");
      const config = DOCUMENT_TYPES[documentType];

      // Look up uses_remaining for email
      const { data: usageData } = await supabase
        .from("mp_scoring_history")
        .select("user_id")
        .eq("id", scoring_id)
        .single();

      let usesRemaining = null;
      if (usageData) {
        const { data: featureUsage } = await supabase
          .from("mp_feature_usage")
          .select("uses_remaining")
          .eq("user_id", usageData.user_id)
          .eq("feature", "lethality_test")
          .single();
        if (featureUsage) usesRemaining = featureUsage.uses_remaining;
      }

      await sendEmail({
        to: email,
        subject: `Your Proposal Pulse Results: ${scorecard.verdict} — ${config.label}`,
        html: buildScoreReceiptHtml({
          scorecard,
          documentType,
          documentLabel: config.label,
          overallGrade,
          usesRemaining: usesRemaining,
          fileName: file_name,
        }),
      });
    } catch (emailErr) {
      console.error("Receipt email error:", emailErr);
    }

    // --- Trigger Gold Team Review server-side ---
    try {
      const goldTeamPayload = {
        email: email,
        document_type: documentType,
        file_name: file_name || "document",
        scorecard: scorecard,
      };

      // For PDFs (no extracted text), send file_base64 + file_type
      if (extractedText) {
        goldTeamPayload.extracted_text = extractedText;
      } else {
        goldTeamPayload.file_base64 = file_base64;
        goldTeamPayload.file_type = file_type;
      }

      // Invoke Gold Team Review background function via internal URL
      const siteUrl = process.env.URL || "https://missionmeetstech.com";
      const goldTeamUrl = `${siteUrl}/.netlify/functions/gold-team-review-background`;
      console.log(`Gold Team: triggering ${goldTeamUrl}`);

      const goldTeamResponse = await fetch(goldTeamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goldTeamPayload),
      });

      console.log(`Gold Team: trigger response ${goldTeamResponse.status}`);
      if (!goldTeamResponse.ok && goldTeamResponse.status !== 202) {
        const errBody = await goldTeamResponse.text().catch(() => "");
        console.error(`Gold Team: trigger failed ${goldTeamResponse.status}: ${errBody}`);
      }
    } catch (goldTeamErr) {
      console.error("Gold Team Review trigger error:", goldTeamErr);
      // Non-fatal — user still has their scorecard
    }

    console.log(`Scoring complete for ${scoring_id}: ${overallGrade} (${scorecard.verdict})`);
    return { statusCode: 200, body: "Scoring complete" };

  } catch (err) {
    console.error("Unhandled error in score-deck-background:", err);

    // Try to mark error in DB if we have a scoring_id
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
 * Convention: verdict = 'ERROR', top_fix = error message, scores stays null.
 */
async function markError(supabase, scoringId, errorMessage) {
  const { error } = await supabase
    .from("mp_scoring_history")
    .update({
      verdict: "ERROR",
      top_fix: errorMessage,
    })
    .eq("id", scoringId);

  if (error) {
    console.error("Failed to mark error for", scoringId, error);
  }
}
