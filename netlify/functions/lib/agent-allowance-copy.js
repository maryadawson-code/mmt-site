// ============================================================================
// lib/agent-allowance-copy.js — the words that disclose the Agent Access
// allowance and overage rate. One place, so the pricing page, the guide, the
// member panel and the alert emails say the same thing, and every number comes
// from lib/agent-config (data/agent-pricing.json). build.js injects these at
// the BUILD:AGENT_ALLOWANCE_* markers.
//
// Unconfirmed pricing renders an empty string everywhere: nothing is billed
// then, so nothing is quoted. Mary's voice: first person, plain, no em dashes,
// no exclamation points.
// ============================================================================

const fmtCalls = (n) => Number(n).toLocaleString("en-US");
/** $0.01, $0.005, $0.10, $1.00: at least two decimals, never a trailing run of zeros past that. */
function fmtRate(usd) {
  const [whole, frac = ""] = Number(usd).toFixed(4).replace(/0+$/, "").split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
}

/** "October 2026" for "2026-10". */
function monthName(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  if (!m) return null;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(m[2]) - 1]} ${m[1]}`;
}

const ready = (a) => !!(a && a.CONFIRMED && a.CALLS_PER_MONTH > 0 && a.OVERAGE_USD_PER_CALL > 0);
/** The default overage limit (calls past the allowance), or null when there is none. */
const limitOf = (a) => (a && Number.isInteger(a.MAX_BILLABLE_OVERAGE_CALLS) && a.MAX_BILLABLE_OVERAGE_CALLS > 0 ? a.MAX_BILLABLE_OVERAGE_CALLS : null);
const fmtUsd = (n) => `$${Number(n).toFixed(2)}`;

/** One feature row for the pricing card. */
function pricingFeature(a) {
  if (!ready(a)) return "";
  const limit = limitOf(a);
  const past = limit
    ? `Past that it keeps working at ${fmtRate(a.OVERAGE_USD_PER_CALL)} a call for up to ${fmtCalls(limit)} more, then pauses until next month. I email you before each line.`
    : `Past that it keeps working at ${fmtRate(a.OVERAGE_USD_PER_CALL)} a call, and I email you before you get there.`;
  return `<div class="plan-feature"><span class="check">&#10003;</span> ${fmtCalls(a.CALLS_PER_MONTH)} calls a month included per agent. ${past}</div>`;
}

/** The full explanation, for the access guide. */
function guideSection(a) {
  if (!ready(a)) return "";
  const starts = monthName(a.BILLING_STARTS_MONTH);
  const limit = limitOf(a);
  const rate = fmtRate(a.OVERAGE_USD_PER_CALL);
  const past = limit
    ? `<p>Past the allowance it keeps working at ${rate} a call, added to your Agent Access subscription's next invoice, for up to ${fmtCalls(limit)} more calls (${fmtUsd(limit * a.OVERAGE_USD_PER_CALL)}). Then it pauses until the first of the next month, so a runaway assistant cannot run up a bill you did not see coming. I email you at 80 percent of the allowance, on the first extra call, and if it pauses. Reply to any of those and I will set a different limit for that connection.${starts ? ` Billing for extra calls starts with ${starts} usage; nothing before that is charged.` : ""}</p>`
    : `<p>Past the allowance it keeps working at ${rate} a call, added to your Agent Access subscription's next invoice. I email you at 80 percent of the allowance and again on the first extra call.${starts ? ` Billing for extra calls starts with ${starts} usage; nothing before that is charged.` : ""}</p>`;
  return [
    `<h2 id="allowance">Calls, the monthly allowance and what happens past it</h2>`,
    `<p>Each connection includes ${fmtCalls(a.CALLS_PER_MONTH)} calls a month. Only calls that return data count. An error, a refused call or a rate limit never uses up your allowance and is never billed.</p>`,
    past,
    `<p>Extra calls are billed to the Agent Access add-on, so they need it on your account. A connection without the add-on pauses at the allowance until the next month.</p>`,
    `<p>The Usage button on each connection shows the month so far: calls that counted, errors that did not, where the limit sits, and the split by client if your assistant sends a client ref. What you see there is exactly what is billed.</p>`,
  ].join("\n      ");
}

/** The guide's table-of-contents line; rendered only when the section it points at is. */
function guideTocItem(a) {
  return ready(a) ? `<a href="#allowance">Calls, the monthly allowance and what happens past it</a>` : "";
}

/** One line under the connections list on the member page. */
function panelNote(a) {
  if (!ready(a)) return "";
  const limit = limitOf(a);
  const past = limit
    ? `Past that it keeps working at ${fmtRate(a.OVERAGE_USD_PER_CALL)} a call for up to ${fmtCalls(limit)} more, then pauses until next month.`
    : `Past that it keeps working at ${fmtRate(a.OVERAGE_USD_PER_CALL)} a call.`;
  return `<p class="ai-allowance-note" style="margin-top:12px;font-size:13px;color:var(--mmt-text-secondary);">Each connection includes ${fmtCalls(a.CALLS_PER_MONTH)} calls a month. Only calls that return data count. ${past} I email you at 80 percent. <a href="/agent-access-guide#allowance">How the allowance works</a></p>`;
}

module.exports = { pricingFeature, guideSection, guideTocItem, panelNote, fmtCalls, fmtRate, fmtUsd, monthName, limitOf };
