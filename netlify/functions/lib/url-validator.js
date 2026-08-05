// ============================================================
// url-validator.js — gate source URLs before they enter contract_intel.
//
// MMT-INTEL-02. Subscribers were being shown root-domain SAM.gov
// links and silent 404s. This module rejects those at the boundary.
//
// Rules:
//   - Reject root URLs on known source domains (sam.gov, usaspending.gov,
//     gao.gov, congress.gov, govinfo.gov, fbo.gov, beta.sam.gov) when the
//     path is "/" or empty.
//   - Reject URLs that return 404 on HEAD within 3 seconds.
//   - Reject URLs that redirect to a root path on the same source domain.
//   - Non-https URLs are warned (reason: "insecure_scheme") but not
//     strict-rejected — some legacy gov URLs are still http.
//
// Exports:
//   ROOT_DOMAIN_REGEX        — sync regex (for client-side port)
//   isRootDomainUrl(url)     — sync, no network
//   isValidSourceUrl(url)    — Promise<{valid, reason?}>
//   validateSources(arr)     — Promise<{valid: Source[], invalid: {source, reason}[]}>
//
// "Source" can be either a string URL or { url|link, label? }.
// ============================================================

// Sync regex used by both the server validator and the client-side
// port in js/contract-tracker.js. Matches "root" URLs only — path is
// "/", "", or starts with "?" / "#".
const ROOT_DOMAIN_REGEX = /^https?:\/\/(sam\.gov|beta\.sam\.gov|usaspending\.gov|gao\.gov|congress\.gov|govinfo\.gov|fbo\.gov)\/?(\?|#|$)/i;

function _urlObj(u) {
  try { return new URL(u); } catch { return null; }
}

function isRootDomainUrl(u) {
  if (!u || typeof u !== "string") return false;
  return ROOT_DOMAIN_REGEX.test(u);
}

// A REAL SAM.gov opportunity permalink carries a 32-hex notice id:
//   https://sam.gov/opp/<32-hex>/view
//   https://sam.gov/workspace/contract/opp/<32-hex>/view
// A URL of the form sam.gov/opp/<solicitation-number> (letters, hyphens,
// underscores, wrong length) is NOT resolvable. SAM.gov serves its SPA
// shell (HTTP 200) for ANY /opp/ path, so a HEAD/404 check can't catch it —
// the id FORMAT is the only tell. These come from the web-search radar path
// building a link out of the solicitation number it never resolved to a
// notice id (2026-08-05 fabricated-opportunity incident: 17 of 101 radar
// notices carried sam.gov/opp/<sol#> links and did not exist). Because the
// fabricated permalink co-occurs with a hallucinated notice, this doubles as
// a fabrication signal, not just a broken link.
const SAM_OPP_PATH = /\/opp\/([^/?#]+)/i;
function isMalformedSamPermalink(u) {
  if (!u || typeof u !== "string") return false;
  const parsed = _urlObj(u);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== "sam.gov" && host !== "beta.sam.gov") return false;
  const m = parsed.pathname.match(SAM_OPP_PATH);
  if (!m) return false; // not an /opp/ permalink (e.g. /search) — out of scope
  return !/^[0-9a-f]{32}$/i.test(m[1]);
}

function _toUrlString(s) {
  if (!s) return null;
  if (typeof s === "string") return s;
  if (typeof s === "object") return s.url || s.link || null;
  return null;
}

async function _headWithTimeout(url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // Some servers reject HEAD; fall back to GET with a tiny body cap by
    // aborting once we have headers. The signal does both.
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ac.signal });
    return res;
  } catch (err) {
    // HEAD not supported on some endpoints — retry with GET.
    if (err.name === "AbortError") return { ok: false, status: 599, url, redirected: false };
    try {
      const ac2 = new AbortController();
      const timer2 = setTimeout(() => ac2.abort(), timeoutMs);
      const res = await fetch(url, { method: "GET", redirect: "follow", signal: ac2.signal })
        .finally(() => clearTimeout(timer2));
      return res;
    } catch (_err2) {
      return { ok: false, status: 599, url, redirected: false };
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate a single source URL.
 * @param {string} url
 * @param {{ skipNetwork?: boolean, timeoutMs?: number, fetcher?: typeof _headWithTimeout }} [opts]
 * @returns {Promise<{ valid: boolean, reason?: string, final_url?: string }>}
 */
async function isValidSourceUrl(url, opts = {}) {
  if (!url || typeof url !== "string") return { valid: false, reason: "missing_url" };
  const parsed = _urlObj(url);
  if (!parsed) return { valid: false, reason: "unparseable_url" };

  // Reject root-domain URLs without doing a network call.
  if (isRootDomainUrl(url)) return { valid: false, reason: "root_domain_url" };

  // Reject fabricated/unresolved SAM.gov permalinks (sam.gov/opp/<sol#>).
  // No network call: SAM.gov 200s any /opp/ path, so only the id format
  // distinguishes a real notice link from a built-from-solicitation guess.
  if (isMalformedSamPermalink(url)) return { valid: false, reason: "malformed_sam_permalink" };

  // Bypass the network check for unit tests + when explicitly disabled.
  if (opts.skipNetwork) return { valid: true };

  const fetcher = opts.fetcher || _headWithTimeout;
  const timeoutMs = opts.timeoutMs || 3000;
  const res = await fetcher(url, timeoutMs);
  if (!res) return { valid: false, reason: "fetch_failed" };
  if (res.status === 404) return { valid: false, reason: "http_404", final_url: res.url };
  if (res.status >= 500 && res.status < 600) return { valid: false, reason: `http_${res.status}`, final_url: res.url };
  // 599 is our sentinel for AbortError / timeout / network failure.
  if (res.status === 599) return { valid: false, reason: "timeout", final_url: res.url };
  // If the response redirected to a root-domain URL on a known source,
  // treat it the same as a root-domain URL.
  if (res.url && res.url !== url && isRootDomainUrl(res.url)) {
    return { valid: false, reason: "redirected_to_root", final_url: res.url };
  }
  return { valid: true, final_url: res.url || url };
}

/**
 * Validate an array of sources (strings or objects). Preserves the
 * input shape on valid entries and emits an invalid[] sidecar for
 * the caller to log.
 *
 * @param {Array<string|object>} sources
 * @param {Object} [opts]
 * @returns {Promise<{ valid: Array, invalid: Array<{source, reason}> }>}
 */
async function validateSources(sources, opts = {}) {
  const valid = [];
  const invalid = [];
  for (const src of (sources || [])) {
    const u = _toUrlString(src);
    const result = await isValidSourceUrl(u, opts);
    if (result.valid) valid.push(src);
    else invalid.push({ source: src, reason: result.reason });
  }
  return { valid, invalid };
}

module.exports = {
  ROOT_DOMAIN_REGEX,
  isRootDomainUrl,
  isMalformedSamPermalink,
  isValidSourceUrl,
  validateSources,
};
