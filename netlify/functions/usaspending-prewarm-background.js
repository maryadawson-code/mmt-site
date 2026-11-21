// ============================================================
// usaspending-prewarm-background.js — nightly USASpending warm for Ask MMT
//
// 2026-09-15: USASpending answered cold queries in 3s to 40s+, and Ask MMT
// gives its award search 7s. The first subscriber to ask about a vehicle on
// a given day paid for the cold query and got "USASpending.gov: timeout".
// This worker asks USASpending, under a long bound, every query a question
// about each known vehicle sends (lib/known-vehicles.js, built with the same
// federalQueryFor() the assistant uses, so the cache keys match), and
// lib/federal-data-apis.js saves the answers for the UTC day. Then every
// department's spending totals, so no department's first ask is cold.
//
// Also finishes one subscriber question whose award search or totals call
// timed out (lib/usaspending-handoff.js POSTs { questions: [question] }), so
// the retry is answered from the saved copy.
//
// USASpending only: never SAM.gov (10 requests a day, held for subscribers).
// Idempotent without a claim: a query already answered today is served from
// the cache with no request, so a double-fired tick (or a repeated handoff)
// sends nothing. Triggered nightly by usaspending-prewarm (netlify.toml).
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { connectEvent } = require("./lib/fetch-cache");
const { VEHICLES } = require("./lib/known-vehicles");
const { federalQueryFor } = require("./lib/premium-assistant");
const { warmUSASpending, warmAgencyTotals } = require("./lib/federal-data-apis");
const { usaspendingDepartments } = require("./lib/federal-agencies");

const EVENT_TYPE = "usaspending_prewarm";
const SOURCE_FN = "usaspending-prewarm-background";
// Two at a time: USASpending is the thing that is slow; do not pile on.
const CONCURRENCY = 2;
// A cold query measured past 40s; the worker has 15 minutes. The nightly run
// is 16 vehicles two at a time, so 60s each keeps it under 9 minutes.
const NIGHTLY_MS = 60000;
const HANDOFF_MS = 180000;
const MAX_HANDOFF_QUESTIONS = 3;
// Department totals measured 0.5s to 18s cold (2026-09-15). Seven departments
// one at a time at 30s each adds at most 3.5 minutes to the vehicle run.
const TOTALS_MS = 30000;
const WARMED = /^(fetched|cached)$/;

// A vehicle is asked by its canonical name: federalQueryFor() gives a
// question about the vehicle the same federal args, so the same keys.
async function warmAll({ questions = VEHICLES.map((v) => v.canonical), warm = warmUSASpending, queryFor = federalQueryFor, ms = NIGHTLY_MS } = {}) {
  const queue = [...questions];
  const results = [];
  async function worker() {
    while (queue.length) {
      const question = queue.shift();
      const started = Date.now();
      try {
        const status = await warm(queryFor(question).federalArgs, { ms });
        results.push({ question, ms: Date.now() - started, ...status });
      } catch (e) {
        results.push({ question, ms: Date.now() - started, awards: `error (${e && e.message ? e.message : String(e)})` });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const failed = results.filter((r) => !WARMED.test(String(r.awards)));
  return { queries: results.length, failed: failed.length, results };
}

// Every department's totals, after the vehicles: the five departments a
// vehicle belongs to are already saved and cost no request; DHS and SSA are
// the ones this adds. A department whose totals did not warm is counted, so
// a failed night shows in ops_events instead of as cold asks all day.
async function warmTotals({ departments = usaspendingDepartments(), warm = warmAgencyTotals, ms = TOTALS_MS } = {}) {
  const results = [];
  for (const agency of departments) {
    try {
      results.push(await warm(agency, { ms }));
    } catch (e) {
      results.push({ agency, agency_totals: `error (${e && e.message ? e.message : String(e)})` });
    }
  }
  return { departments: results.length, failed: results.filter((r) => !WARMED.test(String(r.agency_totals))).length, results };
}

/** Pure: handoff questions from the POST body; none means the nightly vehicle warm. */
function handoffQuestions(event) {
  try {
    const body = JSON.parse((event && event.body) || "{}");
    if (!Array.isArray(body.questions)) return [];
    return body.questions
      .filter((q) => typeof q === "string" && q.trim().length >= 3)
      .map((q) => q.trim().slice(0, 500))
      .slice(0, MAX_HANDOFF_QUESTIONS);
  } catch {
    return [];
  }
}

exports.handler = async (event) => {
  connectEvent(event);
  const started = Date.now();
  const questions = handoffQuestions(event);
  const mode = questions.length ? "handoff" : "nightly";
  const summary = { mode, ...(await warmAll(questions.length ? { questions, ms: HANDOFF_MS } : {})) };
  if (mode === "nightly") {
    summary.totals = await warmTotals();
    summary.failed += summary.totals.failed;
  }
  console.log(`[usaspending-prewarm] ${mode}: ${summary.queries} queries, ${summary.failed} not warmed`, JSON.stringify(summary.results), summary.totals ? JSON.stringify(summary.totals.results) : "");

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { error } = await supabase.from("ops_events").insert({
      event_type: EVENT_TYPE,
      source_function: SOURCE_FN,
      severity: summary.failed ? "warning" : "info",
      duration_ms: Math.max(Date.now() - started, 1),
      details: summary,
    });
    if (error) console.error("usaspending-prewarm ops_events insert:", error.message);
  }
  return { statusCode: 200, body: JSON.stringify({ mode, queries: summary.queries, failed: summary.failed }) };
};

exports.warmAll = warmAll;
exports.warmTotals = warmTotals;
exports.handoffQuestions = handoffQuestions;
