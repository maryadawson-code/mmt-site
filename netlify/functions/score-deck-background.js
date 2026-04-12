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
const { withRetry } = require("./lib/retry");
const { checkKillSwitch, shouldHoldEmail, holdEmail } = require("./lib/kill-switch");
const { transitionState } = require("./lib/workflow-state");
const { Sentry, wrapHandler } = require("./lib/sentry");
const { validateScorecard } = require("./lib/scorecard-validator");
const { logOpsEvent } = require("./lib/ops-ledger");
const { extractIntelSignals } = require("./lib/signal-extractor");
const { trackQuality } = require("./lib/quality-tracker");
const { getFlag } = require("./lib/feature-flags");
const { generateReportUrl } = require("./lib/report-url");
const { trackAnthropic, trackOllama } = require("./lib/cost-tracker");
const { checkRegulatoryCompliance } = require("./lib/regulatory-flags");
const { callModel, isLocalProvider } = require("./lib/inference");
const { createLogger } = require("./lib/logger");

// --- Environment Variables ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// --- Constants ---
const MAX_OUTPUT_TOKENS = 8192;
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
- UNSCORABLE SECTIONS: If a section has NO relevant content in the uploaded document, assign grade "N/A" and points null. Set assessment to "No [section topic] data was provided in the uploaded document. This section cannot be scored." Do NOT assign a numeric score to sections with no content. Common unscorable sections: Price/Cost (if only a technical volume was uploaded), Past Performance (if no PP volume or references), Key Personnel (if no resumes or staffing plan), Management Approach (if not included).
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
  "top_fix": "The single most impactful change the author should make before the next submission.",
  "next_steps": {
    "stop_ship": ["Items that will result in non-responsiveness or elimination during initial screening"],
    "high": ["Significant scoring weaknesses that will cost evaluation points"],
    "polish": ["Improvements that strengthen but are not make-or-break"]
  },
  "pWin_factors": [
    { "factor": "Technical Approach", "value": 75, "note": "Strong methodology" },
    { "factor": "Past Performance", "value": 60, "note": "Limited DoD health refs" },
    { "factor": "Staffing / Key Personnel", "value": 40, "note": "No named PM" },
    { "factor": "Price / Cost", "value": 50, "note": "No cost model" },
    { "factor": "Compliance", "value": 70, "note": "Good coverage" },
    { "factor": "Competitive Position", "value": 65, "note": "Some differentiators" }
  ],
  "competitive_positioning": {
    "differentiation": "strong|moderate|weak|absent",
    "reasoning": "Specific observation about what makes this proposal stand out or fail to"
  }
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
<user_input>
${sowText}
</user_input>

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

CHAIN OF THOUGHT: Before scoring each criterion, briefly reason through what you observe in the document for that criterion. State your evidence, then assign the grade. Your reasoning should appear in the "assessment" field.

EXAMPLE (abbreviated — show this level of specificity):
{
  "scores": [
    {
      "id": "problem-clarity",
      "title": "Problem Clarity",
      "grade": "B+",
      "points": 3.5,
      "assessment": "Document opens with a specific reference to DHA's EHR interoperability gap affecting 3,200+ MTFs. Cites GAO-24-106155 for context. The problem is concrete and mission-linked, though it could strengthen the 'so what' by quantifying patient impact. Strong for a B+."
    },
    {
      "id": "financials",
      "title": "Financials & Pricing",
      "grade": "D",
      "points": 1.0,
      "assessment": "No cost model presented. The pricing section contains only a placeholder table with TBD values. No basis of estimate, no rate justification, no indirect rate disclosure. This is a red flag for any evaluator."
    }
  ],
  "red_flags": ["No basis of estimate in pricing section"],
  "verdict": "CONDITIONAL",
  "verdict_title": "Strong technical approach undermined by absent pricing",
  "verdict_summary": "The proposal demonstrates solid technical understanding and mission relevance but has a critical gap in the pricing volume. No evaluator will score this favorably without a complete cost model.",
  "top_fix": "Build a complete basis of estimate with labor categories, rates, and indirect rate disclosure before resubmission."
}

PRIORITIZED NEXT STEPS — Provide next steps in THREE tiers:

STOP-SHIP (items that will result in non-responsiveness or elimination during initial screening):
- Missing mandatory sections
- Non-responsive to stated requirements
- Missing mandatory certifications/representations
- Missing cost/pricing data when required

HIGH (significant scoring weaknesses that will cost evaluation points):
- Weak past performance evidence
- Vague technical approach
- Missing key personnel qualifications
- Unsupported cost estimates

POLISH (improvements that strengthen but are not make-or-break):
- Tone consistency
- Formatting alignment with Section L
- Stronger action verbs
- Executive summary tightening

For each item, state the specific fix needed in one sentence.

pWin FACTORS — Score these 6 factors from 0 to 100 based on your assessment of the document. The server will compute the weighted pWin from these scores. Include a pWin_factors array:
[
  { "factor": "Technical Approach", "value": 75, "note": "Brief justification" },
  { "factor": "Past Performance", "value": 60, "note": "Brief justification" },
  { "factor": "Staffing / Key Personnel", "value": 40, "note": "Brief justification" },
  { "factor": "Price / Cost", "value": 50, "note": "Brief justification" },
  { "factor": "Compliance", "value": 70, "note": "Brief justification" },
  { "factor": "Competitive Position", "value": 65, "note": "Brief justification" }
]
Score each factor 0-100 based on what you observe in the document. If the document does not address a factor, score it 25 or below. The "note" field should be one sentence explaining the score.

COMPETITIVE POSITIONING ASSESSMENT:
Even without knowing the specific competitive field, evaluate:
- Does this proposal describe what makes the offeror DIFFERENT from a typical incumbent or competitor?
- Are differentiators specific (named tools, quantified improvements, unique methodologies) or generic ('innovative approach', 'experienced team')?
- Would an evaluator reading 10 similar proposals remember what makes this one stand out?
Include a competitive_positioning field in the scorecard:
{ "differentiation": "strong|moderate|weak|absent", "reasoning": "...specific observation..." }

${sowText ? `SECTION L/M COMPLIANCE MAPPING (MANDATORY when SOW/PWS is provided):
Extract EVERY requirement from Section L (Instructions to Offerors) and Section M (Evaluation Criteria) in the SOW/PWS.
For each requirement, search the proposal document for where it is addressed.

Include a compliance_matrix in your output as an array of objects:
[{
  "requirement": "The specific requirement text or summary",
  "lm_reference": "Section L.4.2" or "Section M.1(a)" or "PWS 3.1",
  "proposal_section": "Section 3 — Technical Approach, paragraph 2" or "NOT FOUND",
  "status": "COMPLIANT|PARTIAL|MISSING|N/A",
  "notes": "Brief explanation of what was found or what's missing"
}]

Status definitions:
- COMPLIANT: Requirement is clearly and fully addressed in the proposal
- PARTIAL: Requirement is mentioned but response is incomplete or vague
- MISSING: Requirement is not addressed anywhere in the proposal
- N/A: Requirement does not apply to this document type

Be thorough — evaluators use Section L/M as a checklist. Missing a single mandatory requirement can result in non-responsiveness.` : ""}

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
      text: `The following is the full text content extracted from a ${formatLabel} ${noun}. Evaluate it as you would a visual document, but note that formatting and visual layout are not available for this file type.\n\n<user_input>\n${textContent}\n</user_input>\n\n${userPrompt}`,
    },
  ];
}


// ============================================================
// GRADING
// ============================================================

function computeOverallGrade(scorecard) {
  // Exclude N/A sections from aggregate calculations
  const scorable = scorecard.scores
    ? scorecard.scores.filter((s) => s.grade !== "N/A" && s.points !== null && s.points !== undefined)
    : [];
  const excludedCount = (scorecard.scores || []).length - scorable.length;

  const avgScore = scorable.length > 0
    ? scorable.reduce((sum, s) => sum + (s.points || 0), 0) / scorable.length
    : null;

  let grade;
  if (avgScore === null) grade = "N/A";
  else if (avgScore >= 3.75) grade = "A";
  else if (avgScore >= 3.25) grade = "B+";
  else if (avgScore >= 2.75) grade = "B";
  else if (avgScore >= 2.25) grade = "B-";
  else if (avgScore >= 1.75) grade = "C+";
  else if (avgScore >= 1.25) grade = "C";
  else if (avgScore >= 0.75) grade = "D";
  else grade = "F";

  return { avgScore, overallGrade: grade, excludedCount };
}


// ============================================================
// MAIN HANDLER (Background Function)
// ============================================================

exports.handler = wrapHandler(async (event) => {
  const log = createLogger("score-deck-background");
  log.info("Function entry");

  // Kill switch
  const killCheck = checkKillSwitch("score-deck-background");
  if (killCheck.blocked) return killCheck.response;

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

    // --- State: extract_started ---
    try { await transitionState(supabase, "mp_scoring_history", scoring_id, "extract_started"); } catch (e) { console.error("State transition error:", e.message); }

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

    // FIX 3b: Detect if the uploaded document itself contains SOW/RFP content
    // (Section L, Section M, evaluation criteria headers)
    let detectedSowInDocument = false;
    if (!finalSowText) {
      const textToScan = (extractedText || "").substring(0, 10000).toLowerCase();
      const sowIndicators = [
        /section\s+l[\s.:]/i,
        /section\s+m[\s.:]/i,
        /evaluation\s+criteria/i,
        /evaluation\s+factors/i,
        /instructions\s+to\s+offerors/i,
        /performance\s+work\s+statement/i,
        /statement\s+of\s+work/i,
      ];
      const matchCount = sowIndicators.filter((p) => p.test(textToScan)).length;
      if (matchCount >= 2) {
        detectedSowInDocument = true;
        console.log(`[SOW-DETECT] Document appears to contain RFP/SOW content (${matchCount} indicators found)`);
      }
    }

    // --- State: extract_completed → score_started ---
    try { await transitionState(supabase, "mp_scoring_history", scoring_id, "extract_completed"); } catch (e) { console.error("State transition error:", e.message); }
    try { await transitionState(supabase, "mp_scoring_history", scoring_id, "score_started"); } catch (e) { console.error("State transition error:", e.message); }

    // --- Build prompt and call model (Ollama local or Anthropic) ---
    const scoringModelConfig = await getModelConfig(supabase, "scoring");
    const useLocalScoring = isLocalProvider(scoringModelConfig) && !fileBase64; // Ollama can't handle binary PDFs
    console.log(`Scoring ${scoring_id} (${fileType}, textLen=${extractedText?.length || 0}, model=${scoringModelConfig.model} [${scoringModelConfig.reason}], local=${useLocalScoring})`);
    const systemPrompt = buildSystemPrompt(documentType, finalSowText);
    const messageContent = buildMessageContent(fileType, fileBase64, extractedText, documentType);

    const _costStart = Date.now();
    let claudeData, tokenUsage, shadowResponse;

    if (useLocalScoring) {
      // ─── LOCAL SCORING PATH (Ollama) ──────────────────────────
      try {
        const result = await withRetry(() => callModel(scoringModelConfig, {
          system: systemPrompt,
          messages: [{ role: "user", content: typeof messageContent === "string" ? messageContent : JSON.stringify(messageContent) }],
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.3,
          agent: "score-deck",
          taskType: "scoring",
        }));
        // Build Anthropic-compatible response shape so downstream code works unchanged
        claudeData = {
          content: [{ type: "text", text: result.text }],
          usage: result.usage,
          model: result.model,
        };
        tokenUsage = { input: result.usage.input_tokens, output: result.usage.output_tokens };
        try {
          await trackOllama(supabase, {
            functionName: "score-deck-background", product: "proposalpulse", orderId: scoring_id,
            model: result.model, usage: result.usage, latencyMs: Date.now() - _costStart,
          });
        } catch (_costErr) { /* never break scoring */ }
      } catch (localErr) {
        console.error("Local scoring failed, falling back to Anthropic:", localErr.message);
        // Fall through to Anthropic path below
      }
    }

    // ─── ANTHROPIC SCORING PATH (production default or fallback) ───
    if (!claudeData) {
      const apiCallBody = {
        model: scoringModelConfig.model.startsWith("gemma") ? "claude-sonnet-4-5-20250929" : scoringModelConfig.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.3,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: messageContent }],
      };

      const primaryPromise = withRetry(() => fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(apiCallBody),
      }));

      const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "maryadawson@gmail.com,mary@missionmeetstech.com,jackyang2326@gmail.com,amchicu@gmail.com").split(",").map(e => e.trim().toLowerCase());
      const isAdmin = ADMIN_EMAILS.includes((email || "").toLowerCase());
      const shadowPromise = isAdmin
        ? Promise.resolve(null)
        : withRetry(() => fetchWithTimeout("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              ...apiCallBody,
              model: "claude-haiku-4-5-20251001",
              max_tokens: MAX_OUTPUT_TOKENS,
            }),
          })).catch((err) => {
            console.error("Shadow scoring failed:", err.message);
            return null;
          });

      if (isAdmin) console.log("[SHADOW] Skipped shadow scoring for admin email");

      const [claudeResponse, shadowResponse] = await Promise.all([primaryPromise, shadowPromise]);

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        console.error("Claude API error:", claudeResponse.status, errText);
        await logOpsEvent(supabase, { event_type: "MODEL_FAILURE", source_function: "score-deck-background", severity: "error", signature: `anthropic_${claudeResponse.status}`, affected_entity: scoring_id, details: { status: claudeResponse.status, error: errText.substring(0, 500) } });
        await markError(supabase, scoring_id, "AI scoring service error. Please try again.");
        return { statusCode: 200, body: "Claude API error" };
      }

      claudeData = await claudeResponse.json();

      try {
        await trackAnthropic(supabase, {
          functionName: "score-deck-background", product: "proposalpulse", orderId: scoring_id,
          model: apiCallBody.model, usage: claudeData.usage, latencyMs: Date.now() - _costStart,
        });
      } catch (_costErr) { /* never break scoring */ }

      tokenUsage = {
        input: claudeData.usage?.input_tokens || null,
        output: claudeData.usage?.output_tokens || null,
      };
    } // end Anthropic path

    const responseText = claudeData.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse primary scorecard
    let scorecard;
    try {
      const cleaned = responseText.replace(/```json\s?/g, "").replace(/```/g, "").trim();
      scorecard = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Raw:", responseText.substring(0, 500));
      await logOpsEvent(supabase, { event_type: "MODEL_FAILURE", source_function: "score-deck-background", severity: "error", signature: "scorecard_parse_failure", affected_entity: scoring_id, details: { error: parseError.message, raw_preview: responseText.substring(0, 200) } });
      await markError(supabase, scoring_id, "AI returned invalid scoring format. Please try again.");
      return { statusCode: 200, body: "JSON parse error" };
    }

    // Parse shadow scorecard (best-effort)
    let shadowScorecard = null;
    let consensus = null;
    if (shadowResponse && shadowResponse.ok) {
      try {
        const shadowData = await shadowResponse.json();
        const shadowText = shadowData.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        const shadowCleaned = shadowText.replace(/```json\s?/g, "").replace(/```/g, "").trim();
        shadowScorecard = JSON.parse(shadowCleaned);

        // Cost tracking: shadow scoring call
        try {
          await trackAnthropic(supabase, {
            functionName: 'score-deck-background',
            product: 'proposalpulse',
            orderId: scoring_id,
            model: 'claude-haiku-4-5-20251001',
            usage: shadowData.usage,
            latencyMs: Date.now() - _costStart,
            metadata: { role: 'shadow' },
          });
        } catch (_costErr) { /* never break scoring */ }

        // Build consensus analysis
        if (shadowScorecard.scores && scorecard.scores) {
          const divergent = [];
          let agreed = 0;
          const len = Math.min(scorecard.scores.length, shadowScorecard.scores.length);
          for (let i = 0; i < len; i++) {
            const pPts = scorecard.scores[i]?.points || 0;
            const sPts = shadowScorecard.scores[i]?.points || 0;
            const diff = Math.abs(pPts - sPts);
            if (diff >= 1.5) {
              divergent.push({
                name: scorecard.scores[i]?.title || `Section ${i + 1}`,
                primary_grade: scorecard.scores[i]?.grade,
                shadow_grade: shadowScorecard.scores[i]?.grade,
                diff: diff.toFixed(1),
              });
            } else {
              agreed++;
            }
          }
          consensus = {
            method: "dual_model",
            primary_model: scoringModelConfig.model,
            shadow_model: "claude-haiku-4-5-20251001",
            agreement_rate: `${agreed}/${len}`,
            divergent_sections: divergent,
            confidence: divergent.length === 0 ? "high" : divergent.length <= 2 ? "moderate" : "mixed",
          };
          console.log(`Shadow scoring: ${agreed}/${len} consensus, ${divergent.length} divergent`);
        }
      } catch (shadowErr) {
        console.error("Shadow scorecard parse failed:", shadowErr.message);
      }
    }

    // --- Validate scorecard structure ---
    const validation = validateScorecard(scorecard);
    if (!validation.valid) {
      console.warn(`Scorecard validation warnings for ${scoring_id}:`, validation.errors);
      try {
        await logOpsEvent(supabase, {
          event_type: "QUALITY_FAILURE",
          source_function: "score-deck-background",
          severity: "warn",
          signature: "scorecard_validation_warning",
          affected_entity: scoring_id,
          details: { errors: validation.errors },
        });
      } catch { /* non-blocking */ }
    }
    // Use cleaned version with defaults applied
    if (validation.cleaned) {
      Object.assign(scorecard, validation.cleaned);
    }

    // --- Compute grade and weighted pWin ---
    const { avgScore, overallGrade, excludedCount } = computeOverallGrade(scorecard);

    // Compute compliance score from matrix (if SOW was provided)
    let complianceScore = null;
    if (scorecard.compliance_matrix && scorecard.compliance_matrix.length > 0) {
      const applicable = scorecard.compliance_matrix.filter((c) => c.status !== "N/A");
      const compliant = applicable.filter((c) => c.status === "COMPLIANT").length;
      const partial = applicable.filter((c) => c.status === "PARTIAL").length;
      complianceScore = applicable.length > 0
        ? Math.round(((compliant + partial * 0.5) / applicable.length) * 100)
        : null;
      scorecard._compliance_score = complianceScore;
      scorecard._compliance_summary = {
        total: scorecard.compliance_matrix.length,
        compliant,
        partial,
        missing: applicable.filter((c) => c.status === "MISSING").length,
        na: scorecard.compliance_matrix.length - applicable.length,
        score: complianceScore,
      };
      // Compliance threshold flags
      if (complianceScore < 60) {
        scorecard._compliance_flags = ["STOP-SHIP: Proposal likely non-responsive as submitted"];
      } else if (complianceScore < 80) {
        scorecard._compliance_flags = ["Significant compliance gaps — non-responsive risk"];
      }
      console.log(`[COMPLIANCE] Score: ${complianceScore}% (${compliant}/${applicable.length} compliant, ${partial} partial)`);
    }

    // Server-side pWin calculation (weighted model by default; additive = use Claude's raw pWin)
    const { calculatePwin } = require("./lib/pwin-calculator");
    const pwinModel = getFlag("FEATURE_PWIN_MODEL");
    const pwinResult = pwinModel === "additive"
      ? { pWin_factors: scorecard.pWin_factors || [], pwin_estimate: scorecard.pwin_estimate || "N/A", pwin_justification: "Using Claude raw pWin (additive model)", pwin: null, pwin_range: "N/A", factor_table: [], penalties: [], kill_conditions: [] }
      : calculatePwin(scorecard, { hasSow: !!finalSowText, documentType, complianceScore, excludedCount });
    // Inject computed pWin back into scorecard for downstream consumers
    scorecard.pWin_factors = pwinResult.pWin_factors;
    scorecard.pwin_estimate = pwinResult.pwin_estimate;
    scorecard.pwin_justification = pwinResult.pwin_justification;
    scorecard._pwin_details = {
      pwin: pwinResult.pwin,
      pwin_range: pwinResult.pwin_range,
      confidence_band: pwinResult.confidence_band || null,
      excluded_factors: pwinResult.excluded_factors || [],
      factor_table: pwinResult.factor_table,
      penalties: pwinResult.penalties,
      kill_conditions: pwinResult.kill_conditions,
    };
    console.log(`[pWin] ${pwinResult.pwin_range} | Penalties: ${pwinResult.penalties.length} | Kill conditions: ${pwinResult.kill_conditions.length}`);

    // Regulatory compliance flags (GSA MAS Refresh 31, FAR Modernization)
    const regulatoryResult = checkRegulatoryCompliance(extractedText || documentText, scorecard, documentType);
    if (regulatoryResult.flags.length > 0 || regulatoryResult.warnings.length > 0) {
      scorecard._regulatory_flags = regulatoryResult;
      console.log(`[REGULATORY] ${regulatoryResult.flags.length} flags, ${regulatoryResult.warnings.length} warnings`);
      // Merge high-severity regulatory flags into red_flags for visibility
      for (const flag of regulatoryResult.flags) {
        if (flag.severity === "high") {
          scorecard.red_flags = scorecard.red_flags || [];
          scorecard.red_flags.push(`[REGULATORY] ${flag.title}`);
        }
      }
    }

    // Track quality metrics
    try {
      await trackQuality(supabase, { product: "proposalpulse", orderId: scoring_id, grade: overallGrade, score: avgScore ? parseFloat(avgScore.toFixed(2)) : null, factors: { verdict: scorecard.verdict, pwin: pwinResult.pwin, document_type: documentType } });
    } catch { /* non-blocking */ }

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
    const wasTextTruncated = extractedText && extractedText.length >= MAX_TEXT_CHARS;
    const wasSowTruncated = finalSowText && finalSowText.length >= MAX_TEXT_CHARS;
    const scorecardWithMeta = {
      ...scorecard,
      _document_text: documentText || null,
      _model_routing: {
        scoring: { model: scoringModelConfig.model, reason: scoringModelConfig.reason },
      },
      _sow_detected_in_document: detectedSowInDocument,
      _truncation_warning: (wasTextTruncated || wasSowTruncated) ? {
        document_truncated: wasTextTruncated,
        sow_truncated: wasSowTruncated,
        max_chars: MAX_TEXT_CHARS,
        message: "Document exceeded maximum length and was truncated. Scoring may not reflect content beyond the cutoff point.",
      } : null,
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
        shadow_scorecard: shadowScorecard || null,
        consensus: consensus || null,
        shadow_model: shadowScorecard ? "claude-haiku-4-5-20251001" : null,
      })
      .eq("id", scoring_id);

    if (updateErr) {
      console.error("Failed to update scoring row:", updateErr);
    }

    console.log(`Scoring complete for ${scoring_id}: ${overallGrade} (${scorecard.verdict})`);

    // --- State: score_completed → email_queued ---
    try { await transitionState(supabase, "mp_scoring_history", scoring_id, "score_completed"); } catch (e) { console.error("State transition error:", e.message); }
    try { await transitionState(supabase, "mp_scoring_history", scoring_id, "email_queued"); } catch (e) { console.error("State transition error:", e.message); }

    // --- Send score receipt email (with degraded mode hold) ---
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

      const emailSubject = `Your ProposalPulse Results: ${scorecard.verdict} — ${config.label}`;
      const emailHtml = buildScoreReceiptHtml({
        scorecard,
        documentType,
        documentLabel: config.label,
        overallGrade,
        usesRemaining: usesRemaining,
        fileName: fileName,
        scoringId: scoring_id,
        consensus,
        hasSow: !!finalSowText,
      });

      // Generate Score Report HTML and store in Supabase
      let reportUrl = null;
      try {
        const { renderProposalPulseHTML } = require("./lib/report-html-renderer");
        const reportHtml = renderProposalPulseHTML({
          scorecard, overallGrade, documentType, documentLabel: config.label,
          fileName, hasSow: !!finalSowText,
          nextSteps: scorecard.next_steps || null,
          competitivePositioning: scorecard.competitive_positioning || null,
          complianceNote: !finalSowText ? `Scored against standard criteria for ${config.label}. Upload SOW for compliance mapping.` : null,
        });
        console.log(`Score report HTML generated: ${Math.round(reportHtml.length / 1024)}KB`);

        const { url } = generateReportUrl(scoring_id, "proposalpulse");
        reportUrl = url;
        await supabase.from("mp_scoring_history").update({ report_html: reportHtml, report_url: url }).eq("id", scoring_id);
        console.log(`Score report stored and URL generated for ${scoring_id}`);
      } catch (htmlErr) {
        console.error("Score report generation/storage failed:", htmlErr.message);
      }

      // Grade color for email
      const gradeColorMap = (g) => {
        if (/^A/.test(g)) return "#22c55e";
        if (/^B/.test(g)) return "#3b82f6";
        if (/^C/.test(g)) return "#eab308";
        return "#ef4444";
      };

      // Build email with link to hosted report
      const linkEmailHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#0a0e17;padding:32px 40px;text-align:center;">
    <div style="font-size:24px;font-weight:700;color:#00e5fa;letter-spacing:0.5px;">PROPOSALPULSE</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">AI-Powered Proposal Intelligence</div>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:16px;color:#1e293b;margin:0 0 16px;">Your proposal has been scored.</p>
    <p style="font-size:14px;color:#475569;margin:0 0 4px;font-weight:600;">Document</p>
    <p style="font-size:16px;color:#1e293b;margin:0 0 8px;">${(fileName || "uploaded document").replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</p>
    <p style="font-size:14px;color:#475569;margin:0 0 4px;font-weight:600;">Overall Grade</p>
    <p style="font-size:28px;font-weight:700;color:${gradeColorMap(overallGrade)};margin:0 0 24px;">${overallGrade || "N/A"}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${reportUrl || '#'}" style="display:inline-block;background:#00e5fa;color:#0a0e17;font-weight:700;font-size:16px;padding:14px 40px;text-decoration:none;border-radius:6px;">View Score Report</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">This link expires in 90 days.</p>
  </div>
  <div style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#9ca3af;">
    Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#0369a1;">missionmeetstech.com</a>
  </div>
</div>`;

      if (shouldHoldEmail()) {
        await holdEmail(supabase, email, emailSubject, linkEmailHtml, { product: "proposalpulse", record_id: scoring_id });
        console.log(`[degraded] Email held for ${scoring_id}`);
      } else {
        await sendEmail({
          to: email, subject: emailSubject, html: linkEmailHtml,
        });
        console.log(`Receipt email sent for ${scoring_id} (with report link)`);
      }

      // --- State: email_sent ---
      try { await transitionState(supabase, "mp_scoring_history", scoring_id, "email_sent"); } catch (e) { console.error("State transition error:", e.message); }

      // Submit to customer approval queue for portal visibility
      try {
        const { submitForApproval } = require("./lib/approval-hooks");
        await submitForApproval(supabase, {
          title: `Your ProposalPulse Score: ${scorecard?.verdict || "Complete"}`,
          category: "report-review",
          targetRole: "customer",
          targetEmail: email,
          submittedBy: "system",
          payloadType: "report",
          payload: { jobId: scoring_id, grade: scorecard?.verdict, reportUrl: null },
          context: { documentName: file_name || documentType, generatedAt: new Date().toISOString() },
        });
      } catch (_approvalErr) { console.error("approval-hooks:", _approvalErr.message); }
    } catch (emailErr) {
      console.error("Receipt email error:", emailErr);
      await logOpsEvent(supabase, { event_type: "DELIVERY_FAILURE", source_function: "score-deck-background", severity: "error", signature: "email_send_failure", affected_entity: scoring_id, details: { error: emailErr.message, email } });
      try { await transitionState(supabase, "mp_scoring_history", scoring_id, "email_failed"); } catch (e) { console.error("State transition error:", e.message); }
    }

    // --- Customer event logging ---
    try {
      const { logCustomerEvent } = require("./lib/customer-sync");
      await logCustomerEvent(supabase, { email, eventType: "delivery", product: "proposalpulse", metadata: { grade: scorecard?.verdict, scoringId: scoring_id } });
    } catch (_custErr) { console.error("customer-sync:", _custErr.message); }

    // --- C3: Emit intelligence signals ---
    try {
      const docText = documentText || extractedText || "";
      if (docText.length > 50) {
        const signals = extractIntelSignals(docText, {
          document_type: documentType,
          verdict: scorecard.verdict,
          overall_score: avgScore,
        });
        if (signals.length > 0) {
          await supabase.from("intelligence_signals").insert(
            signals.map((sig) => ({
              signal_type: sig.type,
              signal_key: sig.key,
              signal_value: sig.value,
              source_product: "proposalpulse",
            }))
          );
          console.log(`Emitted ${signals.length} intelligence signals`);
        }
      }
    } catch (sigErr) {
      console.error("Signal emission failed:", sigErr.message);
    }

    // --- Trigger Gold Team Review (fire-and-forget) ---
    try {
      const siteUrl = process.env.URL || "https://missionmeetstech.com";
      const gtrPayload = JSON.stringify({ scoring_id });
      const gtrUrl = `${siteUrl}/.netlify/functions/gold-team-review-background`;
      await fetchWithTimeout(gtrUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: gtrPayload,
      });
      console.log(`Gold Team Review triggered for ${scoring_id}`);
    } catch (gtErr) {
      // Gold Team failure must never block delivery
      console.error(`Gold Team Review trigger failed for ${scoring_id}: ${gtErr.message}`);
    }

    // --- B9: Log completion with cost estimate ---
    try {
      const inputTokens = tokenUsage.input || 0;
      const outputTokens = tokenUsage.output || 0;
      // Sonnet 4.5: $3/M input, $15/M output
      const costEstimate = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
      await logOpsEvent(supabase, {
        event_type: "function_completed",
        source_function: "score-deck-background",
        scoring_id,
        severity: "info",
        details: {
          tokens_input: inputTokens,
          tokens_output: outputTokens,
          cost_estimate: Math.round(costEstimate * 10000) / 10000,
          model: scoringModelConfig.model,
          document_type: documentType,
        },
      });
    } catch { /* non-blocking */ }

    // --- State: delivered ---
    try { await transitionState(supabase, "mp_scoring_history", scoring_id, "delivered"); } catch (e) { console.error("State transition error:", e.message); }

    return { statusCode: 200, body: "Scoring complete" };

  } catch (err) {
    console.error("Unhandled error in score-deck-background:", err);

    if (scoring_id) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await logOpsEvent(supabase, { event_type: "HARNESS_FAILURE", source_function: "score-deck-background", severity: "critical", signature: "unhandled_error", affected_entity: scoring_id, details: { error: err.message, stack: (err.stack || "").substring(0, 500) } });
        await markError(supabase, scoring_id, "Internal server error. Please try again.");
      } catch (dbErr) {
        console.error("Failed to mark error in DB:", dbErr);
      }
    }

    return { statusCode: 200, body: "Error handled" };
  }
});


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
