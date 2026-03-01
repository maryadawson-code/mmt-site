// ============================================================
// score-deck.js — Netlify Function (Proposal Pulse Gateway)
//
// Thin synchronous gateway: validates input, manages user/usage,
// inserts a pending row into mp_scoring_history, decrements usage,
// and returns scoring_id for the frontend to poll.
//
// Heavy scoring work runs in score-deck-background.js (background
// function, up to 15 min) which the frontend fires after receiving
// the scoring_id.
//
// Uses mp_users, mp_feature_usage, mp_scoring_history tables.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { DOCUMENT_TYPES } = require("./lib/document-types");

// --- Environment Variables ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Constants ---
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 80000;
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
// TEXT EXTRACTION (DOCX/PPTX only — keeps background payload small)
// ============================================================

async function extractText(base64Data, resolvedType) {
  const buffer = Buffer.from(base64Data, "base64");

  if (resolvedType === "docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (resolvedType === "pptx") {
    const officeparser = require("officeparser");
    return await officeparser.parseOfficeAsync(buffer);
  }

  // PDFs: return null — sent as native document to Claude
  return null;
}


// ============================================================
// MISSIONPULSE USER & USAGE MANAGEMENT
// ============================================================

async function getOrCreateUser(supabase, email) {
  const normalizedEmail = email.toLowerCase().trim();

  let { data: user, error: fetchErr } = await supabase
    .from("mp_users")
    .select("*")
    .eq("email", normalizedEmail)
    .single();

  if (fetchErr && fetchErr.code === "PGRST116") {
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

async function getFeatureUsage(supabase, userId) {
  let { data: usage, error: fetchErr } = await supabase
    .from("mp_feature_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("feature", FEATURE_NAME)
    .single();

  if (fetchErr && fetchErr.code === "PGRST116") {
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

async function recordUsage(supabase, userId, usage) {
  const now = new Date().toISOString();

  await supabase
    .from("mp_feature_usage")
    .update({
      uses_remaining: usage.uses_remaining - 1,
      uses_total: (usage.uses_total || 0) + 1,
      last_used_at: now,
    })
    .eq("user_id", userId)
    .eq("feature", FEATURE_NAME);

  await supabase
    .from("mp_users")
    .update({ last_active_at: now })
    .eq("id", userId);
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

    // --- Extract text for DOCX/PPTX (reduces background function payload) ---
    let extractedText = null;
    let sowExtractedText = null;

    if (resolvedType === "docx" || resolvedType === "pptx") {
      try {
        extractedText = await extractText(file_base64, resolvedType);
        if (!extractedText || extractedText.trim().length < 50) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              error: `Could not extract enough text from this ${resolvedType === "docx" ? "Word document" : "PowerPoint"}. Try exporting as PDF.`,
            }),
          };
        }
        if (extractedText.length > MAX_TEXT_CHARS) {
          extractedText = extractedText.substring(0, MAX_TEXT_CHARS);
        }
      } catch (parseErr) {
        console.error(`${resolvedType.toUpperCase()} parse error:`, parseErr);
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: `Failed to read this ${resolvedType === "docx" ? "Word document" : "PowerPoint"}. Make sure it's a valid file. Try exporting as PDF.`,
          }),
        };
      }
    }

    // Extract SOW text if provided (DOCX/PPTX only; PDFs sent as base64)
    const sowBase64 = body.sow_base64 || null;
    const sowContentType = body.sow_content_type || null;
    if (sowBase64 && sowContentType) {
      const sowResolved = ALLOWED_TYPES[sowContentType] || null;
      if (sowResolved === "docx" || sowResolved === "pptx") {
        try {
          sowExtractedText = await extractText(sowBase64, sowResolved);
          if (sowExtractedText && sowExtractedText.length > MAX_TEXT_CHARS) {
            sowExtractedText = sowExtractedText.substring(0, MAX_TEXT_CHARS);
          }
          if (!sowExtractedText || sowExtractedText.trim().length < 50) {
            sowExtractedText = null;
          }
        } catch (sowErr) {
          console.error("SOW extraction error (continuing without):", sowErr);
          sowExtractedText = null;
        }
      }
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

    // Check remaining uses (free tier gate)
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

    // --- Insert pending scoring row (scores: null = processing) ---
    const { data: scoringRow, error: insertErr } = await supabase
      .from("mp_scoring_history")
      .insert({
        user_id: user.id,
        feature: FEATURE_NAME,
        file_name: file_name || null,
        file_type: resolvedType,
        document_type: documentType,
        // scores, verdict, overall_grade, avg_score left null = "processing"
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Failed to insert pending scoring row:", insertErr);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Could not start scoring. Please try again." }),
      };
    }

    // --- Decrement usage ---
    try {
      await recordUsage(supabase, user.id, usage);
    } catch (err) {
      console.error("Usage decrement error:", err);
      // Non-fatal — scoring row is already created
    }

    // --- Return scoring_id for polling ---
    // Include extracted_text so frontend sends it (not file_base64) to background function
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        scoring_id: scoringRow.id,
        uses_remaining: user.tier === "free" ? usage.uses_remaining - 1 : 999,
        user_tier: user.tier,
        extracted_text: extractedText,
        sow_extracted_text: sowExtractedText,
        file_type_resolved: resolvedType,
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
