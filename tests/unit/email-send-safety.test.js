import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Regression guards for the 2026-07-07 email incidents:
//  1. The Capture Corner cron double-fired AND BCC'd Mary on every recipient
//     (adminCopy + ADMIN_BCC_EMAILS), flooding both her inboxes.
//  2. The free newsletter announced a "Latest podcast" episode that did not
//     exist — it read the ARTICLE feed (/feed.xml) and mislabeled the newest
//     article as a podcast episode.
// These are structural (source-level) assertions: they fail fast if anyone
// reintroduces the exact patterns, without needing to invoke the crons.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FN_DIR = path.join(__dirname, "..", "..", "netlify", "functions");
const read = (f) => fs.readFileSync(path.join(FN_DIR, f), "utf8");

// Every function that sends customer email in a per-recipient loop.
const BULK_SENDERS = [
  "capture-corner-autosend.js",
  "premium-brief-send.js",
  "monthly-brief-send.js",
  "capture-corner-send.js",
  "rhrp-special-report-send.js",
  "premium-digest-send.js",
];

// Scheduled (cron) senders must claim idempotency BEFORE the send loop, because
// Netlify delivers scheduled functions at-least-once (~14s apart). Each entry:
// the claim anchor string and the recipient-loop anchor string.
const SCHEDULED_CLAIM_BEFORE_LOOP = [
  { file: "capture-corner-autosend.js", claim: 'status: "sending"', loop: "for (const r of recipients)" },
  { file: "premium-brief-send.js", claim: "BRIEF_CLAIMED", loop: "for (const recipient of recipients)" },
  { file: "monthly-brief-send.js", claim: "BRIEF_CLAIMED", loop: "for (const recipient of recipients)" },
  { file: "premium-digest-send.js", claim: "DIGEST_CLAIMED", loop: "for (const sub of subscribers)" },
];

describe("email send safety — no admin BCC multiplier", () => {
  it.each(BULK_SENDERS)("%s does not pass adminCopy:true (would BCC admin on every recipient)", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/adminCopy:\s*true/);
  });
});

describe("email send safety — scheduled senders claim idempotency before the send loop", () => {
  it.each(SCHEDULED_CLAIM_BEFORE_LOOP)("$file writes its claim before the recipient loop", ({ file, claim, loop }) => {
    const src = read(file);
    const claimIdx = src.indexOf(claim);
    const loopIdx = src.indexOf(loop);
    expect(claimIdx, `claim anchor "${claim}" not found in ${file}`).toBeGreaterThan(-1);
    expect(loopIdx, `loop anchor "${loop}" not found in ${file}`).toBeGreaterThan(-1);
    expect(claimIdx, `${file}: idempotency claim must precede the send loop`).toBeLessThan(loopIdx);
  });
});

describe("email send safety — newsletter never announces a non-existent podcast", () => {
  // Strip line comments so the guard targets executable code, not the NOTE that
  // documents why the podcast block was removed.
  const src = read("newsletter-send.js").replace(/^\s*\/\/.*$/gm, "");

  it("never writes a podcast reference into the email body", () => {
    // The bug: `body += '## Latest podcast ...'` built from the ARTICLE feed
    // (/feed.xml). Any line that appends podcast content to the email body is
    // the failure mode, regardless of which feed it reads.
    expect(src).not.toMatch(/body\s*\+=[^\n]*podcast/i);
  });

  it("does not read the article feed to derive podcast content", () => {
    expect(src).not.toMatch(/podcast[\s\S]{0,300}feed\.xml/i);
    expect(src).not.toMatch(/feed\.xml[\s\S]{0,300}podcast/i);
  });
});
