// ============================================================
// company-alignment.js — Company-fit overlay for Pursuit Score
//
// Reads a subscriber_context profile + an opportunity keyword/agency/
// NAICS and returns:
//   - companyFit       0–100 score against the profile
//   - capturePosition  Tag (incumbent / in-flight / recompete / partner / new / off-lane / OCI-blocked)
//   - signals          Positive-signal modifiers detected in the keyword
//   - completeness     { known, inferred, missing } breakdown of profile coverage
//   - reasoning        "Because of your company profile..." sentences
//
// This is what makes Pursuit Score a *bid/no-bid for the user's company*
// instead of a generic market read. The verdict combiner in
// pursuit-score-engine reads from this so unknown opportunity data does
// not collapse into a false NO-BID.
//
// Triggered by 2026-04-27 incident: VA Infrastructure Operations Franchise
// Fund returned NO-BID because USASpending was thin — without a profile to
// anchor the read.
// ============================================================

// Positive-signal phrases. Each unlocks a signal tag + a small score nudge.
// Listed by Mary's hardening contract: RFI, Industry Day, incumbent,
// recompete, current award, contract breakup, VA OIT, Franchise Fund,
// $600M, $1B, FY27.
const POSITIVE_SIGNAL_PATTERNS = [
  { tag: "RFI",                  re: /\b(rfi|sources sought|request for information)\b/i,         note: "RFI / sources-sought language detected — pre-solicitation shaping window is open." },
  { tag: "INDUSTRY_DAY",         re: /\b(industry day|industry forum|pre-?solicitation conference)\b/i, note: "Industry Day signal — a vendor-engagement window typically precedes the solicitation by 60–120 days." },
  { tag: "INCUMBENT",            re: /\b(incumbent)\b/i,                                          note: "Incumbent language present — defensive recompete posture applies." },
  { tag: "RECOMPETE",            re: /\b(recompete|re-?compete|follow-?on|bridge|succeeding|successor to)\b/i, note: "Recompete / follow-on signal — historical awardee data and option-period dates are key." },
  { tag: "POOL_ON_RAMP",         re: /\b(on-?ramp(ing)?|pool adds?|ongoing pool|open season)\b/i, note: "Pool on-ramp / ongoing-adds signal — eligible primes can join the vehicle without waiting for a full recompete." },
  { tag: "SET_ASIDE_ELIGIBLE",   re: /\b(SDVOSB|WOSB|HUBZone|8\(a\)|small business set-?aside|multi-?tier)\b/i, note: "Small-business / socioeconomic set-aside path present — pool-specific eligibility opens a competitive lane." },
  { tag: "CURRENT_AWARD",        re: /\b(current award|current contract|active award)\b/i,       note: "References an active award — confirm period of performance and exercise of options." },
  { tag: "CONTRACT_BREAKUP",     re: /\b(break ?up|break ?out|de-?consolidat|disaggregat)\b/i,    note: "Contract breakup / disaggregation signal — small-business set-aside path may open." },
  { tag: "VA_OIT",               re: /\bVA\s*OIT\b|\boffice of information.{0,12}technology\b/i, note: "VA OIT signal — agency owner is a known buy-source for IT modernization." },
  { tag: "FRANCHISE_FUND",       re: /\bfranchise fund\b/i,                                       note: "Franchise Fund signal — fee-for-service revolving fund, recurring task-order vehicle." },
  { tag: "DOLLAR_600M_PLUS",     re: /\$\s?6\d{2}\s?(m|million)\b/i,                              note: "$600M+ ceiling referenced — material vehicle, worth full capture investment if aligned." },
  { tag: "DOLLAR_1B_PLUS",       re: /\$\s?(1|2|3|4|5|6|7|8|9)(\.\d+)?\s?b\b|\$\s?\d{4,}\s?m\b|\bbillion\b/i, note: "$1B+ ceiling referenced — strategic vehicle." },
  { tag: "FY27",                 re: /\bFY\s?2027\b|\bFY\s?27\b/i,                                note: "FY2027 referenced — out-year planning horizon, capture-development window is now." },
];

// Map common short tokens to their canonical agency code so a profile
// listing "VA" matches an opportunity tagged "Department of Veterans Affairs".
const AGENCY_ALIASES = {
  VA:  ["va", "department of veterans affairs", "veterans affairs", "vha", "voa", "vbn", "vba", "vamco", "va oit"],
  DHA: ["dha", "defense health agency", "mhs", "military health system"],
  DoD: ["dod", "department of defense", "defense", "navy", "army", "air force", "marine corps", "ussocom", "useucom"],
  HHS: ["hhs", "department of health and human services", "cms", "ihs", "cdc", "nih", "fda"],
  GSA: ["gsa", "general services administration"],
};

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function tokenize(s) {
  return normalize(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Detect positive signals in the opportunity keyword/description.
 * Returns an array of { tag, note } items. These both protect the
 * verdict floor and surface as evidence in the UI.
 */
function detectPositiveSignals(text) {
  const hay = String(text || "");
  if (!hay) return [];
  const hits = [];
  for (const sig of POSITIVE_SIGNAL_PATTERNS) {
    if (sig.re.test(hay)) hits.push({ tag: sig.tag, note: sig.note });
  }
  return hits;
}

/**
 * Test whether an opportunity's agency string matches anything in the
 * subscriber's target_agencies list (with alias expansion).
 */
function agencyMatches(profileAgencies, oppAgency) {
  if (!Array.isArray(profileAgencies) || profileAgencies.length === 0 || !oppAgency) return false;
  const opp = normalize(oppAgency);
  for (const pa of profileAgencies) {
    const code = normalize(pa);
    if (code === opp) return true;
    const aliases = AGENCY_ALIASES[pa] || AGENCY_ALIASES[pa?.toUpperCase()] || [];
    if (aliases.some((a) => opp.includes(a))) return true;
    if (opp.includes(code)) return true;
  }
  return false;
}

/**
 * Decide the capture-position tag for the opp against the profile.
 * Mirrors the tag set in subscriber-context.contextSystemRules() so the
 * tags surfaced here are recognizable across the platform.
 */
function classifyCapturePosition(ctx, { keyword, agency }) {
  if (!ctx) return { tag: "NO_PROFILE", detail: "No company profile loaded — capture position cannot be classified." };
  const kw = normalize(keyword);
  const inflight = (ctx.active_pursuits || []).find((p) => kw && (
    (p.solicitation_number && kw.includes(normalize(p.solicitation_number))) ||
    (p.name && (kw.includes(normalize(p.name)) || normalize(p.name).includes(kw)))
  ));
  if (inflight) {
    return {
      tag: "IN_FLIGHT",
      detail: `Already in flight: ${inflight.name}${inflight.solicitation_number ? ` (${inflight.solicitation_number})` : ""}, stage: ${inflight.stage}.`,
      reference: inflight,
    };
  }
  const incumbent = (ctx.incumbent_positions || []).find((p) =>
    kw && p.name && (kw.includes(normalize(p.name)) || normalize(p.name).includes(kw))
  );
  if (incumbent) {
    return {
      tag: "INCUMBENT_RECOMPETE",
      detail: `Defensive recompete — you currently hold ${incumbent.name}${incumbent.contract_number ? ` (${incumbent.contract_number})` : ""}.`,
      reference: incumbent,
    };
  }
  const passed = (ctx.no_go_list || []).find((p) =>
    kw && p.name && (kw.includes(normalize(p.name)) || normalize(p.name).includes(kw))
  );
  if (passed) {
    return {
      tag: "PREVIOUSLY_PASSED",
      detail: `On the no-go list (${passed.reason || "reason not recorded"}). Re-evaluate before re-engaging.`,
      reference: passed,
    };
  }
  const oci = (ctx.oci_exclusions || []).find((o) =>
    kw && o.blocked_scope && normalize(o.blocked_scope).split(/\s+/).some((t) => t.length > 3 && kw.includes(t))
  );
  if (oci) {
    return {
      tag: "OCI_BLOCKED",
      detail: `OCI exclusion: ${oci.notes || oci.blocked_scope}. Cannot pursue without OCI mitigation plan.`,
      reference: oci,
    };
  }

  const onLane = (ctx.lanes || []).some((l) => l.name && kw && (
    normalize(l.name).split(/\s+/).filter((t) => t.length > 3).some((t) => kw.includes(t)) ||
    (agency && normalize(l.name).includes(normalize(agency)))
  ));
  if (onLane) {
    return { tag: "ON_LANE", detail: "Maps to one of your strategic lanes." };
  }
  return { tag: "NEW", detail: "Not in active pursuits, incumbent positions, or no-go list." };
}

/**
 * Compute a 0–100 company-fit score. Each component is gated on whether
 * the profile has data for it; missing components are reported under
 * `completeness.missing` rather than counted as a fail.
 *
 * The score floor is 50 when the profile exists but cannot disqualify
 * the opportunity — "we can't rule it out" is materially different from
 * "the company is wrong for this work."
 */
function scoreCompanyFit(ctx, { keyword, agency, naics }) {
  const known = [];
  const inferred = [];
  const missing = [];
  const reasoning = [];

  if (!ctx) {
    return {
      score: null,
      band: "no_profile",
      known, inferred,
      missing: ["company_profile"],
      reasoning: ["No company profile loaded — cannot score company fit. Score reverts to a generic preliminary read."],
    };
  }

  const kw = normalize(keyword);
  const oppAgency = normalize(agency);
  let score = 0;
  let max = 0;

  // ---- Agency alignment (max 25)
  max += 25;
  if (Array.isArray(ctx.target_agencies) && ctx.target_agencies.length) {
    if (agencyMatches(ctx.target_agencies, agency || keyword)) {
      score += 25;
      known.push(`Agency alignment: ${agency || "matched"} is in your target-agency list (${ctx.target_agencies.join(", ")}).`);
      reasoning.push(`Because ${agency || "this opportunity"} is on your target-agency list, agency alignment is high.`);
    } else if (oppAgency) {
      score += 5;
      known.push(`Agency mismatch: ${agency} is not in your target-agency list (${ctx.target_agencies.join(", ")}).`);
      reasoning.push(`${agency} is outside your stated target-agency list — fit takes a 20-point hit.`);
    } else {
      // Opp didn't specify an agency — neutral.
      score += 12;
      inferred.push("Opportunity did not name an agency — agency alignment is neutral.");
    }
  } else {
    missing.push("target_agencies");
    score += 12; // neutral when profile lacks the data
  }

  // ---- Capability / keyword overlap (max 20)
  max += 20;
  if (Array.isArray(ctx.capabilities) && ctx.capabilities.length) {
    const capTokens = new Set(ctx.capabilities.flatMap(tokenize));
    const kwTokens = tokenize(keyword);
    const overlap = kwTokens.filter((t) => capTokens.has(t));
    if (overlap.length >= 2) {
      score += 20;
      known.push(`Capability overlap on: ${overlap.slice(0, 4).join(", ")}.`);
      reasoning.push(`Because your stated capabilities (${ctx.capabilities.slice(0, 3).join(", ")}${ctx.capabilities.length > 3 ? ", ..." : ""}) overlap directly with this opportunity, capability fit is strong.`);
    } else if (overlap.length === 1) {
      score += 12;
      known.push(`Single-token capability overlap on: ${overlap[0]}.`);
      reasoning.push(`Capabilities partially overlap on "${overlap[0]}" — confirm this is the load-bearing scope before committing capture.`);
    } else {
      score += 4;
      known.push(`No direct capability overlap detected against your stated services.`);
      reasoning.push(`Your capabilities don't directly match the opportunity keyword — flag for capture validation, not auto no-bid.`);
    }
  } else {
    missing.push("capabilities");
    score += 10;
  }

  // ---- NAICS / set-aside fit (max 20)
  max += 20;
  const oppNaics = Array.isArray(naics) ? naics : (naics ? [naics] : []);
  if (oppNaics.length && Array.isArray(ctx.naics_codes) && ctx.naics_codes.length) {
    const match = oppNaics.some((n) => ctx.naics_codes.includes(String(n).trim()));
    if (match) {
      score += 12;
      known.push(`NAICS match: ${oppNaics.join(", ")} is in your registered NAICS list.`);
    } else {
      score += 2;
      known.push(`NAICS mismatch: opp NAICS ${oppNaics.join(", ")} not in your registered NAICS (${ctx.naics_codes.slice(0, 3).join(", ")}${ctx.naics_codes.length > 3 ? ", ..." : ""}).`);
      reasoning.push(`NAICS gap is recoverable but should be checked — sometimes a related code qualifies under multiple-NAICS rules.`);
    }
  } else if (!oppNaics.length) {
    inferred.push("Opportunity NAICS not provided — fit cannot be confirmed at the code level.");
    score += 6;
  } else {
    missing.push("naics_codes");
    score += 6;
  }
  if (Array.isArray(ctx.set_aside_certifications) && ctx.set_aside_certifications.length) {
    score += 8;
    known.push(`Set-aside posture: ${ctx.set_aside_certifications.join(", ")}.`);
    reasoning.push(`Your set-aside certifications (${ctx.set_aside_certifications.join(", ")}) protect the eligibility floor on small-business carve-outs.`);
  } else {
    missing.push("set_aside_certifications");
    score += 4;
  }

  // ---- Vehicle holdings (max 15)
  max += 15;
  if (Array.isArray(ctx.vehicle_holdings) && ctx.vehicle_holdings.length) {
    const vehicleTokens = new Set(ctx.vehicle_holdings.flatMap((v) => tokenize(`${v.vehicle || ""} ${v.contract || ""}`)));
    const kwHasVehicle = tokenize(keyword).some((t) => vehicleTokens.has(t));
    if (kwHasVehicle) {
      score += 15;
      known.push(`Vehicle alignment: opportunity references a vehicle you hold.`);
      reasoning.push(`You hold a contract on the vehicle this opportunity references — this is a real positional advantage.`);
    } else {
      score += 6;
      inferred.push(`No direct vehicle alignment with the keyword, but your vehicle holdings (${ctx.vehicle_holdings.map((v) => v.vehicle).slice(0, 3).join(", ")}) may still qualify for task-order routes.`);
    }
  } else {
    missing.push("vehicle_holdings");
    score += 6;
  }

  // ---- Capture priorities (max 10)
  max += 10;
  if (Array.isArray(ctx.capture_priorities) && ctx.capture_priorities.length) {
    const priorityTokens = new Set(ctx.capture_priorities.flatMap(tokenize));
    const kwTokens = tokenize(keyword);
    const overlap = kwTokens.filter((t) => priorityTokens.has(t));
    if (overlap.length) {
      score += 10;
      known.push(`Capture-priority overlap on: ${overlap.slice(0, 3).join(", ")}.`);
      reasoning.push(`This opportunity overlaps with a stated FY capture priority — boost fit.`);
    } else {
      score += 4;
    }
  } else {
    missing.push("capture_priorities");
    score += 4;
  }

  // ---- Compliance / clearance (max 10) — soft alignment
  max += 10;
  if ((Array.isArray(ctx.clearance_levels) && ctx.clearance_levels.length) ||
      (Array.isArray(ctx.compliance_posture) && ctx.compliance_posture.length)) {
    score += 10;
    const bits = [];
    if (ctx.clearance_levels?.length) bits.push(`clearance: ${ctx.clearance_levels.join(", ")}`);
    if (ctx.compliance_posture?.length) bits.push(`compliance: ${ctx.compliance_posture.join(", ")}`);
    known.push(bits.join(" · "));
  } else {
    missing.push("clearance_levels");
    missing.push("compliance_posture");
    score += 4;
  }

  // Normalize to 100
  const normalized = Math.max(0, Math.min(100, Math.round((score / max) * 100)));
  // Floor at 50 if the profile exists and the opp wasn't actively
  // disqualified — "we can't rule it out" is not a no-bid.
  const floored = Math.max(50, normalized);

  let band;
  if (floored >= 80) band = "high";
  else if (floored >= 65) band = "medium";
  else band = "low";

  return {
    score: floored,
    raw: normalized,
    max: 100,
    band,
    known,
    inferred,
    missing,
    reasoning,
  };
}

/**
 * Combine the market score (0–100, sum of the 4 dimensions in
 * pursuit-score-engine) with the company-fit score and the detected
 * signals. Returns the final verdict + a short reasoning sentence.
 *
 * Critical guard: "unknown" never becomes "NO-BID."
 */
function combineVerdict({ marketScore, partial, companyFit, capturePosition, signals, opportunity }) {
  const profileLoaded = companyFit && companyFit.score !== null;

  // Hard guards that override numeric thresholds:
  if (capturePosition?.tag === "OCI_BLOCKED") {
    return {
      verdict: "NO-BID",
      color: "#E63946",
      band: "blocked",
      composite: 0,
      reason: "OCI exclusion blocks pursuit.",
    };
  }
  if (capturePosition?.tag === "IN_FLIGHT") {
    return {
      verdict: "MONITOR",
      color: "#457B9D",
      band: "in_flight",
      composite: companyFit?.score || 50,
      reason: "Already in flight — defend current submission, do not double-pursue.",
    };
  }
  if (capturePosition?.tag === "INCUMBENT_RECOMPETE") {
    return {
      verdict: "DEFEND",
      color: "#15803D",
      band: "incumbent",
      composite: Math.max(75, companyFit?.score || 75),
      reason: "Defensive recompete — incumbency is the strongest possible position.",
    };
  }

  // No profile → never declare NO-BID. Mark as preliminary.
  if (!profileLoaded) {
    if (partial) {
      return {
        verdict: "MONITOR",
        color: "#457B9D",
        band: "no_profile_partial",
        composite: marketScore || 0,
        reason: "Generic preliminary score — sources timed out and no company profile is loaded. Complete your company profile and re-score before any bid/no-bid decision.",
      };
    }
    if (typeof marketScore === "number" && marketScore >= 65) {
      return {
        verdict: "QUALIFY",
        color: "#15803D",
        band: "no_profile_strong",
        composite: marketScore,
        reason: "Generic preliminary score — strong market signal, but no company profile is loaded. Complete your profile to convert this into a company-fit verdict.",
      };
    }
    return {
      verdict: "CAPTURE_VALIDATION",
      color: "#92710A",
      band: "no_profile_weak",
      composite: marketScore || 0,
      reason: "Generic preliminary score — market signal is thin and no company profile is loaded. Treat as capture-research required, not no-bid.",
    };
  }

  // Profile loaded — combine market signal + fit + signals.
  const signalBonus = Math.min((signals || []).length * 4, 16);
  const composite = Math.round(((marketScore || 0) * 0.55) + ((companyFit?.score || 0) * 0.45) + signalBonus);

  // Floor: if the profile is loaded and there is *any* positive signal
  // OR partial data, do not declare NO-BID.
  if ((signals || []).length > 0 && composite < 35) {
    return {
      verdict: "CAPTURE_VALIDATION",
      color: "#92710A",
      band: "signals_present",
      composite,
      reason: `${(signals || []).length} positive signal${signals.length === 1 ? "" : "s"} present (${signals.map((s) => s.tag).join(", ")}) — capture validation required, not no-bid.`,
    };
  }
  if (partial && composite < 40) {
    return {
      verdict: "MONITOR",
      color: "#457B9D",
      band: "partial_data",
      composite,
      reason: "Some upstream sources timed out — score may be understated. Monitor and re-run rather than no-bid.",
    };
  }

  if (composite >= 75) return { verdict: "PURSUE", color: "#15803D", band: "high", composite, reason: "Strong market signal and company fit." };
  if (composite >= 60) return { verdict: "QUALIFY", color: "#457B9D", band: "medium_high", composite, reason: "Material signal — qualify with capture-team validation." };
  if (composite >= 45) return { verdict: "MONITOR", color: "#92710A", band: "medium", composite, reason: "Mixed signal — monitor and re-evaluate at next catalyst." };
  if (composite >= 30) return { verdict: "CAPTURE_VALIDATION", color: "#F97316", band: "low", composite, reason: "Thin signal — capture validation required before any bid commitment." };
  return { verdict: "NO-BID", color: "#E63946", band: "very_low", composite, reason: "Both market signal and company fit are weak; no positive signals detected." };
}

// ============================================================
// Pursuit Score v2 — Recommendation State Engine (Sprint 9a Phase B)
//
// Emits one of 11 recommendation states per pursuit-score-2.0
// completion spec §2. Reads v2 subscriber_context fields
// (position_history, jv_partnerships, agency_relationships,
// editorial_calendar) with graceful v1 fallback to the existing
// classifyCapturePosition.
//
// Behind PURSUIT_SCORE_V2 feature flag. Caller in pursuit-score-engine
// switches based on flag state — when off, the v1 ladder runs unchanged.
// ============================================================

const RECOMMENDATION_STATES = {
  PRIME_DIRECT:        "PRIME_DIRECT",        // No incumbency conflict; subscriber owns vehicle, capability, agency alignment
  RECOMPETE_DEFENSE:   "RECOMPETE_DEFENSE",   // Subscriber is incumbent; defensive posture
  SUB_TO_INCUMBENT:    "SUB_TO_INCUMBENT",    // Subscriber is sub on the incumbent contract (via position_history.role=sub)
  JV_TEAMING:          "JV_TEAMING",          // Has formal JV / mentor-protégé with active partner relevant to scope
  WATCH_RFI:           "WATCH_RFI",           // RFI / sources-sought open; shaping window — not yet a bid decision
  WATCH_DRAFT_RFP:     "WATCH_DRAFT_RFP",     // Draft RFP / pre-solicitation; preparation window
  OCI_BLOCKED:         "OCI_BLOCKED",         // OCI exclusion matches the opportunity scope
  EDITORIAL_TARGET:    "EDITORIAL_TARGET",    // Platform-mode: in editorial_calendar, NOT a bid candidate
  NEW_ENTRY_LONGSHOT:  "NEW_ENTRY_LONGSHOT",  // No incumbency, no JV, no agency relationship — green-field, low odds
  NO_BID:              "NO_BID",              // On no_go_list OR explicit pass
  INSUFFICIENT_DATA:   "INSUFFICIENT_DATA",   // Profile loaded but lacks the fields needed to classify confidently
};

// State → composite-score floor/ceiling. The combineVerdictV2 function
// uses these to anchor the final composite around the state — so a
// SUB_TO_INCUMBENT can't return CAPTURE_VALIDATION just because the
// upstream USASpending call returned thin data (the 4/27 incident).
const STATE_FLOORS = {
  PRIME_DIRECT:       { floor: 70, ceiling: 100 },
  RECOMPETE_DEFENSE:  { floor: 60, ceiling: 100 },
  SUB_TO_INCUMBENT:   { floor: 60, ceiling: 95 },
  JV_TEAMING:         { floor: 55, ceiling: 95 },
  WATCH_RFI:          { floor: 40, ceiling: 70 },
  WATCH_DRAFT_RFP:    { floor: 45, ceiling: 75 },
  OCI_BLOCKED:        { floor: 0,  ceiling: 20 },
  EDITORIAL_TARGET:   { floor: 0,  ceiling: 30 },
  NEW_ENTRY_LONGSHOT: { floor: 20, ceiling: 50 },
  NO_BID:             { floor: 0,  ceiling: 20 },
  INSUFFICIENT_DATA:  { floor: 25, ceiling: 50 }, // permissive — don't bury an opp because the profile is sparse
};

/**
 * Match a position_history record against an opportunity by program
 * name token overlap (case-insensitive).
 */
function _positionMatchesOpp(position, kw) {
  if (!position || !kw) return false;
  const program = normalize(position.program || "");
  if (!program) return false;
  const programTokens = program.split(/\s+/).filter((t) => t.length > 2);
  // Match if any 3+ char token of the program name appears in the keyword
  // OR the keyword contains the full program name.
  return programTokens.some((t) => kw.includes(t)) || kw.includes(program);
}

/**
 * Match a jv_partnership against an opportunity via scope_keywords
 * or programs_in_scope arrays.
 */
function _jvMatchesOpp(jv, kw, opp_agency) {
  if (!jv || !kw) return false;
  const scopeKeywords = Array.isArray(jv.scope_keywords) ? jv.scope_keywords.map(normalize) : [];
  const programs = Array.isArray(jv.programs_in_scope) ? jv.programs_in_scope.map(normalize) : [];
  for (const k of scopeKeywords) {
    if (k && (kw.includes(k) || k.includes(kw))) return true;
  }
  for (const p of programs) {
    if (p && (kw.includes(p) || p.includes(kw))) return true;
  }
  return false;
}

/**
 * Match editorial calendar entry against an opportunity by program name.
 */
function _editorialMatchesOpp(entry, kw) {
  if (!entry || !kw) return false;
  const program = normalize(entry.program || "");
  return program && (kw.includes(program) || program.includes(kw));
}

/**
 * Classify the recommendation state for an opportunity against a v2
 * subscriber_context profile.
 *
 * @param {Object|null} ctx — normalized v2 subscriber context
 * @param {{ keyword: string, agency?: string, signals?: Array }} opp
 * @returns {{ state: string, detail: string, reference?: Object, evidence?: Array }}
 */
function classifyRecommendationState(ctx, { keyword, agency, signals } = {}) {
  if (!ctx) {
    return { state: RECOMMENDATION_STATES.INSUFFICIENT_DATA, detail: "No subscriber_context loaded — cannot classify recommendation state." };
  }
  const kw = normalize(keyword);
  if (!kw) {
    return { state: RECOMMENDATION_STATES.INSUFFICIENT_DATA, detail: "No opportunity keyword provided." };
  }

  // Priority 1 — NO_BID (on no_go_list) trumps everything else.
  const passed = (ctx.no_go_list || []).find((p) =>
    p.name && (kw.includes(normalize(p.name)) || normalize(p.name).includes(kw))
  );
  if (passed) {
    return {
      state: RECOMMENDATION_STATES.NO_BID,
      detail: `On the no-go list (${passed.reason || "reason not recorded"}).`,
      reference: passed,
    };
  }

  // Priority 2 — OCI_BLOCKED.
  const oci = (ctx.oci_exclusions || []).find((o) =>
    o.blocked_scope && normalize(o.blocked_scope).split(/\s+/).some((t) => t.length > 3 && kw.includes(t))
  );
  if (oci) {
    return {
      state: RECOMMENDATION_STATES.OCI_BLOCKED,
      detail: `OCI exclusion: ${oci.notes || oci.blocked_scope}. Cannot pursue without OCI mitigation.`,
      reference: oci,
    };
  }

  // Priority 3 — EDITORIAL_TARGET (platform mode only — when the
  // subscriber is acting as journalist/analyst on this program).
  const editorial = (ctx.editorial_calendar || []).find((e) => _editorialMatchesOpp(e, kw));
  if (editorial) {
    return {
      state: RECOMMENDATION_STATES.EDITORIAL_TARGET,
      detail: `On editorial calendar (${editorial.coverage_type || "coverage"} planned for ${editorial.next_coverage_date || "unspecified date"}). Not a bid candidate in platform mode.`,
      reference: editorial,
    };
  }

  // Priority 4 — RECOMPETE_DEFENSE (incumbent on recompete).
  const incumbent = (ctx.incumbent_positions || []).find((p) =>
    p.name && (kw.includes(normalize(p.name)) || normalize(p.name).includes(kw))
  );
  if (incumbent) {
    return {
      state: RECOMMENDATION_STATES.RECOMPETE_DEFENSE,
      detail: `Incumbent: ${incumbent.name}${incumbent.contract_number ? ` (${incumbent.contract_number})` : ""}. Defensive recompete posture.`,
      reference: incumbent,
    };
  }

  // Priority 5 — SUB_TO_INCUMBENT (v2 position_history with role=sub on
  // an active position relevant to the opportunity scope).
  const subPosition = (ctx.position_history || []).find((p) =>
    (p.role === "sub" || p.role === "teaming_partner") &&
    !p.end_date_passed &&
    _positionMatchesOpp(p, kw)
  );
  if (subPosition) {
    return {
      state: RECOMMENDATION_STATES.SUB_TO_INCUMBENT,
      detail: `Sub to ${subPosition.prime_company || "incumbent prime"} on ${subPosition.program}${subPosition.contract_number ? ` (${subPosition.contract_number})` : ""}. Capture posture: protect sub seat, position for next-cycle prime path.`,
      reference: subPosition,
    };
  }

  // Priority 6 — JV_TEAMING (v2 jv_partnerships with active partner whose
  // scope_keywords or programs_in_scope cover the opp).
  const jv = (ctx.jv_partnerships || []).find((j) => _jvMatchesOpp(j, kw, agency));
  if (jv) {
    return {
      state: RECOMMENDATION_STATES.JV_TEAMING,
      detail: `${jv.type === "sba_mentor_protege" ? "SBA mentor-protégé" : (jv.type === "jv_agreement" ? "Joint venture" : "Teaming agreement")} with ${jv.partner_company}. Active scope coverage.`,
      reference: jv,
    };
  }

  // Priority 7 — Active pursuit (IN_FLIGHT). In v2 this surfaces as
  // RECOMPETE_DEFENSE-adjacent because we don't want to recommend
  // pursuing something already in-flight. We model this as
  // RECOMPETE_DEFENSE for state semantics (defensive posture on
  // current pursuit).
  const inflight = (ctx.active_pursuits || []).find((p) => (
    (p.solicitation_number && kw.includes(normalize(p.solicitation_number))) ||
    (p.name && (kw.includes(normalize(p.name)) || normalize(p.name).includes(kw)))
  ));
  if (inflight) {
    return {
      state: RECOMMENDATION_STATES.RECOMPETE_DEFENSE,
      detail: `In-flight pursuit: ${inflight.name}${inflight.solicitation_number ? ` (${inflight.solicitation_number})` : ""}, stage: ${inflight.stage}. Defensive posture — do not recommend pursuing what's already submitted.`,
      reference: inflight,
    };
  }

  // Priority 8 — Shaping-window signals (RFI / Sources Sought / Draft RFP).
  const signalTags = Array.isArray(signals) ? new Set(signals.map((s) => s.tag)) : new Set();
  if (signalTags.has("RFI")) {
    return {
      state: RECOMMENDATION_STATES.WATCH_RFI,
      detail: "RFI / sources-sought signal detected — pre-solicitation shaping window is open.",
    };
  }
  if (signalTags.has("INDUSTRY_DAY")) {
    return {
      state: RECOMMENDATION_STATES.WATCH_DRAFT_RFP,
      detail: "Industry Day signal — RFP typically follows in 60–120 days. Preparation window.",
    };
  }

  // Priority 9 — PRIME_DIRECT (target_agencies alignment + capabilities
  // overlap + no conflicts). This is a "no obstacles, you should bid"
  // state. Requires the profile to have target_agencies and at least
  // one of {vehicle_holdings, set_aside_certifications}.
  const agencyAligned = agencyMatches(ctx.target_agencies, agency || keyword);
  const hasCertifications = Array.isArray(ctx.set_aside_certifications) && ctx.set_aside_certifications.length > 0;
  const hasVehicles = Array.isArray(ctx.vehicle_holdings) && ctx.vehicle_holdings.length > 0;
  if (agencyAligned && (hasCertifications || hasVehicles)) {
    return {
      state: RECOMMENDATION_STATES.PRIME_DIRECT,
      detail: `Direct prime path — ${agency || "agency"} is in your target list, ${hasVehicles ? "vehicle holdings" : "set-aside posture"} provides eligibility.`,
    };
  }

  // Priority 10 — INSUFFICIENT_DATA when the profile is too sparse to
  // classify confidently. Specifically: no v2 fields populated AND no
  // active_pursuits / incumbent_positions reachable.
  const v2Populated = (ctx.position_history || []).length > 0 ||
                      (ctx.jv_partnerships || []).length > 0 ||
                      (ctx.agency_relationships || []).length > 0;
  const v1Populated = (ctx.active_pursuits || []).length > 0 ||
                      (ctx.incumbent_positions || []).length > 0;
  if (!v2Populated && !v1Populated) {
    return {
      state: RECOMMENDATION_STATES.INSUFFICIENT_DATA,
      detail: "Subscriber profile is sparse (no position history, JV partnerships, active pursuits, or incumbent positions). Cannot classify recommendation state without more data.",
    };
  }

  // Default — NEW_ENTRY_LONGSHOT.
  return {
    state: RECOMMENDATION_STATES.NEW_ENTRY_LONGSHOT,
    detail: "No incumbency, JV, or agency relationship matches the opportunity. Treat as a green-field new entry with longshot odds.",
  };
}

/**
 * Apply v2 state floor/ceiling to a raw composite score.
 *
 * @param {string} state — one of RECOMMENDATION_STATES
 * @param {number} rawComposite — 0–100 from market + fit blend
 * @returns {{ verdict, color, band, composite, state, reason }}
 */
function combineVerdictV2(state, rawComposite, { reasoning } = {}) {
  const bounds = STATE_FLOORS[state] || STATE_FLOORS[RECOMMENDATION_STATES.INSUFFICIENT_DATA];
  const composite = Math.max(bounds.floor, Math.min(bounds.ceiling, Number(rawComposite) || 0));
  // Verdict label derived from state primarily, composite secondarily.
  let verdict, color, band;
  switch (state) {
    case RECOMMENDATION_STATES.PRIME_DIRECT:
    case RECOMMENDATION_STATES.SUB_TO_INCUMBENT:
    case RECOMMENDATION_STATES.JV_TEAMING:
      verdict = "PURSUE";
      color = "#15803D";
      band = "high";
      break;
    case RECOMMENDATION_STATES.RECOMPETE_DEFENSE:
      verdict = "DEFEND";
      color = "#15803D";
      band = "high";
      break;
    case RECOMMENDATION_STATES.WATCH_RFI:
    case RECOMMENDATION_STATES.WATCH_DRAFT_RFP:
      verdict = "WATCH";
      color = "#457B9D";
      band = "medium_high";
      break;
    case RECOMMENDATION_STATES.NEW_ENTRY_LONGSHOT:
      verdict = "CAPTURE_VALIDATION";
      color = "#F97316";
      band = "low";
      break;
    case RECOMMENDATION_STATES.OCI_BLOCKED:
    case RECOMMENDATION_STATES.NO_BID:
      verdict = "NO-BID";
      color = "#E63946";
      band = "very_low";
      break;
    case RECOMMENDATION_STATES.EDITORIAL_TARGET:
      verdict = "EDITORIAL_TARGET";
      color = "#6B7280";
      band = "very_low";
      break;
    case RECOMMENDATION_STATES.INSUFFICIENT_DATA:
    default:
      verdict = "INSUFFICIENT_DATA";
      color = "#6B7280";
      band = "medium";
      break;
  }
  return {
    verdict,
    color,
    band,
    composite,
    state,
    reason: Array.isArray(reasoning) && reasoning.length ? reasoning.join(" ") : `State ${state}: composite ${composite}/100.`,
  };
}

module.exports = {
  detectPositiveSignals,
  agencyMatches,
  classifyCapturePosition,
  classifyRecommendationState,
  combineVerdictV2,
  scoreCompanyFit,
  combineVerdict,
  POSITIVE_SIGNAL_PATTERNS,
  RECOMMENDATION_STATES,
  STATE_FLOORS,
};
