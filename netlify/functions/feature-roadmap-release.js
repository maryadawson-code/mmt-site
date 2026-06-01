// ============================================================
// feature-roadmap-release.js — Roadmap auto-release (Sprint 6). Hourly.
//
// Ships the next due feature: flips its flag, applies any needed migration,
// triggers a rebuild, marks it shipped, and emails the subscriber list a
// "new feature is live" note. One feature per run. Idempotent.
//
// Kill switch: VOTE_AUTOPILOT=off freezes the queue (no flips, no emails).
// Retry: a failed ship leaves the row queued + bumps attempts; after 3 it
// is marked 'skipped' and Mary is alerted.
//
// BUILD-GATE NOTE: same honest limitation as feature-vote-tally.js — a
// serverless fn can't run the build in-process, so it relies on Netlify
// failing closed. shipFeature DOES roll the flag back if a step it can
// observe (migration / flag write / announcement insert) throws.
//
// selectDueFeature() + shipFeature() take injectable deps for unit tests.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { logOpsEvent } = require("./lib/ops-ledger");
const { autopilotOn } = require("./lib/vote-flags");
const { featureMeta } = require("./lib/vote-feature-meta");
const { buildFeatureAnnounceHtml } = require("./lib/email-templates");
const { sendEmail } = require("./lib/send-email");

const ANNOUNCE_FROM = "Mary at Mission Meets Tech <mary@missionmeetstech.com>";
const ANNOUNCE_REPLY = "mary@missionmeetstech.com";
const ADMIN = "mary@missionmeetstech.com";
const MAX_ATTEMPTS = 3;
// Features whose tables ship via a migration the release must ensure-applied.
const MIGRATION_FEATURES = new Set(["vote_feature.custom_watchlists", "vote_feature.recompete_alerts"]);

async function selectDueFeature(supabase, nowIso) {
  const { data, error } = await supabase
    .from("feature_roadmap")
    .select("id, vote_cycle, feature_key, rank, ship_at, status, attempts")
    .eq("status", "queued")
    .lte("ship_at", nowIso)
    .order("rank", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`roadmap select failed: ${error.message}`);
  return data || null;
}

// Default real implementations of the side-effecting steps.
function defaultDeps(supabase) {
  return {
    supabase,
    now: () => new Date().toISOString(),
    async setFlag(key, enabled, source) {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("feature_flags")
        .upsert({ key, enabled, activated_at: enabled ? nowIso : null, source, updated_at: nowIso }, { onConflict: "key" });
      if (error) throw new Error(`flag write failed: ${error.message}`);
    },
    async applyMigration() {
      const token = process.env.MIGRATION_APPLY_TOKEN;
      const base = process.env.URL || "https://missionmeetstech.com";
      if (!token) return { skipped: "no_token" };
      const r = await fetch(`${base}/.netlify/functions/apply-pending-migrations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`migration apply failed: ${r.status}`);
      return r.json().catch(() => ({}));
    },
    async triggerRebuild() {
      const hook = process.env.NETLIFY_BUILD_HOOK_URL;
      if (!hook) return false;
      await fetch(hook, { method: "POST" });
      return true;
    },
    async announce(feature, nextFeature) {
      const { subject, html, text } = buildFeatureAnnounceHtml({
        ...feature,
        next_feature_name: nextFeature ? featureMeta(nextFeature.feature_key).name : null,
        next_ship_date: nextFeature ? String(nextFeature.ship_at).slice(0, 10) : null,
      });
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("scheduled_emails").insert({
        recipient_query: "premium_active", // Mary's audience choice
        subject, html, text,
        from: ANNOUNCE_FROM, reply_to: ANNOUNCE_REPLY,
        status: "queued", scheduled_at: nowIso, created_at: nowIso,
      });
      if (error) throw new Error(`announcement queue failed: ${error.message}`);
    },
    async alert(subject, body) {
      try { await sendEmail({ to: ADMIN, from: ANNOUNCE_REPLY, subject, html: `<p>${body}</p>` }); } catch { /* non-fatal */ }
    },
    log: (event) => logOpsEvent(supabase, event).catch(() => {}),
  };
}

/**
 * Ship one roadmap row. Returns a summary. On a step failure it rolls the
 * flag back, bumps attempts, and (at MAX_ATTEMPTS) marks the row skipped.
 */
async function shipFeature(row, deps) {
  const { supabase } = deps;
  const meta = featureMeta(row.feature_key);
  try {
    // 1. Flip the flag live.
    await deps.setFlag(row.feature_key, true, row.vote_cycle);
    // 2. Ensure any backing table exists.
    if (MIGRATION_FEATURES.has(row.feature_key)) await deps.applyMigration();
    // 3. Trigger rebuild (deploy gate fails closed at Netlify).
    const rebuilt = await deps.triggerRebuild();
    // 4. Mark shipped.
    const nowIso = deps.now();
    const { error: upErr } = await supabase
      .from("feature_roadmap")
      .update({ status: "shipped", shipped_at: nowIso })
      .eq("id", row.id);
    if (upErr) throw new Error(`mark shipped failed: ${upErr.message}`);
    // 5. Announce to subscribers (next-feature teaser if one is queued).
    const { data: next } = await supabase
      .from("feature_roadmap")
      .select("feature_key, ship_at")
      .eq("vote_cycle", row.vote_cycle)
      .eq("status", "queued")
      .order("rank", { ascending: true })
      .limit(1)
      .maybeSingle();
    await deps.announce(meta, next || null);
    // 6. Log.
    await deps.log({ event_type: "ROADMAP_RELEASE", source_function: "feature-roadmap-release", severity: "info", signature: row.feature_key, details: { key: row.feature_key, rank: row.rank, cycle: row.vote_cycle, rebuilt } });
    return { shipped: row.feature_key, rank: row.rank, rebuilt };
  } catch (e) {
    // Roll back the flag and bump attempts; skip after MAX_ATTEMPTS.
    try { await deps.setFlag(row.feature_key, false, row.vote_cycle); } catch { /* best effort */ }
    const attempts = (row.attempts || 0) + 1;
    const skip = attempts >= MAX_ATTEMPTS;
    await supabase
      .from("feature_roadmap")
      .update({ status: skip ? "skipped" : "queued", attempts })
      .eq("id", row.id);
    await deps.log({ event_type: "ROADMAP_RELEASE_FAILED", source_function: "feature-roadmap-release", severity: skip ? "error" : "warning", signature: row.feature_key, details: { key: row.feature_key, attempts, skipped: skip, error: e.message } });
    if (skip) await deps.alert(`[MMT] roadmap release skipped: ${row.feature_key}`, `Failed ${attempts}x: ${e.message}. Flag rolled back; row marked skipped.`);
    return { failed: row.feature_key, attempts, skipped: skip, error: e.message };
  }
}

async function run() {
  if (!autopilotOn()) return { skipped: "autopilot_off" };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return { skipped: "no_supabase" };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const row = await selectDueFeature(supabase, new Date().toISOString());
  if (!row) return { skipped: "none_due" };
  return await shipFeature(row, defaultDeps(supabase));
}

exports.handler = withOpsLogging("feature_roadmap_release", run);
module.exports.handler = exports.handler;
module.exports.selectDueFeature = selectDueFeature;
module.exports.shipFeature = shipFeature;
module.exports.defaultDeps = defaultDeps;
