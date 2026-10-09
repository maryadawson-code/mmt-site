// ============================================================
// lib/radar-rows.js — read every live opportunity_radar row, paginated,
// and archive a hygiene plan.
//
// PostgREST caps one request at 1000 rows and does not say so: a single
// .limit(2000) silently examined the first 1000 of a ~7,000-row table
// (scripts/cleanup-opportunity-radar.js, 2026-08-20) and the Friday
// report's fabrication scan did the same until 2026-10-09. Page with
// .range() until a short page.
// ============================================================

const { logOpsEvent } = require("./ops-ledger");
const { planRadarArchive } = require("./radar-hygiene");

const PAGE = 1000;
const LIVE_FIELDS = "id, title, solicitation_number, agency, source_url, response_deadline, scan_date, relevance_score, status, review_status";

async function fetchLiveRadarRows(supabase, { fields = LIVE_FIELDS, page = PAGE } = {}) {
  const rows = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("opportunity_radar")
      .select(fields)
      .neq("status", "archived")
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`opportunity_radar read: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return rows;
}

/**
 * Archive every row in a planRadarArchive() plan (status='archived';
 * fabricated rows also lose their bogus link). One ops_event per row plus
 * a sweep summary. `max` bounds one run so a sweep stays inside a
 * scheduled function's budget; the rest goes next run.
 */
async function archiveRadarPlan(supabase, plan, { sourceFunction, max = 300, log = console } = {}) {
  const out = { archived: 0, errors: 0, skipped_for_budget: 0, fabricated: plan.fabricated_sam_permalink.length, closed: plan.closed_past_deadline.length, duplicate: plan.duplicate_notice.length };
  const publishedFab = plan.fabricated_sam_permalink.filter((r) => r.review_status === "published").length;
  let n = 0;
  for (const [reason, list] of [["fabricated_sam_permalink", plan.fabricated_sam_permalink], ["closed_past_deadline", plan.closed_past_deadline], ["duplicate_notice", plan.duplicate_notice]]) {
    for (const r of list) {
      if (n >= max) { out.skipped_for_budget++; continue; }
      n++;
      const patch = reason === "fabricated_sam_permalink" ? { status: "archived", source_url: null } : { status: "archived" };
      const { error } = await supabase.from("opportunity_radar").update(patch).eq("id", r.id);
      if (error) { out.errors++; log.warn(`radar hygiene: update failed on #${r.id}: ${error.message}`); continue; }
      out.archived++;
      try {
        await logOpsEvent(supabase, {
          event_type: "opportunity_radar_hygiene_archived",
          source_function: sourceFunction,
          severity: reason === "fabricated_sam_permalink" ? "warn" : "info",
          details: { id: r.id, reason, title: r.title, solicitation_number: r.solicitation_number, source_url: r.source_url, response_deadline: r.response_deadline, was_published: r.review_status === "published" },
        });
      } catch (e) { log.warn(`radar hygiene: ops_event failed for #${r.id}: ${e.message}`); }
    }
  }
  try {
    await logOpsEvent(supabase, {
      event_type: "opportunity_radar_hygiene_sweep",
      source_function: sourceFunction,
      severity: plan.fabricated_sam_permalink.length > 0 ? "warn" : "info",
      details: { ...out, published_fabricated: publishedFab },
    });
  } catch (e) { log.warn(`radar hygiene: summary ops_event failed: ${e.message}`); }
  return out;
}

module.exports = { PAGE, LIVE_FIELDS, fetchLiveRadarRows, archiveRadarPlan };
