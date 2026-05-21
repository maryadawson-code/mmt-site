// ============================================================
// pursuit-calendar-refresh.js — Netlify Scheduled Function
//
// Two parallel paths, both additive:
//
//   1. RSS path. Polls feed URLs from PURSUIT_FEEDS env var
//      (newline- or comma-separated), filters via lib/pursuit-relevance.js,
//      upserts hits with source_system='rss:<feed>'.
//
//   2. SAM.gov path (MMT-PC-01). Runs the 5-query matrix below in
//      parallel via lib/sam-gov-opportunities.js, filters each result to
//      response_deadline BETWEEN today AND today+90d, upserts with
//      source_system='sam.gov'. SAM_GOV_API_KEY required; without it
//      the SAM path is skipped (RSS path continues).
//
// Both paths upsert into pursuit_calendar on
// (title, event_date, agency) and never overwrite manually-edited
// rows (PostgREST upsert only refreshes the columns we pass).
//
// Schedule: every 6 hours (registered in netlify.toml).
// Idempotent. Resilient: per-query / per-feed errors are caught and
// logged in the summary so one bad source never blocks the others.
//
// Env:
//   PURSUIT_FEEDS                newline- or comma-separated RSS / Atom URLs.
//                                If unset, the RSS path is a no-op.
//   SAM_GOV_API_KEY              SAM.gov public API key. If unset, SAM path
//                                is skipped (RSS path still runs).
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  required.
// ============================================================

const Parser = require("rss-parser");
const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { scoreRelevance } = require("./lib/pursuit-relevance");
const { handleSamSearchOpportunities } = require("./lib/sam-gov-opportunities");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// SAM.gov query matrix — MMT-PC-01. Run in parallel; each result is
// filtered to response_deadline within the next 90 days before upsert.
const SAM_QUERIES = [
  { keyword: null,                                                   agency: "Defense Health Agency",         naics: "541512" },
  { keyword: null,                                                   agency: "Department of Veterans Affairs", naics: "541512" },
  { keyword: "EHR OR MHS GENESIS OR DHMSM OR HCDS",                  agency: null,                            naics: "541512" },
  { keyword: "health",                                               agency: "ARPA-H",                        naics: "541715" },
  { keyword: "health IT OR ambient scribe OR telehealth",            agency: "DISA",                          naics: "541512" },
];

function parseFeeds(raw) {
  if (!raw) return [];
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isoDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

// Map a SAM.gov agency string (e.g., "DEPT OF DEFENSE.DEPT OF THE ARMY..."
// or "DEPARTMENT OF VETERANS AFFAIRS.VETERANS HEALTH ADMINISTRATION") to
// a short canonical label so the calendar groups rows under the agency
// the subscriber expects to see.
function canonicalAgency(samFullPath, queryAgency) {
  const fp = String(samFullPath || "").toUpperCase();
  if (fp.includes("DEFENSE HEALTH AGENCY")) return "DHA";
  if (fp.includes("VETERANS AFFAIRS") || fp.includes("VETERANS HEALTH")) return "VA";
  if (fp.includes("ARPA-H") || fp.includes("ADVANCED RESEARCH PROJECTS AGENCY FOR HEALTH")) return "ARPA-H";
  if (fp.includes("DEFENSE INFORMATION SYSTEMS AGENCY") || fp.includes("DISA")) return "DISA";
  return queryAgency || (samFullPath ? samFullPath.split(".").pop().trim() : null);
}

// Classify a SAM.gov opportunity type into a pursuit_calendar category.
function categorize(samType) {
  const t = String(samType || "").toLowerCase();
  if (t.includes("sources sought") || t.includes("rfi") || t.includes("special notice")) return "rfi";
  if (t.includes("solicitation") || t.includes("combined synopsis") || t.includes("presolicitation")) return "deadline";
  if (t.includes("award")) return "award";
  return "deadline";
}

async function runRssPath(supabase) {
  const feeds = parseFeeds(process.env.PURSUIT_FEEDS);
  if (feeds.length === 0) {
    return { sources_checked: 0, count_added: 0, count_updated: 0, count_skipped: 0, items_seen: 0, errors: [], note: "PURSUIT_FEEDS env var not set — nothing to poll." };
  }

  const parser = new Parser({ timeout: 15000 });
  const errors = [];
  let countAdded = 0;
  let countUpdated = 0;
  let countSkipped = 0;
  let countSeen = 0;

  for (const url of feeds) {
    let feed;
    try {
      feed = await parser.parseURL(url);
    } catch (feedErr) {
      errors.push({ url, error: String(feedErr.message || feedErr).substring(0, 200) });
      continue;
    }

    for (const item of feed.items || []) {
      countSeen++;
      const decision = scoreRelevance(item);
      if (!decision.relevant) {
        countSkipped++;
        continue;
      }
      const eventDate = isoDate(item.isoDate || item.pubDate);
      if (!eventDate) {
        countSkipped++;
        continue;
      }
      const row = {
        title: (item.title || "").substring(0, 240),
        event_date: eventDate,
        agency: decision.agency || null,
        vehicle: null,
        category: decision.category,
        status: "active",
        source_url: item.link || null,
        source_system: `rss:${url}`,
        notes: (item.contentSnippet || item.description || "").substring(0, 500) || null,
      };

      const { error: upErr } = await supabase
        .from("pursuit_calendar")
        .upsert(row, { onConflict: "title,event_date,agency", ignoreDuplicates: false })
        .select();
      if (upErr) {
        errors.push({ url, item: row.title, error: upErr.message.substring(0, 200) });
        continue;
      }
      countAdded++;
    }
  }

  return { sources_checked: feeds.length, items_seen: countSeen, count_added: countAdded, count_updated: countUpdated, count_skipped: countSkipped, errors };
}

async function runSamPath(supabase) {
  if (!process.env.SAM_GOV_API_KEY) {
    return { queries_checked: 0, items_seen: 0, count_added: 0, count_skipped: 0, errors: [], note: "SAM_GOV_API_KEY not set — SAM.gov path skipped." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const ninetyOut = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  // Fire all 5 queries in parallel. Each settles independently; one
  // failure (rate limit, bad agency name, transient 5xx) never blocks
  // the others.
  const results = await Promise.allSettled(
    SAM_QUERIES.map((q) =>
      handleSamSearchOpportunities({
        keyword: q.keyword || undefined,
        agency: q.agency || undefined,
        naics: q.naics || undefined,
        limit: 25,
        posted_from_days_ago: 90,
      }).then((res) => ({ query: q, items: res.data?.items || [] }))
    )
  );

  const errors = [];
  let itemsSeen = 0;
  let countAdded = 0;
  let countSkipped = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      errors.push({ query: SAM_QUERIES[i], error: String(r.reason && r.reason.message || r.reason).substring(0, 200) });
      continue;
    }
    const { query, items } = r.value;
    for (const item of items) {
      itemsSeen++;
      const deadline = isoDate(item.response_deadline);
      // Filter to deadlines within the next 90 days (inclusive of today;
      // a deadline of "today" still belongs on the page until the
      // sweep runs).
      if (!deadline || deadline < today || deadline > ninetyOut) {
        countSkipped++;
        continue;
      }
      const row = {
        title: (item.title || "").substring(0, 240),
        event_date: deadline,
        agency: canonicalAgency(item.agency, query.agency),
        vehicle: item.solicitation_number || null,
        category: categorize(item.type),
        status: "active",
        source_url: item.sam_url || null,
        source_system: "sam.gov",
        notes: [
          item.solicitation_number ? `Sol: ${item.solicitation_number}` : null,
          item.naics ? `NAICS ${item.naics}` : null,
          item.set_aside ? `Set-aside: ${item.set_aside}` : null,
        ].filter(Boolean).join(" · ").substring(0, 500) || null,
      };
      const { error: upErr } = await supabase
        .from("pursuit_calendar")
        .upsert(row, { onConflict: "title,event_date,agency", ignoreDuplicates: false })
        .select();
      if (upErr) {
        errors.push({ query, item: row.title, error: upErr.message.substring(0, 200) });
        continue;
      }
      countAdded++;
    }
  }

  return { queries_checked: SAM_QUERIES.length, items_seen: itemsSeen, count_added: countAdded, count_skipped: countSkipped, errors };
}

async function _handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // RSS first, then SAM.gov. Both paths are additive; neither blocks
  // the other. Each catches its own errors so a failure on one path
  // does not abort the other.
  let rss = { sources_checked: 0, count_added: 0, count_skipped: 0, items_seen: 0, errors: [] };
  let sam = { queries_checked: 0, count_added: 0, count_skipped: 0, items_seen: 0, errors: [] };
  try { rss = await runRssPath(supabase); } catch (err) { rss.errors = [{ path: "rss", error: String(err.message || err).substring(0, 200) }]; }
  try { sam = await runSamPath(supabase); } catch (err) { sam.errors = [{ path: "sam.gov", error: String(err.message || err).substring(0, 200) }]; }

  const errors = [...(rss.errors || []), ...(sam.errors || [])];
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: errors.length === 0,
      rss,
      sam,
      errors,
    }),
  };
}

exports.handler = withOpsLogging("pursuit_calendar_refresh", _handler);
exports._handler = _handler;
exports.parseFeeds = parseFeeds;
exports.canonicalAgency = canonicalAgency;
exports.categorize = categorize;
exports.SAM_QUERIES = SAM_QUERIES;
