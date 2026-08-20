#!/usr/bin/env node
// ============================================================
// change-member-email.js — operator CLI to move a member account
// from one email address to another.
//
// Dry-run by default. Nothing is written until you pass --apply.
//
//   # preview (writes nothing)
//   netlify dev:exec node scripts/change-member-email.js \
//     --from old@example.com --to new@example.com
//
//   # apply
//   netlify dev:exec node scripts/change-member-email.js \
//     --from old@example.com --to new@example.com --apply
//
// Runs the same lib/email-migration core the self-serve settings flow
// uses, so an operator fix and a member-initiated change touch exactly
// the same surfaces. See that file for the Stripe durability rule.
// ============================================================

const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const {
  migrateMemberEmail,
} = require(path.join(__dirname, "..", "netlify", "functions", "lib", "email-migration"));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}

(async () => {
  const from = arg("from");
  const to = arg("to");
  const apply = process.argv.includes("--apply");

  if (!from || !to) {
    console.error("Usage: change-member-email.js --from <old@x> --to <new@x> [--apply]");
    process.exit(2);
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY, BUTTONDOWN_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. Run under `netlify dev:exec`.");
    process.exit(1);
  }
  if (!STRIPE_SECRET_KEY) {
    // Not fatal, but loud: without Stripe the hourly sync reverts the change.
    console.error("WARNING: STRIPE_SECRET_KEY not set. The Stripe customer email will NOT be");
    console.error("updated, and stripe-subscriber-sync will revert this change within the hour.");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"}: ${from} -> ${to}\n`);

  const result = await migrateMemberEmail({
    supabase,
    stripe,
    buttondownKey: BUTTONDOWN_API_KEY,
    from,
    to,
    dryRun: !apply,
    actor: `cli:${process.env.USER || "operator"}`,
  });

  for (const s of result.steps) {
    console.log(`  ${s.ok ? "ok  " : "FAIL"} ${s.surface.padEnd(22)} ${s.action.padEnd(20)} ${s.detail || ""}`);
  }

  if (!result.ok) {
    console.error(`\nRESULT: FAILED — ${result.error}`);
    process.exit(1);
  }

  console.log(`\nRESULT: ${apply ? "APPLIED" : "DRY RUN OK"} — ${result.from} -> ${result.to}`);
  if (!apply) console.log("Re-run with --apply to write.");
})().catch((e) => {
  console.error("change-member-email failed:", e.message);
  process.exit(1);
});
