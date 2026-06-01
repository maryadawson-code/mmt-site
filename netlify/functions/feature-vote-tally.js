// ============================================================
// feature-vote-tally.js — Day-7 brain (Sprint 5). Hourly cron.
//
// Reads the vote, ranks A–J, ships the winner (flag flip + rebuild), writes
// the full ranked release calendar to feature_roadmap, and emails Mary.
// Deterministic + idempotent. Pure logic lives in lib/vote-tally.js.
//
// BUILD-GATE NOTE (honest limitation): a serverless function cannot run
// `node build.js` + validators in-process, so it cannot synchronously roll
// back a flag on build failure. Instead it relies on Netlify's build
// failing CLOSED — a broken build never deploys, and every feature is
// pre-parity-checked behind its flag (Sprints 2–3), so a flag flip is
// low-risk. Rollback path (flip flag off + rebuild) is in the result email.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { logOpsEvent } = require("./lib/ops-ledger");
const { getFormResponses } = require("./lib/google-read");
const { autopilotOn } = require("./lib/vote-flags");
const { computeRanking, decide, extractBallots, rankPlatformAsks } = require("./lib/vote-tally");
const { buildVoteResultHtml } = require("./lib/email-templates");
const { sendEmail } = require("./lib/send-email");

const VOTE_SUBJECT = "What should we build next? You decide.";
const RESULT_TO = "mary@missionmeetstech.com";
const RESULT_FROM = "intel@missionmeetstech.com";
const DEADLINE_DAYS = 7;
const HELD_COOLDOWN_MS = 20 * 60 * 60 * 1000;

function cycleFrom(dateIso) {
  const d = new Date(dateIso);
  return `vote_${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function triggerRebuild() {
  const hook = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hook) return false;
  try {
    await fetch(hook, { method: "POST" });
    return true;
  } catch (e) {
    console.error(`[feature-vote-tally] rebuild trigger failed: ${e.message}`);
    return false;
  }
}

async function run() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return { skipped: "no_supabase" };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // 1. Find the campaign row to anchor the deadline.
  const { data: campaign, error: campErr } = await supabase
    .from("scheduled_emails")
    .select("id, created_at")
    .eq("subject", VOTE_SUBJECT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (campErr) throw new Error(`campaign lookup failed: ${campErr.message}`);
  if (!campaign) return { skipped: "no_campaign" };

  const deadline = process.env.VOTE_FORM_DEADLINE
    ? new Date(process.env.VOTE_FORM_DEADLINE)
    : new Date(Date.parse(campaign.created_at) + DEADLINE_DAYS * 86400000);
  if (Date.now() < deadline.getTime()) return { skipped: "before_deadline", deadline: deadline.toISOString() };

  const cycle = cycleFrom(campaign.created_at);

  // 2. Idempotency: roadmap already written for this cycle → done.
  const { data: existingRoadmap } = await supabase
    .from("feature_roadmap")
    .select("id")
    .eq("vote_cycle", cycle)
    .limit(1);
  if (existingRoadmap && existingRoadmap.length) return { skipped: "already_tallied", cycle };

  // 3. Read responses (fail closed — let the wrapper log + alert on throw).
  const raw = await getFormResponses({ supabase });
  const { ballots, platformAsks, suggestions } = extractBallots(raw);
  const { ranking, responseCount } = computeRanking(ballots);

  // 4. Gates.
  const quorum = parseInt(process.env.VOTE_QUORUM, 10) || 15;
  const margin = parseInt(process.env.VOTE_MARGIN, 10) || 1;
  const decision = decide(ranking, { quorum, margin, responseCount, autopilotOff: !autopilotOn() });

  const rankedAsks = rankPlatformAsks(platformAsks);

  if (!decision.ship) {
    // Throttle the held email to ~once/day.
    const { data: recentHeld } = await supabase
      .from("ops_ledger")
      .select("created_at")
      .eq("event_type", "VOTE_HELD_NOTICE")
      .order("created_at", { ascending: false })
      .limit(1);
    const recently = recentHeld && recentHeld[0] && Date.now() - Date.parse(recentHeld[0].created_at) < HELD_COOLDOWN_MS;
    if (!recently) {
      const { subject, html } = buildVoteResultHtml({
        held: true, reason: decision.reason, ranking, platformAsks: rankedAsks,
        suggestions, responseCount, quorum, tieOptions: decision.tieOptions || [],
      });
      await sendEmail({ to: RESULT_TO, from: RESULT_FROM, subject, html });
      await logOpsEvent(supabase, { event_type: "VOTE_HELD_NOTICE", source_function: "feature-vote-tally", severity: "warning", signature: decision.reason, details: { cycle, reason: decision.reason, responseCount } });
    }
    return { held: true, reason: decision.reason, responseCount, cycle };
  }

  // 5. Ship winner: flip flag + write full roadmap + trigger rebuild.
  const intervalDays = parseInt(process.env.ROADMAP_INTERVAL_DAYS, 10) || 28;
  const winner = decision.winner;
  const nowIso = new Date().toISOString();

  const { error: flagErr } = await supabase
    .from("feature_flags")
    .upsert({ key: winner.key, enabled: true, activated_at: nowIso, source: cycle, updated_at: nowIso }, { onConflict: "key" });
  if (flagErr) throw new Error(`winner flag write failed: ${flagErr.message}`);

  // Full roadmap: rank 1 shipped now; ranks 2..N queued at +interval each.
  const winnerShipMs = Date.now();
  const roadmapRows = ranking.map((r, i) => {
    const rank = i + 1;
    const shipAt = rank === 1 ? new Date(winnerShipMs) : new Date(winnerShipMs + (rank - 1) * intervalDays * 86400000);
    return {
      vote_cycle: cycle, feature_key: r.key, rank,
      ship_at: shipAt.toISOString(),
      status: rank === 1 ? "shipped" : "queued",
      shipped_at: rank === 1 ? nowIso : null,
      source: cycle,
    };
  });
  const { error: roadmapErr } = await supabase
    .from("feature_roadmap")
    .upsert(roadmapRows, { onConflict: "vote_cycle,feature_key", ignoreDuplicates: true });
  if (roadmapErr) throw new Error(`roadmap write failed: ${roadmapErr.message}`);

  const rebuilt = await triggerRebuild();

  const schedule = roadmapRows
    .filter((r) => r.rank > 1)
    .map((r) => ({ rank: r.rank, key: r.feature_key, ship_date: r.ship_at.slice(0, 10) }));

  const { subject, html } = buildVoteResultHtml({
    held: false, winner, ranking, platformAsks: rankedAsks, suggestions,
    schedule, responseCount, shipped: { deployed_at: rebuilt ? nowIso : "(no build hook configured)" },
  });
  await sendEmail({ to: RESULT_TO, from: RESULT_FROM, subject, html });

  return { shipped: true, winner: winner.key, cycle, responseCount, scheduled: schedule.length, rebuilt };
}

exports.handler = withOpsLogging("feature_vote_tally", run);
