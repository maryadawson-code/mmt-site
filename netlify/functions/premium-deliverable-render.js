// ============================================================
// premium-deliverable-render.js — dynamic premium portal renderer
//
// Handles:
//   /premium/capture-corner/:slug
//   /premium/capture-sheet/:slug
//   /premium/pattern-map/:slug
//   /premium/cycle-tracker/:slug
//   /premium/execution-watch/:slug
//
// Flow:
//   1. Extract slug path from request
//   2. Look up premium_deliverables row
//   3. If not found or publish_at > now(), return 404
//   4. Render markdown → HTML through portal template with Premium gating
//   5. Append cross-link block for capture-corner releases
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { marked } = require("marked");
const { loadEntitlement, blockMessageFor, logEntitlementMismatch } = require("./lib/entitlement");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function upgradeShell({ slug, reason, message }) {
  // Server-rendered upgrade page for unauthenticated / non-entitled
  // requests. Replaces the previous behavior of returning the full
  // body_markdown to anyone who hit the URL. NO premium body content
  // is included in this response by design.
  const safeSlug = String(slug || "").replace(/[<>"]/g, "");
  return {
    statusCode: reason === "NOT_SIGNED_IN" ? 401 : 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // No public caching of the upgrade shell — different visitors
      // need different responses based on their auth state.
      "Cache-Control": "private, no-store, max-age=0",
    },
    body: `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MMT Premium · Sign in or subscribe</title>
<meta name="robots" content="noindex, nofollow">
<style>body{font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#0A192F;max-width:560px;margin:0 auto;padding:48px 24px;line-height:1.6;background:#FFFFFF;text-align:center;}
.tag{display:inline-block;background:#FEF9E7;color:#92710A;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:14px;}
h1{font-size:24px;margin:0 0 12px;}p{color:#5C6B7A;margin:0 0 22px;}
a.btn{display:inline-block;padding:12px 24px;background:#0A192F;color:#FFFFFF;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;margin:0 6px;}
a.btn.secondary{background:#FFFFFF;color:#0A192F;border:1px solid #D8E0E8;}</style></head><body>
<span class="tag">★ MMT Premium</span>
<h1>This is a Premium deliverable.</h1>
<p>${message || "Sign in or subscribe to read this issue. Premium content is delivered only to verified subscribers."}</p>
<a class="btn" href="/pricing.html">Start Premium</a>
<a class="btn secondary" href="/dashboard.html?redirect=${encodeURIComponent("/premium/" + safeSlug)}">Sign in</a>
</body></html>`,
  };
}

const CAPTURE_CORNER_CROSS_LINKS = [
  { slug: "/premium/capture-corner/biosurveillance-reframing-playbook/", title: "Biosurveillance Reframing Playbook" },
  { slug: "/premium/capture-sheet/recapture-bet-200m/", title: "The $200M Recapture Bet" },
  { slug: "/premium/pattern-map/fy2027-dha-reorganization/", title: "FY2027 DHA Reorganization Pattern Map" },
  { slug: "/premium/cycle-tracker/cdmrp-fy2026/", title: "CDMRP FY2026 Cycle Tracker" },
  { slug: "/premium/execution-watch/fy2027-fuse/", title: "Execution Watch: FY2027 Fuse That Lights FY2028" },
];

function render404() {
  return {
    statusCode: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
    body: "<!DOCTYPE html><html><body><h1>Not Found</h1></body></html>",
  };
}

function buildCrossLinkBlock(currentSlug) {
  const others = CAPTURE_CORNER_CROSS_LINKS.filter((l) => !l.slug.includes(currentSlug));
  if (!others.length) return "";
  return `\n\n---\n\n## Related Premium Intelligence\n\nPart of the MMT FY2027 J-Book capture package:\n\n${others.map((l) => `- [${l.title}](${l.slug})`).join("\n")}\n`;
}

function portalShell({ title, bodyHtml, slug }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — MMT Premium</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="canonical" href="https://missionmeetstech.com${slug}">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; color: #0A192F; max-width: 780px; margin: 0 auto; padding: 32px 20px 80px; line-height: 1.6; background: #FFFFFF; }
    .premium-tag { display: inline-block; background: #F3F4F6; color: #457B9D; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 12px; }
    h1 { font-size: 28px; line-height: 1.25; margin: 8px 0 24px; color: #0A192F; }
    h2 { font-size: 22px; margin: 36px 0 12px; color: #0A192F; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; }
    h3 { font-size: 18px; margin: 24px 0 10px; color: #0A192F; }
    h4 { font-size: 16px; margin: 20px 0 8px; color: #457B9D; }
    p, li { font-size: 16px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; }
    th, td { border: 1px solid #E5E7EB; padding: 8px; text-align: left; }
    th { background: #F3F4F6; }
    a { color: #457B9D; }
    code { background: #F3F4F6; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
    hr { border: none; border-top: 1px solid #E5E7EB; margin: 32px 0; }
    .portal-nav { border-bottom: 1px solid #E5E7EB; padding-bottom: 14px; margin-bottom: 20px; font-size: 14px; }
    .portal-nav a { color: #457B9D; text-decoration: none; margin-right: 16px; }
    .footer { color: #6B7280; font-size: 13px; margin-top: 48px; border-top: 1px solid #E5E7EB; padding-top: 16px; }
  </style>
</head>
<body>
  <nav class="portal-nav"><a href="/premium/dashboard/">← Premium dashboard</a><a href="/premium/briefings/">Friday Briefs</a><a href="/premium/monthly-briefs/">Monthly Briefs</a></nav>
  <span class="premium-tag">MMT Premium</span>
  ${bodyHtml}
  <div class="footer">MMT Premium. Essential intelligence for federal health IT decision-makers. Mary Womack, Mission Meets Tech.</div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

exports.handler = async (event) => {
  const qsPath = (event.queryStringParameters || {})._path;
  const rawPath = qsPath || event.path || event.rawUrl || "";
  const slug = rawPath.replace(/\/$/, "");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return render404();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // P0 entitlement gate (Sprint A 2026-05-13).
  // Previously this endpoint returned data.body_markdown to anyone who
  // hit the URL, with Cache-Control: public, max-age=60. That meant
  // every premium deliverable was effectively public. Now: require
  // mmt_email cookie, run loadEntitlement against Supabase, return
  // upgrade shell on anonymous / non-entitled.
  const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie);
  const email = (cookies.mmt_email || "").trim();
  if (!email) {
    return upgradeShell({ slug, reason: "NOT_SIGNED_IN", message: "Sign in or subscribe to read this issue." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return upgradeShell({ slug, reason: "NOT_SIGNED_IN", message: "Sign in or subscribe to read this issue." });
  }
  const entitlement = await loadEntitlement(supabase, email);
  if (!entitlement.ok) {
    const block = blockMessageFor(entitlement);
    try { await logEntitlementMismatch(supabase, { email, tool: "premium_deliverable_render", entitlement, expected: "premium|founding|institutional|admin" }); } catch {}
    return upgradeShell({ slug, reason: block.reason_code, message: block.message });
  }

  const { data, error } = await supabase
    .from("premium_deliverables")
    .select("slug, title, body_markdown, publish_at, published, is_capture_corner_release")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return render404();
  if (!data.published || new Date(data.publish_at).getTime() > Date.now()) return render404();

  let md = data.body_markdown;
  if (data.is_capture_corner_release) {
    md += buildCrossLinkBlock(slug);
  }
  const bodyHtml = marked.parse(md);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Private cache only — different subscribers receive different
      // bodies, and a shared/CDN cache would defeat the entitlement
      // gate above. Previous setting (public, max-age=60) is unsafe.
      "Cache-Control": "private, max-age=60",
    },
    body: portalShell({ title: data.title, bodyHtml, slug }),
  };
};
