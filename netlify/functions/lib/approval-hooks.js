// approval-hooks.js — Utility for agents to submit approval requests
//
// Usage:
//   const { submitForApproval } = require('./lib/approval-hooks');
//   await submitForApproval(supabase, { title, category, targetRole, ... });

async function submitForApproval(supabase, {
  title, description, category, targetRole, targetEmail,
  submittedBy, payloadType, payload, context, previewHtml
}) {
  try {
    // Look up category config for expiry and auto-approve rules
    const { data: cat } = await supabase.from("approval_categories")
      .select("expiry_hours, auto_approve_rules")
      .eq("category", category)
      .single();

    const expiresAt = cat
      ? new Date(Date.now() + (cat.expiry_hours || 72) * 3600000).toISOString()
      : new Date(Date.now() + 72 * 3600000).toISOString();

    // Check auto-approve rules
    let autoApproved = false;
    if (cat?.auto_approve_rules && Object.keys(cat.auto_approve_rules).length > 0) {
      autoApproved = checkAutoApproveRules(cat.auto_approve_rules, payload, context);
    }

    const { data, error } = await supabase.from("approval_queue").insert({
      title, description, category,
      target_role: targetRole,
      target_email: targetEmail || null,
      submitted_by: submittedBy,
      submitted_by_type: "agent",
      payload_type: payloadType,
      payload: payload || {},
      context: context || {},
      preview_html: previewHtml || null,
      status: autoApproved ? "auto-approved" : "pending",
      decision_by: autoApproved ? "system" : null,
      decision_at: autoApproved ? new Date().toISOString() : null,
      expires_at: expiresAt,
    }).select("id, status").single();

    if (error) {
      console.error("[approval-hooks] insert error:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[approval-hooks]", err.message);
    return null;
  }
}

function checkAutoApproveRules(rules, payload, context) {
  if (rules.alwaysAutoApprove) return true;
  if (rules.minScore && context?.leadScore >= rules.minScore) return true;
  if (rules.maxCostCents && payload?.costCents && payload.costCents <= rules.maxCostCents) return true;
  return false;
}

module.exports = { submitForApproval };
