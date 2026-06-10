// ============================================================
// runner.js — universal MMT loop executor.
//
// One declarative JSON spec per loop (./specs/<name>.json) describes a
// trigger, an ordered list of `steps`, a list of `evals`, and `alerts`.
// This runner loads a spec, runs the steps, runs the evals, GATES the
// publish step on the evals passing, writes a loop_runs row + one
// loop_evals row per eval, and alerts Mary on fail/drift.
//
//   Adding a new loop  = one JSON spec + the fn modules it references
//                        (registered in registry.js). No new orchestration.
//
// Editorial boundary (non-negotiable, see CLAUDE.md / MMT_LOOP_SYSTEM):
//   No loop in this runner writes to content/newsletter, content/podcast,
//   content/friday-briefs, or content/capture-corner. Loops detect and
//   stage DATA only. Humans publish.
//
// Local dry-run (no DB writes, no network, no LLM):
//   node netlify/functions/lib/loops/runner.js --loop opportunity_discovery --dry-run
// ============================================================

const fs = require("fs");
const path = require("path");
const { resolve: resolveFn } = require("./registry");

const SPEC_DIR = path.join(__dirname, "specs");

function loadSpec(loopName) {
  const file = path.join(SPEC_DIR, `${loopName}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`loop spec not found: ${file}`);
  }
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  if (spec.name !== loopName) {
    throw new Error(`spec.name "${spec.name}" != requested "${loopName}"`);
  }
  if (!Array.isArray(spec.steps) || !spec.steps.length) {
    throw new Error(`spec "${loopName}" has no steps`);
  }
  return spec;
}

async function readConfig(supabase, loopName) {
  const fallback = { enabled: true, max_cost_usd: 1.0, alert_email: "mary@missionmeetstech.com" };
  if (!supabase) return fallback;
  try {
    const { data } = await supabase
      .from("loop_config")
      .select("enabled, max_cost_usd, alert_email")
      .eq("loop_name", loopName)
      .maybeSingle();
    return data ? { ...fallback, ...data } : fallback;
  } catch {
    return fallback; // config table not yet applied -> safe default
  }
}

async function insertRun(supabase, row) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("loop_runs").insert(row).select("id").single();
    if (error) throw error;
    return data.id;
  } catch (e) {
    console.error(`loop runner: failed to insert loop_runs (${e.message})`);
    return null;
  }
}

async function updateRun(supabase, id, patch) {
  if (!supabase || !id) return;
  try {
    await supabase.from("loop_runs").update(patch).eq("id", id);
  } catch (e) {
    console.error(`loop runner: failed to update loop_runs ${id} (${e.message})`);
  }
}

async function insertEval(supabase, runId, name, result) {
  if (!supabase || !runId) return;
  try {
    await supabase.from("loop_evals").insert({
      run_id: runId,
      eval_name: name,
      passed: !!result.passed,
      score: result.score ?? null,
      threshold: result.threshold ?? null,
      details: result.details || {},
    });
  } catch (e) {
    console.error(`loop runner: failed to insert loop_evals (${e.message})`);
  }
}

async function safeLogOps(supabase, event) {
  if (!supabase) return;
  try {
    const { logOpsEvent } = require("../ops-ledger");
    await logOpsEvent(supabase, event);
  } catch (e) {
    console.error(`loop runner: ops log failed (${e.message})`);
  }
}

async function sendAlert(config, loopName, status, summary) {
  try {
    const { sendEmail } = require("../send-email");
    const to = config.alert_email || "mary@missionmeetstech.com";
    const failed = (summary.evals || []).filter((e) => !e.passed);
    const lines = failed.map(
      (e) => `  - ${e.eval_name}: score=${e.score} threshold=${e.threshold} ${JSON.stringify(e.details || {})}`,
    );
    await sendEmail({
      to,
      from: "intel@missionmeetstech.com",
      subject: `[MMT Loop ${status.toUpperCase()}] ${loopName}`,
      text:
        `Loop "${loopName}" finished with status=${status}.\n\n` +
        `Failed/triggered evals:\n${lines.join("\n") || "  (none — see run row)"}\n\n` +
        `run_id: ${summary.runId || "n/a"}\ncost_usd: ${summary.cost?.toFixed?.(4) || 0}\n` +
        `This is a detection-only notice. No content was published; Mary acts on it.`,
    });
  } catch (e) {
    console.error(`loop runner: alert send failed (${e.message})`);
  }
}

/**
 * Execute a loop end to end.
 * @param {string} loopName
 * @param {object} [opts] { trigger, dryRun, supabase, log }
 * @returns {Promise<object>} run summary
 */
async function runLoop(loopName, opts = {}) {
  const { trigger = "manual", dryRun = false, supabase = null, log = console } = opts;
  const spec = loadSpec(loopName);
  const config = await readConfig(supabase, loopName);

  if (!config.enabled) {
    log.info?.(`loop "${loopName}" disabled in loop_config — skipping`);
    await insertRun(supabase, { loop_name: loopName, status: "skipped", trigger, error: "disabled" });
    return { loopName, status: "skipped", reason: "disabled" };
  }

  const publishSteps = spec.steps.filter((s) => s.publish === true).map((s) => s.id);
  const workSteps = spec.steps.filter((s) => s.publish !== true);

  if (dryRun) {
    log.info?.(`\n=== DRY RUN: ${loopName} (v${spec.version || 1}) ===`);
    log.info?.(`trigger: ${JSON.stringify(spec.trigger)}`);
    log.info?.(`steps:`);
    spec.steps.forEach((s) => log.info?.(`  - ${s.id} -> ${s.fn}${s.publish ? "  [gated publish]" : ""}`));
    log.info?.(`evals (gate the publish step):`);
    (spec.evals || []).forEach((e) => log.info?.(`  - ${e.name} -> ${e.fn}`));
    log.info?.(`max_cost_usd: ${config.max_cost_usd}`);
    log.info?.(`No steps executed, no network, no DB mutations.\n`);
    // Honor the spec's gate-check: a dry run leaves exactly one ledger row.
    await insertRun(supabase, {
      loop_name: loopName,
      status: "skipped",
      trigger,
      ended_at: new Date().toISOString(),
      error: "dry-run",
    });
    return { loopName, status: "skipped", reason: "dry-run", plan: spec.steps.map((s) => s.id) };
  }

  const runId = await insertRun(supabase, { loop_name: loopName, status: "running", trigger });
  const ctx = { loopName, trigger, dryRun, supabase, runId, config, data: {}, cost: 0, log };

  try {
    // --- work steps (everything except the gated publish) ---
    for (const step of workSteps) {
      if (ctx.cost > config.max_cost_usd) {
        log.warn?.(`loop "${loopName}": cost cap ${config.max_cost_usd} exceeded before "${step.id}" — halting`);
        await updateRun(supabase, runId, {
          status: "skipped",
          ended_at: new Date().toISOString(),
          cost_usd: ctx.cost,
          error: "cost_cap_exceeded",
        });
        return { loopName, status: "skipped", reason: "cost_cap", runId, cost: ctx.cost };
      }
      ctx.data[step.id] = await resolveFn(step.fn)(ctx, step);
    }

    // --- evals (gate the publish step) ---
    const evalResults = [];
    let allPassed = true;
    let anyDrift = false;
    for (const ev of spec.evals || []) {
      const result = await resolveFn(ev.fn)(ctx, ev);
      await insertEval(supabase, runId, ev.name, result);
      evalResults.push({ eval_name: ev.name, ...result });
      if (!result.passed) allPassed = false;
      if (result.drift) anyDrift = true;
    }

    const status = anyDrift ? "drift" : allPassed ? "pass" : "fail";

    // --- gated publish: only when every eval passes ---
    if (status === "pass") {
      for (const step of spec.steps.filter((s) => s.publish === true)) {
        ctx.data[step.id] = await resolveFn(step.fn)(ctx, step);
      }
    } else {
      log.warn?.(`loop "${loopName}": status=${status} — publish steps [${publishSteps.join(", ")}] SKIPPED`);
    }

    await updateRun(supabase, runId, {
      status,
      ended_at: new Date().toISOString(),
      cost_usd: ctx.cost,
      input_hash: ctx.inputHash || null,
      output_ref: ctx.outputRef || null,
    });

    const opsType = status === "pass" ? "LOOP_PASS" : status === "drift" ? "LOOP_DRIFT" : "LOOP_FAIL";
    await safeLogOps(supabase, {
      event_type: opsType,
      source_function: `loop:${loopName}`,
      severity: status === "pass" ? "info" : status === "drift" ? "warn" : "error",
      signature: `loop_${status}`,
      details: { runId, cost: ctx.cost, evals: evalResults },
    });

    const summary = { loopName, status, runId, cost: ctx.cost, evals: evalResults };
    if ((status === "fail" && spec.alerts?.on_fail) || (status === "drift" && spec.alerts?.on_drift)) {
      await sendAlert(config, loopName, status, summary);
    }
    log.info?.(`loop "${loopName}" -> ${status} (cost $${ctx.cost.toFixed(4)}, run ${runId})`);
    return summary;
  } catch (err) {
    await updateRun(supabase, runId, {
      status: "fail",
      ended_at: new Date().toISOString(),
      cost_usd: ctx.cost,
      error: String(err && err.message).slice(0, 1000),
    });
    await safeLogOps(supabase, {
      event_type: "HARNESS_FAILURE",
      source_function: `loop:${loopName}`,
      severity: "error",
      signature: "loop_threw",
      details: { runId, error: err && err.message },
    });
    throw err; // surface to scheduled-fn-wrapper's dead-man switch
  }
}

module.exports = { runLoop, loadSpec };

// --- CLI -------------------------------------------------------------------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const loopName = get("--loop");
  const dryRun = argv.includes("--dry-run");
  if (!loopName) {
    console.error("usage: node runner.js --loop <name> [--dry-run]");
    process.exit(2);
  }
  let supabase = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  } else if (!dryRun) {
    console.error("SUPABASE_URL/SUPABASE_SERVICE_KEY not set — only --dry-run works locally");
    process.exit(2);
  }
  runLoop(loopName, { trigger: "manual", dryRun, supabase })
    .then((s) => {
      console.log(JSON.stringify(s, null, 2));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
