#!/usr/bin/env node
// validate-routes.js
//
// Reads docs/member-features.json (the canonical registry) and fails
// the build if any marketed clean URL has no resolution path. A "clean
// URL resolves" when ONE of:
//   - dist/<route>.html exists
//   - dist/<route>/index.html exists
//   - netlify.toml has a [[redirects]] entry mapping `from = "<route>"`
//
// This is the regression guard against the 2026-04-27 incident — every
// marketed URL (`/pursuit-score`, `/askmtt`, `/pursuit-calendar`, etc.)
// must resolve to something other than 404 before deploy.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const REG_PATH = path.join(ROOT, "docs/member-features.json");
const TOML_PATH = path.join(ROOT, "netlify.toml");

if (!fs.existsSync(DIST)) {
  console.error("validate-routes: dist/ missing — run node build.js first");
  process.exit(1);
}
if (!fs.existsSync(REG_PATH)) {
  console.error("validate-routes: docs/member-features.json missing");
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(REG_PATH, "utf8"));
const tomlText = fs.existsSync(TOML_PATH) ? fs.readFileSync(TOML_PATH, "utf8") : "";

// Extract every `from = "..."` value from netlify.toml [[redirects]] blocks.
// Lightweight parse — no full TOML parser needed for this pattern.
const redirectFroms = new Set();
const fromRegex = /from\s*=\s*"([^"]+)"/g;
let m;
// Sprint B 2026-05-13: also detect DUPLICATE `from = "..."` redirect
// rules. Netlify applies first-match-wins, so a duplicate from-line
// means the second rule is silently dead — root cause of the
// /compliance-check routing collision that surfaced in the Sprint B
// audit. Fail the build on any duplicate so this kind of drift
// can't ship again.
const seenFromCounts = new Map();
const tomlRedirectRe = /from\s*=\s*"([^"]+)"/g;
while ((m = tomlRedirectRe.exec(tomlText)) !== null) {
  seenFromCounts.set(m[1], (seenFromCounts.get(m[1]) || 0) + 1);
}
const duplicateFroms = Array.from(seenFromCounts.entries()).filter(([, n]) => n > 1);
if (duplicateFroms.length) {
  console.error("\nvalidate-routes: FAIL — duplicate `from = \"...\"` redirect rule(s) in netlify.toml:");
  for (const [from, n] of duplicateFroms) console.error(`  - from = "${from}" appears ${n} times (Netlify first-match-wins; later rules are silently dead)`);
  console.error("\nResolution: remove the duplicate [[redirects]] block(s) so each `from` is defined exactly once.");
  process.exit(1);
}
fromRegex.lastIndex = 0;
while ((m = fromRegex.exec(tomlText)) !== null) redirectFroms.add(m[1]);

// _redirects file (legacy)
const redirectsTxt = fs.existsSync(path.join(DIST, "_redirects")) ? fs.readFileSync(path.join(DIST, "_redirects"), "utf8") : "";
redirectsTxt.split(/\r?\n/).forEach((line) => {
  const t = line.trim();
  if (!t || t.startsWith("#")) return;
  const [from] = t.split(/\s+/);
  if (from) redirectFroms.add(from);
});

function urlResolves(url) {
  // Anchor-only URLs always "resolve" to the host page.
  if (url.startsWith("#")) return true;
  // Strip query string and fragment.
  const clean = url.split("#")[0].split("?")[0];
  // dist/<clean>.html
  if (fs.existsSync(path.join(DIST, clean.replace(/^\//, "") + ".html"))) return true;
  // dist/<clean>/index.html
  if (fs.existsSync(path.join(DIST, clean.replace(/^\//, ""), "index.html"))) return true;
  // dist/<clean>  (a literal file with no extension — rare)
  if (fs.existsSync(path.join(DIST, clean.replace(/^\//, "")))) return true;
  // netlify.toml redirect or _redirects entry
  if (redirectFroms.has(clean)) return true;
  // /tools/ -> /tools  (trailing slash variants)
  if (clean.endsWith("/") && redirectFroms.has(clean.slice(0, -1))) return true;
  return false;
}

const failures = [];

function readDistFile(url) {
  const clean = url.split("#")[0].split("?")[0].replace(/^\//, "");
  const candidates = [
    path.join(DIST, clean + ".html"),
    path.join(DIST, clean, "index.html"),
    path.join(DIST, clean),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return fs.readFileSync(c, "utf8"); }
    catch {}
  }
  return null;
}

for (const f of registry.features) {
  const urls = f.public_marketing_urls || [];
  for (const url of urls) {
    if (!urlResolves(url)) {
      failures.push({ feature: f.feature_name, url });
    }
  }
  if (f.member_url && !urlResolves(f.member_url) && !f.member_url.startsWith("/.netlify/")) {
    failures.push({ feature: f.feature_name, url: f.member_url, kind: "member_url" });
  }

  // title_signature: a string the rendered page MUST contain (in <title>
  // or <h1>). Catches the 2026-04-27 Friday Brief regression where the
  // page title silently flipped to "Monthly Briefs".
  if (f.title_signature) {
    const html = readDistFile(f.member_url || urls[0]);
    if (html && !html.includes(f.title_signature)) {
      failures.push({ feature: f.feature_name, url: f.member_url || urls[0], kind: "title_signature_missing", expected: f.title_signature });
    }
  }

  // min_archive_items: the page must contain at least this many
  // `class="brief-card"` (or feature-specific) entries. Soft check —
  // 0 is allowed if min_archive_items is unset.
  if (f.min_archive_items && f.min_archive_items > 0) {
    const html = readDistFile(f.member_url || urls[0]);
    if (html) {
      const count = (html.match(/class="brief-card"/g) || []).length;
      if (count < f.min_archive_items) {
        failures.push({ feature: f.feature_name, url: f.member_url || urls[0], kind: "archive_items_below_minimum", observed: count, expected_min: f.min_archive_items });
      }
    }
  }
}

// /latest staleness check: verify the newest valid markdown article in
// content/newsletter/ appears in dist/latest.html. Catches the case
// where /latest silently freezes on an old article date.
const newsletterDir = path.join(ROOT, "content/newsletter");
if (fs.existsSync(newsletterDir)) {
  const matter = (() => { try { return require(path.join(ROOT, "node_modules/gray-matter")); } catch { return null; } })();
  if (matter) {
    const files = fs.readdirSync(newsletterDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
    let newest = null;
    const now = Date.now();
    for (const f of files) {
      const raw = fs.readFileSync(path.join(newsletterDir, f), "utf8");
      const fm = matter(raw).data;
      if (!fm.date || !fm.title) continue;
      const date = new Date(fm.date);
      // Future-date gate: future-dated articles are intentionally
      // held by build.js until publish_date arrives. Don't fail the
      // /latest check for an article that hasn't published yet.
      if (date.getTime() > now) continue;
      if (!newest || date > newest.date) newest = { date, slug: fm.slug || f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""), title: fm.title };
    }
    if (newest) {
      const latestHtml = readDistFile("/latest");
      if (latestHtml && !latestHtml.includes(newest.slug) && !latestHtml.includes(newest.title.slice(0, 30))) {
        failures.push({ feature: "/latest", url: "/latest", kind: "newest_article_not_in_latest", expected_slug: newest.slug, expected_title: newest.title });
      }
    }
  }
}

// Homepage Choose-a-Tool CTA must point to /tools (not the old
// /resources#paid-tools path). Catches the 2026-04-27 regression where
// the homepage CTA still routed to the old anchor.
const indexHtml = readDistFile("/");
if (indexHtml) {
  const cta = indexHtml.match(/<a[^>]*class="[^"]*btn-primary[^"]*"[^>]*href="([^"]+)"[^>]*>\s*Choose a Tool/i);
  if (cta) {
    if (!/^\/tools(\/|\?|$|#)/.test(cta[1]) && !/^\/tools\.html/.test(cta[1])) {
      failures.push({ feature: "Homepage", url: "/", kind: "choose_a_tool_href_wrong", observed: cta[1], expected: "/tools" });
    }
  }
  if (/href="[^"]*resources\.html#paid-tools"[^>]*>\s*Choose a Tool/i.test(indexHtml)) {
    failures.push({ feature: "Homepage", url: "/", kind: "stale_paid_tools_anchor_present" });
  }
}

// /pursuit-calendar built page must contain the 90-Day Deadline Tracker
// signature AND must NOT have its main page heading collapse into a
// generic "Premium Dashboard" (which is allowed only as the small
// dash-shell header chip, never as the page title).
{
  const calHtml = readDistFile("/premium/calendar.html");
  if (calHtml) {
    if (!calHtml.includes("90-Day Deadline Tracker")) {
      failures.push({ feature: "Pursuit Calendar", url: "/premium/calendar.html", kind: "calendar_subtitle_missing" });
    }
    // The page <title> must be the calendar one, NOT something generic.
    const titleMatch = calHtml.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && /^Premium Dashboard\b/.test(titleMatch[1])) {
      failures.push({ feature: "Pursuit Calendar", url: "/premium/calendar.html", kind: "calendar_title_is_generic_premium_dashboard", observed: titleMatch[1] });
    }
    // Must list the pursuit-deadline categories somewhere on page (legend or content).
    const categoriesPresent = ["RFI", "Industry Day", "Final RFP", "Proposal Due"].filter((c) => calHtml.includes(c));
    if (categoriesPresent.length < 3) {
      failures.push({ feature: "Pursuit Calendar", url: "/premium/calendar.html", kind: "calendar_categories_thin", observed: categoriesPresent });
    }
  }
}

// Tools hub must list the major tools (signatures the user expects to see).
{
  const toolsHtml = readDistFile("/tools");
  if (toolsHtml) {
    const expected = ["Pursuit Score", "Ask MMT", "Pursuit Calendar", "Compliance Check", "Signal Chain", "ProposalPulse", "MarketPulse", "Capture Corner", "Contract Tracker", "IDIQ Tracker"];
    const missing = expected.filter((t) => !toolsHtml.includes(t));
    if (missing.length > 0) {
      failures.push({ feature: "Tools Hub", url: "/tools", kind: "tools_hub_missing_tool", observed_missing: missing });
    }
  }
}

// Capture Corner stale-link guard: no built page may still point to
// /intel/capture-intelligence-this-issue/ as a "this week's issue" CTA
// — that's the old hardcoded route. Capture-corner.html's CTA must use
// /capture-corner/latest. Other site pages can continue to deep-link
// to /intel/... directly (that is still the canonical issue page).
{
  const ccHtml = readDistFile("/capture-corner");
  if (ccHtml) {
    if (/Read this week's issue|Open this week's issue/.test(ccHtml) && /href="\/intel\/capture-intelligence-this-issue/.test(ccHtml.match(/cc-btn cc-btn-primary[^<]*<[\s\S]{0,200}/g)?.join("\n") || "")) {
      // Soft check — only fail if the primary CTA is hardcoded.
      const primaryCta = ccHtml.match(/<a[^>]*class="cc-btn cc-btn-primary"[^>]*href="([^"]+)"/);
      if (primaryCta && primaryCta[1] === "/intel/capture-intelligence-this-issue/") {
        failures.push({ feature: "Capture Corner", url: "/capture-corner", kind: "primary_cta_hardcoded_to_intel_route", observed: primaryCta[1], expected: "/capture-corner/latest" });
      }
    }
  }
}

// Pursuit Calendar generic-dashboard guard: the page must NOT be a
// generic Premium Dashboard. Has to contain "90-Day Deadline Tracker"
// AND distinct categories.
{
  const calHtml = readDistFile("/premium/calendar.html") || readDistFile("/pursuit-calendar");
  if (calHtml) {
    const hasTracker = calHtml.includes("90-Day Deadline Tracker");
    const hasCategories = ["RFI", "Industry Day", "Final RFP", "Proposal Due"].filter((c) => calHtml.includes(c)).length >= 3;
    if (!hasTracker) failures.push({ feature: "Pursuit Calendar", url: "/premium/calendar.html", kind: "calendar_missing_90day_tracker_signature" });
    if (!hasCategories) failures.push({ feature: "Pursuit Calendar", url: "/premium/calendar.html", kind: "calendar_missing_pursuit_categories" });
    // The page <title> must NOT be "Premium Dashboard" — only the
    // small dash-shell chip can carry that text.
    const titleMatch = calHtml.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && /^Premium Dashboard\b/i.test(titleMatch[1].trim())) {
      failures.push({ feature: "Pursuit Calendar", url: "/premium/calendar.html", kind: "calendar_title_is_generic_premium_dashboard", observed: titleMatch[1] });
    }
  }
}

// Friday Brief raw-marker guard: dist must NOT contain unsubstituted
// BUILD:BRIEF_ARCHIVE or BUILD:BRIEF_LATEST markers.
{
  for (const p of ["/premium/briefings.html", "/premium/briefings"]) {
    const bHtml = readDistFile(p);
    if (bHtml && /<!--\s*BUILD:BRIEF_(ARCHIVE|LATEST)\s*-->/.test(bHtml)) {
      failures.push({ feature: "Friday Brief Archive", url: p, kind: "raw_build_marker_leaked" });
    }
  }
}

// Stale paid-tools anchor guard: no built page may still point to
// /resources#paid-tools or /resources.html#paid-tools.
{
  const fs2 = require("fs");
  const path2 = require("path");
  function walkDist(d) {
    const out = [];
    for (const e of fs2.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const full = path2.join(d, e.name);
      if (e.isDirectory()) out.push(...walkDist(full));
      else if (e.name.endsWith(".html")) out.push(full);
    }
    return out;
  }
  const distFiles = walkDist(DIST);
  const offenders = [];
  for (const f of distFiles) {
    const txt = fs2.readFileSync(f, "utf8");
    if (/href="\/?resources(?:\.html)?#paid-tools"/.test(txt)) {
      offenders.push(path2.relative(DIST, f));
    }
  }
  if (offenders.length > 0) {
    failures.push({ feature: "Homepage / nav", url: "*", kind: "stale_paid_tools_anchor_in_dist", offenders: offenders.slice(0, 5), total: offenders.length });
  }
}

// Stale legacy-href guards: no built page may emit the typo route
// /askmtt or /askmmt (canonical is /ask-mmt) or the legacy
// /agency-profiles path (canonical is /agencies/).
{
  const fs3 = require("fs");
  const path3 = require("path");
  function walkDist2(d) {
    const out = [];
    for (const e of fs3.readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const full = path3.join(d, e.name);
      if (e.isDirectory()) out.push(...walkDist2(full));
      else if (e.name.endsWith(".html")) out.push(full);
    }
    return out;
  }
  const distFiles2 = walkDist2(DIST);
  const askmttHits = [];
  const agencyProfilesHits = [];
  for (const f of distFiles2) {
    const txt = fs3.readFileSync(f, "utf8");
    if (/href="\/?ask(?:m|-)?m?tt"|href="\/?askmmt"/.test(txt)) {
      askmttHits.push(path3.relative(DIST, f));
    }
    if (/href="\/?agency-profiles"/.test(txt)) {
      agencyProfilesHits.push(path3.relative(DIST, f));
    }
  }
  if (askmttHits.length > 0) {
    failures.push({ feature: "Ask MMT", url: "*", kind: "stale_askmtt_href_in_dist", offenders: askmttHits.slice(0, 5), total: askmttHits.length });
  }
  if (agencyProfilesHits.length > 0) {
    failures.push({ feature: "Agency Profiles", url: "*", kind: "stale_agency_profiles_href_in_dist", offenders: agencyProfilesHits.slice(0, 5), total: agencyProfilesHits.length });
  }
}

// RFP Shredder live-implication guard: the marketing page may not
// claim live functionality unless an integration flag is set.
{
  const rfpHtml = readDistFile("/rfp-shredder");
  if (rfpHtml) {
    const claimsLive = /(run a live|live analysis runs on this domain|paste here for instant analysis)/i.test(rfpHtml);
    const labelsBeta = /(Private Beta|private[_\- ]beta|in private beta)/i.test(rfpHtml);
    if (claimsLive && !process.env.RFP_SHREDDER_LIVE) {
      failures.push({ feature: "RFP Shredder", url: "/rfp-shredder", kind: "rfp_shredder_claims_live_without_integration_flag" });
    }
    if (!labelsBeta) {
      failures.push({ feature: "RFP Shredder", url: "/rfp-shredder", kind: "rfp_shredder_missing_private_beta_label" });
    }
  }
}

if (failures.length === 0) {
  console.log(`validate-routes: ✓ all ${registry.features.length} features resolve, signatures + archive + /latest + homepage CTA + calendar + tools hub + capture-corner + brief + paid-tools-anchor + RFP-shredder checks pass`);
  process.exit(0);
}

console.error("validate-routes: FAIL — the following marketed URLs do not resolve:");
for (const fail of failures) {
  console.error(`  ✗ ${fail.feature.padEnd(20)} ${fail.url}${fail.kind ? `  (${fail.kind})` : ""}`);
}
console.error("\nFix: either add a [[redirects]] entry in netlify.toml, place a file at dist/<path>.html, or remove the URL from docs/member-features.json.");
process.exit(1);
