// ============================================================
// fetchers/sam-psc.js — SAM.gov PSC (Product Service Code) lookup
//
// Source: https://open.gsa.gov/api/PSC-Public-API/
// Auth: SAM_GOV_API_KEY (same key as Opportunities + Entity APIs).
// Public lookup; small responses. Useful for normalizing PSC
// taxonomy on opportunity rows and for surfacing the PSC's full
// name + parent category on premium agency profiles.
// ============================================================

const PSC_URL = "https://api.sam.gov/prod/locationservices/v1/api/publicpsclookup";
const TIMEOUT_MS = 8000;

function requireKey() {
  return process.env.SAM_GOV_API_KEY || null;
}

async function lookupPSC({ code, limit = 10 } = {}) {
  const apiKey = requireKey();
  if (!apiKey) {
    return { matched: false, error: "SAM_GOV_API_KEY missing" };
  }
  const params = new URLSearchParams({ api_key: apiKey });
  if (code) params.set("q", String(code));
  params.set("limit", String(Math.min(Math.max(limit, 1), 50)));

  const url = `${PSC_URL}?${params.toString()}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) {
      return { matched: false, error: `SAM PSC HTTP ${res.status}` };
    }
    const body = await res.json();
    const items = Array.isArray(body?.psc) ? body.psc : Array.isArray(body) ? body : [];
    return {
      matched: items.length > 0,
      results: items.slice(0, limit).map((p) => ({
        psc_code: p.pscCode || p.code,
        psc_name: p.pscName || p.name,
        psc_full_name: p.pscFullName || p.full_name,
        product_or_service: p.productOrService || null,
        includes: p.includes || null,
        excludes: p.excludes || null,
      })),
      source_url: `https://sam.gov/data-services/Product%20Service%20Code/PSC%20Reference?privacy=Public`,
    };
  } catch (err) {
    return { matched: false, error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

async function probe() {
  const apiKey = requireKey();
  if (!apiKey) {
    return { ok: false, status: 0, error: "SAM_GOV_API_KEY missing" };
  }
  const url = `${PSC_URL}?api_key=${apiKey}&limit=1`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { lookupPSC, probe, PSC_URL };
