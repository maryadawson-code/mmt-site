// ============================================================
// premium-tools-core.js — Shared intelligence surface for the 3
// MMT Premium tools (Pursuit Score, Compliance Check, Signal Chain).
//
// Re-uses the v4 primitives built for MarketPulse:
//   - source-tiering
//   - research-score-v4
//   - self-audit-v4
//   - research-planner
//   - marketpulse-v4-prompt (detectMode)
//   - subscriber-context (gate, waiver)
//   - synthesis-sanitizer (sanitizeV4 — strips [source needed])
//
// Exports:
//   - loadToolContext(supabase, email)
//   - dispatchMode({ subscriberContext, company })
//   - buildEvidencePanel(rawSources)
//   - buildMissingEvidencePanel(plan, evidence)
//   - buildMondayMove(mode, findings)
//   - buildMethodologyAndGaps(planner, fetchTracker, nullRegister)
//   - buildToolEnvelope(args) → uniform response envelope
//
// Spec: docs/premium-tools-master-sprint.md §B, §9
// ============================================================

const crypto = require("crypto");
const { classifyAll, enforceTierRatio, classifyTier } = require("./source-tiering");
const { scoreReportV4 } = require("./research-score-v4");
const { runSelfAudit } = require("./self-audit-v4");
const {
  createNullRegister,
  createRefinementLog,
  createFetchTracker,
} = require("./research-planner");
const { detectMode } = require("./marketpulse-v4-prompt");
const {
  loadSubscriberContext,
  gateContext,
  waivedContextBanner,
} = require("./subscriber-context");
const { sanitizeV4 } = require("./synthesis-sanitizer");

/**
 * Load subscriber context and apply the v4 gate. Returns a `toolContext`
 * object every tool endpoint reads from.
 *
 * @returns {{ state: 'OK'|'WAIVED'|'BLOCKED', subscriberContext?, mode, waived, banner?, reason? }}
 */
async function loadToolContext(supabase, email, { company } = {}) {
  let subscriberContext = null;
  if (supabase && email) {
    subscriberContext = await loadSubscriberContext(supabase, email);
  }
  const gate = gateContext(subscriberContext, process.env);
  const mode = detectMode(subscriberContext, { isMmtPlatform: /mission\s*meets?\s*tech/i.test(company || "") });
  return {
    state: gate.state,
    subscriberContext,
    mode,
    waived: gate.state === "WAIVED",
    banner: gate.state === "WAIVED" ? waivedContextBanner() : undefined,
    reason: gate.reason,
  };
}

/**
 * Dispatch the response transformation based on mode. Tools pass in their
 * raw finding (e.g., a bid/no-bid score) and get back a mode-appropriate
 * recommendation object.
 */
function dispatchMode({ mode, rawFinding, tool }) {
  const common = {
    why: rawFinding.why || [],
    blockers: rawFinding.blockers || [],
    what_would_flip: rawFinding.what_would_flip || [],
  };
  if (mode === "platform" || (mode === "generic" && tool !== "compliance")) {
    return {
      state: mapStateToPlatform(rawFinding.state, tool),
      ...common,
      platform_plays: rawFinding.platform_plays || buildDefaultPlatformPlays(tool, rawFinding),
    };
  }
  if (mode === "contractor") {
    return {
      state: rawFinding.state || "Watch",
      ...common,
    };
  }
  if (mode === "mixed") {
    return {
      state: rawFinding.state || "Watch",
      ...common,
      platform_plays: rawFinding.platform_plays || buildDefaultPlatformPlays(tool, rawFinding),
    };
  }
  // generic default
  return {
    state: rawFinding.state || "Market signal",
    ...common,
  };
}

function mapStateToPlatform(contractorState, tool) {
  const s = String(contractorState || "").toLowerCase();
  if (/prime|sub|pursue|bid/.test(s)) return "Editorial";
  if (/watch|monitor/.test(s)) return "Monitor";
  if (/no.?bid|skip/.test(s)) return "Skip coverage";
  if (tool === "signal") return "Intel product";
  return "Editorial";
}

function buildDefaultPlatformPlays(tool, rawFinding) {
  const topic = rawFinding.topic || rawFinding.keyword || "this signal";
  const plays = [];
  if (tool === "signal") {
    plays.push({ play: "Newsletter angle", detail: `Lead story on ${topic}` });
    plays.push({ play: "Friday Brief section", detail: `Add ${topic} to next brief's Capture Intelligence` });
    plays.push({ play: "Podcast segment", detail: `5-minute Mission Meets Reality segment on ${topic}` });
  } else if (tool === "pursuit") {
    plays.push({ play: "Intel product row", detail: `Add ${topic} to Capture Intelligence sheet with verified incumbent + recompete window` });
    plays.push({ play: "Sponsorship relevance", detail: `Match ${topic} to current sponsor vertical` });
  } else {
    plays.push({ play: "Compliance explainer", detail: `Breakdown of the specific requirement for newsletter readers` });
  }
  return plays;
}

/**
 * Convert a flat list of sources into an evidence panel with tier labels.
 * Each entry: { claim, url, tier, observed_date }.
 */
function buildEvidencePanel(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.map((s) => {
    const url = typeof s === "string" ? s : s.url;
    const claim = typeof s === "string" ? "—" : (s.claim || "—");
    const observed = typeof s === "string" ? new Date().toISOString().slice(0, 10) : (s.observed_date || new Date().toISOString().slice(0, 10));
    const { tier } = classifyTier(url);
    return { claim, url, tier, observed_date: observed };
  });
}

/**
 * Build the missing evidence panel. Takes the planner's sub-questions
 * and the evidence actually collected, returns a list of sub-questions
 * that have no matching source.
 */
function buildMissingEvidencePanel(subQuestions, evidencePanel) {
  if (!Array.isArray(subQuestions) || subQuestions.length === 0) return [];
  const haveUrls = new Set((evidencePanel || []).map((e) => (e.url || "").toLowerCase()));
  const missing = [];
  for (const q of subQuestions) {
    // Heuristic: a sub-question is "covered" if any evidence URL mentions
    // one of its source families. Weak but deterministic.
    const covered = (q.source_families || []).some((family) => {
      const famShort = family.split(".")[0].toLowerCase();
      return [...haveUrls].some((u) => u.includes(famShort));
    });
    if (!covered) missing.push({ question: q.text, source_families: q.source_families });
  }
  return missing;
}

/**
 * Build the Monday Move action list. Every tool run must emit 1-3 next
 * actions. Mode-aware.
 */
function buildMondayMove(mode, tool, findings) {
  const actions = [];
  const topic = findings.topic || findings.keyword || "the flagged signal";

  if (mode === "platform" || mode === "generic") {
    actions.push({
      action: `Draft a Friday Brief section on ${topic}`,
      dated_trigger: nextFriday(),
    });
    actions.push({
      action: `Add ${topic} to Capture Intelligence with verified PIID + recompete window`,
      dated_trigger: "within 7 days",
    });
    actions.push({
      action: `Flag sponsors whose ICP overlaps with ${topic}`,
    });
    return actions.slice(0, 3);
  }

  if (tool === "pursuit") {
    actions.push({ action: `Pull USASpending top-3 awardees for ${topic}; check their teaming history for gap`, dated_trigger: "this week" });
    actions.push({ action: `Set SAM.gov saved search for ${topic} recompete window`, dated_trigger: "today" });
    if (findings.state === "Prime" || findings.state === "Sub") {
      actions.push({ action: `Open teaming conversation with named partner`, dated_trigger: "within 14 days" });
    } else {
      actions.push({ action: `Block calendar to re-evaluate at next forward catalyst`, dated_trigger: findings.next_catalyst || "FY2027 Q1" });
    }
    return actions.slice(0, 3);
  }

  if (tool === "compliance") {
    actions.push({ action: `Pull CHPL edition verification screenshot for every vendor claim`, dated_trigger: "before submission" });
    actions.push({ action: `Confirm SCA/DBA wage floor for every labor category`, dated_trigger: "before pricing lock" });
    actions.push({ action: `Close the top severity gap surfaced in the report`, dated_trigger: "within 48 hours" });
    return actions.slice(0, 3);
  }

  // signal default
  actions.push({ action: `Open ${topic} in Pursuit Score for company-specific read`, dated_trigger: "today" });
  actions.push({ action: `Set watchlist on ${topic} for protest/RFI triggers`, dated_trigger: "this week" });
  return actions.slice(0, 3);
}

function nextFriday() {
  const d = new Date();
  const offset = (5 - d.getUTCDay() + 7) % 7 || 7;
  const f = new Date(d.getTime() + offset * 86400000);
  return f.toISOString().slice(0, 10);
}

/**
 * Build the Methodology & Gaps block for the envelope.
 */
function buildMethodologyAndGaps({ planner, fetchTracker, nullRegister, refinementLog }) {
  return {
    source_families: planner ? [...new Set((planner || []).flatMap((q) => q.source_families || []))] : [],
    fetch_count: fetchTracker ? fetchTracker.distinct() : 0,
    refinement_passes: refinementLog ? refinementLog.count : 0,
    gaps: nullRegister ? nullRegister.entries.map((e) => `${e.source_family}: ${e.query}`) : [],
  };
}

/**
 * Summarize confidence across evidence panel + contradictions.
 */
function summarizeConfidence(evidence, contradictions, score) {
  const ratio = enforceTierRatio((evidence || []).map((e) => e.url), 0.40);
  if (score && score.total != null && score.total < 50) {
    return { overall: "INSUFFICIENT", reasons: [`Research Score ${score.total}/100 below delivery threshold`] };
  }
  if (!ratio.pass) {
    return { overall: "LOW", reasons: [`Tier 1 share ${Math.round(ratio.tier1Ratio * 100)}% below 40% floor`] };
  }
  if ((contradictions || []).length > 0) {
    return { overall: "MEDIUM", reasons: [`${contradictions.length} unresolved contradiction(s)`] };
  }
  return { overall: "HIGH", reasons: ["Tier 1 share ≥40%", "no open contradictions"] };
}

/**
 * Build the uniform ToolEnvelope. This is the shape every premium-tool
 * endpoint MUST return. See docs/premium-tools-master-sprint.md §9.
 */
function buildToolEnvelope({
  tool,
  email,
  inputs,
  toolContext,        // from loadToolContext
  resolved,           // { entity, vehicles, agency, naics }
  rawFinding,         // tool-specific raw output (used for mode dispatch)
  dimensions,         // { [key]: { score, max, detail } }
  totalScore,         // 0-100 or null
  band,               // 'high'|'medium'|'low'|'insufficient'
  evidence,           // [{ claim, url, tier, observed_date }]
  contradictions = [],
  nullResults = [],
  subQuestions = [],
  fetchTracker = null,
  refinementLog = null,
  legacy = null,
}) {
  const run_id = crypto.createHash("sha256")
    .update(`${tool}|${email}|${Date.now()}|${JSON.stringify(inputs || {})}`)
    .digest("hex")
    .slice(0, 16);

  const mode = toolContext && toolContext.mode || "generic";
  const recommendation = dispatchMode({ mode, rawFinding: rawFinding || {}, tool });

  // Always reclassify evidence so tier labels are guaranteed — callers may
  // pass raw URL strings or pre-formatted objects; buildEvidencePanel handles both.
  const ev = evidence && evidence.length ? buildEvidencePanel(evidence) : [];
  const missing = buildMissingEvidencePanel(subQuestions, ev);
  const nullRegister = { entries: nullResults || [] };

  const methodology = buildMethodologyAndGaps({
    planner: subQuestions,
    fetchTracker,
    nullRegister,
    refinementLog,
  });

  const mondayMove = buildMondayMove(mode, tool, rawFinding || inputs || {});
  const score = {
    total: totalScore,
    band: band || (typeof totalScore === "number" ? (totalScore >= 70 ? "high" : totalScore >= 50 ? "medium" : totalScore >= 30 ? "low" : "insufficient") : "insufficient"),
    dimensions: dimensions || {},
  };
  const confidence = summarizeConfidence(ev, contradictions, score);

  return {
    tool,
    run_id,
    ts: new Date().toISOString(),
    subscriber: {
      email,
      status: toolContext ? (toolContext.state === "OK" ? "loaded" : toolContext.state.toLowerCase()) : "unknown",
      entity_name: toolContext && toolContext.subscriberContext ? toolContext.subscriberContext.entity_name : undefined,
      mode,
    },
    inputs: inputs || {},
    resolved: resolved || {},
    score,
    confidence,
    evidence: ev,
    missing_evidence: missing,
    contradictions,
    null_results: nullResults,
    methodology,
    recommendation,
    monday_move: mondayMove,
    legacy,
  };
}

/**
 * Render the blocked-profile response body. Returns shape that tool
 * endpoints can serialize with statusCode 409.
 */
function renderBlockedResponse(email, reason) {
  return {
    tool: null,
    blocked: true,
    reason: reason || "Subscriber profile required",
    message:
      "This premium tool requires a subscriber profile to personalize the output. " +
      "Complete your profile at /premium/profile, or set WAIVE_CONTEXT=true to run in generic mode with a persistent banner.",
    unblock: [
      "Load a subscriber_context record for this email via the admin import endpoint",
      "Or set env WAIVE_CONTEXT=true to allow generic runs",
    ],
    email,
  };
}

module.exports = {
  loadToolContext,
  dispatchMode,
  buildEvidencePanel,
  buildMissingEvidencePanel,
  buildMondayMove,
  buildMethodologyAndGaps,
  buildToolEnvelope,
  summarizeConfidence,
  renderBlockedResponse,
  // re-exports so callers don't have to double-import
  createNullRegister,
  createFetchTracker,
  createRefinementLog,
  sanitizeV4,
  scoreReportV4,
  runSelfAudit,
};
