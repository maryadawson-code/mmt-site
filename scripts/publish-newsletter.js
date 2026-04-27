#!/usr/bin/env node
// publish-newsletter.js
//
// The "send to production" mechanism for Mary's Claude Project. Reads a
// production payload (JSON) and, if it validates, writes a markdown file
// under content/newsletter/. The GitHub Actions workflow at
// .github/workflows/publish-newsletter-production.yml is what actually
// commits + opens a PR (or, with explicit acknowledgement, lands on main).
//
// HARD RULES (enforced here AND in the workflow):
//   - status MUST be "production_approved"
//   - approval_phrase MUST be "send_to_production"
//   - send_email is IGNORED unless a separate workflow runs with the
//     "send email newsletter" phrase
//   - duplicate slug or duplicate issue_number aborts
//
// Usage:
//   node scripts/publish-newsletter.js --input payload.json
//   node scripts/publish-newsletter.js --stdin < payload.json
//   node scripts/publish-newsletter.js --input payload.json --dry-run
//   node scripts/publish-newsletter.js --input payload.json --production-approved

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NEWSLETTER_DIR = path.join(ROOT, "content/newsletter");
const SCHEMA_PATH = path.join(ROOT, "docs/newsletter-production-payload.schema.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt  = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const DRY_RUN     = flag("--dry-run");
const PROD_APPROVED = flag("--production-approved");
const INPUT_PATH  = opt("--input");
const STDIN_MODE  = flag("--stdin");

function die(msg, code = 1) {
  console.error(`publish-newsletter: ${msg}`);
  process.exit(code);
}

function readPayload() {
  if (STDIN_MODE) {
    return fs.readFileSync(0, "utf8");
  }
  if (!INPUT_PATH) die("--input <payload.json> or --stdin required");
  if (!fs.existsSync(INPUT_PATH)) die(`payload not found: ${INPUT_PATH}`);
  return fs.readFileSync(INPUT_PATH, "utf8");
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function quoteString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function yamlBlock(payload) {
  const lines = [];
  lines.push(`title: ${quoteString(payload.title)}`);
  lines.push(`date: ${payload.publish_date}`);
  lines.push(`slug: ${payload.slug || slugify(payload.title)}`);
  if (payload.dek) lines.push(`dek: ${quoteString(payload.dek)}`);
  lines.push(`description: ${quoteString(payload.description)}`);
  if (payload.author) lines.push(`author: ${quoteString(payload.author)}`);
  if (payload.canonical_category) lines.push(`category: ${payload.canonical_category}`);
  if (payload.issue_number) lines.push(`issue_number: ${payload.issue_number}`);
  if (payload.visibility) lines.push(`visibility: ${payload.visibility}`);
  if (payload.social_title)     lines.push(`social_title: ${quoteString(payload.social_title)}`);
  if (payload.seo_title)        lines.push(`seo_title: ${quoteString(payload.seo_title)}`);
  if (payload.meta_description) lines.push(`meta_description: ${quoteString(payload.meta_description)}`);
  if (payload.podcast_episode)  lines.push(`podcast_episode: ${quoteString(payload.podcast_episode)}`);
  if (payload.confidence_label) lines.push(`confidence_label: ${quoteString(payload.confidence_label)}`);
  if (payload.capture_window)   lines.push(`capture_window: ${quoteString(payload.capture_window)}`);
  const arr = (label, values) => {
    if (!Array.isArray(values) || values.length === 0) return;
    lines.push(`${label}:`);
    for (const v of values) lines.push(`  - ${quoteString(v)}`);
  };
  arr("tags", payload.tags);
  arr("topics", payload.topics);
  arr("agencies", payload.related_agencies);
  arr("contracts", payload.related_contracts);
  arr("source_links", payload.source_links);
  arr("premium_notes", payload.premium_notes);
  arr("linkedin_drafts", payload.linkedin_drafts);
  if (payload.capture_corner_teaser) {
    lines.push(`capture_corner_teaser: ${quoteString(payload.capture_corner_teaser)}`);
  }
  if (Array.isArray(payload.capture_corner) && payload.capture_corner.length) {
    lines.push("capture_corner:");
    for (const item of payload.capture_corner) lines.push(`  - ${quoteString(item)}`);
  }
  return lines.join("\n");
}

function existingSlugs() {
  if (!fs.existsSync(NEWSLETTER_DIR)) return new Set();
  const out = new Set();
  for (const f of fs.readdirSync(NEWSLETTER_DIR)) {
    if (!f.endsWith(".md") || f.startsWith("_")) continue;
    const base = f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
    out.add(base);
  }
  return out;
}

function existingIssueNumbers() {
  if (!fs.existsSync(NEWSLETTER_DIR)) return new Set();
  const out = new Set();
  for (const f of fs.readdirSync(NEWSLETTER_DIR)) {
    if (!f.endsWith(".md") || f.startsWith("_")) continue;
    const txt = fs.readFileSync(path.join(NEWSLETTER_DIR, f), "utf8");
    const m = txt.match(/^issue_number:\s*(\d+)/m);
    if (m) out.add(parseInt(m[1], 10));
  }
  return out;
}

// Inline JSON-Schema-lite validator. We don't pull in ajv to keep the
// publish path zero-dep beyond what build.js already uses.
function validatePayload(p) {
  const errors = [];
  const required = ["title", "description", "body_markdown", "publish_date", "status", "approval_phrase", "visibility"];
  for (const k of required) {
    if (p[k] === undefined || p[k] === null || p[k] === "") errors.push(`missing required field: ${k}`);
  }
  if (p.title && (p.title.length < 5 || p.title.length > 200)) errors.push("title length must be 5..200");
  if (p.description && (p.description.length < 20 || p.description.length > 320)) errors.push("description length must be 20..320");
  if (p.body_markdown && p.body_markdown.length < 200) errors.push("body_markdown must be at least 200 chars");
  if (p.body_markdown && /^---$/m.test(p.body_markdown)) errors.push("body_markdown must NOT include `---` frontmatter delimiters");
  if (p.publish_date && !/^\d{4}-\d{2}-\d{2}$/.test(p.publish_date)) errors.push("publish_date must be YYYY-MM-DD");
  if (p.status !== "production_approved") errors.push(`status must be "production_approved" (got: ${JSON.stringify(p.status)})`);
  if (p.approval_phrase !== "send_to_production") errors.push(`approval_phrase must be "send_to_production" (got: ${JSON.stringify(p.approval_phrase)})`);
  if (p.visibility && !["public", "premium", "founding"].includes(p.visibility)) errors.push("visibility must be public|premium|founding");
  if (p.canonical_category && !["analysis", "deep-dive", "rapid-response", "field-notes", "explainer"].includes(p.canonical_category)) errors.push("canonical_category invalid");
  if (p.confidence_label && !["FACT", "Inferred", "MMT Analysis"].includes(p.confidence_label)) errors.push("confidence_label must be FACT|Inferred|MMT Analysis");
  if (p.publish_mode && !["pr", "direct_to_main"].includes(p.publish_mode)) errors.push("publish_mode must be pr|direct_to_main");
  if (p.publish_mode === "direct_to_main" && p.direct_to_main_acknowledgement !== "I authorize direct main publish for this issue") {
    errors.push("publish_mode=direct_to_main requires the exact direct_to_main_acknowledgement string");
  }
  if (p.send_email) {
    // Allowed in payload, but the publisher script never sends. The
    // separate "send email newsletter" workflow handles delivery.
    console.warn("publish-newsletter: WARN — send_email=true ignored. Email sends are gated on the separate `send email newsletter` workflow.");
  }
  return errors;
}

function main() {
  const raw = readPayload();
  let payload;
  try { payload = JSON.parse(raw); }
  catch (err) { die(`payload is not valid JSON: ${err.message}`); }

  const errors = validatePayload(payload);
  if (errors.length) {
    console.error("publish-newsletter: validation FAILED");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(2);
  }

  const slug = payload.slug || slugify(payload.title);
  const filename = `${payload.publish_date}-${slug}.md`;
  const outPath = path.join(NEWSLETTER_DIR, filename);

  if (existingSlugs().has(slug)) {
    die(`slug already exists: ${slug}. Either rename or remove the existing file.`);
  }
  if (payload.issue_number && existingIssueNumbers().has(payload.issue_number)) {
    die(`issue_number ${payload.issue_number} already exists`);
  }

  const yaml = yamlBlock(payload);
  const md = `---\n${yaml}\n---\n\n${payload.body_markdown.trim()}\n`;

  if (DRY_RUN) {
    console.log(`publish-newsletter: DRY RUN — would write ${path.relative(ROOT, outPath)}`);
    console.log(`  slug:        ${slug}`);
    console.log(`  filename:    ${filename}`);
    console.log(`  body bytes:  ${payload.body_markdown.length}`);
    console.log(`  visibility:  ${payload.visibility}`);
    if (payload.publish_mode === "direct_to_main") {
      console.log(`  publish_mode: direct_to_main (workflow will commit straight to main)`);
    } else {
      console.log(`  publish_mode: pr (default — workflow will open a pull request)`);
    }
    process.exit(0);
  }

  if (!PROD_APPROVED) {
    die("missing --production-approved. The script will not write to content/newsletter/ unless this flag is passed AND status=production_approved AND approval_phrase=send_to_production.");
  }

  fs.writeFileSync(outPath, md);
  console.log(`publish-newsletter: ✓ wrote ${path.relative(ROOT, outPath)} (${md.length} bytes)`);
  console.log(`Next: commit + push (or let the GH Actions workflow handle it).`);
}

main();
