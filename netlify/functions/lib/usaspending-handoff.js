// ============================================================
// usaspending-handoff.js — finish a slow USASpending query in the background
//
// A late USASpending answer is saved when it lands (federal-data-apis
// usaGuarded), but a sync function ends when the answer is sent, and a cold
// USASpending query measured 20s to 40s+ on 2026-09-15. When the award search
// or the department totals call times out, the question goes to
// usaspending-prewarm-background (15 minute limit), which runs the same query
// under a long bound and saves it, so the subscriber's "ask again" is
// answered from the saved copy.
//
// Only a timeout hands off: an HTTP error is not slowness, and retrying it
// in the background would multiply a failure. Never throws, never waits
// more than HANDOFF_BOUND_MS.
// ============================================================

const HANDOFF_BOUND_MS = 1500;

const timedOut = (r) => !!(r && (r.error === "timeout" || (r.stale && r.live_error === "timeout")));

// The department totals call too (2026-09-15): it gets 3s against a measured
// 0.5s to 18s, and the worker's warm of the question finishes it under the
// long bound; the awards it re-reads are already saved. Not when the award
// search failed with an HTTP error: the worker would retry that failure, and
// the subscriber would be told "still running" beside it.
function needsHandoff(federalData) {
  if (!federalData) return false;
  if (federalData.error === "timeout-8s") return true;
  const ua = federalData.usaspending_awards;
  return timedOut(ua) || (timedOut(federalData.agency_spending) && !(ua && ua.error));
}

// Only a deployed function hands off. `netlify dev:exec` also sets URL to
// the production site, and the Ask MMT eval and local scripts must never
// start production background work (the eval refuses and counts it).
function deployedSiteUrl(env = process.env) {
  return env.AWS_LAMBDA_FUNCTION_NAME && env.URL ? env.URL : "";
}

async function handOffSlowUSASpending(question, federalData, { fetchImpl = globalThis.fetch, siteUrl = deployedSiteUrl() } = {}) {
  if (!needsHandoff(federalData) || !siteUrl || typeof fetchImpl !== "function") return false;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HANDOFF_BOUND_MS);
  try {
    const res = await fetchImpl(`${siteUrl}/.netlify/functions/usaspending-prewarm-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: [String(question || "").slice(0, 500)] }),
      signal: ac.signal,
    });
    // A background function accepts with 202; anything else did not start.
    return res.status === 202;
  } catch (e) {
    console.warn("usaspending handoff failed:", e && e.message ? e.message : String(e));
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { handOffSlowUSASpending, needsHandoff, deployedSiteUrl, HANDOFF_BOUND_MS };
