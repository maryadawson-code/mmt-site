// ============================================================
// score-deck.js — Netlify Function (MissionPulse Backend v1)
//
// Shared backend for missionmeetstech.com + future MissionPulse SaaS.
// Uses mp_users, mp_feature_usage, mp_scoring_history tables.
//
// PDF  → sent as native document to Claude (visual layout preserved)
// PPTX → text extracted via officeparser → sent as text
// DOCX → text extracted via mammoth → sent as text
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const mammoth = require("mammoth");
const officeparser = require("officeparser");

// --- Environment Variables ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Constants ---
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 2000;
const MAX_TEXT_CHARS = 80000;
const MODEL = "claude-sonnet-4-5-20250929";
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

// --- System Prompt ---
const SYSTEM_PROMPT = `You are a defense contracting pitch deck evaluator for Mission Meets Tech. You apply "The Lethality Test" framework based on Secretary of War Pete Hegseth's standard: "If a contract doesn't make us more lethal, it's gone."

Your job: Read the uploaded pitch deck and score it across 9 criteria. Be direct, specific, and honest. No consultant fog. No empty praise. Grade like a GS-15 who has seen 500 pitches and has 4 minutes before the next one.

NOTE: The deck may be provided as a PDF (with visual layout) or as extracted text from a PowerPoint or Word document. If provided as text, evaluate based on content quality regardless of visual formatting. If layout details are missing, note that in relevant criteria but focus on substance.

SCORING CRITERIA (Grade A through F):

1. PROBLEM CLARITY — Is the warfighter/mission problem stated first? Is it specific and urgent? Does it pass the "so what" test?
2. NATSEC RELEVANCE — Does the solution map to Kill Chain functions (Find, Fix, Track, Target, Engage, Assess, Sustain)? Is defense context present (BATDOK, DDIL, Role 2E, theater evac)?
3. SOLUTION CLARITY — Is the technical approach clear? Does it use NatSec language (not civilian healthcare speak)? Offline/DDIL capability?
4. MARKET SIZING — Is DoD/DHA/VA market sized separately from commercial TAM? Government vehicles mentioned (OTAs, IDIQs, SBIR)?
5. TEAM & CREDIBILITY — Veteran status visible? Defense health credentials? Service branch? Credibility front-loaded?
6. TRACTION — Pilots defense-adjacent? FedRAMP/IL status mentioned? Government references? Real traction, not "in conversations with"?
7. FINANCIALS — Numbers add up? Charts match text? Projections defensible? Unit economics clear?
8. COMPETITIVE POSITION — Landscape acknowledged? Differentiation specific? Moat clear? Incumbent risk addressed?
9. THE ASK — Funding amount clear? Milestones tied to defense outcomes? Use of funds logical?

GRADING SCALE:
A = Exceeds expectations (4.0 pts)
B+ = Strong (3.5 pts)
B = Meets the bar (3.0 pts)
B- = Acceptable, some gaps (2.5 pts)
C+ = Below bar, needs work (2.0 pts)
C = Weak, significant revision (1.5 pts)
D = Missing or fundamentally flawed (1.0 pts)
F = Absent or counterproductive (0.0 pts)

RED FLAGS (auto-fail triggers):
- Civilian healthcare problem leads before warfighter problem
- No veteran credentials visible at veteran pitch competition
- "Improves efficiency" without connecting to readiness/lethality
- No FedRAMP/IL status for a software company
- Financials/charts don't match the text
- No DoD/DHA market sizing separate from commercial TAM
- Technology requires persistent connectivity with no offline story

RESPONSE FORMAT — You MUST respond with valid JSON only. No markdown, no preamble, no explanation outside the JSON structure:

{
  "scores": [
    {
      "id": "problem-clarity",
      "title": "Problem Clarity",
      "grade": "B+",
      "points": 3.5,
      "assessment": "Two sentences max. What's working and what's not."
    },
    {
      "id": "natsec-relevance",
      "title": "NatSec Relevance",
      "grade": "C+",
      "points": 2.0,
      "assessment": "Two sentences max."
    },
    {
      "id": "solution-clarity",
      "title": "Solution Clarity",
      "grade": "B",
      "points": 3.0,
      "assessment": "Two sentences max."
    },
    {
      "id": "market-sizing",
      "title": "Market Sizing",
      "grade": "C",
      "points": 1.5,
      "assessment": "Two sentences max."
    },
    {
      "id": "team-credibility",
      "title": "Team & Credibility",
      "grade": "B-",
      "points": 2.5,
      "assessment": "Two sentences max."
    },
    {
      "id": "traction",
      "title": "Traction",
      "grade": "B",
      "points": 3.0,
      "assessment": "Two sentences max."
    },
    {
      "id": "financials",
      "title": "Financials",
      "grade": "D",
      "points": 1.0,
      "assessment": "Two sentences max."
    },
    {
      "id": "competitive-position",
      "title": "Competitive Position",
      "grade": "D",
      "points": 1.0,
      "assessment": "Two sentences max."
    },
    {
      "id": "the-ask",
      "title": "The Ask",
      "grade": "B-",
      "points": 2.5,
      "assessment": "Two sentences max."
    }
  ],
  "red_flags": [
    "Specific red flag found in this deck",
    "Another red flag if applicable"
  ],
  "verdict": "PASS | CONDITIONAL | FAIL",
  "verdict_title": "One sentence verdict headline",
  "verdict_summary": "2-3 sentence summary of the overall assessment. Be specific to this deck.",
  "top_fix": "The single most impactful change this founder should make before their next pitch."
}

RULES:
- Score what is in the deck. Do not infer what might be said verbally.
- If a criterion cannot be evaluated (e.g., no financial slides), grade it D with a note.
- Be direct. "This slide is weak because..." not "This could perhaps be strengthened by..."
- The assessment field should be specific to this deck, not generic advice.
- Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;


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

function buildMessageContent(fileType, base64Data, extractedText) {
  const userPrompt = "Score this pitch deck using The Lethality Test. Return only the JSON scorecard.";

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
    ? extractedText.substring(0, MAX_TEXT_CHARS) + "\n\n[TEXT TRUNCATED — deck exceeds maximum length]"
    : extractedText;

  return [
    {
      type: "text",
      text: `The following is the full text content extracted from a ${formatLabel} pitch deck. Evaluate it as you would a visual deck, but note that formatting and visual layout are not available for this file type.\n\n---\n\n${textContent}\n\n---\n\n${userPrompt}`,
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
 * Save scoring results to history.
 */
async function saveScoreHistory(supabase, userId, fileName, fileType, scorecard, tokenUsage) {
  const avgScore = scorecard.scores
    ? scorecard.scores.reduce((sum, s) => sum + (s.points || 0), 0) / scorecard.scores.length
    : null;

  let overallGrade;
  if (avgScore >= 3.75) overallGrade = "A";
  else if (avgScore >= 3.25) overallGrade = "B+";
  else if (avgScore >= 2.75) overallGrade = "B";
  else if (avgScore >= 2.25) overallGrade = "B-";
  else if (avgScore >= 1.75) overallGrade = "C+";
  else if (avgScore >= 1.25) overallGrade = "C";
  else if (avgScore >= 0.75) overallGrade = "D";
  else overallGrade = "F";

  await supabase.from("mp_scoring_history").insert({
    user_id: userId,
    feature: FEATURE_NAME,
    file_name: fileName || null,
    file_type: fileType,
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

    // --- Validate inputs ---
    if (!email || !file_base64 || !file_type) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing email, file data, or file type" }),
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

    // --- Call Claude API ---
    const messageContent = buildMessageContent(resolvedType, file_base64, extractedText);

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
        system: SYSTEM_PROMPT,
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
    try {
      await recordUsage(supabase, user.id, usage);
      await saveScoreHistory(supabase, user.id, file_name, resolvedType, scorecard, tokenUsage);
    } catch (err) {
      console.error("Post-scoring DB error:", err);
      // Don't fail the response — user already has their results
    }

    // --- Return results ---
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        scorecard,
        uses_remaining: user.tier === "free" ? usage.uses_remaining - 1 : 999,
        file_type_processed: resolvedType,
        model: MODEL,
        user_tier: user.tier,
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
