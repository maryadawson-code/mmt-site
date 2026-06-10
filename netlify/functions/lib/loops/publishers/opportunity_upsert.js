// ============================================================
// publishers/opportunity_upsert.js (L1 step "publish" — GATED on evals)
//
// Upserts the scored opportunities into loop_opportunities. This is a
// STAGED table, deliberately separate from the live opportunity_radar /
// contract tracker: a loop bug can never corrupt the premium surface.
// Mary (or a future importer) promotes reviewed rows. The loop only ever
// writes here, and only when every eval passed (the runner enforces the
// gate; this module is not called on fail/drift).
//
// first_seen_at is preserved across runs by NOT sending it in the upsert
// payload: the column's `default now()` sets it on first insert, and an
// ON CONFLICT update never touches a column that isn't in the payload.
// (Sending it per-row would let a bulk upsert's column-union wipe the
// original first_seen_at on every repeat sighting.)
// ============================================================

async function run(ctx) {
  const items = (ctx.data.score && ctx.data.score.items) || [];
  const supabase = ctx.supabase;
  if (!supabase) {
    ctx.log?.warn?.("L1 publish: no supabase client — nothing written");
    return { written: 0, skipped: "no_supabase" };
  }
  if (!items.length) {
    ctx.outputRef = "loop_opportunities:0";
    return { written: 0, inserted: 0, updated: 0 };
  }

  const ids = items.map((i) => i.notice_id).filter(Boolean);
  let existing = new Set();
  try {
    const { data } = await supabase.from("loop_opportunities").select("notice_id").in("notice_id", ids);
    existing = new Set((data || []).map((r) => r.notice_id));
  } catch (e) {
    ctx.log?.warn?.(`L1 publish: existing-id lookup failed (${e.message}) — treating all as new`);
  }

  const nowIso = new Date().toISOString();
  const rows = items
    .filter((i) => i.notice_id)
    .map((i) => ({
      notice_id: i.notice_id,
      title: i.title,
      solicitation_number: i.solicitation_number,
      type: i.type,
      agency: i.agency,
      naics: i.naics || (i._query && i._query.naics) || null,
      set_aside: i.set_aside || null,
      posted_date: i.posted_date || null,
      response_deadline: i.response_deadline || null,
      sam_url: i.sam_url || null,
      incumbents: i.incumbents || [],
      pursuit_score: i.pursuit_score ?? null,
      pursuit_verdict: i.pursuit_verdict || null,
      last_seen_at: nowIso,
      source_run_id: ctx.runId || null,
      // NOTE: first_seen_at intentionally omitted — DB default sets it on
      // insert, ON CONFLICT update leaves it untouched.
    }));

  let written = 0;
  try {
    const { error } = await supabase.from("loop_opportunities").upsert(rows, { onConflict: "notice_id" });
    if (error) throw error;
    written = rows.length;
  } catch (e) {
    // Surface as a harness error so the run is marked fail (not silently lost).
    throw new Error(`loop_opportunities upsert failed: ${e.message}`);
  }

  const inserted = rows.filter((r) => !existing.has(r.notice_id)).length;
  ctx.outputRef = `loop_opportunities:${written}`;
  return { written, inserted, updated: written - inserted };
}

module.exports = { run };
