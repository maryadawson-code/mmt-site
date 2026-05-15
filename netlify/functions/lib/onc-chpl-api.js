// ============================================================
// onc-chpl-api.js — ONC Certified Health IT Product List (CHPL)
//
// Every health IT product claiming ONC certification is listed
// here with its certified edition, criteria, status, and
// developer. For ProposalPulse this closes a federal-health-IT-
// specific red-team check: verify vendor claims like "our EHR is
// 2015 Edition Cures Update certified" against CHPL.
//
// No auth required.
// Docs: https://chpl.healthit.gov/#/resources/chpl_api
// Base: https://chpl.healthit.gov/rest
// ============================================================

const API_BASE = "https://chpl.healthit.gov/rest";

/**
 * Search certified products by keyword (developer name, product name).
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
      headers: { Accept: "application/json", "API-KEY": "ANONYMOUS" },
    });
    if (!res.ok) return { products: [], error: `CHPL API ${res.status}` };
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
    return { products: [], error: err.message };
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

function formatCHPLContext(result) {
  if (!result || !result.products) return "";
  const status = result.verified ? "✅ VERIFIED" : "⚠️ NOT VERIFIED";
  const rows = result.products.slice(0, 5).map((p) =>
    `- ${p.chpl_id}: ${p.developer} / ${p.product_name} v${p.version} | ${p.edition} | ${p.status} (${p.status_date}) | ${p.url}`
  ).join("\n");
  return `\n\nONC CHPL CERTIFICATION CHECK — ${status}
Reason: ${result.reason}
${rows ? "Matched listings:\n" + rows : ""}`;
}

// Sprint 5 2026-05-15: Ask MMT enrichment wrapper. Topic-gated to vendor /
// certified-EHR questions so we don't fan out CHPL queries on every Ask
// MMT call. formatCHPLContext expects { products, verified, reason } —
// the wrapper omits verified/reason and lets the formatter degrade
// gracefully (it returns "" when verified is undefined).
async function enrichWithCHPL({ topic }) {
  try {
    if (!/\b(Oracle|Cerner|Epic|Allscripts|Meditech|Athenahealth|certified|CHPL|ONC|2015\s+edition|Cures)\b/i.test(topic)) {
      return { skipped: true };
    }
    const products = await searchCertifiedProducts({ keyword: topic, limit: 8 });
    return { products, verified: undefined, reason: `Ask MMT vendor lookup for: ${topic}` };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  searchCertifiedProducts,
  verifyCertificationClaim,
  formatCHPLContext,
  enrichWithCHPL,
};
