// ============================================================================
// cron-claim.js — claim-before-work for at-least-once scheduled functions.
//
// Netlify fires a scheduled function more than once on some ticks (measured
// 2026-09-14: linkedin-autopost twice a day ~38s apart since 08-20;
// ask-mmt-campaign-emails three times at 13:15 UTC, two of which each mailed
// all 70 Premium members the soft-launch note). A marker written AFTER the
// work cannot stop that: every invocation passes the "already done?" check
// while the first one is still working. The fix is one insert BEFORE the
// work plus a deterministic tiebreak, the pattern capture-corner-autosend
// has carried since the 2026-07-07 storm:
//
//   1. insert the marker row for `key` with status "claimed";
//   2. list every marker for `key` ordered by created_at, id;
//   3. proceed only if ours is the earliest. A loser relabels its own row
//      (loserEventType) so the day keeps exactly one real marker and the
//      double-fire stays visible in ops_events.
//
// ops_events has no unique index, so step 2 is what makes this safe: two
// inserts can both succeed, but they cannot both be first.
// ============================================================================

async function claimOnce(supabase, opts) {
  const { eventType, sourceFunction, key, keyField = "key", userEmail = null, details = {}, loserEventType = null } = opts || {};
  if (!eventType || !sourceFunction || !key) return { ok: false, reason: "claim_failed", error: "eventType, sourceFunction and key are required" };
  const base = { ...details, [keyField]: key };
  const row = { event_type: eventType, source_function: sourceFunction, details: { ...base, status: "claimed" } };
  if (userEmail) row.user_email = userEmail;

  const { data: claim, error } = await supabase.from("ops_events").insert(row).select("id").single();
  if (error || !claim || !claim.id) return { ok: false, reason: "claim_failed", error: error ? error.message : "insert returned no id" };

  const { data: claims, error: listErr } = await supabase
    .from("ops_events").select("id, created_at")
    .eq("event_type", eventType).filter(`details->>${keyField}`, "eq", key)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (listErr) {
    // Fail closed: we cannot prove we are first, so we do not do the work.
    await supabase.from("ops_events").update({ details: { ...base, status: "claim_unverified", error: listErr.message } }).eq("id", claim.id);
    return { ok: false, reason: "claim_failed", error: listErr.message, claimId: claim.id };
  }
  if (claims && claims.length > 1 && claims[0].id !== claim.id) {
    await supabase.from("ops_events").update({
      event_type: loserEventType || `${eventType}_lost_claim_race`,
      details: { ...base, status: "lost_claim_race", winner: claims[0].id },
    }).eq("id", claim.id);
    return { ok: false, reason: "lost_claim_race", claimId: claim.id, winner: claims[0].id };
  }
  return { ok: true, claimId: claim.id };
}

// Finish the claimed row with what actually happened (counts, ids, an error).
// `patch` may change event_type (a failed publish becomes the failure record).
async function finalizeClaim(supabase, claimId, patch) {
  if (!claimId) return false;
  const { error } = await supabase.from("ops_events").update(patch).eq("id", claimId);
  if (error) console.warn("finalizeClaim:", error.message);
  return !error;
}

module.exports = { claimOnce, finalizeClaim };
