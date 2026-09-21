// ============================================================================
// lib/agent-usage.js — monthly call allowance, overage and the usage statement
// for one agent credential (docs/agent-platform-spec.md section 2).
//
// Pure math lives up top so the acceptance tests can drive it without a
// database: allowanceState() prices a month, alertsCrossed() says which alert
// a call count crossing fires, summarizeRows() turns audit rows into the
// statement with its per-client_ref breakdown. statement() reads the rows
// (paginated, PostgREST caps a request at 1000) and sendAllowanceAlerts()
// emails the member once per (agent, month, alert), with a Netlify Blobs
// marker so an at-least-once caller cannot send twice.
//
// The allowance and the overage rate are Mary's to set. Until she does
// (AGENT_ALLOWANCE_CONFIRMED=true) the defaults in lib/agent-config.js are
// placeholders nobody chose, so no surface quotes them to a member: the alert
// emails do not send, the /api/v1 catalog publishes null, and the member panel
// counts calls without an allowance or dollars. The crossings are still counted.
//
// A billable call is one that returned data: status below 400. Rejected calls
// (401, 403, 429), bad requests, COVERAGE_GAP answers and server errors are
// listed on the statement and never count against the allowance, so they are
// never billed (lib/agent-overage-billing.js bills what this file reports).
//
// client_ref is the caller-supplied X-MMT-Client-Ref header: opaque to MMT, a
// grouping key and nothing else. It is never parsed, matched or treated as
// identifying data.
// ============================================================================

const { ALLOWANCE } = require("./agent-config");

const UNATTRIBUTED = "unattributed";
const PAGE = 1000;
const MARKER_TTL_MS = 45 * 86400000;
const ALERT_KINDS = Object.freeze(["allowance_80pct", "first_overage"]);

function round2(n) { return Math.round(n * 100) / 100; }

/** A call counts against the allowance only when it returned data. */
function isBillableStatus(statusCode) {
  const s = Number(statusCode) || 0;
  return s > 0 && s < 400;
}

/** "YYYY-MM" for a Date or ISO string (UTC). */
function monthKey(d) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** UTC window for a "YYYY-MM" month. Returns null for a malformed month. */
function monthWindow(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1));
  return { month: `${m[1]}-${m[2]}`, start: start.toISOString(), end: end.toISOString() };
}

/**
 * Price a month. Pure.
 * @param {number} calls
 * @param {number} [allowance]
 * @param {number} [rate] USD per call past the allowance
 */
function allowanceState(calls, allowance = ALLOWANCE.CALLS_PER_MONTH, rate = ALLOWANCE.OVERAGE_USD_PER_CALL) {
  const n = Math.max(0, Number(calls) || 0);
  const overageCalls = Math.max(0, n - allowance);
  return {
    calls: n,
    allowance,
    remaining: Math.max(0, allowance - n),
    pct_used: allowance > 0 ? Math.round((n / allowance) * 1000) / 10 : null,
    overage_calls: overageCalls,
    overage_usd_per_call: rate,
    overage_usd: round2(overageCalls * rate),
    pricing_confirmed: ALLOWANCE.CONFIRMED,
  };
}

/**
 * Which alerts the step from prevCalls to nextCalls fires. Pure. Each fires on
 * the exact crossing, so a sequence of single calls fires each once.
 */
function alertsCrossed(prevCalls, nextCalls, allowance = ALLOWANCE.CALLS_PER_MONTH, threshold = ALLOWANCE.ALERT_THRESHOLD) {
  const out = [];
  const prev = Math.max(0, Number(prevCalls) || 0);
  const next = Math.max(0, Number(nextCalls) || 0);
  const eighty = Math.ceil(allowance * threshold);
  if (prev < eighty && next >= eighty) out.push("allowance_80pct");
  if (prev <= allowance && next > allowance) out.push("first_overage");
  return out;
}

/**
 * Audit rows → statement. Pure.
 * Rows carry: created_at, status_code, endpoint, tool?, scope?, client_ref?,
 * records_returned?, cost_usd?, response_bytes?.
 */
function summarizeRows(rows, { month, allowance = ALLOWANCE.CALLS_PER_MONTH, rate = ALLOWANCE.OVERAGE_USD_PER_CALL } = {}) {
  const byRef = new Map();
  const byTool = new Map();
  let calls = 0, errors = 0, billable = 0, records = 0, cost = 0, bytes = 0;
  for (const r of rows || []) {
    calls += 1;
    const status = Number(r.status_code) || 0;
    const isErr = status >= 400;
    if (isErr) errors += 1;
    if (isBillableStatus(status)) billable += 1;
    const rec = Number(r.records_returned) || 0;
    records += rec;
    cost += Number(r.cost_usd) || 0;
    bytes += Number(r.response_bytes) || 0;
    const ref = r.client_ref ? String(r.client_ref) : UNATTRIBUTED;
    const a = byRef.get(ref) || { client_ref: ref === UNATTRIBUTED ? null : ref, calls: 0, errors: 0, records_returned: 0, cost_usd: 0 };
    a.calls += 1; if (isErr) a.errors += 1; a.records_returned += rec; a.cost_usd += Number(r.cost_usd) || 0;
    byRef.set(ref, a);
    const tool = r.tool || r.endpoint || "unknown";
    const t = byTool.get(tool) || { tool, calls: 0, errors: 0, records_returned: 0 };
    t.calls += 1; if (isErr) t.errors += 1; t.records_returned += rec;
    byTool.set(tool, t);
  }
  // Overage is priced in call order over the billable calls only: the first
  // `allowance` calls that returned data are included, every one after that is
  // overage, attributed to the client_ref that made it.
  const ordered = (rows || []).filter((r) => isBillableStatus(r.status_code)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const overageByRef = new Map();
  ordered.forEach((r, i) => {
    if (i >= allowance) {
      const ref = r.client_ref ? String(r.client_ref) : UNATTRIBUTED;
      overageByRef.set(ref, (overageByRef.get(ref) || 0) + 1);
    }
  });
  const byClientRef = [...byRef.values()]
    .map((a) => {
      const key = a.client_ref == null ? UNATTRIBUTED : a.client_ref;
      const over = overageByRef.get(key) || 0;
      return { ...a, cost_usd: round2(a.cost_usd), overage_calls: over, overage_usd: round2(over * rate) };
    })
    .sort((x, y) => y.calls - x.calls);
  const state = allowanceState(billable, allowance, rate);
  return {
    month: month || null,
    ...state,
    calls, // every audited call, errors included
    billable_calls: billable, // the ones that returned data; the allowance and overage are counted on these
    error_calls: errors,
    records_returned: records,
    compute_cost_usd: round2(cost),
    response_bytes: bytes,
    by_client_ref: byClientRef,
    by_tool: [...byTool.values()].sort((x, y) => y.calls - x.calls),
    note: "Only calls that returned data (status below 400) count against the allowance; errors and rejected calls are listed and never billed. Overage is priced in call order: the first billable calls up to the allowance are included; each one after that is billed at overage_usd_per_call and attributed to the client_ref that made it. client_ref is opaque to MMT.",
  };
}

/** Read one token's audit rows for a month, 1000 at a time. */
async function readMonthRows(db, { tokenId, userId, window }) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from("api_audit_log")
      .select("created_at, status_code, endpoint, tool, scope, client_ref, records_returned, cost_usd, response_bytes")
      .eq("token_id", tokenId)
      .gte("created_at", window.start)
      .lt("created_at", window.end)
      .order("created_at", { ascending: true });
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) {
      // Before the metering migration the new columns do not exist; fall back
      // to the legacy column set rather than failing the statement.
      if (isMissingColumn(error)) return readMonthRowsLegacy(db, { tokenId, userId, window });
      throw new Error(`usage statement read: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function readMonthRowsLegacy(db, { tokenId, userId, window }) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from("api_audit_log")
      .select("created_at, status_code, endpoint, cost_usd, response_bytes")
      .eq("token_id", tokenId)
      .gte("created_at", window.start)
      .lt("created_at", window.end)
      .order("created_at", { ascending: true });
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`usage statement read: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function isMissingColumn(error) {
  return !!error && (error.code === "PGRST204" || error.code === "42703" || /column|schema cache/i.test(String(error.message || "")));
}

/**
 * The monthly usage statement for one credential.
 * @param {object} db service client
 * allowance and rate default to the published ones; the billing run passes its
 * own so the statement it bills from and the rate it checks cannot differ.
 * @param {{tokenId:string, userId?:string, month?:string, now?:Date, allowance?:number, rate?:number}} p
 */
async function statement(db, { tokenId, userId, month, now, allowance, rate }) {
  const window = monthWindow(month || monthKey(now || new Date()));
  if (!window) return { error: "month must be YYYY-MM." };
  const rows = await readMonthRows(db, { tokenId, userId, window });
  const out = summarizeRows(rows, { month: window.month, allowance, rate });
  return { agent_id: tokenId, member_id: userId || null, window_start: window.start, window_end: window.end, generated_at: new Date(now || Date.now()).toISOString(), ...out };
}

function alertCopy(kind, { tokenName, state, month }) {
  const name = tokenName || "your AI connection";
  const site = "https://missionmeetstech.com/premium/ai-integrations/";
  // Only ever sent with confirmed pricing (sendAllowanceAlerts), so the rate is the published one.
  const rateLine = `Calls past the allowance stay on and are priced at $${state.overage_usd_per_call} each on your monthly statement.`;
  if (kind === "allowance_80pct") {
    return {
      subject: `${name} has used 80 percent of this month's API allowance`,
      html: `<p>Hi, it's Mary.</p><p>The AI connection <strong>${escapeHtml(name)}</strong> has made ${state.calls} of its ${state.allowance} included calls for ${month}.</p><p>${rateLine}</p><p>The usage statement, with the per-client breakdown, is on your <a href="${site}">AI integrations page</a>.</p>`,
    };
  }
  return {
    subject: `${name} is past this month's API allowance`,
    html: `<p>Hi, it's Mary.</p><p>The AI connection <strong>${escapeHtml(name)}</strong> just made its first call past the ${state.allowance} included calls for ${month}. Nothing is cut off.</p><p>${rateLine}</p><p>The usage statement, with the per-client breakdown, is on your <a href="${site}">AI integrations page</a>.</p>`,
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Send the alerts a crossing fired, once each. Never throws. Sends nothing
 * until the pricing is confirmed: an email cannot be recalled, and it would
 * quote an allowance and a rate Mary has not set. pricingConfirmed is
 * injectable so a test can drive both sides; production reads ALLOWANCE.CONFIRMED.
 * @param {{email:string, tokenId:string, tokenName?:string, month:string, alerts:string[], calls:number,
 *          sendEmail:Function, cacheGet:Function, cacheSet:Function, cacheKey:Function, pricingConfirmed?:boolean}} p
 * @returns {Promise<string[]>} the alert kinds actually sent
 */
async function sendAllowanceAlerts(p) {
  const sent = [];
  const confirmed = p.pricingConfirmed == null ? ALLOWANCE.CONFIRMED : p.pricingConfirmed === true;
  if (!confirmed) return sent;
  const kinds = (p.alerts || []).filter((k) => ALERT_KINDS.includes(k));
  if (!kinds.length || !p.email) return sent;
  const state = allowanceState(p.calls);
  for (const kind of kinds) {
    const key = p.cacheKey("agent-alert", p.tokenId, p.month, kind);
    try {
      if (await p.cacheGet(key)) continue; // already sent this month
      const copy = alertCopy(kind, { tokenName: p.tokenName, state, month: p.month });
      // Resend tags are { name, value } objects (letters, digits, _ and - only); a bare string is rejected and the alert would never send.
      const res = await p.sendEmail({ to: p.email, subject: copy.subject, html: copy.html, tags: [{ name: "stream", value: "agent-allowance" }, { name: "alert", value: kind }] });
      if (!res || res.success === false) {
        console.warn(`agent-usage: ${kind} email to member not accepted${res && res.error ? `: ${res.error}` : ""}`);
        continue;
      }
      await p.cacheSet(key, { sent_at: new Date().toISOString() }, MARKER_TTL_MS);
      sent.push(kind);
    } catch (e) {
      console.error(`agent-usage: ${kind} alert failed:`, e.message);
    }
  }
  return sent;
}

module.exports = {
  UNATTRIBUTED,
  ALERT_KINDS,
  isBillableStatus,
  monthKey,
  monthWindow,
  allowanceState,
  alertsCrossed,
  summarizeRows,
  statement,
  sendAllowanceAlerts,
  alertCopy,
  isMissingColumn,
};
