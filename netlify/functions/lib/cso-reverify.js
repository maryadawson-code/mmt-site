// ============================================================
// lib/cso-reverify.js — re-verification of the CSO Areas of Interest
// registry (data/cso-aois.json) against the CSO notices on SAM.gov.
//
// A CSO is a standing framework; its notice on SAM.gov carries the
// response window (active_through) and an active flag. Each registry
// entry names its solicitation number(s) in cso_number
// ("HT0038-25-S-0001 / HT003825SC001"). One exact solnum lookup per
// number, stopping at the first match, is the contradiction check:
//   - notice active and its response deadline agrees with active_through:
//     the framework stands; bump the CSO and every AoI that is not in a
//     terminal state (awarded / cancelled never rot, nothing about them
//     can change);
//   - notice active with a different deadline: the registry is wrong;
//     correct active_through, note the change, bump;
//   - notice archived or inactive: no bump; the AoIs may still be live
//     under a successor, which is a read for the Friday session.
// An AoI's own deadline lives in the notice attachments, which the API
// does not return, so an "open" AoI is bumped only on the parent check
// and the validator's past-due-open hard failure stays the guard.
// ============================================================

const { samFailure, samOk } = require("./tracker-reverify");

const TERMINAL = new Set(["awarded", "cancelled"]);

function isTerminalAoi(aoi) {
  return TERMINAL.has(String((aoi && aoi.status) || "").toLowerCase());
}

function csoSolNums(cso) {
  return String((cso && cso.cso_number) || "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9-]{8,}$/i.test(s));
}

function norm(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function dayOf(v) {
  const s = String(v || "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

async function checkCso(cso, deps, opts = {}) {
  const priority = opts.priority || "scheduled";
  const nums = csoSolNums(cso);
  const base = { parent_slug: cso.parent_slug, cso_number: cso.cso_number, checked: false, signal: false };
  if (!nums.length) return { ...base, reason: "no solicitation number in cso_number", needs: "session" };
  if (opts.allowSam === false) return { ...base, reason: "SAM.gov budget for scheduled work spent today", needs: "sam" };

  let samCalls = 0;
  for (const sol of nums) {
    let res;
    try { samCalls += 1; res = await deps.searchSAM({ solnum: sol, limit: 10, daysBack: 364, priority }); }
    catch (e) { return { ...base, samCalls, reason: `SAM lookup failed: ${e.message}`, needs: "sam" }; }
    const failure = samFailure(res);
    if (failure) return { ...base, samCalls, reason: failure.reason, rateLimited: failure.rateLimited, needs: "sam" };
    const match = (res.opportunities || []).find((o) => norm(o.solicitation_number) === norm(sol) || norm(o.solicitation_number).includes(norm(sol)));
    if (!match) continue;
    const active = String(match.active || "").toLowerCase();
    const inactive = active === "no" || !!dayOf(match.archive_date) && dayOf(match.archive_date) < (opts.today || new Date().toISOString().slice(0, 10));
    const deadline = dayOf(match.response_deadline);
    const link = match.url || null;
    return {
      ...base, samCalls, checked: true, signal: !inactive, sol,
      notice_id: match.notice_id || null, active: active || null, archive_date: dayOf(match.archive_date), response_deadline: deadline,
      source: samOk(link) ? link : null,
      deadline_changed: !!deadline && !!cso.active_through && deadline !== cso.active_through,
      reason: inactive ? `SAM.gov notice ${match.notice_id || sol} is no longer active (${active || "archived"})` : null,
      detail: `SAM.gov notice ${match.notice_id || "?"} for ${sol}${deadline ? `, response through ${deadline}` : ""}${active ? `, active ${active}` : ""}`,
    };
  }
  return { ...base, samCalls, checked: true, signal: false, reason: `no SAM.gov notice for ${nums.join(" / ")} posted in the last 364 days` };
}

/**
 * Apply CSO results to the registry in place. Returns what moved.
 */
function applyCsoResults(registry, results, today) {
  const bySlug = new Map(((registry && registry.csos) || []).map((c) => [c.parent_slug, c]));
  const changes = [];
  const bumped = [];
  for (const r of results || []) {
    if (!r || !r.checked || !r.signal) continue;
    const cso = bySlug.get(r.parent_slug);
    if (!cso) continue;
    if (r.deadline_changed) {
      changes.push({ parent_slug: cso.parent_slug, field: "active_through", from: cso.active_through, to: r.response_deadline });
      cso.aoi_watch_note = `Update ${today}: SAM.gov notice ${r.notice_id || r.sol} now carries a response deadline of ${r.response_deadline} (the registry had ${cso.active_through}). ` + String(cso.aoi_watch_note || "");
      cso.active_through = r.response_deadline;
    }
    if (r.source && Array.isArray(cso.source_urls) && !cso.source_urls.includes(r.source)) cso.source_urls.unshift(r.source);
    cso.last_verified = today;
    cso.verified_by = "sam:solnum";
    if (r.detail) cso.verification_detail = r.detail;
    bumped.push(cso.parent_slug);
    for (const a of cso.aois || []) {
      if (isTerminalAoi(a)) continue;
      a.last_verified = today;
      a.verified_by = "sam:parent-notice";
      bumped.push(`${cso.parent_slug}/aoi:${a.aoi_id}`);
    }
  }
  return { applied: bumped.length, changes, bumped };
}

module.exports = { TERMINAL, isTerminalAoi, csoSolNums, checkCso, applyCsoResults };
