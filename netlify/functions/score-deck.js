// ============================================================
// score-deck.js — Netlify Function (ProposalPulse Gateway)
//
// Synchronous gateway: validates input, manages user/usage,
// extracts text from DOCX/PPTX, stores the scoring payload
// in the DB, decrements usage, and returns scoring_id.
//
// The scoring payload is stored in the `scores` column as
// { _pending: true, ... } so the background function can read
// it without receiving any file data in its request body.
//
// Uses mp_users, mp_feature_usage, mp_scoring_history tables.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const { DOCUMENT_TYPES } = require("./lib/document-types");
const { checkKillSwitch } = require("./lib/kill-switch");
const { stripHtml, validateFile } = require("./lib/sanitize");
const { checkRateLimit } = require("./lib/rate-limiter");
const { createLogger } = require("./lib/logger");
const { Sentry, wrapHandler } = require("./lib/sentry");

// --- Environment Variables ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Access Token Generation ---
// HMAC token prevents unauthorized access to scoring results.
// Token = HMAC-SHA256(scoring_id, SUPABASE_SERVICE_KEY), truncated to 32 hex chars.
function generateAccessToken(scoringId) {
  return crypto
    .createHmac("sha256", SUPABASE_SERVICE_KEY)
    .update(scoringId)
    .digest("hex")
    .substring(0, 32);
}

// --- Constants ---
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 80000;
// Legacy value — existing mp_feature_usage and mp_scoring_history records use "lethality_test"
const FEATURE_NAME = "lethality_test";
const FREE_USES = 1;

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
// TEXT EXTRACTION (DOCX/PPTX — fast, < 1s)
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
    return await officeparser.parseOffice(buffer);
  }

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

exports.handler = wrapHandler(async (event) => {
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

  // Kill switch — block new submissions in readonly/emergency mode
  const killCheck = checkKillSwitch("score-deck");
  if (killCheck.blocked) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "ProposalPulse is temporarily in maintenance mode. Please try again shortly." }),
    };
  }

  const log = createLogger("score-deck");
  log.info("Function entry");

  try {
    const body = JSON.parse(event.body);
    const rawEmail = body.email;
    const { file_base64, file_type } = body;
    const file_name = body.file_name ? stripHtml(body.file_name, { fieldName: "file_name", logger: log }) : undefined;
    const email = rawEmail;
    const documentType = body.document_type || "pitch_deck";

    // --- Validate file name vs MIME type ---
    if (file_name && file_type) {
      const fileCheck = validateFile(file_name, file_type);
      if (!fileCheck.valid) {
        log.warn("File validation failed", { reason: fileCheck.reason, file_name, file_type });
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: fileCheck.reason }),
        };
      }
    }

    // --- Validate inputs ---
    if (!email || !file_base64 || !file_type) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing email, file data, or file type" }),
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid email format." }),
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

    // --- Extract text for DOCX/PPTX (fast, < 1s) ---
    let extractedText = null;
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

    // --- Extract SOW text if provided ---
    // For DOCX/PPTX SOW: extract text here (mammoth/officeparser are lightweight).
    // For PDF SOW: store base64 — background function handles extraction
    // (pdf-parse is 34MB and would push this function over Lambda's 50MB zip limit).
    let sowText = null;
    const sowBase64 = body.sow_base64 || null;
    const sowContentType = body.sow_content_type || null;
    if (sowBase64 && sowContentType) {
      const sowResolved = ALLOWED_TYPES[sowContentType] || null;
      if (sowResolved === "docx" || sowResolved === "pptx") {
        try {
          sowText = await extractText(sowBase64, sowResolved);
          if (sowText && sowText.length > MAX_TEXT_CHARS) {
            sowText = sowText.substring(0, MAX_TEXT_CHARS);
          }
          if (!sowText || sowText.trim().length < 50) {
            sowText = null;
          }
        } catch (sowErr) {
          console.error("SOW extraction error (continuing without):", sowErr);
        }
      }
      // PDF SOW: pass through as base64 — background function extracts text
    }

    // --- MissionPulse: User & Usage ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // --- Rate limiting (IP-based: 10/min, email-based: 5/hour) ---
    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "maryadawson@gmail.com,mary@missionmeetstech.com,jackyang2326@gmail.com,amchicu@gmail.com").split(",").map(e => e.trim().toLowerCase());
    const clientIp = (event.headers["x-forwarded-for"] || event.headers["client-ip"] || "unknown").split(",")[0].trim();
    const isAdminEmail = ADMIN_EMAILS.includes(email.toLowerCase().trim());

    if (!isAdminEmail) {
      const ipLimit = await checkRateLimit(supabase, `ip:score-deck:${clientIp}`, 10, 1);
      if (!ipLimit.allowed) {
        log.warn("IP rate limit hit", { ip: clientIp, user_email: email });
        return {
          statusCode: 429,
          headers: { ...CORS_HEADERS, "Retry-After": "60" },
          body: JSON.stringify({ error: "Too many requests. Please try again in a minute." }),
        };
      }

      const emailLimit = await checkRateLimit(supabase, `email:score-deck:${email.toLowerCase().trim()}`, 5, 60);
      if (!emailLimit.allowed) {
        log.warn("Email rate limit hit", { user_email: email });
        return {
          statusCode: 429,
          headers: { ...CORS_HEADERS, "Retry-After": "3600" },
          body: JSON.stringify({ error: "Too many assessments. Please try again later." }),
        };
      }
    }

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

    // Check remaining uses (free tier gate). This MUST fire before any
    // extraction/scoring/model call — revenue integrity rule. Free users
    // get exactly 1 completed assessment; #2 routes through Stripe
    // checkout (create-checkout.js) which grants +1 use via webhook.
    if (user.tier === "free" && usage.uses_remaining <= 0) {
      // Log the limit hit so the weekly billing report can correlate it
      // against subsequent checkout starts. Non-fatal if it fails.
      try {
        const { error: logErr } = await supabase.from("ops_events").insert({
          event_type: "proposalpulse_limit_hit",
          severity: "info",
          error_signature: "proposalpulse_billing",
          source_function: "score-deck",
          user_email: email,
          details: {
            email,
            mp_user_id: user.id,
            uses_remaining: 0,
            checkout_url: "https://missionmeetstech.com/proposal-pulse.html#upgrade",
          },
        });
        if (logErr) console.error("score-deck: ops_events insert failed (proposalpulse_limit_hit):", logErr.message);
      } catch (logEx) {
        console.error("score-deck: ops_events insert threw (proposalpulse_limit_hit):", logEx.message);
      }
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "limit_reached",
          message: "You've used your free assessment. Upgrade to score another proposal.",
          uses_remaining: 0,
          // Frontend reads `checkout_endpoint` so the over-limit modal can
          // POST { email } and get back a working Stripe checkout URL —
          // no dead-end "contact support" path.
          checkout_endpoint: "/.netlify/functions/create-checkout",
        }),
      };
    }

    // --- Build scoring payload to store in DB ---
    // Background function reads this from the `scores` column.
    // _pending flag distinguishes from a real scorecard.
    const pendingPayload = {
      _pending: true,
      email: email,
      file_name: file_name || null,
      document_type: documentType,
      file_type: resolvedType,
    };

    // For DOCX/PPTX: store extracted text (small, ~200KB)
    // For PDF: store base64 (larger, but needed for native document upload)
    if (extractedText) {
      pendingPayload.extracted_text = extractedText;
    } else {
      pendingPayload.file_base64 = file_base64;
    }

    if (sowText) {
      pendingPayload.sow_text = sowText;
    } else if (sowBase64 && sowContentType) {
      // PDF SOW — store base64 for background function
      pendingPayload.sow_base64 = sowBase64;
      pendingPayload.sow_content_type = sowContentType;
    }

    // --- Insert pending scoring row with payload ---
    const { data: scoringRow, error: insertErr } = await supabase
      .from("mp_scoring_history")
      .insert({
        user_id: user.id,
        feature: FEATURE_NAME,
        file_name: file_name || null,
        file_type: resolvedType,
        document_type: documentType,
        scores: pendingPayload,
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
    log.done({ order_id: scoringRow.id, user_email: email, tier: user.tier });
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        scoring_id: scoringRow.id,
        access_token: generateAccessToken(scoringRow.id),
        uses_remaining: user.tier === "free" ? usage.uses_remaining - 1 : 999,
        user_tier: user.tier,
      }),
    };

  } catch (err) {
    log.fail(err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
});
