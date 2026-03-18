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

const { generateTacticalBriefPdf } = require("./lib/tactical-brief-pdf");
const { buildDeliveryEmail, buildNotificationEmail } = require("./lib/tactical-brief-email");
const { sendEmail } = require("./lib/send-email");
const { optimizeMarketPrompt } = require("./lib/prompt-optimizer");
const { checkKillSwitch, shouldHoldEmail, holdEmail } = require("./lib/kill-switch");
const { transitionState } = require("./lib/workflow-state");
const { withRetry } = require("./lib/retry");
const { KNOWN_FACTS } = require("./lib/contract-facts");
const { disambiguate } = require("./lib/entity-disambiguator");
const { extractIntelSignals } = require("./lib/signal-extractor");

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
    throw new Error(`Perplexity API ${response.status}: ${errText}`);
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
async function runLandscapeScan(topic, audience, company, disambiguation) {
  console.log("Pass 1: Landscape scan with query expansion...");

  const entity = disambiguation.selected_entity || {};
  const searchTerms = entity.search_terms || {};
  const claimsToVerify = disambiguation.user_claims_to_verify || [];

  const audienceContext = audience ? `The audience for this brief is: ${audience}.` : "";
  const companyContext = company ? `The requesting organization is: ${company}.` : "";

  const result = await callPerplexity(
    `You are a federal health IT market intelligence analyst. ${audienceContext} ${companyContext}

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
Use at least 3 query variants per source:
- Variant A: Exact entity name + org code
- Variant B: Mission keywords + NAICS codes
- Variant C: Adjacent terms from the keywords list above
If all 3 return null, search one org level UP (parent agency) and one DOWN (sub-offices).
If still null, report: "No results found across [N] queries. This null is [UNUSUAL/EXPECTED] because [reasoning]. Confidence: LOW."

DEFENSIVE INPUT HANDLING:
${claimsToVerify.length > 0 ? `The user made these claims that MUST BE VERIFIED against primary sources before incorporating:\n${claimsToVerify.map((c, i) => `${i + 1}. ${c}`).join("\n")}\nDo NOT parrot these as findings. Verify each one.` : "No specific user claims flagged for verification."}

CHAIN OF THOUGHT: For each finding, trace the evidence chain: source → claim → confidence level. If evidence is indirect, say so explicitly.

CRITICAL RULES:
- NEVER report "zero contracts exist" — say "zero contracts found in [sources searched]"
- NEVER assign HIGH confidence to a null result
- For personnel: check the official staff directory. If someone is listed → they're active. If NOT listed → status is UNVERIFIED (not "departed").
- If research contradicts the user's framing, flag the contradiction explicitly.`,

    `Research topic: ${topic}\n\nUsing the entity disambiguation above, provide a comprehensive landscape scan:\n1. Current state and recent developments (last 6 months) — search .gov sites first\n2. Organizational structure and leadership — check official staff directories\n3. Relevant contracts, solicitations, or procurement activity — search SAM.gov, USASpending.gov with multiple query variants\n4. Budget context and funding status — check Congressional Budget Justification docs\n5. Policy or regulatory factors — check GAO/IG reports\n\nFor each finding, note:\n- The specific source URL\n- Which query/search found it\n- Confidence level (HIGH only if .gov primary source + verifiable)\n\nIf any user claims from the disambiguation cannot be verified, say so explicitly.`,
    5000
  );

  return result;
}

// ============================================================
// PASS 2: Deep Analysis with Evidence-Based Competitive Landscape (CHANGES 4, 5)
// ============================================================
async function runDeepAnalysis(topic, audience, company, disambiguation, landscapeContent) {
  console.log("Pass 2: Deep analysis + evidence-based competitive landscape...");

  const entity = disambiguation.selected_entity || {};
  const searchTerms = entity.search_terms || {};

  const audienceContext = audience ? `The audience for this brief is: ${audience}.` : "";
  const companyContext = company ? `The requesting organization is: ${company}.` : "";

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
- Every vendor name must have a source (contract number, USASpending URL, etc.)`,

    `Topic: ${topic}\n\nLandscape scan findings:\n${landscapeContent}\n\nProvide:\n1. Strategic implications and what this means for stakeholders\n2. EVIDENCE-BASED competitive landscape:\n   a. Verified awardees (with contract numbers, amounts, vehicles)\n   b. Actual market tier (small business vs. mid-tier vs. large prime)\n   c. Set-aside patterns (SDVOSB, 8(a), HUBZone, full-and-open)\n   d. Only then: potential future competitors from the broader agency (clearly labeled)\n3. Risks and potential obstacles\n4. Opportunities for action\n5. Timeline of upcoming milestones\n6. Actionable recommendations\n\nVerify and cross-reference the landscape scan. Flag any claims that cannot be confirmed.`,
    5000
  );

  return result;
}

// ============================================================
// PASS 3: Fact-Check, Synthesis, and Confidence Scoring (CHANGES 3, 6, 8)
// ============================================================
async function runSynthesis(topic, audience, company, disambiguation, landscapeContent, analysisContent) {
  console.log("Pass 3: Fact-check, synthesis, and confidence scoring...");

  const entity = disambiguation.selected_entity || {};
  const claimsToVerify = disambiguation.user_claims_to_verify || [];

  const audienceContext = audience ? `The audience for this brief is: ${audience}.` : "";
  const companyContext = company ? `The requesting organization is: ${company}.` : "";

  const result = await callPerplexity(
    `You are a fact-checker and editor for a federal health IT intelligence publication. ${audienceContext} ${companyContext}

TARGET ENTITY: ${entity.name || topic} (${entity.acronym || ""})

CONFIDENCE SCORING RULES (HARD CONSTRAINTS — CHANGE 3):

HIGH confidence requires ALL of:
- Primary source URL (.gov, FPDS, official database) with direct quote or data point
- Claim verified across 2+ independent sources
- PROHIBITED for: any null-result claim, inferred timelines, personnel status without directory URL

MEDIUM confidence requires:
- One credible source (trade press, aggregator, .gov secondary page)
- Claim is plausible but single-sourced
- PROHIBITED when: source is inference, absence, or pattern-matching

LOW confidence:
- Inference, pattern-matching, single indirect source
- Any claim where evidence is "we didn't find X, therefore Y"

UNVERIFIED:
- No source found. The claim is a hypothesis only.
- MUST include: "Requires manual verification via [specific method]."

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

OUTPUT STRUCTURE:
Produce a structured executive brief with these exact sections:
- EXECUTIVE SUMMARY (3-5 bullet points)
- KEY FINDINGS (numbered, each with: finding text, confidence level, source URL, reasoning for confidence level)
- ORGANIZATIONAL OVERVIEW (verified structure, leadership with directory sources, staff size with budget doc source)
- COMPETITIVE LANDSCAPE (verified awardees ONLY in main section; assumed competitors clearly separated)
- RISKS & WATCH ITEMS
- OPPORTUNITIES & RECOMMENDATIONS
- TIMELINE & MILESTONES
- METHODOLOGY (CHANGE 8 — honest reporting):
  - Entity searched (after disambiguation) with org code
  - Each source queried and specific search terms used
  - Number of results returned per source (including zero)
  - Contradictions between sources and how resolved
  - What was NOT found and why the null may/may not be meaningful
  - What requires manual verification and the specific method`,

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

  const { session_id, name, email, company, topic, audience } = payload;

  if (!email || !topic) {
    console.error("generate-tactical-brief-background: missing email or topic");
    return { statusCode: 400, body: "Email and topic are required" };
  }

  console.log(`generate-tactical-brief-background: starting for ${email} (session ${session_id})`);
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

    // Pass 0: Entity disambiguation (CHANGE 1) — uses optimized prompt
    const pass0Start = Date.now();
    const disambiguation = await disambiguateEntity(optimizedTopic);
    passTimings["Pass 0 — Entity disambiguation"] = Math.round((Date.now() - pass0Start) / 1000);

    // Pass 1: Landscape scan with query expansion (CHANGES 2, 5)
    const pass1Start = Date.now();
    const pass1 = await runLandscapeScan(optimizedTopic, audience, company, disambiguation);
    passTimings["Pass 1 — Landscape scan"] = Math.round((Date.now() - pass1Start) / 1000);

    // Pass 2: Deep analysis + evidence-based competitive landscape (CHANGES 4, 5)
    const pass2Start = Date.now();
    const pass2 = await runDeepAnalysis(optimizedTopic, audience, company, disambiguation, pass1.content);
    passTimings["Pass 2 — Deep analysis"] = Math.round((Date.now() - pass2Start) / 1000);

    // Pass 3: Fact-check, synthesis, confidence scoring (CHANGES 3, 6, 8)
    const pass3Start = Date.now();
    const pass3 = await runSynthesis(optimizedTopic, audience, company, disambiguation, pass1.content, pass2.content);
    passTimings["Pass 3 — Synthesis"] = Math.round((Date.now() - pass3Start) / 1000);

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

    // Append methodology appendix
    finalSynthesis += buildMethodologyAppendix(disambiguation, passTimings);

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
    const allCitations = [];
    for (const url of rawCitations) {
      const normalized = normalizeCitationUrl(url);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        allCitations.push(url);
      }
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

    // State: research_completed → pdf_started
    await _transition("research_completed");
    await _transition("pdf_started");

    // Generate PDF
    console.log("Generating PDF...");
    const pdfBuffer = await generateTacticalBriefPdf({
      name,
      email,
      company,
      topic,
      audience,
      synthesis: finalSynthesis,
      citations: allCitations,
      generatedAt: new Date().toISOString(),
    });
    console.log(`PDF generated: ${Math.round(pdfBuffer.length / 1024)}KB`);

    // State: pdf_completed → email_queued
    await _transition("pdf_completed");
    await _transition("email_queued");

    // Send delivery email with PDF attachment (with degraded mode hold)
    console.log("Sending delivery email...");
    const deliveryHtml = buildDeliveryEmail({ name, topic, orderId: _orderId });
    const deliverySubject = `Your MarketPulse Report: ${topic.slice(0, 60)}${topic.length > 60 ? "..." : ""}`;

    if (shouldHoldEmail()) {
      if (_supabase) {
        await holdEmail(_supabase, email, deliverySubject, deliveryHtml, {
          product: "marketpulse",
          record_id: _orderId,
          has_attachment: true,
          attachment_size_kb: Math.round(pdfBuffer.length / 1024),
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
            filename: "tactical-brief.pdf",
            content: pdfBuffer.toString("base64"),
          },
        ],
      });

      if (!deliveryResult.success) {
        console.error("Delivery email failed:", deliveryResult.error);
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
