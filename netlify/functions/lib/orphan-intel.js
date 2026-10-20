// ============================================================
// lib/orphan-intel.js — reconcile contract_intel rows whose contract_name
// is not in the refresh roster.
//
// contract-intel-refresh-background upserts by contract_name using the
// roster (non-archived contracts.json names), so a row under a drifted
// name is never refreshed again: it ages until the Friday report lists it
// as orphaned and someone runs scripts/reconcile-orphan-intel.js by hand.
// Since 2026-10-09 the daily refresh runs this plan itself before its
// roster loop, so a rename in contracts.json (the 2026-10-05 CCN Dental
// rename, "CCN Dental (36C10G26R0004)" to "CCN Next Gen Dental
// (36C10G26R0004)") is reconciled the next morning, not next quarter.
//
// Resolution order, each validated against the live roster:
//   1. an explicit alias (ALIASES below);
//   2. the dash / case / whitespace normalized name;
//   3. a solicitation or task-order number both names carry, when exactly
//      one roster name carries it;
//   4. the name with its parenthetical dropped, when exactly one roster
//      name matches the same way.
// A canonical row that already exists makes the orphan a stale DUPLICATE
// (delete); otherwise the orphan is the only copy and is RENAMED so the
// refresh adopts it. An orphan nothing resolves is reported, never
// guess-deleted.
//
// Pure planning (planOrphans) so tests need no Supabase; applyOrphanPlan
// writes and logs one ops_event per action.
// ============================================================

const ALIASES = {
  "VA Health Connect": "VA Health Connect / IHT 2.0",
  "TRICARE Managed Care Support (MCS) Contracts": "TRICARE Managed Care Support - T-5 (MCS)",
  "T4NG / T4NG2 (VA IT Services)": "T4NG2 (VA IT Services)",
  "Defense Health Agency Telehealth Programs": "DHA Telehealth Programs",
  "TRICARE Managed Care Support — T-5 (MCS)": "TRICARE Managed Care Support - T-5 (MCS)",
  "VA HELM / SCMDSO (Healthcare Environment and Logistics Management — Supply Chain Management DevSecOps and Integration)":
    "VA HELM / SCMDSO (Healthcare Environment and Logistics Management)",
};

const ID_RE = /\b(?:[0-9]{2}[A-Z0-9]{2,}[0-9]{2}[A-Z][0-9]{4,}|HT[0-9]{4}-?[0-9]{2}-?[A-Z]-?[0-9]{4}|75[A-Z0-9]{8,}|140D[0-9A-Z]{6,})\b/g;

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[‒–—―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function identifiers(name) {
  return [...new Set((String(name || "").toUpperCase().match(ID_RE) || []).map((id) => id.replace(/-/g, "")))];
}

function stripParenthetical(name) {
  return norm(String(name || "").replace(/\s*\([^)]*\)\s*/g, " "));
}

function ageDays(iso, now = Date.now()) {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / 86400000);
}

function onlyOne(list) {
  return list.length === 1 ? list[0] : null;
}

/** Resolve one orphan name to a roster name, or null. */
function resolveCanonical(name, rosterNames, aliases = ALIASES) {
  const roster = [...rosterNames];
  const alias = aliases[name];
  if (alias && rosterNames.has(alias)) return { canonical: alias, via: "alias" };
  const byNorm = roster.find((r) => norm(r) === norm(name));
  if (byNorm) return { canonical: byNorm, via: "normalized" };
  const ids = identifiers(name);
  if (ids.length) {
    const hit = onlyOne(roster.filter((r) => identifiers(r).some((id) => ids.includes(id))));
    if (hit) return { canonical: hit, via: "identifier" };
  }
  const bare = stripParenthetical(name);
  if (bare.length >= 8) {
    const hit = onlyOne(roster.filter((r) => stripParenthetical(r) === bare));
    if (hit) return { canonical: hit, via: "parenthetical" };
  }
  return null;
}

/**
 * @param {Array<{contract_name:string,last_updated?:string}>} rows  every contract_intel row
 * @param {Iterable<string>} rosterNames
 * @returns {{delete: object[], rename: object[], review: object[]}}
 */
function planOrphans(rows, rosterNames, { aliases = ALIASES, now = Date.now() } = {}) {
  const roster = new Set(rosterNames);
  const byName = new Map((rows || []).map((r) => [r.contract_name, r]));
  const plan = { delete: [], rename: [], review: [] };
  if (roster.size === 0) return plan;
  for (const o of rows || []) {
    if (!o || !o.contract_name || roster.has(o.contract_name)) continue;
    const resolved = resolveCanonical(o.contract_name, roster, aliases);
    if (!resolved) { plan.review.push({ name: o.contract_name, age: ageDays(o.last_updated, now) }); continue; }
    const canonicalRow = byName.get(resolved.canonical);
    const entry = { name: o.contract_name, canonical: resolved.canonical, via: resolved.via, orphanAge: ageDays(o.last_updated, now) };
    if (canonicalRow) plan.delete.push({ ...entry, canonAge: ageDays(canonicalRow.last_updated, now) });
    else plan.rename.push(entry);
  }
  return plan;
}

/**
 * Execute a plan. Supabase calls resolve with { error }; every one is checked.
 * @returns {{deleted:number, renamed:number, failed:number, review:number}}
 */
async function applyOrphanPlan(supabase, plan, { sourceFunction = "orphan-intel", log = console } = {}) {
  const out = { deleted: 0, renamed: 0, failed: 0, review: plan.review.length };
  const event = async (details) => {
    const { error } = await supabase.from("ops_events").insert({
      event_type: "contract_intel_orphan_reconciled",
      source_function: sourceFunction,
      error_signature: details.action === "rename" ? "orphan_renamed" : "orphan_deleted",
      details,
    });
    if (error) log.warn(`orphan-intel: ops_event insert failed: ${error.message}`);
  };

  for (const d of plan.delete) {
    const { error } = await supabase.from("contract_intel").delete().eq("contract_name", d.name);
    if (error) { log.error(`orphan-intel: DELETE failed for "${d.name}": ${error.message}`); out.failed++; continue; }
    out.deleted++;
    await event({ action: "delete", orphan: d.name, canonical: d.canonical, via: d.via, orphan_age_days: d.orphanAge, canonical_age_days: d.canonAge });
  }

  for (const r of plan.rename) {
    // The canonical row may have appeared since the plan was made (a
    // concurrent refresh); renaming onto it would collide on contract_name.
    const { data: exists, error: lookErr } = await supabase
      .from("contract_intel").select("contract_name").eq("contract_name", r.canonical).maybeSingle();
    if (lookErr) { log.error(`orphan-intel: lookup failed for "${r.canonical}": ${lookErr.message}`); out.failed++; continue; }
    if (exists) {
      const { error } = await supabase.from("contract_intel").delete().eq("contract_name", r.name);
      if (error) { log.error(`orphan-intel: DELETE (race) failed for "${r.name}": ${error.message}`); out.failed++; continue; }
      out.deleted++;
      await event({ action: "delete_race", orphan: r.name, canonical: r.canonical, via: r.via, orphan_age_days: r.orphanAge });
      continue;
    }
    const { error } = await supabase.from("contract_intel").update({ contract_name: r.canonical }).eq("contract_name", r.name);
    if (error) { log.error(`orphan-intel: RENAME failed for "${r.name}": ${error.message}`); out.failed++; continue; }
    out.renamed++;
    await event({ action: "rename", orphan: r.name, canonical: r.canonical, via: r.via, orphan_age_days: r.orphanAge });
  }
  return out;
}

module.exports = { ALIASES, norm, identifiers, resolveCanonical, planOrphans, applyOrphanPlan };
