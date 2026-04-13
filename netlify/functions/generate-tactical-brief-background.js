// ============================================================
// generate-tactical-brief-background.js — Netlify Background Function
//
// Filename ends in -background.js → Netlify gives 15-minute timeout.
// Defensive 7-pass Claude pipeline (Sonnet + web_search) → HTML report → email.
//
// Pipeline:
//   Pass 0: Entity disambiguation (CHANGE 1)
//   Pass 1: Landscape scan with query expansion (CHANGE 2)
//   Pass 2: Deep analysis with source hierarchy (CHANGE 5)
//   Pass 3: Fact-check and synthesis with confidence overhaul (CHANGE 3)
//   Pass 4: Competitive landscape from evidence (CHANGE 4)
//   Pass 5: Cross-validation gate (CHANGE 7)
//   Output: Honest methodology section (CHANGE 8)
//
// CHANGE 6 (defensive input handling) is woven through all passes.
//
// POST body: { session_id, name, email, company, topic, audience, amount_paid }
// ============================================================

// const { generateTacticalBriefPdf } = require("./lib/tactical-brief-pdf"); // replaced by HTML renderer
const { renderMarketPulseHTML } = require("./lib/report-html-renderer");
const { generateReportUrl } = require("./lib/report-url");
const { buildDeliveryEmail, buildNotificationEmail } = require("./lib/tactical-brief-email");
const { sendEmail } = require("./lib/send-email");
const { optimizeMarketPrompt } = require("./lib/prompt-optimizer");
const { checkKillSwitch, shouldHoldEmail, holdEmail } = require("./lib/kill-switch");
const { transitionState } = require("./lib/workflow-state");
const { withRetry } = require("./lib/retry");
const { KNOWN_FACTS } = require("./lib/contract-facts");
const { disambiguate, disambiguateWithScope, checkCurrentEvents } = require("./lib/entity-disambiguator");
const { classifyIntent } = require("./lib/intent-classifier");
const { APPENDIX_C, getRelevantContext, buildContextPrimingPrompt } = require("./lib/context-primer");
const { validateClaim, classifyClaim } = require("./lib/cross-validator");
const { extractIntelSignals } = require("./lib/signal-extractor");
const { filterSources, countYoutubeSources } = require("./lib/source-filter");
const { createReportQuality, analyzePassResult, checkReportQuality, buildQualityDisclaimer, scoreReport } = require("./lib/report-quality-gate");
const { sanitizeSynthesis } = require("./lib/synthesis-sanitizer");
const { logOpsEvent } = require("./lib/ops-ledger");
const { trackQuality } = require("./lib/quality-tracker");
const { getFlag } = require("./lib/feature-flags");
const { trackAnthropic } = require("./lib/cost-tracker");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_RESEARCH_MODEL = "claude-sonnet-4-5-20250514"; // research passes — web search enabled
const CLAUDE_ANALYSIS_MODEL = "claude-haiku-4-5-20251001"; // synthesis/validation — no live search
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// --- Claude call (Pass 4 + Pass 5: cross-validation and corrections — no live search needed) ---
async function callClaude(systemPrompt, userPrompt, maxTokens = 4000) {
  const response = await withRetry(() => fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_ANALYSIS_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.1,
    }),
  }), { maxRetries: 2, baseDelayMs: 3000 });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.content?.find(b => b.type === "text")?.text || "";
  return { content, citations: [] };
}

// --- Claude + web_search API call (replaces Perplexity sonar-pro) ---
const RESEARCH_CALL_CAP = 12;
let _researchCallCount = 0;
let _supabase = null;
let _orderId = null;

async function callClaudeSearch(systemPrompt, userPrompt, maxTokens = 4000) {
  _researchCallCount++;
  if (_researchCallCount > RESEARCH_CALL_CAP) {
    console.warn(`[RESEARCH CAP] Call ${_researchCallCount} exceeds cap of ${RESEARCH_CALL_CAP} — returning empty result`);
    return { content: "", citations: [], capped: true };
  }
  const _costStart = Date.now();
  const response = await withRetry(() => fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_RESEARCH_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      temperature: 0.1,
    }),
  }), { maxRetries: 2, baseDelayMs: 3000 });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Anthropic API ${response.status}: ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  // Cost tracking: Claude research call
  try {
    if (_supabase) {
      await trackAnthropic(_supabase, {
        functionName: 'generate-tactical-brief-background',
        product: 'marketpulse',
        orderId: _orderId,
        model: CLAUDE_RESEARCH_MODEL,
        usage: data.usage ? { input_tokens: data.usage.input_tokens || 0, output_tokens: data.usage.output_tokens || 0 } : null,
        latencyMs: Date.now() - _costStart,
      });
    }
  } catch (_costErr) { /* never break research pipeline */ }

  // Extract text content and citations from Claude web_search response
  let textContent = "";
  const citations = [];
  for (const block of (data.content || [])) {
    if (block.type === "text") {
      textContent += block.text;
    }
    if (block.type === "web_search_tool_result") {
      for (const searchResult of (block.content || [])) {
        if (searchResult.type === "web_search_result" && searchResult.url) {
          citations.push(searchResult.url);
        }
      }
    }
  }

  return { content: textContent, citations };
}

// ============================================================
// PASS 0: Entity Disambiguation (CHANGE 1)
// ============================================================
async function disambiguateEntity(topic) {
  console.log("Pass 0: Entity disambiguation...");

  const result = await callClaudeSearch(
    `You are a federal government organizational structure expert. Your ONLY job is to identify the exact federal entity the user is asking about and classify every term as either a SUBJECT to research or a FILTER to apply.

CRITICAL RULES:
- Users often conflate agencies, offices, or acronyms. You MUST check if the user's description maps to ONE entity or MULTIPLE distinct entities.
- Search the parent agency's official website (.gov), org charts, staff directories, and "about" pages.
- If an acronym could refer to multiple offices (even within the same agency), list ALL matches.
- If the user says "X, also referred to as Y" — verify whether X and Y are actually the same entity or different entities.

SET-ASIDE / SOCIOECONOMIC FILTER RULES:
When a query mentions a set-aside type (SDVOSB, 8(a), HUBZone, WOSB, VOSB):
- This is a FILTER on contract actions, NOT a direction to research the certifying program.
- "SDVOSB contracts" = contracts with SDVOSB set-aside across all agencies.
- "SDVOSB contracts" ≠ SBA's SDVOSB certification program.
- Do NOT disambiguate to SBA when the user mentions a set-aside type. SBA is the certifying body, not the subject.

CURRENT ADMINISTRATION ACTIONS RULES:
When a query mentions "current administration" actions (cancellations, terminations, cuts, freezes, DOGE):
- Map to: DOGE termination actions, executive orders, agency workforce reductions, contract de-obligations.
- Search terms should include: "DOGE contract terminations," "federal contract cancellations 2025-2026," "de-obligated contracts."
- Do NOT search for a specific agency's cancellation policy.

AMBIGUOUS ACRONYM RULES:
When a query mentions a government office by acronym:
- Verify the acronym resolves to the correct organizational level.
- Example: "VHA OEM" = Veterans Health Administration Office of Emergency Management (19OEM, Martinsburg WV).
- Example: "OEMR" = completely different VA staff office.
- When ambiguous, search for BOTH interpretations, then select the one with contract activity.

OUTPUT FORMAT (respond ONLY in this JSON structure, no markdown fences):
{
  "entities_found": [
    {
      "name": "Full official name",
      "acronym": "ACRONYM",
      "org_code": "if known",
      "parent_org": "Parent agency/office",
      "location": "City, State",
      "approx_staff": "number or range",
      "mission": "1-2 sentence mission description",
      "source_url": ".gov URL where you found this"
    }
  ],
  "is_ambiguous": true/false,
  "disambiguation_reasoning": "Why these are the same or different entities",
  "selected_entity": {
    "name": "The entity that best matches the user's stated context",
    "acronym": "PRIMARY",
    "org_code": "if known",
    "parent_org": "Parent",
    "search_terms": {
      "primary": "Full official name",
      "org_code": "code",
      "short": "Common short name",
      "keywords": ["mission keyword 1", "keyword 2", "keyword 3"],
      "do_not_use": ["terms that refer to different entities"]
    }
  },
  "user_claims_to_verify": ["list every factual claim the user made that needs verification"],
  "term_classifications": [
    { "term": "example", "type": "subject|filter|context", "explanation": "Why this term is a subject to research, a filter to apply, or background context" }
  ]
}`,
    `Identify and disambiguate the federal entity in this request:\n\n${topic}\n\nSearch official .gov sources. If the request conflates multiple entities, identify all of them and select the best match. Classify every term as subject (to research), filter (to apply to results), or context (background framing).`,
    3000
  );

  // Parse disambiguation result
  let disambiguation;
  try {
    // Try to extract JSON from the response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      disambiguation = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in disambiguation response");
    }
  } catch (parseErr) {
    console.warn("Disambiguation JSON parse failed, using raw text:", parseErr.message);
    disambiguation = {
      entities_found: [],
      is_ambiguous: false,
      selected_entity: {
        name: topic,
        search_terms: {
          primary: topic,
          keywords: [],
          do_not_use: [],
        },
      },
      user_claims_to_verify: [],
      raw_response: result.content,
    };
  }

  disambiguation._citations = result.citations;

  if (disambiguation.is_ambiguous) {
    console.log(`DISAMBIGUATION: Ambiguous input detected. Found ${disambiguation.entities_found?.length || 0} entities.`);
    console.log(`Selected entity: ${disambiguation.selected_entity?.name || "unknown"}`);
    if (disambiguation.selected_entity?.search_terms?.do_not_use?.length) {
      console.log(`DO NOT USE terms: ${disambiguation.selected_entity.search_terms.do_not_use.join(", ")}`);
    }
  }

  if (disambiguation.user_claims_to_verify?.length) {
    console.log(`User claims to verify: ${disambiguation.user_claims_to_verify.length}`);
  }

  // Log entity resolution for observability
  if (disambiguation.term_classifications?.length) {
    for (const tc of disambiguation.term_classifications) {
      console.log(`[ENTITY RESOLUTION] "${tc.term}" → Type: ${tc.type} | ${tc.explanation || ""}`);
    }
  }

  return disambiguation;
}

// ============================================================
// PASS 1: Landscape Scan with Query Expansion (CHANGES 2, 5, 6)
// ============================================================
async function runLandscapeScan(topic, audience, company, disambiguation, { primedContext, classification } = {}) {
  console.log("Pass 1: Landscape scan with query expansion...");

  const entity = disambiguation.selected_entity || {};
  const searchTerms = entity.search_terms || {};
  const claimsToVerify = disambiguation.user_claims_to_verify || [];
  const naicsFocus = (classification && classification.scope && classification.scope.naics_focus) || [];

  const audienceContext = audience ? `The audience for this brief is: ${audience}.` : "";
  const companyCtx = company ? `The requesting organization is: ${company}.` : "";
  const contextBlock = primedContext ? `\n\nCURRENT CONTEXT (verified facts — use as grounding):\n${primedContext}` : "";

  const result = await callClaudeSearch(
    `You are a federal health IT market intelligence analyst for Mission Meets Tech, a federal health IT intelligence platform. ${audienceContext} ${companyCtx}

BRAND POSITIONING — FEDERAL HEALTH IT LENS:
Every report MUST be filtered through the federal health IT lens, even when the user's query is broad.
- If query is about a set-aside type (e.g. "SDVOSB pipeline") → filter to health IT opportunities first (DHA, VA, CMS, IHS, HHS), then general
- If query is about policy changes (e.g. "DOGE cancellations") → lead with health agency impacts, then general
- If query is about AI/technology → lead with clinical AI, EHR integration, health data
- If query is general GovCon → include a "Federal Health IT Implications" section
- If query has ZERO health IT connection, note that transparently rather than forcing it

AGENCY PRIORITY ORDER (for health IT relevance):
1. DHA (Defense Health Agency) — MHS GENESIS, MTF operations, TRICARE
2. VA (Veterans Affairs) — EHR modernization, connected care, VBA
3. CMS (Centers for Medicare & Medicaid) — claims systems, interoperability mandates
4. IHS (Indian Health Service) — EHR, telehealth, resource constraints
5. HHS (broader) — ONC/ASTP, FDA health tech, NIH research IT
6. DoD (non-DHA) — CDAO health AI, deployed medical IT

When relevant, break Pipeline Intelligence into agency subsections (e.g., "VA Opportunities", "DHA Opportunities") to help users who specialize in one agency find their lane quickly.

CRITICAL: The customer ordering this report is NOT necessarily the subject of the research. Mission Meets Tech LLC is a media/intelligence platform, NOT a contracting firm. If the customer provides a company name, research THAT company's market position. If they say "I'm at a SDVOSB" without naming the company, note "Company identity not provided — recommendations are generic." NEVER research Mission Meets Tech LLC as a contractor.

ENTITY CONTEXT (from disambiguation):
- Target entity: ${entity.name || topic}
- Acronym: ${searchTerms.short || "N/A"}
- Org code: ${searchTerms.org_code || "N/A"}
- Parent org: ${entity.parent_org || "N/A"}
- Search keywords: ${(searchTerms.keywords || []).join(", ")}
- DO NOT USE these terms (they refer to different entities): ${(searchTerms.do_not_use || []).join(", ") || "none"}

MANDATORY SOURCE HIERARCHY (search ALL before drafting):
1. Agency official pages (.gov) — org structure, leadership, mission, staff directories
2. Budget justification documents — Congressional Budget Justification, functional org manuals, FTE counts
3. Federal procurement databases — SAM.gov, USASpending.gov, FPDS-NG
4. Oversight and audit — GAO reports, agency IG reports, congressional testimony
5. Aggregators — GovTribe, GovWin, Bloomberg Gov
6. Trade press — Federal News Network, GovExec, NextGov

QUERY EXPANSION PROTOCOL (for every data-gathering search):
Use AT LEAST 3 query variants per source:
- Variant A: Exact terms + set-aside filter
- Variant B: Mission keywords + NAICS codes (${naicsFocus.join(", ") || "541512, 541511"})
- Variant C: Adjacent terms, broader scope
If all 3 return null, search one org level UP (parent agency) and one DOWN (sub-offices).
If still null, report: "No results found across [N] queries. This null is [UNUSUAL/EXPECTED] because [reasoning]. Confidence: LOW."

DEFENSIVE INPUT HANDLING:
${claimsToVerify.length > 0 ? `The user made these claims that MUST BE VERIFIED against primary sources before incorporating:\n${claimsToVerify.map((c, i) => `${i + 1}. ${c}`).join("\n")}\nDo NOT parrot these as findings. Verify each one.` : "No specific user claims flagged for verification."}

CHAIN OF THOUGHT: For each finding, trace the evidence chain: source → claim → confidence level. If evidence is indirect, say so explicitly.

CRITICAL RULES:
- NEVER report "zero contracts exist" — say "zero contracts found in [sources searched]"
- NEVER assign HIGH confidence to a null result
- For personnel: check the official staff directory. If someone is listed → they're active. If NOT listed → status is UNVERIFIED (not "departed").
- If research contradicts the user's framing, flag the contradiction explicitly.${contextBlock}`,

    `Research topic: ${topic}\n\nUsing the entity disambiguation above, provide a comprehensive landscape scan:\n1. Current state and recent developments (last 6 months) — search .gov sites first\n2. Organizational structure and leadership — check official staff directories\n3. Relevant contracts, solicitations, or procurement activity — search SAM.gov, USASpending.gov with multiple query variants\n4. Budget context and funding status — check Congressional Budget Justification docs\n5. Policy or regulatory factors — check GAO/IG reports\n\nFor each finding, note:\n- The specific source URL\n- Which query/search found it\n- Confidence level (HIGH only if .gov primary source + verifiable)\n\nIf any user claims from the disambiguation cannot be verified, say so explicitly.`,
    5000
  );

  return result;
}

// ============================================================
// PASS 2: Deep Analysis with Evidence-Based Competitive Landscape (CHANGES 4, 5)
// ============================================================
async function runDeepAnalysis(topic, audience, company, disambiguation, landscapeContent, { primedContext, classification } = {}) {
  console.log("Pass 2: Deep analysis + evidence-based competitive landscape...");

  const entity = disambiguation.selected_entity || {};
  const searchTerms = entity.search_terms || {};
  const intents = (classification && classification.intents) || [];

  const audienceContext = audience ? `The audience for this brief is: ${audience}.` : "";
  const companyContext = company ? `The requesting organization is: ${company}.` : "";
  const contextBlock = primedContext ? `\n\nCURRENT CONTEXT (verified facts — use as grounding):\n${primedContext}` : "";

  // Market Event Protocol (Spec section 3.3) — injected when market_event_analysis intent detected
  const marketEventBlock = intents.includes("market_event_analysis")
    ? `\n\nMARKET EVENT PROTOCOL:
Step 1: Establish the event (what, when, scale)
Step 2: Quantify impact (contracts, dollars, agencies)
Step 3: Map to ${(classification && classification.scope && classification.scope.set_aside_filter) || "sdvosb"} set-aside
Step 4: Identify recompete pipeline
Step 5: Package as structured entries`
    : "";

  const result = await callClaudeSearch(
    `You are a senior federal health IT strategy advisor and competitive intelligence analyst for Mission Meets Tech. ${audienceContext} ${companyContext}

FEDERAL HEALTH IT LENS: Prioritize health agencies (DHA, VA, CMS, IHS, HHS) in analysis. When the target entity is not a health agency, include a "Health IT Implications" subsection connecting findings to health IT market effects.

TARGET ENTITY: ${entity.name || topic}
SEARCH TERMS: ${JSON.stringify(searchTerms)}

COMPETITIVE LANDSCAPE METHODOLOGY (CHANGE 4 — evidence-based only):
1. Search USASpending.gov and FPDS for ACTUAL awardees to this office. Filter by awarding sub-agency + NAICS + keywords.
2. For each awardee found: contract number, amount, period, vehicle type, set-aside category (SDVOSB, 8(a), HUBZone, full-and-open).
3. Identify the ACTUAL market tier — is this small business territory, mid-tier, or large prime?
4. Only AFTER reporting verified awardees, you may note large primes active in the broader agency as "potential future competitors" — clearly labeled as such.
5. If zero awardees found, say "No verified awardees identified in [sources searched]." Do NOT substitute assumed competitors.

CRITICAL RULES:
- Do NOT list Booz Allen, Leidos, GDIT, etc. as competitors unless you find actual contracts with this specific office.
- Verified incumbents and assumed competitors must be in SEPARATE sections.
- Every vendor name must have a source (contract number, USASpending URL, etc.)${marketEventBlock}${contextBlock}`,

    `Topic: ${topic}\n\nLandscape scan findings:\n${landscapeContent}\n\nProvide:\n1. Strategic implications and what this means for stakeholders\n2. EVIDENCE-BASED competitive landscape:\n   a. Verified awardees (with contract numbers, amounts, vehicles)\n   b. Actual market tier (small business vs. mid-tier vs. large prime)\n   c. Set-aside patterns (SDVOSB, 8(a), HUBZone, full-and-open)\n   d. Only then: potential future competitors from the broader agency (clearly labeled)\n3. Risks and potential obstacles\n4. Opportunities for action\n5. Timeline of upcoming milestones\n6. Actionable recommendations\n\nVerify and cross-reference the landscape scan. Flag any claims that cannot be confirmed.`,
    5000
  );

  return result;
}

// ============================================================
// PASS 3: Fact-Check, Synthesis, and Confidence Scoring (CHANGES 3, 6, 8)
// ============================================================
async function runSynthesis(topic, audience, company, disambiguation, landscapeContent, analysisContent, { primedContext, classification, companyContext: compCtx } = {}) {
  console.log("Pass 3: Fact-check, synthesis, and confidence scoring...");

  const entity = disambiguation.selected_entity || {};
  const claimsToVerify = disambiguation.user_claims_to_verify || [];

  const audienceContext = audience ? `The audience for this brief is: ${audience}.` : "";
  const companyLine = company ? `The requesting organization is: ${company}.` : "";
  const contextBlock = primedContext ? `\n\nCURRENT CONTEXT (verified facts — use as grounding):\n${primedContext}` : "";

  // Build company context block for recommendations
  let companyGuard = "";
  if (compCtx) {
    if (compCtx.isMmtPlatform) {
      companyGuard = "\nCRITICAL: The ordering company 'Mission Meets Tech' is the PLATFORM, not a contractor. Do NOT research MMT as a contracting firm. Recommendations should be generic unless additional_context names the actual company.";
    }
    if (compCtx.knownCerts.length > 0) {
      companyGuard += `\nCOMPANY ALREADY HOLDS THESE CERTIFICATIONS: ${compCtx.knownCerts.join(", ")}. Do NOT recommend obtaining certifications they already have.`;
    }
    if (compCtx.knownVehicles.length > 0) {
      companyGuard += `\nCOMPANY ALREADY ON THESE VEHICLES: ${compCtx.knownVehicles.join(", ")}. Do NOT recommend registering for vehicles they already hold.`;
    }
    if (!compCtx.hasIdentity) {
      companyGuard += "\nCompany identity not confirmed — recommendations must be labeled as generic, not tailored to a specific firm's existing capabilities.";
    }
  }

  const result = await callClaudeSearch(
    `You are a fact-checker and editor for Mission Meets Tech, a federal health IT intelligence publication. ${audienceContext} ${companyLine}

FEDERAL HEALTH IT LENS: When organizing Pipeline Intelligence, group opportunities by agency subsections where applicable (VA Opportunities, DHA Opportunities, CMS Opportunities, Other). Always lead with health IT-relevant findings.

TARGET ENTITY: ${entity.name || topic} (${entity.acronym || ""})

CONFIDENCE RULES (HARD):
HIGH: .gov source + cross-verified by 2+. NEVER for null results or single-aggregator.
MEDIUM: One credible source. NEVER for inference.
LOW: Single indirect source or inference.
UNVERIFIED: No source. MUST include "Requires verification via [method]."
Tags on KEY FINDINGS ONLY (5-7 max), not every sentence.

PERSONNEL RULES:
- "X is the director" → HIGH only if official staff directory URL provided
- "X departed" → requires official source. If directory doesn't list them → UNVERIFIED, not "departed"
- Never fabricate dates. "Departed November 2024" without a source = fabrication.

NULL RESULT RULES:
- "No contracts found" is a SEARCH RESULT, not a finding.
- The FINDING is: "No contracts were identified in [sources] using [queries]. Confidence in this null: LOW."
- NEVER assign HIGH confidence to a null result.

${claimsToVerify.length > 0 ? `USER CLAIMS THAT MUST BE VERIFIED:\n${claimsToVerify.map((c, i) => `${i + 1}. "${c}" — verify against primary sources. If unverified, label as UNVERIFIED.`).join("\n")}` : ""}

VERIFIED GROUND TRUTH (do not override without explicit contradicting evidence):
${JSON.stringify(Object.values(KNOWN_FACTS).map(f => ({ name: f.name, agency: f.agency, value: f.value, status: f.status, vendor: f.vendor })), null, 2)}
If your research contradicts any verified fact above, flag it as: "GROUND TRUTH CONFLICT: [fact] vs [your finding] — [your source]"
Do NOT silently override verified data.

CHAIN OF THOUGHT: For each user claim being verified, state what you found, whether it confirms or contradicts, and your confidence in the determination.

ANTI-FABRICATION RULES (HARD CONSTRAINTS):
1. EVERY dollar figure MUST have a specific source URL. If you cannot cite a .gov URL or verified aggregator, write "Not available from public sources" instead.
2. EVERY competitive landscape entry MUST include a verifiable contract number from FPDS, SAM.gov, or USASpending. If you cannot cite a specific contract number for a company, do NOT include that company as a verified awardee. An empty competitive landscape with an honest explanation is better than a fabricated one.
3. EVERY percentage or ratio MUST have a source. If you calculated it, show the math. If from a source, cite it. If neither, do NOT include it.
4. Pipeline entry fields: If a value cannot be verified, use "Not confirmed — [reason]" instead of inventing a value.
5. NEVER aggregate individual estimates into a headline total and present it as a sourced figure. If you sum estimates, say "Sum of N estimated opportunities: ~$X (not a single-source figure)."
6. If research returned limited results, say so honestly in METHODOLOGY. Do NOT pad with fabricated data.

OUTPUT STRUCTURE — You are producing a federal contracting intelligence brief.
Your reader is a GovCon professional who PAYS for this analysis.
They already know basic program information. They need ACTIONABLE INTELLIGENCE they can't easily find themselves.

REQUIRED SECTIONS (use these exact headers):

## EXECUTIVE SUMMARY
3-5 bullet points. Each must contain: a specific fact, its source, and why it matters to the reader's business. NO null findings. If research found limited results, explain what WAS found and what to monitor.

## MARKET CONTEXT
Current state of this market segment. Recent policy/regulatory changes. Budget trends with actual dollar figures from .gov sources. Maximum 1 page worth of content.

## PIPELINE INTELLIGENCE
THIS IS THE CORE SECTION. For EACH opportunity, use EXACT format:

CONTRACT/OPPORTUNITY: [Name]
Agency: [Contracting agency]
Contract #: [If known, or "Not confirmed"]
NAICS: [Code + description]
Set-Aside: [Type]
Estimated Value: [$ or range, or "Not confirmed — no public ceiling posted"]
Incumbent: [Company if known, or "Not confirmed — new requirement"]
Status: [Active / Expected recompete / Terminated-pending-recompete]
Timeline: [Key dates, or "Not confirmed — no RFP date published"]
Source: [URL]
SDVOSB Relevance: [Why this matters]

If you found fewer than 3 specific opportunities, state that clearly and explain what adjacent opportunities exist.

## COMPETITIVE LANDSCAPE
TWO sub-sections required:

### VERIFIED AWARDEES
Companies with confirmed contract numbers, amounts, and vehicles from .gov sources. EVERY entry MUST have a contract number.

### MARKET PARTICIPANTS
Companies known to operate in this space but WITHOUT confirmed contracts to the target entity. Clearly label each: "No confirmed contracts found for [company] with [target entity]."

NEVER present market participants as verified awardees.

## RISK ASSESSMENT
Specific risks with evidence. Policy/budget risks. NOT generic compliance checklists.

## RECOMMENDATIONS
Capture strategy tied to specific opportunities from Pipeline Intelligence. Timeline with specific dates. Teaming suggestions with named partners/vehicles.
${companyGuard}
Before recommending certifications (SDVOSB, 8(a), WOSB, HUBZone): verify whether the customer's company already holds them. Before recommending contract vehicles: check if the company already has access. Recommending certifications or vehicles a company already holds destroys credibility. If company identity is unknown, explicitly state recommendations are generic.

## FORWARD VIEW (6-MONTH OUTLOOK)
What's coming in the next 6 months that the reader should prepare for:
- Upcoming recompetes and new-start opportunities with estimated dates
- Budget cycle milestones (FYDP, CR status, appropriations)
- Policy/regulatory changes taking effect
- Industry days, pre-solicitation conferences, draft RFP releases
Maximum 5 bullet points. Each must have a specific date or date range.

## THIS WEEK'S ACTIONS
3-5 specific, concrete actions the reader can take THIS WEEK based on the findings:
- Each action must be completable within 5 business days
- Each must reference a specific finding, opportunity, or contact from the report
- Format: "[Action verb] [specific task] [because finding X]"
- Examples: "Register on SAM.gov for NAICS 541512 under DHA", "Email OSDBU at VA to request small business liaison meeting", "Download RFP W81K04-26-R-0001 from SAM.gov and begin compliance matrix"

## METHODOLOGY
Brief: what was searched, what was found, limitations.
- Entity searched (after disambiguation) with org code
- Each source queried and specific search terms used
- Number of results returned per source (including zero)
- Contradictions between sources and how resolved
- What was NOT found and why the null may/may not be meaningful
- What requires manual verification and the specific method

RULES:
- Every claim must have a source. Prefer .gov over commercial.
- NO YouTube sources. NO generic blog posts as primary data.
- NO program descriptions the reader already knows (what SDVOSB is, how VetCert works, what Mentor-Protege is).
- NO sections with "None identified" or "No results found." If a section would be empty, merge it into another or explain what to monitor.
- Data density: every paragraph must contain at least one specific fact (number, date, name, contract ID).
- Maximum 4 pages of content (~12,000 characters). Quality over quantity. If you're exceeding this, cut generic context — not pipeline data.
- An honest 3-page report with 5 specific pipeline opportunities is worth more than an 18-page report of generic program descriptions.
- Do NOT repeat full source names after first use. First mention: "per SAM.gov, FPDS, and USASpending.gov." Subsequent: cite the specific source only (e.g., "per SAM.gov" or "per FPDS").
- Do NOT include any "Classification:" header or classification markings in the output.

CRITICAL CURRENT-EVENTS OVERRIDES (use these over your training data):
- VetCert processing time is currently ~12 days (NOT 90 days).
- SEWP VI has NOT been awarded yet (SEWP V extended through April 30, 2026).
- FPDS.gov was decommissioned Feb 24, 2026 — migrated to SAM.gov.
- Always use Appendix C current-events data over your training when available.${contextBlock}`,

    `Topic: ${topic}\n\nLandscape scan:\n${landscapeContent}\n\nDeep analysis:\n${analysisContent}\n\nSynthesize into a final executive brief.\n\nFor the METHODOLOGY section, you must honestly report:\n- What entity was researched (after disambiguation)\n- What sources were queried with what search terms\n- What was found vs. what returned zero results\n- What contradicted other sources\n- What requires manual verification\n\nApply the confidence scoring rules strictly. No HIGH confidence on null results or inferred personnel status.`,
    6000
  );

  return result;
}

// ============================================================
// PASS 4: Cross-Validation Gate (CHANGE 7)
// ============================================================
async function runCrossValidation(topic, disambiguation, synthesisContent) {
  console.log("Pass 4: Cross-validation gate...");

  const entity = disambiguation.selected_entity || {};

  const result = await callClaude(
    `You are a quality assurance reviewer for a federal intelligence brief. Your job is to find and fix internal contradictions, unsupported claims, and confidence rating errors.

TARGET ENTITY: ${entity.name || topic} (${entity.acronym || ""})

Run these checks on the brief below:

1. ENTITY CONSISTENCY: Every section must reference "${entity.name || topic}". Flag any section that accidentally uses a wrong acronym, org code, or references a different entity.

2. CLAIM CONSISTENCY: "Zero contracts" in Key Findings cannot coexist with named vendors in Competitive Landscape. If sections contradict, flag which is correct.

3. NULL-RESULT AUDIT: List every claim that rests on a null result (didn't find X → therefore Y). Each must be LOW confidence with verification language. Flag any that are rated higher.

4. PERSONNEL AUDIT: Every named person must have a source. Anyone claimed as "departed" or "replaced" must have a primary source. Flag any without one.

5. CONFIDENCE AUDIT: No HIGH confidence claims sourced to inference, absence, or single indirect source. Flag violations.

OUTPUT FORMAT:
{
  "entity_consistency": { "passed": true/false, "issues": ["..."] },
  "claim_consistency": { "passed": true/false, "issues": ["..."] },
  "null_result_audit": { "passed": true/false, "null_claims": [{"claim": "...", "current_confidence": "...", "should_be": "...", "reason": "..."}] },
  "personnel_audit": { "passed": true/false, "issues": ["..."] },
  "confidence_audit": { "passed": true/false, "overrated_claims": [{"claim": "...", "current": "...", "should_be": "...", "reason": "..."}] },
  "overall_passed": true/false,
  "corrections_needed": ["list of specific text corrections to make"]
}`,

    `Review this intelligence brief for internal consistency and confidence rating accuracy:\n\n${synthesisContent}`,
    3000
  );

  // Parse validation result
  let validation;
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      validation = JSON.parse(jsonMatch[0]);
    } else {
      validation = { overall_passed: true, raw_response: result.content, corrections_needed: [] };
    }
  } catch {
    console.warn("Cross-validation JSON parse failed, treating as passed with warnings");
    validation = { overall_passed: true, raw_response: result.content, corrections_needed: [] };
  }

  validation._citations = result.citations;

  if (!validation.overall_passed) {
    console.log(`CROSS-VALIDATION FAILED. ${(validation.corrections_needed || []).length} corrections needed.`);
  } else {
    console.log("Cross-validation passed.");
  }

  return validation;
}

// ============================================================
// PASS 5: Apply Corrections (if cross-validation failed)
// ============================================================
async function applyCorrections(topic, synthesisContent, validation) {
  if (validation.overall_passed && !(validation.corrections_needed || []).length) {
    return synthesisContent;
  }

  console.log("Pass 5: Applying cross-validation corrections...");

  const corrections = validation.corrections_needed || [];
  const nullClaims = validation.null_result_audit?.null_claims || [];
  const overratedClaims = validation.confidence_audit?.overrated_claims || [];
  const personnelIssues = validation.personnel_audit?.issues || [];

  const result = await callClaude(
    `You are an editor. Apply the corrections below to the intelligence brief. Preserve all correct content. Only change what is flagged.

CORRECTIONS TO APPLY:
${corrections.map((c, i) => `${i + 1}. ${c}`).join("\n")}

${nullClaims.length ? `NULL-RESULT CLAIMS TO DOWNGRADE:\n${nullClaims.map((c) => `- "${c.claim}" → change confidence from ${c.current_confidence} to ${c.should_be}. Reason: ${c.reason}`).join("\n")}` : ""}

${overratedClaims.length ? `OVERRATED CLAIMS TO DOWNGRADE:\n${overratedClaims.map((c) => `- "${c.claim}" → change from ${c.current} to ${c.should_be}. Reason: ${c.reason}`).join("\n")}` : ""}

${personnelIssues.length ? `PERSONNEL ISSUES TO FIX:\n${personnelIssues.map((p) => `- ${p}`).join("\n")}` : ""}

Output the COMPLETE corrected brief (all sections).`,

    `Original brief:\n\n${synthesisContent}\n\nApply all corrections and output the complete corrected brief.`,
    6000
  );

  return result.content;
}

// ============================================================
// Build Methodology Appendix (CHANGE 8)
// ============================================================
function buildMethodologyAppendix(disambiguation, passTimings) {
  const entity = disambiguation.selected_entity || {};
  const searchTerms = entity.search_terms || {};

  let methodology = "\n\n---\nMETHODOLOGY APPENDIX (Auto-Generated)\n\n";
  methodology += `Entity researched: ${entity.name || "as provided by user"}\n`;
  methodology += `Org code: ${searchTerms.org_code || "not identified"}\n`;
  methodology += `Parent org: ${entity.parent_org || "not identified"}\n\n`;

  if (disambiguation.is_ambiguous) {
    methodology += `DISAMBIGUATION NOTE: The user's request was ambiguous. ${disambiguation.entities_found?.length || 0} distinct entities were identified.\n`;
    methodology += `Selected: ${entity.name} — Reasoning: ${disambiguation.disambiguation_reasoning || "best match for context"}\n`;
    if (searchTerms.do_not_use?.length) {
      methodology += `Terms excluded (refer to different entities): ${searchTerms.do_not_use.join(", ")}\n`;
    }
    methodology += "\n";
  }

  methodology += `Search terms used:\n`;
  methodology += `- Primary: ${searchTerms.primary || entity.name || "N/A"}\n`;
  methodology += `- Keywords: ${(searchTerms.keywords || []).join(", ") || "N/A"}\n\n`;

  methodology += `Pipeline timing:\n`;
  for (const [pass, seconds] of Object.entries(passTimings)) {
    methodology += `- ${pass}: ${seconds}s\n`;
  }

  methodology += `\nUser claims verified: ${(disambiguation.user_claims_to_verify || []).length}\n`;

  return methodology;
}

// --- Company Context Extraction ---
function extractCompanyContext(company, additionalContext, topic) {
  const combined = [company, additionalContext, topic].filter(Boolean).join(" ");

  // Known certifications
  const certPatterns = [
    { pattern: /\bSDVOSB\b/i, cert: "SDVOSB" },
    { pattern: /\bVOSB\b/i, cert: "VOSB" },
    { pattern: /\bWOSB\b/i, cert: "WOSB" },
    { pattern: /\b8\(a\)\b|\b8a\b/i, cert: "8(a)" },
    { pattern: /\bHUBZone\b/i, cert: "HUBZone" },
    { pattern: /\bsmall business\b/i, cert: "Small Business" },
  ];
  const knownCerts = certPatterns
    .filter(({ pattern }) => pattern.test(combined))
    .map(({ cert }) => cert);

  // Known vehicles
  const vehiclePatterns = [
    { pattern: /\bT4NG2?\b/i, vehicle: "T4NG/T4NG2" },
    { pattern: /\bSEWP\b/i, vehicle: "SEWP" },
    { pattern: /\bCIO-SP[34]\b/i, vehicle: "CIO-SP3/CIO-SP4" },
    { pattern: /\bGSA\s*(?:MAS|Schedule)\b/i, vehicle: "GSA MAS" },
    { pattern: /\bALLIANT\b/i, vehicle: "Alliant" },
    { pattern: /\bOASIS\b/i, vehicle: "OASIS+" },
    { pattern: /\bSeaPort[\s-]*NxG\b/i, vehicle: "SeaPort-NxG" },
    { pattern: /\bIHT\s*2\.?0?\b/i, vehicle: "IHT 2.0" },
    { pattern: /\bVETS\s*2\b/i, vehicle: "VETS 2" },
    { pattern: /\bA4V\b|\bAgile\s*4\s*Vets?\b/i, vehicle: "A4V JV" },
  ];
  const knownVehicles = vehiclePatterns
    .filter(({ pattern }) => pattern.test(combined))
    .map(({ vehicle }) => vehicle);

  // Detect if company is the platform (not a contractor)
  const isMmtPlatform = /mission\s*meets?\s*tech/i.test(company || "");

  return {
    company: company || null,
    isMmtPlatform,
    knownCerts,
    knownVehicles,
    hasIdentity: !!(company && !isMmtPlatform),
  };
}

// --- Main handler ---
exports.handler = async (event) => {
  // Reset per-order research call counter
  _researchCallCount = 0;

  // Kill switch
  const killCheck = checkKillSwitch("generate-tactical-brief-background");
  if (killCheck.blocked) return killCheck.response;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!ANTHROPIC_API_KEY) {
    console.error("generate-tactical-brief-background: ANTHROPIC_API_KEY not configured");
    return { statusCode: 500, body: "Research pipeline not configured" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { session_id, name, email, company, topic, audience, additional_context } = payload;

  if (!email || !topic) {
    console.error("generate-tactical-brief-background: missing email or topic");
    return { statusCode: 400, body: "Email and topic are required" };
  }

  // Extract structured company context from additional_context (skippable via feature flag)
  const companyContext = getFlag("FEATURE_ENTITY_GUARD") === "off"
    ? { company: company || null, isMmtPlatform: false, knownCerts: [], knownVehicles: [], hasIdentity: !!company }
    : extractCompanyContext(company, additional_context, topic);

  console.log(`generate-tactical-brief-background: starting for ${email} (session ${session_id})`);
  console.log(`[COMPANY] ${companyContext.hasIdentity ? companyContext.company : "No company identified"} | MMT platform: ${companyContext.isMmtPlatform} | Certs: ${companyContext.knownCerts.join(",") || "none"} | Vehicles: ${companyContext.knownVehicles.join(",") || "none"}`);
  const startTime = Date.now();
  const passTimings = {};

  // Note: MarketPulse state machine uses marketpulse_orders table, keyed by session_id.
  // We attempt transitions but don't block on failure — state tracking is observability, not control flow.
  const { createClient } = require("@supabase/supabase-js");
  _supabase = null;
  _orderId = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    // Look up order by session_id, or create one (admin/free path skips gateway insert)
    try {
      const { data: order } = await _supabase.from("marketpulse_orders").select("id").eq("session_id", session_id).single();
      if (order) {
        _orderId = order.id;
      } else {
        const { data: newOrder, error: insertErr } = await _supabase.from("marketpulse_orders").insert({
          session_id,
          email,
          name: name || null,
          company: company || null,
          company_name: company || null,
          topic,
          audience: audience || null,
          additional_context: additional_context || null,
          status: "processing",
        }).select("id").single();
        if (newOrder) _orderId = newOrder.id;
        if (insertErr) console.error("Order insert failed:", insertErr.message || insertErr);
      }
    } catch (e) { console.error("Order lookup/create failed:", e.message); }
  }
  async function _transition(state, details) {
    if (!_supabase || !_orderId) return;
    try { await transitionState(_supabase, "marketpulse_orders", _orderId, state, details); } catch (e) { console.error("State transition error:", e.message); }
  }

  try {
    // State: research_started
    await _transition("research_started");

    // Pre-pass: Prompt optimization — enrich raw topic into structured GovCon research prompt
    const originalTopic = topic;
    const optimizedTopic = optimizeMarketPrompt({ topic, company, segment: null, audience, additional_context: null });
    if (optimizedTopic !== topic) {
      console.log(`Prompt optimizer: enriched topic (${topic.length} chars → ${optimizedTopic.length} chars)`);
    }

    // Pre-check: Local entity disambiguation (prevents VHA OEM failure mode)
    try {
      const localDisambig = disambiguate(topic);
      if (localDisambig.canonical !== topic) {
        console.log(`Local entity disambiguation: "${topic}" → "${localDisambig.canonical}"`);
      }
    } catch { /* non-blocking */ }

    // Pre-check: Current events override (prevents SBA routing failure mode)
    const currentEventsCheck = checkCurrentEvents(topic);
    if (currentEventsCheck.matched) {
      console.log(`[CURRENT EVENTS] Topic matches current-events triggers. Overriding disambiguation.`);
      if (currentEventsCheck.socioFilters) {
        console.log(`[SOCIO FILTER] Detected filters: ${currentEventsCheck.socioFilters.join(", ")}`);
      }
    } else if (currentEventsCheck.socioFilters) {
      console.log(`[SOCIO FILTER] Detected filters: ${currentEventsCheck.socioFilters.join(", ")} (treating as result filter, not entity)`);
    }

    // Initialize quality tracking
    const reportQuality = createReportQuality();
    let nullPassCount = 0;
    const NULL_PASS_THRESHOLD = 2;

    // === SPRINT D: Intent Classification (Spec 2.1 + 2.2) ===
    const classification = classifyIntent(originalTopic, company, audience, null);
    console.log(`[INTENT] Types: ${classification.intents.join(", ")} | Entity: ${classification.scope.target_entity || "government-wide"} | Event: ${classification.scope.event_trigger || "none"}`);

    // === SPRINT D: Context Priming (Spec 2.3 + Appendix C) ===
    const contextData = getRelevantContext(classification.scope.event_trigger, originalTopic);
    let primedContext = "";
    if (contextData.length > 0) {
      primedContext = contextData.map((e) => e.summary).join("\n");
      console.log(`[CONTEXT] ${contextData.length} Appendix C events matched`);
    }
    // Live priming if event detected but not in Appendix C
    if (classification.context_priming_needed && !contextData.length) {
      const primingResult = await callClaudeSearch(
        "You are a federal procurement current-events analyst. Provide a brief factual summary: what happened, when, scale, which agencies affected. Be specific.",
        buildContextPrimingPrompt(classification.scope.event_trigger, classification.scope),
        2000
      );
      primedContext = primingResult.content || "";
    }

    // === SPRINT D: Scope-Aware Disambiguation ===
    const scopeDisambig = disambiguateWithScope(originalTopic, classification.scope);
    if (scopeDisambig.entity_type === "government-wide") {
      console.log(`[SCOPE] Government-wide query. Agencies: ${scopeDisambig.search_terms.agencies.join(", ")}`);
    }

    // Pass 0: Entity disambiguation (CHANGE 1) — uses optimized prompt
    // If current-events override matched, we still run disambiguation but
    // inject the override context into all subsequent passes
    const pass0Start = Date.now();
    const disambiguation = await disambiguateEntity(optimizedTopic);
    passTimings["Pass 0 — Entity disambiguation"] = Math.round((Date.now() - pass0Start) / 1000);

    // Inject current-events override into disambiguation if matched
    if (currentEventsCheck.matched) {
      disambiguation._currentEventsOverride = currentEventsCheck.override;
      disambiguation._socioFilters = currentEventsCheck.socioFilters;
      // Augment search terms with override terms
      if (disambiguation.selected_entity && disambiguation.selected_entity.search_terms) {
        disambiguation.selected_entity.search_terms.keywords = [
          ...(disambiguation.selected_entity.search_terms.keywords || []),
          ...currentEventsCheck.override.search_terms,
        ];
      }
      console.log(`[CURRENT EVENTS] Injected ${currentEventsCheck.override.search_terms.length} override search terms`);
    }
    if (currentEventsCheck.socioFilters) {
      disambiguation._socioFilters = currentEventsCheck.socioFilters;
    }

    // Pass 1: Landscape scan with query expansion (CHANGES 2, 5)
    const pass1Start = Date.now();
    const pass1 = await runLandscapeScan(optimizedTopic, audience, company, disambiguation, { primedContext, classification });
    passTimings["Pass 1 — Landscape scan"] = Math.round((Date.now() - pass1Start) / 1000);
    analyzePassResult(reportQuality, pass1.content, pass1.citations);
    if (!pass1.content || pass1.content.trim().length < 200) nullPassCount++;

    // Null result pivot check after Pass 1
    if (nullPassCount >= NULL_PASS_THRESHOLD) {
      console.log(`[NULL PROTOCOL] ${nullPassCount} passes returned empty after Pass 1. Pivoting search strategy.`);
    }

    // Pass 2: Deep analysis + evidence-based competitive landscape (CHANGES 4, 5)
    const pass2Start = Date.now();
    const pass2 = await runDeepAnalysis(optimizedTopic, audience, company, disambiguation, pass1.content, { primedContext, classification });
    passTimings["Pass 2 — Deep analysis"] = Math.round((Date.now() - pass2Start) / 1000);
    analyzePassResult(reportQuality, pass2.content, pass2.citations);
    if (!pass2.content || pass2.content.trim().length < 200) nullPassCount++;

    // Null result pivot check after Pass 2 (NULL RESULT PROTOCOL)
    if (nullPassCount >= NULL_PASS_THRESHOLD) {
      console.log(`[NULL PROTOCOL] ${nullPassCount} passes returned empty. STOP — reassessing search strategy.`);
      // The search strategy is wrong, not the data. Reassess what we're actually looking for.
      const pivotStart = Date.now();
      const topicWords = topic.split(" ").slice(0, 5).join(" ");
      const entity = disambiguation.selected_entity || {};
      const pivotResult = await callClaudeSearch(
        `You are a federal contracting intelligence analyst. IMPORTANT: Previous research queries for "${entity.name || topic}" returned limited results across ${nullPassCount} passes. The search strategy was wrong, not the data.

NULL RESULT PROTOCOL — MANDATORY:
1. STOP searching the same way. The previous queries failed.
2. REASSESS: What is the user actually looking for? What would a HUMAN analyst with 20 years of federal contracting experience search for?
3. Try COMPLETELY DIFFERENT search terms, different data sources, different framing.
4. Search ALL federal agencies, not just one.
5. If still null after reassessment: report the null HONESTLY with explanation of what was searched and why it returned empty, plus where to monitor for this data to appear.
6. NEVER pad a null finding with generic program descriptions to fill pages.

CRITICAL: An honest "we found limited data" is infinitely more valuable than 18 pages of generic program descriptions the customer already knows.`,
        `Broadened search for: ${topic}\n\nPrevious searches returned empty. Try completely different angles:\n1. "${topicWords}" federal contracts 2025 2026\n2. "${topicWords}" government spending changes\n3. federal contracting news ${topicWords}\n4. SAM.gov opportunities ${topicWords}\n5. USASpending recent awards ${topicWords}\n6. Agency budget justification ${topicWords}\n7. GAO reports related to ${topicWords}\n\nReport whatever you find. If STILL nothing, explain what you searched and where to monitor.`,
        4000
      );
      passTimings["Pass 2.5 — Pivot search"] = Math.round((Date.now() - pivotStart) / 1000);
      analyzePassResult(reportQuality, pivotResult.content, pivotResult.citations);
      // Append pivot results to pass2 content for synthesis
      if (pivotResult.content) {
        pass2.content += "\n\n--- BROADENED SEARCH RESULTS ---\n" + pivotResult.content;
        pass2.citations = [...(pass2.citations || []), ...(pivotResult.citations || [])];
      }
    }

    // Pass 3: Fact-check, synthesis, confidence scoring (CHANGES 3, 6, 8)
    const pass3Start = Date.now();
    const pass3 = await runSynthesis(optimizedTopic, audience, company, disambiguation, pass1.content, pass2.content, { primedContext, classification, companyContext });
    passTimings["Pass 3 — Synthesis"] = Math.round((Date.now() - pass3Start) / 1000);
    analyzePassResult(reportQuality, pass3.content, pass3.citations);

    // Pass 4: Cross-validation gate (CHANGE 7)
    const pass4Start = Date.now();
    const validation = await runCrossValidation(optimizedTopic, disambiguation, pass3.content);
    passTimings["Pass 4 — Cross-validation"] = Math.round((Date.now() - pass4Start) / 1000);

    // Pass 5: Apply corrections if needed
    let finalSynthesis = pass3.content;
    if (!validation.overall_passed || (validation.corrections_needed || []).length > 0) {
      const pass5Start = Date.now();
      finalSynthesis = await applyCorrections(optimizedTopic, pass3.content, validation);
      passTimings["Pass 5 — Corrections"] = Math.round((Date.now() - pass5Start) / 1000);
    }

    // Track YouTube sources in quality metrics
    reportQuality.youtubeSourceCount = countYoutubeSources([
      ...(pass1.citations || []),
      ...(pass2.citations || []),
      ...(pass3.citations || []),
    ]);

    // === SPRINT: Post-synthesis sanitizer (anti-hallucination) ===
    const allPassCitations = [
      ...(pass1.citations || []),
      ...(pass2.citations || []),
      ...(pass3.citations || []),
    ];
    const { sanitized: sanitizedSynthesis, flagCount } = sanitizeSynthesis(finalSynthesis, allPassCitations);
    if (flagCount > 0) {
      console.log(`[SANITIZER] Flagged ${flagCount} unverified claims`);
    }
    if (flagCount > 5) {
      console.warn(`[SANITIZER] WARNING: ${flagCount} unverified claims — report may contain fabricated data`);
    }
    finalSynthesis = sanitizedSynthesis;

    // === QUALITY GATE ===
    const qualityResult = checkReportQuality(reportQuality, finalSynthesis, { citations: allPassCitations, topic });
    console.log(`[QUALITY GATE] Grade: ${qualityResult.grade} | Failures: ${qualityResult.failures.length} | Metrics: contracts=${reportQuality.specificContracts}, dollars=${reportQuality.dollarValues}, entities=${reportQuality.namedEntities}, nullPasses=${reportQuality.nullPasses}/${reportQuality.totalPasses}`);

    if (qualityResult.grade === "MARGINAL") {
      // Log disclaimer for ops — do NOT put in customer PDF
      console.log(`[QUALITY GATE] MARGINAL — ${qualityResult.failures.join("; ")}`);
    }

    // Log methodology appendix for ops — do NOT put in customer PDF
    const methodologyLog = buildMethodologyAppendix(disambiguation, passTimings);
    console.log(`[METHODOLOGY]${methodologyLog}`);

    const researchTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`Research pipeline completed in ${researchTime}s (${Object.keys(passTimings).length} passes)`);

    // Normalize citation URLs before dedup
    function normalizeCitationUrl(url) {
      try {
        const u = new URL(url);
        const filtered = [...u.searchParams.entries()]
          .filter(([k]) => !k.startsWith("utm_"))
          .sort(([a], [b]) => a.localeCompare(b));
        u.search = filtered.length ? "?" + filtered.map(([k, v]) => `${k}=${v}`).join("&") : "";
        return u.toString().replace(/\/+$/, "");
      } catch { return url; }
    }

    // Merge all citations with normalization
    const rawCitations = [
      ...(pass1.citations || []),
      ...(pass2.citations || []),
      ...(pass3.citations || []),
      ...(disambiguation._citations || []),
      ...(validation._citations || []),
    ];
    const seen = new Set();
    const dedupedCitations = [];
    for (const url of rawCitations) {
      const normalized = normalizeCitationUrl(url);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        dedupedCitations.push(url);
      }
    }

    // Filter sources: remove YouTube/social, rank .gov first
    const { filtered: allCitations, removed: removedSources } = filterSources(dedupedCitations);
    if (removedSources.length > 0) {
      console.log(`[SOURCE FILTER] Removed ${removedSources.length} low-quality sources: ${removedSources.map(r => r.reason).join("; ")}`);
    }

    // C3: Emit intelligence signals from research
    try {
      if (_supabase && finalSynthesis.length > 100) {
        const signals = extractIntelSignals(finalSynthesis, { topic: originalTopic });
        if (signals.length > 0) {
          await _supabase.from("intelligence_signals").insert(
            signals.map((sig) => ({
              signal_type: sig.type,
              signal_key: sig.key,
              signal_value: sig.value,
              source_product: "marketpulse",
            }))
          );
          console.log(`Emitted ${signals.length} intelligence signals from MarketPulse`);
        }
      }
    } catch (sigErr) {
      console.error("Signal emission failed:", sigErr.message);
    }

    // === SPRINT E: Report Auto-Scoring (Spec 11.1) ===
    const reportScore = scoreReport(finalSynthesis, allCitations, classification);
    console.log(`[REPORT SCORE] Overall: ${reportScore.overall}/100 | Pipeline: ${reportScore.pipeline_opportunities.count} | Sources: ${reportScore.source_quality.gov_percent}% .gov`);

    // Log score to ops_events
    if (_supabase) {
      try {
        await _supabase.from("ops_events").insert({
          event_type: "marketpulse_report_score",
          details: {
            session_id, email,
            topic: topic.substring(0, 200),
            score: reportScore,
            quality_grade: qualityResult.grade,
          },
        });
      } catch (e) { console.error("Score logging failed:", e.message); }
    }

    // State: research_completed
    await _transition("research_completed");

    // Track quality metrics
    try {
      await trackQuality(_supabase, { product: "marketpulse", orderId: _orderId || session_id, grade: qualityResult.grade, score: reportScore.overall, factors: { pipeline_count: reportScore.pipeline_opportunities.count, gov_percent: reportScore.source_quality.gov_percent, quality_failures: qualityResult.failures } });
    } catch { /* non-blocking */ }

    // === QUALITY GATE: FAIL — do not generate PDF ===
    if (qualityResult.grade === "FAIL") {
      console.log(`[QUALITY GATE] FAIL — blocking PDF generation. Failures: ${qualityResult.failures.join("; ")}`);
      await logOpsEvent(_supabase, { event_type: "QUALITY_FAILURE", source_function: "generate-tactical-brief-background", severity: "error", signature: "quality_gate_fail", affected_entity: session_id, details: { email, topic: topic.substring(0, 200), grade: qualityResult.grade, failures: qualityResult.failures } });

      // Log failure to ops_events
      if (_supabase) {
        try {
          await _supabase.from("ops_events").insert({
            event_type: "marketpulse_quality_fail",
            details: {
              email,
              topic,
              quality_grade: qualityResult.grade,
              failures: qualityResult.failures,
              metrics: reportQuality,
              session_id,
            },
          });
        } catch (opsErr) {
          console.error("Failed to log quality failure to ops_events:", opsErr.message);
        }

        // Queue for manual review
        try {
          await _supabase.from("marketpulse_review_queue").insert({
            session_id,
            email,
            name,
            company,
            topic,
            audience,
            quality_grade: qualityResult.grade,
            quality_failures: qualityResult.failures,
            quality_metrics: reportQuality,
            synthesis_preview: (finalSynthesis || "").substring(0, 2000),
            status: "pending_review",
          });
        } catch (queueErr) {
          console.error("Failed to queue for manual review:", queueErr.message);
        }
      }

      // Send alternative email to customer
      const failEmailHtml = buildDeliveryEmail({ name, topic, orderId: _orderId, qualityFail: true });
      const failSubject = `Your MarketPulse Request: ${topic.slice(0, 60)}${topic.length > 60 ? "..." : ""}`;

      if (!shouldHoldEmail()) {
        await sendEmail({
          to: email,
          subject: failSubject,
          html: failEmailHtml,
          from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        });
      }

      // Notify Mary
      await sendEmail({
        to: "mary@missionmeetstech.com",
        subject: `[MarketPulse] QUALITY FAIL — ${name} (${email})`,
        html: `<p><strong>Quality gate blocked PDF delivery.</strong></p>
          <p><strong>Topic:</strong> ${topic}</p>
          <p><strong>Grade:</strong> ${qualityResult.grade}</p>
          <p><strong>Failures:</strong></p><ul>${qualityResult.failures.map(f => `<li>${f}</li>`).join("")}</ul>
          <p><strong>Metrics:</strong> contracts=${reportQuality.specificContracts}, dollars=${reportQuality.dollarValues}, nullPasses=${reportQuality.nullPasses}/${reportQuality.totalPasses}</p>
          <p>Queued for manual review. Session: ${session_id}</p>`,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });

      await _transition("quality_fail");
      return { statusCode: 200, body: JSON.stringify({ success: true, quality_gate: "FAIL", duration_seconds: Math.round((Date.now() - startTime) / 1000) }) };
    }

    await _transition("pdf_started");

    // Generate report HTML
    console.log("Generating report HTML...");
    const generatedAt = new Date().toISOString();
    const reportHtmlContent = renderMarketPulseHTML({ name, company, topic, audience, generatedAt, synthesis: finalSynthesis, citations: allCitations });
    console.log(`Report HTML generated: ${Math.round(reportHtmlContent.length / 1024)}KB`);

    // Store report HTML in Supabase and generate viewer URL
    let reportUrl = null;
    if (_supabase && _orderId) {
      try {
        const { url } = generateReportUrl(_orderId, "marketpulse");
        reportUrl = url;
        await _supabase.from("marketpulse_orders").update({ report_html: reportHtmlContent, report_url: url }).eq("id", _orderId);
        console.log(`Report stored and URL generated for order ${_orderId}`);
      } catch (e) { console.error("Report storage failed:", e.message); }
    }

    // State: pdf_completed → email_queued
    await _transition("pdf_completed");
    await _transition("email_queued");

    // Send delivery email with link to hosted report
    console.log("Sending delivery email...");
    const firstName = (name || "").split(" ")[0] || "there";
    const deliverySubject = `Your MarketPulse Report: ${topic.slice(0, 60)}${topic.length > 60 ? "..." : ""}`;
    const deliveryHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#0a0e17;padding:32px 40px;text-align:center;">
    <div style="font-size:24px;font-weight:700;color:#00e5fa;letter-spacing:0.5px;">MARKETPULSE</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">Federal Health IT Market Intelligence</div>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:16px;color:#1e293b;margin:0 0 16px;">Hi ${firstName},</p>
    <p style="font-size:16px;color:#1e293b;margin:0 0 24px;">Your MarketPulse report is ready.</p>
    <p style="font-size:14px;color:#475569;margin:0 0 8px;font-weight:600;">Topic</p>
    <p style="font-size:16px;color:#1e293b;margin:0 0 24px;">${topic.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${reportUrl || '#'}" style="display:inline-block;background:#00e5fa;color:#0a0e17;font-weight:700;font-size:16px;padding:14px 40px;text-decoration:none;border-radius:6px;">View Your Report</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">This link expires in 90 days. Right-click and "Save As" to keep a permanent copy.</p>
  </div>
  <div style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#9ca3af;">
    Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com" style="color:#0369a1;">missionmeetstech.com</a><br>
    AI-assisted research. Verify all claims independently.
  </div>
</div>`;

    if (shouldHoldEmail()) {
      if (_supabase) {
        await holdEmail(_supabase, email, deliverySubject, deliveryHtml, {
          product: "marketpulse",
          record_id: _orderId,
          has_attachment: false,
          attachment_size_kb: 0,
        });
      }
      console.log(`[degraded] Delivery email held for ${email}`);
    } else {
      const deliveryResult = await sendEmail({
        to: email,
        subject: deliverySubject,
        html: deliveryHtml,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });

      if (!deliveryResult.success) {
        console.error("Delivery email failed:", deliveryResult.error);
        await logOpsEvent(_supabase, { event_type: "DELIVERY_FAILURE", source_function: "generate-tactical-brief-background", severity: "error", signature: "email_send_failure", affected_entity: session_id, details: { email, error: deliveryResult.error } });
      }
    }

    // Send notification email to Mary (include disambiguation info)
    const _escHtml = (s) => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const disambigNote = disambiguation.is_ambiguous
      ? `\n\n⚠️ DISAMBIGUATION: User conflated ${disambiguation.entities_found?.length || 0} entities. Selected: ${_escHtml(disambiguation.selected_entity?.name || "unknown")}. See methodology appendix.`
      : "";
    const validationNote = !validation.overall_passed
      ? `\n\n⚠️ CROSS-VALIDATION: ${(validation.corrections_needed || []).length} corrections were applied.`
      : "";

    const notifyHtml = buildNotificationEmail({ name, email, company, topic, audience, session_id });
    await sendEmail({
      to: "mary@missionmeetstech.com",
      subject: `[MarketPulse] New order from ${_escHtml(name)}${disambiguation.is_ambiguous ? " ⚠️ DISAMBIGUATED" : ""}`,
      html: notifyHtml + `<p style="color:#888;font-size:12px;">${_escHtml(disambigNote)}${_escHtml(validationNote)}<br>Pipeline: ${researchTime}s, ${Object.keys(passTimings).length} passes, ${allCitations.length} sources</p>`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });

    // State: email_sent → delivered
    await _transition("email_sent");
    await _transition("delivered");

    // Submit to customer approval queue for portal visibility
    try {
      const { submitForApproval } = require("./lib/approval-hooks");
      await submitForApproval(_supabase, {
        title: `Your MarketPulse Report: ${(topic || "").substring(0, 60)}`,
        category: "report-review",
        targetRole: "customer",
        targetEmail: email,
        submittedBy: "system",
        payloadType: "report",
        payload: { orderId: session_id, qualityGrade: qualityResult?.grade || null, pageCount: null },
        context: { topic, sourceCount: allCitations.length, generatedAt: new Date().toISOString() },
      });
    } catch (_approvalErr) { console.error("approval-hooks:", _approvalErr.message); }

    // Customer event logging
    try {
      const { logCustomerEvent } = require("./lib/customer-sync");
      await logCustomerEvent(_supabase, { email, eventType: "delivery", product: "marketpulse", metadata: { topic: (topic || "").substring(0, 100), orderId: session_id } });
    } catch (_custErr) { console.error("customer-sync:", _custErr.message); }

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`generate-tactical-brief-background: completed in ${totalTime}s for ${email} (${_researchCallCount} research calls)`);

    return { statusCode: 200, body: JSON.stringify({ success: true, duration_seconds: totalTime, passes: Object.keys(passTimings).length }) };
  } catch (err) {
    console.error("generate-tactical-brief-background: pipeline error:", err);
    const errType = err.message && err.message.includes("Anthropic API") ? "MODEL_FAILURE" : "HARNESS_FAILURE";
    await logOpsEvent(_supabase, { event_type: errType, source_function: "generate-tactical-brief-background", severity: "critical", signature: errType === "MODEL_FAILURE" ? `claude_search_${err.status || "unknown"}` : "unhandled_error", affected_entity: session_id, details: { email, topic: topic.substring(0, 200), error: err.message } });

    // Notify customer of failure
    try {
      await sendEmail({
        to: email,
        subject: `Issue with your MarketPulse Brief — ${(topic || "").substring(0, 50)}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333;">
          <p>Hi ${name || "there"},</p>
          <p>We hit a technical issue generating your Tactical Brief on "${topic}." This is on us, not you.</p>
          <p><strong>What happens next:</strong></p>
          <ul>
            <li>Our team has been notified and is working on it</li>
            <li>We'll deliver your report within 24 hours</li>
            <li>If we can't resolve it, you'll receive a full refund</li>
          </ul>
          <p>You don't need to do anything. We'll follow up.</p>
          <p>Questions? Reply to this email or contact <a href="mailto:support@missionmeetstech.com">support@missionmeetstech.com</a>.</p>
          <p style="margin-top:24px;">— Mission Meets Tech</p>
        </div>`,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });
      console.log(`[ERROR EMAIL] Sent technical failure notification to ${email}`);
    } catch (custErr) {
      console.error("Failed to send customer error notification:", custErr.message);
    }

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

    // Log customer notification to ops_events
    try {
      if (_supabase) {
        await _supabase.from("ops_events").insert({
          event_type: "CUSTOMER_ERROR_EMAIL",
          severity: "warn",
          source: "generate-tactical-brief-background",
          entity_id: _orderId || session_id,
          signature: "error_email_technical",
          details: { email, topic: (topic || "").substring(0, 200), error_type: "technical_error" },
        });
      }
    } catch { /* non-blocking */ }

    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
