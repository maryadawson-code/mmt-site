// SECURITY HEADER OWNERSHIP (Sprint B 2026-05-13)
// ------------------------------------------------
// This edge function is the SINGLE SOURCE OF TRUTH for:
//   • Content-Security-Policy
//   • Permissions-Policy
//   • Strict-Transport-Security
//
// _headers owns: X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy, and all caching rules.
//
// Why the split: this edge function applies to EVERY route (path:"/*"),
// including dynamic Netlify Function routes where _headers does not
// apply. Previously CSP + Permissions-Policy were duplicated across
// _headers with subtle differences (jsdelivr only in _headers but
// unused anywhere in the codebase; *.stripe.com wildcard in _headers
// vs explicit subdomains here). Netlify's pipeline applies _headers
// first then the edge function can override, so this version always
// won for CSP — but the divergence was a regression risk.
//
// CSP domain rationale:
//   script-src
//     plausible.io      — analytics script (live on every page)
//     cdnjs.cloudflare  — support widget + some demo embeds
//     (jsdelivr removed 2026-05-13 — unused after repo-wide grep)
//   connect-src
//     plausible.io      — analytics POST
//     api.stripe.com    — Stripe.js fetch path (checkout)
//     checkout.stripe.com — customer checkout XHR
//     (was *.stripe.com — narrowed; billing/buy/dashboard.stripe.com
//      are link targets only, not connect-src consumers)
//   frame-src
//     checkout.stripe.com — payment iframe
//     open.spotify.com    — podcast episode embeds
//   media-src
//     api.riverside.fm + hosting-media.rs-prod.riverside.fm
//       — podcast audio enclosure URLs
//   form-action
//     buttondown.com      — newsletter signup
//     checkout.stripe.com — Stripe payment links
export default async (request, context) => {
  const response = await context.next();
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-src 'self' https://checkout.stripe.com https://open.spotify.com; media-src 'self' https://api.riverside.fm https://hosting-media.rs-prod.riverside.fm; connect-src 'self' https://plausible.io https://checkout.stripe.com https://api.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self' https://buttondown.com https://checkout.stripe.com"
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  return response;
};

export const config = { path: "/*" };
