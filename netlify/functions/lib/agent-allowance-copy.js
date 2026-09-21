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

/** One feature row for the pricing card. */
function pricingFeature(a) {
  if (!ready(a)) return "";
  return `<div class="plan-feature"><span class="check">&#10003;</span> ${fmtCalls(a.CALLS_PER_MONTH)} calls a month included per agent. Past that it keeps working at ${fmtRate(a.OVERAGE_USD_PER_CALL)} a call, and I email you before you get there.</div>`;
}

/** The full explanation, for the access guide. */
function guideSection(a) {
  if (!ready(a)) return "";
  const starts = monthName(a.BILLING_STARTS_MONTH);
  return [
    `<h2 id="allowance">Calls, the monthly allowance and what happens past it</h2>`,
    `<p>Each connection includes ${fmtCalls(a.CALLS_PER_MONTH)} calls a month. Only calls that return data count. An error, a refused call or a rate limit never uses up your allowance and is never billed.</p>`,
    `<p>Past the allowance nothing is cut off. Each extra call is ${fmtRate(a.OVERAGE_USD_PER_CALL)}, added to your Agent Access subscription's next invoice. I email you when a connection reaches 80 percent of its month, and again on the first extra call, so a busy assistant does not surprise you.${starts ? ` Billing for extra calls starts with ${starts} usage; nothing before that is charged.` : ""}</p>`,
    `<p>The Usage button on each connection shows the month so far: calls that counted, errors that did not, and the split by client if your assistant sends a client ref. What you see there is exactly what is billed.</p>`,
  ].join("\n      ");
}

/** One line under the connections list on the member page. */
function panelNote(a) {
  if (!ready(a)) return "";
  return `<p class="ai-allowance-note" style="margin-top:12px;font-size:13px;color:var(--mmt-text-secondary);">Each connection includes ${fmtCalls(a.CALLS_PER_MONTH)} calls a month. Only calls that return data count. Past that it keeps working at ${fmtRate(a.OVERAGE_USD_PER_CALL)} a call, and I email you at 80 percent. <a href="/agent-access-guide#allowance">How the allowance works</a></p>`;
}

module.exports = { pricingFeature, guideSection, panelNote, fmtCalls, fmtRate, monthName };
