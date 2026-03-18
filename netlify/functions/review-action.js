/**
 * review-action.js — GET endpoint for review queue approve/reject.
 *
 * Called from links in the review queue digest email.
 * Updates intel_review_queue and optionally applies approved changes.
 *
 * Query params: item_id (UUID), action (approve|reject)
 * Used by: review-queue-digest-background.js
 */

const { createClient } = require("@supabase/supabase-js");
const { logOpsEvent } = require("./lib/ops-ledger");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { item_id, action } = params;

  if (!item_id || !["approve", "reject"].includes(action)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: "<html><body><h2>Invalid review action</h2></body></html>",
    };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: "<html><body><h2>Service unavailable</h2></body></html>",
    };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Fetch the review item
    const { data: item, error: fetchErr } = await supabase
      .from("intel_review_queue")
      .select("*")
      .eq("id", item_id)
      .single();

    if (fetchErr || !item) {
      return resultPage("Item not found", "This review item may have already been processed.");
    }

    if (item.reviewed) {
      return resultPage("Already reviewed", `This item was already ${item.review_action}d.`);
    }

    // Mark as reviewed
    await supabase
      .from("intel_review_queue")
      .update({
        reviewed: true,
        review_action: action,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", item_id);

    // If approved and it's a contract intel correction, apply it
    if (action === "approve" && item.contract_id && item.field_name && item.proposed_value) {
      try {
        const { data: existing } = await supabase
          .from("contract_intel")
          .select("intel")
          .eq("contract_name", item.contract_id)
          .single();

        if (existing && existing.intel) {
          const updatedIntel = { ...existing.intel };
          updatedIntel[item.field_name] = item.proposed_value;
          await supabase
            .from("contract_intel")
            .update({ intel: updatedIntel })
            .eq("contract_name", item.contract_id);
        }
      } catch (applyErr) {
        console.error("Failed to apply approved change:", applyErr.message);
      }
    }

    await logOpsEvent(supabase, {
      event_type: "review_action",
      source_function: "review-action",
      severity: "info",
      details: { item_id, action, contract_id: item.contract_id, field_name: item.field_name },
    });

    const actionLabel = action === "approve" ? "Approved" : "Rejected";
    return resultPage(actionLabel, `${item.field_name} for ${item.contract_id} has been ${action}d.`);
  } catch (err) {
    console.error("review-action error:", err);
    return resultPage("Error", "Something went wrong processing this review action.");
  }
};

function resultPage(title, message) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: `<!DOCTYPE html><html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — Mission Meets Tech</title></head>
<body style="margin:0;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;text-align:center;">
  <div style="max-width:400px;margin:60px auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="font-size:24px;color:#111;margin:0 0 12px;">${title}</h1>
    <p style="font-size:16px;color:#6b7280;line-height:1.6;">${message}</p>
    <a href="https://missionmeetstech.com" style="display:inline-block;margin-top:24px;padding:10px 24px;background:#00050f;color:#00E5FA;border-radius:6px;text-decoration:none;font-size:14px;">Back to Mission Meets Tech</a>
  </div>
</body></html>`,
  };
}
