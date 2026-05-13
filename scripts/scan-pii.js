#!/usr/bin/env node
// scan-pii.js — Sprint A (2026-05-13) PII scan gate.
//
// Walks scripts/, data/, reports/, and CLAUDE.md. Fails (exit 1)
// if any file contains:
//   • Customer-style email addresses (NOT mary@missionmeetstech.com,
//     support@missionmeetstech.com, or noreply@anthropic.com which are
//     legitimate operator/system addresses)
//   • Stripe IDs (sub_XXX, py_XXX, ch_XXX, cus_XXX, in_XXX, pi_XXX)
//   • "paid TWICE" / "fix-premium-customers-20260426" markers from the
//     prior PII-bearing reports
//
// Allowlist:
//   • mary@missionmeetstech.com, support@missionmeetstech.com,
//     mary@*.mmt, *@anthropic.com, *@example.com / *@example.org
//   • Files under private/ are gitignored and not scanned
//
// This script does not visit URLs, hit Supabase, or call any LLM. It
// is a pure text scan.

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const TARGETS = ["scripts", "data", "reports", "CLAUDE.md"];

const ALLOW_EMAIL = new Set([
  "mary@missionmeetstech.com",
  "support@missionmeetstech.com",
  "premium@missionmeetstech.com",
  "noreply@anthropic.com",
  "maryadawson@gmail.com", // operator's own email (used as BCC target)
]);
const ALLOW_EMAIL_PATTERNS = [
  /@anthropic\.com$/i,
  /@example\.(com|org|net)$/i,
  /@missionmeetstech\.com$/i, // operator-owned namespace
  // Government POCs in agency-profiles + idiq-vehicles are public-record
  // operator-curated contacts (program offices, OASD, OIG, etc.). Not
  // customer PII. Skipped from the scanner so they don't false-fail.
  /@[a-z0-9.-]+\.gov$/i,
  /@[a-z0-9.-]+\.mil$/i,
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const STRIPE_RE = /\b(sub_|py_|ch_|cus_|in_|pi_)[A-Za-z0-9]{14,}/g;
const KILL_MARKER_RE = /paid TWICE|fix-premium-customers-20260426/gi;

function isAllowedEmail(email) {
  if (ALLOW_EMAIL.has(email.toLowerCase())) return true;
  for (const re of ALLOW_EMAIL_PATTERNS) {
    if (re.test(email)) return true;
  }
  return false;
}

const findings = [];

function scanText(file, text) {
  let m;
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(text)) !== null) {
    const email = m[0];
    if (!isAllowedEmail(email)) {
      findings.push({ file, type: "customer_email", token: email });
    }
  }
  STRIPE_RE.lastIndex = 0;
  while ((m = STRIPE_RE.exec(text)) !== null) {
    findings.push({ file, type: "stripe_id", token: m[0] });
  }
  KILL_MARKER_RE.lastIndex = 0;
  while ((m = KILL_MARKER_RE.exec(text)) !== null) {
    findings.push({ file, type: "kill_marker", token: m[0] });
  }
}

function walk(p) {
  let stat;
  try { stat = fs.statSync(p); } catch { return; }
  if (stat.isDirectory()) {
    const base = path.basename(p);
    if (base === "node_modules" || base === ".git" || base === "dist" || base === "private") return;
    for (const child of fs.readdirSync(p)) walk(path.join(p, child));
    return;
  }
  if (!stat.isFile()) return;
  // Skip the scanner file itself (its regex literals would otherwise
  // match as kill_markers / Stripe ID patterns).
  if (path.basename(p) === "scan-pii.js") return;
  // Skip lockfiles, images, binaries
  const ext = path.extname(p).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".pdf", ".mp4", ".zip", ".woff", ".woff2", ".ttf", ".ico", ".lock"].includes(ext)) return;
  let text;
  try { text = fs.readFileSync(p, "utf8"); } catch { return; }
  scanText(path.relative(REPO, p), text);
}

for (const t of TARGETS) walk(path.join(REPO, t));

if (findings.length) {
  console.error(`scan-pii: FAIL — ${findings.length} PII / sensitive token(s) found in repo`);
  // Group by file for readability
  const byFile = {};
  for (const f of findings) {
    (byFile[f.file] = byFile[f.file] || []).push(f);
  }
  for (const file of Object.keys(byFile).sort()) {
    console.error(`  ${file}:`);
    for (const f of byFile[file]) {
      console.error(`    [${f.type}] ${f.token}`);
    }
  }
  console.error("");
  console.error("Resolution: redact customer emails / Stripe IDs to placeholder text,");
  console.error("or move PII-bearing files to private/ (gitignored).");
  process.exit(1);
}

console.log(`scan-pii: OK — no customer PII / Stripe IDs / kill markers in scripts/, data/, reports/, or CLAUDE.md`);
