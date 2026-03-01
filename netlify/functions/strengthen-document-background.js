// ============================================================
// strengthen-document-background.js — Netlify Background Function
//
// Two-phase AI document strengthening:
//   Call 1: Rewrite weak sections (C+ or below)
//   Call 2: Independent review with confidence scores
//   Then: Email branded strengthened draft via Resend
//
// Background function: returns 202 immediately, runs up to 15 min.
// Triggered by frontend after scoring completes.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { DOCUMENT_TYPES } = require("./lib/document-types");
const { sendEmail } = require("./lib/send-email");
const { buildStrengthenedDraftHtml } = require("./lib/email-templates");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MODEL = "claude-sonnet-4-5-20250929";
const REWRITE_MAX_TOKENS = 8000;
const REVIEW_MAX_TOKENS = 4000;
const WEAK_THRESHOLD = 2.0; // C+ or below

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


// ============================================================
// TEXT EXTRACTION (for PDFs — PPTX/DOCX text comes from score-deck)
// ============================================================

async function extractPdfText(base64Data) {
  const pdfParse = require("pdf-parse");
  const buffer = Buffer.from(base64Data, "base64");
  const data = await pdfParse(buffer);
  return data.text;
}


// ============================================================
// CLAUDE API HELPER
// ============================================================

async function callClaude(systemPrompt, userPrompt, maxTokens) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function parseJson(text) {
  const cleaned = text.replace(/```json\s?/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}


// ============================================================
// PROMPT BUILDERS
// ============================================================

function buildRewritePrompt(documentText, scorecard, weakSections, config) {
  const weakList = weakSections
    .map((s) => `- ${s.title} (Grade: ${s.grade}, ${s.points} pts): ${s.assessment}`)
    .join("\n");

  return {
    system: `You are a senior defense contracting document editor for Mission Meets Tech. You specialize in strengthening NatSec proposal documents — ${config.noun}s specifically.

Your job: Rewrite the weak sections of this document to raise each score. You have the full document text and the AI scorecard. Focus ONLY on sections graded C+ (2.0 pts) or below.

RULES:
- Quote 2-4 sentences from the original document for each weak section (the actual text, not a paraphrase).
- Provide a strengthened version of approximately the same length (within 20% of original excerpt length).
- Explain what you changed and why in 1-2 sentences.
- NEVER fabricate facts, credentials, contract numbers, dollar amounts, or statistics. If specific data is needed, use [INSERT: description of what to add] placeholders.
- Match the document's existing tone — formal federal contracting language, not marketing speak.
- Use appropriate NatSec terminology (DDIL, FedRAMP, IL levels, Kill Chain, etc.) where relevant.
- Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.

RESPONSE FORMAT:
{
  "strengthened_sections": [
    {
      "criterion_id": "the-criterion-id",
      "criterion_title": "Criterion Title",
      "original_grade": "C+",
      "original_excerpt": "Exact 2-4 sentence quote from the document...",
      "strengthened_text": "Your improved version of those sentences...",
      "changes_made": "Brief explanation of what changed and why."
    }
  ]
}`,
    user: `Here is the full document text for a ${config.noun}:

---
${documentText}
---

Here is the Lethality Test scorecard for this document:

Verdict: ${scorecard.verdict}
Overall assessment: ${scorecard.verdict_summary || "N/A"}

WEAK SECTIONS (C+ or below — these need rewriting):
${weakList}

${scorecard.top_fix ? `Top Fix recommended: ${scorecard.top_fix}` : ""}

Rewrite each weak section. Return only the JSON.`,
  };
}

function buildReviewPrompt(rewriteResult, config) {
  const sectionsForReview = rewriteResult.strengthened_sections
    .map(
      (s) => `## ${s.criterion_title} (Original: ${s.original_grade})
ORIGINAL: "${s.original_excerpt}"
STRENGTHENED: "${s.strengthened_text}"
CHANGES: ${s.changes_made}`
    )
    .join("\n\n");

  return {
    system: `You are an independent quality reviewer for defense contracting documents at Mission Meets Tech. You are reviewing AI-generated rewrites of a ${config.noun}.

CRITICAL: You did NOT write these rewrites. You are an independent reviewer. Your job is to triple-check each rewrite for quality.

For each strengthened section, evaluate three things:
1. ACCURACY — Are there any fabricated facts, credentials, contract numbers, or statistics? Any claims that weren't in the original?
2. CONSISTENCY — Does the tone match federal contracting conventions? Any jarring style shifts from the original document?
3. IMPROVEMENT — Is this actually stronger than the original, or just word-shuffling? Does it address the scoring weakness?

Assign a confidence percentage (0-100%) for each section:
- 90-100%: Excellent rewrite, ready to use with minor tweaks
- 70-89%: Good rewrite, some areas need human review
- 50-69%: Acceptable but needs significant human editing
- Below 50%: Rewrite has issues — flag for human rewrite

Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.

RESPONSE FORMAT:
{
  "reviews": [
    {
      "criterion_id": "the-criterion-id",
      "confidence_pct": 82,
      "accuracy_ok": true,
      "consistency_ok": true,
      "improvement_ok": true,
      "notes": "Brief note if any issues found, or empty string if clean."
    }
  ],
  "overall_confidence": 82,
  "reviewer_notes": "1-2 sentence overall assessment of the rewrites."
}`,
    user: `Review these AI-generated rewrites for a ${config.noun}:

${sectionsForReview}

Triple-check each rewrite. Return only the JSON.`,
  };
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
    const { email, document_type, file_name, scorecard } = body;
    const extractedText = body.extracted_text || null;
    const fileBase64 = body.file_base64 || null;
    const fileType = body.file_type || null;

    // --- Validate inputs ---
    if (!email || !scorecard || !document_type) {
      console.error("Strengthen: missing required fields");
      return;
    }

    const config = DOCUMENT_TYPES[document_type];
    if (!config) {
      console.error(`Strengthen: unknown document type "${document_type}"`);
      return;
    }

    // --- Anti-abuse: verify user has a recent scoring record ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: recentScore, error: scoreErr } = await supabase
      .from("mp_scoring_history")
      .select("id")
      .eq("feature", "lethality_test")
      .gte("created_at", fiveMinutesAgo)
      .limit(1)
      .maybeSingle();

    if (scoreErr) {
      console.error("Strengthen: Supabase lookup error:", scoreErr);
    }

    // Look up user by email for the scoring check
    const normalizedEmail = email.toLowerCase().trim();
    const { data: user } = await supabase
      .from("mp_users")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    if (!user) {
      console.error("Strengthen: no user found for email");
      return;
    }

    const { data: userScore } = await supabase
      .from("mp_scoring_history")
      .select("id")
      .eq("user_id", user.id)
      .eq("feature", "lethality_test")
      .gte("created_at", fiveMinutesAgo)
      .limit(1)
      .maybeSingle();

    if (!userScore) {
      console.error("Strengthen: no recent scoring record found — possible abuse");
      return;
    }

    // --- Identify weak sections ---
    const scores = scorecard.scores || [];
    const weakSections = scores.filter((s) => (s.points || 0) <= WEAK_THRESHOLD);
    const strongSections = scores.filter((s) => (s.points || 0) > WEAK_THRESHOLD);

    if (weakSections.length === 0) {
      console.log("Strengthen: no weak sections, skipping");
      return;
    }

    // --- Get document text ---
    let documentText = extractedText;

    if (!documentText && fileBase64) {
      // PDF — extract text
      try {
        documentText = await extractPdfText(fileBase64);
      } catch (pdfErr) {
        console.error("Strengthen: PDF text extraction failed:", pdfErr);
        return;
      }
    }

    if (!documentText || documentText.trim().length < 50) {
      console.error("Strengthen: insufficient document text");
      return;
    }

    // Truncate very long documents
    const MAX_TEXT_CHARS = 80000;
    if (documentText.length > MAX_TEXT_CHARS) {
      documentText = documentText.substring(0, MAX_TEXT_CHARS);
    }

    // --- Call 1: Rewrite weak sections ---
    console.log(`Strengthen: rewriting ${weakSections.length} weak sections for ${normalizedEmail}`);

    const rewritePrompt = buildRewritePrompt(documentText, scorecard, weakSections, config);
    let rewriteResult;

    try {
      const rewriteText = await callClaude(rewritePrompt.system, rewritePrompt.user, REWRITE_MAX_TOKENS);
      rewriteResult = parseJson(rewriteText);
    } catch (err) {
      console.error("Strengthen: rewrite call failed:", err);
      return;
    }

    if (!rewriteResult.strengthened_sections || rewriteResult.strengthened_sections.length === 0) {
      console.error("Strengthen: rewrite returned no sections");
      return;
    }

    // --- Call 2: Review rewrites ---
    console.log("Strengthen: reviewing rewrites...");

    let reviewResult = null;
    try {
      const reviewPrompt = buildReviewPrompt(rewriteResult, config);
      const reviewText = await callClaude(reviewPrompt.system, reviewPrompt.user, REVIEW_MAX_TOKENS);
      reviewResult = parseJson(reviewText);
    } catch (err) {
      console.error("Strengthen: review call failed (degrading gracefully):", err);
      // Continue without review — send rewrites without confidence scores
    }

    // --- Merge results ---
    const reviewMap = {};
    if (reviewResult && reviewResult.reviews) {
      for (const r of reviewResult.reviews) {
        reviewMap[r.criterion_id] = r;
      }
    }

    const mergedSections = rewriteResult.strengthened_sections.map((section) => {
      const review = reviewMap[section.criterion_id] || null;
      return {
        ...section,
        confidence_pct: review ? review.confidence_pct : null,
        accuracy_ok: review ? review.accuracy_ok : null,
        consistency_ok: review ? review.consistency_ok : null,
        improvement_ok: review ? review.improvement_ok : null,
        review_notes: review ? review.notes : null,
      };
    });

    // Compute overall grade for the email
    const avgPoints = scores.length > 0
      ? scores.reduce((sum, s) => sum + (s.points || 0), 0) / scores.length
      : 0;
    let overallGrade;
    if (avgPoints >= 3.75) overallGrade = "A";
    else if (avgPoints >= 3.25) overallGrade = "B+";
    else if (avgPoints >= 2.75) overallGrade = "B";
    else if (avgPoints >= 2.25) overallGrade = "B-";
    else if (avgPoints >= 1.75) overallGrade = "C+";
    else if (avgPoints >= 1.25) overallGrade = "C";
    else if (avgPoints >= 0.75) overallGrade = "D";
    else overallGrade = "F";

    // --- Send email ---
    console.log("Strengthen: sending strengthened draft email...");

    const emailHtml = buildStrengthenedDraftHtml({
      documentLabel: config.label,
      fileName: file_name,
      verdict: scorecard.verdict,
      overallGrade,
      scores,
      strengthenedSections: mergedSections,
      strongSections,
      overallConfidence: reviewResult ? reviewResult.overall_confidence : null,
      reviewerNotes: reviewResult ? reviewResult.reviewer_notes : null,
    });

    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: `Strengthened Draft: ${config.label} — ${weakSections.length} Section${weakSections.length !== 1 ? "s" : ""} Improved`,
      html: emailHtml,
    });

    if (emailResult.success) {
      console.log(`Strengthen: email sent successfully (${emailResult.id})`);
    } else {
      console.error("Strengthen: email send failed:", emailResult.error);
    }
  } catch (err) {
    console.error("Strengthen: unhandled error:", err);
  }
};
