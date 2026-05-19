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
//     [--note "<custom paragraph 2>"]
//
// Sends the PDF via Resend with a standard delivery email.
// Requires RESEND_API_KEY in env (use .env.local or netlify env).
// ============================================================

const fs = require("fs");
const path = require("path");

const FROM = "mary@missionmeetstech.com";
const DEFAULT_NOTE = "This memo is confidential to you. Reply with questions or follow-on memo tier requests.";

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

async function main() {
  const args = parseArgs(process.argv);
  const required = ["to", "name", "pdf", "topic"];
  const missing = required.filter((k) => !args[k]);
  if (missing.length) {
    die(`missing required flag(s): ${missing.map((m) => "--" + m).join(", ")}\n\nUsage:\n  node scripts/send-deepdive.js --to <email> --name <first-name> --pdf <abs-path> --topic "<topic>" [--note "<custom paragraph 2>"]`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) die("RESEND_API_KEY not set");

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
