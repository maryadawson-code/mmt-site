// ============================================================
// contract-intel-refresh.js — Netlify Scheduled Function
//
// Daily at 6 AM ET (11:00 UTC): researches each contract in
// contracts.json using Claude API with web_search tool, then
// stores structured intel + BLACK HAT analysis in Supabase.
//
// Schedule configured in netlify.toml:
//   [functions."contract-intel-refresh"]
//     schedule = "0 11 * * *"
// ============================================================

const { createClient } = require("@supabase/supabase-js");

// --- Constants ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const NETLIFY_BUILD_HOOK_URL = process.env.NETLIFY_BUILD_HOOK_URL;

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 16000;

// The 10 contracts — matches contracts.json at repo root
const CONTRACTS = [
  {
    name: "MHS GENESIS (Electronic Health Record)",
    agency: "Defense Health Agency (DHA)",
    vendor: "Leidos / Oracle Health (Cerner)",
    value: "$4.3B (initial)",
    description: "DoD enterprise EHR deployment replacing AHLTA/CHCS across all Military Treatment Facilities worldwide.",
  },
  {
    name: "Community Care Network (CCN) Next Gen",
    agency: "Defense Health Agency (DHA)",
    vendor: "TBD (solicitation phase)",
    value: "Est. $65B+ (multi-region)",
    description: "Next-generation managed care support contracts replacing current TRICARE regional contracts (East/West).",
  },
  {
    name: "T-5 BPA (IT Services)",
    agency: "Department of Veterans Affairs",
    vendor: "Multiple award BPA holders",
    value: "$22.3B ceiling",
    description: "VA's primary IT services vehicle for enterprise infrastructure, cybersecurity, and digital transformation.",
  },
  {
    name: "Federal Electronic Health Record Modernization (FEHRM)",
    agency: "DoD / VA Joint Program",
    vendor: "Oracle Health (Cerner)",
    value: "$16B+ (combined DoD/VA)",
    description: "Joint DoD-VA effort to deploy a single, common federal EHR for seamless health data sharing between departments.",
  },
  {
    name: "VA EHR Modernization (EHRM)",
    agency: "Department of Veterans Affairs",
    vendor: "Oracle Health (Cerner)",
    value: "$10B+",
    description: "VA's enterprise EHR modernization program, currently paused at some sites pending performance improvements.",
  },
  {
    name: "TRICARE Managed Care Support (MCS) Contracts",
    agency: "Defense Health Agency (DHA)",
    vendor: "Humana Military (East), Health Net Federal Services (West)",
    value: "$55B+ (combined historical)",
    description: "Current regional managed care support contracts for TRICARE beneficiaries, to be replaced by CCN Next Gen.",
  },
  {
    name: "Enterprise Intelligence & Data Solutions (EIDS)",
    agency: "Defense Health Agency (DHA)",
    vendor: "Multiple award",
    value: "$650M ceiling",
    description: "DHA analytics and data solutions contract for health surveillance, population health, and operational intelligence.",
  },
  {
    name: "Defense Health Agency Telehealth Programs",
    agency: "Defense Health Agency (DHA)",
    vendor: "Multiple vendors",
    value: "Various task orders",
    description: "Telehealth expansion across the Military Health System including virtual health platforms and remote monitoring.",
  },
  {
    name: "VA Health Connect",
    agency: "Department of Veterans Affairs",
    vendor: "Multiple vendors",
    value: "TBD",
    description: "VA's next-generation telehealth and virtual care platform consolidating multiple legacy telehealth systems.",
  },
  {
    name: "Military Health System Enterprise Imaging",
    agency: "Defense Health Agency (DHA)",
    vendor: "Multiple vendors",
    value: "Various",
    description: "Enterprise-wide medical imaging modernization including PACS, VNA, and AI-assisted diagnostic imaging.",
  },
];

// --- System Prompts ---
const RESEARCH_PROMPT = `You are a federal procurement intelligence analyst specializing in defense health and federal health IT contracts. You have access to web search to research contracts thoroughly.

Your task: Research the given contract using web search. Make 3-5 targeted searches (no more than 5) to build a focused picture:

1. Current contract status and recent news
2. Incumbent performance issues or GAO findings
3. Upcoming recompete, option decisions, or competitor positioning
4. Protest history and agency strategic direction

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

If you cannot find authoritative evidence for a claim, either omit it or include it with low confidence (under 50%) and explain why in verification_notes.

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

Be concise. Focus on the highest-impact claims. If the research looks solid, say so — do not manufacture doubt.

Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;


// ============================================================
// HELPER: Call Claude API and parse JSON response
// ============================================================

async function callClaude(systemPrompt, userMessage, maxSearches) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  let finalData = await response.json();

  // Handle pause_turn: resume if the server-side tool loop hit its limit
  if (finalData.stop_reason === "pause_turn") {
    const resumeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: finalData.content },
          { role: "user", content: "Return the final JSON now." },
        ],
      }),
    });
    if (resumeResponse.ok) {
      finalData = await resumeResponse.json();
    }
  }

  const allContent = finalData.content;

  // Extract text blocks
  let textBlocks = allContent
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip <cite> tags that web_search injects
  textBlocks = textBlocks.replace(/<cite[^>]*>/g, "").replace(/<\/cite>/g, "");

  // Extract web search source URLs
  const searchSources = [];
  for (const block of allContent) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.type === "web_search_result" && result.url) {
          searchSources.push(result.url);
        }
      }
    }
  }

  // Clean up common JSON issues from Claude responses
  function cleanJson(str) {
    // Remove trailing commas before } or ]
    str = str.replace(/,\s*([\]}])/g, "$1");
    // Remove control characters that break JSON (except newlines in strings handled by JSON.parse)
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
  const parsed = extractJsonString(textBlocks);
  if (!parsed) {
    // Log a snippet for debugging
    console.error("JSON parse failed. First 500 chars:", textBlocks.substring(0, 500));
    console.error("Last 500 chars:", textBlocks.substring(Math.max(0, textBlocks.length - 500)));
    throw new Error(`Could not parse JSON from Claude response (${textBlocks.length} chars)`);
  }

  return { parsed, searchSources };
}


// ============================================================
// RESEARCH A SINGLE CONTRACT (Pass 1: Research + Pass 2: Verify)
// ============================================================

async function researchContract(contract) {
  // --- Pass 1: Research ---
  console.log(`  [${contract.name}] Pass 1: Research...`);
  const researchMessage = `Research this federal contract thoroughly using web search:

CONTRACT: ${contract.name}
AGENCY: ${contract.agency}
CURRENT VENDOR: ${contract.vendor}
VALUE: ${contract.value}
DESCRIPTION: ${contract.description}

Search multiple sources (SAM.gov, FPDS, FedScoop, NextGov, Defense One, GovExec, agency websites, GAO, CRS) to build comprehensive intelligence. Include confidence percentages on every claim. Return the JSON object with "intel", "black_hat", and "sources" keys.`;

  const { parsed: research, searchSources: researchSources } = await callClaude(
    RESEARCH_PROMPT, researchMessage, 5
  );

  // Ensure confidence fields exist with defaults
  const intel = research.intel || {};
  const blackHat = research.black_hat || {};
  if (!intel.confidence_score) intel.confidence_score = 50;
  if (!intel.verification_notes) intel.verification_notes = [];
  if (!blackHat.confidence_score) blackHat.confidence_score = 50;

  // Merge research sources
  const allSources = [...new Set([...(research.sources || []), ...researchSources])];

  // --- Pass 2: Verification ---
  console.log(`  [${contract.name}] Pass 2: Verification...`);
  try {
    const verifyMessage = `Verify this intelligence research on the following contract. Challenge the claims, look for contradictions, and check key facts.

CONTRACT: ${contract.name}
AGENCY: ${contract.agency}

RESEARCH TO VERIFY:
${JSON.stringify({ intel, black_hat: blackHat }, null, 2)}

Use web search to spot-check the most important claims: dollar amounts, dates, contract actions, organizational roles, and any claims rated below 70% confidence. Return the verification JSON.`;

    const { parsed: verification, searchSources: verifySources } = await callClaude(
      VERIFY_PROMPT, verifyMessage, 3
    );

    // Apply verification adjustments
    if (verification.intel_confidence_score) {
      intel.confidence_score = verification.intel_confidence_score;
    }
    if (verification.black_hat_confidence_score) {
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

    // Merge verification notes
    const existingNotes = intel.verification_notes || [];
    const verifyNotes = verification.verification_notes || [];
    const contradictions = (verification.contradictions_found || []).map(
      (c) => `CONTRADICTED: ${c.claim} — ${c.contradiction}`
    );
    intel.verification_notes = [...existingNotes, ...verifyNotes, ...contradictions];

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
  };
}


// ============================================================
// MAIN HANDLER
// ============================================================

exports.handler = async (event) => {
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

  // If force_contract is set, only process that one contract
  const contractsToProcess = forceContract
    ? CONTRACTS.filter((c) => c.name === forceContract)
    : CONTRACTS;

  if (forceContract && contractsToProcess.length === 0) {
    console.error(`Contract not found: ${forceContract}`);
    return { statusCode: 404, body: JSON.stringify({ error: "Contract not found" }) };
  }

  // Process contracts sequentially to avoid rate limits
  for (const contract of contractsToProcess) {
    // Skip contracts that already have fresh data (unless force-refreshing)
    if (!forceContract && freshContracts.has(contract.name)) {
      console.log(`Skipping (fresh): ${contract.name}`);
      successCount++;
      continue;
    }

    try {
      console.log(`Researching: ${contract.name}...`);
      const result = await researchContract(contract);

      // Upsert into contract_intel table
      const { error: upsertErr } = await supabase
        .from("contract_intel")
        .upsert(
          {
            contract_name: contract.name,
            intel: result.intel,
            black_hat: result.black_hat,
            sources: result.sources,
            last_updated: new Date().toISOString(),
            model_used: MODEL,
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

  // Trigger site rebuild if any contracts were updated
  if (successCount > 0 && NETLIFY_BUILD_HOOK_URL) {
    try {
      await fetch(NETLIFY_BUILD_HOOK_URL, { method: "POST" });
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
