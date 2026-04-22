#!/usr/bin/env node
// ============================================================
// batch-replay-stuck-orders.js — autonomous stuck-order replay runner
//
// Runs the replay endpoint for every stuck, paid, real-customer
// MarketPulse order in the last 45 days. Canary-gated, 60s-paced,
// 5 kill-switches. Writes per-order outcome to reports/.
//
// Usage (requires ADMIN_EMAILS, SUPABASE_URL, SUPABASE_SERVICE_KEY,
// STRIPE_SECRET_KEY, and optionally SITE_URL in env):
//
//   REPLAY_ADMIN_EMAIL=mary@missionmeetstech.com \
//     node scripts/batch-replay-stuck-orders.js
//
// Kill-switches (any triggers a clean exit with a report):
//   - 3 consecutive failures
//   - replay endpoint 5xx rate > 50% over ≥4 attempts
//   - Stripe API 5xx 3 times in a row
//   - total elapsed > 45 min
// ============================================================

const fs = require("fs");
const path = require("path");
const https = require("https");

const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
const Stripe = require(path.join(__dirname, "..", "node_modules", "stripe"));

// --- config ---
const SITE_URL = process.env.SITE_URL || "https://missionmeetstech.com";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const ADMIN_EMAIL = process.env.REPLAY_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "mary@missionmeetstech.com";
const REPORTS_DIR = path.join(__dirname, "..", "reports");

const MAX_CONSECUTIVE_FAILURES = 3;
const ENDPOINT_5XX_THRESHOLD_RATE = 0.5;
const ENDPOINT_5XX_MIN_ATTEMPTS = 4;
const STRIPE_5XX_THRESHOLD = 3;
const MAX_ELAPSED_MS = 45 * 60 * 1000;
const BATCH_PACING_MS = 60 * 1000;
const CANARY_POST_WAIT_MS = 30 * 1000;
const BATCH_POST_WAIT_MS = 15 * 1000;
const DELIVERY_POLL_INTERVAL_MS = 15 * 1000;
const DELIVERY_POLL_MAX_MS = 6 * 60 * 1000;
const DATE_STAMP = new Date().toISOString().substring(0, 10).replace(/-/g, "");

// --- test-account denylist ---
const DENY_EMAILS = new Set([
  "maryadawson@gmail.com",
  "mary@missionmeetstech.com",
  "test@test.com",
  "ryan.and@vensaillc.com",
  "ranjit.and@gmail.com",
]);
const DENY_PATTERNS = [
  /@missionmeetstech\.com$/i,
  /test/i,
  /^e2e/i,
  /^golivetest/i,
  /^modeltest/i,
  /^stripe-test-/i,
  /@example\.com$/i,
];

function isTestEmail(email) {
  if (!email) return true;
  const lower = email.toLowerCase().trim();
  if (DENY_EMAILS.has(lower)) return true;
  return DENY_PATTERNS.some((rx) => rx.test(lower));
}

// --- output helpers ---
function ensureReports() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}
function writeReport(name, content) {
  ensureReports();
  const p = path.join(REPORTS_DIR, name);
  fs.writeFileSync(p, content);
  return p;
}
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- HTTP to replay endpoint ---
function postReplay({ order_id, dry_run }) {
  const url = `${SITE_URL}/.netlify/functions/replay-tactical-brief-background`;
  const body = JSON.stringify({ order_id, dry_run });
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "x-admin-email": ADMIN_EMAIL,
        },
      },
      (resp) => {
        let data = "";
        resp.on("data", (c) => { data += c; });
        resp.on("end", () => {
          let parsed = null;
          try { parsed = JSON.parse(data || "{}"); } catch { parsed = { _raw: data }; }
          resolve({ status: resp.statusCode, body: parsed });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(60000, () => { req.destroy(new Error("replay endpoint timeout after 60s")); });
    req.write(body);
    req.end();
  });
}

// --- delivery verification poll ---
async function pollForDelivery(supabase, order_id, maxMs) {
  const deadline = Date.now() + maxMs;
  let last = null;
  while (Date.now() < deadline) {
    const { data: row } = await supabase
      .from("marketpulse_orders")
      .select("id, workflow_state, status, report_url, error_message")
      .eq("id", order_id)
      .single();
    last = row;
    if (row) {
      if (row.workflow_state === "delivered" && row.report_url) {
        return { delivered: true, row };
      }
      if (row.workflow_state === "failed" || row.status === "failed") {
        return { delivered: false, row, reason: "workflow_state_failed" };
      }
    }
    await sleep(DELIVERY_POLL_INTERVAL_MS);
  }
  return { delivered: false, row: last, reason: "poll_timeout" };
}

async function verifyReplayDeliveredEvent(supabase, order_id, sinceIso) {
  const { data: events } = await supabase
    .from("ops_events")
    .select("event_type, created_at, details")
    .gte("created_at", sinceIso)
    .or(`affected_entity.eq.${order_id},details->>order_id.eq.${order_id}`)
    .order("created_at", { ascending: false })
    .limit(20);
  const has = (events || []).some((e) => e.event_type === "REPLAY_DELIVERED");
  return { has, events: events || [] };
}

// --- main ---
async function main() {
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    writeReport(`batch-aborted-no-auth-${DATE_STAMP}.md`,
      `# Batch aborted — missing Supabase credentials\n\nSUPABASE_URL or SUPABASE_SERVICE_KEY not set in env.\n`);
    log("ABORT: Supabase credentials missing");
    process.exit(1);
  }
  if (!STRIPE_SECRET_KEY) {
    writeReport(`batch-aborted-no-auth-${DATE_STAMP}.md`,
      `# Batch aborted — missing Stripe credentials\n\nSTRIPE_SECRET_KEY not set in env.\n`);
    log("ABORT: Stripe credentials missing");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // 1. Load candidate orders
  const since = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString();
  const { data: allStuck, error: loadErr } = await supabase
    .from("marketpulse_orders")
    .select("id, session_id, email, name, company, topic, audience, additional_context, amount_paid, workflow_state, status, created_at, report_url")
    .neq("workflow_state", "delivered")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (loadErr) {
    writeReport(`batch-aborted-${DATE_STAMP}.md`, `# Batch aborted — Supabase query failed\n\n${loadErr.message}\n`);
    log(`ABORT: Supabase query failed: ${loadErr.message}`);
    process.exit(1);
  }
  const unfiltered = allStuck || [];
  log(`Loaded ${unfiltered.length} candidate orders (state!=delivered, last 45d).`);

  // 2. Filter test accounts
  const testFiltered = unfiltered.filter((o) => !isTestEmail(o.email));
  const testExcluded = unfiltered.filter((o) => isTestEmail(o.email));
  log(`After test-account filter: ${testFiltered.length} real-customer candidates (excluded ${testExcluded.length} test accounts).`);

  // 3. Write worklist report BEFORE any Stripe/replay calls
  const worklistLines = [
    `# Replay Worklist — ${startedIso}`,
    ``,
    `## Unfiltered candidates (state != delivered, last 45d)`,
    ``,
    `Total: ${unfiltered.length}`,
    ``,
    `| order_id | email | workflow_state | topic_preview | created_at | test_account |`,
    `|---|---|---|---|---|---|`,
    ...unfiltered.map((o) => `| ${o.id.substring(0, 8)} | ${o.email} | ${o.workflow_state} | ${(o.topic || "").substring(0, 50).replace(/\|/g, "\\|")} | ${o.created_at.substring(0, 19)} | ${isTestEmail(o.email) ? "YES" : "no"} |`),
    ``,
    `## Filtered real-customer candidates`,
    ``,
    `Total: ${testFiltered.length}`,
    ``,
    `| order_id | email | workflow_state | topic_preview | created_at | amount_paid |`,
    `|---|---|---|---|---|---|`,
    ...testFiltered.map((o) => `| ${o.id.substring(0, 8)} | ${o.email} | ${o.workflow_state} | ${(o.topic || "").substring(0, 80).replace(/\|/g, "\\|")} | ${o.created_at.substring(0, 19)} | ${o.amount_paid} |`),
    ``,
  ].join("\n");
  const worklistPath = writeReport(`replay-worklist-${DATE_STAMP}.md`, worklistLines);
  log(`Worklist written: ${worklistPath}`);

  // 4. Safety exits
  if (testFiltered.length === 0) {
    writeReport(`batch-replay-${DATE_STAMP}.md`,
      `# Batch Replay — ${startedIso}\n\n## Outcome\n\nNo real-customer stuck orders. Exiting clean.\n\nTest accounts in stuck set: ${testExcluded.length}\n`);
    log("No real-customer stuck orders. Clean exit.");
    return;
  }
  if (testFiltered.length > 8) {
    writeReport(`batch-filter-suspect-${DATE_STAMP}.md`,
      `# Batch filter suspect — ${startedIso}\n\nFilter returned ${testFiltered.length} real-customer orders. Expected 1-5. Something may be wrong with the filter or the denylist.\n\n## Candidates\n\n${testFiltered.map((o) => `- ${o.id.substring(0,8)} ${o.email}`).join("\n")}\n`);
    log(`ABORT: filter returned ${testFiltered.length} > 8 — suspect. Wrote batch-filter-suspect.md.`);
    process.exit(1);
  }

  // 5. Stripe filter — verify payment_intent.status === 'succeeded'
  const paid = [];
  const notPaid = [];
  let stripe5xxStreak = 0;
  for (const o of testFiltered) {
    if (!o.session_id) {
      notPaid.push({ ...o, stripe_status: "no_session_id" });
      continue;
    }
    try {
      const sess = await stripe.checkout.sessions.retrieve(o.session_id);
      let pi = sess.payment_intent;
      if (typeof pi === "string") pi = await stripe.paymentIntents.retrieve(pi);
      const status = pi ? pi.status : "no_payment_intent";
      if (status === "succeeded") {
        paid.push({ ...o, stripe_status: status });
      } else {
        notPaid.push({ ...o, stripe_status: status });
      }
      stripe5xxStreak = 0;
    } catch (err) {
      const msg = String(err.message || "");
      // Stripe SDK surfaces 5xx as Error with statusCode or message
      const is5xx = (err.statusCode && err.statusCode >= 500) || /5\d\d/.test(msg);
      if (is5xx) {
        stripe5xxStreak += 1;
        if (stripe5xxStreak >= STRIPE_5XX_THRESHOLD) {
          writeReport(`batch-replay-halted-stripe-${DATE_STAMP}.md`,
            `# Batch halted — Stripe API repeated 5xx\n\n${stripe5xxStreak} consecutive Stripe 5xx errors.\n\nLast error: ${msg}\n`);
          log(`ABORT: Stripe 5xx streak=${stripe5xxStreak}`);
          process.exit(1);
        }
      }
      notPaid.push({ ...o, stripe_status: `error:${msg.substring(0, 80)}` });
    }
  }
  log(`Stripe filter: ${paid.length} paid / ${notPaid.length} not-paid.`);

  // 6. Final safety check
  if (paid.length === 0) {
    writeReport(`batch-replay-${DATE_STAMP}.md`,
      `# Batch Replay — ${startedIso}\n\n## Outcome\n\nNo stripe-paid real-customer stuck orders. Clean exit.\n\n## Stripe-filtered out\n\n${notPaid.map((o) => `- ${o.id.substring(0,8)} ${o.email} → ${o.stripe_status}`).join("\n")}\n`);
    log("No paid real-customer orders. Clean exit.");
    return;
  }

  // Report initialization for the batch outcome
  const outcomeRows = []; // { order_id, email, canary_or_batch, dry_run_ok, live_send_ok, delivered_verified, resend_message_id, error, duration_ms }
  const replay5xxCount = { total: 0, attempts: 0 };
  let consecutiveFailures = 0;
  let endpointFailStreak = 0;

  function checkKillSwitches() {
    const elapsed = Date.now() - startedAt;
    if (elapsed > MAX_ELAPSED_MS) {
      writeReport(`batch-replay-halted-timeout-${DATE_STAMP}.md`,
        `# Batch halted — total elapsed > 45min\n\nelapsed: ${Math.round(elapsed / 60000)}min\n\n## Rows so far\n\n${outcomeRows.map(r => JSON.stringify(r)).join("\n")}\n`);
      log(`ABORT: total elapsed ${Math.round(elapsed / 60000)}min > 45min`);
      return "timeout";
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      writeReport(`batch-replay-halted-consecutive-${DATE_STAMP}.md`,
        `# Batch halted — ${MAX_CONSECUTIVE_FAILURES} consecutive failures\n\n## Rows so far\n\n${outcomeRows.map(r => JSON.stringify(r)).join("\n")}\n`);
      log(`ABORT: ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
      return "consecutive";
    }
    if (replay5xxCount.attempts >= ENDPOINT_5XX_MIN_ATTEMPTS) {
      const rate = replay5xxCount.total / replay5xxCount.attempts;
      if (rate > ENDPOINT_5XX_THRESHOLD_RATE) {
        writeReport(`batch-replay-halted-endpoint-${DATE_STAMP}.md`,
          `# Batch halted — replay endpoint 5xx rate > 50%\n\nattempts: ${replay5xxCount.attempts}, 5xx: ${replay5xxCount.total}, rate: ${(rate * 100).toFixed(1)}%\n`);
        log(`ABORT: endpoint 5xx rate ${(rate * 100).toFixed(1)}% over ${replay5xxCount.attempts} attempts`);
        return "endpoint";
      }
    }
    return null;
  }

  // 7. CANARY — oldest order first
  const canary = paid[0];
  log(`CANARY: order_id=${canary.id.substring(0, 8)} email=${canary.email}`);
  const canaryStartedIso = new Date().toISOString();

  // 7a. Canary dry-run
  let canaryDry;
  try {
    canaryDry = await postReplay({ order_id: canary.id, dry_run: true });
  } catch (err) {
    writeReport(`canary-dry-run-failed-${DATE_STAMP}.md`,
      `# Canary dry-run failed (HTTP)\n\norder_id: ${canary.id}\nemail: ${canary.email}\nerror: ${err.message}\n`);
    log(`ABORT: canary dry-run HTTP error: ${err.message}`);
    process.exit(1);
  }
  replay5xxCount.attempts += 1;
  if (canaryDry.status >= 500) replay5xxCount.total += 1;

  const dryOk =
    canaryDry.status === 200 &&
    canaryDry.body &&
    canaryDry.body.ok === true &&
    typeof canaryDry.body.brief_preview_html === "string" &&
    canaryDry.body.brief_preview_html.length > 1000 &&
    canaryDry.body.would_send_to === canary.email;

  if (!dryOk) {
    writeReport(`canary-dry-run-failed-${DATE_STAMP}.md`,
      `# Canary dry-run failed — response invalid\n\norder_id: ${canary.id}\nemail: ${canary.email}\n\n## Expected\n- status=200, ok=true, brief_preview_html length>1000, would_send_to=${canary.email}\n\n## Got\n- status: ${canaryDry.status}\n- ok: ${canaryDry.body?.ok}\n- preview length: ${canaryDry.body?.brief_preview_html?.length || 0}\n- would_send_to: ${canaryDry.body?.would_send_to}\n\n## Full body\n\n\`\`\`json\n${JSON.stringify(canaryDry.body, null, 2)}\n\`\`\`\n`);
    log(`ABORT: canary dry-run response invalid (status=${canaryDry.status})`);
    process.exit(1);
  }
  log(`Canary dry-run OK (preview=${canaryDry.body.brief_preview_html.length} chars).`);

  // 7b. Canary live
  let canaryLive;
  try {
    canaryLive = await postReplay({ order_id: canary.id, dry_run: false });
  } catch (err) {
    writeReport(`canary-live-failed-${DATE_STAMP}.md`,
      `# Canary live-send failed (HTTP)\n\norder_id: ${canary.id}\nemail: ${canary.email}\nerror: ${err.message}\n`);
    log(`ABORT: canary live-send HTTP error: ${err.message}`);
    process.exit(1);
  }
  replay5xxCount.attempts += 1;
  if (canaryLive.status >= 500) replay5xxCount.total += 1;

  if (canaryLive.status < 200 || canaryLive.status >= 300) {
    writeReport(`canary-live-failed-${DATE_STAMP}.md`,
      `# Canary live-send failed — non-2xx\n\norder_id: ${canary.id}\nemail: ${canary.email}\nstatus: ${canaryLive.status}\n\n\`\`\`json\n${JSON.stringify(canaryLive.body, null, 2)}\n\`\`\`\n`);
    log(`ABORT: canary live-send status=${canaryLive.status}`);
    process.exit(1);
  }
  log(`Canary live-send enqueued (fn_status=${canaryLive.body?.fn_status}).`);

  // 7c. Wait + poll for delivery
  log(`Canary: waiting ${CANARY_POST_WAIT_MS / 1000}s then polling for delivery (max ${DELIVERY_POLL_MAX_MS / 60000}min)...`);
  await sleep(CANARY_POST_WAIT_MS);
  const canaryDelivery = await pollForDelivery(supabase, canary.id, DELIVERY_POLL_MAX_MS);
  const canaryEvents = await verifyReplayDeliveredEvent(supabase, canary.id, canaryStartedIso);

  const canaryOutcome = {
    order_id: canary.id,
    customer_email: canary.email,
    stripe_paid: true,
    canary_or_batch: "canary",
    dry_run_ok: true,
    live_send_ok: canaryLive.status >= 200 && canaryLive.status < 300,
    delivered_verified: canaryDelivery.delivered === true,
    replay_delivered_event: canaryEvents.has,
    resend_message_id: null,
    error: canaryDelivery.delivered ? null : (canaryDelivery.reason || "delivery_poll_failed"),
    duration_ms: Date.now() - startedAt,
    final_state: canaryDelivery.row?.workflow_state,
    final_error_message: canaryDelivery.row?.error_message,
  };
  outcomeRows.push(canaryOutcome);

  if (!canaryDelivery.delivered) {
    writeReport(`canary-live-failed-${DATE_STAMP}.md`,
      `# Canary live-send failed — delivery not verified\n\norder_id: ${canary.id}\nemail: ${canary.email}\nreason: ${canaryDelivery.reason}\nfinal state: ${canaryDelivery.row?.workflow_state}\nfinal error_message: ${canaryDelivery.row?.error_message}\nREPLAY_DELIVERED event present: ${canaryEvents.has}\n`);
    log(`ABORT: canary delivery verification failed (reason=${canaryDelivery.reason})`);
    // Write final batch report with canary-only row before exit
    writeFinalReport(outcomeRows, paid, notPaid, testExcluded, startedAt, "canary_failed");
    process.exit(1);
  }
  log(`Canary VERIFIED: delivered=true, REPLAY_DELIVERED event=${canaryEvents.has}. Proceeding to batch.`);

  // 8. BATCH — remaining orders
  const remaining = paid.slice(1);
  log(`BATCH: ${remaining.length} orders at ${BATCH_PACING_MS / 1000}s pacing.`);

  for (const o of remaining) {
    const ks = checkKillSwitches();
    if (ks) {
      // write final report and exit
      writeFinalReport(outcomeRows, paid, notPaid, testExcluded, startedAt, `killswitch_${ks}`);
      process.exit(1);
    }

    log(`Batch: sleeping ${BATCH_PACING_MS / 1000}s before next order (${o.id.substring(0, 8)} ${o.email})...`);
    await sleep(BATCH_PACING_MS);

    const orderStartedIso = new Date().toISOString();
    let liveResp = null;
    let liveErr = null;
    try {
      liveResp = await postReplay({ order_id: o.id, dry_run: false });
    } catch (err) {
      liveErr = err.message;
    }
    replay5xxCount.attempts += 1;
    if (liveResp && liveResp.status >= 500) replay5xxCount.total += 1;

    const liveOk = !!(liveResp && liveResp.status >= 200 && liveResp.status < 300);
    if (!liveOk) {
      endpointFailStreak += 1;
      consecutiveFailures += 1;
      outcomeRows.push({
        order_id: o.id,
        customer_email: o.email,
        stripe_paid: true,
        canary_or_batch: "batch",
        dry_run_ok: null,
        live_send_ok: false,
        delivered_verified: false,
        replay_delivered_event: false,
        resend_message_id: null,
        error: liveErr || `http_${liveResp?.status}`,
        duration_ms: Date.now() - startedAt,
        final_state: null,
        final_error_message: null,
      });
      log(`Batch order ${o.id.substring(0, 8)} live-send FAILED (${liveErr || `http_${liveResp?.status}`}). Continuing.`);
      continue;
    }
    endpointFailStreak = 0;

    // Wait + poll for delivery
    await sleep(BATCH_POST_WAIT_MS);
    const delivery = await pollForDelivery(supabase, o.id, DELIVERY_POLL_MAX_MS);
    const events = await verifyReplayDeliveredEvent(supabase, o.id, orderStartedIso);

    const delivered = delivery.delivered === true;
    if (delivered) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
    }

    outcomeRows.push({
      order_id: o.id,
      customer_email: o.email,
      stripe_paid: true,
      canary_or_batch: "batch",
      dry_run_ok: null,
      live_send_ok: true,
      delivered_verified: delivered,
      replay_delivered_event: events.has,
      resend_message_id: null,
      error: delivered ? null : (delivery.reason || "delivery_poll_failed"),
      duration_ms: Date.now() - startedAt,
      final_state: delivery.row?.workflow_state,
      final_error_message: delivery.row?.error_message,
    });
    log(`Batch order ${o.id.substring(0, 8)} ${delivered ? "DELIVERED" : `FAILED (${delivery.reason})`}.`);
  }

  // 9. Final report
  writeFinalReport(outcomeRows, paid, notPaid, testExcluded, startedAt, "completed");
  log("Batch complete.");
}

function writeFinalReport(outcomeRows, paid, notPaid, testExcluded, startedAt, exitReason) {
  const startedIso = new Date(startedAt).toISOString();
  const elapsedMin = Math.round((Date.now() - startedAt) / 60000);

  const attempted = outcomeRows.length;
  const delivered = outcomeRows.filter((r) => r.delivered_verified === true).length;
  const failed = outcomeRows.filter((r) => r.live_send_ok === false || r.delivered_verified === false).length;

  const lines = [
    `# Batch Replay — ${startedIso}`,
    ``,
    `Exit reason: **${exitReason}**`,
    `Elapsed: ${elapsedMin}min`,
    ``,
    `## Totals`,
    ``,
    `| metric | value |`,
    `|---|---|`,
    `| attempted | ${attempted} |`,
    `| delivered | ${delivered} |`,
    `| failed | ${failed} |`,
    `| skipped-not-paid | ${notPaid.length} |`,
    `| skipped-test-account | ${testExcluded.length} |`,
    ``,
    `## Per-order outcomes`,
    ``,
    `| order_id | customer_email | stripe_paid | canary/batch | dry_run_ok | live_send_ok | delivered_verified | replay_delivered_event | resend_message_id | final_state | error |`,
    `|---|---|---|---|---|---|---|---|---|---|---|`,
    ...outcomeRows.map((r) => `| ${r.order_id.substring(0, 8)} | ${r.customer_email} | ${r.stripe_paid} | ${r.canary_or_batch} | ${r.dry_run_ok === null ? "—" : r.dry_run_ok} | ${r.live_send_ok} | ${r.delivered_verified} | ${r.replay_delivered_event} | ${r.resend_message_id || "—"} | ${r.final_state || "—"} | ${r.error || "—"} |`),
    ``,
    `## Skipped — not paid`,
    ``,
    notPaid.length ? `| order_id | email | stripe_status |\n|---|---|---|\n${notPaid.map((o) => `| ${o.id.substring(0, 8)} | ${o.email} | ${o.stripe_status} |`).join("\n")}` : "(none)",
    ``,
    `## Skipped — test account`,
    ``,
    testExcluded.length ? `| order_id | email |\n|---|---|\n${testExcluded.map((o) => `| ${o.id.substring(0, 8)} | ${o.email} |`).join("\n")}` : "(none)",
    ``,
    `## Customers who received delivery`,
    ``,
    (outcomeRows.filter((r) => r.delivered_verified).map((r) => `- ${r.customer_email} (${r.order_id.substring(0, 8)})`).join("\n") || "(none)"),
    ``,
    `## Orders still not delivered (Mary decides: outreach / refund)`,
    ``,
    (outcomeRows.filter((r) => !r.delivered_verified).map((r) => `- ${r.customer_email} (${r.order_id.substring(0, 8)}) — ${r.error || "delivery not verified"}`).join("\n") || "(none — all delivered)"),
    ``,
  ].join("\n");

  writeReport(`batch-replay-${DATE_STAMP}.md`, lines);
  log(`Wrote batch-replay-${DATE_STAMP}.md`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  writeReport(`batch-replay-fatal-${DATE_STAMP}.md`, `# FATAL error in batch runner\n\n${err.stack || err.message}\n`);
  process.exit(1);
});
