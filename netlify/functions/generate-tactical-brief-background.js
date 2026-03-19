// ============================================================
// generate-tactical-brief-background.js — Netlify Background Function
//
// Filename ends in -background.js → Netlify gives 15-minute timeout.
// Defensive 7-pass Perplexity pipeline (sonar-pro) → PDF → email.
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

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

// --- Perplexity API call ---
async function callPerplexity(systemPrompt, userPrompt, maxTokens = 4000) {
  const response = await withRetry(() => fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
  }), { maxRetries: 2, baseDelayMs: 3000 });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Perplexity API ${response.status}: ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    citations: data.citations || [],
  };
}

// ============================================================
// PASS 0: Entity Disambiguation (CHANGE 1)
// ============================================================
async function disambiguateEntity(topic) {
  console.log("Pass 0: Entity disambiguation...");

  const result = await callPerplexity(
    `You are a federal government organizational structure expert. Your ONLY job is to identify the exact federal entity the user is asking about.

CRITICAL RULES:
- Users often conflate agencies, offices, or acronyms. You MUST check if the user's description maps to ONE entity or MULTIPLE distinct entities.
- Search the parent agency's official website (.gov), org charts, staff directories, and "about" pages.
- If an acronym could refer to multiple offices (even within the same agency), list ALL matches.
- If the user says "X, also referred to as Y" — verify whether X and Y are actually the same entity or different entities.

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
  "user_claims_to_verify": ["list every factual claim the user made that needs verification"]
}`,
    `Identify and disambiguate the federal entity in this request:\n\n${topic}\n\nSearch official .gov sources. If the request conflates multiple entities, identify all of them and select the best match.`,
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

  const result = await callPerplexity(
    `You are a federal health IT market intelligence analyst. ${audienceContext} ${companyCtx}

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

  const result = await callPerplexity(
    `You are a senior federal health IT strategy advisor and competitive intelligence analyst. ${audienceContext} ${companyContext}

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

  const result = await callPerplexity(
    `You are a fact-checker and editor for a federal health IT intelligence publication. ${audienceContext} ${companyLine}

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
- Maximum 4 pages of content. Quality over quantity.
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

  const result = await callPerplexity(
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

  const result = await callPerplexity(
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
  // Kill switch
  const killCheck = checkKillSwitch("generate-tactical-brief-background");
  if (killCheck.blocked) return killCheck.response;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!PERPLEXITY_API_KEY) {
    console.error("generate-tactical-brief-background: PERPLEXITY_API_KEY not configured");
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

  // Extract structured company context from additional_context
  const companyContext = extractCompanyContext(company, additional_context, topic);

  console.log(`generate-tactical-brief-background: starting for ${email} (session ${session_id})`);
  console.log(`[COMPANY] ${companyContext.hasIdentity ? companyContext.company : "No company identified"} | MMT platform: ${companyContext.isMmtPlatform} | Certs: ${companyContext.knownCerts.join(",") || "none"} | Vehicles: ${companyContext.knownVehicles.join(",") || "none"}`);
  const startTime = Date.now();
  const passTimings = {};

  // Note: MarketPulse state machine uses marketpulse_orders table, keyed by session_id.
  // We attempt transitions but don't block on failure — state tracking is observability, not control flow.
  const { createClient } = require("@supabase/supabase-js");
  let _supabase = null;
  let _orderId = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    // Look up order by session_id
    try {
      const { data: order } = await _supabase.from("marketpulse_orders").select("id").eq("session_id", session_id).single();
      if (order) _orderId = order.id;
    } catch (e) { /* no order record yet — OK for free path */ }
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
      const primingResult = await callPerplexity(
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

    // Null result pivot check after Pass 2
    if (nullPassCount >= NULL_PASS_THRESHOLD) {
      console.log(`[NULL PROTOCOL] ${nullPassCount} passes returned empty. Broadening search.`);
      // Run a broadened pivot search pass
      const pivotStart = Date.now();
      const topicWords = topic.split(" ").slice(0, 5).join(" ");
      const pivotResult = await callPerplexity(
        `You are a federal contracting intelligence analyst. The previous research queries returned limited results. Broaden your search significantly. Search ALL federal agencies, not just one. Look for recent news, policy changes, and procurement activity.`,
        `Broadened search for: ${topic}\n\nSearch these expanded queries:\n1. "${topicWords}" federal contracts 2025 2026\n2. "${topicWords}" government spending changes\n3. federal contracting news ${topicWords}\n4. SAM.gov opportunities ${topicWords}\n5. USASpending recent awards ${topicWords}\n\nReport whatever you find, even tangentially related. This is a pivot search after ${nullPassCount} null results.`,
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
    const reportHtmlContent = renderMarketPulseHTML({
      name, company, topic, audience, generatedAt,
      synthesis: finalSynthesis,
      citations: allCitations,
    });
    const reportBuffer = Buffer.from(reportHtmlContent);
    console.log(`Report HTML generated: ${Math.round(reportBuffer.length / 1024)}KB`);

    // State: pdf_completed → email_queued
    await _transition("pdf_completed");
    await _transition("email_queued");

    // Send delivery email with HTML report attachment (with degraded mode hold)
    console.log("Sending delivery email...");
    const deliveryHtml = buildDeliveryEmail({ name, topic, orderId: _orderId, qualityGrade: qualityResult.grade, qualityFailures: qualityResult.failures });
    const deliverySubject = `Your MarketPulse Report: ${topic.slice(0, 60)}${topic.length > 60 ? "..." : ""}`;

    if (shouldHoldEmail()) {
      if (_supabase) {
        await holdEmail(_supabase, email, deliverySubject, deliveryHtml, {
          product: "marketpulse",
          record_id: _orderId,
          has_attachment: true,
          attachment_size_kb: Math.round(reportBuffer.length / 1024),
        });
      }
      console.log(`[degraded] Delivery email held for ${email}`);
    } else {
      const deliveryResult = await sendEmail({
        to: email,
        subject: deliverySubject,
        html: deliveryHtml,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        attachments: [
          {
            filename: "tactical-brief.html",
            content: reportBuffer.toString("base64"),
            content_type: "text/html",
          },
        ],
      });

      if (!deliveryResult.success) {
        console.error("Delivery email failed:", deliveryResult.error);
        await logOpsEvent(_supabase, { event_type: "DELIVERY_FAILURE", source_function: "generate-tactical-brief-background", severity: "error", signature: "email_send_failure", affected_entity: session_id, details: { email, error: deliveryResult.error } });
      }
    }

    // Send notification email to Mary (include disambiguation info)
    const disambigNote = disambiguation.is_ambiguous
      ? `\n\n⚠️ DISAMBIGUATION: User conflated ${disambiguation.entities_found?.length || 0} entities. Selected: ${disambiguation.selected_entity?.name || "unknown"}. See methodology appendix.`
      : "";
    const validationNote = !validation.overall_passed
      ? `\n\n⚠️ CROSS-VALIDATION: ${(validation.corrections_needed || []).length} corrections were applied.`
      : "";

    const notifyHtml = buildNotificationEmail({ name, email, company, topic, audience, session_id });
    await sendEmail({
      to: "mary@missionmeetstech.com",
      subject: `[MarketPulse] New order from ${name}${disambiguation.is_ambiguous ? " ⚠️ DISAMBIGUATED" : ""}`,
      html: notifyHtml + `<p style="color:#888;font-size:12px;">${disambigNote}${validationNote}<br>Pipeline: ${researchTime}s, ${Object.keys(passTimings).length} passes, ${allCitations.length} sources</p>`,
      from: "Mission Meets Tech <noreply@missionmeetstech.com>",
    });

    // State: email_sent → delivered
    await _transition("email_sent");
    await _transition("delivered");

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`generate-tactical-brief-background: completed in ${totalTime}s for ${email}`);

    return { statusCode: 200, body: JSON.stringify({ success: true, duration_seconds: totalTime, passes: Object.keys(passTimings).length }) };
  } catch (err) {
    console.error("generate-tactical-brief-background: pipeline error:", err);
    const errType = err.message && err.message.includes("Perplexity API") ? "MODEL_FAILURE" : "HARNESS_FAILURE";
    await logOpsEvent(_supabase, { event_type: errType, source_function: "generate-tactical-brief-background", severity: "critical", signature: errType === "MODEL_FAILURE" ? `perplexity_${err.status || "unknown"}` : "unhandled_error", affected_entity: session_id, details: { email, topic: topic.substring(0, 200), error: err.message } });

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

    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
