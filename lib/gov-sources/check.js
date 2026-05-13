// ============================================================
// lib/gov-sources/check.js — shared status logic for `gov:check`
//
// Used by:
//   - scripts/gov-check.js  (local CLI; prints a table)
//   - netlify/functions/gov-source-check.js  (in-prod JSON)
//
// Status rules:
//   configured          — env vars present (where required) AND a
//                         backend fetcher exists in the repo.
//                         (When `probe=true`, this also requires a
//                         live 2xx response from the public endpoint.)
//   missing_credentials — fetcher exists but the env var(s) it
//                         needs are unset.
//   endpoint_unavailable— probe failed; or registry entry marked
//                         expected_status="endpoint_unavailable".
//   not_implemented     — no backend fetcher in the repo yet, or
//                         registry entry marked
//                         expected_status="not_implemented".
//
// Safety: probes are read-only and limited to 1 result per query.
// No paginated pulls. No data writes. Safe to run hourly if needed.
// ============================================================

const { SOURCES } = require("./registry");

const TIMEOUT_MS = 8000;

function hasEnv(vars) {
  if (!vars || vars.length === 0) return true;
  return vars.every((v) => !!process.env[v]);
}

// In a serverless function bundle, each lambda only contains the
// files that esbuild traced from its own require chain. We can't
// reliably do `fs.existsSync(path.join(repoRoot, source.function_lib))`
// from inside a lambda to confirm OTHER lambdas' fetchers exist on
// disk. Trust the registry: if `function_lib` is set, the fetcher
// exists in-repo. Keep the registry honest in PR review instead.
function fetcherExists(source) {
  return !!source.function_lib;
}

async function probeUrl(url, headers = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

function buildProbeUrl(source) {
  if (!source.probe || !source.probe.path) {
    return source.base_url;
  }
  // For SAM endpoints, the api_key is a query parameter, so we need
  // to attach it before/after the existing query string.
  const sep = source.probe.path.includes("?") ? "&" : (source.probe.path.startsWith("?") ? "" : "?");
  const urlWithPath = source.base_url + source.probe.path;
  if ((source.auth_env || []).includes("SAM_GOV_API_KEY") && process.env.SAM_GOV_API_KEY) {
    const join = urlWithPath.includes("?") ? "&" : "?";
    return urlWithPath + join + "api_key=" + process.env.SAM_GOV_API_KEY;
  }
  if (source.id === "regulations_gov") {
    const key = process.env.REGULATIONS_GOV_API_KEY || "DEMO_KEY";
    const join = urlWithPath.includes("?") ? "&" : "?";
    return urlWithPath + join + "api_key=" + key;
  }
  if (source.id === "govinfo" && process.env.CONGRESS_API_KEY) {
    const join = urlWithPath.includes("?") ? "&" : "?";
    return urlWithPath + join + "api_key=" + process.env.CONGRESS_API_KEY;
  }
  return urlWithPath;
}

async function checkSource(source, { probe = false } = {}) {
  const fetcher_exists = fetcherExists(source);

  // Explicit expected_status from registry wins
  if (source.expected_status === "not_implemented") {
    return { id: source.id, tier: source.tier, label: source.label, status: "not_implemented", fetcher_exists, note: source.notes || null };
  }
  if (source.expected_status === "endpoint_unavailable") {
    return { id: source.id, tier: source.tier, label: source.label, status: "endpoint_unavailable", fetcher_exists, note: source.notes || null };
  }

  if (!fetcher_exists) {
    return { id: source.id, tier: source.tier, label: source.label, status: "not_implemented", fetcher_exists };
  }

  const required = source.probe?.required_keys || source.auth_env || [];
  if (!hasEnv(required)) {
    return {
      id: source.id, tier: source.tier, label: source.label,
      status: "missing_credentials",
      fetcher_exists,
      missing: required.filter((v) => !process.env[v]),
    };
  }

  if (!probe) {
    return { id: source.id, tier: source.tier, label: source.label, status: "configured", fetcher_exists };
  }

  const url = buildProbeUrl(source);
  if (!url) {
    return { id: source.id, tier: source.tier, label: source.label, status: "configured", fetcher_exists, note: "no probe path defined" };
  }
  // Header-style auth: NVD optional apiKey
  const headers = {};
  if (source.id === "nvd_cve" && process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;
  if (source.id === "acquisition_gateway") headers["x-api-key"] = process.env.GSA_API_KEY || "DEMO_KEY";
  if (source.id === "sec_edgar") headers["User-Agent"] = "MissionMeetsTech/1.0 (gov-data audit)";

  const r = await probeUrl(url, headers);
  if (r.ok) {
    return { id: source.id, tier: source.tier, label: source.label, status: "configured", fetcher_exists, probe: r };
  }
  return { id: source.id, tier: source.tier, label: source.label, status: "endpoint_unavailable", fetcher_exists, probe: r };
}

async function checkAll({ probe = false, tier = null } = {}) {
  const targets = tier == null ? SOURCES : SOURCES.filter((s) => s.tier === tier);
  const results = [];
  for (const src of targets) {
    results.push(await checkSource(src, { probe }));
  }
  return results;
}

function summarize(results) {
  const summary = { configured: 0, missing_credentials: 0, endpoint_unavailable: 0, not_implemented: 0 };
  for (const r of results) {
    if (summary[r.status] != null) summary[r.status] += 1;
  }
  return summary;
}

module.exports = { checkSource, checkAll, summarize };
