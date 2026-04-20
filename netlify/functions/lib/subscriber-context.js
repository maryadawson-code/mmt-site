// ============================================================
// subscriber-context.js — MarketPulse v2 subscriber context layer
//
// The research agent loads this before every MarketPulse run so
// that pipeline opportunities are tagged against the subscriber's
// actual position (active pursuits, incumbent contracts, OCI
// exclusions, no-go list, lanes).
//
// Spec: MarketPulse v2 — Subscriber Context Integration (2026-04-17).
// Failure case prevented: 4/17/26 report recommended pursuing
// HT001126RE011 when the subscriber had already submitted a proposal
// on that solicitation.
// ============================================================

/**
 * Load subscriber_context by email. Returns null (not error) when
 * no record exists — the caller handles the "no context" banner.
 */
async function loadSubscriberContext(supabase, email) {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  try {
    const { data, error } = await supabase
      .from("subscriber_context")
      .select("*")
      .eq("email", normalized)
      .maybeSingle();
    if (error) {
      console.warn("[subscriber-context] load error:", error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    console.warn("[subscriber-context] unexpected error:", err.message);
    return null;
  }
}

/**
 * Format the context as a prompt-injection block. This gets prepended
 * to the research prompt under a ## SUBSCRIBER CONTEXT header.
 */
function formatContextBlock(ctx) {
  if (!ctx) return "";

  const sections = [];

  sections.push(`Subscriber: ${ctx.entity_name}${ctx.uei ? ` (UEI ${ctx.uei})` : ""}`);
  if (ctx.set_aside_certifications?.length) {
    sections.push(`Set-aside certifications: ${ctx.set_aside_certifications.join(", ")}`);
  }

  if (Array.isArray(ctx.lanes) && ctx.lanes.length) {
    const lanes = ctx.lanes.map((l) =>
      `- ${l.name} (${l.target_pct || "?"}% target, priority ${l.priority || "?"})`
    ).join("\n");
    sections.push(`STRATEGIC LANES:\n${lanes}`);
  }

  if (Array.isArray(ctx.active_pursuits) && ctx.active_pursuits.length) {
    const pursuits = ctx.active_pursuits.map((p) =>
      `- ${p.solicitation_number || "TBD"} · ${p.name} — role: ${p.role}, stage: ${p.stage}${p.status_notes ? ` (${p.status_notes})` : ""}`
    ).join("\n");
    sections.push(`ACTIVE PURSUITS (IN-FLIGHT — do NOT recommend pursuing):\n${pursuits}`);
  }

  if (Array.isArray(ctx.incumbent_positions) && ctx.incumbent_positions.length) {
    const incumbents = ctx.incumbent_positions.map((i) =>
      `- ${i.contract_number || "TBD"} · ${i.name} — role: ${i.role}${i.end_date ? `, ends ${i.end_date}` : ""}`
    ).join("\n");
    sections.push(`INCUMBENT POSITIONS (recompete = defense play, not entry point):\n${incumbents}`);
  }

  if (Array.isArray(ctx.no_go_list) && ctx.no_go_list.length) {
    const nogo = ctx.no_go_list.map((n) =>
      `- ${n.solicitation_number || "TBD"} · ${n.name} — reason: ${n.reason}`
    ).join("\n");
    sections.push(`NO-GO LIST (subscriber has passed on these):\n${nogo}`);
  }

  if (Array.isArray(ctx.oci_exclusions) && ctx.oci_exclusions.length) {
    const oci = ctx.oci_exclusions.map((o) =>
      `- Blocking: ${o.blocking_contract || "TBD"} → Blocked scope: ${o.blocked_scope || "TBD"}${o.expires ? ` (expires ${o.expires})` : ""}${o.notes ? ` — ${o.notes}` : ""}`
    ).join("\n");
    sections.push(`OCI EXCLUSIONS:\n${oci}`);
  }

  if (ctx.teaming_preferred?.length) {
    sections.push(`TEAMING PREFERRED: ${ctx.teaming_preferred.join(", ")}`);
  }
  if (ctx.teaming_no_fly?.length) {
    sections.push(`TEAMING NO-FLY (never recommend teaming): ${ctx.teaming_no_fly.join(", ")}`);
  }

  if (Array.isArray(ctx.vehicle_holdings) && ctx.vehicle_holdings.length) {
    const vehicles = ctx.vehicle_holdings.map((v) =>
      `- ${v.vehicle}${v.contract ? ` (${v.contract})` : ""}: role ${v.role}${v.expires ? `, expires ${v.expires}` : ""}`
    ).join("\n");
    sections.push(`VEHICLE HOLDINGS:\n${vehicles}`);
  }

  sections.push(`Context version: ${ctx.context_version || 1} · Updated ${ctx.last_updated || "unknown"}`);

  return `\n\n## SUBSCRIBER CONTEXT\n\n${sections.join("\n\n")}\n`;
}

/**
 * Format the system-prompt rules the research + synthesis agents
 * must follow when a subscriber context is loaded.
 */
function contextSystemRules() {
  return `\n\n## SUBSCRIBER CONTEXT RULES (mandatory)

Before describing any pipeline opportunity, check it against the SUBSCRIBER CONTEXT block above. Apply one of these tags immediately after the contract/solicitation number:

  [NEW]                   — not in subscriber's records
  [IN-FLIGHT]             — appears in active_pursuits (cite stage + status; do NOT recommend pursuing)
  [INCUMBENT-RECOMPETE]   — subscriber holds the incumbent (this is a defense play, NOT an entry point)
  [PREVIOUSLY-PASSED]     — on no_go_list
  [OCI-BLOCKED]           — conflicts with an oci_exclusions entry
  [OFF-LANE]              — does not map to any entry in lanes

HARD RULES:
1. Never recommend pursuit of [IN-FLIGHT] opportunities. Instead, report status changes, competitor intel, and shaping moves relevant to the active submission.
2. Never recommend teaming with any partner on TEAMING NO-FLY.
3. Never frame an [INCUMBENT-RECOMPETE] as a "new entry point" or "uncontested opportunity." Frame as defense posture with specific recompete-horizon risk.
4. Off-lane items get one-sentence mentions, not full capture strategies.
5. [OCI-BLOCKED] items must be flagged as ineligible and never recommended.
6. When generating Strategic Thesis or Capture Strategy sections, lead with the status of IN-FLIGHT positions inside the covered topic before discussing market structure.
7. Never fabricate probability figures ("18% odds uncontested", "70% recompete win rate"). If a number is not derivable from verified sources, omit it.

If any opportunity lacks a tag, the report is incomplete.
`;
}

/**
 * No-context banner — prepended when the generator runs against a
 * subscriber that has no subscriber_context record yet.
 */
function noContextBanner() {
  return `\n\n> ⚠️ **No subscriber context loaded.** This report is generic market intelligence. Recommendations may conflict with the subscriber's active positions. Load a subscriber_context record to enable opportunity tagging, IN-FLIGHT detection, and OCI-aware capture strategies.\n\n`;
}

/**
 * v4 run-blocker gate (spec §4). Implements the BLOCKED / WAIVED / OK
 * decision tree every serious run must pass before research begins.
 *
 * @param {Object|null} ctx — result of loadSubscriberContext
 * @param {Object} env — process.env
 * @returns {{ state: 'OK'|'WAIVED'|'BLOCKED', banner?: string, reason?: string }}
 */
function gateContext(ctx, env) {
  if (ctx) return { state: "OK" };
  const waive = (env && (env.WAIVE_CONTEXT || env.MARKETPULSE_WAIVE_CONTEXT)) || "";
  const waived = String(waive).toLowerCase() === "true" || waive === "1" || waive === "on";
  if (waived) {
    return {
      state: "WAIVED",
      banner: waivedContextBanner(),
    };
  }
  return {
    state: "BLOCKED",
    reason: "subscriber_context not loaded and WAIVE_CONTEXT not set",
  };
}

/**
 * Persistent generic-run banner shown when WAIVE_CONTEXT=true.
 */
function waivedContextBanner() {
  return `\n\n> ⚠️ **GENERIC RUN — WAIVED.** No subscriber context loaded (WAIVE_CONTEXT=true). This report is generic market intelligence. No opportunity tagging, no IN-FLIGHT detection, no OCI-aware capture advice. Mode defaulted to "generic".\n\n`;
}

/**
 * Render the BLOCKED diagnostic for a run that could not start.
 */
function renderBlockedDiagnostic(reason, email) {
  return [
    "# BLOCKED: subscriber_context not loaded",
    "",
    `Run halted before research began. Reason: ${reason || "no subscriber_context for this email"}`,
    `Subscriber email: ${email || "(unknown)"}`,
    "",
    "## To unblock",
    "- Load a subscriber_context record for this email via `scripts/seed-subscriber-context.js` or the admin import endpoint (`POST /.netlify/functions/subscriber-context`), OR",
    "- Set the env var `WAIVE_CONTEXT=true` to force a generic run. A persistent banner will be shown on the report, tagging will be disabled, and the mode will default to \"generic\".",
    "",
    "No report was generated. No email was sent to the customer.",
  ].join("\n");
}

/**
 * Post-generation validation — scans the final report for signs the
 * context rules were violated. Returns { ok, violations[] }.
 *
 * This is a defense-in-depth check; the model is prompted to follow
 * the rules but may drift. Anything caught here either downgrades the
 * quality grade or triggers an ops alert.
 */
function validateReport({ reportHtml, ctx }) {
  const violations = [];
  if (!ctx) {
    // Without context we can't validate against it. Callers decide whether
    // that's a soft warning or a hard fail.
    return { ok: true, violations: [], hadContext: false };
  }
  const lower = (reportHtml || "").toLowerCase();

  // Rule 1: no "pursue" / "recommend pursuing" language near an IN-FLIGHT sol #
  for (const pursuit of (ctx.active_pursuits || [])) {
    const sol = (pursuit.solicitation_number || "").toLowerCase();
    if (!sol || sol.startsWith("tbd")) continue;
    if (!lower.includes(sol)) continue;
    // Find a 400-char window around the mention and scan for recommend-to-pursue language
    const idx = lower.indexOf(sol);
    const window = lower.slice(Math.max(0, idx - 200), idx + 400);
    if (/\b(pursue|we recommend pursuing|target this opportunity|new entry point|uncontested)\b/.test(window)) {
      violations.push({
        rule: "IN-FLIGHT-RECOMMENDATION",
        solicitation: pursuit.solicitation_number,
        detail: `Report appears to recommend pursuing an IN-FLIGHT opportunity (${pursuit.solicitation_number}). Window: ...${window.slice(0, 300)}...`,
      });
    }
  }

  // Rule 2: no teaming recommendation involving a no-fly partner
  for (const noFly of (ctx.teaming_no_fly || [])) {
    const name = noFly.toLowerCase();
    if (!name) continue;
    if (lower.includes(name) && /\b(team with|teaming with|partner with|partnership with)\b/.test(lower)) {
      violations.push({
        rule: "NO-FLY-TEAMING",
        partner: noFly,
        detail: `Report mentions teaming near a no-fly partner (${noFly}).`,
      });
    }
  }

  // Rule 7: fabricated precise probabilities flagged for review
  const fabricatedPatterns = [
    /\b\d{1,2}%\s+odds\b/,
    /\b\d{1,2}%\s+recompete\s+win\s+rate\b/,
    /\b\d{1,2}[-–]\d{1,2}%\s+capture\b/,
  ];
  for (const pat of fabricatedPatterns) {
    const m = (reportHtml || "").match(pat);
    if (m) {
      violations.push({
        rule: "FABRICATED-PRECISION",
        detail: `Suspicious precise-percentage claim: "${m[0]}". Verify against source or remove.`,
      });
    }
  }

  return { ok: violations.length === 0, violations, hadContext: true };
}

module.exports = {
  loadSubscriberContext,
  formatContextBlock,
  contextSystemRules,
  noContextBanner,
  waivedContextBanner,
  gateContext,
  renderBlockedDiagnostic,
  validateReport,
};
