// ============================================================
// pursuit-calendar-seed-refresh.js — weekly Netlify Scheduled Function
//
// MMT-PC-01. Mondays 10:00 UTC (06:00 ET). Reads the live Supabase
// pursuit_calendar table where status='active' AND event_date is in
// the next 90 days, ORDER BY event_date, and writes the result into
// data/premium/pursuit-calendar-seed.json via the GitHub Contents API
// (PUT, branch=main). _meta.last_curated_at is stamped to today, and
// _meta.curator is set to "automated".
//
// Once the commit lands, the function POSTs NETLIFY_BUILD_HOOK_URL to
// trigger a rebuild so the static /premium/calendar surface picks up
// the new seed without waiting for the next 6h refresh tick.
//
// Env (all required):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  — read pursuit_calendar.
//   GITHUB_TOKEN                        — fine-grained PAT with
//     contents:write on this repo. Used as Bearer auth on the
//     GitHub Contents API request.
//   GITHUB_REPO                         — "owner/name" (defaults to
//     "maryadawson-code/mmt-site").
//   NETLIFY_BUILD_HOOK_URL              — Netlify build hook to fire
//     after the commit lands. If unset, the function logs a warning
//     and returns OK (the commit itself is enough to trigger Netlify's
//     git-based auto-deploy on the next push, but the explicit hook
//     reduces lag).
//
// Idempotent: if the seed file content hash matches what's on disk in
// GitHub, no commit is made (GitHub Contents API would reject a
// matching write anyway, but we short-circuit so the run is cheap).
//
// Failures: any error surfaces in the response body + ops_events log
// via the withOpsLogging wrapper; the function NEVER throws past the
// wrapper so the cron schedule keeps firing.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");

const SEED_PATH_IN_REPO = "data/premium/pursuit-calendar-seed.json";
const DEFAULT_REPO = "maryadawson-code/mmt-site";

async function readPursuitsFromSupabase(supabase) {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyOut = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("pursuit_calendar")
    .select("id, title, event_date, end_date, agency, vehicle, category, status, source_url, source_system, notes, updated_at")
    .eq("status", "active")
    .gte("event_date", today)
    .lte("event_date", ninetyOut)
    .order("event_date", { ascending: true });
  if (error) throw new Error(`supabase: ${error.message}`);
  return data || [];
}

function toSeedRow(r) {
  // Project Supabase shape onto the seed JSON shape. ref + event_time_et +
  // status_override don't exist as Supabase columns yet; preserve the
  // optional fields so downstream renderers continue to work after a
  // round-trip.
  return {
    id: r.id || undefined,
    title: r.title,
    event_date: r.event_date,
    end_date: r.end_date || undefined,
    event_time_et: null,
    agency: r.agency || null,
    vehicle: r.vehicle || null,
    ref: null,
    category: r.category,
    status_override: null,
    source_url: r.source_url || null,
    source_system: r.source_system || "manual",
    notes: r.notes || null,
  };
}

function buildSeedJson(rows) {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyOut = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  return {
    _meta: {
      description: "Pursuit Calendar seed events. Source of truth when Supabase pursuit_calendar table is unreachable. Times are America/New_York (ET). Status is computed dynamically by the renderer for date-based events; explicit status values (Protest, Protest Due, Watch, Needs Source) are honored as-is.",
      last_curated_at: today,
      curator: "automated",
      timezone: "America/New_York",
      window_start: today,
      window_end: ninetyOut,
    },
    events: rows.map(toSeedRow),
  };
}

async function githubGetFile(repo, path, token) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=main`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return { sha: null, content: null };
  if (!res.ok) throw new Error(`github GET ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const content = Buffer.from(json.content || "", "base64").toString("utf8");
  return { sha: json.sha, content };
}

async function githubPutFile(repo, path, token, { content, sha, message, branch }) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: branch || "main",
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`github PUT ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function triggerNetlifyBuild() {
  const hook = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hook) return { skipped: "no_build_hook" };
  const res = await fetch(hook, { method: "POST" });
  if (!res.ok) throw new Error(`netlify build hook: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return { triggered: true, status: res.status };
}

async function _handler() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO || DEFAULT_REPO;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  if (!GITHUB_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "github_token_not_configured" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const rows = await readPursuitsFromSupabase(supabase);
  const seed = buildSeedJson(rows);
  const newContent = JSON.stringify(seed, null, 2) + "\n";

  const current = await githubGetFile(GITHUB_REPO, SEED_PATH_IN_REPO, GITHUB_TOKEN);
  const unchanged = current.content && current.content === newContent;
  if (unchanged) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, unchanged: true, row_count: rows.length, last_curated_at: seed._meta.last_curated_at }) };
  }

  const commit = await githubPutFile(GITHUB_REPO, SEED_PATH_IN_REPO, GITHUB_TOKEN, {
    content: newContent,
    sha: current.sha || undefined,
    message: `chore(pursuit-calendar): weekly seed refresh — ${seed._meta.last_curated_at} (${rows.length} pursuits)`,
    branch: "main",
  });

  let build;
  try { build = await triggerNetlifyBuild(); }
  catch (err) { build = { error: String(err.message || err).slice(0, 200) }; }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      row_count: rows.length,
      last_curated_at: seed._meta.last_curated_at,
      commit_sha: commit && commit.commit && commit.commit.sha,
      build,
    }),
  };
}

exports.handler = withOpsLogging("pursuit_calendar_seed_refresh", _handler);
exports._handler = _handler;
exports.buildSeedJson = buildSeedJson;
exports.toSeedRow = toSeedRow;
