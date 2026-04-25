// ============================================================
// capture-corner-metrics.js (lib)
//
// Pure logic for the Capture Corner Premium daily metrics rollup.
// Used by:
//   - scripts/capture-corner-metrics.js  — local CLI; writes to reports/
//   - netlify/functions/capture-corner-metrics-scheduled.js  — nightly cron;
//     logs the markdown to ops_events instead of the read-only Lambda fs.
//
// Why this lib exists:
//   The function previously execFileSync'd scripts/capture-corner-metrics.js,
//   which (1) is not bundled into the Lambda by default and (2) writes to
//   `reports/` which is read-only at runtime. Both problems are solved by
//   making the rollup a pure JS module, keeping the CLI as a thin wrapper.
//
// Reads:
//   - scheduled_emails.resend_ids + status  (per release_id)
//   - premium_deliverables.published / published_at  (per release_id)
//   - Plausible aggregate stats             (if PLAUSIBLE_API_KEY set)
//
// Returns: { markdown, summary } — caller decides where to persist.
// ============================================================

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
    const rsp = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.PLAUSIBLE_API_KEY}` },
    });
    if (!rsp.ok) return { error: `plausible ${rsp.status}` };
    return await rsp.json();
  } catch (e) {
    return { error: String(e.message).substring(0, 200) };
  }
}

/**
 * Build the daily Capture Corner metrics markdown + a small summary object.
 * Network calls go through the supabase client + global fetch (Plausible).
 *
 * @param {object} supabase    — Supabase client (service-role)
 * @param {object} [opts]
 * @param {string} [opts.dateStr]  — override "today" for testing
 * @returns {Promise<{markdown: string, summary: object}>}
 */
async function runCaptureCornerMetrics(supabase, opts = {}) {
  const today = opts.dateStr || new Date().toISOString().slice(0, 10);
  const lines = [
    `# Capture Corner Metrics — ${today}`,
    "",
    "| release_id | portal published | portal visitors | portal pageviews | avg duration | email sent | errors | open/ctr |",
    "|---|---|---|---|---|---|---|---|",
  ];

  const summary = {
    date: today,
    releases_total: RELEASE_IDS.length,
    releases_published: 0,
    releases_sent: 0,
    releases_with_errors: 0,
    rows: [],
  };

  for (const rid of RELEASE_IDS) {
    const { data: portal } = await supabase
      .from("premium_deliverables")
      .select("slug, publish_at, published, published_at")
      .eq("release_id", rid)
      .maybeSingle();
    const { data: email } = await supabase
      .from("scheduled_emails")
      .select("status, scheduled_at, sent_at, resend_ids, last_error")
      .eq("release_id", rid)
      .maybeSingle();
    const plausibleData = portal?.slug ? await fetchPlausible(portal.slug + "/") : null;
    const p = plausibleData?.results || {};
    const visitors = p.visitors?.value ?? "—";
    const pageviews = p.pageviews?.value ?? "—";
    const dur = p.visit_duration?.value ?? "—";

    const sentCount = Array.isArray(email?.resend_ids) ? email.resend_ids.length : 0;
    const errText = email?.last_error ? "✗" : "✓";
    if (portal?.published) summary.releases_published++;
    if (email?.status === "sent") summary.releases_sent++;
    if (email?.last_error) summary.releases_with_errors++;
    summary.rows.push({
      release_id: rid,
      portal_published: !!portal?.published,
      portal_published_at: portal?.published_at || null,
      sent_count: sentCount,
      email_status: email?.status || null,
      has_error: !!email?.last_error,
    });

    lines.push(
      `| ${rid} | ${portal?.published ? "yes " + (portal.published_at || "") : "no"} | ${visitors} | ${pageviews} | ${dur}s | ${sentCount} (${email?.status || "n/a"}) | ${errText} | open/ctr require full-permission Resend key |`
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("- Plausible metrics require `PLAUSIBLE_API_KEY` env var; if absent, visitor/pageview fields show `—`.");
  lines.push("- Open/click-through require a Resend API key with `emails:read` scope. Current production key is send-only.");
  lines.push("- Targets: >=50% open, >=25% CTR, >=80% page views, >=8 min avg on page.");

  return { markdown: lines.join("\n"), summary };
}

module.exports = { runCaptureCornerMetrics, RELEASE_IDS };
