// approvals.js — Shared approval logic for command-center-api and agent-bridge
//
// Provides: listApprovals, decideApproval, triageSignal

/**
 * List approvals with auto-expiry of pending items past expires_at.
 */
async function listApprovals(supabase, { status: statusFilter = "pending" } = {}) {
  const now = new Date().toISOString();
  await supabase
    .from("agent_approvals")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", now);

  const query = supabase
    .from("agent_approvals")
    .select("*")
    .order("requested_at", { ascending: false });

  if (statusFilter === "pending") {
    query.eq("status", "pending");
  } else if (statusFilter === "recent") {
    query.in("status", ["approved", "denied", "expired"]).limit(10);
  } else {
    query.eq("status", statusFilter);
  }

  const { data } = await query.limit(50);
  return { approvals: data || [] };
}

/**
 * Approve or deny an approval request.
 */
async function decideApproval(supabase, { approval_id, decision, decided_by = "operator" }) {
  if (!approval_id || !decision) throw new Error("approval_id and decision required");
  if (!["approved", "denied"].includes(decision)) throw new Error("decision must be approved or denied");

  const { error: updateErr } = await supabase
    .from("agent_approvals")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by,
    })
    .eq("id", approval_id);

  if (updateErr) throw updateErr;
  return { decided: true };
}

/**
 * Triage an intel signal (new, newsletter, dismissed, pinned).
 * If triaged to "newsletter", dispatches a task to ops-editorial.
 */
async function triageSignal(supabase, { signal_id, triage_status }) {
  if (!signal_id || !triage_status) throw new Error("signal_id and triage_status required");
  const validStatuses = ["new", "newsletter", "dismissed", "pinned"];
  if (!validStatuses.includes(triage_status)) throw new Error("Invalid triage_status");

  const { error: updateErr } = await supabase
    .from("intel_signals")
    .update({ triage_status, triaged_at: new Date().toISOString() })
    .eq("id", signal_id);

  if (updateErr) throw updateErr;

  if (triage_status === "newsletter") {
    const { data: signal } = await supabase
      .from("intel_signals")
      .select("title, summary")
      .eq("id", signal_id)
      .single();
    if (signal) {
      await supabase.from("task_queue").insert({
        task: "Evaluate this signal for newsletter inclusion: " + signal.title + " — " + (signal.summary || ""),
        agent: "ops-editorial",
        priority: "high",
      });
    }
  }

  return { triaged: true };
}

module.exports = { listApprovals, decideApproval, triageSignal };
