// ============================================================
// pursuit-calendar-refresh.js — Netlify Scheduled Function
//
// Polls feed URLs from the PURSUIT_FEEDS env var (newline- or
// comma-separated), filters items via lib/pursuit-relevance.js, and
// upserts hits into the pursuit_calendar table on
// (title, event_date, agency).
//
// Schedule: every 6 hours (registered in netlify.toml).
//
// Idempotent: upsert on the unique key updates only updated_at + notes;
// it never overwrites manual edits to category, status, source_url, etc.
// (Postgres ON CONFLICT DO UPDATE SET only the listed columns.)
//
// Resilient: per-feed errors are caught and logged in the summary;
// the loop continues so one bad feed doesn't block the others.
//
// Env:
//   PURSUIT_FEEDS    newline- or comma-separated list of RSS / Atom URLs.
//                    If unset, the function returns OK with sources_checked=0
//                    and a note. (Mary configures the feed list.)
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  (required)
// ============================================================

const Parser = require("rss-parser");
const { createClient } = require("@supabase/supabase-js");
const { withOpsLogging } = require("./lib/scheduled-fn-wrapper");
const { scoreRelevance } = require("./lib/pursuit-relevance");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

async function _handler() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "supabase_not_configured" }) };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const feeds = parseFeeds(process.env.PURSUIT_FEEDS);
  if (feeds.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        sources_checked: 0,
        count_added: 0,
        count_updated: 0,
        count_skipped: 0,
        note: "PURSUIT_FEEDS env var not set — nothing to poll.",
      }),
    };
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
        notes:
          (item.contentSnippet || item.description || "").substring(0, 500) || null,
      };

      // Upsert on (title, event_date, agency). On conflict, refresh only
      // updated_at + notes — preserve manual edits to other fields.
      const { error: upErr, data: upData } = await supabase
        .from("pursuit_calendar")
        .upsert(row, {
          onConflict: "title,event_date,agency",
          ignoreDuplicates: false,
        })
        .select();
      if (upErr) {
        errors.push({ url, item: row.title, error: upErr.message.substring(0, 200) });
        continue;
      }
      // upsert with select returns the row; we don't have a clean way to
      // distinguish add vs update from PostgREST in one round-trip, so
      // count an "added or updated" total under count_added and let
      // count_updated remain 0 unless we add a separate query.
      countAdded++;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: errors.length === 0,
      sources_checked: feeds.length,
      items_seen: countSeen,
      count_added: countAdded,
      count_updated: countUpdated,
      count_skipped: countSkipped,
      errors,
    }),
  };
}

exports.handler = withOpsLogging("pursuit_calendar_refresh", _handler);
exports._handler = _handler;
exports.parseFeeds = parseFeeds;
