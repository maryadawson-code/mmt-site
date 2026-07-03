// ============================================================
// contract-intel-refresh-background.js — Netlify Background Function
//
// Daily at 6 AM ET (11:00 UTC): researches each contract in
// contracts.json using Claude API (Sonnet + web_search tool),
// then stores structured intel + BLACK HAT analysis
// in Supabase.
//
// Schedule configured in netlify.toml:
//   [functions."contract-intel-refresh"]
//     schedule = "0 11 * * *"
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getModelConfig } = require("./lib/model-router");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");
const { withRetry } = require("./lib/retry");
const { validateContract, checkStalePatterns } = require("./lib/contract-validator");
const { KNOWN_FACTS } = require("./lib/contract-facts");
const { routeToReviewQueue, logAccuracy, updateSourceReliability, adjustThreshold } = require("./lib/confidence-engine");
const { logOpsEvent } = require("./lib/ops-ledger");
const { checkKillSwitch } = require("./lib/kill-switch");
const { checkFreshness } = require("./lib/stale-detector");
const { disambiguate } = require("./lib/entity-disambiguator");
const { trackAnthropic } = require("./lib/cost-tracker");
const { getRefreshRoster } = require("./lib/refresh-roster");
const { validateSources } = require("./lib/url-validator");
const { sanitizeNotes, strippedNotes } = require("./lib/intel-notes-sanitizer");

// --- Module-scoped state for cost tracking ---
let _supabaseRef = null;

// --- Constants ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NETLIFY_BUILD_HOOK_URL = process.env.NETLIFY_BUILD_HOOK_URL;

// Netlify background functions are hard-killed at 15 min. With a 55-contract
// roster each doing 2 slow Claude/Perplexity calls sequentially, the loop can
// blow past that wall and get killed mid-pass — rows already upserted stay
// fresh, but the end-of-run completion log (logOpsEvent contract_data_refresh)
// never fires and, being a platform timeout, leaves NO exception in ops_events.
// A self-imposed wall-clock budget lets the function break the loop cleanly and
// reach its completion log every run; contracts not reached are picked up next
// run via the 20h-fresh skip below (continuation is already designed for).
const RUN_BUDGET_MS = 13 * 60 * 1000;

// Refresh roster is derived from contracts.json at runtime via
// getRefreshRoster() — see _UNUSED_LEGACY_CONTRACTS below for the old
// hardcoded list kept only for reference until the next cleanup pass.
// MMT-INTEL-02. HELM/SCMDSO was missing from the legacy array; with
// the new roster source any contracts.json entry (status !== 'archived')
// is automatically picked up.
const _UNUSED_LEGACY_CONTRACTS = [
  {
    name: "HCDS - Health Care Delivery Solutions (MHS GENESIS Follow-On)",
    agency: "Defense Health Agency (DHA) / PEO DHMS",
    vendor: "TBD — Leidos holds $1.4B+ sole-source bridge through ~2028",
    value: "TBD (predecessor DHMSM: $5.5B; bridge: $1.4B+)",
    description: "Competitive follow-on to DHMSM. Dec 2025 draft MOSA contract strategy splits into 3 vehicles: (1) PMO/SI, (2) Product/Software (likely Oracle direct), (3) Service/OCM/Analytics. RFI close Aug 30, 2026. PAE restructuring moves HCDS under Phase 2 Software portfolio. Industry feedback under extended review since Jan 9, 2026.",
    research_focus: "Check SAM.gov HT003826X0000 for any government updates after Feb 20, 2026. Look for PAE Phase 2 establishment. Track Leidos bridge task order activity on USASpending. Check if draft RFP has been released. Look for small business set-aside signals on Vehicle 3.",
  },
  {
    name: "VA EHRM (Electronic Health Record Modernization)",
    agency: "Department of Veterans Affairs",
    vendor: "Oracle Health (Cerner)",
    value: "$37.2B lifecycle estimate",
    description: "6 of 164 VA medical centers live. April 2026: 4 Michigan sites (Detroit, Saginaw, Ann Arbor, Battle Creek). 826 major incidents since first go-live. 13% staff believe system efficient (GAO). Budzinski bill proposes 2-year Oracle restriction clock. 30% of $3.4B FY2026 funding withheld until July 1. Oracle facing 20-30% layoffs.",
    research_focus: "Track April 2026 Michigan go-live outcomes (success or failure). Check Budzinski bill committee progress. Look for GAO or VA IG reports on EHRM. Track Oracle Health layoff confirmations. Check if July 1 funding withhold conditions are being met. Look for new SDVOSB task orders for OCM or IV&V support.",
  },
  {
    name: "Community Care Network Next Gen (CCN NG)",
    agency: "Department of Veterans Affairs",
    vendor: "TBD — proposals due April 3, 2026",
    value: "Est. $65B+ (multi-region IDIQ)",
    description: "Solicitation 36C10G26R0003. Multiple-Award IDIQ replacing CCN regional contracts. Binary past performance gate: multi-state coverage. Connected to Bi-Directional Imaging (36C10B26Q0076).",
    research_focus: "Check SAM.gov for amendment or deadline extension past April 3. Track award announcements. Look for protest filings after award. Check if Bi-Directional Imaging solicitation has been released.",
  },
  {
    name: "T4NG2 (VA IT Services)",
    agency: "Department of Veterans Affairs / VA TAC",
    vendor: "30+ awardees (21 SDVOSBs; Booz Allen, SAIC, Leidos, GovCIO, Cognosante MVH)",
    value: "$60.7B ceiling (10-year)",
    description: "VA's primary IT vehicle. 31 protests, 3 prevailed (Taurian, Technatomy, Peregrin). Task orders began March 2026. Booz Allen captured ~$4B of T4NG. SDVOSB eligibility must be maintained through award date (GAO ruling).",
    research_focus: "Track first T4NG2 task order awards and values. Check for new SDVOSB-specific task orders. Monitor remaining protest resolution. Look for EHRM-adjacent or AI/analytics task orders flowing through T4NG2.",
  },
  {
    name: "Enterprise Intelligence & Data Solutions (EIDS)",
    agency: "Defense Health Agency (DHA) / PEO DHMS",
    vendor: "SpinSys-Diné ($35M PMO, 8(a) tribal), Koniag Government Services (AWS cloud, 8(a))",
    value: "Multiple vehicles (PMO: $35M; AWS cloud: values vary)",
    description: "DHA enterprise data/analytics PMO. MHS Information Platform (MIP) on AWS GovCloud serves 20,000+ users. Operation Helios migrated 1PB (MDR + M2). AOI 4 canceled (McKinsey dispute) but requirement active. Chris Nichols leads — favors open, API-led architectures over proprietary platforms.",
    research_focus: "Check for AOI 4 re-issue signals on SAM.gov (HT003826 prefix). Track MIP platform updates or new EIDS task orders. Look for AI-on-MIP initiatives. Check if SpinSys-Diné or Koniag have new awards. Monitor for NAII AI solicitations.",
  },
  {
    name: "PEO DHMS CSO (Competitive Solutions Opening)",
    agency: "Defense Health Agency (DHA) / PEO DHMS",
    vendor: "Open competition (rolling)",
    value: "Multiple awards",
    description: "OTA pathway under 10 U.S.C. § 4022. AOI 1b (AI/ML/NLP) proposals due July 1, 2026. AOI 3 (Ambient Listening/DAX Copilot) established CSO-to-IDIQ production pathway precedent. DFARS 212.7001 innovation threshold is binary gate.",
    research_focus: "Check for new AOI announcements. Track AOI 3 award status (DAX Copilot). Look for CSO-to-production task order transitions. Check if AOI 1b deadline has been extended. Monitor for new CSO notices under HCDS framework.",
  },
  {
    name: "DHA Enterprise Generative AI",
    agency: "Defense Health Agency (DHA)",
    vendor: "Ask Sage, Inc.",
    value: "Undisclosed",
    description: "First IL5 GenAI platform for PHI in MHS. Awarded Dec 2025. DHA restricted Anthropic models — AWS Nova preferred. White House National AI Policy Framework (March 24, 2026) creates unified federal AI standard.",
    research_focus: "Track Ask Sage deployment progress and user adoption numbers. Check for competing IL5 GenAI platforms. Monitor DHA AI policy updates. Look for new AI-related CSO notices. Track White House AI policy implementation guidance.",
  },
  {
    name: "VA Health Connect / IHT 2.0",
    agency: "Department of Veterans Affairs / VHA",
    vendor: "9 IDIQ holders: Agile4Vets, Arrow ARC, Blue Water Thinking, Greenside Solutions, Prometheus, Reefpoint, Rios Partners, Titan-Auxo, Tribility",
    value: "$14B / 10-year",
    description: "100% SDVOSB set-aside IDIQ. VA's 24/7 virtual care and clinical triage. Arrow ARC captured 91% of IHT 1.0 spending. OIP task order in active procurement — final RFP expected April 7-14, 2026.",
    research_focus: "Track OIP task order RFP release and award. Check for new IHT 2.0 task order announcements. Monitor Arrow ARC/Aptive positioning. Look for VA Health Connect expansion or new service requirements.",
  },
  {
    name: "VA Enterprise Imaging (NEIS + Multi-VISN PACS + Bi-Directional)",
    agency: "Department of Veterans Affairs",
    vendor: "TBD — multiple solicitations",
    value: "$365–620M combined estimate",
    description: "Three connected procurements: NEIS (36C10X25Q0015, $300-500M, FY2027), Multi-VISN PACS (36C10X24Q0024, $50-90M, Q3 2026), Bi-Directional Imaging (36C10B26Q0076, $15-30M, Q2 2026 — most imminent). COs: Cole/Luna (SAC-F) for NEIS/PACS, Truex (TAC) for Bi-Directional.",
    research_focus: "Check SAM.gov for Bi-Directional Imaging solicitation release (most urgent). Track Multi-VISN PACS timeline. Look for NEIS draft RFP. Monitor Philips Healthcare positioning. Check for set-aside determinations.",
  },
  {
    name: "DHA Telehealth Programs",
    agency: "Defense Health Agency (DHA)",
    vendor: "Amwell + Leidos ($180M); Nurse Advice Line bridge HT001124C0011 ($24.6M)",
    value: "$204.6M combined",
    description: "Amwell Converge replacing MHS Video Connect. MHS Global Nurse Advice Line ($24.6M bridge) indicates upcoming recompete — similar to VA Health Connect. OMEIS Sources Sought (HT003824R0005) for operational tele-radiology closed June 2024, no RFP yet.",
    research_focus: "Check for OMEIS RFP release on SAM.gov. Track Nurse Advice Line recompete signals. Monitor Amwell Converge adoption metrics. Look for new DHA telehealth task orders or set-asides.",
  },
];

// --- System Prompts ---
const RESEARCH_PROMPT = `You are a federal procurement intelligence analyst who covers DHA, VA, CMS, and federal health IT contracts for an audience of defense contractors, program managers, and capture professionals. They need SPECIFIC, ACTIONABLE intelligence — not generic summaries they could get from a Google search.

Your task: Research the given contract using web search. The contract description includes a "research_focus" field with SPECIFIC things to look for. PRIORITIZE those searches.

Make 3-5 targeted searches. For each search:
- Use specific solicitation numbers, contract numbers, or SAM.gov notice IDs when provided
- Search for the exact agency + program name + year (e.g., "DHA HCDS 2026" not just "defense health IT")
- Check SAM.gov, USASpending.gov, GAO, Congressional testimony, and trade press (FedScoop, Nextgov/FCW, MeriTalk, Healthcare IT News, GovExec)

What makes intel USEFUL vs GENERIC:
- USEFUL: "GAO-26-107 published March 15 found Oracle missed 4 of 7 SLA metrics at Spokane VA. VA IG investigation ongoing."
- GENERIC: "The program faces performance challenges according to reports."
- USEFUL: "SAM.gov HT003826X0000 updated Feb 20, 2026 with revised Vehicle 3 scope — now explicitly includes AI analytics as a standalone CLIN."
- GENERIC: "The government is planning a competitive follow-on."
- USEFUL: "T4NG2 task order HT0038-26-F-0012 awarded to GovCIO ($14.2M, SDVOSB set-aside) for EHRM helpdesk modernization."
- GENERIC: "Task orders are beginning to flow."

Always include: exact dates, dollar amounts, solicitation/contract numbers, named people (COs, program managers), and source URLs. If you can't find specifics, say so — don't fill the gap with vague language.

Be efficient — synthesize from your search results quickly. Do not do exhaustive research. Focus on the most important and recent developments.

Then produce a brief BLACK HAT competitive intelligence assessment:
- Where are the incumbents vulnerable?
- What protest grounds exist?
- What recompete threats and competitive moves are in play?

CRITICAL — CONFIDENCE RATINGS:
You MUST assign a confidence percentage (0-100) to every factual claim. Base confidence on:
- Source quality: Government sources (SAM.gov, GAO, CRS, agency press releases) = higher confidence. Trade press (FedScoop, NextGov, Defense One) = medium. Blogs, undated articles, unnamed sources = lower confidence.
- Corroboration: Claims confirmed by 2+ independent sources = higher. Single-source claims = lower.
- Recency: Recent articles (within 6 months) = higher for current-state claims. Older articles = lower for anything time-sensitive.
- Specificity: Exact dollar amounts, dates, contract numbers from official sources = high. Vague or estimated figures = lower.

REASONING TRACE: For each data point, briefly note the source quality and recency. Reasoning lives in the per-claim "source_type" + "confidence" fields, NOT in verification_notes.

If you cannot find authoritative evidence for a claim, OMIT the claim. Do not write notes like "I could not verify" or "this is unconfirmed from the provided results" — those phrases leak chain-of-thought to the subscriber and have been filtered out automatically since 2026-05-26.

VERIFICATION_NOTES IS CUSTOMER-FACING. Treat it like a footnote a paid subscriber will read. Rules:
- At most 3 items.
- Each item ≤ 25 words.
- State what is confirmed, what is contextual, or what a competing source says — never your own uncertainty or research process.
- Do NOT use the words "I", "could not", "out of date", "prior statement", "from the provided results", "partially unconfirmed", or the prefix "CONTRADICTED:". The sanitizer strips lines containing any of those phrases.

Return a JSON object with three top-level keys: "intel", "black_hat", and "sources".

The "intel" object must have this structure:
{
  "confidence_score": 75,
  "summary": "2-3 paragraph executive overview of current state",
  "key_developments": [
    { "date": "YYYY-MM-DD or YYYY-MM or YYYY-QN", "headline": "Short headline", "detail": "1-2 sentence detail", "confidence": 85, "source_type": "government|trade_press|industry|unverified" }
  ],
  "competitors": [
    { "name": "Company Name", "role": "incumbent/challenger/teaming", "position": "1-2 sentence positioning", "confidence": 70 }
  ],
  "timeline": [
    { "date": "YYYY-QN or YYYY-MM", "event": "What happens", "significance": "Why it matters", "confidence": 60 }
  ],
  "financials": "Contract value context, modifications, ceiling changes (1-2 sentences)",
  "financials_confidence": 80,
  "risks": ["Risk 1", "Risk 2"],
  "opportunities": ["Opportunity 1", "Opportunity 2"],
  "small_business": {
    "opportunities": ["Description of small business opportunity 1", "Description of small business opportunity 2"],
    "set_aside_types": ["SDVOSB", "8(a)"],
    "subcontracting_note": "Brief note about subcontracting plans or requirements"
  },
  "verification_notes": ["Note about unverified claims", "Note about conflicting sources"]
}

The "black_hat" object must have this structure:
{
  "confidence_score": 65,
  "summary": "1-paragraph competitive threat assessment",
  "incumbent_vulnerabilities": [
    { "issue": "The vulnerability", "evidence": "Supporting evidence", "exploit_angle": "How a competitor could exploit this", "confidence": 70 }
  ],
  "protest_risks": [
    { "scenario": "What could be protested", "likelihood": "high/medium/low", "basis": "Legal or procedural basis", "confidence": 55 }
  ],
  "recompete_threats": [
    { "threat": "The threat", "timeline": "When", "impact": "What it means", "confidence": 60 }
  ],
  "competitive_moves": [
    { "competitor": "Company", "action": "What they did/are doing", "implication": "What it means for the contract", "confidence": 65 }
  ],
  "hidden_risks": [
    { "risk": "The risk", "detail": "Why it matters", "confidence": 50 }
  ],
  "bottom_line": "One sentence: what a smart competitor does right now"
}

The "sources" array should list all URLs you consulted during research.

CRITICAL GUARDRAILS:
- NEVER use "T-5 BPA" — correct name is T4NG / T4NG2.
- TRICARE West vendor is TriWest Healthcare Alliance, NOT Health Net Federal.
- CIO-SP4 was cancelled February 2026 — do not list as active.
- VA EHRM is resuming April 2026, NOT paused.
- Always include source URL for every data point.
- If confidence < 70%, set needs_verification: true.
- If zero results for a known contract, return stale_since flag, NOT deletion.

Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;

const VERIFY_PROMPT = `You are a senior fact-checker and intelligence verification analyst. Your job is to CHALLENGE and VERIFY the research provided below. You are adversarial — assume claims may be wrong until proven right.

Using web search, make 2-3 targeted searches to specifically:
1. Verify the most important factual claims (dates, dollar amounts, contract actions, organizational roles)
2. Look for CONTRADICTORY or MORE RECENT information that may invalidate the research
3. Check if any claimed future events have already occurred or been cancelled
4. Verify key names, roles, and organizational relationships

For each claim you check, either:
- CONFIRM it (raise confidence if corroborated by a new source)
- CONTRADICT it (lower confidence and explain what you found)
- UNABLE TO VERIFY (note that you found no additional evidence either way)

Return a JSON object with these keys:
{
  "intel_confidence_score": 75,
  "black_hat_confidence_score": 65,
  "adjustments": [
    { "field": "key_developments[0]", "original_confidence": 80, "adjusted_confidence": 90, "reason": "Confirmed by SAM.gov listing dated 2026-02-28" },
    { "field": "competitors[1]", "original_confidence": 70, "adjusted_confidence": 45, "reason": "Company appears to have exited this market per recent press release" }
  ],
  "contradictions_found": [
    { "claim": "The original claim", "contradiction": "What the evidence actually shows", "source": "URL" }
  ],
  "verification_notes": [
    "Note about what was verified successfully",
    "Note about what could not be independently verified"
  ],
  "sources": ["URLs consulted during verification"]
}

For each field you verify, decide CONFIRM / CONTRADICT / UNABLE-TO-VERIFY internally, then express the OUTCOME in adjustments[] and contradictions_found[]. Do NOT narrate your reasoning process into verification_notes.

VERIFICATION_NOTES IS CUSTOMER-FACING. The merge layer drops any item that contains "I could not", "out of date", "prior statement", "from the provided results", "partially unconfirmed", or starts with "CONTRADICTED:". Phrases like "I was unable" also get dropped. Write notes that read as confident editorial footnotes, e.g. "Confirmed by SAM.gov listing 2026-01-28" or "Award value cited by trade press; not yet in USASpending."

Be concise. At most 3 verification_notes items, each ≤ 25 words. If the research looks solid, say "Verified against [source]" and stop — do not manufacture doubt.

Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;


// ============================================================
// HELPER: Perplexity sonar-pro web search + JSON parse
//
// Migrated 2026-04-25 off the Anthropic Sonnet websearch tool (which
// was silently failing nightly per CLAUDE.md 2026-04-15 gotcha and
// reports/contract-intel-diagnosis-20260425.md). Mirrors the
// MarketPulse pattern in generate-tactical-brief-background.js.
//
// Function name kept as callClaudeSearch for minimal diff downstream;
// the `model` parameter is preserved but logged-only (Perplexity uses
// sonar-pro for all research calls).
// ============================================================

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar-pro";

async function callClaudeSearch(systemPrompt, userMessage, _maxSearches, model, maxTokens) {
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  if (!PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY not configured (used by contract-intel-refresh after web_search migration)");
  }

  const _costStart = Date.now();
  const response = await withRetry(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120000);
    return fetch(PERPLEXITY_URL, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        web_search_options: { search_context_size: "high" },
      }),
    }).finally(() => clearTimeout(timer));
  }, { maxRetries: 2, baseDelayMs: 3000 });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${errText}`);
  }

  const finalData = await response.json();

  if (finalData.usage) {
    const u = finalData.usage;
    console.log(`  Perplexity cost: model=${PERPLEXITY_MODEL}, input=${u.prompt_tokens || u.input_tokens}, output=${u.completion_tokens || u.output_tokens} (req model=${model})`);
  }

  // Cost tracking — best effort, never break the refresh
  try {
    if (_supabaseRef) {
      const u = finalData.usage || {};
      await trackAnthropic(_supabaseRef, {
        functionName: "contract-intel-refresh-background",
        product: "contract-intel",
        model: PERPLEXITY_MODEL,
        usage: {
          input_tokens: u.prompt_tokens || u.input_tokens || 0,
          output_tokens: u.completion_tokens || u.output_tokens || 0,
        },
        latencyMs: Date.now() - _costStart,
      });
    }
  } catch (_costErr) { /* never break contract refresh */ }

  // Perplexity returns choices[0].message.content + citations array
  const textContent = finalData.choices?.[0]?.message?.content || "";
  const searchSources = Array.isArray(finalData.citations) ? finalData.citations : [];

  // Clean up common JSON issues
  function cleanJson(str) {
    // Remove trailing commas before } or ]
    str = str.replace(/,\s*([\]}])/g, "$1");
    // Remove control characters
    str = str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    return str;
  }

  // Extract JSON string from various formats
  function extractJsonString(text) {
    // Try direct parse
    try { return JSON.parse(cleanJson(text)); } catch { /* continue */ }

    // Try markdown code fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(cleanJson(jsonMatch[1].trim())); } catch { /* continue */ }
    }

    // Try finding JSON object boundaries
    const braceStart = text.indexOf("{");
    const braceEnd = text.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      const candidate = text.substring(braceStart, braceEnd + 1);
      try { return JSON.parse(cleanJson(candidate)); } catch { /* continue */ }
    }

    return null;
  }

  // Parse JSON from text
  const parsed = extractJsonString(textContent);
  if (!parsed) {
    console.error("JSON parse failed. First 500 chars:", textContent.substring(0, 500));
    console.error("Last 500 chars:", textContent.substring(Math.max(0, textContent.length - 500)));
    throw new Error(`Could not parse JSON from Claude response (${textContent.length} chars)`);
  }

  return { parsed, searchSources };
}


// ============================================================
// RESEARCH A SINGLE CONTRACT (Pass 1: Research + Pass 2: Verify)
// ============================================================

async function researchContract(contract) {
  // --- Pass 1: Research ---
  const researchModel = await getModelConfig(null, "contract_research");
  console.log(`  [${contract.name}] Pass 1: Research (${researchModel.model})...`);
  const researchMessage = `Research this federal contract using web search. Focus on the SPECIFIC research priorities listed below.

CONTRACT: ${contract.name}
AGENCY: ${contract.agency}
CURRENT VENDOR: ${contract.vendor}
VALUE: ${contract.value}
DESCRIPTION: ${contract.description}
${contract.research_focus ? `\nRESEARCH PRIORITIES (search for these FIRST):\n${contract.research_focus}` : ''}

Search SAM.gov (Contract Opportunities + Contract Awards API), USASpending.gov, Congress.gov, GovInfo.gov, FedScoop, Nextgov/FCW, MeriTalk, Healthcare IT News, GAO, and agency sites. NOTE: FPDS was decommissioned Feb 24 2026 and the ATOM feed retires permanently July 31 2026 — the canonical award source is now SAM.gov Contract Awards API. Do NOT cite fpds.gov. Include confidence percentages on every claim. Return JSON with "intel", "black_hat", and "sources" keys.`;

  const { parsed: research, searchSources: researchSources } = await callClaudeSearch(
    RESEARCH_PROMPT, researchMessage, 5, researchModel.model, 8000
  );

  // Ensure confidence fields exist with defaults
  const intel = research.intel || {};
  const blackHat = research.black_hat || {};
  if (typeof intel.confidence_score !== 'number') intel.confidence_score = 50;
  if (!intel.verification_notes) intel.verification_notes = [];
  if (typeof blackHat.confidence_score !== 'number') blackHat.confidence_score = 50;

  // Ensure every array item has a confidence field (default 50 if missing)
  const ensureConfidence = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(item => {
      if (item && typeof item === 'object' && typeof item.confidence !== 'number') {
        item.confidence = 50;
      }
    });
  };
  ensureConfidence(intel.key_developments);
  ensureConfidence(intel.competitors);
  ensureConfidence(intel.timeline);
  ensureConfidence(blackHat.incumbent_vulnerabilities);
  ensureConfidence(blackHat.protest_risks);
  ensureConfidence(blackHat.recompete_threats);
  ensureConfidence(blackHat.competitive_moves);
  ensureConfidence(blackHat.hidden_risks);

  // Merge research sources
  const allSources = [...new Set([...(research.sources || []), ...researchSources])];

  // --- Pass 2: Verification ---
  const verifyModel = await getModelConfig(null, "contract_verify");
  console.log(`  [${contract.name}] Pass 2: Verification (${verifyModel.model})...`);
  try {
    const verifyMessage = `Verify this intelligence research on the following contract. Challenge the claims, look for contradictions, and check key facts.

CONTRACT: ${contract.name}
AGENCY: ${contract.agency}

RESEARCH TO VERIFY:
${JSON.stringify({ intel, black_hat: blackHat }, null, 2)}

Use web search to spot-check the most important claims: dollar amounts, dates, contract actions, organizational roles, and any claims rated below 70% confidence. Return the verification JSON.`;

    const { parsed: verification, searchSources: verifySources } = await callClaudeSearch(
      VERIFY_PROMPT, verifyMessage, 3, verifyModel.model, 4000
    );

    // Apply verification adjustments
    if (typeof verification.intel_confidence_score === 'number') {
      intel.confidence_score = verification.intel_confidence_score;
    }
    if (typeof verification.black_hat_confidence_score === 'number') {
      blackHat.confidence_score = verification.black_hat_confidence_score;
    }

    // Apply per-field confidence adjustments
    if (verification.adjustments && Array.isArray(verification.adjustments)) {
      for (const adj of verification.adjustments) {
        try {
          // Parse field paths like "key_developments[0]" or "competitors[2]"
          const match = adj.field.match(/^(\w+)\[(\d+)\]$/);
          if (match) {
            const [, arrayName, idx] = match;
            const target = intel[arrayName] || blackHat[arrayName];
            if (target && target[parseInt(idx)]) {
              target[parseInt(idx)].confidence = adj.adjusted_confidence;
            }
          }
        } catch { /* skip malformed adjustments */ }
      }
    }

    // 2026-05-26 (Danielle Applegate / CGI Federal): Subscriber-trust fix.
    // Pass 1 verification_notes are Claude's chain-of-thought reasoning
    // ("I couldn't verify in SAM.gov from the provided results..."). When
    // Pass 2 then DOES verify the claim, blindly concatenating both arrays
    // produced a self-contradicting block in the customer-facing rendering
    // (see js/contract-detail.js). Pass 2 is the authoritative voice — its
    // notes already encode what Pass 1 got right or wrong. Replace, don't
    // append. Surface contradictions as a separate, terse "Corrected from
    // earlier research:" line rather than the internal "CONTRADICTED:" tag.
    // All filtering goes through the shared sanitizer in
    // lib/intel-notes-sanitizer.js so the rule lives in exactly one place;
    // the contract is locked by tests/unit/intel-notes-sanitizer.test.js.
    const verifyNotes = verification.verification_notes || [];
    const contradictions = (verification.contradictions_found || []).map(
      (c) => `Corrected from earlier research: ${c.contradiction}`
    );
    const proposedNotes = [...verifyNotes, ...contradictions];
    const customerSafeNotes = sanitizeNotes(proposedNotes);
    const dropped = strippedNotes(proposedNotes);
    intel.verification_notes = customerSafeNotes;
    // Observability: when the sanitizer fires, the LLM produced
    // chain-of-thought leakage despite the tightened prompt. Surface
    // it so we can monitor regression in intel-quality-report.js.
    if (dropped.length > 0) {
      try {
        await logOpsEvent(_supabaseRef, {
          event_type: "INTEL_NOTES_SANITIZER_STRIPPED",
          source_function: "contract-intel-refresh-background",
          severity: "warn",
          signature: "verification_notes_chain_of_thought",
          details: {
            contract: contract.name,
            stripped_count: dropped.length,
            stripped_preview: dropped.slice(0, 3).map((s) => String(s).slice(0, 240)),
          },
        });
      } catch { /* non-blocking */ }
    }

    // Add verification metadata
    intel.verified = true;
    blackHat.verified = true;

    // Merge verification sources
    allSources.push(...(verification.sources || []), ...verifySources);

    console.log(`  [${contract.name}] Verified: intel=${intel.confidence_score}%, black_hat=${blackHat.confidence_score}%`);
  } catch (verifyErr) {
    console.error(`  [${contract.name}] Verification failed (using unverified research):`, verifyErr.message);
    intel.verified = false;
    blackHat.verified = false;
    intel.verification_notes.push("Verification pass failed — confidence ratings are from initial research only.");
  }

  return {
    intel,
    black_hat: blackHat,
    sources: [...new Set(allSources)],
    model_used: researchModel.model,
  };
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
  const killCheck = checkKillSwitch("contract-intel-refresh-background");
  if (killCheck.blocked) return killCheck.response;

  const runStart = Date.now();
  console.log("Contract intel refresh triggered:", new Date().toISOString());

  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY)");
    return { statusCode: 500, body: "Missing env vars" };
  }

  // Parse request body for optional force_contract parameter
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  const forceContract = body.force_contract || null;
  if (forceContract) {
    console.log(`Force-refreshing single contract: ${forceContract}`);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  _supabaseRef = supabase;

  let successCount = 0;
  let errorCount = 0;

  // Check which contracts already have fresh data (updated within last 20 hours)
  // This allows re-triggering to pick up where a timeout left off
  const { data: existing } = await supabase
    .from("contract_intel")
    .select("contract_name, last_updated");

  const freshCutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const freshContracts = new Set(
    (existing || [])
      .filter((r) => r.last_updated > freshCutoff)
      .map((r) => r.contract_name)
  );

  // Name -> last_updated lookup, reused to order the roster STALEST-FIRST
  // below. A missing entry (never refreshed) sorts oldest.
  const lastUpdatedMap = new Map(
    (existing || []).map((r) => [r.contract_name, r.last_updated || null])
  );

  // MMT-INTEL-02: Pull the roster from contracts.json instead of the
  // drifted hardcoded array. Any non-archived contracts.json entry is
  // automatically enrolled.
  const CONTRACTS = getRefreshRoster();
  console.log(`Refresh roster (from contracts.json): ${CONTRACTS.length} contracts`);

  // 2026-07-03 staleness fix: process the roster STALEST-FIRST, not in
  // contracts.json file order. Root cause of the 95-106d backlog surfaced by
  // intel-quality-report: the 13-min RUN_BUDGET only reached the first ~half
  // of the 63-contract roster, and because the 20h fresh-cutoff resets before
  // the next 24h cron, every run restarted from the top of the file — so the
  // tail of the roster starved indefinitely. Ordering by last_updated ascending
  // means each run always attacks the oldest rows first, so the full roster is
  // covered within a few runs and no row can starve. (The fresh-skip above
  // still short-circuits anything refreshed in the last 20h — those sort last.)
  const contractsToProcess = forceContract
    ? CONTRACTS.filter((c) => c.name === forceContract)
    : [...CONTRACTS].sort((a, b) => {
        const la = lastUpdatedMap.get(a.name);
        const lb = lastUpdatedMap.get(b.name);
        if (!la && !lb) return 0;
        if (!la) return -1; // never-refreshed first
        if (!lb) return 1;
        return la < lb ? -1 : la > lb ? 1 : 0; // oldest first
      });

  if (forceContract && contractsToProcess.length === 0) {
    console.error(`Contract not found: ${forceContract}`);
    return { statusCode: 404, body: JSON.stringify({ error: "Contract not found" }) };
  }

  // Process contracts sequentially to avoid rate limits
  let truncatedForBudget = false;
  for (const contract of contractsToProcess) {
    // Stop before the 15-min platform kill so the end-of-run completion log
    // still fires. Remaining contracts are refreshed on the next scheduled
    // run (the 20h-fresh skip above carries the continuation).
    if (!forceContract && Date.now() - runStart > RUN_BUDGET_MS) {
      truncatedForBudget = true;
      console.log(`Run budget (${RUN_BUDGET_MS}ms) reached — stopping loop early; remaining contracts deferred to next run.`);
      break;
    }

    // Skip contracts that already have fresh data (unless force-refreshing)
    if (!forceContract && freshContracts.has(contract.name)) {
      console.log(`Skipping (fresh): ${contract.name}`);
      successCount++;
      continue;
    }

    try {
      console.log(`Researching: ${contract.name}...`);
      const result = await researchContract(contract);

      // --- Sprint 2: Validation layer ---
      const contractData = { name: contract.name, agency: contract.agency, status: "Active", ...result.intel };
      const staleCheck = checkStalePatterns(JSON.stringify(result));
      if (staleCheck.stale) {
        console.warn(`  [${contract.name}] Stale patterns detected:`, staleCheck.corrections);
      }

      const validation = validateContract(contractData);
      if (!validation.valid) {
        console.warn(`  [${contract.name}] Validation errors:`, validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn(`  [${contract.name}] Warnings:`, validation.warnings);
      }

      // Gate 1: Check value change >20% against known facts
      const knownFactKey = Object.keys(KNOWN_FACTS).find(
        (k) => KNOWN_FACTS[k].name === contract.name
      );
      if (knownFactKey && result.intel?.financials) {
        const known = KNOWN_FACTS[knownFactKey];
        if (known.value && result.intel.financials !== known.value) {
          await routeToReviewQueue(supabase, {
            contract_id: contract.name,
            field_name: "financials",
            proposed: result.intel.financials,
            current: known.value,
            confidence: "LOW",
            reason: "Value change detected vs known facts",
          });
        }
      }

      // Gate 5: Null result on known contract — preserve last data
      if (!result.intel?.summary && knownFactKey) {
        console.warn(`  [${contract.name}] Null result on known contract — preserving last data`);
        result.intel = result.intel || {};
        result.intel.stale_since = new Date().toISOString();
      }

      // --- Change detection: diff against current Supabase data ---
      try {
        const { data: currentData } = await supabase
          .from("contract_intel")
          .select("intel")
          .eq("contract_name", contract.name)
          .single();

        if (currentData?.intel) {
          const fieldsToTrack = ["summary", "financials", "risks"];
          for (const field of fieldsToTrack) {
            const oldVal = JSON.stringify(currentData.intel[field] || "");
            const newVal = JSON.stringify(result.intel?.[field] || "");
            if (oldVal !== newVal && oldVal !== '""') {
              await supabase.from("contract_events").insert({
                contract_id: contract.name,
                field_changed: field,
                old_value: (currentData.intel[field] || "").toString().substring(0, 500),
                new_value: (result.intel?.[field] || "").toString().substring(0, 500),
                source: "contract-intel-refresh",
                confidence: String(result.intel?.confidence_score || 50),
              });
            }
          }
        }
      } catch { /* change detection is best-effort */ }

      // --- B2/B5: Accuracy logging + source reliability ---
      try {
        const knownFactKey = Object.keys(KNOWN_FACTS).find(
          (k) => KNOWN_FACTS[k].name === contract.name
        );
        if (knownFactKey && result.intel) {
          const known = KNOWN_FACTS[knownFactKey];
          // Log accuracy for value field
          if (known.value && result.intel.financials) {
            const valuesMatch = result.intel.financials.includes(known.value) || known.value.includes(result.intel.financials);
            await logAccuracy(supabase, {
              contract_id: contract.name,
              field_name: "financials",
              predicted: result.intel.financials,
              actual: known.value,
              wasCorrect: valuesMatch,
              confidence: String(result.intel.financials_confidence || result.intel.confidence_score || 50),
              source: "contract-intel-refresh",
            });
          }
          // Update source reliability for each cited domain
          for (const url of (result.sources || []).slice(0, 5)) {
            try {
              const domain = new URL(url).hostname;
              const isGov = domain.endsWith(".gov");
              await updateSourceReliability(supabase, domain, isGov || result.intel.confidence_score >= 70);
            } catch { /* skip invalid URLs */ }
          }
        }
        // Freshness check for logging
        const freshness = checkFreshness(result.intel?.last_verified || new Date().toISOString());
        if (freshness.status !== "fresh") {
          console.log(`  [${contract.name}] Freshness: ${freshness.status} (${freshness.days} days)`);
        }
      } catch (accuracyErr) {
        console.error(`  [${contract.name}] Accuracy logging failed (non-blocking):`, accuracyErr.message);
      }

      // MMT-INTEL-02: Validate source URLs before writing.
      // If zero valid sources, do NOT overwrite — keep the prior row
      // and log intel_refresh_skipped. Better to show old-but-real
      // intel than to clobber with a row whose only "evidence" is a
      // root-domain URL.
      let validatedSources = result.sources || [];
      let invalidSourcesCount = 0;
      try {
        const { valid, invalid } = await validateSources(result.sources || [], { timeoutMs: 3000 });
        validatedSources = valid;
        invalidSourcesCount = invalid.length;
        if (invalid.length > 0) {
          console.warn(`  [${contract.name}] Dropped ${invalid.length} invalid source URL(s): ${invalid.slice(0, 3).map((i) => i.reason).join(", ")}`);
        }
      } catch (urlErr) {
        console.warn(`  [${contract.name}] URL validation errored (keeping all sources): ${urlErr.message}`);
        validatedSources = result.sources || [];
      }

      if (validatedSources.length === 0 && (result.sources || []).length > 0) {
        console.warn(`  [${contract.name}] 0 valid sources after validation — skipping overwrite, preserving prior row.`);
        await logOpsEvent(supabase, {
          event_type: "intel_refresh_skipped",
          source_function: "contract-intel-refresh",
          severity: "warn",
          signature: "zero_valid_sources",
          affected_entity: contract.name,
          details: { invalid_count: invalidSourcesCount, original_count: (result.sources || []).length },
        });
        successCount++;
        continue;
      }

      // Upsert into contract_intel table
      const { error: upsertErr } = await supabase
        .from("contract_intel")
        .upsert(
          {
            contract_name: contract.name,
            intel: result.intel,
            black_hat: result.black_hat,
            sources: validatedSources,
            last_updated: new Date().toISOString(),
            model_used: result.model_used,
          },
          { onConflict: "contract_name" }
        );

      if (upsertErr) {
        console.error(`Supabase upsert error for ${contract.name}:`, upsertErr);
        errorCount++;
      } else {
        console.log(`  Updated: ${contract.name} (${result.sources.length} sources)`);
        successCount++;
      }
    } catch (err) {
      console.error(`Error researching ${contract.name}:`, err.message, err.stack);
      errorCount++;
    }
  }

  console.log(`Contract intel refresh complete: ${successCount} updated, ${errorCount} errors`);

  // B2/B5: Adjust auto-publish threshold from accumulated accuracy data
  try {
    const falsePositiveRate = errorCount / (contractsToProcess.length || 1);
    await adjustThreshold(supabase, falsePositiveRate);
  } catch (threshErr) {
    console.error("Threshold adjustment failed (non-blocking):", threshErr.message);
  }

  // Log to ops_events with cost estimate
  // Claude Sonnet + web_search: ~$3-6 per 1000 requests. 2 calls per contract (research + verify).
  const totalCalls = successCount * 2;
  const costEstimate = totalCalls * 0.005;

  await logOpsEvent(supabase, {
    event_type: "contract_data_refresh",
    source_function: "contract-intel-refresh",
    severity: errorCount > 0 ? "warn" : "info",
    details: {
      validated: successCount,
      rejected: errorCount,
      total: contractsToProcess.length,
      truncated_for_budget: truncatedForBudget,
      cost_estimate: costEstimate,
      api_calls: totalCalls,
      run_ms: Date.now() - runStart,
    },
  });

  // Trigger site rebuild if any contracts were updated
  if (successCount > 0 && NETLIFY_BUILD_HOOK_URL) {
    try {
      await fetchWithTimeout(NETLIFY_BUILD_HOOK_URL, { method: "POST" }, 10000);
      console.log("Triggered site rebuild");
    } catch (err) {
      console.error("Failed to trigger rebuild:", err.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: successCount, errors: errorCount }),
  };
};
