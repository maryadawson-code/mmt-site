// ============================================================
// onc-chpl-api.js — ONC Certified Health IT Product List (CHPL)
//
// Every health IT product claiming ONC certification is listed
// here with its certified edition, criteria, status, and
// developer. For ProposalPulse this closes a federal-health-IT-
// specific red-team check: verify vendor claims like "our EHR is
// 2015 Edition Cures Update certified" against CHPL.
//
// Auth: an API key registered (free) at chpl.healthit.gov. Probed live
// 2026-09-14: the documented "ANONYMOUS" key answers HTTP 401 and no key
// answers 400, so until CHPL_API_KEY is set every search returns
// { products: [], error: "CHPL API 401 ..." } and the catalog lists the
// system as conditional. The error is reported, never thrown.
// Docs: https://chpl.healthit.gov/#/resources/chpl_api
// Base: https://chpl.healthit.gov/rest
// ============================================================

const API_BASE = "https://chpl.healthit.gov/rest";
const ANONYMOUS_KEY = "ANONYMOUS";

function apiKey() {
  const k = process.env.CHPL_API_KEY;
  return k && String(k).trim() ? String(k).trim() : ANONYMOUS_KEY;
}

/**
 * Search certified products by keyword (developer name, product name).
 * Resolves with { products: [], total, error } on any failure; never throws.
 */
async function searchCertifiedProducts({ keyword, developer, limit = 10 }) {
  const params = new URLSearchParams({
    pageNumber: "0",
    pageSize: String(limit),
  });
  if (keyword) params.set("searchTerm", keyword);
  if (developer) params.set("developer", developer);

  try {
    const res = await fetch(`${API_BASE}/search/v3?${params}`, {
      headers: { Accept: "application/json", "API-KEY": apiKey() },
    });
    if (!res.ok) {
      const reason = res.status === 401 && apiKey() === ANONYMOUS_KEY
        ? "CHPL API 401 (anonymous key rejected; register a free key at chpl.healthit.gov and set CHPL_API_KEY)"
        : `CHPL API ${res.status}`;
      return { products: [], total: 0, error: reason };
    }
    const data = await res.json();
    const results = data.results || data.products || [];
    return {
      products: results.slice(0, limit).map((p) => ({
        chpl_id: p.chplProductNumber || p.id || "",
        product_name: p.product?.name || p.productName || "",
        version: p.version || p.productVersion || "",
        developer: p.developer?.name || p.developerName || "",
        edition: p.edition?.name || p.certificationEdition?.name || "",
        status: p.certificationStatus?.name || p.status || "",
        status_date: p.currentCertificationStatus?.eventDate || "",
        criteria_count: (p.criteriaMet || []).length || p.criteriaMetCount || 0,
        url: `https://chpl.healthit.gov/#/listing/${p.id || p.chplProductNumber}`,
      })),
      total: data.recordCount || results.length,
    };
  } catch (err) {
    return { products: [], total: 0, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Verify a specific vendor certification claim.
 * Returns { verified, reason, products } so ProposalPulse can surface
 * "CHPL confirms" or "CHPL does NOT confirm".
 */
async function verifyCertificationClaim({ vendorName, productName, edition }) {
  const { products, error } = await searchCertifiedProducts({
    keyword: productName || vendorName,
    developer: vendorName,
    limit: 10,
  });
  if (error) return { verified: false, reason: `lookup failed: ${error}`, products: [] };
  if (products.length === 0) {
    return { verified: false, reason: "no certified product found under that vendor/product name", products: [] };
  }
  const editionRegex = edition ? new RegExp(edition.replace(/[^a-z0-9]/gi, ".?"), "i") : null;
  const matching = products.filter((p) => {
    const edOK = !editionRegex || editionRegex.test(p.edition || "");
    const nameOK = !productName || (p.product_name || "").toLowerCase().includes(productName.toLowerCase());
    return edOK && nameOK;
  });
  if (matching.length === 0) {
    return {
      verified: false,
      reason: `vendor has ONC-certified products but none match edition "${edition || "any"}" + product "${productName || "any"}"`,
      products,
    };
  }
  const active = matching.filter((p) => (p.status || "").toLowerCase().startsWith("active"));
  if (active.length === 0) {
    return {
      verified: false,
      reason: `matched CHPL products exist but none are currently Active (status: ${matching.map((m) => m.status).join(", ")})`,
      products: matching,
    };
  }
  return {
    verified: true,
    reason: `CHPL confirms ${active.length} active certified product(s) match`,
    products: active,
  };
}

/**
 * The products array of a search or verification result, whatever shape
 * it arrived in. 2026-09-14: enrichWithCHPL used to nest the whole search
 * result under `products` ({ products: { products: [...] } }) and the
 * formatter called .slice on that object, so any Ask MMT question naming
 * Epic, Oracle, Cerner, ONC, CHPL or "certified" crashed the enrichment.
 * Both readers now go through this and never throw.
 */
function productList(result) {
  if (!result || typeof result !== "object") return [];
  const p = result.products;
  if (Array.isArray(p)) return p;
  if (p && typeof p === "object" && Array.isArray(p.products)) return p.products;
  return [];
}

/**
 * Prompt block. Returns "" unless `products` is a non-empty array, with
 * one exception: a ProposalPulse verification claim (`verified` is a
 * boolean) keeps its verdict even with zero matches, because "CHPL does
 * NOT confirm" is the finding the red-team check exists to surface.
 */
function formatCHPLContext(result) {
  const products = productList(result);
  const isClaim = !!result && typeof result.verified === "boolean";
  if (!products.length && !isClaim) return "";
  const rows = products.slice(0, 5).map((p) =>
    `- ${p.chpl_id}: ${p.developer} / ${p.product_name} v${p.version} | ${p.edition} | ${p.status} (${p.status_date}) | ${p.url}`
  ).join("\n");
  if (isClaim) {
    const status = result.verified ? "VERIFIED" : "NOT VERIFIED";
    return `\n\nONC CHPL CERTIFICATION CHECK: ${status}\nReason: ${result.reason}${rows ? "\nMatched listings:\n" + rows : ""}`;
  }
  const total = Number(result.total) > products.length ? ` of ${Number(result.total)}` : "";
  return `\n\nONC CHPL CERTIFIED PRODUCT LISTINGS (${products.length}${total}):\n${rows}`;
}

// Sprint 5 2026-05-15: Ask MMT enrichment wrapper. Topic-gated to vendor /
// certified-EHR questions so we don't fan out CHPL queries on every Ask
// MMT call. Returns { products: <flat array>, total, error?, reason } with
// the error at the top level so collectUnavailable can name the system
// ("ONC CHPL: CHPL API 401 ..."). Never throws.
async function enrichWithCHPL({ topic } = {}) {
  try {
    if (!/\b(Oracle|Cerner|Epic|Allscripts|Meditech|Athenahealth|certified|CHPL|ONC|2015\s+edition|Cures)\b/i.test(String(topic || ""))) {
      return { skipped: true };
    }
    const res = await searchCertifiedProducts({ keyword: topic, limit: 8 });
    const products = productList(res);
    const out = {
      products,
      total: Number(res && res.total) || products.length,
      reason: `Ask MMT vendor lookup for: ${topic}`,
    };
    // A stub or an older build may still hand back the nested shape; the
    // error lives wherever it was put, and comes out at the top.
    const nestedErr = res && res.products && !Array.isArray(res.products) ? res.products.error : null;
    const err = (res && res.error) || nestedErr;
    if (err) out.error = String(err);
    return out;
  } catch (err) {
    return { products: [], total: 0, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  searchCertifiedProducts,
  verifyCertificationClaim,
  formatCHPLContext,
  enrichWithCHPL,
  productList,
};
