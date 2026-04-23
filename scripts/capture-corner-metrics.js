#!/usr/bin/env node
// ============================================================
// capture-corner-metrics.js — daily metrics report for scheduled
// Capture Corner Premium releases.
//
// Reads:
//   - Resend send status + error counts (from scheduled_emails.resend_ids + status)
//   - ops_events (CAPTURE_CORNER_PORTAL_PUBLISHED + CAPTURE_CORNER_RELEASE_*)
//   - Plausible (via env API token if configured; otherwise skipped with note)
//
// Writes: reports/capture-corner-metrics-YYYY-MM-DD.md
//
// Targets (per release spec): >=50% open, >=25% CTR, >=80% page views on portal,
// >=8 min avg time on page. Open/click require a Resend full-permission API key
// (current key is send-only). Report will flag missing metrics explicitly.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const RELEASE_IDS = [
  "biosurveillance-reframing-playbook",
  "recapture-bet-200m",
  "fy2027-dha-reorganization",
  "cdmrp-fy2026",
  "fy2027-fuse",
];

async function fetchPlausible(slug) {
  if (!process.env.PLAUSIBLE_API_KEY) return { skipped: "PLAUSIBLE_API_KEY not set" };
  const site = "missionmeetstech.com";
  const url = `https://plausible.io/api/v1/stats/aggregate?site_id=${site}&period=7d&metrics=visitors,pageviews,visit_duration,bounce_rate&filters=event:page==${encodeURIComponent(slug)}`;
  try {
    const rsp = await fetch(url, { headers: { Authorization: `Bearer ${process.env.PLAUSIBLE_API_KEY}` } });
    if (!rsp.ok) return { error: `plausible ${rsp.status}` };
    return await rsp.json();
  } catch (e) {
    return { error: String(e.message).substring(0, 200) };
  }
}

async function main() {
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Capture Corner Metrics — ${today}`,
    "",
    "| release_id | portal published | portal visitors | portal pageviews | avg duration | email sent | errors | open/ctr |",
    "|---|---|---|---|---|---|---|---|",
  ];

  for (const rid of RELEASE_IDS) {
    const { data: portal } = await s.from("premium_deliverables").select("slug, publish_at, published, published_at").eq("release_id", rid).maybeSingle();
    const { data: email } = await s.from("scheduled_emails").select("status, scheduled_at, sent_at, resend_ids, last_error").eq("release_id", rid).maybeSingle();
    const plausibleData = portal?.slug ? await fetchPlausible(portal.slug + "/") : null;
    const p = plausibleData?.results || {};
    const visitors = p.visitors?.value ?? "—";
    const pageviews = p.pageviews?.value ?? "—";
    const dur = p.visit_duration?.value ?? "—";

    const sentCount = Array.isArray(email?.resend_ids) ? email.resend_ids.length : 0;
    const errText = email?.last_error ? "✗" : "✓";
    lines.push(
      `| ${rid} | ${portal?.published ? "yes " + (portal.published_at||"") : "no"} | ${visitors} | ${pageviews} | ${dur}s | ${sentCount} (${email?.status||"n/a"}) | ${errText} | open/ctr require full-permission Resend key |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("- Plausible metrics require `PLAUSIBLE_API_KEY` env var; if absent, visitor/pageview fields show `—`.");
  lines.push("- Open/click-through require a Resend API key with `emails:read` scope. Current production key is send-only.");
  lines.push("- Targets: >=50% open, >=25% CTR, >=80% page views, >=8 min avg on page.");

  const out = path.join(process.cwd(), "reports", `capture-corner-metrics-${today}.md`);
  fs.writeFileSync(out, lines.join("\n"));
  console.log(`wrote ${out}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
