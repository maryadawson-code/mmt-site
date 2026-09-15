// ============================================================
// federal-data-apis.js — Direct API integrations for federal data
//
// Queries USASpending, SAM.gov, Federal Register, and GAO
// directly instead of relying on web search to find this data.
// Used by MarketPulse research pipeline to enrich reports.
//
// APIs used (all public, no auth unless noted):
//   1. USASpending.gov v2 — contract awards, obligations, vendors
//   2. SAM.gov Opportunities — active solicitations (needs API key)
//   3. Federal Register — proposed/final rules, notices
//   4. GAO Reports — oversight and audit findings
// ============================================================

const SAM_API_KEY = process.env.SAM_GOV_API_KEY || "";

/**
 * Search USASpending.gov for contract awards.
 * No auth required. POST endpoint.
 *
 * @param {Object} params
 * @param {string} params.keyword - Search keyword
 * @param {string} [params.agency] - Agency name (e.g., "Department of Veterans Affairs")
 * @param {string[]} [params.naics] - NAICS codes to filter
 * @param {string} [params.startDate] - YYYY-MM-DD
 * @param {string} [params.endDate] - YYYY-MM-DD
 * @param {number} [params.limit] - Max results (default 20)
 * @returns {Promise<{awards: Array, total: number, error?: string}>}
 */
const { extractSearchTerms, searchPhrase, keywordLadder, obligationsIntent } = require("./query-terms");
// 2026-09-13: SAM.gov's daily quota ledger + response cache, GAO via its
// feed (gao.gov 403s every search path from a server), and record-level
// relevance so a loose full-text hit never becomes a cited source.
const { reserveSam, markSamExhausted, quotaReason, dailyQuota } = require("./sam-quota");
const { cached, cacheKey, cacheGet, cacheSet } = require("./fetch-cache");
const { searchGaoFeed } = require("./gao-feed");
const { filterRelevant } = require("./relevance");
const SAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TOPTIER_REJECTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// ONE agency registry for every filter below (27 agencies). Before it, each
// API had its own hand-typed table covering 5 to 8 agencies, so a question
// about FDA, CDC, HRSA, ARPA-H, ONC, the Army or NASA got no agency filter
// at all, or the wrong parent department. See lib/federal-agencies.js.
const {
  usaspendingAgencyFilter,
  hasSubtier,
  samDeptName,
  federalRegisterSlugs,
  usaspendingToptierCode,
} = require("./federal-agencies");

/**
 * Keyword for the award/opportunity searches, derived from a question or
 * topic. Strips question scaffolding, agency wording and generic
 * procurement nouns and corrects domain misspellings (2026-09-10: the raw
 * sentence "Tell me all about data governence awards in the DHA" was being
 * sent verbatim as the USASpending keyword). Never falls back to the raw
 * sentence: when nothing specific survives it returns the content tokens,
 * or "" so the caller runs an agency-filtered search with no keyword.
 */
function deriveKeywords(topic) {
  return searchPhrase(topic).substring(0, 120);
}

// At most two keyword attempts per fan-out. Rung 0 is the subscriber's own
// wording; rung 1 is the most specific term (or no keyword). Bounded because
// the whole federal fan-out sits under an 8s timeout in premium-assistant.
const MAX_KEYWORD_ATTEMPTS = 2;
// Each rung may widen from a sub-agency to its department ONCE, so the
// ceiling on spending_by_award calls for one question is two per rung.
// Rungs and widenings are counted separately (2026-09-14 review): charging
// the widening against a two-call cap meant a DHA question whose full phrase
// missed at both tiers never reached the relaxed rung, which is the "keyword
// relaxes, it does not disappear" rule reversed. TIMEOUTS_MS.awards is the
// wall-clock bound; live calls answered in 0.1s to 1.4s each.
const MAX_AWARD_CALLS = MAX_KEYWORD_ATTEMPTS * 2;

// 2026-09-14: one slow upstream used to hold the whole bundle until
// premium-assistant's 8s fan-out timeout dropped every federal result at
// once. Each sub-call now has its own bound and resolves to
// { ...emptyShape, error: "timeout" } on its own, so a stalled SAM.gov
// never costs the USASpending rows that answered in 100ms.
const TIMEOUTS_MS = {
  awards: 7000,          // the keyword ladder, widening included
  sam: 4000,
  federal_register: 4000,
  gao: 4000,
  agency_totals: 3000,
  recipients: 4000,
  categories: 3000,
  obligations: 4000,
};
function bounded(promise, ms, emptyShape) {
  let timer = null;
  const onTimeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ...emptyShape, error: "timeout", timeout_ms: ms }), ms);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
  const guarded = Promise.resolve(promise).catch((err) => ({ ...emptyShape, error: err && err.message ? err.message : String(err) }));
  return Promise.race([guarded, onTimeout]).finally(() => { if (timer) clearTimeout(timer); });
}

// 2026-09-15: USASpending answered cold queries in 3s to 40s+ (measured live:
// one T4NG2 body ran past 40s, then answered in 4s once USASpending had it
// warm). Three of that day's five subscriber turns lost USASpending at the
// bound, and "try again" failed the same way because the late answer was
// thrown away. Every USASpending search in the fan-out now goes through
// usaGuarded():
//   1. the same query already answered today (UTC day, the day the request
//      body's end_date carries) is served with no request;
//   2. a live answer is saved when it lands, even after the bound stopped
//      waiting for it, so the retry and the next subscriber are warm;
//   3. when the live query times out or errors, the last good answer to the
//      SAME query (at most USA_LAST_GOOD_TTL_MS old) is served, marked
//      stale with the day it was fetched, and the context block says so.
// A stale copy is never widened, merged or re-dated.
const USA_FRESH_TTL_MS = 26 * 60 * 60 * 1000; // the key carries the day; TTL only bounds storage
const USA_LAST_GOOD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_READ_BOUND_MS = 500;

function readBounded(key) {
  let timer = null;
  const miss = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), CACHE_READ_BOUND_MS);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([cacheGet(key).catch(() => null), miss]).finally(() => { if (timer) clearTimeout(timer); });
}

const isAnswer = (v) => !!(v && typeof v === "object" && !v.error);

async function usaGuarded(namespace, parts, run, { ms, emptyShape, today }) {
  const day = todayIso(today);
  const freshKey = cacheKey(`usa-${namespace}`, day, ...parts);
  const lastGoodKey = cacheKey(`usa-${namespace}-lastgood`, ...parts);
  // Both reads start together so a fallback costs no time after the bound.
  const lastGoodRead = readBounded(lastGoodKey);
  const fresh = await readBounded(freshKey);
  if (isAnswer(fresh)) return { ...fresh, cached: true };

  const live = Promise.resolve().then(run).then(async (value) => {
    if (isAnswer(value)) {
      await Promise.all([
        cacheSet(freshKey, value, USA_FRESH_TTL_MS),
        cacheSet(lastGoodKey, { value, fetched_on: day }, USA_LAST_GOOD_TTL_MS),
      ]);
    }
    return value;
  });
  const out = await bounded(live, ms, emptyShape);
  if (!out || !out.error) return out;
  const lastGood = await lastGoodRead;
  if (lastGood && isAnswer(lastGood.value) && lastGood.fetched_on) {
    return { ...lastGood.value, stale: true, fetched_on: lastGood.fetched_on, live_error: out.error };
  }
  return out;
}

const money = (n) => `$${((Number(n) || 0) / 1e6).toFixed(2)}M`;
// How many rows matched, in words the model can quote. An exact count comes
// from the count endpoint or a short page; a full page whose count call
// failed is described, never numbered (the page length is not a match count).
function describeMatchCount(result) {
  const n = result && Array.isArray(result.awards) ? result.awards.length : 0;
  const total = result && Number.isFinite(Number(result.total)) && result.total !== null ? Number(result.total) : null;
  const exact = !(result && (result.total_exact === false || (result.has_more && (total === null || total < n))));
  if (exact) return `${total !== null && total > 0 ? total : n} matching`;
  return `the top ${n} by award amount (more matches exist beyond this page; the exact count was not available)`;
}
const todayIso = (today) => (/^\d{4}-\d{2}-\d{2}$/.test(String(today || "")) ? String(today) : new Date().toISOString().slice(0, 10));

// Fields every award search asks for, and the one mapping every award row
// goes through, so the keyword search and the recipient search cannot
// drift (description + real award link matter to the model: 2026-09-13).
// Only names the Contract Award mapping recognizes (verified live
// 2026-09-14 against spending_by_award): an unknown field name answers
// 200 with null on every row, exactly like an invented one. "Total
// Obligated Amount", "NAICS Code", "NAICS Description" and "Type of Set
// Aside" were all unknown, so every row printed "$0.00M obligated",
// "NAICS n/a" and "Set-aside: none" beside a set-aside-filtered scope
// line. NAICS and PSC come back as { code, description }; "Total Outlays"
// is the money paid out to date.
const AWARD_FIELDS = [
  "Award ID", "Recipient Name", "Award Amount", "Total Outlays",
  "Description", "Start Date", "End Date", "Awarding Agency",
  "Awarding Sub Agency", "Contract Award Type", "NAICS", "PSC",
  "generated_internal_id",
];

function mapAward(r) {
  return {
    piid: r["Award ID"] || "unknown",
    recipient: r["Recipient Name"] || "",
    award_amount: r["Award Amount"] || 0,
    outlays: Number(r["Total Outlays"]) || 0,
    description: (r["Description"] || "").substring(0, 200),
    start_date: r["Start Date"] || "",
    end_date: r["End Date"] || "",
    agency: r["Awarding Agency"] || "",
    sub_agency: r["Awarding Sub Agency"] || "",
    award_type: r["Contract Award Type"] || "",
    naics: (r.NAICS && r.NAICS.code) || "",
    naics_desc: (r.NAICS && r.NAICS.description) || "",
    psc: (r.PSC && r.PSC.code) || "",
    // usaspending.gov/award/<PIID> is a dead link (404 on the API and the
    // page); the award page wants the generated id. Fall back to the
    // keyword search page, which resolves for any PIID.
    source_url: r.generated_internal_id
      ? `https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}`
      : `https://www.usaspending.gov/keyword_search/${encodeURIComponent(r["Award ID"] || "")}`,
  };
}

/**
 * Exact match count for a spending_by_award filter set. The page endpoint's
 * page_metadata carries hasNext and no total (verified live 2026-09-14), so
 * a full page said nothing about how many rows matched and the context
 * block printed the page length (20) as the match count while the real
 * count for "telehealth" at VA was 105. spending_by_award_count takes the
 * same filters, needs no key or quota, and answered in 0.5s to 1.3s live.
 * Returns null when it cannot answer; the caller then says "more exist"
 * instead of printing a number.
 */
async function countUSASpendingAwards(filters) {
  try {
    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award_count/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, subawards: false }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const n = data && data.results ? Number(data.results.contracts) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    console.error("USASpending spending_by_award_count error:", err.message);
    return null;
  }
}

/**
 * Page result -> { awards, total, has_more, total_exact }. A short page IS
 * the count (no second call). A full page asks the count endpoint; if that
 * fails, total is null and has_more true, and the context block says more
 * matches exist rather than presenting the page length as a match count.
 */
async function withMatchCount(data, awards, filters) {
  const hasMore = !!(data && data.page_metadata && data.page_metadata.hasNext);
  if (!hasMore) return { awards, total: awards.length, has_more: false, total_exact: true };
  const count = await countUSASpendingAwards(filters);
  if (count !== null && count >= awards.length) return { awards, total: count, has_more: true, total_exact: true };
  return { awards, total: null, has_more: true, total_exact: false };
}

/**
 * Awards where the RECIPIENT's name matches (the vendor as prime). The
 * keyword search matches descriptions, which is how a product bought
 * through resellers shows up ("NASA SEWP ORDER FOR GETWELL NETWORK" to
 * Thundercat); this finds the vendor's own awards ("GETWELLNETWORK INC").
 * Both together answer "all awards tied to the product regardless of who
 * got them". USASpending has no quota, so this is a free extra call.
 */
async function searchUSASpendingRecipients({ name, agency, limit = 15, startDate = "2022-10-01", today }) {
  const q = String(name || "").trim().slice(0, 60);
  if (q.length < 3) return { awards: [], total: 0, skipped: "no name" };
  const filters = {
    recipient_search_text: [q],
    award_type_codes: ["A", "B", "C", "D"],
    time_period: [{ start_date: startDate, end_date: todayIso(today) }],
  };
  if (agency) {
    const f = usaspendingAgencyFilter(agency, { tier: "toptier" });
    if (f) filters.agencies = [f];
  }
  try {
    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, fields: AWARD_FIELDS, limit, page: 1, sort: "Award Amount", order: "desc", subawards: false }),
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      return { awards: [], total: 0, name: q, error: `USASpending API ${res.status}${detail ? `: ${detail}` : ""}` };
    }
    const data = await res.json();
    const awards = (data.results || []).map(mapAward);
    return { ...(await withMatchCount(data, awards, filters)), name: q };
  } catch (err) {
    return { awards: [], total: 0, name: q, error: err.message };
  }
}

/**
 * Contract obligations to recipients matching `name`, one row per fiscal
 * year, from USASpending's spending_over_time endpoint (shape verified live
 * 2026-09-14: POST { group: "fiscal_year", filters } answers
 * results[].aggregated_amount keyed by time_period.fiscal_year). The total
 * is computed HERE so the model quotes a figure instead of adding rows.
 * A window that enters a fiscal year mid-way returns a partial year; the
 * context block says so.
 */
async function searchRecipientObligationsByYear({ name, agency, since, today }) {
  const q = String(name || "").trim().slice(0, 60);
  if (q.length < 3) return { years: [], total: 0, skipped: "no name" };
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(since || "")) ? since : "2022-10-01";
  const end = todayIso(today);
  const filters = {
    recipient_search_text: [q],
    award_type_codes: ["A", "B", "C", "D"],
    time_period: [{ start_date: start, end_date: end }],
  };
  const f = agency ? usaspendingAgencyFilter(agency, { tier: "toptier" }) : null;
  if (f) filters.agencies = [f];
  try {
    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_over_time/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "fiscal_year", filters }),
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      return { years: [], total: 0, name: q, since: start, until: end, error: `USASpending API ${res.status}${detail ? `: ${detail}` : ""}` };
    }
    const data = await res.json();
    // spending_over_time answers a ROW PER YEAR at $0 when no recipient
    // carries the name (verified live 2026-09-14 for "telehealth"), unlike
    // spending_by_award, which answers nothing. A zero year is not a figure
    // to quote; when every year is zero the name matched no vendor.
    const years = (data.results || [])
      .map((r) => ({ fiscal_year: Number(r.time_period && r.time_period.fiscal_year) || null, obligated: Number(r.aggregated_amount) || 0 }))
      .filter((y) => y.fiscal_year && y.obligated > 0)
      .sort((a, b) => a.fiscal_year - b.fiscal_year);
    const total = years.reduce((sum, y) => sum + y.obligated, 0);
    if (!years.length) return { name: q, since: start, until: end, agency_scope: f ? f.name : null, years: [], total: 0, skipped: "no recipient matched" };
    return { name: q, since: start, until: end, agency_scope: f ? f.name : null, years, total };
  } catch (err) {
    console.error("USASpending spending_over_time error:", err.message);
    return { years: [], total: 0, name: q, since: start, until: end, error: err.message };
  }
}

async function searchUSASpending({ keyword, agency, naics, startDate, endDate, limit = 20, setAside, today, _tier, _budget }) {
  // USASpending Contract Award mappings: `filters.keyword` (singular) is
  // deprecated and silently rejected; `keywords` (plural array) is the
  // current shape. Empty/missing keyword: omit the filter rather than
  // pass `[""]`, which the API also rejects.
  const filters = {};
  if (keyword && String(keyword).trim()) {
    filters.keywords = [String(keyword).trim()];
  }
  // Restrict to contract awards (Definitive Contract, Purchase Order,
  // Delivery Order, BPA Call). Excludes grants, loans, IDV parents.
  filters.award_type_codes = ["A", "B", "C", "D"];

  if (agency) {
    // USASpending agencies filter accepts `{type, tier, name}` only.
    // `toptier_code` is rejected ("Unexpected field 'toptier_code' in
    // parameter filters|agencies"). Map every supported input — short
    // alias OR full name — to the canonical toptier name. Sub-agencies
    // (DHA, CMS, NIH, IHS) roll up to their parent toptier; the
    // keyword filter narrows further.
    // Registry-driven: sub-agency filter when the agency has one (DHA, CMS,
    // NIH, IHS, FDA, CDC, HRSA, VHA, Army, Navy...), department otherwise.
    const agencyFilter = usaspendingAgencyFilter(agency, { tier: _tier });
    if (agencyFilter) filters.agencies = [agencyFilter];
  }
  const usedSubtier = !!(filters.agencies && filters.agencies[0] && filters.agencies[0].tier === "subtier") && hasSubtier(agency);
  const retryToptier = () => searchUSASpending({ keyword, agency, naics, startDate, endDate, limit, setAside, today, _tier: "toptier", _budget });
  // MAX_AWARD_CALLS is a ceiling (two calls per rung: the sub-agency, then
  // its department once). The ladder counts rungs, not calls, so a widening
  // never costs a rung; the ceiling only bites on a caller-supplied budget.
  const budgetLeft = () => !_budget || _budget.used < _budget.max;

  if (naics && naics.length > 0) {
    filters.naics_codes = naics.map(String);
  }

  // "small business", "SDVOSB", "8(a)"... travel as USASpending's
  // set_aside_type_codes (lib/query-terms.js), never as keywords.
  if (Array.isArray(setAside) && setAside.length > 0) {
    filters.set_aside_type_codes = setAside.map(String);
  }

  if (startDate || endDate) {
    filters.time_period = [{
      start_date: startDate || "2024-01-01",
      end_date: endDate || todayIso(today),
    }];
  }

  if (!budgetLeft()) return { awards: [], total: 0, skipped: "award call budget spent" };
  if (_budget) _budget.used += 1;

  try {
    const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        fields: AWARD_FIELDS,
        limit,
        page: 1,
        // "Award Amount" is the valid sort key in the Contract Award
        // mappings. "Total Obligated Amount" returns HTTP 400 with
        // {"detail":"Sort value 'Total Obligated Amount' not found in
        // Contract Award mappings"}.
        sort: "Award Amount",
        order: "desc",
        subawards: false,
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.text();
        try {
          const json = JSON.parse(body);
          detail = json.detail || json.message || body.slice(0, 200);
        } catch {
          detail = body.slice(0, 200);
        }
      } catch { /* ignore */ }
      const message = `USASpending API ${res.status}${detail ? `: ${detail}` : ""}`;
      console.error(message);
      if (usedSubtier && budgetLeft()) {
        console.warn(`[USASPENDING] subtier filter rejected for ${agency}; retrying at toptier`);
        return retryToptier();
      }
      return { awards: [], total: 0, error: message, status: res.status };
    }

    const data = await res.json();
    if (usedSubtier && (!data.results || data.results.length === 0)) {
      // Nothing at the sub-agency: widen to the department so a scoped
      // question still gets the department's records rather than silence.
      if (!budgetLeft()) return { awards: [], total: 0, widen_skipped: "award call budget spent" };
      const wider = await retryToptier();
      return { ...wider, widened_from_subtier: true };
    }
    const awards = (data.results || []).map(mapAward);

    return withMatchCount(data, awards, filters);
  } catch (err) {
    console.error("USASpending API error:", err.message);
    return { awards: [], total: 0, error: err.message };
  }
}

/**
 * Search USASpending for spending by agency + NAICS category.
 * Returns aggregate spending totals useful for TAM estimates.
 *
 * Runs ONLY when a NAICS list is present: without one the endpoint is a
 * department-wide aggregate no question asked for. The agencies filter is
 * the registry's { type, tier: "toptier", name } (verified live
 * 2026-09-14: `toptier_code` answers 400 "Unexpected field", which is what
 * every scoped question got until today). Cached 24h per agency + NAICS +
 * fiscal year: the aggregate does not move within a day.
 */
const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
async function getSpendingByCategory({ agency, naics, fiscal_year }) {
  if (!naics || naics.length === 0) return { categories: [], skipped: "no NAICS" };
  const filters = { naics_codes: naics.map(String) };
  const agencyFilter = agency ? usaspendingAgencyFilter(agency, { tier: "toptier" }) : null;
  if (agencyFilter) filters.agencies = [agencyFilter];
  if (fiscal_year) {
    filters.time_period = [{
      start_date: `${fiscal_year - 1}-10-01`,
      end_date: `${fiscal_year}-09-30`,
    }];
  }

  const key = cacheKey("usa-naics", agencyFilter ? agencyFilter.name : "all", filters.naics_codes, fiscal_year || "");
  const { value, cached: hit } = await cached(key, CATEGORY_CACHE_TTL_MS, async () => {
    try {
      const res = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_category/naics/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, limit: 10, page: 1 }),
      });

      if (!res.ok) {
        let detail = "";
        try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
        return { categories: [], error: `USASpending API ${res.status}${detail ? `: ${detail}` : ""}` };
      }
      const data = await res.json();
      return {
        categories: (data.results || []).map((r) => ({
          naics: r.code || "",
          name: r.name || "",
          amount: r.amount || 0,
          count: r.count || 0,
        })),
        agency_scope: agencyFilter ? agencyFilter.name : null,
        fiscal_year: fiscal_year || null,
      };
    } catch (err) {
      return { categories: [], error: err.message };
    }
  });
  return hit ? { ...value, cached: true } : value;
}

// SAM.gov department names — exact strings expected by the `deptname`
// param. Source: https://api.sam.gov/opportunities/v2/search (response
// `data.department` field) plus the SAM.gov federal hierarchy.
// Verified casing matters: SAM rejects lowercase variants.

/**
 * Search SAM.gov for active opportunities. SC-4 rewrite: replaces
 * title-only search with full-text `q` (title + description), restricts
 * to active solicitation types via `ptype`, optionally narrows by
 * department, and unions a secondary department-only call so we surface
 * recently-posted opportunities the keyword doesn't match.
 *
 * Requires SAM_GOV_API_KEY env var.
 *
 * @param {Object} params
 * @param {string} params.keyword - Full-text search (title + description)
 * @param {string} [params.naics] - NAICS code filter
 * @param {string} [params.agency] - Agency alias for deptname filter
 * @param {number} [params.limit] - Max results (default 25)
 * @param {number} [params.daysBack] - Lookback window (default 180 days)
 * @returns {Promise<{opportunities: Array, total: number, error?: string}>}
 */
async function searchSAMOpportunities({ keyword, relaxKeyword, naics, agency, limit = 25, daysBack = 180, priority = "interactive" }) {
  if (!SAM_API_KEY) {
    return { opportunities: [], total: 0, error: "SAM_GOV_API_KEY not configured" };
  }

  const now = new Date();
  const startWindow = new Date(now.getTime() - daysBack * 86400000);
  const formatDate = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  // SAM.gov filters at the department level; the registry maps every
  // sub-agency (DHA, CMS, FDA, Army...) to its department name.
  const deptName = agency ? samDeptName(agency) || undefined : undefined;

  // ACTIVE solicitation types only — drop archived/special-notice from
  // primary call:
  //   o = Solicitation
  //   r = Combined Synopsis/Solicitation
  //   p = Pre-Solicitation
  //   k = Sources Sought (RFI surrogate)
  const PTYPE_ACTIVE = "o,r,p,k";

  const baseParams = () => {
    const p = new URLSearchParams({
      api_key: SAM_API_KEY,
      limit: String(limit),
      offset: "0",
      postedFrom: formatDate(startWindow),
      postedTo: formatDate(now),
      ptype: PTYPE_ACTIVE,
    });
    if (naics) p.set("ncode", naics);
    if (deptName) p.set("deptname", deptName);
    return p;
  };

  // Primary call: full-text + ptype + (optional) deptname
  const primaryParams = baseParams();
  if (keyword && String(keyword).trim()) {
    primaryParams.set("q", String(keyword).trim());
  }

  // Secondary call: same window, RELAXED keyword (the most specific term
  // from the question) or no q at all. Used to catch recently-posted
  // opportunities whose text doesn't quite match the full phrase. Smaller
  // window (last 30 days) keeps it focused. SAM has a small shared daily
  // quota, so this stays the only extra call: two SAM requests per question,
  // same as before the relaxation ladder.
  const secondaryDaysBack = 30;
  const secondaryStart = new Date(now.getTime() - secondaryDaysBack * 86400000);
  const secondaryParams = new URLSearchParams({
    api_key: SAM_API_KEY,
    limit: String(Math.min(limit, 10)),
    offset: "0",
    postedFrom: formatDate(secondaryStart),
    postedTo: formatDate(now),
    ptype: PTYPE_ACTIVE,
  });
  if (deptName) secondaryParams.set("deptname", deptName);
  if (naics) secondaryParams.set("ncode", naics);
  if (relaxKeyword && String(relaxKeyword).trim() && String(relaxKeyword).trim() !== String(keyword || "").trim()) {
    secondaryParams.set("q", String(relaxKeyword).trim());
  }

  const mapOpp = (o) => ({
    notice_id: o.noticeId || "",
    title: o.title || "",
    description: (o.description || "").substring(0, 400),
    solicitation_number: o.solicitationNumber || "",
    type: o.type || o.baseType || "",
    ptype: (o.type || o.baseType || "").toLowerCase()[0] || "",
    posted_date: o.postedDate || "",
    response_deadline: o.reponseDeadLine || o.responseDeadLine || "",
    naics: o.naicsCode || "",
    set_aside: o.setAside || o.setAsideCode || "",
    agency: o.fullParentPathName || "",
    department: o.department || "",
    award: o.data && o.data.award ? {
      number: o.data.award.number || "",
      amount: o.data.award.amount || 0,
      date: o.data.award.date || "",
      awardee: o.data.award.awardee ? o.data.award.awardee.name || "" : "",
    } : null,
    url: o.uiLink || `https://sam.gov/opp/${o.noticeId || ""}/view`,
  });

  const callSam = async (params) => {
    const res = await fetch(`https://api.sam.gov/opportunities/v2/search?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      let detail = "";
      let parsed = null;
      try {
        const body = await res.text();
        try { parsed = JSON.parse(body); detail = (parsed.message || body).slice(0, 200); }
        catch { detail = body.slice(0, 200); }
      } catch { /* ignore */ }
      // Detect SAM rate-limit / quota-exceeded — SAM signals it via
      // HTTP 429 OR via HTTP 4xx with code "900804" + nextAccessTime.
      // Returning a typed throttle marker lets the contract layer
      // distinguish "quota exhausted, will reset" from a true outage —
      // very different subscriber UX (amber "resets <date>" badge vs.
      // red "data source unavailable" badge).
      const isThrottle = res.status === 429 || (parsed && parsed.code === "900804");
      if (isThrottle) {
        // The whole key is done for the UTC day: tell the ledger so no other
        // consumer wastes a call, and the answer goes straight to fallback.
        await markSamExhausted(parsed && parsed.nextAccessTime ? parsed.nextAccessTime : null);
        return {
          __error: `SAM.gov rate-limit (quota exceeded). Resets: ${parsed && parsed.nextAccessTime ? parsed.nextAccessTime : "unknown"}.`,
          __status: res.status,
          __rateLimited: true,
          __resetAt: parsed && parsed.nextAccessTime ? parsed.nextAccessTime : null,
        };
      }
      return { __error: `SAM.gov API ${res.status}${detail ? `: ${detail}` : ""}`, __status: res.status };
    }
    return res.json();
  };

  // Same query today = same answer; spend the daily quota once per distinct
  // query, not once per subscriber who asks it.
  const stripKey = (p) => { const c = new URLSearchParams(p); c.delete("api_key"); return c.toString(); };
  const cacheId = cacheKey("sam-opp", stripKey(primaryParams), stripKey(secondaryParams));
  const hit = await cacheGet(cacheId);
  if (hit && Array.isArray(hit.opportunities)) return { ...hit, cached: true };

  const gate = await reserveSam(1, { priority });
  if (!gate.ok) {
    return {
      opportunities: [], total: 0,
      error: `SAM.gov ${quotaReason(gate)}`,
      rateLimited: true, resetAt: gate.resetAt || null, quotaGate: gate.reason,
    };
  }

  try {
    // Sprint 8c: drop the secondary deptname-only call when the primary
    // returns >= 3 hits. The original SC-4 design always unioned primary
    // + secondary, but on narrow queries (e.g., "DHA data governance"
    // + DHA → deptname=DEPT OF DEFENSE) the deptname-only call dumped
    // unrelated DoD Pre-Solicitations (Navy ship repairs, brake switches)
    // that drowned the keyword-relevant primary hits. Now: primary
    // first, only fall back to secondary when primary is thin.
    const primary = await callSam(primaryParams);

    if (primary.__error) {
      console.error(primary.__error);
      return {
        opportunities: [],
        total: 0,
        error: primary.__error,
        status: primary.__status,
        rateLimited: !!primary.__rateLimited,
        resetAt: primary.__resetAt || null,
      };
    }

    const primaryRaw = primary.opportunitiesData || primary.opportunities || [];
    const PRIMARY_THRESHOLD = 3;
    let secondary = null;
    let secondaryRaw = [];
    // On the 10-a-day key (no SAM.gov role) a question costs ONE request:
    // the relaxed secondary call only runs once SAM_DAILY_QUOTA says the
    // account holds a role (1,000 a day).
    const allowSecondary = dailyQuota() > 10;
    let secondarySkipped = null;
    if (!allowSecondary) secondarySkipped = "daily quota is 10 or fewer; one request per question";
    if (allowSecondary && (deptName || relaxKeyword) && primaryRaw.length < PRIMARY_THRESHOLD && (await reserveSam(1, { priority })).ok) {
      secondary = await callSam(secondaryParams).catch((e) => ({ __error: e && e.message ? e.message : String(e) }));
      if (secondary && !secondary.__error) {
        secondaryRaw = secondary.opportunitiesData || secondary.opportunities || [];
      }
    }

    // Union by noticeId — primary results win when both contain the same
    // opportunity; secondary fills in recently-posted gaps. Secondary
    // results carry _secondary=true so layer scoring can deprioritize
    // them in future (not done in this sprint; documented for SC-9+).
    const seen = new Set();
    const union = [];
    for (const o of primaryRaw) {
      const id = o.noticeId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      union.push(mapOpp(o));
    }
    for (const o of secondaryRaw) {
      const id = o.noticeId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      union.push({ ...mapOpp(o), _secondary: true });
    }

    const result = {
      opportunities: union,
      total: primary.totalRecords || union.length,
      primary_count: primaryRaw.length,
      secondary_count: secondaryRaw.length,
    };
    if (secondarySkipped) result.secondary_skipped = secondarySkipped;
    await cacheSet(cacheId, result, SAM_CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.error("SAM.gov API error:", err.message);
    return { opportunities: [], total: 0, error: err.message };
  }
}

/**
 * Search the Federal Register for proposed/final rules and notices.
 * No auth required. Public API.
 *
 * @param {Object} params
 * @param {string} params.keyword - Search term
 * @param {string[]} [params.agencies] - Agency slugs (e.g., ["veterans-affairs-department"])
 * @param {string[]} [params.type] - Document types: "RULE", "PRORULE", "NOTICE", "PRESDOCU"
 * @param {number} [params.limit] - Max results (default 10)
 * @returns {Promise<{documents: Array, total: number, error?: string}>}
 */
async function searchFederalRegister({ keyword, agencies, type, limit = 10 }) {
  const params = new URLSearchParams({
    per_page: String(limit),
    order: "newest",
  });

  if (keyword) params.set("conditions[term]", keyword);
  if (agencies && agencies.length > 0) {
    agencies.forEach((a) => params.append("conditions[agencies][]", a));
  }
  if (type && type.length > 0) {
    type.forEach((t) => params.append("conditions[type][]", t));
  }

  try {
    const res = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`);
    if (!res.ok) return { documents: [], total: 0, error: `Federal Register API ${res.status}` };

    const data = await res.json();
    return {
      documents: (data.results || []).map((d) => ({
        title: d.title || "",
        type: d.type || "",
        document_number: d.document_number || "",
        publication_date: d.publication_date || "",
        abstract: (d.abstract || "").substring(0, 300),
        agencies: (d.agencies || []).map((a) => a.name).join(", "),
        url: d.html_url || "",
        pdf_url: d.pdf_url || "",
      })),
      total: data.count || 0,
    };
  } catch (err) {
    return { documents: [], total: 0, error: err.message };
  }
}

/**
 * Search GAO reports for oversight findings.
 * Public API, no auth required.
 *
 * @param {Object} params
 * @param {string} params.keyword - Search term
 * @param {number} [params.limit] - Max results (default 5)
 * @returns {Promise<{reports: Array, error?: string}>}
 */
async function searchGAOReports({ keyword, limit = 5, fetchImpl }) {
  // gao.gov answers 403 to every search and API path from a server; the
  // published-reports feed is the one URL it serves. lib/gao-feed.js reads
  // it (cached an hour) and matches the question against the latest reports.
  return searchGaoFeed({ keyword, limit, fetchImpl });
}

/**
 * Search SAM.gov Entity Management API for vendor registration details.
 * Uses the same API key as opportunities. Verifies that vendors are
 * active and registered for the right NAICS codes.
 *
 * @param {Object} params
 * @param {string} params.vendorName - Company name to search
 * @param {number} [params.limit] - Max results (default 5)
 * @returns {Promise<{entities: Array, error?: string}>}
 */
async function searchSAMEntities({ vendorName, limit = 5 }) {
  if (!SAM_API_KEY) {
    return { entities: [], error: "SAM_GOV_API_KEY not configured" };
  }

  try {
    const params = new URLSearchParams({
      api_key: SAM_API_KEY,
      qterms: vendorName,
      registrationStatus: "A", // Active only
      includeSections: "entityRegistration,coreData",
    });

    const res = await fetch(`https://api.sam.gov/entity-information/v3/entities?${params}`);
    if (!res.ok) return { entities: [], error: `SAM Entity API ${res.status}` };

    const data = await res.json();
    return {
      entities: (data.entityData || []).slice(0, limit).map((e) => ({
        uei: e.entityRegistration?.ueiSAM || "",
        name: e.entityRegistration?.legalBusinessName || "",
        dba: e.entityRegistration?.dbaName || "",
        status: e.entityRegistration?.registrationStatus || "",
        expiration: e.entityRegistration?.registrationExpirationDate || "",
        naics: (e.coreData?.naicsCodeList || []).map((n) => n.naicsCode).join(", "),
        small_business: e.coreData?.businessTypes?.sbaBusinessTypeList?.map((t) => t.sbaBusinessTypeDesc).join(", ") || "",
        cage_code: e.entityRegistration?.cageCode || "",
        city: e.coreData?.physicalAddress?.city || "",
        state: e.coreData?.physicalAddress?.stateOrProvinceCode || "",
      })),
    };
  } catch (err) {
    return { entities: [], error: err.message };
  }
}

/**
 * Query USASpending.gov for agency spending totals by fiscal year.
 * Useful for calculating TAM and budget trends.
 * No auth required.
 *
 * @param {Object} params
 * @param {string} params.agency_code - Toptier agency code
 * @param {number} [params.fiscal_year] - Fiscal year (default current)
 * @returns {Promise<{spending: Object, error?: string}>}
 */
async function getAgencySpendingTotals({ agency_code, fiscal_year, agency_name }) {
  const fy = fiscal_year || new Date().getFullYear();
  // A code the endpoint rejects is remembered and never requested again
  // within the TTL. The rejection is a skip, not an error: nothing was down.
  const rejectedKey = cacheKey("usaspending-toptier-rejected", String(agency_code));
  const rejected = await cacheGet(rejectedKey);
  if (rejected) return { spending: null, skipped: rejected };
  try {
    const res = await fetch(`https://api.usaspending.gov/api/v2/agency/${agency_code}/budgetary_resources/?fiscal_year=${fy}`);
    if (res.status === 404) {
      // "Agency with a toptier code of '021' does not exist" (live
      // 2026-09-15) is a permanent fact about the code, not an outage.
      // Any other 404 body is treated as a failure.
      const body = await res.json().catch(() => null);
      if (body && /does not exist/i.test(String(body.detail || ""))) {
        const reason = `CGAC ${agency_code} is not a USASpending toptier agency`;
        await cacheSet(rejectedKey, reason, TOPTIER_REJECTION_TTL_MS);
        return { spending: null, skipped: reason };
      }
    }
    if (!res.ok) return { spending: null, error: `USASpending Agency API ${res.status}` };

    const data = await res.json();
    // The endpoint answers with `agency_data_by_year` (one row per fiscal
    // year). The old reader looked for `agency_budgetary_resources[0]` and
    // printed $0.0B for every department (2026-09-13). `total_budgetary_
    // resources` on a row is government-wide; the department's own figure
    // is `agency_budgetary_resources`.
    const years = Array.isArray(data.agency_data_by_year) ? data.agency_data_by_year : [];
    const row = years.find((y) => Number(y.fiscal_year) === Number(fy)) || years.sort((a, b) => Number(b.fiscal_year) - Number(a.fiscal_year))[0];
    if (!row) return { spending: null, error: `USASpending Agency API: no data for FY${fy}` };
    return {
      spending: {
        fiscal_year: Number(row.fiscal_year) || fy,
        agency_code: String(agency_code),
        agency_name: agency_name || null,
        total_budgetary_resources: Number(row.agency_budgetary_resources) || 0,
        obligated: Number(row.agency_total_obligated) || 0,
        outlayed: Number(row.agency_total_outlayed) || 0,
      },
    };
  } catch (err) {
    return { spending: null, error: err.message };
  }
}

/**
 * Run all relevant API queries for a MarketPulse research topic.
 * Returns structured data that gets injected into the research context.
 *
 * @param {Object} params
 * @param {string} params.topic - Research topic
 * @param {string} [params.agency] - Target agency
 * @param {string[]} [params.naics] - NAICS codes
 * @param {string} [params.recipientName] - candidate vendor name for the recipient search
 * @param {string[]} [params.rungs] - keyword rungs that REPLACE keywordLadder(): the
 *   first is a bare canonical vehicle name ("T4NG2"), later rungs the alternates;
 *   each rung is one keywords[] entry
 * @param {string} [params.since] - YYYY-MM-DD start of the award window (defaults to
 *   the fiscal/calendar year named in the topic, else FY2024 start)
 * @param {string[]} [params.setAside] - USASpending set_aside_type_codes (defaults to
 *   what the topic's wording implies)
 * @param {boolean} [params.wantsObligations] - run the obligations-by-fiscal-year call
 *   for the recipient (defaults to detection on the topic)
 * @param {string} [params.today] - YYYY-MM-DD, pins the window end (tests)
 * @returns {Promise<Object>} Combined API results
 */
/**
 * Pure: the USASpending side of a fan-out, derived once so the live path and
 * the nightly pre-warm (usaspending-prewarm-background) build the same
 * queries and so the same cache keys.
 */
function federalPlan({ topic, agency, naics, recipientName, rungs, since, setAside, wantsObligations, today }) {
  const terms = extractSearchTerms(topic, { today });
  const customRungs = Array.isArray(rungs)
    ? [...new Set(rungs.map((r) => String(r || "").trim()))].filter((r, i, arr) => r || i === arr.length - 1)
    : null;
  const ladder = customRungs && customRungs.length ? customRungs : keywordLadder(terms);
  const windowStart = /^\d{4}-\d{2}-\d{2}$/.test(String(since || "")) ? since : (terms.since || null);
  return {
    terms,
    ladder,
    // With vehicle rungs the bare canonical name is the best SAM.gov and
    // Federal Register query too; otherwise the derived phrase.
    keywords: customRungs && customRungs.length ? customRungs[0] : deriveKeywords(topic),
    agency: agency || undefined,
    naics: naics && naics.length ? naics : undefined,
    recipientName,
    windowStart,
    awardStart: windowStart || "2023-10-01", // FY2024 start: 2+ years of data
    recipientStart: windowStart || "2022-10-01",
    setAsideCodes: Array.isArray(setAside) && setAside.length ? setAside : (terms.setAside ? terms.setAside.codes : null),
    wantsObl: typeof wantsObligations === "boolean" ? wantsObligations : obligationsIntent(topic),
    today,
  };
}

/**
 * Walk the keyword ladder: the subscriber's own wording first, then the most
 * specific term, so a wordy or unusual question relaxes into a hit instead
 * of returning zero. An ERROR is never retried (it is not a miss, and
 * retrying would multiply the failure). At most MAX_KEYWORD_ATTEMPTS rungs;
 * each rung may widen to the department once, so at most MAX_AWARD_CALLS
 * requests. The widening is not a rung: a sub-agency question that misses at
 * both tiers still gets the relaxed keyword (2026-09-14 review).
 */
async function runAwardLadder(plan, budget) {
  const { ladder, agency, naics } = plan;
  let last = null;
  for (let i = 0; i < Math.min(ladder.length, MAX_KEYWORD_ATTEMPTS); i++) {
    if (budget.used >= budget.max) break;
    budget.rungs += 1;
    // The empty rung is "everything the agency awarded", a real query
    // only when there IS an agency or NAICS to scope it. Unscoped, it
    // is the twenty largest awards in government (Northrop, Lockheed,
    // Pfizer), which the 2026-09-13 GetWell question got back as
    // "20 awards found, none to GetWell".
    if (!ladder[i] && !agency && !naics) break;
    const res = await searchUSASpending({
      keyword: ladder[i],
      agency,
      naics,
      startDate: plan.awardStart,
      setAside: plan.setAsideCodes || undefined,
      today: plan.today,
      limit: 20,
      _budget: budget,
    });
    if (res.error) return res;
    if (res.awards && res.awards.length > 0) {
      return i === 0 ? res : { ...res, relaxed_keyword: ladder[i], original_keyword: ladder[0] };
    }
    last = res;
    if (!ladder[i]) break; // "" was the widest query there is
  }
  return last || { awards: [], total: 0 };
}

// One guarded call per USASpending query family. `ms` is the live bound;
// the pre-warm passes a long one.
function guardedAwards(plan, budget, ms) {
  const parts = [plan.ladder.slice(0, MAX_KEYWORD_ATTEMPTS), plan.agency || "", plan.naics || [], plan.awardStart, plan.setAsideCodes || []];
  return usaGuarded("awards", parts, () => runAwardLadder(plan, budget), { ms, emptyShape: { awards: [], total: 0 }, today: plan.today });
}
function guardedAgencyTotals(plan, ms) {
  // The department's code, never the agency's own CGAC: USASpending has no
  // Army (021), Navy (017) or Air Force (057) toptier (2026-09-15).
  const code = plan.agency ? usaspendingToptierCode(plan.agency) : null;
  if (!code) return Promise.resolve({ spending: null });
  const name = (usaspendingAgencyFilter(plan.agency, { tier: "toptier" }) || {}).name || null;
  return usaGuarded("agency-totals", [code, 2026], () => getAgencySpendingTotals({ agency_code: code, fiscal_year: 2026, agency_name: name }), { ms, emptyShape: { spending: null }, today: plan.today });
}
function guardedRecipients(plan, ms) {
  if (!plan.recipientName) return Promise.resolve({ awards: [], total: 0, skipped: "no candidate name" });
  const { recipientName: name, agency, recipientStart: startDate, today } = plan;
  return usaGuarded("recipients", [name, agency || "", startDate], () => searchUSASpendingRecipients({ name, agency, limit: 15, startDate, today }), { ms, emptyShape: { awards: [], total: 0 }, today });
}
function guardedObligations(plan, ms) {
  if (!plan.recipientName || !plan.wantsObl) {
    return Promise.resolve({ years: [], total: 0, skipped: plan.recipientName ? "question does not ask for money over time" : "no candidate name" });
  }
  const { recipientName: name, agency, recipientStart: since, today } = plan;
  return usaGuarded("obligations", [name, agency || "", since], () => searchRecipientObligationsByYear({ name, agency, since, today }), { ms, emptyShape: { years: [], total: 0 }, today });
}

const warmStatus = (r) => (!r ? "none" : r.cached ? "cached" : r.stale ? `stale (${r.live_error})` : r.error ? `error (${r.error})` : r.skipped ? "skipped" : "fetched");

/**
 * Nightly pre-warm: run only the USASpending queries a fan-out with these
 * args would send (never SAM.gov, whose quota is for subscribers), under a
 * long bound, so the day's first subscriber gets a cached answer. A query
 * already answered today costs no request, which makes a double-fired cron
 * harmless. Returns one status per query family.
 */
async function warmUSASpending(args, { ms = 60000 } = {}) {
  const plan = federalPlan(args);
  const budget = { used: 0, rungs: 0, max: MAX_AWARD_CALLS };
  const [awards, agencyTotals, categories] = await Promise.all([
    guardedAwards(plan, budget, ms),
    guardedAgencyTotals(plan, ms),
    bounded(getSpendingByCategory({ agency: plan.agency, naics: plan.naics, fiscal_year: 2026 }), ms, { categories: [] }),
  ]);
  return { awards: warmStatus(awards), award_rows: awards && Array.isArray(awards.awards) ? awards.awards.length : 0, award_calls: budget.used, agency_totals: warmStatus(agencyTotals), categories: categories && categories.error ? `error (${categories.error})` : "ok" };
}

/**
 * Nightly pre-warm of one department's spending totals, under the same key
 * a subscriber's question reads (toptier code + FY, UTC day). The vehicle
 * warm reaches only departments a known vehicle belongs to; DHS and SSA
 * totals were never warm, so their first ask each day was cold, and the
 * totals call gets 3s against a measured 0.5s to 18s (2026-09-15).
 */
async function warmAgencyTotals(agency, { ms = 60000, today } = {}) {
  return { agency, code: usaspendingToptierCode(agency), agency_totals: warmStatus(await guardedAgencyTotals({ agency, today }, ms)) };
}

async function enrichWithFederalData(args) {
  const plan = federalPlan(args);
  const { keywords, agency, naics, windowStart, setAsideCodes } = plan;
  const { terms } = plan;
  const frSlugs = agency ? federalRegisterSlugs(agency) : [];
  // `used` counts spending_by_award calls (widenings included, for the
  // ops_event); `rungs` counts keyword attempts, which is what the ladder
  // is bounded on. A widening never consumes a rung.
  const budget = { used: 0, rungs: 0, max: MAX_AWARD_CALLS };

  console.log(`[FEDERAL-API] Enriching: "${keywords}" agency=${agency || "all"} naics=${(naics || []).join(",")} since=${windowStart || "default"} setAside=${setAsideCodes ? setAsideCodes.length + " codes" : "none"}`);

  // Every query runs in parallel and under its own bound (TIMEOUTS_MS).
  const [awards, categories, samOpps, fedRegRaw, gaoReports, agencySpending, recipientAwards, recipientObligations] = await Promise.all([
    guardedAwards(plan, budget, TIMEOUTS_MS.awards),
    bounded(getSpendingByCategory({
      agency: agency || undefined,
      naics: naics || undefined,
      fiscal_year: 2026,
    }), TIMEOUTS_MS.categories, { categories: [] }),
    bounded(searchSAMOpportunities({
      keyword: keywords.substring(0, 60),
      relaxKeyword: (plan.ladder[1] || "").substring(0, 60),
      naics: naics && naics[0] ? naics[0] : undefined,
      // Was never passed here, so the assistant's SAM.gov query ran
      // unscoped across every department (2026-09-10).
      agency: agency || undefined,
      limit: 15,
    }), TIMEOUTS_MS.sam, { opportunities: [], total: 0 }),
    bounded(searchFederalRegister({
      keyword: keywords,
      agencies: frSlugs.length > 0 ? frSlugs : undefined,
      type: ["RULE", "PRORULE", "NOTICE"],
      limit: 5,
    }), TIMEOUTS_MS.federal_register, { documents: [], total: 0 }),
    bounded(searchGAOReports({ keyword: keywords, limit: 5 }), TIMEOUTS_MS.gao, { reports: [] }),
    guardedAgencyTotals(plan, TIMEOUTS_MS.agency_totals),
    guardedRecipients(plan, TIMEOUTS_MS.recipients),
    guardedObligations(plan, TIMEOUTS_MS.obligations),
  ]);

  // The Federal Register search is full text: "data governance" returned the
  // Defense Business Board's charter renewal. A document is only shown to
  // the model (and so cited) when its title or abstract carries the terms.
  let fedRegDocs = fedRegRaw;
  if (fedRegRaw && Array.isArray(fedRegRaw.documents) && fedRegRaw.documents.length) {
    const kept = filterRelevant(fedRegRaw.documents, terms, ["title", "abstract"]);
    fedRegDocs = { ...fedRegRaw, documents: kept, total: kept.length, filtered_out: fedRegRaw.documents.length - kept.length };
  }

  const summary = [];
  if (awards.awards && awards.awards.length > 0) {
    summary.push(`USASpending: ${describeMatchCount(awards)}, top ${awards.awards.length} returned`);
  }
  const primeMatched = !!(recipientAwards && Array.isArray(recipientAwards.awards) && recipientAwards.awards.length > 0);
  if (primeMatched) {
    summary.push(`USASpending: ${describeMatchCount(recipientAwards)} to recipients matching "${recipientAwards.name}"`);
  }
  // The obligations figure is only a figure when the name matched a prime;
  // a topic word used as a recipient name gets $0 rows, never a summary.
  if (primeMatched && recipientObligations && Array.isArray(recipientObligations.years) && recipientObligations.years.length > 0 && Number(recipientObligations.total) > 0) {
    summary.push(`USASpending: ${money(recipientObligations.total)} obligated to "${recipientObligations.name}" across ${recipientObligations.years.length} fiscal years`);
  }
  if (categories.categories && categories.categories.length > 0) {
    const totalSpend = categories.categories.reduce((s, c) => s + c.amount, 0);
    summary.push(`Spending by NAICS: $${(totalSpend / 1e6).toFixed(1)}M across ${categories.categories.length} categories`);
  }
  if (samOpps.total > 0) {
    summary.push(`SAM.gov: ${samOpps.total} active opportunities`);
  }
  if (fedRegDocs.total > 0) {
    summary.push(`Federal Register: ${fedRegDocs.total} relevant documents`);
  }
  if (gaoReports.reports && gaoReports.reports.length > 0) {
    summary.push(`GAO: ${gaoReports.reports.length} reports found`);
  }
  if (agencySpending.spending) {
    summary.push(`Agency FY2026 obligated: $${(agencySpending.spending.obligated / 1e9).toFixed(1)}B`);
  }
  const timedOut = [["usaspending_awards", awards], ["spending_categories", categories], ["sam_opportunities", samOpps], ["federal_register", fedRegRaw], ["gao_reports", gaoReports], ["agency_spending", agencySpending], ["usaspending_recipient_awards", recipientAwards], ["usaspending_recipient_obligations", recipientObligations]]
    .filter(([, r]) => r && r.error === "timeout").map(([k]) => k);
  if (timedOut.length) summary.push(`timed out: ${timedOut.join(", ")}`);
  const staleServed = [["usaspending_awards", awards], ["agency_spending", agencySpending], ["usaspending_recipient_awards", recipientAwards], ["usaspending_recipient_obligations", recipientObligations]]
    .filter(([, r]) => r && r.stale).map(([k, r]) => `${k} from ${r.fetched_on} (live: ${r.live_error})`);
  if (staleServed.length) summary.push(`served saved copy: ${staleServed.join(", ")}`);

  console.log(`[FEDERAL-API] Results: ${summary.join("; ") || "no results from any API"}`);

  return {
    usaspending_awards: awards,
    usaspending_recipient_awards: recipientAwards,
    usaspending_recipient_obligations: recipientObligations,
    spending_categories: categories,
    sam_opportunities: samOpps,
    federal_register: fedRegDocs,
    gao_reports: gaoReports,
    agency_spending: agencySpending,
    window_start: windowStart,
    set_aside_codes: setAsideCodes,
    award_calls: budget.used,
    award_rungs: budget.rungs,
    summary: summary.join("; "),
  };
}

/**
 * Format federal API data into a context block for injection into research prompts.
 */
function formatFederalDataContext(data) {
  if (!data) return "";

  const sections = [];

  // Totals are computed HERE (2026-09-14) so the model quotes them instead
  // of adding rows; the award amount field is the potential value as
  // reported to FPDS, not obligations to date. The match count is the
  // count endpoint's figure, never the page length: a full page with no
  // count in hand says "more matches exist" (2026-09-14 review).
  const totalsLine = (shown, result) => {
    const sum = shown.reduce((acc, a) => acc + (Number(a.award_amount) || 0), 0);
    return `Rows shown: ${shown.length} of ${describeMatchCount(result)}, largest award amounts first; sum of award amounts shown: ${money(sum)} (award amount field, potential value as reported to FPDS). Quote these figures; do not re-add them.`;
  };
  // A saved copy served because the live query did not answer (usaGuarded).
  const staleNote = (result) => (result && result.stale
    ? `\nSAVED COPY: USASpending did not answer this query live this turn (${result.live_error}). These are MMT's saved results for the same query, fetched ${result.fetched_on}. Say that date when you cite them; anything awarded since would not show here.`
    : "");

  // USASpending awards
  if (data.usaspending_awards && Array.isArray(data.usaspending_awards.awards) && data.usaspending_awards.awards.length > 0) {
    // Description and award amount are what let the model recognize a
    // record ("IMMUTA SOFTWARE FOR DATA GOVERNANCE") instead of skipping a
    // bare PIID. Outlays and NAICS print only when the API returned them;
    // the per-row set-aside is not a field this endpoint exposes, and the
    // scope line already states the filter that was applied.
    const shown = data.usaspending_awards.awards.slice(0, 10);
    const rows = shown.map((a) =>
      `- ${a.piid}: ${a.recipient} | "${(a.description || "no description").replace(/\s+/g, " ").trim()}" | award ${money(a.award_amount)}${Number(a.outlays) > 0 ? ` (outlays to date ${money(a.outlays)})` : ""} | ${a.sub_agency || a.agency}${a.naics ? ` | NAICS ${a.naics}` : ""}${a.psc ? ` | PSC ${a.psc}` : ""} | ${a.start_date} to ${a.end_date} | ${a.source_url}`
    ).join("\n");
    const scope = [];
    if (data.window_start) scope.push(`awards dated ${data.window_start} or later`);
    if (Array.isArray(data.set_aside_codes) && data.set_aside_codes.length) scope.push(`set-aside codes ${data.set_aside_codes.join("/")}, applied as a filter; the rows below are all set-aside awards`);
    sections.push(`USASPENDING.GOV VERIFIED AWARDS, keyword matched in the description or recipient (${describeMatchCount(data.usaspending_awards)}${scope.length ? `; ${scope.join("; ")}` : ""}). A product named in a reseller's or integrator's award description is an award tied to that product; a keyword that only matches a street address or an unrelated word is not:\n${rows}\n${totalsLine(shown, data.usaspending_awards)}${staleNote(data.usaspending_awards)}`);
  }

  // Awards where the recipient's own name matched (the vendor as prime).
  const ra = data.usaspending_recipient_awards;
  const primeMatched = !!(ra && Array.isArray(ra.awards) && ra.awards.length > 0);
  if (primeMatched) {
    const shown = ra.awards.slice(0, 10);
    const rows = shown.map((a) =>
      `- ${a.piid}: ${a.recipient} | "${(a.description || "no description").replace(/\s+/g, " ").trim()}" | award ${money(a.award_amount)} | ${a.sub_agency || a.agency} | ${a.start_date} to ${a.end_date} | ${a.source_url}`
    ).join("\n");
    sections.push(`USASPENDING.GOV AWARDS TO RECIPIENTS NAMED LIKE "${ra.name}" (${describeMatchCount(ra)}; these are the vendor's own awards as prime):\n${rows}\n${totalsLine(shown, ra)}${staleNote(ra)}`);
  }

  // Obligations by fiscal year to the recipient, total computed in code.
  // Rendered only when the recipient search itself matched a prime AND the
  // years carry money: a topic word ("telehealth") used as a recipient name
  // gets $0 rows from spending_over_time, and a "$0.00M total, quote it"
  // line became the answer's headline (2026-09-14 review).
  const ro = data.usaspending_recipient_obligations;
  if (primeMatched && ro && Array.isArray(ro.years) && ro.years.length > 0 && Number(ro.total) > 0) {
    const rows = ro.years.map((y) => `- FY${y.fiscal_year}: ${money(y.obligated)}`).join("\n");
    const first = ro.years[0].fiscal_year;
    const lastFy = ro.years[ro.years.length - 1].fiscal_year;
    const span = first === lastFy ? `FY${first}` : `FY${first} to FY${lastFy}`;
    sections.push(`USASPENDING.GOV OBLIGATIONS BY FISCAL YEAR TO VENDORS WHOSE NAME CONTAINS "${ro.name}" (a vendor-name match only; this is NOT spending on the topic "${ro.name}"; contract obligations, ${ro.agency_scope ? `funding department ${ro.agency_scope}` : "all agencies"}, awards dated ${ro.since} to ${ro.until}; a fiscal year the window enters part-way is a partial year; years with no obligations are omitted):\n${rows}\nTotal ${span}, computed in code: ${money(ro.total)}. Quote these figures; do not re-add them.${staleNote(ro)}`);
  }

  // Spending categories
  if (data.spending_categories && data.spending_categories.categories && data.spending_categories.categories.length > 0) {
    const rows = data.spending_categories.categories.map((c) =>
      `- NAICS ${c.naics} (${c.name}): $${(c.amount / 1e6).toFixed(1)}M across ${c.count} awards`
    ).join("\n");
    sections.push(`SPENDING BY NAICS CATEGORY (USASpending.gov):\n${rows}`);
  }

  // SAM.gov opportunities
  if (data.sam_opportunities && Array.isArray(data.sam_opportunities.opportunities) && data.sam_opportunities.opportunities.length > 0) {
    const rows = data.sam_opportunities.opportunities.slice(0, 8).map((o) =>
      `- ${o.solicitation_number || o.notice_id}: "${o.title}" | ${o.type} | ${o.agency} | NAICS ${o.naics} | Set-aside: ${o.set_aside || "none"} | Deadline: ${o.response_deadline || "TBD"} | ${o.url}`
    ).join("\n");
    sections.push(`SAM.GOV ACTIVE OPPORTUNITIES (${data.sam_opportunities.total} total):\n${rows}`);
  }

  // Federal Register
  if (data.federal_register && Array.isArray(data.federal_register.documents) && data.federal_register.documents.length > 0) {
    const rows = data.federal_register.documents.map((d) =>
      `- ${d.document_number}: "${d.title}" (${d.type}) | ${d.publication_date} | ${d.agencies} | ${d.url}`
    ).join("\n");
    sections.push(`FEDERAL REGISTER DOCUMENTS (${data.federal_register.total} total):\n${rows}`);
  }

  // GAO reports
  if (data.gao_reports && data.gao_reports.reports && data.gao_reports.reports.length > 0) {
    const rows = data.gao_reports.reports.map((r) =>
      `- ${r.report_number}: "${r.title}" | ${r.date} | ${r.url}`
    ).join("\n");
    sections.push(`GAO REPORTS (matched in GAO's published-reports feed, ${data.gao_reports.scope || "recent reports"}; older reports are not searched):\n${rows}`);
  }

  // Agency spending totals
  if (data.agency_spending && data.agency_spending.spending) {
    const s = data.agency_spending.spending;
    if (s.total_budgetary_resources > 0 || s.obligated > 0) {
      const who = s.agency_name ? `${s.agency_name} (CGAC ${s.agency_code})` : `CGAC ${s.agency_code || "n/a"}`;
      sections.push(`DEPARTMENT-LEVEL SPENDING TOTALS for ${who}, FY${s.fiscal_year} to date, per USASpending.gov (the whole department, not the sub-agency asked about):\n- Budgetary resources: $${(s.total_budgetary_resources / 1e9).toFixed(1)}B\n- Obligated: $${(s.obligated / 1e9).toFixed(1)}B\n- Outlayed: $${(s.outlayed / 1e9).toFixed(1)}B${staleNote(data.agency_spending)}`);
    }
  }

  if (sections.length === 0) return "";

  return "\n\nVERIFIED FEDERAL DATA (from direct API queries; use these as PRIMARY SOURCES, higher authority than web search results):\n\n" + sections.join("\n\n");
}

// ============================================================
// Sprint 9b Phase C — acquisition state derivation
//
// Map a SAM.gov opportunity row to a discrete acquisition state
// per Pursuit Score 2.0 completion spec §3. Pure function — no I/O.
//
// Returned states (kept in sync with monday-move.js templates):
//   RFI_OPEN           — RFI/Sources Sought, response_date >= today
//   RFI_CLOSED_RECENT  — RFI/Sources Sought, response in last 120d
//   RFI_CLOSED_STALE   — RFI/Sources Sought, response > 120d ago
//   DRAFT_RFP          — Pre-Solicitation / Draft
//   RFP_OPEN           — Combined Synopsis/Solicitation, response >= today
//   RFP_CLOSED         — Combined Synopsis/Solicitation, response in past
//   AWARDED            — award_notice present OR opportunity has award block
//   UNKNOWN            — type/date insufficient to classify
//
// PROTESTED is added by the layer (not here) because it requires
// cross-referencing GAO data.
// ============================================================

const RFI_TYPE_KEYS = new Set(["k", "j", "i", "s"]);
// k = Sources Sought, j = Justification (sometimes RFI-ish),
// i = Intent to Sole Source (treated as informational signal),
// s = Special Notice (used by some buying offices for RFIs).
const RFI_FIRST_LETTERS = ["k"];      // strict RFI signal
const DRAFT_FIRST_LETTERS = ["p"];    // p = Pre-Solicitation
const RFP_OPEN_LETTERS = ["o", "r"];  // o = Solicitation, r = Combined Synopsis/Solicitation

function _isInPast(dateStr, now = Date.now()) {
  if (!dateStr) return null; // null when unknown
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return t < now;
}

function _daysSince(dateStr, now = Date.now()) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86400000);
}

/**
 * Derive an acquisition state for a SAM opportunity row.
 *
 * @param {Object} opp — opportunity record as returned by mapOpp.
 *                       Must carry { ptype, type, posted_date,
 *                       response_deadline, award? }.
 * @param {Object} [params]
 * @param {number} [params.now]      — override "today" in ms (for tests).
 * @param {number} [params.staleDays] — RFI closed > N days = STALE (default 120).
 * @returns {{ state: string, close_date: string|null, days_since_close: number|null }}
 */
function deriveAcquisitionState(opp, { now = Date.now(), staleDays = 120 } = {}) {
  if (!opp) return { state: "UNKNOWN", close_date: null, days_since_close: null };
  if (opp.award && (opp.award.number || opp.award.amount)) {
    return { state: "AWARDED", close_date: opp.response_deadline || null, days_since_close: _daysSince(opp.response_deadline, now) };
  }

  const first = String(opp.ptype || (opp.type || "").toLowerCase()[0] || "").toLowerCase();
  const response = opp.response_deadline || null;
  const inPast = _isInPast(response, now);

  // RFI / Sources Sought
  if (RFI_FIRST_LETTERS.includes(first)) {
    if (inPast === false) return { state: "RFI_OPEN", close_date: response, days_since_close: null };
    if (inPast === true) {
      const since = _daysSince(response, now);
      return {
        state: since !== null && since <= staleDays ? "RFI_CLOSED_RECENT" : "RFI_CLOSED_STALE",
        close_date: response,
        days_since_close: since,
      };
    }
    // No usable response date — fall through to UNKNOWN.
  }

  // Pre-Solicitation / Draft RFP
  if (DRAFT_FIRST_LETTERS.includes(first)) {
    return { state: "DRAFT_RFP", close_date: response || null, days_since_close: _daysSince(response, now) };
  }

  // RFP open / closed
  if (RFP_OPEN_LETTERS.includes(first)) {
    if (inPast === false) return { state: "RFP_OPEN", close_date: response, days_since_close: null };
    if (inPast === true) return { state: "RFP_CLOSED", close_date: response, days_since_close: _daysSince(response, now) };
  }

  return { state: "UNKNOWN", close_date: response || null, days_since_close: _daysSince(response, now) };
}

module.exports = {
  searchUSASpendingRecipients,
  searchRecipientObligationsByYear,
  mapAward,
  bounded,
  TIMEOUTS_MS,
  MAX_AWARD_CALLS,
  MAX_KEYWORD_ATTEMPTS,
  countUSASpendingAwards,
  describeMatchCount,
  deriveKeywords,
  searchUSASpending,
  getSpendingByCategory,
  searchSAMOpportunities,
  searchSAMEntities,
  searchFederalRegister,
  searchGAOReports,
  getAgencySpendingTotals,
  enrichWithFederalData,
  federalPlan,
  warmUSASpending,
  warmAgencyTotals,
  usaGuarded,
  formatFederalDataContext,
  deriveAcquisitionState,
};
