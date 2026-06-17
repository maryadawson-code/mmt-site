// ============================================================================
// lib/agent-data.js — owner-scoped read accessors for the Agent Access API.
//
// Every query that returns user-specific rows is hard-filtered by the token
// owner (this is how the "RLS context = user_id" intent is realized on a stack
// with no Supabase Auth). Opportunities are global premium data; tracker +
// recommended are per-owner. The Supabase client is passed in via ctx.db so
// this module never constructs a service-role client itself.
// ============================================================================

const { PAGINATION } = require("./agent-config");

/** Parse + clamp pagination. limit>MAX → { error } so the handler returns 400. */
function parsePaging(qs) {
  const q = qs || {};
  let limit = PAGINATION.DEFAULT_LIMIT;
  if (q.limit != null && q.limit !== "") {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1) return { error: "limit must be a positive integer." };
    if (n > PAGINATION.MAX_LIMIT) return { error: `limit cannot exceed ${PAGINATION.MAX_LIMIT}.` };
    limit = n;
  }
  let offset = 0;
  if (q.offset != null && q.offset !== "") {
    const n = Number(q.offset);
    if (!Number.isInteger(n) || n < 0) return { error: "offset must be a non-negative integer." };
    offset = n;
  }
  return { limit, offset };
}

function envelope(rows, total, limit, offset) {
  return { data: rows, total_count: total, has_more: offset + rows.length < total, limit, offset };
}

// ---- opportunities (global) ------------------------------------------------

function serializeOpp(r) {
  return {
    id: r.id,
    title: r.title,
    solicitation_number: r.solicitation_number,
    agency: r.agency,
    description: r.description,
    value_estimate: r.value_estimate,
    response_deadline: r.response_deadline,
    set_aside_type: r.set_aside_type,
    naics_codes: Array.isArray(r.naics_codes) ? r.naics_codes : [],
    source_url: r.source_url,
    relevance_score: r.relevance_score,
    opportunity_type: r.opportunity_type,
    small_business_eligible: r.small_business_eligible,
    ai_summary: r.ai_summary,
    scan_date: r.scan_date,
  };
}

const OPP_COLS = "id, title, solicitation_number, agency, description, value_estimate, response_deadline, set_aside_type, naics_codes, source_url, relevance_score, opportunity_type, small_business_eligible, ai_summary, scan_date";

function applyOppFilters(query, f) {
  if (f.naics) query = query.contains("naics_codes", [String(f.naics)]);
  if (f.agency) query = query.ilike("agency", `%${f.agency}%`);
  if (f.set_aside) query = query.ilike("set_aside_type", `%${f.set_aside}%`);
  if (f.posted_from) query = query.gte("scan_date", f.posted_from);
  if (f.deadline) query = query.lte("response_deadline", f.deadline);
  return query;
}

async function listOpportunities(db, filters, paging) {
  const { limit, offset } = paging;
  let countQ = applyOppFilters(db.from("opportunity_radar").select("id", { count: "exact", head: true }), filters);
  const { count } = await countQ;
  let q = applyOppFilters(db.from("opportunity_radar").select(OPP_COLS), filters)
    .order("scan_date", { ascending: false })
    .order("relevance_score", { ascending: false })
    .range(offset, offset + limit - 1);
  const { data, error } = await q;
  if (error) throw new Error(`opportunities: ${error.message}`);
  return envelope((data || []).map(serializeOpp), count || 0, limit, offset);
}

async function getOpportunity(db, id) {
  if (!/^\d+$/.test(String(id))) return null; // opportunity_radar.id is bigint identity
  const { data, error } = await db.from("opportunity_radar").select(OPP_COLS).eq("id", id).limit(1).single();
  if (error || !data) return null;
  return serializeOpp(data);
}

// ---- tracker (per-owner: mmt_watchlist by email) ---------------------------

async function listTracker(db, email, paging) {
  const { limit, offset } = paging;
  if (!email) return envelope([], 0, limit, offset);
  const { count } = await db.from("mmt_watchlist").select("entry_id", { count: "exact", head: true }).eq("email", email);
  const { data, error } = await db.from("mmt_watchlist")
    .select("entry_id, entry_title, entry_url, saved_at")
    .eq("email", email)
    .order("saved_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`tracker: ${error.message}`);
  const rows = (data || []).map((r) => ({ id: r.entry_id, title: r.entry_title, url: r.entry_url, saved_at: r.saved_at }));
  return envelope(rows, count || 0, limit, offset);
}

// ---- recommended (per-owner: recommended_cache, READ ONLY, no LLM) ---------

async function listRecommended(db, userId, paging) {
  const { limit, offset } = paging;
  const { count } = await db.from("recommended_cache").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const { data, error } = await db.from("recommended_cache")
    .select("opportunity_id, fit_score, rationale, scored_model, scored_at")
    .eq("user_id", userId)
    .order("fit_score", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`recommended: ${error.message}`);
  const rows = (data || []).map((r) => ({
    opportunity_id: r.opportunity_id, fit_score: Number(r.fit_score),
    rationale: r.rationale, scored_model: r.scored_model, scored_at: r.scored_at,
  }));
  return envelope(rows, count || 0, limit, offset);
}

module.exports = { parsePaging, listOpportunities, getOpportunity, listTracker, listRecommended };
