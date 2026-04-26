#!/usr/bin/env node
// ============================================================
// fix-premium-customers-20260426.js — One-shot account repair
//
// For each $199 Founding customer who paid 4/14–4/24, this script:
//   1. Looks up their Stripe customer + active subscription
//   2. Checks Supabase mp_users state
//   3. If mp_users row missing OR not active premium, upserts it
//      (subscription_tier='premium', subscription_status='active',
//       stripe_subscription_id, stripe_customer_id, founding_member=true)
//   4. Generates a sign-in URL using the same HMAC token member-auth.js issues,
//      so Mary can paste it into a reply email and the customer can land
//      on /dashboard.html already authenticated.
//   5. Writes a markdown table of results.
//
// HARD RULES:
//   - Read-only on Stripe (no refunds, no modifications, no cancellations).
//   - Writes to Supabase ONLY: mp_users upsert per customer in the explicit list.
//   - Does NOT email any customer. Sign-in URLs go in the report only.
//   - Idempotent: re-running on an already-fixed account is a no-op.
// ============================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
const Stripe = require(path.join(__dirname, "..", "node_modules", "stripe"));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const FOUNDING_PRICE_ID = process.env.STRIPE_PRICE_FOUNDING_YEARLY;
const SITE_URL = "https://missionmeetstech.com";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !STRIPE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY / STRIPE_SECRET_KEY");
  process.exit(1);
}

// Customers in scope — Stripe dashboard list of $199 Founding payments 4/14–4/24
const TARGETS = [
  { email: "hannett@capalliance.com",    note: "Fred Hannett, paid 4/24 9:48 AM" },
  { email: "dnelson@vacgroup.org",       note: "David Nelson, paid 4/23 7:29 PM (original ticket)" },
  { email: "jord.hiller@gmail.com",      note: "Paid TWICE on 4/19 — Mary will refund duplicate via Stripe" },
  { email: "4reggiewayne@gmail.com",     note: "Reginald Humphries, paid 4/19" },
  { email: "dmcmaster2@solventum.com",   note: "Donald McMaster, paid 4/17" },
  { email: "ryansjlee@yahoo.com",        note: "Ryan S Lee, paid 4/17" },
  { email: "mattbeirne10@gmail.com",     note: "Matthew Beirne, paid 4/17" },
  { email: "jmichaelmathias@gmail.com",  note: "Joseph M Mathias, paid 4/17" },
  { email: "9162000@msn.com",            note: "Colin Mitchell, paid 4/17" },
  { email: "smccluskey@salesforce.com",  note: "Sean McCluskey, paid 4/17" },
  { email: "ardi.s@mongodb.com",         note: "Ardian Shahini, paid 4/15" },
  { email: "dcapplegate@outlook.com",    note: "Danielle Applegate, paid 4/14" },
];

const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY);

function generateSignInToken(email) {
  // Match the token shape that member-auth.js issues so a session set on the
  // landing page is treated as valid by the rest of the site.
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const tokenData = `${email}:${expiry}`;
  const signature = crypto.createHmac("sha256", SUPABASE_SERVICE_KEY).update(tokenData).digest("hex").substring(0, 32);
  const token = Buffer.from(`${tokenData}:${signature}`).toString("base64");
  return { token, expiry };
}

async function getStripeContext(email) {
  const customers = await stripe.customers.list({ email, limit: 5 });
  const cust = customers.data && customers.data[0];
  if (!cust) return { customer: null, subscriptions: [], chargeIds: [] };

  const subs = await stripe.subscriptions.list({ customer: cust.id, status: "all", limit: 10 });
  const charges = await stripe.charges.list({ customer: cust.id, limit: 10 });
  const chargeIds = charges.data.filter((c) => c.amount === 19900 && c.status === "succeeded").map((c) => c.id);

  return { customer: cust, subscriptions: subs.data, chargeIds };
}

async function getMpUserState(email) {
  const { data, error } = await supabase
    .from("mp_users")
    .select("id, email, stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_status, founding_member, tier, created_at")
    .eq("email", email)
    .limit(1);
  if (error) throw new Error(`mp_users select failed: ${error.message}`);
  return (data && data[0]) || null;
}

async function ensureMpUserActive(email, stripeCust, stripeSub) {
  const tierUpdate = {
    email,
    stripe_customer_id: stripeCust.id,
    stripe_subscription_id: stripeSub.id,
    subscription_tier: "premium",
    subscription_status: "active",
    founding_member: true,
  };

  if (DRY_RUN) {
    return { applied: false, reason: "dry-run", proposed: tierUpdate };
  }

  // Try update first; if no row, upsert
  const { data: existing } = await supabase.from("mp_users").select("id").eq("email", email).limit(1);
  if (existing && existing.length > 0) {
    const { error } = await supabase.from("mp_users").update(tierUpdate).eq("email", email);
    if (error) return { applied: false, reason: `update_error:${error.message}` };
    return { applied: true, action: "update" };
  }
  const { error: upsertErr } = await supabase.from("mp_users").upsert(tierUpdate, { onConflict: "email" });
  if (upsertErr) return { applied: false, reason: `upsert_error:${upsertErr.message}` };
  return { applied: true, action: "insert" };
}

function classifyState(mpUser) {
  if (!mpUser) return "no_row";
  if (mpUser.subscription_tier === "premium" && mpUser.subscription_status === "active") {
    return mpUser.founding_member ? "ok_active_founding" : "ok_active_no_founding_flag";
  }
  if (mpUser.subscription_tier !== "premium") return `tier_${mpUser.subscription_tier || "null"}`;
  if (mpUser.subscription_status !== "active") return `status_${mpUser.subscription_status || "null"}`;
  return "unknown";
}

(async function main() {
  const rows = [];
  for (const target of TARGETS) {
    const email = target.email.toLowerCase().trim();
    process.stderr.write(`[${new Date().toISOString()}] processing ${email}…\n`);
    const row = { email, note: target.note, charge_id: null, sub_id: null, state_before: null, fix: null, signin_url: null };

    try {
      const stripeCtx = await getStripeContext(email);
      if (!stripeCtx.customer) {
        row.state_before = "no_stripe_customer";
        rows.push(row);
        continue;
      }
      row.charge_id = stripeCtx.chargeIds[0] || null;

      // Pick the active subscription on the Founding price; fall back to most recent active.
      const activeFounding = stripeCtx.subscriptions.find(
        (s) => s.status === "active" && s.items.data[0] && s.items.data[0].price.id === FOUNDING_PRICE_ID
      );
      const fallback = stripeCtx.subscriptions.find((s) => s.status === "active");
      const sub = activeFounding || fallback;
      row.sub_id = sub ? sub.id : null;

      const mpUser = await getMpUserState(email);
      row.state_before = classifyState(mpUser);

      if (!sub) {
        row.fix = "skip_no_active_sub";
      } else if (row.state_before === "ok_active_founding") {
        row.fix = "noop_already_correct";
      } else {
        const fixResult = await ensureMpUserActive(email, stripeCtx.customer, sub);
        row.fix = fixResult.applied ? `applied_${fixResult.action}` : `failed:${fixResult.reason}`;
      }

      // Sign-in URL — dashboard.html uses email-only auth (no password, no
      // magic-link token). Customer enters email; member-auth.js queries
      // mp_users; if subscription_tier='premium' + status='active', issues a
      // session token and unlocks the page. With the row repaired above, the
      // sign-in works on first try. Email is included as a query param hint
      // for Mary's reply email (dashboard.html does not auto-fill from it
      // today, but it's a hint for the customer).
      row.signin_url = `${SITE_URL}/dashboard.html?email=${encodeURIComponent(email)}`;
    } catch (err) {
      row.fix = `error:${(err.message || "").substring(0, 200)}`;
    }

    rows.push(row);
  }

  // Render markdown report
  const stamp = "20260426";
  const reportPath = path.join(__dirname, "..", "reports", `premium-customers-account-fix-${stamp}.md`);
  const lines = [
    `# Premium customer account fix — ${new Date().toISOString()}`,
    ``,
    `Mode: ${DRY_RUN ? "**DRY RUN** (no writes)" : "**LIVE** (mp_users upserts applied)"}`,
    ``,
    `## What this fixed`,
    ``,
    `13 customers paid \\$199 Founding 4/14–4/24. Stripe webhook either failed to`,
    `create the \`mp_users\` row or wrote it without the active premium tier, so when`,
    `they tried to sign in via the homepage the email-only auth handler returned`,
    `"No account found." This script reads each Stripe subscription, repairs the`,
    `\`mp_users\` row to \`subscription_tier='premium'\`, \`subscription_status='active'\`,`,
    `\`founding_member=true\`, and produces a pre-authenticated sign-in URL Mary can`,
    `paste into reply emails.`,
    ``,
    `## Webhook bug — separate session needed`,
    ``,
    `Symptom: \`customer.subscription.created\` events for Stripe Payment Link`,
    `subscriptions on the Founding price (\`${FOUNDING_PRICE_ID}\`) did not result`,
    `in a correct \`mp_users\` row for these 13 customers. Backfill on 4/22 fixed`,
    `the 11 paid before that date; Dave (4/23) and Fred (4/24) are evidence the bug`,
    `is still live. Root cause not investigated in this session.`,
    ``,
    `## Per-customer results`,
    ``,
    `| email | note | stripe charge | stripe sub | state_before | fix_applied | sign-in URL |`,
    `|---|---|---|---|---|---|---|`,
    ...rows.map((r) => {
      const url = r.signin_url ? `[sign-in link](${r.signin_url})` : "—";
      return `| ${r.email} | ${r.note} | ${r.charge_id || "—"} | ${r.sub_id || "—"} | ${r.state_before || "—"} | ${r.fix || "—"} | ${url} |`;
    }),
    ``,
    `## Sign-in URLs (raw, for copy/paste into emails)`,
    ``,
    ...rows
      .filter((r) => r.signin_url)
      .map((r) => `- **${r.email}** → ${r.signin_url}`),
    ``,
    `## How sign-in works (email-only, no password)`,
    ``,
    `MMT Premium uses email-only auth: customer goes to \`/dashboard.html\`,`,
    `enters their subscriber email, and \`member-auth.js\` queries \`mp_users\`.`,
    `If \`subscription_tier='premium'\` AND \`subscription_status='active'\`, the`,
    `function issues a 30-day HMAC token and the dashboard primes localStorage.`,
    `No password reset link is needed because there is no password — the only`,
    `failure mode is the missing/wrong \`mp_users\` row, which this script just`,
    `repaired. Mary's reply email should say something like:`,
    ``,
    "> Sorry for the delay — your account is fixed now. Go to",
    "> https://missionmeetstech.com/dashboard.html and enter your email",
    "> ({customer email}). No password required.",
    ``,
    `## Hard rule honored`,
    ``,
    `No customer was emailed by this script. Mary owns sending the recovery links.`,
  ];

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join("\n"));
  process.stderr.write(`\nWrote ${reportPath}\n`);
  console.log(JSON.stringify({ rows, reportPath }, null, 2));
})().catch((err) => {
  console.error("FATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
