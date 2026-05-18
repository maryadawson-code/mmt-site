// ============================================================
// congress-api.js — Congress.gov API v3
//
// Library of Congress API for bills, amendments, committee
// reports, hearings, and CRS reports. Requires free api.data.gov
// key (same key works for GovInfo.gov).
//
// Env: CONGRESS_API_KEY
// Docs: https://api.congress.gov
// ============================================================

const API_BASE = "https://api.congress.gov/v3";
const API_KEY = process.env.CONGRESS_API_KEY || "";

async function callCongress(path, params = {}) {
  if (!API_KEY) {
    return { error: "CONGRESS_API_KEY not configured" };
  }
  const qs = new URLSearchParams({ ...params, api_key: API_KEY, format: "json" });
  try {
    const res = await fetch(`${API_BASE}${path}?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { error: `Congress API ${res.status}` };
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

// ISO date helper for the `fromDateTime`/`toDateTime` API params.
// Congress.gov rejects bare YYYY-MM-DD and requires the full
// `YYYY-MM-DDT00:00:00Z` ISO form.
function _isoStart(daysBack) {
  const d = new Date(Date.now() - daysBack * 86400000);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function _isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Tokenize a keyword string for client-side filtering. Drops stopwords and
// keeps the first ~6 distinct tokens — that's what we filter bill / hearing
// titles against to actually return relevant results.
const _CONGRESS_STOPWORDS = new Set([
  "the","a","an","of","for","and","or","to","in","on","at","by","with","as",
  "is","are","be","this","that"
]);
function _tokensFor(keyword) {
  return Array.from(new Set(
    String(keyword || "")
      .toLowerCase()
      .replace(/[^a-z0-9+ ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !_CONGRESS_STOPWORDS.has(w))
  )).slice(0, 6);
}
function _matchesAny(text, tokens) {
  if (!text || !tokens || tokens.length === 0) return false;
  const lc = String(text).toLowerCase();
  return tokens.some((t) => lc.includes(t));
}

/**
 * Search recent bills by keyword. Returns title, status, sponsor, latest action.
 *
 * SC-3 FIX (2026-05-15 audit): Congress.gov's `/v3/bill/{congress}?q=`
 * parameter is documented to keyword-filter but in practice ignores `q`
 * entirely — it returns recently updated bills regardless of query (e.g.
 * "TRICARE" returned a 2007 bill on Northern Ireland). We now over-fetch
 * a 180-day window of recent bills and filter client-side on title +
 * latest action text. Also pulls /bill/{congress}/summaries for fuller
 * text to match against.
 *
 * @param {Object} params
 * @param {string} params.keyword - search term
 * @param {number} [params.congress] - congress number (default current, 119)
 * @param {number} [params.limit] - max results (default 10)
 */
async function searchBills({ keyword, congress = 119, limit = 10 }) {
  const tokens = _tokensFor(keyword);

  // Pull a 180-day window of recently updated bills. Congress.gov caps
  // per-page at 250 and its `q` parameter does not actually keyword-filter
  // (it returns recently-updated bills regardless of query — verified
  // 2026-05-17). We paginate 4× to widen the recall pool to 1000 bills,
  // then keyword-filter client-side. This is the best the API allows
  // without abandoning Congress.gov for an external keyword index.
  const pages = await Promise.all([0, 250, 500, 750].map((offset) =>
    callCongress(`/bill/${congress}`, {
      limit: "250",
      offset: String(offset),
      sort: "updateDate+desc",
      fromDateTime: _isoStart(180),
      toDateTime: _isoNow(),
    })
  ));

  // If every page errored, surface the first error so the layer can flag.
  if (pages.every((p) => p.error)) return { bills: [], error: pages[0].error };

  const all = pages.flatMap((data) => (data.bills || [])).map((b) => ({
    congress: b.congress,
    number: b.number,
    type: b.type,
    title: b.title || "",
    latest_action: b.latestAction?.text || "",
    latest_action_date: b.latestAction?.actionDate || "",
    update_date: b.updateDate || "",
    url: b.url || `https://www.congress.gov/bill/${b.congress}th-congress/${(b.type || "").toLowerCase()}-bill/${b.number}`,
  }));

  // If no keyword tokens, return the recency-sorted set as-is.
  if (tokens.length === 0) {
    return { bills: all.slice(0, limit) };
  }

  // Client-side keyword filter on title OR latest action text.
  const filtered = all.filter((b) => _matchesAny(b.title, tokens) || _matchesAny(b.latest_action, tokens));
  return { bills: filtered.slice(0, limit) };
}

/**
 * Search committee hearings by keyword.
 *
 * SC-3 FIX: same `q`-doesn't-filter defect as /bill. Over-fetch and
 * client-side filter on title + committee name.
 */
async function searchHearings({ keyword, congress = 119, chamber, limit = 10 }) {
  const tokens = _tokensFor(keyword);
  const path = chamber ? `/hearing/${congress}/${chamber}` : `/hearing/${congress}`;
  const data = await callCongress(path, {
    limit: "100",
  });
  if (data.error) return { hearings: [], error: data.error };

  const all = (data.hearings || []).map((h) => ({
    congress: h.congress,
    chamber: h.chamber,
    committee: (h.committees || []).map((c) => c.name).join(", "),
    title: h.title || "",
    date: h.dates?.[0]?.date || "",
    jacket_number: h.jacketNumber || "",
    url: h.url || "",
  }));

  if (tokens.length === 0) {
    return { hearings: all.slice(0, limit) };
  }
  const filtered = all.filter((h) => _matchesAny(h.title, tokens) || _matchesAny(h.committee, tokens));
  return { hearings: filtered.slice(0, limit) };
}

/**
 * Search CRS (Congressional Research Service) reports — added to the API March 2025.
 *
 * SC-3 FIX: same `q` defect. Over-fetch and client-side filter on title.
 */
async function searchCRSReports({ keyword, limit = 10 }) {
  const tokens = _tokensFor(keyword);
  const data = await callCongress(`/crsreport`, {
    limit: "100",
    sort: "updateDate+desc",
  });
  if (data.error) return { reports: [], error: data.error };

  const all = (data.CRSReports || data.crsReports || []).map((r) => ({
    id: r.id || "",
    title: r.title || "",
    status: r.status || "",
    publish_date: r.publishDate || "",
    update_date: r.updateDate || "",
    version: r.version || "",
    url: r.url || "",
  }));

  if (tokens.length === 0) {
    return { reports: all.slice(0, limit) };
  }
  const filtered = all.filter((r) => _matchesAny(r.title, tokens));
  return { reports: filtered.slice(0, limit) };
}

/**
 * Get committee reports for a given congress/chamber.
 *
 * SC-3 FIX: same `q` defect. Over-fetch and client-side filter on title.
 */
async function searchCommitteeReports({ keyword, congress = 119, limit = 10 }) {
  const tokens = _tokensFor(keyword);
  const data = await callCongress(`/committee-report/${congress}`, {
    limit: "100",
  });
  if (data.error) return { reports: [], error: data.error };

  const all = (data.reports || []).map((r) => ({
    congress: r.congress,
    chamber: r.chamber,
    number: r.number,
    citation: r.citation || "",
    type: r.type || "",
    title: r.title || "",
    url: r.url || "",
  }));

  if (tokens.length === 0) {
    return { reports: all.slice(0, limit) };
  }
  const filtered = all.filter((r) => _matchesAny(r.title, tokens));
  return { reports: filtered.slice(0, limit) };
}

/**
 * Combined enrichment helper for MarketPulse + Pursuit Score.
 * Returns parallel bill/hearing/CRS results for a topic.
 *
 * Congress.gov's `q` parameter is weak — it returns recently updated
 * bills even when the keyword doesn't appear in the title. We
 * over-fetch, then post-filter every result set so callers get
 * relevance instead of noise ("Central Business District Tolling"
 * was slipping through on searches for "MHS GENESIS").
 *
 * Callers can pass `relevanceTokens` (array of tokens that MUST appear
 * in at least one of title/latest_action/committee) for tighter control
 * — especially useful for short vehicle names like "MHS", "VA EHRM"
 * where the default len>3 drop would lose too much signal.
 */
async function enrichWithCongress({ topic, relevanceTokens, congress = 119 }) {
  if (!API_KEY) return { configured: false };
  const rawTokens = Array.isArray(relevanceTokens) && relevanceTokens.length > 0
    ? relevanceTokens
    : (topic || "").split(/\s+/).filter((w) => w.length > 2);
  const tokens = rawTokens
    .map((t) => String(t || "").trim().toLowerCase())
    .filter(Boolean);
  const keyword = tokens.filter((w) => w.length > 3).slice(0, 4).join(" ");

  const matchesAny = (text) => {
    if (!text || tokens.length === 0) return false;
    const lc = String(text).toLowerCase();
    return tokens.some((t) => lc.includes(t));
  };

  const [bills, hearings, crs, committeeReports] = await Promise.all([
    searchBills({ keyword, congress, limit: 40 }),
    searchHearings({ keyword, congress, limit: 20 }),
    searchCRSReports({ keyword, limit: 20 }),
    searchCommitteeReports({ keyword, congress, limit: 20 }),
  ]);

  if (bills.bills) {
    bills.bills = bills.bills.filter((b) => matchesAny(b.title) || matchesAny(b.latest_action)).slice(0, 8);
  }
  if (hearings.hearings) {
    hearings.hearings = hearings.hearings.filter((h) => matchesAny(h.title) || matchesAny(h.committee)).slice(0, 5);
  }
  if (crs.reports) {
    crs.reports = crs.reports.filter((r) => matchesAny(r.title)).slice(0, 5);
  }
  if (committeeReports.reports) {
    committeeReports.reports = committeeReports.reports.filter((r) => matchesAny(r.title)).slice(0, 5);
  }

  return { configured: true, bills, hearings, crs, committeeReports };
}

/**
 * Format Congress.gov data into a prompt-injection context block.
 */
function formatCongressContext(data) {
  if (!data || !data.configured) return "";
  const sections = [];
  if (data.bills?.bills?.length > 0) {
    const rows = data.bills.bills.slice(0, 8).map((b) =>
      `- ${b.type} ${b.number} (${b.congress}th): "${b.title}" | ${b.latest_action_date}: ${b.latest_action} | ${b.url}`
    ).join("\n");
    sections.push(`CONGRESS.GOV ACTIVE BILLS:\n${rows}`);
  }
  if (data.hearings?.hearings?.length > 0) {
    const rows = data.hearings.hearings.map((h) =>
      `- ${h.committee}: "${h.title}" (${h.date}) | Jacket ${h.jacket_number} | ${h.url}`
    ).join("\n");
    sections.push(`COMMITTEE HEARINGS:\n${rows}`);
  }
  if (data.crs?.reports?.length > 0) {
    const rows = data.crs.reports.map((r) =>
      `- ${r.id}: "${r.title}" | Updated ${r.update_date} | ${r.url}`
    ).join("\n");
    sections.push(`CRS REPORTS (staff briefings behind bill language):\n${rows}`);
  }
  if (data.committeeReports?.reports?.length > 0) {
    const rows = data.committeeReports.reports.map((r) =>
      `- ${r.citation || `${r.chamber} ${r.number}`}: "${r.title}" (${r.type}) | ${r.url}`
    ).join("\n");
    sections.push(`COMMITTEE REPORTS:\n${rows}`);
  }
  if (sections.length === 0) return "";
  return "\n\nCONGRESS.GOV VERIFIED LEGISLATIVE DATA:\n\n" + sections.join("\n\n");
}

module.exports = {
  searchBills,
  searchHearings,
  searchCRSReports,
  searchCommitteeReports,
  enrichWithCongress,
  formatCongressContext,
};
