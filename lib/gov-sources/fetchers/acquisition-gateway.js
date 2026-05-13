// ============================================================
// fetchers/acquisition-gateway.js — GSA Acquisition Gateway probe
//
// IMPORTANT: This is a probe-only module, not a data fetcher.
//
// The GSA Open page for Acquisition Gateway is internally
// contradictory: the page simultaneously says "no APIs are
// available" AND describes a v4.0 API at
// api.gsa.gov/acquisitiongateway/api/v4.0 with x-api-key auth
// and /documents examples (https://open.gsa.gov/api/ag-api/).
// A documented DEMO_KEY documents endpoint returned 404 in prior
// testing per docs/government-api-integration-audit.md.
//
// Until GSA confirms the current public endpoint, this module
// EXPECTS a 404 or similar and reports the source as
// "endpoint_unavailable" via the gov-source-check command.
// Re-validate quarterly; remove this caveat once a confirmed
// endpoint resolves.
// ============================================================

const AG_URL = "https://api.gsa.gov/acquisitiongateway/api/v4.0";
const TIMEOUT_MS = 8000;

async function probeEndpoint() {
  const apiKey = process.env.GSA_API_KEY || "DEMO_KEY";
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${AG_URL}/documents`, {
      headers: { "x-api-key": apiKey },
      signal: ac.signal,
    });
    return {
      ok: res.ok,
      status: res.status,
      api_key_used: apiKey === "DEMO_KEY" ? "DEMO_KEY" : "configured",
      expected_status: "endpoint_unavailable",
      note: res.ok
        ? "Acquisition Gateway documents endpoint responded. Update registry status to configured and add a real fetcher."
        : "Acquisition Gateway documents endpoint did not respond. Status remains endpoint_unavailable.",
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      expected_status: "endpoint_unavailable",
    };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { probeEndpoint, AG_URL };
