// ============================================================================
// lib/record-contract.js — the record contract every agent-facing record meets
// (docs/agent-platform-spec.md section 3).
//
// Every record MMT returns to an agent carries:
//   source_url     the primary public source, not an MMT page (null plus a gap
//                  entry when the record is MMT's own output)
//   retrieved_at   ISO 8601, when MMT last read the source
//   confidence     "verified" | "reported" | "stale"
//   as_of          when the underlying fact is effective, where that differs
//   gap            [{ field, reason }] for what MMT does not have, never an
//                  inferred value
//
// A record whose retrieved_at is older than its type's freshness window is
// returned with confidence "stale" so the consuming agent reports staleness
// instead of answering from it. "verified" means MMT read the primary source
// inside the window with high confidence; "reported" means the record rests on
// a secondary account or a medium-confidence read, or MMT has no read date.
// ============================================================================

const DAY_MS = 86400000;

// Freshness windows in days. The spec names the first six; the rest map MMT's
// own hand-maintained sets onto the same rule, using each set's existing
// staleness standard where the repo already has one.
const FRESHNESS_WINDOWS_DAYS = Object.freeze({
  opportunity: 1,           // spec: opportunities 24h
  vehicle_status: 7,        // spec: vehicle ordering-period status 7d
  contract_award: 7,        // spec: contract awards 7d (a live award feed)
  org_chart: 30,            // spec: org charts 30d
  state_procurement: 7,     // spec: state procurement records 7d (solicitations, addenda, module landscape)
  statutory: 90,            // spec: statutory and regulatory conditions 90d
  curated_intel: 45,        // Contract Tracker rows: the tracker's own stale threshold (scripts/validate-contract-tracker.js)
  reference_directory: 90,  // buyers, buying routes, state agency directory, cooperative vehicles, authorization paths
  calendar_event: 7,        // Pursuit Calendar rows
  engine_result: 3,         // Signal Chain, Pursuit Score, Compliance Check cards (72h cache)
  member_data: 1,           // the member's own rows: as fresh as the last write
});

const CONFIDENCE_LEVELS = Object.freeze(["verified", "reported", "stale"]);

// A pending entry that names a field: "procurement_portal_url" or
// "mes_modernization (state notice not yet read)". Anything else is prose.
const FIELD_PENDING_RE = /^([a-z_]+(?:\.[a-z_]+)*)(?:\s*\((.*)\))?$/;

/** ISO 8601 string for a Date or a parseable string; null otherwise. */
function isoOrNull(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  return Number.isNaN(Date.parse(s)) ? null : s;
}

/** Whole days between an ISO string and now (negative when in the future). */
function daysSince(iso, now) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const n = now instanceof Date ? now.getTime() : (now ? Date.parse(now) : Date.now());
  return Math.floor((n - t) / DAY_MS);
}

/** pending[] entries → gap objects. Empty and non-array → []. */
function gapsFrom(pending) {
  if (!Array.isArray(pending)) return [];
  return pending.filter((p) => p != null && String(p).trim()).map((p) => {
    const m = FIELD_PENDING_RE.exec(String(p).trim());
    if (m) return { field: m[1], reason: m[2] ? m[2].trim() : "not yet covered" };
    return { field: null, reason: String(p).trim() };
  });
}

/**
 * Confidence for a record type from its read date and MMT's base confidence.
 * @param {string} type key of FRESHNESS_WINDOWS_DAYS
 * @param {string|Date|null} retrievedAt
 * @param {string|null} base "high" | "medium" | "low" | "verified" | "reported" | null
 * @param {Date|string} [now]
 */
function confidenceFor(type, retrievedAt, base, now) {
  const windowDays = FRESHNESS_WINDOWS_DAYS[type];
  if (windowDays == null) throw new Error(`record-contract: unknown record type "${type}"`);
  const iso = isoOrNull(retrievedAt);
  if (!iso) return "reported";
  const age = daysSince(iso, now);
  if (age != null && age > windowDays) return "stale";
  if (base === "medium" || base === "low" || base === "reported") return "reported";
  return "verified";
}

/**
 * Apply the contract to one record. Existing fields are kept; the contract
 * fields are set last so a dataset's own `confidence` (high/medium) is
 * replaced by the contract vocabulary, and the original is kept as
 * `mmt_confidence` for anyone who wants the raw read.
 *
 * @param {object} record
 * @param {{type:string, sourceUrl?:string|null, retrievedAt?:string|Date|null, asOf?:string|null,
 *          baseConfidence?:string|null, pending?:string[]|null, derived?:string|null, now?:Date|string}} opts
 *   derived: when set, the record is MMT's own output (a score, a derived
 *   status); source_url is null and the gap says where the provenance lives.
 */
function contractRecord(record, opts) {
  const o = opts || {};
  const type = o.type;
  if (!FRESHNESS_WINDOWS_DAYS[type]) throw new Error(`record-contract: unknown record type "${type}"`);
  const base = o.baseConfidence != null ? o.baseConfidence : (record && record.confidence) || null;
  const retrievedAt = isoOrNull(o.retrievedAt);
  const gap = gapsFrom(o.pending != null ? o.pending : (record && record.pending));
  const sourceUrl = o.sourceUrl || null;
  if (!sourceUrl) {
    gap.push({ field: "source_url", reason: o.derived ? `MMT-derived record; provenance is ${o.derived}` : "no primary public source on file" });
  }
  if (!retrievedAt) gap.push({ field: "retrieved_at", reason: "MMT has no read date for this record" });
  const out = { ...(record || {}) };
  if (record && record.confidence != null && !CONFIDENCE_LEVELS.includes(record.confidence)) out.mmt_confidence = record.confidence;
  out.source_url = sourceUrl;
  out.retrieved_at = retrievedAt;
  out.confidence = confidenceFor(type, retrievedAt, base, o.now);
  out.as_of = isoOrNull(o.asOf) || retrievedAt;
  out.record_type = type;
  out.freshness_window_days = FRESHNESS_WINDOWS_DAYS[type];
  out.gap = gap;
  return out;
}

/** The first URL in a sources[] list, or null. */
function primarySourceUrl(record) {
  const s = record && Array.isArray(record.sources) ? record.sources.find((x) => x && x.url) : null;
  return s ? s.url : null;
}

/** The read date MMT recorded for a sourced record: sources[0].retrieved, else verified. */
function primaryRetrievedAt(record) {
  const s = record && Array.isArray(record.sources) ? record.sources.find((x) => x && (x.retrieved || x.retrieved_at)) : null;
  if (s) return s.retrieved || s.retrieved_at;
  return record && (record.verified || record.last_verified) || null;
}

/**
 * Apply the contract to a hand-maintained reference record (data/reference/*):
 * source from sources[0], read date from sources[0].retrieved or verified.
 */
function contractReferenceRecord(record, type, now, extra) {
  return contractRecord(record, {
    type,
    sourceUrl: primarySourceUrl(record),
    retrievedAt: primaryRetrievedAt(record),
    asOf: (extra && extra.asOf) || record.verified || null,
    now,
    ...(extra || {}),
  });
}

/** Summary counts an envelope can carry so an agent sees staleness at a glance. */
function confidenceSummary(records) {
  const out = { verified: 0, reported: 0, stale: 0 };
  for (const r of records || []) if (r && out[r.confidence] != null) out[r.confidence] += 1;
  return out;
}

module.exports = {
  FRESHNESS_WINDOWS_DAYS,
  CONFIDENCE_LEVELS,
  contractRecord,
  contractReferenceRecord,
  confidenceFor,
  confidenceSummary,
  gapsFrom,
  primarySourceUrl,
  primaryRetrievedAt,
  daysSince,
  isoOrNull,
};
