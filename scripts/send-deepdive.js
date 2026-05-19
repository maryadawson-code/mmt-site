#!/usr/bin/env node
// ============================================================
// send-deepdive.js — Custom Deep Dive delivery CLI
//
// Usage:
//   node scripts/send-deepdive.js \
//     --to <email> \
//     --name <first-name> \
//     --pdf <abs-path> \
//     --topic "<topic>" \
//     [--note "<custom paragraph 2>"] \
//     [--comp "<reason>"]    # bypass payment check (logged)
//
// Sends the PDF via Resend with a standard delivery email.
// Requires RESEND_API_KEY in env.
//
// PAYMENT GATE (default ON): refuses to send unless a paid Stripe
// checkout session exists for --to with the Custom Deep Dive price
// in the last 30 days. Override with --comp "<reason>" — that
// records the comp reason in the send log and skips the gate.
// Requires STRIPE_SECRET_KEY + STRIPE_DEEPDIVE_PRICE_ID in env.
//
// History: 2026-05-19 — added the gate after two paid-product
// sends (Colin Mitchell, Matt Beirne) went out before payment was
// received. The fix is the gate, not human discipline.
// ============================================================

const fs = require("fs");
const path = require("path");

const FROM = "mary@missionmeetstech.com";
const DEFAULT_NOTE = "This memo is confidential to you. Reply with questions or follow-on memo tier requests.";
const PAYMENT_LOOKBACK_DAYS = 30;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith("--")) ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

function die(msg, code = 1) {
  console.error(`send-deepdive: ${msg}`);
  process.exit(code);
}

async function verifyPaidSession(email) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_DEEPDIVE_PRICE_ID;
  if (!stripeKey) return { ok: false, reason: "STRIPE_SECRET_KEY not set — cannot verify payment. Set the env var or pass --comp" };
  if (!priceId) return { ok: false, reason: "STRIPE_DEEPDIVE_PRICE_ID not set — cannot verify which product was bought. Set the env var or pass --comp" };

  const Stripe = require("stripe");
  const stripe = new Stripe(stripeKey);
  const since = Math.floor((Date.now() - PAYMENT_LOOKBACK_DAYS * 86400 * 1000) / 1000);
  const target = email.toLowerCase().trim();

  let starting_after;
  for (let page = 0; page < 5; page++) {
    const list = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: since },
      ...(starting_after ? { starting_after } : {}),
    });
    for (const s of list.data) {
      const sEmail = (s.customer_details && s.customer_details.email || s.customer_email || "").toLowerCase().trim();
      if (sEmail !== target) continue;
      if (s.payment_status !== "paid") continue;
      // Confirm price.id match — retrieve line items for this session.
      try {
        const items = await stripe.checkout.sessions.listLineItems(s.id, { limit: 10 });
        const match = items.data.find((li) => li.price && li.price.id === priceId);
        if (match) {
          return { ok: true, session_id: s.id, amount_total: s.amount_total, created: new Date(s.created * 1000).toISOString() };
        }
      } catch (_) { /* skip */ }
    }
    if (!list.has_more) break;
    starting_after = list.data[list.data.length - 1] && list.data[list.data.length - 1].id;
  }
  return { ok: false, reason: `no paid Custom Deep Dive checkout session found for ${target} in the last ${PAYMENT_LOOKBACK_DAYS} days` };
}

async function main() {
  const args = parseArgs(process.argv);
  const required = ["to", "name", "pdf", "topic"];
  const missing = required.filter((k) => !args[k]);
  if (missing.length) {
    die(`missing required flag(s): ${missing.map((m) => "--" + m).join(", ")}\n\nUsage:\n  node scripts/send-deepdive.js --to <email> --name <first-name> --pdf <abs-path> --topic "<topic>" [--note "<custom paragraph 2>"] [--comp "<reason>"]`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) die("RESEND_API_KEY not set");

  // Payment gate — default ON, bypass via --comp "<reason>".
  if (args.comp && args.comp !== "true") {
    console.log(`send-deepdive: payment gate BYPASSED via --comp "${args.comp}"`);
  } else {
    const v = await verifyPaidSession(args.to);
    if (!v.ok) {
      die(`payment gate FAILED: ${v.reason}\n\nIf this is intentional (e.g. comp, manual invoice, off-Stripe payment), re-run with:\n  --comp "<short reason>"`);
    }
    console.log(`send-deepdive: payment verified — session ${v.session_id} paid $${(v.amount_total / 100).toFixed(2)} on ${v.created}`);
  }

  const pdfPath = path.resolve(args.pdf);
  if (!fs.existsSync(pdfPath)) die(`PDF not found at ${pdfPath}`);
  if (path.extname(pdfPath).toLowerCase() !== ".pdf") die(`expected .pdf, got ${path.extname(pdfPath)}`);

  const pdfBuf = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuf.toString("base64");
  const pdfFilename = path.basename(pdfPath);

  const note = args.note || DEFAULT_NOTE;
  const subject = `Your Mission Meets Tech Custom Deep Dive — ${args.topic}`;
  const text = `${args.name},

Custom Deep Dive attached: "${args.topic}".

${note}

Reply with questions, pushback, or follow-on memo tier requests.

— Mary

Mary A. Dawson
Mission Meets Tech`;

  const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const html = `<pre style="font-family:'Inter',-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#0A192F;white-space:pre-wrap;word-wrap:break-word;">${esc(text)}</pre>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `Mary at Mission Meets Tech <${FROM}>`,
      to: [args.to],
      subject,
      html,
      text,
      attachments: [{ filename: pdfFilename, content: pdfBase64 }],
    }),
  });

  const body = await res.text();
  if (!res.ok) die(`Resend ${res.status}: ${body}`, 2);

  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = {}; }
  console.log(`SENT to=${args.to} topic="${args.topic}" pdf=${pdfFilename} resend_id=${parsed.id || "(unknown)"}`);
}

main().catch((e) => die(`uncaught: ${e.message}`, 3));
