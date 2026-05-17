// ============================================================
// monday-move.js — Sprint 9b Phase D: Monday Move generator.
//
// Given the v2 recommendation state, the subscriber context, the
// matched opportunity (if any), the positive signals list, and the
// derived acquisition state, return an array of MondayMove items
// the engine surfaces under envelope.monday_move[].
//
// Each item shape:
//   {
//     action: string,            // imperative, references real names + dates
//     dated_trigger?: ISO date,  // when the move is meaningful
//     link?: string,             // SAM/Congress/Mary's CTA URL
//     owner_hint?: string,       // who should own it on the user's team
//   }
//
// Pure function, no I/O. Templates pull facts from position_history,
// jv_partnerships, agency_relationships so the rendered actions
// reference real partners, contract numbers, and dates — not the
// placeholder strings that scored 0 on the master sprint's acceptance.
// ============================================================

function _isoOffset(dateStr, days) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

function _findActiveSubPosition(ctx, topic) {
  const tokens = String(topic || "").toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  return (ctx?.position_history || []).find((p) => {
    if (p.role !== "sub" && p.role !== "teaming_partner") return false;
    const program = String(p.program || "").toLowerCase();
    if (!program) return false;
    return tokens.some((t) => program.includes(t)) || program.split(/\s+/).some((pt) => tokens.includes(pt));
  });
}

function _findActiveJv(ctx, topic) {
  const tokens = String(topic || "").toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  return (ctx?.jv_partnerships || []).find((j) => {
    const scope = (j.scope_keywords || []).map((k) => String(k).toLowerCase());
    const progs = (j.programs_in_scope || []).map((k) => String(k).toLowerCase());
    return scope.some((k) => tokens.includes(k) || k.includes(tokens[0] || "")) ||
           progs.some((k) => tokens.some((t) => k.includes(t)));
  });
}

function _jvTypeLabel(t) {
  if (t === "sba_mentor_protege") return "SBA mentor-protégé";
  if (t === "jv_agreement") return "joint venture";
  if (t === "teaming_agreement") return "teaming agreement";
  return "partnership";
}

/**
 * Build Monday Move items for a recommendation state + context + opportunity.
 *
 * @param {Object} params
 * @param {string} params.state           — recommendation state enum
 * @param {Object} params.context         — v2 subscriber_context
 * @param {Object} [params.opportunity]   — primary SAM opp (may be null)
 * @param {string} [params.topic]         — user keyword (for relevance match)
 * @param {string} [params.agency]        — agency override
 * @param {Array}  [params.signals]       — detectPositiveSignals output
 * @param {Object} [params.acquisition]   — deriveAcquisitionState output
 * @returns {Array<{action, dated_trigger?, link?, owner_hint?}>}
 */
function buildMondayMove({ state, context, opportunity, topic, agency, signals, acquisition } = {}) {
  const ctx = context || {};
  const opp = opportunity || null;
  const acq = acquisition || {};
  const solNum = opp && (opp.solicitation_number || opp.notice_id) || "[solicitation number]";
  const oppLink = opp && opp.url;
  const closeDate = acq.close_date || (opp && opp.response_deadline) || null;

  switch (state) {
    case "SUB_TO_INCUMBENT": {
      const sub = _findActiveSubPosition(ctx, topic) || (ctx.position_history || [])[0] || {};
      const prime = sub.prime_company || "your prime partner";
      const program = sub.program || topic || "this program";
      const draftStart = _isoOffset(closeDate, 60);
      const draftEnd = _isoOffset(closeDate, 120);
      const action = closeDate && draftStart && draftEnd
        ? `Email ${prime} capture lead this week to confirm sub role on the ${program} recompete. RFI ${solNum} closed ${closeDate} — likely draft-RFP window is ${draftStart} to ${draftEnd}. Confirm scope alignment with your current sub agreement${sub.end_date ? ` (PoP through ${sub.end_date})` : ""}.`
        : `Email ${prime} capture lead this week to confirm sub role on the ${program} recompete. Confirm scope alignment with your current sub agreement${sub.end_date ? ` (PoP through ${sub.end_date})` : ""}.`;
      return [{
        action,
        dated_trigger: _isoOffset(new Date().toISOString().slice(0, 10), 7),
        link: oppLink,
        owner_hint: "Capture lead",
      }];
    }
    case "JV_TEAMING": {
      const jv = _findActiveJv(ctx, topic) || (ctx.jv_partnerships || [])[0] || {};
      const partner = jv.partner_company || "your JV partner";
      const typeLabel = _jvTypeLabel(jv.type);
      return [{
        action: `Confirm ${typeLabel} agreement with ${partner} is current and that this scope is in-bounds. Draft a teaming-gravity memo: who else would ${partner} team with vs. you for this opportunity, and what would force the choice.`,
        dated_trigger: _isoOffset(new Date().toISOString().slice(0, 10), 7),
        link: oppLink,
        owner_hint: "BD lead + Legal",
      }];
    }
    case "WATCH_RFI": {
      const dueIn = closeDate ? _daysBetween(new Date().toISOString().slice(0, 10), closeDate) : null;
      const reviewBy = _isoOffset(closeDate, -7);
      return [{
        action: closeDate
          ? `RFI ${solNum} open through ${closeDate}${dueIn !== null ? ` (${dueIn} days)` : ""}. Draft response framing your differentiated value — focus on shaping evaluation criteria, not bidding.${reviewBy ? ` Submit by ${reviewBy} for review buffer.` : ""}`
          : `RFI ${solNum} open. Draft response framing your differentiated value — focus on shaping evaluation criteria, not bidding.`,
        dated_trigger: closeDate,
        link: oppLink,
        owner_hint: "BD lead",
      }];
    }
    case "WATCH_DRAFT_RFP": {
      return [{
        action: closeDate
          ? `Draft RFP ${solNum} comment window through ${closeDate}. Identify your top 3 evaluation-criteria pain points and submit comments. Stand up the proposal kickoff for ~30 days after the final-RFP drop.`
          : `Industry Day or Pre-Solicitation signal on ${topic || "this program"}. Final RFP typically lands 60–120 days out — stand up capture cadence now.`,
        dated_trigger: closeDate,
        link: oppLink,
        owner_hint: "Capture + Proposal lead",
      }];
    }
    case "PRIME_DIRECT": {
      const dueIn = closeDate ? _daysBetween(new Date().toISOString().slice(0, 10), closeDate) : null;
      const bidGate = _isoOffset(closeDate, -14);
      return [{
        action: closeDate
          ? `RFP ${solNum} open through ${closeDate}${dueIn !== null ? ` (${dueIn} days)` : ""}. Decision needed by ${bidGate || "[T-14]"} on bid/no-bid. Start B&P this week if pursuing.`
          : `Opportunity matches your prime path. Run the bid/no-bid decision this week; start B&P if green.`,
        dated_trigger: bidGate || closeDate,
        link: oppLink,
        owner_hint: "Capture lead + Exec sponsor",
      }];
    }
    case "RECOMPETE_DEFENSE": {
      const incumbent = (ctx.incumbent_positions || [])[0] || {};
      const contract = incumbent.contract_number || "[contract number]";
      const name = incumbent.name || topic || "your incumbent";
      return [{
        action: `Defensive recompete on ${name} (${contract}). Lock the customer-of-record relationship before draft RFP drops. Audit your past-performance citations and refresh CPARS narratives for the recompete file.`,
        dated_trigger: closeDate,
        link: oppLink,
        owner_hint: "Customer-of-record lead",
      }];
    }
    case "EDITORIAL_TARGET": {
      const ed = (ctx.editorial_calendar || []).find((e) => {
        const p = String(e.program || "").toLowerCase();
        return p && String(topic || "").toLowerCase().includes(p);
      }) || (ctx.editorial_calendar || [])[0] || {};
      const cov = ed.coverage_type || "newsletter";
      const when = ed.next_coverage_date || "[next coverage date]";
      return [{
        action: `Publish ${cov} on ${ed.program || topic || "this program"} by ${when}. Lead with the strongest current signal. Surface insights to subscribers pre-RFP — this is platform mode, not bid mode.`,
        dated_trigger: when,
        owner_hint: "Editorial",
      }];
    }
    case "OCI_BLOCKED": {
      const oci = (ctx.oci_exclusions || [])[0] || {};
      return [{
        action: `Do not pursue. Active OCI exclusion${oci.reason ? `: ${oci.reason}` : oci.blocked_scope ? ` covers ${oci.blocked_scope}` : ""}${oci.active_through ? ` through ${oci.active_through}` : ""}. Re-evaluate after the exclusion sunsets.`,
        dated_trigger: oci.active_through,
        owner_hint: "Capture lead + Legal",
      }];
    }
    case "NEW_ENTRY_LONGSHOT":
      return [{
        action: `New-entry assessment on ${topic || "this opportunity"}. No incumbency, no JV in scope, no agency relationship matches. Score the lane against your win-rate threshold before committing capture hours. Likely path: identify a prime to sub under, not a direct entry.`,
        owner_hint: "Capture lead",
      }];
    case "NO_BID":
      return [{
        action: `On your no-go list. Confirm the no-go reason still applies — if it does, document the date you re-confirmed and move on. If conditions changed, re-score.`,
        owner_hint: "Capture lead",
      }];
    case "INSUFFICIENT_DATA":
      return [{
        action: `Subscriber profile is too sparse to recommend a move on ${topic || "this opportunity"}. Backfill position_history, jv_partnerships, or agency_relationships in your subscriber context so the engine can classify on the next score.`,
        owner_hint: "Subscriber",
      }];
    default:
      return [];
  }
}

function _daysBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return null;
  const a = new Date(fromStr).getTime();
  const b = new Date(toStr).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

module.exports = { buildMondayMove };
