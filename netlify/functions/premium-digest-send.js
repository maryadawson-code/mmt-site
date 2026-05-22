// ============================================================
// premium-digest-send.js — Netlify Scheduled Function
//
// Sends personalized notification digests to premium subscribers
// based on their notification preferences in mmt_preferences.
//
// Runs daily at 6:30 AM ET (11:30 UTC). For each subscriber:
//   - Checks which notifications they opted into
//   - Queries the relevant Supabase tables for new data
//   - Assembles a single digest email with all opted-in sections
//   - Skips subscribers with no new content
//
// Schedule configured in netlify.toml:
//   [functions."premium-digest-send"]
//     schedule = "30 11 * * *"   (daily 6:30 AM ET)
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { checkKillSwitch, shouldHoldEmail, holdEmail } = require("./lib/kill-switch");
const { logOpsEvent } = require("./lib/ops-ledger");
const { isRootDomainUrl } = require("./lib/url-validator");

const SITE_URL = "https://missionmeetstech.com";
const ADMIN_EMAIL = "mary@missionmeetstech.com";

exports.handler = async (event) => {
  console.log("premium-digest-send: triggered", new Date().toISOString());

  const killCheck = checkKillSwitch("premium-digest-send");
  if (killCheck.blocked) return killCheck.response;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, 5=Fri
  const isMonday = dayOfWeek === 1;
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Duplicate check — one digest per day
  const todayStr = now.toISOString().slice(0, 10);
  try {
    const { data: existing } = await supabase
      .from("ops_ledger")
      .select("id")
      .eq("signature", "premium_digest_sent")
      .eq("affected_entity", todayStr)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log("premium-digest-send: already sent today, skipping");
      return { statusCode: 200, body: JSON.stringify({ skipped: "already_sent" }) };
    }
  } catch (e) { /* proceed */ }

  // Get all premium subscribers with preferences. TKT-4: prior filter
  // matched ANY active subscription_status without a subscription_tier
  // gate, which could match free-tier accounts that happened to have an
  // active row from a non-paid product. Now requires both a paid tier
  // AND an active/trialing status, plus the legacy admin/paid tier column.
  const { data: subscribers } = await supabase
    .from("mp_users")
    .select("email, full_name, tier, subscription_tier, subscription_status, founding_member")
    .or(
      [
        "and(subscription_tier.in.(premium,institutional,mmt_premium_founding),subscription_status.in.(active,trialing))",
        "tier.eq.admin",
        "tier.eq.paid",
        "founding_member.eq.true",
      ].join(",")
    );

  if (!subscribers || subscribers.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "no_subscribers" }) };
  }

  // Get all preferences in one query
  const emails = subscribers.map((s) => s.email.toLowerCase());
  const { data: allPrefs } = await supabase
    .from("mmt_preferences")
    .select("email, notifications, agencies")
    .in("email", emails);

  const prefsMap = {};
  (allPrefs || []).forEach((p) => { prefsMap[p.email.toLowerCase()] = p; });

  // Pre-fetch data for all notification types (only if at least one subscriber wants it)
  const anyWants = (key) => Object.values(prefsMap).some((p) => p.notifications && p.notifications[key]);
  const anyHasWatchlist = Object.values(prefsMap).some((p) => p.notifications && p.notifications.watchlist && p.notifications.watchlist.length > 0);

  let newSolicitations = [];
  let contractUpdates = [];
  let protestAlerts = [];
  let sbAwards = [];
  let newArticles = [];
  let allWatchlistUpdates = []; // contract_intel + opportunity_radar for watchlist matching

  // New solicitations (from opportunity_radar, last 24h)
  if (anyWants("solicitations")) {
    try {
      const { data } = await supabase
        .from("opportunity_radar")
        .select("title, solicitation_number, agency, deadline, estimated_value, set_aside, opportunity_type, relevance_score, created_at")
        .gte("created_at", since24h)
        .gte("relevance_score", 50)
        .order("relevance_score", { ascending: false })
        .limit(20);
      newSolicitations = data || [];
    } catch (e) { console.warn("Solicitation query failed:", e.message); }
  }

  // Contract intel updates (from contract_intel, last 24h)
  // MMT-INTEL-02: exclude rows that are >7d stale at write time OR whose
  // sources have all been invalidated (root-domain SAM.gov etc). The
  // exclusion list is captured into _excludedRows so the pre-digest QA
  // email and ops_ledger can both surface what got dropped and why.
  const _excludedRows = [];
  if (anyWants("contract_intel")) {
    try {
      const { data } = await supabase
        .from("contract_intel")
        .select("contract_name, intel, sources, last_updated")
        .gte("last_updated", since24h)
        .order("last_updated", { ascending: false })
        .limit(15);
      const raw = data || [];
      const sevenDayCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      for (const r of raw) {
        const lastUpdated = r.last_updated ? new Date(r.last_updated) : null;
        if (!lastUpdated || lastUpdated < sevenDayCutoff) {
          _excludedRows.push({ contract_name: r.contract_name, reason: "stale_gt_7d", last_updated: r.last_updated });
          continue;
        }
        const arr = Array.isArray(r.sources) ? r.sources : [];
        const validSources = arr.filter((s) => {
          const u = typeof s === "string" ? s : (s && (s.url || s.link)) || "";
          return u && !isRootDomainUrl(u);
        });
        if (arr.length > 0 && validSources.length === 0) {
          _excludedRows.push({ contract_name: r.contract_name, reason: "all_sources_invalid", last_updated: r.last_updated });
          continue;
        }
        contractUpdates.push(r);
      }
      // Log every excluded row so the weekly QA report can audit.
      for (const e of _excludedRows) {
        try {
          await logOpsEvent(supabase, {
            event_type: "digest_excluded_stale",
            source_function: "premium-digest-send",
            severity: "warn",
            signature: e.reason,
            affected_entity: e.contract_name,
            details: { reason: e.reason, last_updated: e.last_updated },
          });
        } catch { /* non-blocking */ }
      }
    } catch (e) { console.warn("Contract intel query failed:", e.message); }
  }

  // Protest alerts — read from protest_monitor (source of truth, written
  // by protest-monitor-background). Surface rows whose status changed
  // since the last check window (last_checked within 24h AND
  // status != last_status, i.e. a real transition).
  if (anyWants("protests")) {
    try {
      const { data } = await supabase
        .from("protest_monitor")
        .select("case_number, protester, agency, status, last_status, details, last_checked")
        .gte("last_checked", since24h)
        .order("last_checked", { ascending: false })
        .limit(10);
      protestAlerts = (data || []).filter((r) => r.status && r.last_status && r.status !== r.last_status);
    } catch (e) { console.warn("Protest query failed:", e.message); }
  }

  // SB awards (weekly on Mondays from opportunity_radar with vehicle data)
  if (anyWants("sb_awards") && isMonday) {
    try {
      const { data } = await supabase
        .from("opportunity_radar")
        .select("title, agency, estimated_value, set_aside, details, created_at")
        .eq("opportunity_type", "award_notice")
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(20);
      sbAwards = data || [];
    } catch (e) { console.warn("SB awards query failed:", e.message); }
  }

  // New articles (check newsletters.json for articles from last 24h)
  if (anyWants("new_articles")) {
    try {
      const nlRes = await fetch(`${SITE_URL}/newsletters.json`);
      if (nlRes.ok) {
        const nlData = await nlRes.json();
        const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        newArticles = (nlData || []).filter((a) => new Date(a.date) >= cutoff).slice(0, 5);
      }
    } catch (e) { console.warn("Article fetch failed:", e.message); }
  }

  // Watchlist: fetch recent contract intel and opportunity data for keyword matching
  if (anyHasWatchlist) {
    try {
      const [wlContracts, wlOpps] = await Promise.all([
        supabase.from("contract_intel").select("contract_name, intel, last_updated").gte("last_updated", since24h).order("last_updated", { ascending: false }).limit(30),
        supabase.from("opportunity_radar").select("title, solicitation_number, agency, deadline, opportunity_type, created_at").gte("created_at", since24h).order("created_at", { ascending: false }).limit(30),
      ]);
      if (wlContracts.data) allWatchlistUpdates.push(...wlContracts.data.map((c) => ({ type: "contract", name: c.contract_name, detail: typeof c.intel === "string" ? c.intel.substring(0, 150) : (c.intel?.summary || "").substring(0, 150), date: c.last_updated })));
      if (wlOpps.data) allWatchlistUpdates.push(...wlOpps.data.map((o) => ({ type: "opportunity", name: o.title, detail: `${o.opportunity_type || "notice"} — ${o.agency || ""}`, date: o.created_at })));
    } catch (e) { console.warn("Watchlist data query failed:", e.message); }
  }

  // MMT-INTEL-02: pre-digest QA email to mary@. Always sent — silence
  // is failure. Body covers excluded rows, radar/vehicle freshness, and
  // recent ops_ledger failures so the morning inbox surfaces problems
  // BEFORE 21 subscribers see them.
  try {
    const radarHealth = await _radarHealth(supabase, "opportunity_radar", null);
    const vehicleHealth = await _radarHealth(supabase, "opportunity_radar", "contract_vehicle");
    const ledgerFailures = await _recentLedgerFailures(supabase, 24);
    const subjBits = [
      `${_excludedRows.length} excluded`,
      `${_excludedRows.filter((e) => e.reason === "all_sources_invalid").length} bad URL`,
      `radar ${radarHealth.fresh ? "ok" : "stale"}`,
      `vehicle ${vehicleHealth.fresh ? "ok" : "stale"}`,
    ];
    const qaHtml = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;padding:24px;color:#0A192F;">
      <h2 style="margin:0 0 8px;">Pre-digest QA &middot; ${todayStr}</h2>
      <p style="color:#5C6B7A;margin:0 0 16px;font-size:13px;">Sent 5 min before the 11:30 UTC digest run. Always sent — empty body = all clear.</p>
      <h3 style="font-size:14px;margin:16px 0 6px;">Excluded contract_intel rows (${_excludedRows.length})</h3>
      ${_excludedRows.length === 0 ? "<p>None.</p>" : `<ul>${_excludedRows.map((e) => `<li>${esc(e.contract_name)} &mdash; ${esc(e.reason)} &middot; last_updated ${esc(e.last_updated || "")}</li>`).join("")}</ul>`}
      <h3 style="font-size:14px;margin:16px 0 6px;">Opportunity Radar</h3>
      <p>last_scan: ${esc(radarHealth.last_scan || "never")} &middot; age_hours: ${radarHealth.age_hours} &middot; total_opps: ${radarHealth.total}</p>
      <h3 style="font-size:14px;margin:16px 0 6px;">SB Vehicle Radar</h3>
      <p>last_scan: ${esc(vehicleHealth.last_scan || "never")} &middot; age_hours: ${vehicleHealth.age_hours} &middot; total_rows: ${vehicleHealth.total}</p>
      <h3 style="font-size:14px;margin:16px 0 6px;">ops_ledger failures (last 24h)</h3>
      ${ledgerFailures.length === 0 ? "<p>None.</p>" : `<ul>${ledgerFailures.map((r) => `<li>${esc(r.source_function)} &mdash; ${esc(r.event_type)} &middot; ${esc(r.signature || "")} &middot; ${esc(r.created_at)}</li>`).join("")}</ul>`}
    </body></html>`;
    await sendEmail({
      to: ADMIN_EMAIL,
      from: "intel@missionmeetstech.com",
      subject: `MMT pre-digest QA — ${subjBits.join(", ")}`,
      html: qaHtml,
    });
  } catch (qaErr) {
    console.warn("pre-digest QA email failed (non-blocking):", qaErr.message);
  }

  // Send personalized digests
  const holdMode = shouldHoldEmail();
  let sentCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const sub of subscribers) {
    const email = sub.email.toLowerCase();
    const prefs = prefsMap[email];
    const notifs = (prefs && prefs.notifications) || {};

    // Build sections for this subscriber
    const sections = [];

    // Solicitations
    if (notifs.solicitations && newSolicitations.length > 0) {
      const freq = notifs.solicitation_frequency || "weekly";
      if (freq === "daily" || (freq === "weekly" && isMonday)) {
        const items = (freq === "weekly" ? newSolicitations : newSolicitations).slice(0, 10);
        if (items.length > 0) {
          const rows = items.map((s) =>
            `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #D8E0E8;font-size:13px;font-weight:600;color:#0A192F;">${esc(s.title || "Untitled")}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;">${esc(s.agency || "")}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #D8E0E8;font-size:12px;color:#5C6B7A;">${s.deadline ? new Date(s.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}</td>
            </tr>`
          ).join("");
          sections.push({
            title: "New Solicitations",
            html: `<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
              <tr><th style="text-align:left;padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#5C6B7A;border-bottom:2px solid #D8E0E8;">Opportunity</th><th style="text-align:left;padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#5C6B7A;border-bottom:2px solid #D8E0E8;">Agency</th><th style="text-align:left;padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#5C6B7A;border-bottom:2px solid #D8E0E8;">Deadline</th></tr>
              ${rows}
            </table>
            <a href="${SITE_URL}/contract-tracker.html" style="font-size:13px;color:#457B9D;font-weight:600;text-decoration:none;">View full Opportunity Radar &rarr;</a>`,
          });
        }
      }
    }

    // Contract intel
    if (notifs.contract_intel && contractUpdates.length > 0) {
      const items = contractUpdates.slice(0, 5);
      const rows = items.map((c) => {
        const snippet = typeof c.intel === "string" ? c.intel.substring(0, 150) : (c.intel?.summary || "").substring(0, 150);
        return `<div style="padding:10px 0;border-bottom:1px solid #D8E0E8;">
          <div style="font-size:14px;font-weight:600;color:#0A192F;">${esc(c.contract_name)}</div>
          <div style="font-size:13px;color:#5C6B7A;margin-top:2px;">${esc(snippet)}${snippet.length >= 150 ? "..." : ""}</div>
        </div>`;
      }).join("");
      sections.push({
        title: "Contract Intel Updates",
        html: rows + `<a href="${SITE_URL}/contract-tracker.html" style="font-size:13px;color:#457B9D;font-weight:600;text-decoration:none;display:inline-block;margin-top:8px;">View Contract Tracker &rarr;</a>`,
      });
    }

    // Protest alerts
    if (notifs.protests && protestAlerts.length > 0) {
      const rows = protestAlerts.slice(0, 5).map((p) => {
        const d = p.details || {};
        const headline = `${p.case_number || "GAO Protest"} — ${p.protester || ""} v. ${p.agency || ""}`.trim();
        const change = `Status: ${p.last_status || "?"} → ${p.status || "?"}`;
        const summary = d.summary || d.next_milestone || "Status change detected";
        return `<div style="padding:10px 0;border-bottom:1px solid #D8E0E8;">
          <div style="font-size:14px;font-weight:600;color:#0A192F;">${esc(headline)}</div>
          <div style="font-size:12px;color:#92710A;margin-top:2px;font-weight:600;">${esc(change)}</div>
          <div style="font-size:13px;color:#5C6B7A;margin-top:2px;">${esc(summary)}</div>
        </div>`;
      }).join("");
      sections.push({ title: "Protest Alerts", html: rows });
    }

    // SB awards (weekly only)
    if (notifs.sb_awards && isMonday && sbAwards.length > 0) {
      const rows = sbAwards.slice(0, 8).map((a) =>
        `<div style="padding:8px 0;border-bottom:1px solid #D8E0E8;font-size:13px;">
          <span style="font-weight:600;color:#0A192F;">${esc(a.title || "Award")}</span>
          <span style="color:#5C6B7A;"> — ${esc(a.agency || "")} ${a.estimated_value ? "($" + a.estimated_value + ")" : ""}</span>
        </div>`
      ).join("");
      sections.push({ title: "Small Business Awards This Week", html: rows });
    }

    // New articles
    if (notifs.new_articles && newArticles.length > 0) {
      const rows = newArticles.map((a) =>
        `<div style="padding:10px 0;border-bottom:1px solid #D8E0E8;">
          <a href="${SITE_URL}${a.url || "/latest.html"}" style="font-size:14px;font-weight:600;color:#0A192F;text-decoration:none;">${esc(a.title)}</a>
          <div style="font-size:13px;color:#5C6B7A;margin-top:2px;">${esc((a.description || "").substring(0, 120))}${(a.description || "").length > 120 ? "..." : ""}</div>
        </div>`
      ).join("");
      sections.push({
        title: "New Analysis",
        html: rows + `<a href="${SITE_URL}/latest.html" style="font-size:13px;color:#457B9D;font-weight:600;text-decoration:none;display:inline-block;margin-top:8px;">View all analysis &rarr;</a>`,
      });
    }

    // Watchlist matches — check if any watched keywords appear in today's updates
    const watchlist = (notifs.watchlist || []);
    if (watchlist.length > 0 && allWatchlistUpdates.length > 0) {
      const matches = [];
      for (const item of allWatchlistUpdates) {
        const nameLC = (item.name || "").toLowerCase();
        for (const keyword of watchlist) {
          if (nameLC.includes(keyword.toLowerCase())) {
            matches.push({ keyword, ...item });
            break; // one match per update is enough
          }
        }
      }
      if (matches.length > 0) {
        const rows = matches.map((m) =>
          `<div style="padding:8px 0;border-bottom:1px solid #D8E0E8;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#92710A;margin-bottom:2px;">Watching: ${esc(m.keyword)}</div>
            <div style="font-size:14px;font-weight:600;color:#0A192F;">${esc(m.name)}</div>
            <div style="font-size:12px;color:#5C6B7A;margin-top:2px;">${esc(m.detail)}</div>
          </div>`
        ).join("");
        sections.unshift({
          title: "Watchlist Alerts",
          html: rows,
        });
      }
    }

    // Skip if no sections have content
    if (sections.length === 0) {
      skipCount++;
      continue;
    }

    // Build the email
    const sectionsHtml = sections.map((s) =>
      `<div style="margin-bottom:24px;">
        <h2 style="font-size:15px;font-weight:700;color:#0A192F;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #457B9D;">${s.title}</h2>
        ${s.html}
      </div>`
    ).join("");

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#0A192F;padding:20px 32px;text-align:center;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:#457B9D;margin-bottom:2px;">MMT Premium</div>
    <div style="font-size:18px;font-weight:800;color:#FFFFFF;">Your Intelligence Digest</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
  </td></tr>
  <tr><td style="padding:24px 32px;">
    ${sectionsHtml}
  </td></tr>
  <tr><td style="padding:16px 32px;background:#F3F4F6;border-top:1px solid #D8E0E8;text-align:center;">
    <p style="font-size:12px;color:#5C6B7A;margin:0 0 4px;">
      <a href="${SITE_URL}/premium/settings/" style="color:#457B9D;text-decoration:none;font-weight:600;">Manage notifications</a>
      &nbsp;&middot;&nbsp;
      <a href="${SITE_URL}/premium/dashboard/" style="color:#457B9D;text-decoration:none;font-weight:600;">Dashboard</a>
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:0;">Mission Meets Tech LLC &middot; <a href="${SITE_URL}" style="color:#457B9D;">missionmeetstech.com</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const subject = `MMT Digest — ${sections.map((s) => s.title).join(", ")}`;

    try {
      if (holdMode) {
        await holdEmail(supabase, email, subject, emailHtml, { type: "premium_digest", date: todayStr });
        sentCount++;
      } else {
        // No adminCopy: BCCing every per-subscriber digest to admin
        // produced ~21+ inbox copies/day (one per active subscriber × the
        // ADMIN_BCC_EMAILS list). The end-of-run admin summary email
        // (~390 below) gives Mary one daily rollup with sent/skipped/failed
        // counts and per-source totals — that's the signal worth keeping.
        // Removed 2026-05-04 inbox cleanup pass.
        const result = await sendEmail({
          to: email,
          subject: subject.length > 78 ? subject.substring(0, 75) + "..." : subject,
          html: emailHtml,
          from: "Mission Meets Tech <noreply@missionmeetstech.com>",
        });
        if (result.success) sentCount++;
        else failCount++;
      }
    } catch (err) {
      failCount++;
    }

    // Rate limit
    if (subscribers.length > 10) await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`premium-digest-send: ${sentCount} sent, ${skipCount} skipped (no content), ${failCount} failed`);

  // Notify Mary if any digests sent
  if (sentCount > 0) {
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `[Premium] Digest sent — ${sentCount} subscribers, ${skipCount} skipped`,
        html: `<div style="font-family:sans-serif;padding:24px;color:#333;">
          <h2>[Premium Digest] ${todayStr}</h2>
          <p>Sent: ${sentCount} | Skipped (no content): ${skipCount} | Failed: ${failCount}</p>
          <p>Data: ${newSolicitations.length} solicitations, ${contractUpdates.length} contract updates, ${protestAlerts.length} protests, ${sbAwards.length} SB awards, ${newArticles.length} articles</p>
        </div>`,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });
    } catch { /* non-blocking */ }
  }

  // Log for duplicate prevention.
  // Label fix: historic rows always logged DELIVERY_FAILURE even on clean runs, which tripped
  // dashboards filtering by event_type. Use DIGEST_COMPLETE when failed_count == 0.
  const _failedCount = failCount || 0;
  await logOpsEvent(supabase, {
    event_type: _failedCount > 0 ? "DELIVERY_FAILURE" : "DIGEST_COMPLETE",
    source_function: "premium-digest-send",
    severity: _failedCount > 0 ? "error" : "info",
    signature: "premium_digest_sent",
    affected_entity: todayStr,
    details: { sent: sentCount, skipped: skipCount, failed: _failedCount, failed_count: _failedCount },
  });

  return { statusCode: 200, body: JSON.stringify({ sent: sentCount, skipped: skipCount, failed: failCount }) };
};

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// MMT-INTEL-02 helpers for the pre-digest QA email.
async function _radarHealth(supabase, table, vehicleFilter) {
  try {
    let query = supabase.from(table).select("created_at, scan_date", { count: "exact" });
    if (vehicleFilter) query = query.not(vehicleFilter, "is", null);
    const { data, count } = await query.order("created_at", { ascending: false }).limit(1);
    const lastIso = (data || [])[0]?.created_at || (data || [])[0]?.scan_date || null;
    const ageHours = lastIso ? Math.round((Date.now() - new Date(lastIso).getTime()) / 3600000) : Infinity;
    return { last_scan: lastIso, age_hours: ageHours, total: count || 0, fresh: ageHours <= 48 };
  } catch (e) {
    return { last_scan: null, age_hours: Infinity, total: 0, fresh: false, error: e.message };
  }
}

async function _recentLedgerFailures(supabase, hours) {
  try {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const { data } = await supabase
      .from("ops_ledger")
      .select("source_function, event_type, signature, severity, created_at")
      .in("severity", ["error", "critical"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    return data || [];
  } catch {
    return [];
  }
}
