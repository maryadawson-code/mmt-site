/**
 * review-queue-digest-background.js — Daily review queue email digest.
 *
 * Queries intel_review_queue for unreviewed items, groups by contract,
 * and sends a summary digest to Mary for manual review.
 *
 * Schedule: Daily 7 AM ET (11:00 UTC) — configured in netlify.toml.
 * Used by: contract-intel-refresh-background.js routes items here.
 */

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { logOpsEvent } = require("./lib/ops-ledger");
const { checkKillSwitch } = require("./lib/kill-switch");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  const killCheck = checkKillSwitch("review-queue-digest-background");
  if (killCheck.blocked) return killCheck.response;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch unreviewed items
  const { data: items, error } = await supabase
    .from("intel_review_queue")
    .select("*")
    .eq("reviewed", false)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Review queue query error:", error.message);
    return { statusCode: 500, body: error.message };
  }

  if (!items || items.length === 0) {
    console.log("No pending review items");
    return { statusCode: 200, body: "No pending items" };
  }

  // Group by contract_id
  const groups = {};
  for (const item of items) {
    const key = item.contract_id || "unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  // Build digest HTML
  let rows = "";
  for (const [contract, contractItems] of Object.entries(groups)) {
    rows += `<tr><td colspan="5" style="padding:12px 8px;font-weight:700;background:#f0f0f0;font-size:14px;">${escapeHtml(contract)} (${contractItems.length} items)</td></tr>`;
    for (const item of contractItems) {
      const approveUrl = `https://missionmeetstech.com/.netlify/functions/review-action?item_id=${item.id}&action=approve`;
      const rejectUrl = `https://missionmeetstech.com/.netlify/functions/review-action?item_id=${item.id}&action=reject`;
      rows += `<tr>
        <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(item.field_name)}</td>
        <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #eee;color:#666;">${escapeHtml((item.current_value || "").substring(0, 80))}</td>
        <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #eee;color:#059669;">${escapeHtml((item.proposed_value || "").substring(0, 80))}</td>
        <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(item.confidence)} — ${escapeHtml(item.reason || "")}</td>
        <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #eee;">
          <a href="${approveUrl}" style="color:#059669;text-decoration:none;font-weight:600;">Approve</a> |
          <a href="${rejectUrl}" style="color:#dc2626;text-decoration:none;font-weight:600;">Reject</a>
        </td>
      </tr>`;
    }
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;background:#f4f4f4;">
  <div style="max-width:800px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <h2 style="margin:0 0 16px;color:#00050F;">Intel Review Queue — ${items.length} items pending</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#f9fafb;">
        <th style="padding:8px;text-align:left;font-size:12px;color:#666;">Field</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#666;">Current</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#666;">Proposed</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#666;">Confidence / Reason</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#666;">Action</th>
      </tr>
      ${rows}
    </table>
  </div>
</body></html>`;

  await sendEmail({
    to: "mary@missionmeetstech.com",
    subject: `MMT Intel Review Queue — ${items.length} items pending`,
    html,
    from: "Mission Meets Tech <noreply@missionmeetstech.com>",
  });

  await logOpsEvent(supabase, {
    event_type: "review_digest_sent",
    source_function: "review-queue-digest-background",
    severity: "info",
    details: { count: items.length, contracts: Object.keys(groups) },
  });

  console.log(`Review digest sent: ${items.length} items across ${Object.keys(groups).length} contracts`);
  return { statusCode: 200, body: JSON.stringify({ sent: items.length }) };
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
