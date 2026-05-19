// ============================================================
// gold-team-review-background.js — Netlify Background Function
//
// Gold Team Review: Two-phase AI document enhancement
//   Call 1: Rewrite ALL 9 sections + pWin estimate
//   Call 2: Independent review + executive summary + next steps
//   Then: Email branded Gold Team Review via Resend
//
// Background function: returns 202 immediately, runs up to 15 min.
// Triggered by frontend after scoring completes.
//
// Receives only { scoring_id } — reads all data from the DB.
// The scoring function stores _document_text in the scores JSONB.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { DOCUMENT_TYPES } = require("./lib/document-types");
const { sendEmail } = require("./lib/send-email");
const { buildGoldTeamReviewHtml } = require("./lib/email-templates");
const { getModelConfig } = require("./lib/model-router");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");
const { withRetry } = require("./lib/retry");
const { checkKillSwitch } = require("./lib/kill-switch");
const { extractIntelSignals } = require("./lib/signal-extractor");
const { logOpsEvent } = require("./lib/ops-ledger");
const { generateReportUrl } = require("./lib/report-url");
const { trackAnthropic, trackOllama } = require("./lib/cost-tracker");
const { callModel, isLocalProvider } = require("./lib/inference");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const REWRITE_MAX_TOKENS = 12000;
const REVIEW_MAX_TOKENS = 6000;

// Retry + degrade config for Anthropic calls.
// Per-attempt timeout < Netlify 900s background cap / 6 (leaves headroom for rewrite + review + email).
// Backoff deltas from user spec: 2s, 6s between attempts.
const ANTHROPIC_ATTEMPT_TIMEOUT_MS = 120000;
const ANTHROPIC_RETRY_DELAYS_MS = [2000, 6000];
const ANTHROPIC_MAX_ATTEMPTS = ANTHROPIC_RETRY_DELAYS_MS.length + 1;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


// ============================================================
// CLAUDE API HELPER
// ============================================================

let _lastClaudeUsage = null;

async function callClaude(systemPrompt, userPrompt, maxTokens, model, temperature = 0.3, modelConfig = null) {
  // Route through inference helper when model config indicates local provider.
  // Local provider path uses its own retry via withRetry — not covered by the
  // per-attempt timeout + backoff logic below (which is Anthropic-specific).
  if (modelConfig && isLocalProvider(modelConfig)) {
    const result = await withRetry(() => callModel(modelConfig, {
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: maxTokens,
      temperature,
      agent: "gold-team-review",
      taskType: modelConfig._taskType || "rewrite",
    }));
    _lastClaudeUsage = result.usage || null;
    return result.text;
  }

  // Anthropic path (production default): per-attempt 120s timeout, 3 attempts,
  // 2s + 6s exponential backoff. Throws with err.allRetriesTimeout = true when
  // every attempt trips the timeout so callers can degrade gracefully instead
  // of just logging and aborting.
  const role = modelConfig && modelConfig._taskType ? modelConfig._taskType : "call";
  const startedAt = Date.now();
  let lastError = null;
  for (let attempt = 0; attempt < ANTHROPIC_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userPrompt }],
        }),
      }, ANTHROPIC_ATTEMPT_TIMEOUT_MS);

      if (!response.ok) {
        const errText = await response.text();
        const status = response.status;
        // Retry transient server errors; bail immediately on 4xx (client errors won't self-heal)
        if ([429, 500, 502, 503, 529].includes(status) && attempt < ANTHROPIC_MAX_ATTEMPTS - 1) {
          lastError = new Error(`Claude API ${status}: ${errText}`);
          console.error(`Gold Team ${role}: attempt ${attempt + 1}/${ANTHROPIC_MAX_ATTEMPTS} got ${status}, retrying`);
          await new Promise((r) => setTimeout(r, ANTHROPIC_RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw new Error(`Claude API ${status}: ${errText}`);
      }

      const data = await response.json();
      _lastClaudeUsage = data.usage || null;
      return data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
    } catch (err) {
      lastError = err;
      const isTimeout = /timed out after/i.test(err.message);
      if (!isTimeout) {
        // Non-timeout exceptions (JSON parse, network error) — throw immediately
        throw err;
      }
      console.error(`Gold Team ${role}: attempt ${attempt + 1}/${ANTHROPIC_MAX_ATTEMPTS} timed out`);
      if (attempt < ANTHROPIC_MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, ANTHROPIC_RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  // All attempts timed out
  const timeoutErr = new Error(`Gold Team ${role}: all ${ANTHROPIC_MAX_ATTEMPTS} attempts timed out`);
  timeoutErr.allRetriesTimeout = true;
  timeoutErr.elapsedMs = Date.now() - startedAt;
  timeoutErr.cause = lastError ? lastError.message : null;
  throw timeoutErr;
}

function parseJson(text) {
  const cleaned = text.replace(/```json\s?/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}


// ============================================================
// ENTITY VALIDATION (Post-processing)
// ============================================================

const ENTITY_BLOCKLIST = [
  /mission\s*meets?\s*tech/i,
  /\bMMT\b/,
];

function validateEntityIntegrity(rewriteResult, documentText) {
  const warnings = [];
  if (!rewriteResult || !rewriteResult.strengthened_sections) return { warnings, clean: true };

  for (const section of rewriteResult.strengthened_sections) {
    const text = section.strengthened_text || "";
    for (const pattern of ENTITY_BLOCKLIST) {
      if (pattern.test(text)) {
        warnings.push({
          section: section.criterion_title,
          issue: `Contains blocked entity name matching: ${pattern}`,
          severity: "critical",
        });
        // Scrub the offending text and flag it
        section.strengthened_text = text.replace(pattern, "[ENTITY NAME REMOVED — verify your organization name]");
        section._entity_warning = true;
      }
    }
  }

  return { warnings, clean: warnings.length === 0 };
}


// ============================================================
// PROMPT BUILDERS
// ============================================================

function buildRewritePrompt(documentText, scorecard, scores, config) {
  const sectionList = scores
    .map((s) => `- ${s.title} (Grade: ${s.grade}, ${s.points} pts): ${s.assessment}`)
    .join("\n");

  return {
    system: `You are a Shipley-trained senior capture strategist and proposal editor reviewing a ${config.noun} for Mission Meets Tech's ProposalPulse Gold Team Review.

YOUR STANDARD: You produce the caliber of review that Lohfeld Consulting or Shipley Associates would deliver. You are NOT just polishing prose — you are strengthening the proposal's competitive position. Every rewrite must move a section from "acceptable" toward "significant strength" in SSEB evaluation terms.

STRATEGIC APPROACH (DO THIS FIRST — before rewriting any section):
1. IDENTIFY WIN THEMES: Read the entire document and extract the win themes (consistent strategic messages that differentiate this offeror). If win themes are absent, PROPOSE 2-3 based on the offeror's strongest demonstrated capabilities.
2. IDENTIFY VULNERABILITIES: For each section, ask "If I were competing against this proposal, what would I attack?" Rewrites must close these vulnerabilities.
3. CHECK COHERENCE: Do technical approach, staffing, past performance, and management tell the SAME story? If not, note where the narrative breaks.

Your job: Rewrite ALL sections. Strong sections (B- or above, 2.5+ pts) get strategic polish — sharper positioning, stronger discriminators, win theme reinforcement. Weak sections (C+ or below, 2.0 pts or less) get substantial rewrites that address the scoring weakness AND strengthen competitive positioning.

Additionally, estimate the document's probability of winning (pWin) as a percentage range.

ENTITY EXTRACTION (MANDATORY):
Before rewriting, identify all organizational entities in the document.
Classify each as: prime_contractor, subcontractor, teaming_partner, government_client, incumbent, or other.

ENTITY PRESERVATION RULES:
- PRESERVE all original entity names exactly as they appear.
- NEVER substitute "Mission Meets Tech", "MMT", or any MMT brand name into proposal text.
- NEVER insert any company name not in the original document.
- If you cannot determine the customer's entity, insert: [HUMAN DECISION REQUIRED: Confirm your organization name]
- Preserve all acronyms and their expansions exactly.

pWin METHODOLOGY (use this formula):
Base rates by document type: RFP response 15%, White paper 25%, Capabilities statement 30%, Pitch deck 20%, Pricing volume 15%, Executive summary 25%.
Adjustments: Each section scoring B+ or above: +5 percentage points. Each section scoring D or below: -10 points. Strong SOW/PWS alignment: +10 points. Past performance section A: +10 points. Multiple red flags in pricing: -15 points.
Bounds: minimum 5%, maximum 85%. Report as a range (e.g., "25-35%"), not a single number.

CHAIN OF THOUGHT: Before rewriting each section:
1. State the current SSEB-equivalent rating (significant strength / strength / acceptable / weakness / deficiency)
2. Identify the 2-3 specific weaknesses or missed opportunities
3. State what competitive vulnerability this creates
4. Rewrite to address all three, reinforcing the identified win theme

REWRITE RULES:
- Quote 2-4 sentences from the original for each section.
- Provide a strengthened version (~same length, within 20%).
- Explain what changed and WHY IT MATTERS COMPETITIVELY (not just "tighter language").
- For strong sections: Reinforce win themes, add discriminator language, sharpen evidence.
- For weak sections: Address scoring weakness AND competitive vulnerability. Show what an evaluator would write as a "strength" after the rewrite.
- NEVER fabricate facts, credentials, contract numbers, dollar amounts. Use [INSERT: description] placeholders.
- If source material is too thin (3+ placeholders needed), label "SECTION ARCHITECTURE — Author Must Complete" with status "skeleton".
- Match the document's existing tone — formal federal contracting, not marketing.
- Return ONLY valid JSON. No markdown code fences.

REWRITE CONFIDENCE SCORING:
After rewriting each section, assign a confidence score (0-100%) with a one-sentence rationale.
Scoring criteria:
- 90-100%: Rewrite uses only claims and data present in the original document
- 70-89%: Rewrite infers some claims based on context but all are reasonable
- 50-69%: Rewrite includes inferred claims not directly supported by the document
- Below 50%: Rewrite includes significant assumptions or fabricated specifics

RESPONSE FORMAT:
{
  "strengthened_sections": [
    {
      "criterion_id": "the-criterion-id",
      "criterion_title": "Criterion Title",
      "original_grade": "B+",
      "status": "polished",
      "original_excerpt": "Exact 2-4 sentence quote from the document...",
      "strengthened_text": "Your improved version of those sentences...",
      "changes_made": "Brief explanation of what changed and why.",
      "rewrite_confidence": 85,
      "confidence_rationale": "One sentence explaining confidence level."
    }
  ],
  "pwin_estimate": "25-35%",
  "pwin_justification": "Brief 2-3 sentence justification showing base rate + adjustments applied."
}

For the "status" field, use "polished" for strong sections (B- or above) and "rewritten" for weak sections (C+ or below).`,
    user: `Here is the full document text for a ${config.noun}:

---
${documentText}
---

Here is the ProposalPulse scorecard for this document:

Verdict: ${scorecard.verdict}
Overall assessment: ${scorecard.verdict_summary || "N/A"}

ALL SECTIONS TO REWRITE:
${sectionList}

${scorecard.top_fix ? `Top Fix recommended: ${scorecard.top_fix}` : ""}

Rewrite every section (polish strong ones, substantially rewrite weak ones). Estimate pWin. Return only the JSON.`,
  };
}

/**
 * Degraded-mode review prompt used when the rewrite pass was skipped
 * (e.g., Anthropic timed out on all retries). Reviewer evaluates the ORIGINAL
 * scorecard + document text directly and produces the same response shape as
 * buildReviewPrompt so downstream merging/email code is unchanged.
 */
function buildReviewPromptFromOriginal(scorecard, scores, documentText, config) {
  const sectionsForReview = scores
    .map(
      (s) => `## ${s.title} (Original grade: ${s.grade}, ${s.points} pts)
ASSESSMENT: "${s.assessment || "(no assessment)"}"`
    )
    .join("\n\n");

  const truncatedDoc = (documentText || "").substring(0, 40000);

  return {
    system: `You are an independent quality reviewer for federal proposal documents. The AI rewrite pass for this ${config.noun} was unavailable (timed out), so you are providing an EXPEDITED review directly on the ORIGINAL document and its scorecard.

Your job:
1. For each scored section, re-evaluate the original assessment. Is the grade consistent with what the document shows? Any mischaracterizations? What is the strongest critique a federal evaluator would make?
2. Write a 3-5 bullet executive summary of strengths and weaknesses across the document.
3. Provide 3-5 prioritized next steps the author should take to strengthen the proposal before the next revision.
4. Assess overall confidence (0-100%) that the current scorecard accurately reflects the document.

Return ONLY valid JSON. No markdown code fences. No preamble.

{
  "reviews": [
    {
      "criterion_id": "id matching the original scorecard section",
      "confidence_pct": 0-100,
      "accuracy_ok": true|false,
      "consistency_ok": true|false,
      "improvement_ok": null,
      "notes": "Your critique of the original assessment and what an evaluator would say."
    }
  ],
  "overall_confidence": 0-100,
  "executive_summary": "3-5 bullets about document strengths and weaknesses",
  "next_steps": ["Prioritized action 1", "Prioritized action 2", "..."],
  "reviewer_notes": "Optional: anything the reviewer wants to flag that doesn't fit above.",
  "win_theme_coherence": "strong|partial|absent"
}`,
    user: `ORIGINAL DOCUMENT (first 40,000 chars):
---
${truncatedDoc}
---

ORIGINAL SCORECARD (${scorecard.verdict || "no verdict"}):
${sectionsForReview}

TOP FIX: ${scorecard.top_fix || "(none)"}
RED FLAGS: ${(scorecard.red_flags || []).map((f) => `- ${f}`).join("\n") || "(none)"}

Review this expedited delivery now. Return only JSON.`,
  };
}

function buildReviewPrompt(rewriteResult, config) {
  const sectionsForReview = rewriteResult.strengthened_sections
    .map(
      (s) => `## ${s.criterion_title} (Original: ${s.original_grade}, Status: ${s.status})
ORIGINAL: "${s.original_excerpt}"
STRENGTHENED: "${s.strengthened_text}"
CHANGES: ${s.changes_made}`
    )
    .join("\n\n");

  return {
    system: `You are an independent quality reviewer for federal proposal documents. You are reviewing AI-generated rewrites of a ${config.noun}.

CRITICAL: You did NOT write these rewrites. You are an independent reviewer. Your job is to triple-check each rewrite for quality.

For each strengthened section, evaluate four things:
1. ACCURACY — Are there any fabricated facts, credentials, contract numbers, or statistics? Any claims that weren't in the original?
2. CONSISTENCY — Does the tone match federal contracting conventions? Any jarring style shifts from the original document?
3. IMPROVEMENT — Is this actually stronger than the original, or just word-shuffling? Does it address the scoring weakness? Would the SSEB rating move from "acceptable" toward "strength"?
4. WIN THEME COHERENCE — Does the rewrite reinforce the proposal's win themes? Are the same differentiators threading through this section as through other sections? If win themes are absent or contradictory, flag it.

Assign a confidence percentage (0-100%) for each section:
- 90-100%: Excellent rewrite, ready to use with minor tweaks
- 70-89%: Good rewrite, some areas need human review
- 50-69%: Acceptable but needs significant human editing
- Below 50%: Rewrite has issues — flag for human rewrite

Additionally:
- Write an executive change summary: 3-5 bullet points covering what improved overall and what still needs the author's input.
- Provide 3-5 prioritized next steps the author should take after incorporating these changes.
- Assess WIN THEME COHERENCE across all rewritten sections: Do they tell the same strategic story? Are discriminators consistent? Rate as "strong" (consistent themes), "partial" (some sections reinforce, others don't), or "absent" (no coherent win strategy).

CHAIN OF THOUGHT: For each section, state what the rewrite improved and what it missed before assigning your scores. Your reasoning should appear in the "notes" field.

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
  "reviewer_notes": "1-2 sentence overall assessment of the rewrites.",
  "executive_summary": [
    "Bullet point about what improved or needs attention"
  ],
  "next_steps": [
    "Prioritized action item for the author"
  ]
}`,
    user: `Review these AI-generated rewrites for a ${config.noun}:

${sectionsForReview}

Triple-check each rewrite. Provide executive summary and next steps. Return only the JSON.`,
  };
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
  const killCheck = checkKillSwitch("gold-team-review-background");
  if (killCheck.blocked) return killCheck.response;

  console.log("Gold Team Review invoked");

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
    const scoring_id = body.scoring_id;

    if (!scoring_id) {
      console.error("Gold Team: missing scoring_id");
      return;
    }

    console.log(`Gold Team: starting for scoring_id=${scoring_id}`);

    // --- Read scoring record from DB ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: record, error: lookupErr } = await supabase
      .from("mp_scoring_history")
      .select("id, scores, verdict, document_type, file_name, user_id, created_at")
      .eq("id", scoring_id)
      .single();

    if (lookupErr || !record) {
      await logOpsEvent(supabase, {
        event_type: "GOLD_TEAM_SKIPPED",
        source_function: "gold-team-review-background",
        severity: "error",
        signature: "MISSING_RECORD",
        affected_entity: scoring_id,
        details: { lookup_error: lookupErr?.message || null },
      });
      return;
    }

    // Anti-abuse: verify record is recent (within 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    if (record.created_at < tenMinutesAgo) {
      await logOpsEvent(supabase, {
        event_type: "GOLD_TEAM_SKIPPED",
        source_function: "gold-team-review-background",
        severity: "warn",
        signature: "ALREADY_DELIVERED",
        affected_entity: scoring_id,
        details: { scoring_record_created_at: record.created_at },
      });
      return;
    }

    if (!record.scores || record.scores._pending) {
      await logOpsEvent(supabase, {
        event_type: "GOLD_TEAM_SKIPPED",
        source_function: "gold-team-review-background",
        severity: "warn",
        signature: "MISSING_SCORES",
        affected_entity: scoring_id,
        details: { scores_null: !record.scores, pending: record.scores?._pending === true },
      });
      return;
    }

    // Extract data from the scoring record
    const scorecard = record.scores;
    let documentText = scorecard._document_text || null;
    const document_type = record.document_type || "pitch_deck";
    const file_name = record.file_name;

    const config = DOCUMENT_TYPES[document_type];
    if (!config) {
      await logOpsEvent(supabase, {
        event_type: "GOLD_TEAM_SKIPPED",
        source_function: "gold-team-review-background",
        severity: "error",
        signature: "MISSING_DOC_TYPE",
        affected_entity: scoring_id,
        details: { document_type },
      });
      return;
    }

    // Look up user email
    const { data: user } = await supabase
      .from("mp_users")
      .select("email")
      .eq("id", record.user_id)
      .single();

    if (!user || !user.email) {
      await logOpsEvent(supabase, {
        event_type: "GOLD_TEAM_SKIPPED",
        source_function: "gold-team-review-background",
        severity: "error",
        signature: "MISSING_EMAIL",
        affected_entity: scoring_id,
        details: { user_id: record.user_id, document_type },
      });
      return;
    }

    const normalizedEmail = user.email.toLowerCase().trim();

    // Fallback: if stored text is insufficient (e.g., pdf-parse failed on an image-heavy PDF),
    // hand the preserved PDF buffer to Claude natively — same path score-deck uses for scoring.
    if (!documentText || documentText.trim().length < 50) {
      const pdfFallbackB64 = scorecard._pdf_fallback_b64 || null;
      let fallbackError = null;
      if (pdfFallbackB64) {
        console.log(`Gold Team: attempting native-PDF fallback for ${scoring_id}`);
        try {
          const fbResponse = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 8000,
              temperature: 0,
              messages: [{
                role: "user",
                content: [
                  { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfFallbackB64 } },
                  { type: "text", text: "Extract all visible text from this document verbatim. Return only the raw extracted text with paragraph breaks preserved. No commentary, no markdown, no summary." },
                ],
              }],
            }),
          }, 120000);
          if (!fbResponse.ok) {
            fallbackError = `anthropic_${fbResponse.status}`;
          } else {
            const fbData = await fbResponse.json();
            const extracted = (fbData.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
            if (extracted && extracted.trim().length >= 50) {
              documentText = extracted;
              console.log(`Gold Team: native-PDF fallback succeeded (${extracted.length} chars)`);
            } else {
              fallbackError = "empty_extraction";
            }
          }
        } catch (fbErr) {
          fallbackError = fbErr.message;
        }
      }
      if (!documentText || documentText.trim().length < 50) {
        await logOpsEvent(supabase, {
          event_type: "GOLD_TEAM_SKIPPED",
          source_function: "gold-team-review-background",
          severity: "warn",
          signature: "INSUFFICIENT_DOCUMENT_TEXT",
          affected_entity: scoring_id,
          details: {
            email: normalizedEmail,
            document_type,
            fallback_attempted: !!pdfFallbackB64,
            fallback_error: fallbackError,
          },
        });
        return;
      }
    }

    // --- C7: Query competitive context from platform intelligence ---
    let competitiveContext = "";
    try {
      const signals = extractIntelSignals(documentText, {});
      const vehicles = signals.filter((s) => s.type === "vehicle_interest").map((s) => s.key);
      const agencies = signals.filter((s) => s.type === "agency_interest").map((s) => s.key);

      if (vehicles.length > 0 || agencies.length > 0) {
        const searchTerms = [...vehicles, ...agencies].slice(0, 5);
        const orFilter = searchTerms.map((t) => `contract_name.ilike.%${t}%`).join(",");

        const { data: contracts } = await supabase
          .from("contract_intel")
          .select("contract_name, intel, black_hat")
          .or(orFilter)
          .order("last_updated", { ascending: false })
          .limit(5);

        const oppOrFilter = searchTerms.map((t) => `title.ilike.%${t}%`).join(",");
        const { data: opportunities } = await supabase
          .from("opportunity_radar")
          .select("title, agency, response_deadline, set_aside_type")
          .or(oppOrFilter)
          .order("scan_date", { ascending: false })
          .limit(5);

        if (contracts?.length || opportunities?.length) {
          competitiveContext = "\n\nCOMPETITIVE INTELLIGENCE (from MMT platform data — use to strengthen positioning):\n";
          if (contracts?.length) {
            competitiveContext += "\nRecent contract intel on detected vehicles/agencies:\n";
            contracts.forEach((c) => {
              const summary = c.intel?.summary ? c.intel.summary.substring(0, 200) : "No summary";
              competitiveContext += `- ${c.contract_name}: ${summary}\n`;
            });
          }
          if (opportunities?.length) {
            competitiveContext += "\nActive opportunities on detected vehicles:\n";
            opportunities.forEach((o) => {
              competitiveContext += `- ${o.title} (${o.agency}): deadline ${o.response_deadline || "TBD"}, set-aside: ${o.set_aside_type || "none"}\n`;
            });
          }
        }
        if (competitiveContext) {
          console.log(`Gold Team: injecting competitive context (${contracts?.length || 0} contracts, ${opportunities?.length || 0} opportunities)`);
        }
      }
    } catch (ctxErr) {
      console.error("Gold Team: competitive context query failed:", ctxErr.message);
    }

    // --- Call 1: Rewrite ALL sections + pWin ---
    const scores = scorecard.scores || [];

    const rewriteModelConfig = await getModelConfig(supabase, "rewrite");
    console.log(`Gold Team: rewriting all ${scores.length} sections for ${normalizedEmail} (model=${rewriteModelConfig.model} [${rewriteModelConfig.reason}])`);

    const rewritePrompt = buildRewritePrompt(documentText, scorecard, scores, config);
    // Inject competitive context if available
    if (competitiveContext) {
      rewritePrompt.user += competitiveContext;
    }
    let rewriteResult;
    let rewriteSkipped = false;

    const _costStartRewrite = Date.now();
    try {
      const rewriteText = await callClaude(rewritePrompt.system, rewritePrompt.user, REWRITE_MAX_TOKENS, rewriteModelConfig.model, 0.4, { ...rewriteModelConfig, _taskType: "rewrite" });
      rewriteResult = parseJson(rewriteText);
      // Cost tracking: rewrite call
      try {
        await trackAnthropic(supabase, {
          functionName: 'gold-team-review-background',
          product: 'proposalpulse',
          orderId: scoring_id,
          model: rewriteModelConfig.model,
          usage: _lastClaudeUsage,
          latencyMs: Date.now() - _costStartRewrite,
          metadata: { role: 'rewrite' },
        });
      } catch (_costErr) { /* never break gold team */ }
    } catch (err) {
      // Degrade path: any rewrite failure (timeout, anthropic error, JSON parse
      // error) falls back to synthesizing a minimal rewriteResult from the
      // original scorecard and proceeding to an expedited review pass. This
      // delivers SOMETHING to the customer instead of silently returning.
      // Bit jmichaud@arcadianpartners.com (2026-04-20) when only the
      // allRetriesTimeout branch existed; their email never sent.
      rewriteSkipped = true;
      const isTimeout = !!err.allRetriesTimeout;
      const skipSignature = isTimeout ? "ALL_RETRIES_TIMEOUT" : "REWRITE_CALL_FAILED";
      const attempts = ANTHROPIC_MAX_ATTEMPTS;
      await logOpsEvent(supabase, {
        event_type: "GOLD_TEAM_REWRITE_SKIPPED",
        source_function: "gold-team-review-background",
        severity: "warn",
        signature: skipSignature,
        affected_entity: scoring_id,
        details: {
          attempts,
          elapsed_ms: err.elapsedMs || (Date.now() - _costStartRewrite),
          model: rewriteModelConfig.model,
          last_error: err.cause || err.message,
          is_timeout: isTimeout,
        },
      });
      console.warn(`Gold Team: rewrite skipped (${skipSignature}) — proceeding to expedited review`);
      rewriteResult = {
        strengthened_sections: scores.map((s) => ({
          criterion_id: s.id,
          criterion_title: s.title,
          original_grade: s.grade,
          original_excerpt: s.assessment || "",
          strengthened_text: s.assessment || "",
          changes_made: "(rewrite pass skipped — expedited delivery)",
          status: "expedited",
          rewrite_confidence: null,
          confidence_rationale: null,
        })),
        pwin_estimate: null,
        pwin_justification: null,
        _rewrite_skipped: true,
      };
    }

    if (!rewriteResult.strengthened_sections || rewriteResult.strengthened_sections.length === 0) {
      console.error("Gold Team: rewrite returned no sections");
      return;
    }

    // Post-processing: validate entity integrity (skip when rewrites are synthetic)
    if (!rewriteSkipped) {
      const entityCheck = validateEntityIntegrity(rewriteResult, documentText);
      if (!entityCheck.clean) {
        console.warn(`Gold Team: entity validation found ${entityCheck.warnings.length} issues — scrubbed`);
        await logOpsEvent(supabase, {
          event_type: "QUALITY_FAILURE",
          source_function: "gold-team-review-background",
          severity: "warn",
          signature: "entity_substitution_detected",
          affected_entity: scoring_id,
          details: { warnings: entityCheck.warnings },
        });
      }
    }

    // --- Call 2: Review + Executive Summary + Next Steps ---
    const reviewModelConfig = await getModelConfig(supabase, "review");
    console.log(`Gold Team: reviewing ${rewriteSkipped ? "original document (expedited mode)" : "rewrites"} (model=${reviewModelConfig.model} [${reviewModelConfig.reason}])...`);

    let reviewResult = null;
    const _costStartReview = Date.now();
    try {
      const reviewPrompt = rewriteSkipped
        ? buildReviewPromptFromOriginal(scorecard, scores, documentText, config)
        : buildReviewPrompt(rewriteResult, config);
      const reviewText = await callClaude(reviewPrompt.system, reviewPrompt.user, REVIEW_MAX_TOKENS, reviewModelConfig.model, 0.2, { ...reviewModelConfig, _taskType: "review" });
      reviewResult = parseJson(reviewText);
      // Cost tracking: review call
      try {
        await trackAnthropic(supabase, {
          functionName: 'gold-team-review-background',
          product: 'proposalpulse',
          orderId: scoring_id,
          model: reviewModelConfig.model,
          usage: _lastClaudeUsage,
          latencyMs: Date.now() - _costStartReview,
          metadata: { role: 'review' },
        });
      } catch (_costErr) { /* never break gold team */ }
    } catch (err) {
      if (err.allRetriesTimeout) {
        await logOpsEvent(supabase, {
          event_type: "GOLD_TEAM_REVIEW_FAILED",
          source_function: "gold-team-review-background",
          severity: "error",
          signature: "ALL_RETRIES_TIMEOUT",
          affected_entity: scoring_id,
          details: {
            attempts: ANTHROPIC_MAX_ATTEMPTS,
            elapsed_ms: err.elapsedMs || (Date.now() - _costStartReview),
            model: reviewModelConfig.model,
            rewrite_skipped: rewriteSkipped,
            last_error: err.cause || err.message,
          },
        });
        console.error(`Gold Team: review call exhausted ${ANTHROPIC_MAX_ATTEMPTS} attempts — aborting delivery (no partial email)`);
        return;
      }
      console.error("Gold Team: review call failed (degrading gracefully):", err);
      // Non-timeout error on review — continue without reviewResult to preserve prior behavior
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
        rewrite_confidence: section.rewrite_confidence || null,
        confidence_rationale: section.confidence_rationale || null,
        _entity_warning: section._entity_warning || false,
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
    console.log("Gold Team: sending Gold Team Review email...");

    // FIX 2b: Single source of truth for pWin — use the server-calculated pWin
    // from the scoring engine (stored in scorecard._pwin_details), NOT the
    // AI-generated pWin from the rewrite call. This prevents contradictory numbers.
    const canonicalPwin = scorecard._pwin_details || {};
    const canonicalPwinEstimate = canonicalPwin.pwin_range || scorecard.pwin_estimate || rewriteResult.pwin_estimate || null;
    const canonicalPwinJustification = scorecard.pwin_justification || rewriteResult.pwin_justification || null;

    const emailHtml = buildGoldTeamReviewHtml({
      documentLabel: config.label,
      fileName: file_name,
      verdict: scorecard.verdict,
      overallGrade,
      scores,
      strengthenedSections: mergedSections,
      pwinEstimate: canonicalPwinEstimate,
      pwinJustification: canonicalPwinJustification,
      overallConfidence: reviewResult ? reviewResult.overall_confidence : null,
      reviewerNotes: reviewResult ? reviewResult.reviewer_notes : null,
      executiveSummary: reviewResult ? reviewResult.executive_summary : null,
      nextSteps: reviewResult ? reviewResult.next_steps : null,
      tieredNextSteps: scorecard.next_steps || null,
      pwinFactors: scorecard.pWin_factors || null,
      competitivePositioning: scorecard.competitive_positioning || null,
      complianceMatrix: scorecard.compliance_matrix || null,
    });

    // Generate Red Team Review HTML and store in Supabase
    let reportUrl = null;
    try {
      const { renderProposalPulseHTML } = require("./lib/report-html-renderer");
      const reviewHtml = renderProposalPulseHTML({
        scorecard, overallGrade, documentLabel: config.label, fileName: file_name,
        hasSow: !!scorecard._document_text,
        nextSteps: scorecard.next_steps || null,
        competitivePositioning: scorecard.competitive_positioning || null,
        pwinEstimate: rewriteResult.pwin_estimate || null,
        pwinJustification: rewriteResult.pwin_justification || null,
        redTeamSections: mergedSections,
        redTeamExecutiveSummary: reviewResult ? reviewResult.executive_summary : null,
        redTeamNextSteps: reviewResult ? reviewResult.next_steps : null,
      });
      console.log(`Red Team review HTML generated: ${Math.round(reviewHtml.length / 1024)}KB`);

      const { url } = generateReportUrl(scoring_id, "redteam");
      reportUrl = url;
      await supabase.from("mp_scoring_history").update({ redteam_report_html: reviewHtml, redteam_report_url: url }).eq("id", scoring_id);
      console.log(`Red Team report stored and URL generated for ${scoring_id}`);
    } catch (htmlErr) {
      console.error("Red Team review generation/storage failed:", htmlErr.message);
    }

    // Send email with link to hosted Red Team report
    const expeditedHeaderLabel = rewriteSkipped
      ? `<div style="font-size:12px;color:#f59e0b;margin-top:6px;font-weight:600;">Expedited delivery &mdash; rewrite pass skipped</div>`
      : "";
    const expeditedBanner = rewriteSkipped
      ? `<div style="background:#FEF9E7;border:1px solid #E5D9A8;border-radius:6px;padding:12px 14px;margin:0 0 20px;font-size:13px;color:#92710A;line-height:1.55;"><strong>Gold Team Review (expedited).</strong> The rewrite pass was skipped due to document complexity; the review findings below are based on the source document. If you want the full rewrite pass, reply to this email and we'll re-run it.</div>`
      : "";
    const redTeamEmailHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#0A192F;padding:32px 40px;text-align:center;">
    <div style="font-size:24px;font-weight:700;color:#ef4444;letter-spacing:0.5px;">RED TEAM REVIEW</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">ProposalPulse Deep Analysis</div>
    ${expeditedHeaderLabel}
  </div>
  <div style="padding:32px 40px;">
    ${expeditedBanner}
    <p style="font-size:16px;color:#1e293b;margin:0 0 16px;">Your Red Team Review is ready.</p>
    <p style="font-size:14px;color:#475569;margin:0 0 4px;font-weight:600;">Document</p>
    <p style="font-size:16px;color:#1e293b;margin:0 0 24px;">${(file_name || "uploaded document").replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${reportUrl ? reportUrl.replace(/&/g, '&amp;') : '#'}" style="display:inline-block;background:#ef4444;color:#ffffff;font-weight:700;font-size:16px;padding:14px 40px;text-decoration:none;border-radius:6px;">View Red Team Review</a>
    </div>
    ${reportUrl ? `<div style="margin:16px 0 0;padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;"><p style="margin:0 0 6px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Plain-text link (copy &amp; paste if the button doesn't work)</p><p style="margin:0;font-size:11px;color:#0A192F;font-family:'SFMono-Regular',Menlo,Consolas,monospace;word-break:break-all;line-height:1.5;">${reportUrl.replace(/&/g, '&amp;')}</p></div>` : ''}
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">This link expires in 90 days.</p>
  </div>
  <div style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#9ca3af;">
    Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#0369a1;">missionmeetstech.com</a>
  </div>
</div>`;

    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: `Red Team Review: ${config.label} — All 9 Sections Reviewed`,
      html: redTeamEmailHtml,
    });

    if (emailResult.success) {
      console.log(`Gold Team: email sent successfully (${emailResult.id})`);
    } else {
      console.error("Gold Team: email send failed:", emailResult.error);
      await logOpsEvent(supabase, { event_type: "DELIVERY_FAILURE", source_function: "gold-team-review-background", severity: "error", signature: "email_send_failure", affected_entity: scoring_id, details: { error: emailResult.error, email: normalizedEmail } });
    }

    // Update model routing metadata in scores JSONB
    try {
      const { data: currentRecord } = await supabase
        .from("mp_scoring_history")
        .select("scores")
        .eq("id", scoring_id)
        .single();

      if (currentRecord && currentRecord.scores) {
        const existingRouting = currentRecord.scores._model_routing || {};
        const updatedScores = {
          ...currentRecord.scores,
          _model_routing: {
            ...existingRouting,
            rewrite: { model: rewriteModelConfig.model, reason: rewriteModelConfig.reason },
            review: { model: reviewModelConfig.model, reason: reviewModelConfig.reason },
          },
        };
        await supabase
          .from("mp_scoring_history")
          .update({ scores: updatedScores })
          .eq("id", scoring_id);
      }
    } catch (routingErr) {
      console.error("Gold Team: failed to update model routing metadata:", routingErr);
    }
  } catch (err) {
    console.error("Gold Team: unhandled error:", err);
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      await logOpsEvent(sb, { event_type: "HARNESS_FAILURE", source_function: "gold-team-review-background", severity: "critical", signature: "unhandled_error", details: { error: err.message, stack: (err.stack || "").substring(0, 500) } });
    } catch { /* best effort */ }
  }
};
