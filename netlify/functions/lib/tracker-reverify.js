// ============================================================
// lib/tracker-reverify.js — sourced re-verification of the hand-maintained
// Contract Tracker listing (contracts.json: status / last_verified).
//
// Why (2026-10-09): the weekly GitHub Action that was supposed to do this
// ran every Saturday with a SAM.gov key the API rejected (401
// API_KEY_INVALID on every lookup since its first run on 2026-08-24), so
// it checked nothing, wrote nothing and exited green. 51 of 66 listings
// were past 45 days on the Friday report, and the report told Mary to
// re-verify them by hand. This lib is the one implementation; the daily
// Netlify worker (contract-tracker-reverify-background.js) runs it with
// the key that works and commits the result to main, and the local CLI
// (scripts/reverify-contract-tracker.js) runs it for a dry run.
//
// HARD RULE: last_verified is bumped only for an entry that a live
// federal source answered for this run. An unanswered lookup (quota,
// 5xx, no key) is not a check. An entry with nothing a machine can look
// up (no solicitation number, no award vendor, no signal term) is
// reported as such and left to the Friday session, never stamped.
//
// Three checks, strongest first:
//   sam:solnum              the entry's solicitation number on SAM.gov
//                           (exact server-side filter); the notice's
//                           acquisition state proposes a status
//   usaspending:recipient   an awarded entry's vendor as prime on
//                           USASpending, matched to the entry by an
//                           identifier or a signal term in the award row
//   sam:title               the entry's first signal term as a SAM title
//                           filter, when it has no solicitation number
//
// Pure except for the injected `deps` (searchSAM, searchRecipients,
// deriveAcquisitionState), so tests run with no network.
// ============================================================

const RENDER = new Set(["active", "upcoming", "awarded", "closed"]);
const SAM_DAYS_BACK = 364;
const USA_MONTHS_BACK = 24;

// Pure: map a SAM acquisition state (deriveAcquisitionState) to a tracker
// status. Conservative: anything ambiguous returns null (flag, don't change).
function acqStateToStatus(state) {
  switch (state) {
    case "AWARDED": return "awarded";
    case "RFP_OPEN": return "active";
    case "RFP_CLOSED": return "active";        // proposals in, source selection
    case "RFI_OPEN": return "upcoming";
    case "DRAFT_RFP": return "upcoming";
    case "RFI_CLOSED_RECENT": return "upcoming"; // RFI done, still pre-solicitation
    default: return null;                       // RFI_CLOSED_STALE / UNKNOWN
  }
}

const SOL_RE = /\b(HT\d{2}[A-Z0-9-]{5,}|36C[0-9A-Z]{7,}|75[A-Z]\d{4,}[A-Z0-9]*|140D[0-9A-Z]{6,}|SP\d{2}[0-9A-Z]{5,}|W\d{2}[0-9A-Z]{5,})\b/gi;

function entryText(c) {
  return `${c.name || ""} ${c.description || ""} ${(c.source_urls || []).join(" ")}`;
}

// Pure: every federal solicitation / task-order number in an entry's text.
// Handles the common federal-health formats: DHA HT (HT003826RE001,
// HT0038-25-S-0001), VA 36C (36C10G26R0003), HHS 75x (75F40126SSN00100),
// Interior/DOI 140D (140D0424C0039), DoD SPxx / Wxx.
function extractSolNums(c) {
  const out = [];
  for (const m of entryText(c).matchAll(SOL_RE)) {
    const id = m[1].toUpperCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// Pure: the first solicitation number, or null.
function extractSolNum(c) {
  return extractSolNums(c)[0] || null;
}

function samOk(url) {
  const m = String(url || "").match(/sam\.gov\/(?:workspace\/contract\/)?opp\/([^/]+)/i);
  if (!m) return /^https?:\/\//i.test(url || "");
  return /^[0-9a-f]{32}$/i.test(m[1]);
}

// Pure: classify a searchSAMOpportunities() response as an upstream FAILURE
// (quota / 5xx / network / no key) versus a real answer. The helper RESOLVES
// on failure with { opportunities: [], error, rateLimited } instead of
// throwing, so without this an unanswered lookup reads as "checked, no match",
// a verification claim for a check that never happened. Returns null when
// SAM genuinely answered, a legitimate zero-result answer included.
function samFailure(res) {
  if (!res || typeof res !== "object") return { reason: "SAM lookup returned no response" };
  if (!res.error) return null;
  const rateLimited = !!res.rateLimited;
  return {
    rateLimited,
    reason: (rateLimited ? "SAM quota exhausted" : "SAM lookup error") +
      `: ${res.error}${res.resetAt ? ` (resets ${res.resetAt})` : ""}`,
  };
}

const NO_VENDOR = /^(tbd|pending|open competition|multiple|various|n\/?a|unknown|incumbent)\b/i;

// Pure: the one vendor name worth a USASpending recipient search, or null.
//   "Optum Serve (awarded Sep 30, 2026, per VA News)" -> "Optum Serve"
//   "Amwell + Leidos ($180M); Nurse Advice Line ..."  -> "Amwell"
//   "9 IDIQ holders: Agile4Vets, Arrow ARC, ..."      -> "Agile4Vets"
//   "TBD — proposals due April 3, 2026"               -> null
function primaryVendor(vendor) {
  let s = String(vendor || "").trim();
  if (!s) return null;
  if (s.includes(":")) s = s.slice(s.indexOf(":") + 1);
  s = s.split(/\s[—–-]\s/)[0];
  s = s.split(" (")[0];
  s = s.split(/\s*[+,;/]\s*|\s+and\s+/i)[0].trim();
  s = s.replace(/[()]/g, "").trim();
  if (!s || NO_VENDOR.test(s) || /^\d/.test(s) || !/[a-z]{3}/i.test(s)) return null;
  return s;
}

function norm(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function signalTerms(c) {
  return (Array.isArray(c.signal_terms) ? c.signal_terms : []).map((t) => String(t || "").trim()).filter((t) => t.length >= 4);
}

// Pure: a contract PIID in the same series as a solicitation number. VA
// and HHS keep the office, year and sequence and change the type letter
// at award: solicitation 36C10G26R0004 becomes contract 36C10G26D0004.
function sameSeries(piid, sol) {
  const a = norm(piid);
  const b = norm(sol);
  if (a.length < 13 || a.length !== b.length) return false;
  return a.slice(0, 8) === b.slice(0, 8) && a.slice(-4) === b.slice(-4);
}

// Pure: does a USASpending award row belong to this entry? An identifier
// from the entry inside the PIID (or the PIID in its series), inside the
// description, or a signal term in the description. A vendor having some
// award at the department is not evidence of THIS award.
function awardMatchesEntry(award, c) {
  const ids = extractSolNums(c).map(norm);
  const piid = norm(award && award.piid);
  const desc = String((award && award.description) || "").toUpperCase();
  if (ids.some((id) => (piid && (piid.includes(id) || sameSeries(piid, id))) || norm(desc).includes(id))) return true;
  return signalTerms(c).some((t) => desc.includes(t.toUpperCase()));
}

function samMatch(opps, sol) {
  const want = norm(sol);
  return (Array.isArray(opps) ? opps : []).find((o) =>
    norm(o.solicitation_number).includes(want) || norm(o.title).includes(want));
}

function unchecked(c, reason, extra = {}) {
  return { slug: c.slug, current: c.status, checked: false, signal: false, reason, ...extra };
}

function isoDaysAgo(today, days) {
  const t = Date.parse(today + "T00:00:00Z") - days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Check one entry against the live sources the deps provide.
 *
 * @param {object} c                      a contracts.json entry
 * @param {object} deps
 * @param {function} deps.searchSAM       searchSAMOpportunities-shaped
 * @param {function} deps.searchRecipients searchUSASpendingRecipients-shaped
 * @param {function} deps.deriveAcquisitionState
 * @param {object} [opts]
 * @param {string} [opts.today]           YYYY-MM-DD
 * @param {boolean} [opts.allowSam=true]  false once the day's scheduled SAM budget is spent
 * @param {boolean} [opts.allowUsa=true]
 * @param {string}  [opts.priority]       sam-quota priority, default "scheduled"
 */
async function checkEntry(c, deps, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const allowSam = opts.allowSam !== false;
  const allowUsa = opts.allowUsa !== false;
  const priority = opts.priority || "scheduled";
  const sol = extractSolNum(c);
  const vendor = String(c.status || "").toLowerCase() === "awarded" ? primaryVendor(c.vendor) : null;
  const term = signalTerms(c)[0] || null;
  const now = opts.now || Date.parse(today + "T12:00:00Z");

  if (!sol && !vendor && !term) {
    return unchecked(c, "no solicitation number, award vendor or signal term a machine can look up; left to the Friday session", { method: null, needs: "session" });
  }

  // 1. SAM.gov by solicitation number. When SAM cannot answer (budget spent,
  // quota, 401) an awarded entry still gets its USASpending check below; an
  // entry with no vendor is reported with SAM's reason.
  let samAnswered = false;
  let samCalled = false;
  let samNoMatchReason = null;
  let samUnavailable = null; // { reason, rateLimited }
  if (sol && !allowSam) {
    samUnavailable = { reason: "SAM.gov budget for scheduled work spent today", rateLimited: false };
  } else if (sol) {
    let res;
    samCalled = true;
    try { res = await deps.searchSAM({ solnum: sol, limit: 10, daysBack: SAM_DAYS_BACK, priority }); }
    catch (e) { res = null; samUnavailable = { reason: `SAM lookup failed: ${e.message}`, rateLimited: false }; }
    const failure = res === null ? null : samFailure(res);
    if (failure) samUnavailable = { reason: failure.reason, rateLimited: failure.rateLimited };
    const match = samUnavailable ? null : samMatch(res.opportunities || [], sol);
    if (!samUnavailable) samAnswered = true;
    if (match) {
      const acq = deps.deriveAcquisitionState(match, { now });
      const proposed = acqStateToStatus(acq.state);
      const link = match.url || match.uiLink || null;
      return {
        slug: c.slug, sol, method: "sam:solnum", samCalled: true, checked: true, signal: proposed != null,
        acq_state: acq.state, proposed, current: c.status,
        changed: proposed != null && proposed !== c.status,
        source: samOk(link) ? link : null,
        detail: `SAM.gov notice ${match.notice_id || "?"} (${acq.state}${match.response_deadline ? `, response ${String(match.response_deadline).slice(0, 10)}` : ""})`,
        reason: proposed == null ? `SAM.gov notice found but its state ${acq.state} proposes no status` : null,
      };
    }
    if (samAnswered) samNoMatchReason = `no SAM.gov notice for ${sol} posted in the last ${SAM_DAYS_BACK} days`;
  }
  const samFlags = { samCalled, rateLimited: !!(samUnavailable && samUnavailable.rateLimited) };

  // 2. USASpending for an awarded entry's vendor.
  if (vendor) {
    if (!allowUsa) return unchecked(c, "USASpending budget for this run spent", { ...samFlags, needs: "usaspending" });
    let res;
    try { res = await deps.searchRecipients({ name: vendor, agency: c.agency, limit: 25, startDate: isoDaysAgo(today, USA_MONTHS_BACK * 30), today }); }
    catch (e) { res = { awards: [], error: e.message }; }
    if (!res || res.error) {
      return unchecked(c, `USASpending lookup error: ${(res && res.error) || "no response"}`, { ...samFlags, usaCalled: true, needs: "usaspending" });
    }
    const hit = (res.awards || []).find((a) => awardMatchesEntry(a, c));
    if (hit) {
      return {
        slug: c.slug, sol, method: "usaspending:recipient", ...samFlags, usaCalled: true, checked: true, signal: true,
        acq_state: "AWARDED", proposed: "awarded", current: c.status, changed: c.status !== "awarded",
        source: hit.source_url || null,
        detail: `USASpending award ${hit.piid} to ${hit.recipient}${hit.start_date ? ` (start ${hit.start_date})` : ""}`,
        reason: null,
      };
    }
    return {
      slug: c.slug, sol, method: null, ...samFlags, usaCalled: true, checked: true, signal: false, current: c.status,
      reason: [samUnavailable && samUnavailable.reason, samNoMatchReason, `no USASpending award to ${vendor} at ${c.agency || "the agency"} matching the entry in ${USA_MONTHS_BACK} months`].filter(Boolean).join("; "),
    };
  }

  if (samUnavailable) return unchecked(c, samUnavailable.reason, { ...samFlags, needs: "sam", sol });

  // 3. SAM.gov by title, for an entry with no solicitation number.
  if (!sol && term) {
    if (!allowSam) return unchecked(c, "SAM.gov budget for scheduled work spent today", { needs: "sam", term });
    let res;
    try { res = await deps.searchSAM({ keyword: term, limit: 10, daysBack: SAM_DAYS_BACK, priority }); }
    catch (e) { return unchecked(c, `SAM lookup failed: ${e.message}`, { samCalled: true, needs: "sam", term }); }
    const failure = samFailure(res);
    if (failure) return unchecked(c, failure.reason, { samCalled: true, rateLimited: failure.rateLimited, needs: "sam", term });
    const match = (res.opportunities || []).find((o) => String(o.title || "").toUpperCase().includes(term.toUpperCase()));
    if (match) {
      const acq = deps.deriveAcquisitionState(match, { now });
      const proposed = acqStateToStatus(acq.state);
      const link = match.url || match.uiLink || null;
      return {
        slug: c.slug, sol: match.solicitation_number || null, method: "sam:title", samCalled: true, checked: true, signal: proposed != null,
        acq_state: acq.state, proposed, current: c.status,
        changed: proposed != null && proposed !== c.status,
        source: samOk(link) ? link : null,
        detail: `SAM.gov notice ${match.notice_id || "?"} titled "${String(match.title || "").slice(0, 80)}" (${acq.state})`,
        reason: proposed == null ? `SAM.gov notice found but its state ${acq.state} proposes no status` : null,
      };
    }
    return { slug: c.slug, method: null, samCalled: true, checked: true, signal: false, current: c.status, reason: `no SAM.gov notice titled "${term}" posted in the last ${SAM_DAYS_BACK} days` };
  }

  return { slug: c.slug, sol, method: null, ...samFlags, checked: true, signal: false, current: c.status, reason: samNoMatchReason || "no signal" };
}

// Stalest first, archived entries skipped, so a capped run always reaches
// the oldest listings.
function planQueue(contracts, { onlySlug } = {}) {
  return (Array.isArray(contracts) ? contracts : [])
    .filter((c) => c && c.slug && String(c.status || "").toLowerCase() !== "archived")
    .filter((c) => !onlySlug || c.slug === onlySlug)
    .sort((a, b) => String(a.last_verified || "").localeCompare(String(b.last_verified || "")));
}

/**
 * Apply results to the contracts array in place. Only an entry a live
 * source answered for (checked && signal) is touched: status change with a
 * dated note and the source link, then last_verified = today.
 * @returns {{ applied: number, changes: object[], bumped: string[] }}
 */
function applyResults(contracts, results, today) {
  const bySlug = new Map((contracts || []).map((c) => [c.slug, c]));
  const changes = [];
  const bumped = [];
  for (const r of results || []) {
    if (!r || !r.checked || !r.signal) continue;
    const c = bySlug.get(r.slug);
    if (!c) continue;
    if (r.changed && RENDER.has(r.proposed)) {
      const note = `Update ${today}: status re-verified against ${r.method.startsWith("sam") ? "SAM.gov" : "USASpending"} (${r.acq_state}); was "${c.status}", now "${r.proposed}". `;
      c.description = note + String(c.description || "");
      changes.push({ slug: c.slug, from: c.status, to: r.proposed, method: r.method, detail: r.detail });
      c.status = r.proposed;
      if (r.source) {
        c.source_urls = Array.isArray(c.source_urls) ? c.source_urls : [];
        if (!c.source_urls.includes(r.source)) c.source_urls.unshift(r.source);
      }
    }
    c.last_verified = today;
    c.verified_by = r.method;
    if (r.detail) c.verification_detail = r.detail;
    bumped.push(c.slug);
  }
  return { applied: bumped.length, changes, bumped };
}

// One-line tally of why entries went unchecked, for the run record and the
// Friday email.
function tallyUnchecked(results) {
  const tally = {};
  for (const r of results || []) {
    if (!r || r.checked) continue;
    const key = r.needs || "other";
    tally[key] = (tally[key] || 0) + 1;
  }
  return tally;
}

module.exports = {
  RENDER,
  SAM_DAYS_BACK,
  acqStateToStatus,
  extractSolNum,
  extractSolNums,
  samOk,
  samFailure,
  primaryVendor,
  sameSeries,
  awardMatchesEntry,
  checkEntry,
  planQueue,
  applyResults,
  tallyUnchecked,
};
