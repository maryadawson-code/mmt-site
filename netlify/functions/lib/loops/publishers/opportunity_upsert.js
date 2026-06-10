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
// first_seen_at is preserved across runs; only last_seen_at + score
// fields update on a repeat sighting.
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
    .map((i) => {
      const base = {
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
      };
      if (!existing.has(i.notice_id)) base.first_seen_at = nowIso;
      return base;
    });

  let written = 0;
  try {
    const { error } = await supabase.from("loop_opportunities").upsert(rows, { onConflict: "notice_id" });
    if (error) throw error;
    written = rows.length;
  } catch (e) {
    // Surface as a harness error so the run is marked fail (not silently lost).
    throw new Error(`loop_opportunities upsert failed: ${e.message}`);
  }

  const inserted = rows.filter((r) => r.first_seen_at).length;
  ctx.outputRef = `loop_opportunities:${written}`;
  return { written, inserted, updated: written - inserted };
}

module.exports = { run };
