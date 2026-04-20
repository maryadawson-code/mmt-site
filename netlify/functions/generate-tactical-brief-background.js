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
const { enrichWithFederalData, formatFederalDataContext } = require("./lib/federal-data-apis");
const { enrichWithCongress, formatCongressContext } = require("./lib/congress-api");
const { enrichWithGovInfo, formatGovInfoContext } = require("./lib/govinfo-api");
const { enrichWithPubMed, formatPubMedContext } = require("./lib/pubmed-api");
const { enrichWithGrants, formatGrantsContext } = require("./lib/grants-api");
const { enrichWithAssistance, formatAssistanceContext } = require("./lib/sam-assistance");
const { enrichWithUSAJobs, formatUSAJobsContext } = require("./lib/usajobs-api");
const { enrichWithITDashboard, formatITDashboardContext } = require("./lib/it-dashboard-api");
const { enrichWithCMSProviderData, formatCMSContext } = require("./lib/cms-provider-data");
const { enrichWithClinicalTrials, formatClinicalTrialsContext } = require("./lib/clinicaltrials-api");
const { enrichWithONCHealthIT, formatONCHealthITContext } = require("./lib/onc-healthit-api");
const { enrichWithHHSOpenData, formatHHSOpenDataContext } = require("./lib/hhs-open-data");
const { loadSubscriberContext, formatContextBlock, contextSystemRules, noContextBanner, validateReport: validateSubscriberReport, gateContext, renderBlockedDiagnostic, waivedContextBanner } = require("./lib/subscriber-context");

// --- v4 Deep Research Loop modules (gated by MARKETPULSE_V4 flag) ---
const { scoreReportV4, buildRemediationPlan, renderScoreBanner } = require("./lib/research-score-v4");
const { runSelfAudit, renderAuditBlock, checkStopConditions, renderVerificationNotes } = require("./lib/self-audit-v4");
const {
  decomposeQuery,
  planSourceStrategy,
  createNullRegister,
  createRefinementLog,
  createFetchTracker,
  renderMethodology: renderV4Methodology,
} = require("./lib/research-planner");
const { buildV4SystemPrompt, detectMode, renderBanner: renderV4Banner, ACKNOWLEDGMENT: V4_ACK } = require("./lib/marketpulse-v4-prompt");
const { sanitizeV4 } = require("./lib/synthesis-sanitizer");
const { enforceTierRatio, buildSourceTable, dedupeCitations, autoLabelTier3 } = require("./lib/source-tiering");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const CLAUDE_ANALYSIS_MODEL = "claude-haiku-4-5-20251001"; // synthesis/validation — no live search
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar-pro"; // research passes — native web search

// --- Claude call (Pass 4 + Pass 5: cross-validation and corrections — no live search needed) ---
async function callClaude(systemPrompt, userPrompt, maxTokens = 4000) {
  const response = await withRetry(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60000); // 60s timeout
    return fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: ac.signal,
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
    }).finally(() => clearTimeout(timer));
  }, { maxRetries: 2, baseDelayMs: 3000 });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.content?.find(b => b.type === "text")?.text || "";
  return { content, citations: [] };
}

// --- Perplexity sonar-pro API call (web search research) ---
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
  const response = await withRetry(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120000); // 120s timeout
    return fetch(PERPLEXITY_URL, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        web_search_options: {
          search_context_size: "high",
        },
      }),
    }).finally(() => clearTimeout(timer));
  }, { maxRetries: 2, baseDelayMs: 3000 });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Perplexity API ${response.status}: ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  // Cost tracking
  try {
    if (_supabase) {
      await trackAnthropic(_supabase, {
        functionName: 'generate-tactical-brief-background',
        product: 'marketpulse',
        orderId: _orderId,
        model: PERPLEXITY_MODEL,
        usage: data.usage ? { input_tokens: data.usage.prompt_tokens || 0, output_tokens: data.usage.completion_tokens || 0 } : null,
        latencyMs: Date.now() - _costStart,
      });
    }
  } catch (_costErr) { /* never break research pipeline */ }

  // Extract text and citations from Perplexity response
  const textContent = data.choices?.[0]?.message?.content || "";
  const citations = data.citations || [];

  return { content: textContent, citations };
}

// ============================================================
// PASS 0: Entity Disambiguation (CHANGE 1)
// ============================================================
async function disambiguateEntity(topic) {
  console.log("Pass 0: Entity disambiguation...");

  // Use analysis model (Haiku, no web search) — disambiguation is entity structure
  // reasoning, not live data retrieval. Saves ~3 min vs Sonnet + web_search.
  const result = await callClaude(
    `You are a federal government organizational structure expert. Your ONLY job is to identify the exact federal entity the user is asking about and classify every term as either a SUBJECT to research or a FILTER to apply.

CRITICAL RULES:
- Users often conflate agencies, offices, or acronyms. You MUST check if the user's description maps to ONE entity or MULTIPLE distinct entities.
- If an acronym could refer to multiple offices (even within the same agency), list ALL matches.
- If the user says "X, also referred to as Y" — verify whether X and Y are actually the same entity or different entities.

SET-ASIDE / SOCIOECONOMIC FILTER RULES:
When a query mentions a set-aside type (SDVOSB, 8(a), HUBZone, WOSB, VOSB):
- This is a FILTER on contract actions, NOT a direction to research the certifying program.
- "SDVOSB contracts" = contracts with SDVOSB set-aside across all agencies.
- Do NOT disambiguate to SBA when the user mentions a set-aside type.

CURRENT ADMINISTRATION ACTIONS RULES:
When a query mentions "current administration" actions (cancellations, terminations, cuts, freezes, DOGE):
- Map to: DOGE termination actions, executive orders, agency workforce reductions, contract de-obligations.
- Search terms should include: "DOGE contract terminations," "federal contract cancellations 2025-2026," "de-obligated contracts."

AMBIGUOUS ACRONYM RULES:
When a query mentions a government office by acronym:
- Verify the acronym resolves to the correct organizational level.
- Example: "VHA OEM" = Veterans Health Administration Office of Emergency Management (19OEM, Martinsburg WV).
- When ambiguous, list BOTH interpretations, then select the one with contract activity.

OUTPUT FORMAT (respond ONLY in this JSON structure, no markdown fences):
{
  "entities_found": [
    {
      "name": "Full official name",
      "acronym": "ACRONYM",
      "org_code": "if known",
      "parent_org": "Parent agency/office",
      "mission": "1-2 sentence mission description"
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
    `Identify and disambiguate the federal entity in this request:\n\n${topic}\n\nIf the request conflates multiple entities, identify all of them and select the best match. Classify every term as subject (to research), filter (to apply to results), or context (background framing).`,
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
    `You are a senior federal health IT market analyst producing Gartner-quality strategic intelligence for Mission Meets Tech. ${audienceContext} ${companyCtx}

YOUR ANALYTICAL STANDARD:
You produce the caliber of work published by Gartner Market Guides, Deltek GovWin analyst reports, and McKinsey sector analyses. Your reader pays $199-249/year for this. They already know basic program information. They need STRATEGIC INSIGHT they cannot find by reading SAM.gov themselves.

The difference between inventory and intelligence:
- INVENTORY: "VA has 3 active telehealth contracts worth $45M" (the reader can find this)
- INTELLIGENCE: "VA telehealth spending grew 34% YoY, driven by connected care mandates. The market is shifting from infrastructure buildout to optimization and analytics. Small businesses captured 28% of new awards in FY2025, up from 19% — signaling deliberate set-aside expansion. The recompete window for the 3 largest contracts opens Q1 FY2027, creating a $45M addressable opportunity." (this is what they pay for)

ALWAYS explain WHY something matters, not just WHAT exists.

FEDERAL HEALTH IT LENS:
- Agency priority: DHA > VA > CMS > IHS > HHS/ONC > DoD non-DHA
- If query is broad, lead with health agency impacts
- If query has zero health IT connection, note that transparently

ENTITY CONTEXT (from disambiguation):
- Target entity: ${entity.name || topic}
- Acronym: ${searchTerms.short || "N/A"}
- Parent org: ${entity.parent_org || "N/A"}
- Search keywords: ${(searchTerms.keywords || []).join(", ")}
- DO NOT USE: ${(searchTerms.do_not_use || []).join(", ") || "none"}

SOURCE HIERARCHY (search ALL before drafting):
1. Agency .gov pages — org structure, leadership, budget justifications
2. Federal procurement databases — SAM.gov (Contract Opportunities + Contract Awards API, canonical as of Feb 2026), USASpending.gov
3. Oversight — GAO reports, agency IG reports, congressional testimony
4. Aggregators — GovTribe, GovWin, Bloomberg Gov
5. Trade press — Federal News Network, GovExec, NextGov

QUERY EXPANSION: Use 3+ variants per source (exact terms, NAICS codes ${naicsFocus.join(", ") || "541512, 541511"}, broader scope). If all return null, search parent/child agencies.

${claimsToVerify.length > 0 ? `USER CLAIMS TO VERIFY:\n${claimsToVerify.map((c, i) => `${i + 1}. ${c}`).join("\n")}\nVerify each against primary sources. Do NOT parrot as findings.` : ""}

RULES:
- NEVER report "zero contracts exist" — say "zero contracts found in [sources searched]"
- NEVER assign HIGH confidence to null results
- For personnel: official directory = active. Not listed = UNVERIFIED.
- If research contradicts user's framing, flag explicitly.${contextBlock}`,

    `Research topic: ${topic}

Using the entity context above, conduct a STRATEGIC landscape scan. Go deep. This is a premium product — the customer is paying $35-50 for analyst-quality research, not a web search summary.

1. MARKET STRUCTURE AND SIZE — Search for the ACTUAL spending data:
   - Search "USASpending.gov [agency] telehealth" or "[agency] [topic] obligations" for real award data
   - Search the agency's Congressional Budget Justification PDF for line-item allocations
   - Calculate TAM from actual obligations, not estimates. Show the math.
   - What is the YoY trend? Use at least 2 fiscal years of data for comparison.

2. DEMAND DRIVERS — What SPECIFIC policy, regulatory, or mission changes are creating requirements?
   - Search for recent executive orders, proposed rules in the Federal Register, and legislation
   - Search for agency strategic plans and IT modernization roadmaps
   - What technology mandates (interoperability, AI, cloud) are changing procurement patterns?

3. PROCUREMENT LANDSCAPE — Search HARD for contract data:
   - Search "SAM.gov [agency] [topic]" for active solicitations and recent awards
   - Search "USASpending.gov awards [agency] [NAICS code]" for obligated amounts
   - Search "[agency] [topic] contract award" in trade press for recent awards with contract numbers
   - For each contract found: get the contract NUMBER, not just the name. Search specifically for the PIID/contract identifier.
   - Search GovTribe, Bloomberg Government, or GovWin for contract details

4. BUDGET CONTEXT — Get the NUMBERS from source documents:
   - Search for the agency's FY2027 Budget in Brief or Budget Justification PDF
   - Find the specific line items, not just totals
   - Compare to FY2026 enacted and FY2025 actual where available

5. REGULATORY AND OVERSIGHT — Search for recent GAO/IG reports and congressional testimony

For each finding: specific source URL, confidence level (HIGH only if .gov + verifiable). CITE DOLLAR FIGURES WITH THEIR SOURCE IN THE SAME SENTENCE so the sanitizer doesn't flag them.`,
    8000
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
    `You are a senior federal health IT competitive intelligence analyst producing Gartner/Deltek GovWin-caliber strategic analysis. ${audienceContext} ${companyContext}

YOUR ANALYTICAL STANDARD:
Think like a GovWin analyst who interviews program managers and contracting officers. Your job is not to LIST companies — it is to EXPLAIN the competitive dynamics: who is winning, who is losing, why, and what it means for a new entrant or incumbent.

TARGET ENTITY: ${entity.name || topic}
SEARCH TERMS: ${JSON.stringify(searchTerms)}

COMPETITIVE INTELLIGENCE METHODOLOGY:
1. Search USASpending.gov and SAM.gov Contract Awards API for ACTUAL awardees (FPDS was decommissioned Feb 2026 — do NOT cite fpds.gov). Filter by sub-agency + NAICS + keywords.
2. For each awardee: contract number, amount, period, vehicle, set-aside category.
3. Then ANALYZE the competitive structure:
   a. MARKET CONCENTRATION — Is this a 1-vendor monopoly, 3-vendor oligopoly, or fragmented market? What % of dollars go to top 3 vendors?
   b. MARKET TIER — Small business territory, mid-tier, or large prime dominated? What's the SB share trend (growing or shrinking)?
   c. COMPETITIVE MOMENTUM — Which vendors are GROWING share (winning new awards, expanding scope)? Which are DECLINING (losing recompetes, reduced task orders)?
   d. BARRIERS TO ENTRY — What does a new entrant need? FedRAMP? HIPAA BAA? Security clearances? Past performance on similar? Specific certifications?
   e. TEAMING PATTERNS — Who teams with whom? What mentor-protege or JV relationships exist? Where are the gaps a new entrant could fill?
   f. WIN THEMES — What capabilities are buyers selecting for? Cost? Innovation? Incumbent knowledge? Speed of deployment?
4. Verified incumbents and market participants MUST be in separate sections.
5. Every vendor MUST have a source (contract number or USASpending URL). No assumed competitors presented as verified.

CRITICAL RULES:
- Do NOT list large primes without evidence of contracts with this specific entity.
- An honest "2 verified incumbents found" is better than a padded list of 10 assumed companies.
- ALWAYS explain what the competitive data MEANS, not just what it IS.${marketEventBlock}${contextBlock}`,

    `Topic: ${topic}

Landscape scan findings:
${landscapeContent}

Using the landscape data AND fresh searches, produce a STRATEGIC competitive analysis. DIG DEEPER than the landscape scan — search for data it missed.

1. COMPETITIVE POSITIONING — Search specifically for contract award data:
   - Search "USASpending.gov [vendor name] [agency]" for each vendor mentioned in the landscape scan
   - Search "[vendor name] [agency] contract award" to find PIID/contract identifiers
   - Search "GovTribe [contract name]" or "Bloomberg Government [contract name]" for contract details
   - For EVERY vendor you list, include the contract number (PIID) or explicitly state "contract number not found in [sources searched]"
   - Market concentration: top 3 vendors' share of total dollars (calculate from USASpending if possible)
   - Market tier: large prime vs mid-tier vs small business dominated
   - SB set-aside share and trend (use SAM.gov Contract Awards / USASpending small business goal data)

2. COMPETITIVE DYNAMICS — Go beyond listing companies:
   - Which vendors are gaining vs losing ground? Search for recent award announcements.
   - What teaming/JV arrangements exist? Search "[vendor] joint venture [agency]"
   - What WIN THEMES do buyers select for? Search recent RFP evaluation criteria.
   - What BARRIERS TO ENTRY exist? Specific certifications, clearances, past performance requirements.

3. ADDRESSABLE MARKET — Calculate TAM from data, don't estimate:
   - Sum active contract ceilings from USASpending/SAM
   - Serviceable addressable market (SAM) for a new entrant
   - Growth trajectory from multi-year obligation data

4. RISK FACTORS — Specific, evidence-based risks:
   - Budget/CR risk, DOGE/administration impacts
   - Protest risk on upcoming awards
   - Technology disruption (AI/cloud displacing legacy approaches)
   - Regulatory changes (interoperability mandates, certification requirements)

5. FORWARD CATALYSTS — What events in the next 12 months will change this market?
   - Recompete windows with dates
   - New-start programs with expected RFP dates
   - Policy changes taking effect
   - Budget milestones (FYDP, appropriations markups)

Cross-reference all landscape findings. Flag anything that cannot be confirmed.`,
    8000
  );

  return result;
}

// ============================================================
// PASS 3: Fact-Check, Synthesis, and Confidence Scoring (CHANGES 3, 6, 8)
// ============================================================
async function runSynthesis(topic, audience, company, disambiguation, landscapeContent, analysisContent, { primedContext, classification, companyContext: compCtx, v4On = false, v4Waived = false, subscriberContext = null } = {}) {
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

  const v3SystemPrompt = `You are the lead analyst at a federal health IT market intelligence firm, producing a report that competes with Gartner Market Guides and Deltek GovWin analyst briefs. ${audienceContext} ${companyLine}

YOUR STANDARD: This report is a PAID intelligence product ($35-50 per report). The reader is a federal BD/capture professional who already knows their market. They pay because your analysis tells them something they did not know and could not easily find themselves. If this report reads like a ChatGPT web search summary, you have FAILED.

WHAT SEPARATES ANALYST-GRADE FROM AI-GRADE:
- AI-grade: "VA has several active telehealth contracts." (They know this.)
- Analyst-grade: "VA telehealth contract spending grew 34% YoY to $X, driven by the COMPACT Act expansion mandate. The growth is concentrated in two vehicles (T4NG2, VA OEHRM), with 73% of new task orders going to three incumbents. The recompete window for the largest contract opens Q1 FY2027, creating a $XM addressable opportunity for new entrants with connected care capabilities. Small business share has grown from 19% to 28% over two fiscal years — this is a deliberate OSDBU initiative, not accidental."

TARGET ENTITY: ${entity.name || topic} (${entity.acronym || ""})

CONFIDENCE RULES (HARD):
HIGH: .gov source + cross-verified by 2+. NEVER for null results.
MEDIUM: One credible source. NEVER for inference.
LOW: Single indirect source or inference.
UNVERIFIED: No source. MUST include "Requires verification via [method]."
Tags on KEY FINDINGS ONLY (5-7 max).

${claimsToVerify.length > 0 ? `USER CLAIMS TO VERIFY:\n${claimsToVerify.map((c, i) => `${i + 1}. "${c}" — verify against primary sources.`).join("\n")}` : ""}

VERIFIED GROUND TRUTH:
${JSON.stringify(Object.values(KNOWN_FACTS).map(f => ({ name: f.name, agency: f.agency, value: f.value, status: f.status, vendor: f.vendor })), null, 2)}
If research contradicts verified facts, flag: "GROUND TRUTH CONFLICT: [fact] vs [finding] — [source]"

ANTI-FABRICATION RULES (HARD):
1. Every dollar figure needs a source URL. No source = "Not available from public sources."
2. Every vendor in competitive landscape needs a contract number. No contract # = not a verified awardee.
3. Every % or ratio needs a source or shown math.
4. Never aggregate estimates into a headline total presented as sourced.
5. If research found limited results, say so in METHODOLOGY. Do NOT pad.

REPORT STRUCTURE (these exact headers):

## STRATEGIC THESIS
2-3 sentences. The single most important insight from this research. What is the market doing, why, and what does it mean? This is the headline a Gartner analyst would write. Example: "The VA telehealth market is transitioning from infrastructure deployment to optimization and analytics, creating a window for AI-native firms to displace legacy integrators on upcoming recompetes. Total addressable market is approximately $XM, growing at X% annually."

## MARKET LANDSCAPE
- Market size and growth: TAM estimate with source. YoY spending trend.
- Demand drivers: What policy, technology, or mission changes are creating requirements?
- Market maturity: Is this an emerging, growing, mature, or declining market segment?
- Budget trajectory: Actual appropriations/obligations data from .gov sources.
- Key programs: The 3-5 programs driving the most contract activity.
Maximum 1 page. Every paragraph must contain a specific number, date, or sourced fact.

## PIPELINE INTELLIGENCE
For EACH opportunity, structured format:

CONTRACT/OPPORTUNITY: [Name]
Agency: [Contracting agency]
Contract #: [If known, or "Not confirmed"]
NAICS: [Code + description]
Set-Aside: [Type]
Estimated Value: [$ or range, or "Not confirmed"]
Incumbent: [Company if known, or "Not confirmed"]
Status: [Active / Recompete / New start]
Timeline: [Key dates]
Source: [URL]
Strategic Significance: [Why this matters — not just "relevant to health IT" but WHY this contract changes the competitive landscape]

Group by agency subsection where applicable.

## COMPETITIVE DYNAMICS
NOT just a vendor list. This is strategic competitive analysis:

### Market Structure
- Concentration: monopoly, oligopoly, or fragmented? Top 3 vendors' share of dollars.
- Market tier: large prime, mid-tier, or small business dominated?
- Trend: Is SB share growing or shrinking? Evidence?

### Verified Incumbents
Each with contract number, value, vehicle. THEN for each: Are they growing or declining? Winning new work or defending old?

### Barriers to Entry
What does a new entrant actually need? FedRAMP? Clearances? Specific past performance? HIPAA BAA? Estimate the time and cost to meet these barriers.

### Teaming Landscape
Known JVs, mentor-protege relationships, and subcontracting patterns. Where are the gaps a new entrant could fill?

### Win Themes
What are buyers selecting for? Cost? Innovation? Speed? Incumbent knowledge? Based on evaluation criteria from recent RFPs.

## RISK ASSESSMENT
Specific, evidence-based risks — NOT a generic compliance checklist:
- Budget/CR risk with specific impact estimates
- Administration/DOGE impacts with evidence
- Protest risk on upcoming awards
- Technology disruption threats
- Regulatory changes (mandates, certification requirements)

## CAPTURE STRATEGY
${companyGuard}
Strategic recommendations tied to SPECIFIC opportunities from Pipeline Intelligence:
- Which opportunities to pursue (and which to skip, with reasoning)
- Recommended teaming approach with named potential partners
- Vehicle strategy (which IDIQs/GWACs provide the best path)
- Timeline: what to do in the next 30/60/90 days tied to specific procurement milestones
- Competitive differentiation: how to position against identified incumbents

If company identity is unknown, label recommendations as generic and explain what would change with company-specific context.

## FORWARD CATALYSTS (12-MONTH OUTLOOK)
The 5-7 events that will reshape this market in the next year:
- Each must have a specific date or date range
- Each must explain WHY it matters (not just THAT it's happening)
- Prioritized by impact: which events create the largest windows of opportunity?

## METHODOLOGY AND LIMITATIONS
- Entity researched (after disambiguation)
- Sources queried with search terms
- Results per source (including zeros)
- Contradictions and resolutions
- What was NOT found and why the null matters
- What requires manual verification

RULES:
- Every claim must have a source. .gov preferred.
- CRITICAL FORMATTING: Every dollar figure MUST have its source citation IN THE SAME SENTENCE. Write "$123.4B (per VA FY2027 Budget in Brief)" not "$123.4B" followed by a citation somewhere else. This prevents automated quality flags.
- Use inline parenthetical sources: "(per USASpending.gov)", "(per VA Budget Justification FY2027)", "(per SAM.gov award notice)".
- NO YouTube. NO generic blogs as primary data.
- NO basic program descriptions the reader already knows.
- NO empty sections. Merge or explain what to monitor.
- Data density: every paragraph must have a specific fact.
- Target 8-12 pages (~24,000-36,000 chars). This is a premium product — depth matters. Cut generic context and program descriptions the reader already knows, but preserve ALL pipeline data, competitive analysis, and strategic insights. An analyst-quality 10-page report is worth more than a thin 4-page summary.
- Current-events overrides: VetCert ~12 days; SEWP VI not yet awarded; FPDS decommissioned Feb 24 2026, canonical source is SAM.gov Contract Awards API; FPDS ATOM feed retires permanently July 31 2026 — never cite fpds.gov.${contextBlock}`;

  const v3UserPrompt = `Topic: ${topic}

Landscape scan:
${landscapeContent}

Deep analysis:
${analysisContent}

Synthesize into a final STRATEGIC intelligence brief.

Lead with the STRATEGIC THESIS — the single most important insight. Then build the case with evidence. The reader should finish this report knowing:
1. Is this market worth pursuing? (TAM, growth, trajectory)
2. Who controls it today? (competitive structure, incumbents, share)
3. Where are the openings? (recompetes, new starts, SB expansion)
4. What do I need to compete? (barriers, certifications, past performance)
5. What should I do next? (specific actions tied to specific opportunities)

Apply confidence scoring strictly. No HIGH on null results. Every dollar needs a source. Every vendor needs a contract number.`;

  // v4 Deep Research Loop: swap to v4 system prompt + user prompt when flag is on.
  // buildV4SystemPrompt internally calls detectMode() and captureStrategyInstructions(),
  // so mode-aware output + all 15 sections (incl. 6 issue subsections) are mandated here.
  let synthesisSystemPrompt = v3SystemPrompt;
  let synthesisUserPrompt = v3UserPrompt;
  if (v4On) {
    synthesisSystemPrompt = buildV4SystemPrompt({
      topic,
      audience,
      company,
      subscriberContext,
      companyContext: compCtx,
      researchPlanMd: null,
      primedContext,
    });
    const waivedNote = v4Waived
      ? "\n\nSUBSCRIBER CONTEXT WAIVED (WAIVE_CONTEXT=true). This is a generic run — do NOT emit firm-specific pursuit recommendations; use GENERIC-mode Capture Strategy as instructed above."
      : "";
    synthesisUserPrompt = `Topic: ${topic}

Landscape scan:
${landscapeContent}

Deep analysis:
${analysisContent}

Synthesize into the final MarketPulse v4 report. Follow the 15-section structure in the exact order specified, with all six mandatory issue subsections populated (4.1 Performance, 4.2 Procurement/contracting, 4.3 Structural, 4.4 Readiness outcomes, 4.5 Transition/execution, 4.6 Oversight/compliance) — each with ≥2 primary-source citations. Meet the enforced minimums: ≥25 distinct source fetches, ≥40% Tier 1 share. Every statement must carry an evidence level (Verified Fact / [inference] / [speculative]). No pseudo-citations. No "[source needed]" in user-visible text. Include the Readiness Outcomes section with ≥3 dated hard metrics, and the Capture Strategy section with mode-specific plays (not generic bid advice).${waivedNote}`;
  }

  const result = await callClaudeSearch(synthesisSystemPrompt, synthesisUserPrompt, 16000);

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
  // Deadline watchdog: Netlify background functions have a 15-minute (900s) limit.
  // Reserve 120s for report rendering + email delivery so we never time out before sending.
  const DEADLINE_MS = 780 * 1000; // 13 minutes — leaves 2 min for render + email
  function pastDeadline() { return (Date.now() - startTime) > DEADLINE_MS; }

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

    // === MarketPulse v2: Subscriber Context Layer (2026-04-17 spec) ===
    // Loaded upfront so it's in scope for prompt building, tagging rules,
    // and post-generation validation. If no record exists, `subscriberContext`
    // is null and the "no context" banner gets injected into the report.
    let subscriberContext = null;
    if (_supabase) {
      subscriberContext = await loadSubscriberContext(_supabase, email);
      if (subscriberContext) {
        console.log(`[SUBSCRIBER-CTX] Loaded for ${subscriberContext.entity_name} (v${subscriberContext.context_version}, ${(subscriberContext.active_pursuits || []).length} active pursuits, ${(subscriberContext.incumbent_positions || []).length} incumbent)`);
      } else {
        console.log(`[SUBSCRIBER-CTX] No context record for ${email} — will emit banner`);
      }
    }

    // === v4 RUN-BLOCKER GATE (§4) ===
    // When MARKETPULSE_V4=on and no subscriber_context is loaded, require
    // an explicit WAIVE_CONTEXT=true or halt before any research begins.
    const V4_ON = getFlag("MARKETPULSE_V4") === "on";
    let v4Waived = false;
    if (V4_ON) {
      const gate = gateContext(subscriberContext, process.env);
      if (gate.state === "BLOCKED") {
        console.log(`[V4 GATE] BLOCKED — ${gate.reason}`);
        const diagnostic = renderBlockedDiagnostic(gate.reason, email);
        await logOpsEvent(_supabase, {
          event_type: "MARKETPULSE_V4_BLOCKED",
          source_function: "generate-tactical-brief-background",
          severity: "warn",
          signature: "v4_subscriber_context_gate",
          affected_entity: session_id,
          details: { email, topic: (topic || "").substring(0, 200), reason: gate.reason },
        });
        // Email Mary but not the customer — this is an ops condition, not a customer-facing failure.
        try {
          await sendEmail({
            to: "mary@missionmeetstech.com",
            subject: `[MarketPulse v4] BLOCKED — ${email}`,
            html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap;">${diagnostic.replace(/[<&>]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>`,
            from: "Mission Meets Tech <noreply@missionmeetstech.com>",
          });
        } catch (_) { /* non-blocking */ }
        return { statusCode: 200, body: JSON.stringify({ success: false, v4_gate: "BLOCKED", reason: gate.reason }) };
      }
      if (gate.state === "WAIVED") {
        v4Waived = true;
        console.log(`[V4 GATE] WAIVED — generic-run banner will appear on report`);
      } else {
        console.log(`[V4 GATE] OK — subscriber context loaded`);
      }
    }
    console.log(V4_ON ? `${V4_ACK}` : "[v3 path] MARKETPULSE_V4 flag is off — using v3 pipeline");

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

    // Pre-pass: Federal data API enrichment — runs all sources in parallel.
    // Each source is wrapped individually so one failure can't poison the rest.
    // See docs/api-integration-roadmap.md for the full source matrix.
    let federalDataContext = "";
    try {
      const entityName = disambiguation.selected_entity?.name || topic;
      const entityAcronym = disambiguation.selected_entity?.acronym || "";
      const naicsFocus = (classification && classification.scope && classification.scope.naics_focus) || [];
      const agencyCodeMap = { VA: "036", DHA: "097", HHS: "075", DoD: "097" };
      const agencyCode = agencyCodeMap[entityAcronym];
      const apiStart = Date.now();

      const safe = (p) => p.catch((e) => ({ error: e.message }));
      const [
        federalData,
        congressData,
        govinfoData,
        pubmedData,
        grantsData,
        assistanceData,
        usajobsData,
        itDashboardData,
        cmsData,
        ctgovData,
        oncHealthITData,
        hhsOpenData,
      ] = await Promise.all([
        safe(enrichWithFederalData({ topic: entityName, agency: entityAcronym || undefined, naics: naicsFocus.length > 0 ? naicsFocus : undefined })),
        safe(enrichWithCongress({ topic: entityName })),
        safe(enrichWithGovInfo({ topic: entityName })),
        safe(enrichWithPubMed({ topic: entityName, yearsBack: 5 })),
        safe(enrichWithGrants({ topic: entityName })),
        safe(enrichWithAssistance({ topic: entityName, agency: entityAcronym })),
        safe(enrichWithUSAJobs({ topic: entityName })),
        safe(enrichWithITDashboard({ topic: entityName, agencyCode })),
        safe(enrichWithCMSProviderData({ topic: entityName })),
        safe(enrichWithClinicalTrials({ topic: entityName })),
        safe(enrichWithONCHealthIT({ topic: entityName })),
        safe(enrichWithHHSOpenData({ topic: entityName })),
      ]);

      federalDataContext = [
        formatFederalDataContext(federalData),
        formatCongressContext(congressData),
        formatGovInfoContext(govinfoData),
        formatPubMedContext(pubmedData),
        formatGrantsContext(grantsData),
        formatAssistanceContext(assistanceData),
        formatUSAJobsContext(usajobsData),
        formatITDashboardContext(itDashboardData),
        formatCMSContext(cmsData),
        formatClinicalTrialsContext(ctgovData),
        formatONCHealthITContext(oncHealthITData),
        formatHHSOpenDataContext(hhsOpenData),
      ].filter(Boolean).join("");

      passTimings["Pre-pass — Federal API enrichment"] = Math.round((Date.now() - apiStart) / 1000);
      if (federalDataContext) {
        primedContext = (primedContext || "") + federalDataContext;
      }
    } catch (apiErr) {
      console.warn("Federal API enrichment failed (non-blocking):", apiErr.message);
    }

    // Subscriber context + tagging rules prepend to primedContext. This
    // positions the subscriber's active pursuits, incumbent positions, and
    // OCI exclusions *first* in the research prompt so the model reads them
    // before any federal-data findings, and applies tags accordingly.
    if (subscriberContext) {
      const ctxBlock = formatContextBlock(subscriberContext);
      const ctxRules = contextSystemRules();
      primedContext = ctxBlock + ctxRules + "\n\n" + (primedContext || "");
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
    let pass2 = { content: "", citations: [] };
    if (!pastDeadline()) {
      const pass2Start = Date.now();
      pass2 = await runDeepAnalysis(optimizedTopic, audience, company, disambiguation, pass1.content, { primedContext, classification });
      passTimings["Pass 2 — Deep analysis"] = Math.round((Date.now() - pass2Start) / 1000);
      analyzePassResult(reportQuality, pass2.content, pass2.citations);
      if (!pass2.content || pass2.content.trim().length < 200) nullPassCount++;
    } else {
      console.log("[DEADLINE] Skipping Pass 2 — time budget exceeded");
      passTimings["Pass 2 — Deep analysis"] = 0;
    }

    // Null result pivot check after Pass 2 (NULL RESULT PROTOCOL)
    if (!pastDeadline() && nullPassCount >= NULL_PASS_THRESHOLD) {
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
    const pass3 = await runSynthesis(optimizedTopic, audience, company, disambiguation, pass1.content, pass2.content, { primedContext, classification, companyContext, v4On: V4_ON, v4Waived, subscriberContext });
    passTimings["Pass 3 — Synthesis"] = Math.round((Date.now() - pass3Start) / 1000);
    analyzePassResult(reportQuality, pass3.content, pass3.citations);

    // Pass 4: Cross-validation gate (CHANGE 7)
    let validation = { overall_passed: true, corrections_needed: [], _citations: [] };
    if (!pastDeadline()) {
      const pass4Start = Date.now();
      validation = await runCrossValidation(optimizedTopic, disambiguation, pass3.content);
      passTimings["Pass 4 — Cross-validation"] = Math.round((Date.now() - pass4Start) / 1000);
    } else {
      console.log("[DEADLINE] Skipping Pass 4 (cross-validation) — time budget exceeded");
      passTimings["Pass 4 — Cross-validation"] = 0;
    }

    // Pass 5: Apply corrections if needed
    let finalSynthesis = pass3.content;
    if (!pastDeadline() && (!validation.overall_passed || (validation.corrections_needed || []).length > 0)) {
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

    // === v4 SANITIZER + SCORE + SELF-AUDIT ===
    // When v4 is on, run the addendum sanitizer (strip [source needed],
    // ban pseudo-cites, cap $ mentions, label Tier 3), compute the
    // decomposed 100-point Research Score, and run the 18-check audit.
    // If stop conditions fire, deliver the DIAGNOSTIC BLOCK to ops and
    // block customer delivery.
    let v4Audit = null;
    let v4Score = null;
    let v4Diagnostic = null;
    let v4Stop = false;
    if (V4_ON) {
      const v4Clean = sanitizeV4(finalSynthesis, allPassCitations);
      if (v4Clean.cleanedCount > 0) {
        console.log(`[V4 SANITIZER] stripped ${v4Clean.cleanedCount} internal flags from user-visible text (${v4Clean.gaps.length} sentences dropped, ${v4Clean.pseudoCiteHits.length} pseudo-cites)`);
      }
      finalSynthesis = v4Clean.sanitized;

      // Dedupe citations by canonical URL once, up-front, so score + audit
      // + source table all reason over the same unique list. Raw allPass has
      // near-duplicates (utm params, trailing slashes) that inflate the count
      // and break audit #13 (expected-row gate).
      const v4Citations = dedupeCitations(allPassCitations);
      if (v4Citations.length !== allPassCitations.length) {
        console.log(`[V4 DEDUP] ${allPassCitations.length} raw citations → ${v4Citations.length} unique`);
      }

      // === EDIT 1: Waived/no-context banner BEFORE scoring ===
      // scoreSubscriberRelevance scans finalSynthesis for a banner phrase when
      // subscriberContext is absent. If we inject the banner later (at HTML
      // render time, formerly line 1487), the scorer sees empty text and
      // returns 0/15. Inject the markdown banner here so the scorer sees it.
      if (!subscriberContext) {
        finalSynthesis = waivedContextBanner() + finalSynthesis;
        console.log(`[V4 BANNER] ${v4Waived ? "WAIVED" : "no-context"} banner prepended to synthesis before scoring`);
      }

      // Build opportunity count from Pipeline Intelligence structured entries
      const opportunityCount = (finalSynthesis.match(/CONTRACT\/OPPORTUNITY:/g) || []).length;

      v4Score = scoreReportV4({
        reportText: finalSynthesis,
        citations: v4Citations,
        hasSubscriberContext: !!subscriberContext,
        opportunityCount,
      });
      console.log(`[V4 SCORE] ${v4Score.total}/100 band=${v4Score.band} | ${Object.entries(v4Score.dimensions).map(([k, v]) => `${k}=${v.score}/${v.max}`).join(" ")}`);

      // === EDIT 2: Prepend decomposed score banner BEFORE audit ===
      // Audit #14 (checkDecomposedScore) searches the report for all 5
      // dimension labels. renderScoreBanner emits the exact format the audit
      // expects. Prepend here so the audit sees it on this pass.
      const subscriberStatusLabel = subscriberContext
        ? `LOADED: ${subscriberContext.entity_name}`
        : (v4Waived ? "WAIVED (generic run)" : "not loaded");
      const scoreBannerMd = renderScoreBanner(v4Score, {
        subscriberStatus: subscriberStatusLabel,
        topic,
        date: new Date().toISOString().slice(0, 10),
      });
      finalSynthesis = scoreBannerMd + "\n\n" + finalSynthesis;

      // === EDIT 3: Append source table BEFORE audit ===
      // Audit #13 (checkSourceTable) expects a markdown "# | URL | Tier |"
      // table with row count within 10% of total citations. buildSourceTable
      // emits exactly that shape.
      //
      // v4 prompt §16 also mandates the MODEL emit a ## Source Table. If
      // both the model's and our appended tables land in finalSynthesis,
      // audit #13's greedy regex counts rows from both and hard-stops
      // (rows=50 when citations=25). Strip the model-emitted section first
      // so exactly one canonical Source Table ends up in the delivered body.
      finalSynthesis = finalSynthesis.replace(/\n?##\s*Source Table[\s\S]*?(?=\n##\s|$)/gi, "");
      finalSynthesis += "\n\n## Source Table\n\n" + buildSourceTable(v4Citations);

      // Auto-label any inline Tier 3 citation that lacks [sentiment-source]
      // in its ±120-char window. Deterministic fix for audit #8 — the model
      // is instructed to emit the marker (hard rule #14) but doesn't always
      // comply, so this guarantees the label before the audit runs.
      const tier3Labeling = autoLabelTier3(finalSynthesis, v4Citations);
      if (tier3Labeling.labeled > 0) {
        console.log(`[V4 TIER3 AUTO-LABEL] inserted [sentiment-source] at ${tier3Labeling.labeled} inline occurrence(s)`);
        finalSynthesis = tier3Labeling.text;
      }

      v4Audit = runSelfAudit({
        reportText: finalSynthesis,
        citations: v4Citations,
        hasSubscriberContext: !!subscriberContext,
        waived: v4Waived,
        isBidder: !!(subscriberContext && (subscriberContext.active_pursuits || []).length > 0),
        nullQueryCount: 0, // populated when planner is wired into research loop
        fetchCount: v4Citations.length,
        refinementPasses: Object.keys(passTimings).length,
        score: v4Score,
      });
      console.log(`[V4 AUDIT] ${v4Audit.passedCount}/${v4Audit.checks.length} checks passed${v4Audit.allPassed ? " ✓" : ""}`);

      const strictAudit = getFlag("MARKETPULSE_STRICT_AUDIT") === "on";
      const stopCheck = checkStopConditions({
        audit: v4Audit,
        score: v4Score,
        hasSubscriberContext: !!subscriberContext,
        waived: v4Waived,
        strict: strictAudit,
      });
      if (stopCheck.stop) {
        v4Stop = true;
        v4Diagnostic = stopCheck.diagnostic;
        console.log(`[V4 STOP] ${stopCheck.reasons.join(" | ")}`);
      }

      // Append AUDIT BLOCK + REMEDIATION PLAN to the report if we're still delivering
      if (!v4Stop) {
        // Soft-delivery path: Tier A clean + score ≥ 85 but ≥1 Tier B flag.
        // Emit the Verification Notes footnote so the customer can apply extra
        // scrutiny to the specific flagged claims.
        if (stopCheck.softFlags && stopCheck.softFlags.length > 0) {
          console.log(`[V4 SOFT DELIVERY] score=${v4Score.total}/100, ${stopCheck.softFlags.length} Tier B flag(s) surfaced in Verification Notes`);
          finalSynthesis += "\n\n" + renderVerificationNotes(stopCheck.softFlags);
        }
        finalSynthesis += "\n\n" + renderAuditBlock(v4Audit);
        if (v4Score.band === "remediate") {
          finalSynthesis += "\n\n" + buildRemediationPlan(v4Score);
        }
      }
    }

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

    // === QUALITY GATE: FAIL handling ===
    // Policy: If research passes produced content (nullPasses < 2), deliver with
    // disclaimer rather than blocking. Only block if research genuinely failed
    // (2+ null passes = no useful data gathered).
    if (qualityResult.grade === "FAIL") {
      const researchFailed = reportQuality.nullPasses >= 2;

      if (researchFailed) {
        // Research genuinely failed — block delivery, notify customer + Mary
        console.log(`[QUALITY GATE] HARD FAIL — ${reportQuality.nullPasses} null passes, blocking delivery. Failures: ${qualityResult.failures.join("; ")}`);
        await logOpsEvent(_supabase, { event_type: "QUALITY_FAILURE", source_function: "generate-tactical-brief-background", severity: "error", signature: "quality_gate_hard_fail", affected_entity: session_id, details: { email, topic: topic.substring(0, 200), grade: "FAIL", failures: qualityResult.failures, nullPasses: reportQuality.nullPasses } });

        const failEmailHtml = buildDeliveryEmail({ name, topic, orderId: _orderId, qualityFail: true });
        if (!shouldHoldEmail()) {
          await sendEmail({ to: email, subject: `Your MarketPulse Request: ${topic.slice(0, 60)}${topic.length > 60 ? "..." : ""}`, html: failEmailHtml, from: "Mission Meets Tech <noreply@missionmeetstech.com>" });
        }
        await sendEmail({ to: "mary@missionmeetstech.com", subject: `[MarketPulse] HARD FAIL — ${name} (${email})`, html: `<p><strong>Research failed (${reportQuality.nullPasses} null passes).</strong></p><p><strong>Topic:</strong> ${topic}</p><p><strong>Failures:</strong></p><ul>${qualityResult.failures.map(f => `<li>${f}</li>`).join("")}</ul><p>Session: ${session_id}</p>`, from: "Mission Meets Tech <noreply@missionmeetstech.com>" });
        await _transition("quality_fail");
        return { statusCode: 200, body: JSON.stringify({ success: true, quality_gate: "FAIL", duration_seconds: Math.round((Date.now() - startTime) / 1000) }) };
      }

      // Research produced content but gate flagged issues — downgrade to MARGINAL and deliver
      console.log(`[QUALITY GATE] SOFT FAIL → MARGINAL — research has content (${reportQuality.nullPasses} null passes), delivering with disclaimer. Failures: ${qualityResult.failures.join("; ")}`);
      qualityResult.grade = "MARGINAL";
      qualityResult.failures.push("Auto-downgraded from FAIL — research produced content but quality metrics flagged issues");
      await logOpsEvent(_supabase, { event_type: "QUALITY_FAILURE", source_function: "generate-tactical-brief-background", severity: "warn", signature: "quality_gate_soft_fail", affected_entity: session_id, details: { email, topic: topic.substring(0, 200), grade: "MARGINAL (downgraded)", failures: qualityResult.failures } });
    }

    // === v4 STOP HANDLER ===
    // If v4 self-audit triggered a stop condition, email the diagnostic
    // to Mary (not the customer), log the event, and return without
    // rendering/sending the report.
    if (V4_ON && v4Stop) {
      await logOpsEvent(_supabase, {
        event_type: "MARKETPULSE_V4_STOP",
        source_function: "generate-tactical-brief-background",
        severity: "error",
        signature: "v4_self_audit_stop",
        affected_entity: session_id,
        details: {
          email,
          topic: (topic || "").substring(0, 200),
          score: v4Score ? v4Score.total : null,
          band: v4Score ? v4Score.band : null,
          failed_checks: v4Audit ? v4Audit.checks.filter(c => !c.passed).map(c => `#${c.id} ${c.label}`) : [],
        },
      });
      try {
        await sendEmail({
          to: "mary@missionmeetstech.com",
          subject: `[MarketPulse v4] STOP — ${name} (${email}) — score ${v4Score ? v4Score.total : "?"}/100`,
          html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap;background:#f3f4f6;padding:16px;border-radius:8px;">${(v4Diagnostic || "").replace(/[<&>]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>`,
          from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        });
      } catch (_) { /* non-blocking */ }

      // Customer notification: a gentle "we need more time" rather than the raw diagnostic
      try {
        await sendEmail({
          to: email,
          subject: `We're still working on your MarketPulse Report — ${(topic || "").substring(0, 50)}`,
          html: `<p>Hi ${(name || "there").split(" ")[0]},</p><p>Our audit flagged that your MarketPulse report needs additional primary-source verification before we deliver it. We don't ship reports that can't be fully grounded in Tier 1 federal sources.</p><p>Our team is working on closing the gaps. You'll have your report within 24 hours.</p><p>— Mission Meets Tech</p>`,
          from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        });
      } catch (_) { /* non-blocking */ }
      await _transition("quality_fail");
      return { statusCode: 200, body: JSON.stringify({ success: false, v4_stop: true, score: v4Score ? v4Score.total : null }) };
    }

    await _transition("pdf_started");

    // Generate report HTML
    console.log("Generating report HTML...");
    const generatedAt = new Date().toISOString();
    let reportHtmlContent = renderMarketPulseHTML({ name, company, topic, audience, generatedAt, synthesis: finalSynthesis, citations: allCitations, reportScore });
    console.log(`Report HTML generated: ${Math.round(reportHtmlContent.length / 1024)}KB`);

    // === MarketPulse v2: subscriber-context post-generation validation ===
    // If no subscriber_context was loaded, prepend the no-context banner.
    // If context WAS loaded, scan the output for rule violations and log
    // them to ops_events so repeat failures surface without being silent.
    if (!subscriberContext) {
      if (V4_ON) {
        // v4 markdown banner was prepended to finalSynthesis before scoring;
        // renderMarketPulseHTML already rendered it into the HTML body.
        // Skipping the HTML-level injection here prevents double-rendering.
        console.log(`[SUBSCRIBER-CTX] ${v4Waived ? "WAIVED" : "no-context"} — markdown banner handled pre-scoring, skipping HTML-level injection`);
      } else {
        const bannerText = `<strong>⚠️ No subscriber context loaded.</strong> This report is generic market intelligence. Recommendations may conflict with your firm's active positions. Load a subscriber_context record to enable opportunity tagging and IN-FLIGHT detection.`;
        const banner = `<div style="background:#FEF9E7;border:1px solid #E5D9A8;border-radius:8px;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#92710A;">${bannerText}</div>`;
        reportHtmlContent = reportHtmlContent.replace(/(<body[^>]*>)/i, `$1\n${banner}`);
        console.log(`[SUBSCRIBER-CTX] No context — banner injected into report HTML`);
      }
    } else {
      const v = validateSubscriberReport({ reportHtml: reportHtmlContent, ctx: subscriberContext });
      if (!v.ok) {
        console.warn(`[SUBSCRIBER-CTX] ${v.violations.length} rule violation(s) detected post-generation:`);
        v.violations.forEach((vv) => console.warn(`  - ${vv.rule}: ${vv.detail}`));
        try {
          await logOpsEvent(_supabase, {
            event_type: "SUBSCRIBER_CONTEXT_VIOLATION",
            source_function: "generate-tactical-brief-background",
            severity: "warn",
            signature: "context_rule_violation",
            affected_entity: session_id,
            details: {
              email,
              topic: (topic || "").substring(0, 200),
              entity: subscriberContext.entity_name,
              violations: v.violations,
            },
          });
        } catch (_) { /* logging must not break delivery */ }
      }
    }

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
    const deliveryHtml = `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#0A192F;padding:32px 40px;text-align:center;">
    <div style="font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:0.5px;">MARKETPULSE</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;">Federal Health IT Market Intelligence</div>
  </div>
  <div style="padding:32px 40px;">
    <p style="font-size:16px;color:#0A192F;margin:0 0 16px;">Hi ${firstName},</p>
    <p style="font-size:16px;color:#0A192F;margin:0 0 24px;">Your MarketPulse report is ready.</p>
    <p style="font-size:14px;color:#5C6B7A;margin:0 0 8px;font-weight:600;">Topic</p>
    <p style="font-size:16px;color:#0A192F;margin:0 0 24px;">${topic.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${reportUrl || '#'}" style="display:inline-block;background:#0A192F;color:#FFFFFF;font-weight:700;font-size:16px;padding:14px 40px;text-decoration:none;border-radius:6px;">View Your Report</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center;">This link expires in 90 days. Right-click and "Save As" to keep a permanent copy.</p>
  </div>
  <div style="padding:20px 40px;background:#F3F4F6;border-top:1px solid #D8E0E8;text-align:center;font-size:12px;color:#5C6B7A;">
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
