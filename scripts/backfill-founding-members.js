#!/usr/bin/env node
// ============================================================
// backfill-founding-members.js — Retroactive welcome sender for $199 founding
// subscribers who paid 2026-04-14 → 2026-04-19 during the webhook outage and
// never got a welcome email.
//
// 3-phase mandatory sequence enforced via reports/backfill-state-YYYYMMDD.json:
//   Phase 1 (--dry-run, default): preview every eligible target + rendered email
//   Phase 2 (--live --customer <email>): canary one customer + verify end-to-end
//   Phase 3 (--live --limit N):         remaining customers at 60s pacing
//
// Per-customer gates (every send):
//   - Stripe subscription.status === 'active' AND latest_invoice.paid === true
//   - price.id is in FOUNDING_PRICE_IDS whitelist (hard reject otherwise)
//   - customer_events.welcome_sent with this subscription_id does NOT exist (idempotency)
//   - metadata.app absent or === 'mmt' (reject if explicitly non-MMT)
//
// Kill switches (halt immediately, write backfill-failure report):
//   - 1 consecutive send failure
//   - Resend 5xx
//   - Stripe 5xx
//   - elapsed > 30 min
//   - customer_events insert failure
//   - ops_events insert failure
//
// Does NOT auto-run anything. Mary invokes each phase manually.
// Does NOT send any apology follow-up. That's a separate step Mary handles.
// Does NOT refund or cancel any subscription (including jord.hiller's duplicate —
//   Mary handles dedup manually via Stripe dashboard if she chooses to).
// ============================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
const Stripe = require(path.join(__dirname, "..", "node_modules", "stripe"));

// ============================================================
// Config
// ============================================================

const STATE_STAMP = new Date().toISOString().substring(0, 10).replace(/-/g, "");
const REPORTS_DIR = path.join(__dirname, "..", "reports");
const STATE_FILE = path.join(REPORTS_DIR, `backfill-state-${STATE_STAMP}.json`);
const PREVIEW_FILE = path.join(REPORTS_DIR, `backfill-preview-${STATE_STAMP}.md`);
const RESULTS_FILE = path.join(REPORTS_DIR, `backfill-results-${STATE_STAMP}.md`);
const FAILURE_FILE = path.join(REPORTS_DIR, `backfill-failure-${STATE_STAMP}.md`);

const SITE_URL = process.env.SITE_URL || "https://missionmeetstech.com";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const FOUNDING_PRICE_IDS = [
  process.env.STRIPE_PRICE_FOUNDING_YEARLY,
  process.env.STRIPE_PRICE_FOUNDING_MONTHLY,
  process.env.STRIPE_PRICE_FOUNDING_ANNUAL,
  process.env.STRIPE_PRICE_FOUNDING,
].filter(Boolean);

const BATCH_PACING_MS = 60 * 1000;
const MAX_ELAPSED_MS = 30 * 60 * 1000;
const POST_SEND_VERIFY_WAIT_MS = 5 * 1000;

// ============================================================
// Helpers
// ============================================================

function ensureReports() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}
function writeFile(filePath, content) {
  ensureReports();
  fs.writeFileSync(filePath, content);
}
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function esc(s) {
  return String(s || "").replace(/\|/g, "\\|");
}
function parseFlags(argv) {
  const out = { dryRun: true, live: false, customer: null, limit: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--live") { out.live = true; out.dryRun = false; }
    else if (a === "--customer") { out.customer = (argv[++i] || "").toLowerCase().trim(); }
    else if (a === "--limit") { out.limit = parseInt(argv[++i], 10); }
    else if (a.startsWith("--customer=")) { out.customer = a.slice("--customer=".length).toLowerCase().trim(); }
    else if (a.startsWith("--limit=")) { out.limit = parseInt(a.slice("--limit=".length), 10); }
    else if (a === "--help" || a === "-h") { out.help = true; }
  }
  return out;
}
function usage() {
  return `Usage: node scripts/backfill-founding-members.js [flags]

  --dry-run            Default. Query targets + render previews. No sends.
                       Writes reports/backfill-preview-${STATE_STAMP}.md.

  --live --customer <email>
                       Phase 2 canary. Requires Phase 1 marker. Sends to
                       exactly one customer and verifies end-to-end.

  --live --limit N     Phase 3 batch. Requires Phase 2 marker.
                       Sends to remaining customers at 60s pacing, up to N.

  --help               This message.

Environment:
  SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY,
  STRIPE_PRICE_FOUNDING_YEARLY (required — whitelist enforcement).
`;
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}
function writeState(next) {
  ensureReports();
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
}

// ============================================================
// Supabase / Stripe helpers
// ============================================================

async function loadEligibleTargets(supabase) {
  // Eligible: subscription_tier='premium', subscription_status='active', has stripe_subscription_id,
  // and no customer_events.welcome_sent row yet for that subscription_id.
  const { data: users, error } = await supabase
    .from("mp_users")
    .select("id, email, stripe_subscription_id, stripe_customer_id, subscription_tier, subscription_status, founding_member, created_at")
    .eq("subscription_tier", "premium")
    .eq("subscription_status", "active")
    .not("stripe_subscription_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`mp_users query failed: ${error.message}`);

  const emails = (users || []).map((u) => (u.email || "").toLowerCase().trim()).filter(Boolean);
  if (emails.length === 0) return [];
  const { data: welcomed } = await supabase
    .from("customer_events")
    .select("email, metadata")
    .eq("event_type", "welcome_sent")
    .eq("product", "mmt_premium_founding")
    .in("email", emails);

  const welcomedBySub = new Set();
  (welcomed || []).forEach((w) => {
    const subId = w.metadata && w.metadata.subscription_id;
    if (subId) welcomedBySub.add(`${(w.email || "").toLowerCase().trim()}::${subId}`);
  });

  return (users || []).filter((u) => {
    const key = `${(u.email || "").toLowerCase().trim()}::${u.stripe_subscription_id}`;
    return !welcomedBySub.has(key);
  });
}

async function verifyStripe(stripe, subscriptionId) {
  // Retrieve subscription (expand items + latest_invoice)
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice", "items"] });
  const firstItem = sub.items && sub.items.data && sub.items.data[0];
  const priceId = firstItem && firstItem.price && firstItem.price.id;
  const meta = (sub.metadata && typeof sub.metadata === "object") ? sub.metadata : {};
  const latestInvoice = sub.latest_invoice;
  // Stripe's API returns `invoice.status === "paid"` as the canonical signal. The older
  // boolean `invoice.paid` is no longer populated. Treat either (status="paid" OR
  // amount_paid > 0 with no remaining balance) as proof of payment.
  let invoicePaid = false;
  if (latestInvoice && typeof latestInvoice === "object") {
    if (latestInvoice.status === "paid") invoicePaid = true;
    else if ((latestInvoice.amount_paid || 0) > 0 && (latestInvoice.amount_remaining || 0) === 0) invoicePaid = true;
  }
  return {
    sub,
    status: sub.status,
    priceId,
    metadataApp: meta.app || null,
    invoicePaid,
    invoiceStatus: latestInvoice && latestInvoice.status,
    invoiceAmountPaid: latestInvoice && latestInvoice.amount_paid,
    customer: sub.customer,
  };
}

// ============================================================
// Per-customer pipeline
// ============================================================

async function verifyCustomerEligible(supabase, stripe, target) {
  const reasons = [];
  const subId = target.stripe_subscription_id;

  // Re-check customer_events idempotency in case something else wrote
  try {
    const { data: existing } = await supabase
      .from("customer_events")
      .select("id, metadata")
      .eq("email", target.email.toLowerCase().trim())
      .eq("event_type", "welcome_sent")
      .eq("product", "mmt_premium_founding")
      .limit(5);
    const alreadySent = (existing || []).some((e) => e.metadata && e.metadata.subscription_id === subId);
    if (alreadySent) return { eligible: false, reason: "welcome_already_sent", subId };
  } catch (e) {
    return { eligible: false, reason: `customer_events_query_failed: ${e.message}`, subId };
  }

  // Stripe verification
  let stripeInfo;
  try {
    stripeInfo = await verifyStripe(stripe, subId);
  } catch (e) {
    return { eligible: false, reason: `stripe_lookup_failed: ${e.message}`, subId };
  }

  if (stripeInfo.status !== "active") {
    return { eligible: false, reason: `stripe_status_${stripeInfo.status}`, subId, stripeInfo };
  }
  if (stripeInfo.invoicePaid !== true) {
    return { eligible: false, reason: `latest_invoice_unpaid`, subId, stripeInfo };
  }
  if (stripeInfo.metadataApp && stripeInfo.metadataApp !== "mmt") {
    return { eligible: false, reason: `metadata_app_${stripeInfo.metadataApp}`, subId, stripeInfo };
  }
  if (!stripeInfo.priceId || !FOUNDING_PRICE_IDS.includes(stripeInfo.priceId)) {
    return { eligible: false, reason: `price_id_not_in_whitelist:${stripeInfo.priceId}`, subId, stripeInfo };
  }

  return { eligible: true, stripeInfo };
}

async function sendWelcomeForCustomer(supabase, target, stripeInfo) {
  const { sendEmail } = require("../netlify/functions/lib/send-email");
  const { logOpsEvent } = require("../netlify/functions/lib/ops-ledger");
  const { logCustomerEvent, upsertCustomer } = require("../netlify/functions/lib/customer-sync");
  const { buildFoundingMemberWelcome } = require("../netlify/functions/lib/email-templates/founding-member-welcome");

  const email = target.email.toLowerCase().trim();
  const subId = target.stripe_subscription_id;

  const { subject, html, text } = buildFoundingMemberWelcome({
    customerEmail: email,
    isBackfill: true,
  });

  let sendResult;
  try {
    sendResult = await sendEmail({
      to: email,
      subject,
      html,
      text,
      from: "Mary at Mission Meets Tech <mary@missionmeetstech.com>",
    });
  } catch (sendErr) {
    return { success: false, reason: "resend_threw", error: String(sendErr.message || "").substring(0, 300) };
  }
  if (!sendResult || !sendResult.success) {
    return { success: false, reason: "resend_returned_not_ok", error: String((sendResult && sendResult.error) || "unknown").substring(0, 300) };
  }
  const resendId = sendResult.id || sendResult.messageId || null;

  // Write customer_events row (source of welcome_sent truth)
  let customerEventId = null;
  try {
    await logCustomerEvent(supabase, {
      email,
      eventType: "welcome_sent",
      product: "mmt_premium_founding",
      amountCents: 0,
      metadata: {
        subscription_id: subId,
        resend_message_id: resendId,
        sent_via: "backfill-founding-members",
        backfill_stamp: STATE_STAMP,
      },
    });
  } catch (ceErr) {
    return { success: false, reason: "customer_events_insert_failed", error: String(ceErr.message || "").substring(0, 300), resendId };
  }

  // Upsert customer_profiles with founding flag (idempotent merge into health_signals JSONB)
  try {
    await upsertCustomer(supabase, {
      email,
      stripeCustomerId: target.stripe_customer_id || (stripeInfo && stripeInfo.customer) || null,
      product: "mmt_premium",
      amountCents: 0,
      foundingMember: true,
    });
  } catch { /* non-blocking */ }

  // Write ops_events for alerting + audit
  let opsEventId = null;
  try {
    await logOpsEvent(supabase, {
      event_type: "WELCOME_EMAIL_SENT",
      source_function: "backfill-founding-members",
      severity: "info",
      signature: "founding_member_backfill",
      affected_entity: subId,
      details: {
        customer_email: email,
        subscription_id: subId,
        resend_message_id: resendId,
        backfill_stamp: STATE_STAMP,
      },
    });
  } catch (opsErr) {
    return { success: false, reason: "ops_events_insert_failed", error: String(opsErr.message || "").substring(0, 300), resendId, customerEventId };
  }

  // Also write founding_member=true back into mp_users if not already set
  try {
    await supabase.from("mp_users").update({ founding_member: true }).eq("email", email).neq("founding_member", true);
  } catch { /* non-blocking */ }

  return { success: true, resendId, customerEventId, opsEventId, subId };
}

async function verifyDelivery(supabase, email, subId) {
  // Post-send check: customer_events row + ops_events row should both exist for this sub.
  // Note: ops_events has no `affected_entity` column (that column lives on ops_ledger).
  // We filter by source_function + event_type + recency, then check details.subscription_id
  // client-side.
  const { data: ce } = await supabase
    .from("customer_events")
    .select("id, metadata")
    .eq("email", email)
    .eq("event_type", "welcome_sent")
    .eq("product", "mmt_premium_founding")
    .order("created_at", { ascending: false })
    .limit(5);
  const hasCe = (ce || []).some((e) => e.metadata && e.metadata.subscription_id === subId);

  const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: oe } = await supabase
    .from("ops_events")
    .select("id, details, created_at")
    .eq("event_type", "WELCOME_EMAIL_SENT")
    .eq("source_function", "backfill-founding-members")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(20);
  const hasOe = (oe || []).some((e) => e.details && e.details.subscription_id === subId);

  return { hasCustomerEvent: hasCe, hasOpsEvent: hasOe };
}

// ============================================================
// Phases
// ============================================================

async function runPhase1(supabase, stripe) {
  log("Phase 1 — dry-run. Loading eligible targets from Supabase.");
  const targets = await loadEligibleTargets(supabase);
  log(`Found ${targets.length} eligible targets.`);

  const previewRows = [];
  const stripeChecks = [];

  for (const t of targets) {
    let stripeInfo = null;
    let eligibilityReason = null;
    try {
      stripeInfo = await verifyStripe(stripe, t.stripe_subscription_id);
      const whitelistOk = stripeInfo.priceId && FOUNDING_PRICE_IDS.includes(stripeInfo.priceId);
      if (stripeInfo.status !== "active") eligibilityReason = `stripe_status_${stripeInfo.status}`;
      else if (stripeInfo.invoicePaid !== true) eligibilityReason = "latest_invoice_unpaid";
      else if (stripeInfo.metadataApp && stripeInfo.metadataApp !== "mmt") eligibilityReason = `metadata_app_${stripeInfo.metadataApp}`;
      else if (!whitelistOk) eligibilityReason = `price_id_not_in_whitelist:${stripeInfo.priceId}`;
    } catch (e) {
      eligibilityReason = `stripe_lookup_failed:${e.message}`;
    }
    stripeChecks.push({ target: t, stripeInfo, eligibilityReason });
  }

  const willSend = stripeChecks.filter((c) => !c.eligibilityReason);
  const skipped = stripeChecks.filter((c) => c.eligibilityReason);

  const { buildFoundingMemberWelcome } = require("../netlify/functions/lib/email-templates/founding-member-welcome");

  const previewLines = [
    `# Backfill Preview — ${new Date().toISOString()}`,
    ``,
    `Target count: ${targets.length}`,
    `Will send: ${willSend.length}`,
    `Skipped: ${skipped.length}`,
    ``,
    `## Eligible targets (would receive welcome on Phase 2/3)`,
    ``,
    `| # | email | subscription_id | price_id | stripe_status | latest_invoice_paid | metadata.app |`,
    `|---|---|---|---|---|---|---|`,
    ...willSend.map((c, i) => `| ${i + 1} | ${esc(c.target.email)} | ${esc(c.target.stripe_subscription_id)} | ${esc(c.stripeInfo.priceId)} | ${esc(c.stripeInfo.status)} | ${c.stripeInfo.invoicePaid} | ${esc(c.stripeInfo.metadataApp) || "—"} |`),
    ``,
    `## Skipped (not sent even on live)`,
    ``,
    skipped.length > 0
      ? [
          `| # | email | subscription_id | reason |`,
          `|---|---|---|---|`,
          ...skipped.map((c, i) => `| ${i + 1} | ${esc(c.target.email)} | ${esc(c.target.stripe_subscription_id)} | ${esc(c.eligibilityReason)} |`),
        ].join("\n")
      : "(none)",
    ``,
    `## Sample rendered welcome email (first eligible target)`,
    ``,
  ];

  if (willSend.length > 0) {
    const firstEligible = willSend[0].target;
    const { subject, html, text } = buildFoundingMemberWelcome({
      customerEmail: firstEligible.email,
      isBackfill: true,
    });
    previewLines.push(
      `**To:** ${esc(firstEligible.email)}`,
      `**Subject:** ${subject}`,
      ``,
      `### Plain-text preview`,
      ``,
      "```",
      text,
      "```",
      ``,
      `### HTML preview (first 800 chars)`,
      ``,
      "```html",
      html.substring(0, 800),
      "```",
      ``,
      `(full HTML length: ${html.length} chars)`,
    );
  } else {
    previewLines.push(`(no eligible targets)`);
  }

  writeFile(PREVIEW_FILE, previewLines.join("\n"));
  log(`Wrote ${PREVIEW_FILE}`);

  writeState({
    phase: 1,
    completed_at: new Date().toISOString(),
    target_count: targets.length,
    eligible_count: willSend.length,
    skipped_count: skipped.length,
    eligible_emails: willSend.map((c) => c.target.email),
    skipped_details: skipped.map((c) => ({ email: c.target.email, reason: c.eligibilityReason })),
  });
  log(`Wrote state marker ${STATE_FILE} (phase=1)`);
  log(`Phase 1 complete. Review the preview, then run: --live --customer <email>`);
}

async function runPhase2(supabase, stripe, customerEmail) {
  const state = readState();
  if (!state || state.phase < 1) {
    throw new Error("Phase 2 rejected: Phase 1 marker missing. Run --dry-run first.");
  }
  const startedAt = Date.now();
  const normalizedEmail = customerEmail.toLowerCase().trim();

  log(`Phase 2 — canary send to ${normalizedEmail}.`);

  // Load the single target
  const { data: users, error } = await supabase
    .from("mp_users")
    .select("id, email, stripe_subscription_id, stripe_customer_id, subscription_tier, subscription_status, founding_member")
    .eq("email", normalizedEmail)
    .eq("subscription_tier", "premium")
    .eq("subscription_status", "active")
    .limit(1);
  if (error) throw new Error(`mp_users query failed: ${error.message}`);
  if (!users || users.length === 0) {
    throw new Error(`Phase 2 rejected: no premium/active mp_users row for ${normalizedEmail}`);
  }
  const target = users[0];
  if (!target.stripe_subscription_id) {
    throw new Error(`Phase 2 rejected: ${normalizedEmail} has no stripe_subscription_id`);
  }

  // Eligibility check
  const elig = await verifyCustomerEligible(supabase, stripe, target);
  if (!elig.eligible) {
    throw new Error(`Phase 2 rejected: ${elig.reason}`);
  }

  // Send
  const result = await sendWelcomeForCustomer(supabase, target, elig.stripeInfo);
  if (!result.success) {
    writeFile(FAILURE_FILE, `# Backfill Phase 2 FAILED — ${new Date().toISOString()}\n\nCustomer: ${normalizedEmail}\nReason: ${result.reason}\nError: ${result.error || ""}\n`);
    throw new Error(`Phase 2 send failed: ${result.reason} (${result.error || ""})`);
  }

  log(`Sent. resend_message_id=${result.resendId}. Waiting ${POST_SEND_VERIFY_WAIT_MS / 1000}s then verifying…`);
  await sleep(POST_SEND_VERIFY_WAIT_MS);

  const verify = await verifyDelivery(supabase, normalizedEmail, target.stripe_subscription_id);
  if (!verify.hasCustomerEvent || !verify.hasOpsEvent) {
    writeFile(FAILURE_FILE, `# Backfill Phase 2 VERIFY FAILED — ${new Date().toISOString()}\n\nCustomer: ${normalizedEmail}\ncustomer_events row present: ${verify.hasCustomerEvent}\nops_events row present: ${verify.hasOpsEvent}\n`);
    throw new Error(`Phase 2 verify failed — customer_events=${verify.hasCustomerEvent}, ops_events=${verify.hasOpsEvent}`);
  }

  writeState({
    ...state,
    phase: 2,
    canary_email: normalizedEmail,
    canary_subscription_id: target.stripe_subscription_id,
    canary_sent_at: new Date().toISOString(),
    canary_resend_message_id: result.resendId,
    canary_verified: true,
    canary_elapsed_ms: Date.now() - startedAt,
  });
  log(`Wrote state marker ${STATE_FILE} (phase=2, canary_verified=true)`);
  log(`Phase 2 complete. Run: --live --limit <N> to process the remaining.`);
}

async function runPhase3(supabase, stripe, limit) {
  const state = readState();
  if (!state || state.phase < 2 || state.canary_verified !== true) {
    throw new Error("Phase 3 rejected: Phase 2 canary marker missing or canary not verified.");
  }
  const startedAt = Date.now();
  log(`Phase 3 — batch send. Limit=${limit === null ? "none" : limit}.`);

  const targets = await loadEligibleTargets(supabase);
  log(`Found ${targets.length} remaining eligible targets after idempotency filter.`);

  const todo = limit !== null && limit >= 0 ? targets.slice(0, limit) : targets;
  const rows = [];
  let consecutiveFailures = 0;
  let stripe5xxStreak = 0;
  let resend5xxStreak = 0;

  function checkKill(extra) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > MAX_ELAPSED_MS) return `elapsed>${MAX_ELAPSED_MS / 60000}min`;
    if (consecutiveFailures >= 1 && extra.lastFailed) return `consecutive_failures=${consecutiveFailures}`;
    if (stripe5xxStreak >= 3) return `stripe_5xx_streak=${stripe5xxStreak}`;
    if (resend5xxStreak >= 3) return `resend_5xx_streak=${resend5xxStreak}`;
    return null;
  }

  for (let i = 0; i < todo.length; i++) {
    const target = todo[i];

    if (i > 0) {
      log(`Sleeping ${BATCH_PACING_MS / 1000}s before next send…`);
      await sleep(BATCH_PACING_MS);
    }

    log(`[${i + 1}/${todo.length}] ${target.email} (sub=${target.stripe_subscription_id.substring(0, 12)}…)`);

    let stripeInfo;
    try {
      const elig = await verifyCustomerEligible(supabase, stripe, target);
      if (!elig.eligible) {
        rows.push({ email: target.email, subscription_id: target.stripe_subscription_id, price_id: elig.stripeInfo && elig.stripeInfo.priceId, resend_message_id: null, ops_events_id: null, customer_events_id: null, timestamp: new Date().toISOString(), status: "skipped", reason: elig.reason });
        log(`  skipped: ${elig.reason}`);
        continue;
      }
      stripeInfo = elig.stripeInfo;
      stripe5xxStreak = 0;
    } catch (e) {
      const is5xx = /5\d\d/.test(e.message) || (e.statusCode && e.statusCode >= 500);
      if (is5xx) stripe5xxStreak++;
      rows.push({ email: target.email, subscription_id: target.stripe_subscription_id, price_id: null, resend_message_id: null, ops_events_id: null, customer_events_id: null, timestamp: new Date().toISOString(), status: "failed", reason: `stripe_error:${e.message}` });
      consecutiveFailures++;
      const killed = checkKill({ lastFailed: true });
      if (killed) {
        writeFile(FAILURE_FILE, `# Batch halted — ${killed}\n\nLast row: ${JSON.stringify(rows[rows.length - 1])}\n\n## All rows\n\n${rows.map(r => JSON.stringify(r)).join("\n")}\n`);
        writeFinalResults(rows, "halted");
        throw new Error(`Batch halted: ${killed}`);
      }
      continue;
    }

    const result = await sendWelcomeForCustomer(supabase, target, stripeInfo);
    if (!result.success) {
      if (/resend/i.test(result.reason) && /5\d\d/.test(String(result.error || ""))) resend5xxStreak++;
      rows.push({ email: target.email, subscription_id: target.stripe_subscription_id, price_id: stripeInfo.priceId, resend_message_id: result.resendId || null, ops_events_id: null, customer_events_id: null, timestamp: new Date().toISOString(), status: "failed", reason: `${result.reason}:${result.error || ""}` });
      consecutiveFailures++;
      const killed = checkKill({ lastFailed: true });
      if (killed) {
        writeFile(FAILURE_FILE, `# Batch halted — ${killed}\n\nLast row: ${JSON.stringify(rows[rows.length - 1])}\n\n## All rows\n\n${rows.map(r => JSON.stringify(r)).join("\n")}\n`);
        writeFinalResults(rows, "halted");
        throw new Error(`Batch halted: ${killed}`);
      }
      continue;
    }
    consecutiveFailures = 0;
    resend5xxStreak = 0;

    rows.push({ email: target.email, subscription_id: target.stripe_subscription_id, price_id: stripeInfo.priceId, resend_message_id: result.resendId, ops_events_id: result.opsEventId || "logged", customer_events_id: result.customerEventId || "logged", timestamp: new Date().toISOString(), status: "sent" });
    log(`  sent. resend_message_id=${result.resendId}`);
  }

  writeState({
    ...state,
    phase: 3,
    phase3_completed_at: new Date().toISOString(),
    phase3_attempted: todo.length,
    phase3_sent: rows.filter((r) => r.status === "sent").length,
    phase3_failed: rows.filter((r) => r.status === "failed").length,
    phase3_skipped: rows.filter((r) => r.status === "skipped").length,
  });
  writeFinalResults(rows, "completed");
  log("Phase 3 complete.");
}

function writeFinalResults(rows, exit_status) {
  const sent = rows.filter((r) => r.status === "sent");
  const failed = rows.filter((r) => r.status === "failed");
  const skipped = rows.filter((r) => r.status === "skipped");
  const lines = [
    `# Backfill Results — ${new Date().toISOString()}`,
    ``,
    `Exit status: **${exit_status}**`,
    ``,
    `## Totals`,
    ``,
    `| metric | value |`,
    `|---|---|`,
    `| attempted | ${rows.length} |`,
    `| sent | ${sent.length} |`,
    `| failed | ${failed.length} |`,
    `| skipped | ${skipped.length} |`,
    ``,
    `## Per-customer rows`,
    ``,
    `| email | subscription_id | price_id | resend_message_id | status | reason |`,
    `|---|---|---|---|---|---|`,
    ...rows.map((r) => `| ${esc(r.email)} | ${esc(r.subscription_id)} | ${esc(r.price_id)} | ${esc(r.resend_message_id) || "—"} | ${r.status} | ${esc(r.reason) || "—"} |`),
  ];
  writeFile(RESULTS_FILE, lines.join("\n"));
  log(`Wrote ${RESULTS_FILE}`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  const flags = parseFlags(process.argv);
  if (flags.help) {
    console.log(usage());
    process.exit(0);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
  }
  if (!STRIPE_SECRET_KEY) {
    console.error("Missing STRIPE_SECRET_KEY");
    process.exit(1);
  }
  if (FOUNDING_PRICE_IDS.length === 0) {
    console.error("FOUNDING_PRICE_IDS empty — set STRIPE_PRICE_FOUNDING_YEARLY");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // Routing
  if (flags.dryRun && !flags.live) {
    await runPhase1(supabase, stripe);
    return;
  }
  if (flags.live && flags.customer) {
    await runPhase2(supabase, stripe, flags.customer);
    return;
  }
  if (flags.live && !flags.customer) {
    await runPhase3(supabase, stripe, flags.limit);
    return;
  }
  console.error("Unknown flag combination.\n" + usage());
  process.exit(2);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
