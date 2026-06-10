// ============================================================
// fetchers/api_health.js (L3 step "health")
//
// For each configured source: optionally ping an UNAUTHENTICATED public
// endpoint (latency + status) and/or measure row-lag (now - newest row)
// of the Supabase table that feeds the premium Contract Tracker. A source
// is healthy when its ping (if any) is 2xx AND its known lag is within
// threshold. Unknown lag (table/column not resolvable) is treated as
// "unknown", not "unhealthy" — we never fire a false STALE on a schema
// guess (see CLAUDE.md false-STALE sprint).
//
// SAM.gov is intentionally NOT pinged here: it has a small shared daily
// quota and this loop runs hourly. SAM-backed freshness is observed via
// the row lag of the tables its crons populate.
// ============================================================

const { hoursSince } = require("../util");

const CANDIDATE_COLS = ["updated_at", "last_updated", "last_seen_at", "checked_at", "created_at", "scan_date"];

async function pingUrl(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal, headers: { Accept: "application/json,text/html" } });
    return { http_status: res.status, latency_ms: Date.now() - t0, ok: res.ok };
  } catch (e) {
    return { http_status: 0, latency_ms: Date.now() - t0, ok: false, error: String(e && e.message).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

async function newestRowLag(supabase, table, preferredCol) {
  if (!supabase || !table) return { lag_hours: null };
  const cols = [preferredCol, ...CANDIDATE_COLS].filter(Boolean);
  for (const col of cols) {
    try {
      const { data, error } = await supabase.from(table).select(col).order(col, { ascending: false }).limit(1);
      if (error) continue;
      if (data && data[0] && data[0][col]) {
        return { lag_hours: Number(hoursSince(data[0][col]).toFixed(1)), col };
      }
      // table reachable but empty
      if (data) return { lag_hours: null, col, empty: true };
    } catch {
      /* try next candidate column */
    }
  }
  return { lag_hours: null };
}

async function run(ctx, config) {
  const sources = Array.isArray(config.sources) ? config.sources : [];
  const results = [];

  for (const s of sources) {
    const ping = s.ping_url ? await pingUrl(s.ping_url) : null;
    const lag = await newestRowLag(ctx.supabase, s.table, s.updated_col);

    const pingOk = ping ? ping.ok : true; // no ping configured => not a health factor
    const lagKnown = lag.lag_hours != null;
    const lagOk = !lagKnown || lag.lag_hours <= (s.max_lag_hours || Infinity);
    const healthy = pingOk && lagOk;

    results.push({
      source: s.name,
      http_status: ping ? ping.http_status : null,
      latency_ms: ping ? ping.latency_ms : null,
      lag_hours: lag.lag_hours,
      max_lag_hours: s.max_lag_hours ?? null,
      healthy,
      lag_known: lagKnown,
      details: { ping_ok: pingOk, lag_ok: lagOk, lag_col: lag.col, ping_error: ping && ping.error },
    });
  }

  return { sources: results };
}

module.exports = { run };
