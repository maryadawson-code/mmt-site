// ============================================================
// score-deck.js — Netlify Function (Proposal Pulse Backend)
//
// Shared backend for missionmeetstech.com + future MissionPulse SaaS.
// Uses mp_users, mp_feature_usage, mp_scoring_history tables.
//
// Supports 6 document types: pitch_deck, white_paper, rfp_response,
// capabilities_statement, pricing_volume, executive_summary.
//
// Optional SOW/PWS upload: extracts evaluation factors and uses them
// instead of generic criteria (hybrid mode).
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
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 2000;
const MAX_TEXT_CHARS = 80000;
const MODEL = "claude-sonnet-4-5-20250929";
// Legacy value — existing mp_feature_usage and mp_scoring_history records use "lethality_test"
const FEATURE_NAME = "lethality_test";
const FREE_USES = 3;

const ALLOWED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "pptx",
  "application/msword": "docx",
};

// --- CORS Headers ---
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


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
    // SOW hybrid mode: extract evaluation factors from SOW and use them as criteria
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
    // Dynamic IDs for SOW-derived criteria
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
// MISSIONPULSE USER & USAGE MANAGEMENT
// ============================================================

/**
 * Get or create a MissionPulse user. Returns the user record.
 */
async function getOrCreateUser(supabase, email) {
  const normalizedEmail = email.toLowerCase().trim();

  // Try to find existing user
  let { data: user, error: fetchErr } = await supabase
    .from("mp_users")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (fetchErr && fetchErr.code === "PGRST116") {
    // No user found — create one
    const { data: newUser, error: insertErr } = await supabase
      .from("mp_users")
      .insert({
        email: normalizedEmail,
        source: "lethality_test",
        tier: "free",
      })
      .select()
      .single();

    if (insertErr) throw new Error(`User creation failed: ${insertErr.message}`);
    user = newUser;

    // Create initial feature usage record
    const { error: usageErr } = await supabase
      .from("mp_feature_usage")
      .insert({
        user_id: user.id,
        feature: FEATURE_NAME,
        uses_remaining: FREE_USES,
        uses_total: 0,
      });

    if (usageErr) throw new Error(`Usage record creation failed: ${usageErr.message}`);
  } else if (fetchErr) {
    throw new Error(`User lookup failed: ${fetchErr.message}`);
  }

  return user;
}

/**
 * Get feature usage for a user. Creates record if missing (handles users created before this feature).
 */
async function getFeatureUsage(supabase, userId) {
  let { data: usage, error: fetchErr } = await supabase
    .from("mp_feature_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("feature", FEATURE_NAME)
    .single();

  if (fetchErr && fetchErr.code === "PGRST116") {
    // User exists but no usage record for this feature — create one
    const { data: newUsage, error: insertErr } = await supabase
      .from("mp_feature_usage")
      .insert({
        user_id: userId,
        feature: FEATURE_NAME,
        uses_remaining: FREE_USES,
        uses_total: 0,
      })
      .select()
      .single();

    if (insertErr) throw new Error(`Usage creation failed: ${insertErr.message}`);
    usage = newUsage;
  } else if (fetchErr) {
    throw new Error(`Usage lookup failed: ${fetchErr.message}`);
  }

  return usage;
}

/**
 * Decrement usage and update activity timestamps.
 */
async function recordUsage(supabase, userId, usage) {
  const now = new Date().toISOString();

  // Decrement feature usage
  await supabase
    .from("mp_feature_usage")
    .update({
      uses_remaining: usage.uses_remaining - 1,
      uses_total: (usage.uses_total || 0) + 1,
      last_used_at: now,
    })
    .eq("user_id", userId)
    .eq("feature", FEATURE_NAME);

  // Update user last_active_at
  await supabase
    .from("mp_users")
    .update({ last_active_at: now })
    .eq("id", userId);
}

/**
 * Compute overall grade from scorecard scores.
 */
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

/**
 * Save scoring results to history.
 */
async function saveScoreHistory(supabase, userId, fileName, fileType, scorecard, tokenUsage, documentType) {
  const { avgScore, overallGrade } = computeOverallGrade(scorecard);

  await supabase.from("mp_scoring_history").insert({
    user_id: userId,
    feature: FEATURE_NAME,
    file_name: fileName || null,
    file_type: fileType,
    document_type: documentType,
    verdict: scorecard.verdict || null,
    overall_grade: overallGrade,
    avg_score: avgScore ? parseFloat(avgScore.toFixed(2)) : null,
    scores: scorecard.scores || null,
    red_flags: scorecard.red_flags || null,
    top_fix: scorecard.top_fix || null,
    model_used: MODEL,
    tokens_input: tokenUsage.input || null,
    tokens_output: tokenUsage.output || null,
  });
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { email, file_base64, file_type, file_name } = body;
    const documentType = body.document_type || "pitch_deck";
    const sowBase64 = body.sow_base64 || null;
    const sowContentType = body.sow_content_type || null;

    // --- Validate inputs ---
    if (!email || !file_base64 || !file_type) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing email, file data, or file type" }),
      };
    }

    if (!DOCUMENT_TYPES[documentType]) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Unknown document type "${documentType}". Valid types: ${Object.keys(DOCUMENT_TYPES).join(", ")}`,
        }),
      };
    }

    const resolvedType = ALLOWED_TYPES[file_type];
    if (!resolvedType) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "Unsupported file type. Upload a PDF, PowerPoint (.pptx), or Word (.docx) file.",
        }),
      };
    }

    const estimatedSize = (file_base64.length * 3) / 4;
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      return {
        statusCode: 413,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "File too large. Maximum 15MB." }),
      };
    }

    // --- MissionPulse: User & Usage ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let user;
    try {
      user = await getOrCreateUser(supabase, email);
    } catch (err) {
      console.error("User management error:", err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Account error. Please try again." }),
      };
    }

    let usage;
    try {
      usage = await getFeatureUsage(supabase, user.id);
    } catch (err) {
      console.error("Usage lookup error:", err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Usage check failed. Please try again." }),
      };
    }

    // Check remaining uses (free tier gate; pro/enterprise bypass in future)
    if (user.tier === "free" && usage.uses_remaining <= 0) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "limit_reached",
          message: "You've used all 3 free assessments. Contact Mission Meets Tech for a full review.",
          uses_remaining: 0,
        }),
      };
    }

    // --- Process file ---
    let extractedText = null;
    const fileBuffer = Buffer.from(file_base64, "base64");

    if (resolvedType === "docx") {
      try {
        extractedText = await extractDocxText(fileBuffer);
        if (!extractedText || extractedText.trim().length < 50) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: "Could not extract enough text from this Word document. The file may be image-heavy or corrupted. Try exporting as PDF.",
            }),
          };
        }
      } catch (parseErr) {
        console.error("DOCX parse error:", parseErr);
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: "Failed to read this Word document. Make sure it's a valid .docx file (not .doc). Try exporting as PDF.",
          }),
        };
      }
    }

    if (resolvedType === "pptx") {
      try {
        extractedText = await extractPptxText(fileBuffer);
        if (!extractedText || extractedText.trim().length < 50) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: "Could not extract enough text from this PowerPoint. The file may be image-heavy. Try exporting as PDF for best results.",
            }),
          };
        }
      } catch (parseErr) {
        console.error("PPTX parse error:", parseErr);
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: "Failed to read this PowerPoint file. Make sure it's a valid .pptx file (not .ppt). Try exporting as PDF.",
          }),
        };
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

        // Truncate SOW text to same limit as main document
        if (sowText && sowText.length > MAX_TEXT_CHARS) {
          sowText = sowText.substring(0, MAX_TEXT_CHARS);
        }

        // Ignore SOW if extraction failed or too short
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
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "AI scoring service error. Please try again." }),
      };
    }

    const claudeData = await claudeResponse.json();

    // Extract token usage for cost tracking
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
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "AI returned invalid scoring format. Please try again." }),
      };
    }

    // --- MissionPulse: Record usage + save history ---
    const { overallGrade } = computeOverallGrade(scorecard);

    try {
      await recordUsage(supabase, user.id, usage);
      await saveScoreHistory(supabase, user.id, file_name, resolvedType, scorecard, tokenUsage, documentType);
    } catch (err) {
      console.error("Post-scoring DB error:", err);
      // Don't fail the response — user already has their results
    }

    // --- Send score receipt email (non-blocking) ---
    try {
      const { sendEmail } = require("./lib/send-email");
      const { buildScoreReceiptHtml } = require("./lib/email-templates");
      const config = DOCUMENT_TYPES[documentType];
      await sendEmail({
        to: email,
        subject: `Your Proposal Pulse Results: ${scorecard.verdict} — ${config.label}`,
        html: buildScoreReceiptHtml({
          scorecard,
          documentType,
          documentLabel: config.label,
          overallGrade,
          usesRemaining: usage.uses_remaining - 1,
          fileName: file_name,
        }),
      });
    } catch (emailErr) {
      console.error("Receipt email error:", emailErr);
      // Don't fail the response — scoring succeeded
    }

    // --- Return results ---
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        scorecard,
        document_type: documentType,
        uses_remaining: user.tier === "free" ? usage.uses_remaining - 1 : 999,
        file_type_processed: resolvedType,
        model: MODEL,
        user_tier: user.tier,
        extracted_text: extractedText || null,
        has_sow: !!sowText,
      }),
    };
  } catch (err) {
    console.error("Unhandled error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
