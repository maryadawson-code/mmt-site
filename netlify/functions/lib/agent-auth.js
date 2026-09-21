// ============================================================================
// lib/agent-auth.js — Agent Access auth middleware (spec §8, hardening §2,§3)
//
// Runs on EVERY /api/v1/* request, in order:
//   1. Bearer token present + structurally valid     → else 401 (generic)
//   2. SHA-256 lookup in api_tokens                    → not found → 401
//   3. revoked_at set OR expires_at past               → 401
//   4. required scope ∈ token.scopes                   → else 403
//   5. resolve owner email (mp_users) for owner-scoping
//   6. BUDGET GATE (api_cost_ledger, pre-call)         → red → 429 + Retry-After
//   7. SESSION GATE (>100 calls/session)               → 429 + X-Session-Limit-Reached
//   8. RATE LIMIT (per-key 60/min, 5k/day; global 1k/min) → 429 + Retry-After + X-RateLimit-*
// then the handler runs and calls finalizeAudit() to:
//   - bump api_tokens.last_used_at
//   - write the api_audit_log row (cost_usd, response_bytes, session_id, status)
//   - upsert the api_cost_ledger day+month buckets
//
// IDENTITY-MODEL ADAPTATION (Mary, 2026-06-16): mmt-site has no Supabase Auth,
// so the spec's "set RLS context to user_id" step is realized as explicit
// owner-scoped filters in lib/agent-data.js. The service client lives HERE and
// in agent-data.js ONLY — never in a netlify/functions/agent-*.js read handler,
// so the GATE-3 "no service_role in read handlers" intent holds.
// ============================================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { hashToken, looksLikeToken } = require("./agent-tokens");
const { RATE, SESSION_MAX_CALLS, BUDGET, ALLOWANCE } = require("./agent-config");
const gate = require("./agent-allowance-gate");
const { loadEntitlement } = require("./entitlement");
const { computeAgentAccess } = require("./agent-entitlement");
// 2026-09-20 platform spec (docs/agent-platform-spec.md §2, §6): every response
// carries a request_id that appears in the audit row; the caller may attribute a
// call with X-MMT-Client-Ref (opaque, grouping only); every audit row records
// tool, scope and records_returned; the month's calls are counted for the
// allowance alerts.
const usage = require("./agent-usage");
const { sendEmail } = require("./send-email");
const { cacheGet, cacheSet, cacheKey, connectEvent: connectBlobs } = require("./fetch-cache");

let _client = null;
/** Memoized service-role client. Used only inside lib/ (auth + data layers). */
function getServiceClient() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  return _client;
}

const CORS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Id, Idempotency-Key, X-MMT-Client-Ref, X-Request-Id",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After",
  "Vary": "Origin",
};

// api_audit_log.request_id is a uuid column (migration 20260920000000, applied
// 2026-09-21). Any other shape would make the audit insert fail with 22P02 and
// lose the row, so a caller's X-Request-Id is echoed only when it is a UUID.
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_REF_RE = /^[A-Za-z0-9._:@/+-]{1,64}$/;
const METERING_FIELDS = ["request_id", "client_ref", "tool", "scope", "records_returned"];
const AI_PAGE = "https://missionmeetstech.com/premium/ai-integrations/";
const GUIDE_ALLOWANCE_URL = "https://missionmeetstech.com/agent-access-guide#allowance";

function headerOf(event, name) {
  const h = (event && event.headers) || {};
  const lower = name.toLowerCase();
  for (const k of Object.keys(h)) if (k.toLowerCase() === lower) return h[k];
  return undefined;
}

/** The request id every response carries: the caller's X-Request-Id when it is a UUID, else a fresh UUID. */
function requestIdFrom(event) {
  const given = String(headerOf(event, "x-request-id") || "").trim();
  return REQUEST_ID_RE.test(given) ? given.toLowerCase() : crypto.randomUUID();
}

/** The caller's attribution key, opaque to MMT. Malformed values are dropped, never rejected. */
function clientRefFrom(event) {
  const given = String(headerOf(event, "x-mmt-client-ref") || headerOf(event, "x-client-ref") || "").trim();
  return CLIENT_REF_RE.test(given) ? given : null;
}

const requestIdHeader = (requestId) => ({ "X-Request-Id": requestId });

function resp(statusCode, body, extra) {
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json", ...(extra || {}) }, body: JSON.stringify(body) };
}

// Public discovery URL — handed to a stuck agent so it can recover (find the
// auth scheme + how to get a token) without us leaking which check failed.
const DOCS_URL = "https://missionmeetstech.com/api/v1";

// Generic, non-enumerating auth failure (spec §9 — no "expired" vs "not found" leak).
function unauthorized(requestId) {
  return resp(401, { error: "UNAUTHORIZED", message: "Invalid or missing API key.", docs: DOCS_URL, request_id: requestId }, requestIdHeader(requestId));
}
// A scope failure names the scope the call needed (platform spec §6): the
// caller can fix its token; nothing about the account is revealed.
function forbidden(requiredScope, requestId) {
  return resp(403, {
    error: "FORBIDDEN_SCOPE",
    required_scope: requiredScope,
    message: `This key lacks the '${requiredScope}' permission. Re-mint the token at ${AI_PAGE} with that scope enabled.`,
    docs: DOCS_URL,
    request_id: requestId,
  }, requestIdHeader(requestId));
}

function bearerFrom(event) {
  const h = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function clientIp(event) {
  const h = event.headers || {};
  return (h["x-nf-client-connection-ip"] || h["x-forwarded-for"] || "").split(",")[0].trim() || null;
}

function isUuid(s) {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Count audit rows for a token since `sinceIso` (rate + session windows). */
async function countAudit(db, filter, sinceIso) {
  let q = db.from("api_audit_log").select("id", { count: "exact", head: true }).gte("created_at", sinceIso);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count } = await q;
  return count || 0;
}

/**
 * The month's billable calls for one agent: the same rows, the same rule
 * (status below 400), that the statement and the Stripe report count, so the
 * gate, the statement and the bill cannot disagree. null when the count could
 * not be read: the gate then serves the call (a database blip never pauses a
 * paying customer) and says so in the log.
 */
async function countBillableThisMonth(db, tokenId, now) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  try {
    const { count, error } = await db.from("api_audit_log").select("id", { count: "exact", head: true })
      .eq("token_id", tokenId).gte("created_at", monthStart).lt("status_code", 400);
    if (error) { console.error("agent-auth allowance gate count (serving the call):", error.message); return null; }
    return count || 0;
  } catch (e) {
    console.error("agent-auth allowance gate count (serving the call):", e.message);
    return null;
  }
}

const addonPriceIds = () => String(process.env.AGENT_ACCESS_ADDON_PRICE_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
let _stripe = null;
function stripeClient() {
  if (_stripe || !process.env.STRIPE_SECRET_KEY) return _stripe;
  const Stripe = require("stripe"); // lazy: only an agent already past its allowance ever needs it
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

/**
 * 9. ALLOWANCE GATE (lib/agent-allowance-gate.js). Nothing is served that
 * cannot be billed: past its allowance an agent runs only while its owner's
 * overage is billable, and only up to the overage limit. Returns the 429
 * response when the agent is paused, else null.
 */
async function allowanceGate({ db, token, email, monthCalls, now, deps }) {
  if (!ALLOWANCE.CONFIRMED || monthCalls == null || monthCalls < ALLOWANCE.CALLS_PER_MONTH) return null;
  let billable = true;
  if (!gate.hasOverride(ALLOWANCE, token.id)) {
    const r = await gate.resolveBillable({
      userId: token.user_id, email,
      stripe: (deps && deps.stripe) || stripeClient(), cacheGet, cacheSet, cacheKey,
      addonPriceIds: (deps && deps.addonPriceIds) || addonPriceIds(),
    });
    billable = r.billable;
  }
  const d = gate.gateDecision({ allowance: ALLOWANCE, monthCalls, tokenId: token.id, billable });
  if (d.allow) return null;
  const resumes = gate.resumeLabel(now);
  const over = d.code === "OVERAGE_LIMIT_REACHED";
  // Tell the member (and Mary) once per agent and month. Never throws.
  await usage.sendAllowanceAlerts({
    email, tokenId: token.id, tokenName: token.name || null, month: usage.monthKey(now), alerts: ["paused"], calls: monthCalls,
    pause: { code: d.code, limit: d.limit, resumes }, notifyOwner: true, sendEmail: (deps && deps.sendEmail) || sendEmail, cacheGet, cacheSet, cacheKey,
  });
  return {
    code: d.code,
    message: over
      ? `This connection has used its ${ALLOWANCE.CALLS_PER_MONTH} included calls and its ${d.limit} extra calls for the month. It resumes on ${resumes}. To raise the limit, reply to the email MMT sent the account owner.`
      : `This connection has used its ${ALLOWANCE.CALLS_PER_MONTH} included calls for the month. It resumes on ${resumes}. The account owner can add Agent Access on ${AI_PAGE} to keep going past the allowance.`,
    ceiling: d.ceiling,
  };
}

const nextUtcMidnightSec = () => {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
};

/**
 * Authenticate + gate an agent request.
 * @returns {Promise<{ok:true, ctx} | {ok:false, response}>}
 */
async function authenticateAgent(event, requiredScope, dbOverride, gateDeps) {
  const db = dbOverride || getServiceClient();
  const requestId = requestIdFrom(event);
  const clientRef = clientRefFrom(event);
  const failMeta = { requestId, clientRef, scope: requiredScope };
  connectBlobs(event); // the allowance-alert markers live in Netlify Blobs

  // 1. Bearer present + structurally valid
  const raw = bearerFrom(event);
  if (!raw || !looksLikeToken(raw)) return { ok: false, response: unauthorized(requestId) };

  // 2. Lookup by hash
  let token;
  try {
    const { data, error } = await db
      .from("api_tokens")
      .select("id, user_id, name, scopes, expires_at, revoked_at")
      .eq("token_hash", hashToken(raw))
      .limit(1)
      .single();
    if (error || !data) return { ok: false, response: unauthorized(requestId) };
    token = data;
  } catch {
    return { ok: false, response: unauthorized(requestId) };
  }

  // 3. Revoked or expired (known key → audit the 401 so §5 alerts can count)
  const now = new Date();
  if (token.revoked_at || (token.expires_at && new Date(token.expires_at) <= now)) {
    await safeAuditFailure(db, token, 401, event, requiredScope, undefined, failMeta);
    return { ok: false, response: unauthorized(requestId) };
  }

  // 4. Scope. requiredScope may be null for the MCP handshake (initialize /
  //    tools/list only need a VALID token; per-tool scope is enforced at
  //    tools/call time). REST handlers always pass a concrete scope.
  if (requiredScope && (!Array.isArray(token.scopes) || !token.scopes.includes(requiredScope))) {
    await safeAuditFailure(db, token, 403, event, requiredScope, undefined, failMeta);
    return { ok: false, response: forbidden(requiredScope, requestId) };
  }

  // 5. Owner email (for owner-scoped tracker reads) + paid Agent Access check.
  //    "All Agent Access" is gated to the paid add-on (spec §11b): a lapsed
  //    add-on must stop API access. Fail OPEN on a lookup error so a transient
  //    DB blip never locks out a paying member (the token already proved access).
  let email = null;
  try {
    const { data: u, error: uErr } = await db.from("mp_users").select("email, agent_seats").eq("id", token.user_id).limit(1).single();
    // A genuine DB error → fail-open (rethrow into the catch below) so a blip
    // never locks out a paying member. PGRST116 (no row) is NOT a blip — it's an
    // orphaned token with no resolvable member, which must NOT read.
    if (uErr && uErr.code !== "PGRST116") throw new Error(uErr.message);
    email = u ? String(u.email || "").toLowerCase() : null;
    if (!email) {
      // Valid token but no resolvable member/email → not eligible. (Closes the
      // fail-open where a deleted/blank-email owner kept global-intel access.)
      await safeAuditFailure(db, token, 403, event, requiredScope, undefined, failMeta);
      return { ok: false, response: resp(403, { error: "AGENT_ACCESS_REQUIRED", message: "This connection's AI access is no longer active.", docs: DOCS_URL, request_id: requestId }, requestIdHeader(requestId)) };
    }
    const ent = await loadEntitlement(db, email);
    const access = computeAgentAccess(ent, { agent_seats: u.agent_seats || 0 });
    if (!access.eligible) {
      await safeAuditFailure(db, token, 403, event, requiredScope, undefined, failMeta);
      return { ok: false, response: resp(403, { error: "AGENT_ACCESS_REQUIRED", message: "This connection's AI access is no longer active.", docs: DOCS_URL, request_id: requestId }, requestIdHeader(requestId)) };
    }
  } catch (e) { console.error("agent-auth access check (fail-open):", e.message); }

  // 6. BUDGET GATE (pre-call) — red (>100% daily cap) blocks BEFORE any work
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  try {
    const { data: ledger, error: ledgerErr } = await db
      .from("api_cost_ledger")
      .select("spend_usd, budget_usd")
      .eq("token_id", token.id).eq("window_kind", "day").eq("window_start", dayStart)
      .limit(1).single();
    // PGRST116 = no ledger row yet = $0 spent = pass. Any OTHER error is a real
    // read failure — log it (don't silently treat a DB blip as "budget OK").
    if (ledgerErr && ledgerErr.code !== "PGRST116") {
      console.error("agent-auth budget gate ledger read (fail-open):", ledgerErr.message);
    } else if (ledger && Number(ledger.spend_usd) >= Number(ledger.budget_usd)) {
      await safeAuditFailure(db, token, 429, event, requiredScope, undefined, failMeta);
      return { ok: false, response: resp(429, { error: "BUDGET_EXCEEDED", message: "You've reached this period's usage.", request_id: requestId }, { "Retry-After": String(nextUtcMidnightSec()), ...requestIdHeader(requestId) }) };
    }
  } catch (e) { console.error("agent-auth budget gate (fail-open):", e.message); }

  // 7. SESSION GATE — >100 calls per session
  const sessionId = isUuid(event.headers && (event.headers["x-session-id"] || event.headers["X-Session-Id"]))
    ? (event.headers["x-session-id"] || event.headers["X-Session-Id"])
    : crypto.randomUUID(); // no session header = fresh session each call (never trips, by design)
  const sessSince = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const sessCount = await countAudit(db, { session_id: sessionId }, sessSince);
  if (sessCount >= SESSION_MAX_CALLS) {
    await safeAuditFailure(db, token, 429, event, requiredScope, sessionId, failMeta);
    return { ok: false, response: resp(429, { error: "SESSION_LIMIT", message: "This session hit its call limit. Start a new session.", request_id: requestId }, { "X-Session-Limit-Reached": "true", "Retry-After": "60", ...requestIdHeader(requestId) }) };
  }

  // 8. RATE LIMIT — per-key 60/min + 5k/day, global 1k/min
  const minAgo = new Date(now.getTime() - 60 * 1000).toISOString();
  const [perMin, perDay, globalMin, monthCalls] = await Promise.all([
    countAudit(db, { token_id: token.id }, minAgo),
    countAudit(db, { token_id: token.id }, dayStart),
    countAudit(db, {}, minAgo),
    countBillableThisMonth(db, token.id, now),
  ]);
  // Rate limits are per credential (the spec's agent_id is api_tokens.id), so
  // one connected agent's burst never starves a sibling on the same membership.
  const rateHeaders = {
    "X-RateLimit-Limit": String(RATE.PER_KEY_PER_MIN),
    "X-RateLimit-Remaining": String(Math.max(0, RATE.PER_KEY_PER_MIN - perMin - 1)),
    "X-Request-Id": requestId,
  };
  if (perMin >= RATE.PER_KEY_PER_MIN || globalMin >= RATE.GLOBAL_PER_MIN) {
    await safeAuditFailure(db, token, 429, event, requiredScope, sessionId, failMeta);
    return { ok: false, response: resp(429, { error: "RATE_LIMITED", message: "Too many requests. Slow down a moment.", request_id: requestId }, { ...rateHeaders, "Retry-After": "60" }) };
  }
  if (perDay >= RATE.PER_KEY_PER_DAY) {
    await safeAuditFailure(db, token, 429, event, requiredScope, sessionId, failMeta);
    return { ok: false, response: resp(429, { error: "DAILY_LIMIT", message: "You've reached today's request limit.", request_id: requestId }, { ...rateHeaders, "Retry-After": String(nextUtcMidnightSec()) }) };
  }

  // 9. ALLOWANCE GATE — never serve a call nobody can be billed for.
  let paused = null;
  try { paused = await allowanceGate({ db, token, email, monthCalls, now, deps: gateDeps }); }
  catch (e) { console.error("agent-auth allowance gate (serving the call):", e.message); }
  if (paused) {
    await safeAuditFailure(db, token, 429, event, requiredScope, sessionId, failMeta);
    return { ok: false, response: resp(429, { error: paused.code, message: paused.message, monthly_ceiling: paused.ceiling, docs: GUIDE_ALLOWANCE_URL, request_id: requestId }, { ...rateHeaders, "Retry-After": String(gate.secondsToNextMonth(now)) }) };
  }

  return {
    ok: true,
    ctx: {
      db, token, userId: token.user_id, email, sessionId, rateHeaders, dayStart, startedAt: Date.now(),
      ip: clientIp(event), userAgent: (event.headers && event.headers["user-agent"]) || null,
      requestId, clientRef, requiredScope, tokenName: token.name || null,
    },
  };
}

// Until migrations/20260920000000_agent_metering.sql is applied the new columns
// do not exist; the first PGRST204 flips this and rows are written with the
// legacy column set (one warning per Lambda instance, never a lost row).
let meteringColumnsMissing = false;
function _resetMeteringForTests() { meteringColumnsMissing = false; }

/** Insert one audit row, degrading to the legacy column set when the metering columns are missing. */
async function insertAudit(db, row) {
  if (!meteringColumnsMissing) {
    const { error } = await db.from("api_audit_log").insert(row);
    if (!error) return { ok: true, degraded: false };
    if (!usage.isMissingColumn(error)) return { ok: false, error };
    meteringColumnsMissing = true;
    console.warn("api_audit_log metering columns missing; apply migrations/20260920000000_agent_metering.sql. Writing legacy rows until then.");
  }
  const legacy = { ...row };
  for (const f of METERING_FIELDS) delete legacy[f];
  const { error } = await db.from("api_audit_log").insert(legacy);
  return error ? { ok: false, error } : { ok: true, degraded: true };
}

/**
 * Write the audit row + bump last_used_at + the call ledger, then fire any
 * allowance alert the month's count just crossed. Never throws.
 * tool: the MCP tool name or REST endpoint; scope: the scope the call needed;
 * recordsReturned: rows in data[] (null when the response has no list).
 */
async function finalizeAudit(ctx, { statusCode, responseBytes = 0, llmModel = null, costUsd = 0, cacheHit = false, endpoint, method = "GET", tool = null, scope = null, recordsReturned = null }) {
  const { db, token, userId, sessionId } = ctx;
  try {
    await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id);
  } catch (e) { console.error("finalizeAudit last_used_at:", e.message); }
  try {
    const r = await insertAudit(db, {
      token_id: token.id, user_id: userId, endpoint, method, status_code: statusCode,
      ip: ctx.ip, user_agent: ctx.userAgent, session_id: sessionId, llm_model: llmModel,
      cache_hit: cacheHit, cost_usd: costUsd, response_bytes: responseBytes,
      request_id: ctx.requestId || null, client_ref: ctx.clientRef || null,
      tool: tool || endpoint || null, scope: scope || ctx.requiredScope || null,
      records_returned: Number.isInteger(recordsReturned) ? recordsReturned : null,
    });
    if (!r.ok) console.error("finalizeAudit insert:", r.error && r.error.message);
  } catch (e) { console.error("finalizeAudit insert threw:", e.message); }
  // A call counts toward the month's allowance when it returned data (status
  // below 400), whether or not it cost money: the same rule the statement and
  // the Stripe report use, so the alert, the statement and the bill agree.
  const billable = usage.isBillableStatus(statusCode);
  let monthCalls = null;
  try { monthCalls = await bumpLedger(ctx, costUsd, billable); } catch (e) { console.error("ledger:", e.message); }
  if (billable && monthCalls != null) {
    const crossed = usage.alertsCrossed(monthCalls - 1, monthCalls);
    if (crossed.length) {
      await usage.sendAllowanceAlerts({
        email: ctx.email, tokenId: token.id, tokenName: ctx.tokenName, month: usage.monthKey(new Date()),
        alerts: crossed, calls: monthCalls, limit: gate.overageLimitFor(ALLOWANCE, token.id, true), sendEmail, cacheGet, cacheSet, cacheKey,
      });
    }
  }
}

/**
 * Bump the day and month ledger buckets; returns the month's billable call
 * count after this call, or null. Spend always accrues; call_count moves only
 * for a billable call (an error never uses up the allowance).
 */
async function bumpLedger(ctx, costUsd, billable = true) {
  const { db, token, userId, dayStart } = ctx;
  const monthStart = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); })();
  let monthCalls = null;
  for (const [window_kind, window_start, budget_usd] of [["day", dayStart, BUDGET.DAILY_USD], ["month", monthStart, BUDGET.MONTHLY_USD]]) {
    const { data: row } = await db.from("api_cost_ledger").select("id, spend_usd, call_count")
      .eq("token_id", token.id).eq("window_kind", window_kind).eq("window_start", window_start).limit(1).single();
    let count;
    if (row) {
      count = (Number(row.call_count) || 0) + (billable ? 1 : 0);
      const { error } = await db.from("api_cost_ledger").update({ spend_usd: Number(row.spend_usd) + costUsd, call_count: count, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) console.error("ledger update:", error.message);
    } else {
      count = billable ? 1 : 0;
      const { error } = await db.from("api_cost_ledger").insert({ token_id: token.id, user_id: userId, window_kind, window_start, spend_usd: costUsd, budget_usd, call_count: count });
      if (error) console.error("ledger insert:", error.message);
    }
    if (window_kind === "month") monthCalls = count;
  }
  return monthCalls;
}

/** Best-effort audit of a rejected request (known token only). Never throws. */
async function safeAuditFailure(db, token, statusCode, event, endpoint, sessionId, meta) {
  const m = meta || {};
  try {
    await insertAudit(db, {
      token_id: token.id, user_id: token.user_id, endpoint: endpoint || (event.path || ""), method: event.httpMethod || "GET",
      status_code: statusCode, ip: clientIp(event), user_agent: (event.headers && event.headers["user-agent"]) || null,
      session_id: sessionId || null, response_bytes: 0, cost_usd: 0,
      request_id: m.requestId || null, client_ref: m.clientRef || null, tool: endpoint || (event.path || null), scope: m.scope || null, records_returned: 0,
    });
  } catch (e) { console.error("safeAuditFailure:", e.message); }
}

module.exports = {
  authenticateAgent, finalizeAudit, getServiceClient, resp, CORS,
  requestIdFrom, clientRefFrom, insertAudit, METERING_FIELDS, _resetMeteringForTests,
  countBillableThisMonth, allowanceGate,
};
