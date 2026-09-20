// ============================================================================
// lib/agent-federal.js — the federal product surfaces for agents
// (docs/agent-platform-spec.md section 5): Contract Tracker rows, agency org
// charts, the Pursuit Calendar, and the paid engines (Signal Chain, Pursuit
// Score, Compliance Check, Ask MMT) run for the member through their own
// handlers, so caps, caching, logging and citations are identical to the web
// product. Every record meets the record contract (lib/record-contract.js).
// No service-role client is built here; database reads take ctx.db.
// ============================================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const rc = require("./record-contract");
const ref = require("./agent-reference");

const SITE = "https://missionmeetstech.com";
const DAY_MS = 86400000;

// Repo root from netlify/functions/lib, then the Lambda task root.
const ROOT_CANDIDATES = [
  path.join(__dirname, "..", "..", ".."),
  process.env.LAMBDA_TASK_ROOT || "",
  process.cwd(),
  "/var/task",
];

function readJsonFromRoot(rel) {
  for (const root of ROOT_CANDIDATES) {
    if (!root) continue;
    const p = path.join(root, rel);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  throw new Error(`agent-federal: ${rel} not found under any root`);
}

const nowIso = (now) => (now instanceof Date ? now : now ? new Date(now) : new Date()).toISOString();
const lc = (v) => String(v == null ? "" : v).toLowerCase().trim();

function pageOf(rows, paging) {
  const limit = paging && paging.limit ? paging.limit : 25;
  const offset = paging && paging.offset ? paging.offset : 0;
  return { page: rows.slice(offset, offset + limit), limit, offset };
}

function envelope(rows, paging, now, stamp, extra) {
  const { page, limit, offset } = pageOf(rows, paging);
  return {
    data: page, total_count: rows.length, has_more: offset + page.length < rows.length, limit, offset,
    retrieved_at: nowIso(now), dataset: stamp, confidence_summary: rc.confidenceSummary(page), ...(extra || {}),
  };
}

// ---- Contract Tracker (contracts.json) -------------------------------------

let CONTRACTS = null;
function contracts() {
  if (!CONTRACTS) {
    const j = readJsonFromRoot("contracts.json");
    CONTRACTS = Array.isArray(j) ? j : (j.contracts || j.data || []);
  }
  return CONTRACTS;
}
function _resetForTests() { CONTRACTS = null; }

// A SAM.gov opportunity link is real only when its /opp/ id is 32 hex chars;
// https://sam.gov by itself is not a source (CLAUDE.md data truth rules).
const SAM_OPP_RE = /\/opp\/([^/?#]+)/;
function usableSourceUrl(u) {
  if (!u || typeof u !== "string") return false;
  const s = u.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/^https?:\/\/(www\.)?sam\.gov\/?$/i.test(s)) return false;
  const m = SAM_OPP_RE.exec(s);
  if (m && !/^[0-9a-f]{32}$/i.test(m[1])) return false;
  return true;
}

function contractSource(row) {
  const cands = [...(Array.isArray(row.source_urls) ? row.source_urls : []), row.link, row.source];
  return cands.find(usableSourceUrl) || null;
}

function contractsStamp() {
  const dates = contracts().map((r) => r.last_verified).filter(Boolean).sort();
  const newest = dates.length ? dates[dates.length - 1] : null;
  return { id: "contracts", as_of: newest, last_verified: newest, source: "contracts.json" };
}

function serializeContract(row, now) {
  const rec = {
    slug: row.slug, name: row.name, agency: row.agency, vendor: row.vendor, value: row.value, status: row.status,
    classification: row.classification, naics: row.naics, description: row.description, link: row.link,
    small_business_eligible: row.small_business_eligible, last_verified: row.last_verified,
    pursuit_score: row.pursuit_score == null ? null : row.pursuit_score,
    source_urls: Array.isArray(row.source_urls) ? row.source_urls.filter(usableSourceUrl) : [],
    tracker_url: `${SITE}/contract-tracker#${row.slug || ""}`,
  };
  const pending = [];
  if (row.content_gap) pending.push(`description (${row.content_gap_note || "placeholder record flagged content_gap"})`);
  return rc.contractRecord(rec, {
    type: "curated_intel", sourceUrl: contractSource(row), retrievedAt: row.last_verified || null, asOf: row.last_verified || null,
    baseConfidence: row.content_gap ? "medium" : "high", pending, now,
  });
}

function listContracts({ agency, status, classification, q, naics } = {}, paging, now) {
  let rows = contracts();
  if (agency) rows = rows.filter((r) => lc(r.agency).includes(lc(agency)));
  if (status) rows = rows.filter((r) => lc(r.status) === lc(status));
  if (classification) rows = rows.filter((r) => lc(r.classification).includes(lc(classification)));
  if (naics) rows = rows.filter((r) => String(r.naics || "").includes(String(naics)));
  if (q) rows = rows.filter((r) => lc(`${r.name} ${r.vendor} ${r.description}`).includes(lc(q)));
  return envelope(rows.map((r) => serializeContract(r, now)), paging, now, contractsStamp(), {
    note: "MMT's hand-maintained Contract Tracker. retrieved_at is the row's last_verified; confidence reads stale past the tracker's 45-day standard, which means re-verify before relying on it, not that the row is wrong.",
  });
}

function getContract(slug, now) {
  const row = contracts().find((r) => lc(r.slug) === lc(slug));
  return row ? { data: serializeContract(row, now), retrieved_at: nowIso(now), dataset: contractsStamp() } : null;
}

// ---- Agency org charts -----------------------------------------------------

// DHA chart nodes are Mary-vetted: a public-source refresh never changes them
// without an explicit revalidation request (CLAUDE.md data truth rules).
const INTERNALLY_MAINTAINED = new Set(["DHA"]);

let HHS_CHART = null;
function hhsChart() {
  if (!HHS_CHART) {
    try { HHS_CHART = readJsonFromRoot("data/orgcharts/hhs.json"); } catch (e) { console.warn("agent-federal: hhs org chart not bundled:", e.message); HHS_CHART = { missing: true }; }
  }
  return HHS_CHART.missing ? null : HHS_CHART;
}

function orgChartBuyers() {
  return ref.load("buyers").buyers.filter((b) => b.org_chart && b.org_chart.url);
}

function findChartBuyer(agency) {
  const q = lc(agency);
  return orgChartBuyers().find((b) => lc(b.code) === q || lc(b.org_chart.url).endsWith(`/${q}`) || lc(b.name) === q) || null;
}

function orgChartRecord(b, now) {
  const kpAll = ref.load("key_people");
  const kp = b.key_people_code ? (kpAll.agencies || []).find((a) => a.agency_code === b.key_people_code) : null;
  const internal = INTERNALLY_MAINTAINED.has(b.code);
  let roster = null;
  let rosterSource = null;
  if (b.code === "HHS") {
    const h = hhsChart();
    if (h) {
      roster = {
        data_as_of: h.data_as_of, primary_source_date: h.primary_source_date, department_top: h.department_top || null, omas: h.omas || null,
        heads_of_contracting_activity: h.heads_of_contracting_activity_full_roster || [],
        decentralized_opdivs_no_independent_contracting_authority: h.decentralized_opdivs_no_independent_contracting_authority || [],
        primary_sources: h.primary_sources || [],
      };
      rosterSource = (h.primary_sources || []).find((s) => /^https?:\/\//.test(s.url || ""));
    }
  }
  const pending = [];
  if (!roster && !kp) pending.push("nodes (the chart is published as a page; structured nodes are not yet exported)");
  else if (!roster) pending.push("nodes (leadership rows come from key people; the full chart is a page)");
  const rec = {
    agency: b.code, name: b.name, chart_url: `${SITE}${b.org_chart.url}`, as_of: b.org_chart.as_of || null, note: b.org_chart.note || null,
    internally_maintained: internal,
    refresh_policy: internal
      ? "Internally maintained. Nodes are vetted by MMT and are never overwritten by a public-source refresh without an explicit revalidation request."
      : "Built from the agency's published roster; weekly change detection (org-chart-monitor) flags drift for manual review.",
    key_people: kp ? { agency_code: kp.agency_code, agency_name: kp.agency_name, verified_date: kp.verified_date, source_url: kp.source_url, people: kp.people || [] } : null,
    roster,
  };
  return rc.contractRecord(rec, {
    type: "org_chart",
    sourceUrl: (kp && kp.source_url) || (rosterSource && rosterSource.url) || null,
    retrievedAt: (kp && kp.verified_date) || b.org_chart.as_of || null,
    asOf: b.org_chart.as_of || null,
    baseConfidence: "high",
    pending,
    now,
  });
}

function listOrgCharts(paging, now) {
  const rows = orgChartBuyers().map((b) => orgChartRecord(b, now));
  return envelope(rows, paging, now, ref.datasetStamp("buyers"), {
    note: "as_of is the chart page's date. A chart older than 30 days reads stale: check the agency's roster before naming a person.",
  });
}

function getOrgChart(agency, now) {
  const b = findChartBuyer(agency);
  if (!b) return null;
  return { data: orgChartRecord(b, now), retrieved_at: nowIso(now), dataset: ref.datasetStamp("buyers") };
}

/**
 * The refresh guard (acceptance test 9): merging a public-source refresh into
 * an internally maintained chart returns the existing record unchanged unless
 * the caller carries an explicit revalidation request.
 * @returns {{record:object, applied:boolean, reason:string}}
 */
function mergeOrgChartRefresh(existing, incoming, { revalidationRequested = false } = {}) {
  if (!existing) return { record: incoming, applied: true, reason: "no existing chart" };
  if (existing.internally_maintained && !revalidationRequested) {
    return { record: existing, applied: false, reason: "internally maintained chart: public-source refresh rejected without an explicit revalidation request" };
  }
  return { record: { ...existing, ...incoming, internally_maintained: existing.internally_maintained }, applied: true, reason: revalidationRequested ? "revalidation requested" : "public-source roster refreshed" };
}

// ---- Pursuit Calendar ------------------------------------------------------

let SEED = null;
function seed() {
  if (!SEED) {
    try { SEED = readJsonFromRoot("data/premium/pursuit-calendar-seed.json"); } catch (e) { console.warn("agent-federal: calendar seed not bundled:", e.message); SEED = { _meta: {}, events: [] }; }
  }
  return SEED;
}

function isoDay(d) { return d.toISOString().slice(0, 10); }

function calendarRecord(row, now, retrievedAt) {
  const rec = {
    id: row.id, title: row.title, event_date: row.event_date, event_time_et: row.event_time_et || null, agency: row.agency || null,
    vehicle: row.vehicle || null, ref: row.ref || null, category: row.category || null,
    status: row.status_override || row.status || null, source_system: row.source_system || null, notes: row.notes || null,
    calendar_url: `${SITE}/premium/calendar/`,
  };
  const pending = [];
  if (!row.source_url) pending.push("source_url (event carried no link)");
  return rc.contractRecord(rec, {
    type: "calendar_event", sourceUrl: usableSourceUrl(row.source_url) ? row.source_url : null,
    retrievedAt, asOf: row.event_date || null, baseConfidence: row.source_system === "sam.gov" ? "high" : "medium", pending, now,
  });
}

/**
 * Dated pursuit events in a window (default today to today plus 90 days).
 * Reads pursuit_calendar through ctx.db; falls back to the bundled seed when
 * the table is unreachable, and says so.
 */
async function listCalendar(db, { from, to, agency, category } = {}, paging, now) {
  const today = now instanceof Date ? now : now ? new Date(now) : new Date();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(from || "")) ? String(from) : isoDay(today);
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(to || "")) ? String(to) : isoDay(new Date(today.getTime() + 90 * DAY_MS));
  if (end < start) return { error: "to must be on or after from." };
  const { limit, offset } = pageOf([], paging);
  let rows = null;
  let source = "pursuit_calendar";
  let dbError = null;
  if (db && typeof db.from === "function") {
    try {
      let q = db.from("pursuit_calendar").select("*", { count: "exact" }).gte("event_date", start).lte("event_date", end).order("event_date", { ascending: true });
      if (agency) q = q.ilike("agency", `%${agency}%`);
      if (category) q = q.eq("category", category);
      const { data, count, error } = await q.range(offset, offset + limit - 1);
      if (error) dbError = error.message;
      else {
        const items = (data || []).map((r) => calendarRecord(r, now, r.updated_at || r.created_at || nowIso(now)));
        const total = count == null ? offset + items.length : count;
        return {
          data: items, total_count: total, has_more: offset + items.length < total, limit, offset, retrieved_at: nowIso(now),
          dataset: { id: "pursuit_calendar", as_of: isoDay(today), last_verified: null, source }, confidence_summary: rc.confidenceSummary(items),
          window: { from: start, to: end },
        };
      }
    } catch (e) { dbError = e.message; }
  }
  // Fallback: the curated seed (source of truth when the table is unreachable).
  const s = seed();
  source = "seed";
  rows = (s.events || []).filter((e) => e.event_date >= start && e.event_date <= end);
  if (agency) rows = rows.filter((e) => lc(e.agency).includes(lc(agency)));
  if (category) rows = rows.filter((e) => e.category === category);
  const curated = (s._meta && s._meta.last_curated_at) || null;
  const items = rows.map((r) => calendarRecord(r, now, curated));
  return envelope(items, paging, now, { id: "pursuit_calendar", as_of: curated, last_verified: curated, source: "data/premium/pursuit-calendar-seed.json" }, {
    window: { from: start, to: end },
    fallback: dbError ? `pursuit_calendar not reached (${dbError}); rows are the curated seed as of ${curated}.` : `rows are the curated seed as of ${curated}.`,
  });
}

// ---- The paid engines, run through their own handlers ----------------------

function syntheticEvent(body, ctx) {
  return {
    httpMethod: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": (ctx && ctx.ip) || "", "user-agent": `mmt-agent-access/${(ctx && ctx.token && ctx.token.id) || "unknown"}` },
    body: JSON.stringify(body), queryStringParameters: {}, path: "", rawUrl: "",
  };
}

async function runInternal(modulePath, body, ctx) {
  const mod = require(modulePath); // lazy: keeps the MCP bundle's cold start small when unused
  const res = await mod.handler(syntheticEvent(body, ctx));
  let parsed = null;
  try { parsed = res && res.body ? JSON.parse(res.body) : null; } catch (_) { parsed = { raw: String(res.body).slice(0, 2000) }; }
  return { statusCode: res ? res.statusCode : 500, body: parsed };
}

const UPSTREAM_CODES = { 400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 429: "MEMBER_ALLOWANCE", 503: "PAUSED" };

/** Shape an engine handler's response as a contracted, MMT-derived record. */
function engineResult(name, res, now, provenance) {
  if (!res || res.statusCode >= 400) {
    const b = (res && res.body) || {};
    return { _upstream: { status: res ? res.statusCode : 500, error: UPSTREAM_CODES[res && res.statusCode] || "SERVER_ERROR", message: b.message || b.error || `${name} could not complete.` } };
  }
  const data = rc.contractRecord(res.body || {}, { type: "engine_result", retrievedAt: nowIso(now), asOf: nowIso(now), derived: provenance, now });
  return { data, retrieved_at: nowIso(now), dataset: { id: name, as_of: nowIso(now).slice(0, 10), last_verified: null, source: "computed for the member at retrieved_at" } };
}

async function signalChain(ctx, { topic, agency, company } = {}, now) {
  if (!topic || String(topic).trim().length < 3) return { _badRequest: "topic is required (at least 3 characters)." };
  const res = await runInternal("../signal-chain", { email: ctx.email, topic: String(topic).trim(), agency: agency || null, company: company || null }, ctx);
  return engineResult("signal_chain", res, now, "the Signal Chain engine; each layer's evidence[] carries its own url and observed_date");
}

async function pursuitScore(ctx, { keyword, agency, naics } = {}, now) {
  if (!keyword || String(keyword).trim().length < 2) return { _badRequest: "keyword is required (at least 2 characters)." };
  const res = await runInternal("../pursuit-score", { email: ctx.email, keyword: String(keyword).trim(), agency: agency || null, naics: naics || null }, ctx);
  return engineResult("pursuit_score", res, now, "the Pursuit Score engine; evidence[] carries each claim's url and observed_date");
}

async function complianceCheck(ctx, { text, sow_text } = {}, now) {
  if (!text || String(text).trim().length < 200) return { _badRequest: "text is required: at least 200 characters of the technical volume." };
  const res = await runInternal("../compliance-check", { email: ctx.email, text: String(text), sowText: sow_text ? String(sow_text) : null }, ctx);
  return engineResult("compliance_check", res, now, "the Compliance Check engine; each check names the registry or dataset it read");
}

/**
 * Ask MMT for the member, through the same handler the web widget uses. The
 * agent token already proved membership, so a one-time bridge token stands in
 * for the subscriber token and resolves to the member's email; caps, logging,
 * turn ids and the sources list are exactly the web product's.
 */
async function askMmt(ctx, { question, history } = {}, now, deps = {}) {
  const q = String(question || "").trim();
  if (q.length < 3) return { _badRequest: "question is required (at least 3 characters)." };
  if (q.length > 1000) return { _badRequest: "question exceeds 1000 characters." };
  const chat = deps.chatModule || require("../premium-chat");
  const bridge = `agent-bridge-${crypto.randomBytes(16).toString("hex")}`;
  const handler = chat.makeHandler({
    verifyToken: (t) => (t === bridge ? { ok: true, email: ctx.email } : { ok: false, reason: "invalid" }),
    ...(deps.overrides || {}),
  });
  const res = await handler(syntheticEvent({ question: q, token: bridge, history: Array.isArray(history) ? history.slice(-6) : [] }, ctx));
  let body = null;
  try { body = res && res.body ? JSON.parse(res.body) : null; } catch (_) { body = null; }
  if (!res || res.statusCode >= 400 || !body) {
    return { _upstream: { status: res ? res.statusCode : 500, error: UPSTREAM_CODES[res && res.statusCode] || "SERVER_ERROR", message: (body && (body.message || body.error)) || "Ask MMT could not answer." } };
  }
  // sources pass through untouched: the citations are the web product's.
  const rec = rc.contractRecord({
    answer: body.answer, agency: body.agency || null, agency_name: body.agencyName || null, has_data: !!body.hasData, model: body.model || null,
    sources: Array.isArray(body.sources) ? body.sources : [], unavailable: Array.isArray(body.unavailable) ? body.unavailable : [],
    remaining: body.remaining == null ? null : body.remaining, cap: body.cap == null ? null : body.cap, turn_id: body.turn_id || null,
  }, { type: "engine_result", retrievedAt: nowIso(now), asOf: nowIso(now), derived: "Ask MMT; sources[] is the citation list exactly as the web product returned it", now });
  return { data: rec, retrieved_at: nowIso(now), dataset: { id: "ask_mmt", as_of: nowIso(now).slice(0, 10), last_verified: null, source: "answered for the member at retrieved_at" } };
}

module.exports = {
  listContracts, getContract, contractsStamp, usableSourceUrl, contractSource,
  listOrgCharts, getOrgChart, mergeOrgChartRefresh, INTERNALLY_MAINTAINED,
  listCalendar, calendarRecord,
  signalChain, pursuitScore, complianceCheck, askMmt, engineResult, runInternal,
  _resetForTests,
};
