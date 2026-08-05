// ============================================================
// opportunity-radar-background.js — Netlify Background Function
//
// Scans for new federal health IT opportunities using Claude
// with web_search. Three sequential searches:
// 1. SAM.gov + agency sites (new solicitations, RFPs)
// 2. Trade press (FedScoop, NextGov, GovWin)
// 3. Small business set-asides
//
// Results upserted into Supabase `opportunity_radar` table.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { getModelConfig } = require("./lib/model-router");
const { withRetry } = require("./lib/retry");
const { validateOpportunity } = require("./lib/contract-validator");
const { CANCELLED_VEHICLES } = require("./lib/contract-facts");
const { checkKillSwitch } = require("./lib/kill-switch");
const { trackAnthropic } = require("./lib/cost-tracker");
const { logInference } = require("./lib/inference");
const { logOpsEvent } = require("./lib/ops-ledger");
const { sam_search_opportunities } = require("./lib/sam-gov-opportunities");
const { isMalformedSamPermalink } = require("./lib/url-validator");

// MMT-INTEL-02 (2026-05-22): migrated off Anthropic Sonnet
// web_search_20260209 → Perplexity sonar-pro. CLAUDE.md 2026-04-15
// flagged that the Anthropic web_search tool fails silently from
// serverless every few runs; the radar table confirms it: 147 rows
// total, last scan 2026-04-13, 0 in the last 30 days, ops_ledger
// has zero rows for opportunity-radar-background. Same migration
// contract-intel-refresh did April 25.
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar-pro";
const PERPLEXITY_TIMEOUT_MS = 60000;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Health IT NAICS codes
const NAICS_CODES = ["541512", "541511", "541519", "541611", "524292", "621999", "334510"];

// S-P1: optional SAM.gov direct pre-pass. Default OFF. Uses the higher-limit
// SAM_SYSTEM_ACCOUNT_API_KEY ONLY — never the shared SAM_GOV_API_KEY (small
// daily quota shared with pursuit-calendar / signal-chain / compliance-check /
// marketpulse). If the flag is off OR the system key is absent, the pre-pass
// is skipped and the existing web-search scans run unchanged (no regression).
// S-P* flags hardcoded ON. They were originally env-gated (RADAR_SAM_DIRECT,
// RADAR_REVIEW_QUEUE, RADAR_FORECAST_SCAN), then briefly consolidated into one
// var (MMT_API_ON), but the site's existing env was already at AWS Lambda's
// 4KB per-function ceiling — ANY additional env var broke every function
// upload (5/30-5/31 deploy outage). Hardcoding adds zero bytes. To disable a
// feature, change the boolean here and redeploy. SAM pre-pass still no-ops
// gracefully when SAM_SYSTEM_ACCOUNT_API_KEY is absent.
const RADAR_SAM_DIRECT = true;
const SAM_SYSTEM_ACCOUNT_API_KEY = process.env.SAM_SYSTEM_ACCOUNT_API_KEY;

// S-P2: review-queue mode. Default OFF. When on, low-confidence items
// (relevance < 50) are written with review_status='needs_review' instead of
// being dropped, and the public feed hides them (opportunity-feed.js, same
// flag). REQUIRES the review_status column (migration
// 20260529000000_opportunity_radar_review_status.sql) to be applied FIRST —
// writing that column before it exists would trip the schema law and kill
// every radar write. While OFF, the column is never referenced.
const RADAR_REVIEW_QUEUE = true;

// S-P4: optional forecast-portal scan. Default OFF (so prod behavior is
// unchanged until flipped). When on, adds a 4th web-search pass over agency
// acquisition forecasts + industry-day / sources-sought / pre-solicitation
// notices, tagging those rows source:'forecast'. Pure additive coverage — no
// schema change, no SAM key, no quota impact beyond one more Perplexity call.
const RADAR_FORECAST_SCAN = true;

// ============================================================
// System prompt for opportunity scanning
// ============================================================

const SCAN_PROMPT = `You are a federal procurement intelligence analyst specializing in federal health IT opportunities. You have access to web search to find NEW contract opportunities.

Your task: Search for new federal health IT procurement opportunities using the provided search strategy. Focus on opportunities from these agencies: DHA, VA, HHS, CMS, CDC, NIH, IHS.

Relevant NAICS codes: ${NAICS_CODES.join(", ")}

For each opportunity found, extract:
- title: The solicitation or opportunity title
- solicitation_number: The official solicitation number (if available)
- agency: The issuing agency
- description: Brief description of the requirement (1-2 sentences)
- value_estimate: Estimated contract value (if available)
- response_deadline: Response deadline in ISO 8601 format (if available)
- set_aside_type: Set-aside type if applicable (8(a), SDVOSB, VOSB, WOSB, HUBZone, SDB, or "Full & Open")
- naics_codes: Array of applicable NAICS codes
- source_url: URL where the opportunity was found
- relevance_score: 0-100 score for how relevant this is to federal health IT
- opportunity_type: One of "solicitation", "pre-solicitation", "sources_sought", "task_order", "rfi", "award_notice"
- small_business_eligible: true/false
- ai_summary: 1-2 sentence summary of why this matters for federal health IT

Only include opportunities genuinely related to federal health. That spans health IT, health data, EHR, telehealth, medical devices, health analytics, and military/veteran healthcare systems — AND the adjacent work that often isn't labeled "IT" but is still federal health business a contractor would pursue: CMS and health-payment systems, claims processing and adjudication, medical coding, clinical diagnostics and lab systems, grant-funded health programs, and rule-driven system builds (for example an IDR Gateway or a mandated reporting portal). Score the obviously-core items high and the adjacent ones lower, but do not exclude the adjacent ones.

CHAIN OF THOUGHT: For each opportunity, explain in ai_summary why you scored its relevance at the level you did. What specific factors connect it to federal health IT?

EXAMPLE (abbreviated):
{
  "opportunities": [
    {
      "title": "VA Enterprise Telehealth Platform Modernization",
      "solicitation_number": "36C10X25R0042",
      "agency": "Department of Veterans Affairs",
      "description": "Modernization of VA telehealth infrastructure to support 50K+ daily virtual visits.",
      "value_estimate": "$45M",
      "response_deadline": "2026-04-15T17:00:00Z",
      "set_aside_type": "SDVOSB",
      "naics_codes": ["541512"],
      "source_url": "https://sam.gov/opp/abc123",
      "relevance_score": 95,
      "opportunity_type": "solicitation",
      "small_business_eligible": true,
      "ai_summary": "Directly targets VA telehealth modernization — core federal health IT. SDVOSB set-aside makes this accessible to veteran-owned firms. High relevance (95) because it intersects EHR, telehealth, and VA digital transformation."
    }
  ]
}

Return a JSON object: { "opportunities": [...] }

CRITICAL GUARDRAILS:
- NEVER use "T-5 BPA" — correct name is T4NG / T4NG2.
- TRICARE West vendor is TriWest Healthcare Alliance, NOT Health Net Federal.
- CIO-SP4 was cancelled February 2026 — do not include as an active vehicle.
- VA EHRM is resuming April 2026, NOT paused.
- Always include source URL for every opportunity.

Return ONLY valid JSON. No markdown code fences. No text before or after the JSON.`;

// ============================================================
// HELPER: Call Claude API with web_search
// ============================================================

async function callClaude(systemPrompt, userMessage, _maxSearches, model, maxTokens, _supabase) {
  // Function name preserved (callClaude) for minimal downstream diff,
  // but the underlying provider is now Perplexity sonar-pro per
  // MMT-INTEL-02. The `model` argument is logged but not honored —
  // Perplexity uses sonar-pro for all opportunity scans.
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  if (!PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY not configured (required by opportunity-radar-background after web_search migration)");
  }

  const _t = Date.now();
  const response = await withRetry(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PERPLEXITY_TIMEOUT_MS);
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
    throw new Error(`Perplexity API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const finalData = await response.json();

  if (finalData.usage) {
    const u = finalData.usage;
    console.log(`  Perplexity cost: model=${PERPLEXITY_MODEL}, input=${u.prompt_tokens || u.input_tokens}, output=${u.completion_tokens || u.output_tokens} (req model=${model})`);
  }

  if (_supabase) {
    try {
      const u = finalData.usage || {};
      await trackAnthropic(_supabase, {
        functionName: "opportunity-radar-background",
        product: "mmt-intel",
        model: PERPLEXITY_MODEL,
        usage: { input_tokens: u.prompt_tokens || u.input_tokens || 0, output_tokens: u.completion_tokens || u.output_tokens || 0 },
        latencyMs: Date.now() - _t,
      });
    } catch (_costErr) { /* never break parent */ }
  }
  logInference({
    agent: "opportunity-radar", model: PERPLEXITY_MODEL, provider: "perplexity",
    input_tokens: finalData.usage?.prompt_tokens || finalData.usage?.input_tokens || 0,
    output_tokens: finalData.usage?.completion_tokens || finalData.usage?.output_tokens || 0,
    task_type: "opportunity_scan", latency_ms: Date.now() - _t, status: "success",
  });

  const textContent = finalData.choices?.[0]?.message?.content || "";

  function cleanJson(str) {
    str = str.replace(/,\s*([\]}])/g, "$1");
    str = str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    return str;
  }

  function extractJsonString(text) {
    try { return JSON.parse(cleanJson(text)); } catch { /* continue */ }
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { return JSON.parse(cleanJson(jsonMatch[1].trim())); } catch { /* continue */ }
    }
    const braceStart = text.indexOf("{");
    const braceEnd = text.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      const candidate = text.substring(braceStart, braceEnd + 1);
      try { return JSON.parse(cleanJson(candidate)); } catch { /* continue */ }
    }
    return null;
  }

  const parsed = extractJsonString(textContent);
  if (!parsed) {
    console.error("JSON parse failed. First 500 chars:", textContent.substring(0, 500));
    throw new Error(`Could not parse JSON from Perplexity response (${textContent.length} chars)`);
  }

  return parsed;
}

// ============================================================
// MAIN HANDLER
// ============================================================

// S-P1: SAM.gov direct pre-pass. Returns raw opportunity objects in the same
// shape the web-search scans produce, so the existing dedupe/validate/normalize/
// upsert loop handles them with no special-casing. Dormant unless
// RADAR_SAM_DIRECT=true AND SAM_SYSTEM_ACCOUNT_API_KEY is set. Per-NAICS
// try/catch so one failed query never aborts the pre-pass.
async function runSamPrePass() {
  if (!RADAR_SAM_DIRECT) return [];
  if (!SAM_SYSTEM_ACCOUNT_API_KEY) {
    console.log("runSamPrePass: RADAR_SAM_DIRECT on but SAM_SYSTEM_ACCOUNT_API_KEY absent — skipping SAM pre-pass; web search unaffected.");
    return [];
  }
  const out = [];
  for (const naics of NAICS_CODES) {
    try {
      const { data } = await sam_search_opportunities({
        naics,
        api_key: SAM_SYSTEM_ACCOUNT_API_KEY,
        posted_from_days_ago: 14,
        limit: 25,
      });
      const items = (data && data.items) || [];
      for (const it of items) {
        const setAside = it.set_aside || "";
        out.push({
          title: it.title,
          solicitation_number: it.solicitation_number || null,
          agency: it.agency || "Unknown",
          description: "",
          response_deadline: it.response_deadline || null,
          set_aside_type: setAside,
          naics_codes: it.naics ? [String(it.naics)] : [naics],
          source_url: it.sam_url || "",
          opportunity_type: it.type || "solicitation",
          source: "sam_api",
          relevance_score: 80,
          small_business_eligible: /SDVOSB|VOSB|WOSB|8\(a\)|HUBZone|small business|set.?aside/i.test(setAside),
        });
      }
      console.log(`runSamPrePass: NAICS ${naics} → ${items.length} SAM items`);
    } catch (err) {
      console.error(`runSamPrePass: NAICS ${naics} failed:`, err.message);
    }
  }
  console.log(`runSamPrePass: ${out.length} SAM items collected`);
  return out;
}

async function _runRadarScan(event) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const scanModel = await getModelConfig(null, "opportunity_scan");
  const allOpportunities = [];

  // S-P1: SAM.gov direct pre-pass (dormant unless flag+key set) runs BEFORE the
  // web-search scans so its items flow through the same dedupe/validate/upsert
  // path and win dedupe over any web-search hit with the same solicitation_number.
  try {
    const samItems = await runSamPrePass();
    if (samItems.length) {
      allOpportunities.push(...samItems);
      console.log(`SAM pre-pass contributed ${samItems.length} opportunities`);
    }
  } catch (err) {
    console.error("SAM pre-pass error (non-fatal):", err.message);
  }

  // C4: Consume intelligence signals for priority search terms
  let priorityTerms = [];
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: signals } = await supabase
      .from("intelligence_signals")
      .select("signal_key, signal_type")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    if (signals && signals.length > 0) {
      const freq = {};
      signals.forEach((s) => { freq[s.signal_key] = (freq[s.signal_key] || 0) + 1; });
      priorityTerms = Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([key]) => key);
      console.log("Priority search terms from flywheel:", priorityTerms.join(", "));
    }
  } catch (err) {
    console.error("Signal consumption failed:", err.message);
  }

  const priorityContext = priorityTerms.length > 0
    ? `\n\nPRIORITY TOPICS (recent user interest on the MMT platform — give extra weight to opportunities related to): ${priorityTerms.join(", ")}`
    : "";

  // --- Scan 1: SAM.gov + agency sites ---
  try {
    console.log(`Scan 1: SAM.gov + agency sites (${scanModel.model})...`);
    const result1 = await callClaude(SCAN_PROMPT, `Search SAM.gov and federal agency websites for NEW federal health IT solicitations, RFPs, and task orders posted in the last 14 days.${priorityContext}

Focus your 5 web searches on:
1. SAM.gov new solicitations for health IT (NAICS 541512, 541511)
2. DHA and VA new procurement actions for health IT systems
3. HHS/CMS new technology solicitations
4. Recent federal health IT contract awards or modifications
5. New task orders under existing health IT vehicles (T4NG/T4NG2, EIDS, etc.)

Return opportunities found as JSON.`, 5, scanModel.model, 8000, supabase);

    if (result1.opportunities) {
      allOpportunities.push(...result1.opportunities);
      console.log(`  Found ${result1.opportunities.length} opportunities from SAM/agency scan`);
    }
  } catch (err) {
    console.error("Scan 1 failed:", err.message);
  }

  // --- Scan 2: Trade press ---
  try {
    console.log("Scan 2: Trade press...");
    const result2 = await callClaude(SCAN_PROMPT, `Search federal technology trade press for newly announced federal health IT contract opportunities from the last 14 days.

Focus your 4 web searches on:
1. FedScoop and NextGov federal health IT procurement news
2. Defense One and Federal News Network health IT contract announcements
3. GovWin and Bloomberg Government health IT opportunities
4. Recent federal health IT RFI or sources sought notices

Return opportunities found as JSON. Do not duplicate opportunities that are well-known existing contracts (MHS GENESIS, FEHRM, VA EHRM, TRICARE MCS, CCN Next Gen, T4NG/T4NG2, EIDS).`, 4, scanModel.model, 8000, supabase);

    if (result2.opportunities) {
      allOpportunities.push(...result2.opportunities);
      console.log(`  Found ${result2.opportunities.length} opportunities from trade press scan`);
    }
  } catch (err) {
    console.error("Scan 2 failed:", err.message);
  }

  // --- Scan 3: Small business set-asides ---
  try {
    console.log("Scan 3: Small business set-asides...");
    const result3 = await callClaude(SCAN_PROMPT, `Search for federal health IT opportunities specifically set aside for small businesses, posted in the last 14 days.

Focus your 3 web searches on:
1. SAM.gov small business set-asides in health IT (8(a), SDVOSB, WOSB, HUBZone)
2. VA OSDBU and DHA small business opportunities in health technology
3. Recent small business health IT contract awards or subcontracting opportunities

Return opportunities found as JSON.`, 3, scanModel.model, 8000, supabase);

    if (result3.opportunities) {
      allOpportunities.push(...result3.opportunities);
      console.log(`  Found ${result3.opportunities.length} opportunities from small business scan`);
    }
  } catch (err) {
    console.error("Scan 3 failed:", err.message);
  }

  // --- Scan 4: Agency acquisition forecasts + pre-solicitation notices (P4) ---
  // Dormant unless RADAR_FORECAST_SCAN=true. Surfaces work BEFORE the formal
  // solicitation — forecasts, industry days, sources-sought, pre-solicitation.
  if (RADAR_FORECAST_SCAN) {
    try {
      console.log("Scan 4: Agency forecasts + pre-solicitation notices...");
      const result4 = await callClaude(SCAN_PROMPT, `Search federal agency acquisition forecasts and early-stage notices for upcoming federal health IT work in the next 6-12 months.${priorityContext}

Focus your 5 web searches on:
1. DHS APFS acquisition forecast (apfs-cloud.dhs.gov) for health IT
2. VA and HHS acquisition forecast / procurement forecast pages
3. Army and DHA acquisition forecasts touching health systems
4. "industry day" and "sources sought" notices for federal health IT
5. "pre-solicitation" notices for health IT systems, EHR, claims, telehealth

These are EARLY signals — score relevance on how concretely they point to a
real upcoming health IT buy. Return opportunities found as JSON.`, 5, scanModel.model, 8000, supabase);

      if (result4.opportunities) {
        // Tag forecast-sourced rows so the feed/analytics can distinguish
        // pre-solicitation signals from active solicitations.
        for (const o of result4.opportunities) { o.source = "forecast"; }
        allOpportunities.push(...result4.opportunities);
        console.log(`  Found ${result4.opportunities.length} opportunities from forecast scan`);
      }
    } catch (err) {
      console.error("Scan 4 (forecast) failed:", err.message);
    }
  }

  // --- Deduplicate and filter ---
  const seen = new Set();
  const filtered = [];
  let fabricatedDropped = 0;
  for (const opp of allOpportunities) {
    // Fabrication guard (2026-08-05): a web-search row whose source_url is a
    // built-from-solicitation SAM permalink (sam.gov/opp/<sol#>, not a
    // 32-hex notice id) never resolved to a real notice. These co-occur with
    // hallucinated opportunities and were reaching premium subscribers as
    // "published". Refuse to persist them. SAM-API rows carry the real uiLink
    // /32-hex noticeId (lib/federal-data-apis.js), so this only trips the
    // fabricated web-search rows.
    if (isMalformedSamPermalink(opp.source_url)) {
      fabricatedDropped++;
      continue;
    }

    // Deduplicate by solicitation_number or title
    const key = opp.solicitation_number || opp.title;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());

    // Filter by relevance. P2 review-queue mode keeps low-confidence items
    // (tagged needs_review below, hidden from the public feed) so nothing the
    // scan surfaced silently vanishes; legacy mode drops < 40 as before.
    const relevance = typeof opp.relevance_score === "number" ? opp.relevance_score : 50;
    if (RADAR_REVIEW_QUEUE) {
      if (relevance < 20) continue; // still drop the clearly-irrelevant
    } else {
      if (relevance < 40) continue;
    }

    // Sprint 2: Validate opportunity and filter cancelled vehicles
    const oppValidation = validateOpportunity(opp);
    if (!oppValidation.valid) continue;
    if (opp.contract_vehicle && CANCELLED_VEHICLES.includes(opp.contract_vehicle)) continue;

    const row = {
      title: (opp.title || "Untitled").substring(0, 500),
      solicitation_number: opp.solicitation_number || null,
      agency: (opp.agency || "Unknown").substring(0, 200),
      description: (opp.description || "").substring(0, 1000),
      value_estimate: (opp.value_estimate || "").substring(0, 100),
      response_deadline: opp.response_deadline || null,
      set_aside_type: (opp.set_aside_type || "").substring(0, 50),
      naics_codes: Array.isArray(opp.naics_codes) ? opp.naics_codes.slice(0, 10) : [],
      source_url: (opp.source_url || "").substring(0, 500),
      relevance_score: relevance,
      opportunity_type: (opp.opportunity_type || "solicitation").substring(0, 50),
      small_business_eligible: opp.small_business_eligible === true,
      ai_summary: (opp.ai_summary || "").substring(0, 500),
      scan_date: new Date().toISOString().split("T")[0],
      model_used: scanModel.model,
      // S-P1: carry the source tag (SAM pre-pass rows = 'sam_api'); web-search
      // rows fall back to the column's existing 'radar' default.
      source: opp.source || "radar",
    };
    // S-P2: only attach review_status when the flag is on — the column exists
    // only after its migration is applied, and writing an unknown column would
    // kill every radar write (schema law).
    if (RADAR_REVIEW_QUEUE) {
      row.review_status = relevance < 50 ? "needs_review" : "published";
    }
    filtered.push(row);
  }

  console.log(`Total after dedup/filter: ${filtered.length} opportunities` +
    (fabricatedDropped ? ` (${fabricatedDropped} fabricated SAM-permalink rows dropped)` : ""));

  // --- Upsert into Supabase ---
  let upsertCount = 0;
  let errorCount = 0;

  for (const opp of filtered) {
    try {
      // Use solicitation_number for upsert if available, otherwise insert
      if (opp.solicitation_number) {
        const { error } = await supabase
          .from("opportunity_radar")
          .upsert(opp, { onConflict: "solicitation_number" });
        if (error) {
          console.error("Upsert error:", error.message);
          errorCount++;
        } else {
          upsertCount++;
        }
      } else {
        const { error } = await supabase
          .from("opportunity_radar")
          .insert(opp);
        if (error) {
          // Likely duplicate title — skip silently
          if (error.code === "23505") continue;
          console.error("Insert error:", error.message);
          errorCount++;
        } else {
          upsertCount++;
        }
      }
    } catch (err) {
      console.error("DB error:", err.message);
      errorCount++;
    }
  }

  console.log(`Opportunity radar complete: ${upsertCount} upserted, ${errorCount} errors`);

  // MMT-INTEL-02: Always write a heartbeat row to ops_ledger after a
  // completed scan — success or partial — so the weekly QA report can
  // see "last successful scan" even if 0 rows were upserted.
  try {
    await logOpsEvent(supabase, {
      event_type: upsertCount > 0 ? "RADAR_SCAN_OK" : "RADAR_SCAN_EMPTY",
      source_function: "opportunity-radar-background",
      severity: upsertCount === 0 && errorCount > 0 ? "error" : (upsertCount === 0 ? "warn" : "info"),
      signature: "radar_scan_complete",
      details: { scanned: allOpportunities.length, filtered: filtered.length, upserted: upsertCount, errors: errorCount, fabricated_dropped: fabricatedDropped },
    });
  } catch (logErr) {
    console.error("ops_ledger heartbeat failed:", logErr.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      scanned: allOpportunities.length,
      filtered: filtered.length,
      upserted: upsertCount,
      errors: errorCount,
    }),
  };
}

exports.handler = async (event) => {
  const killCheck = checkKillSwitch("opportunity-radar-background");
  if (killCheck.blocked) return killCheck.response;

  console.log("Opportunity radar scan started:", new Date().toISOString());

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing required env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  // MMT-INTEL-02: wrap the entire scan so any uncaught exception lands
  // in ops_ledger as a radar_scan_failed event with the error message.
  // Previously the function would die silently mid-loop and the page
  // would show "951h ago (refreshing)" indefinitely.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  try {
    return await _runRadarScan(event);
  } catch (err) {
    const errMsg = (err && err.message ? err.message : String(err)).slice(0, 1000);
    const errStack = (err && err.stack ? err.stack : "").slice(0, 4000);
    console.error("opportunity-radar-background FAILED:", errMsg);
    console.error(errStack);
    try {
      await logOpsEvent(supabase, {
        event_type: "RADAR_SCAN_FAILED",
        source_function: "opportunity-radar-background",
        severity: "error",
        signature: "radar_scan_failed",
        details: { error_message: errMsg, error_stack: errStack, started_at: new Date().toISOString() },
      });
    } catch (_logErr) { /* never mask the real failure */ }
    return { statusCode: 500, body: JSON.stringify({ error: "radar_scan_failed", message: errMsg }) };
  }
};
