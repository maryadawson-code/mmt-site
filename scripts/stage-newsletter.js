#!/usr/bin/env node
// ============================================================================
// stage-newsletter.js — one-command staging for a twice-weekly newsletter drop.
//
// Turns a small per-issue manifest into the full cascade that a Friday/Tuesday
// issue needs, so staging is deterministic instead of ~30 hand steps:
//   1. optimize + place the cover + in-body graphics into
//      static/images/newsletter/<date>/
//   2. assemble content/newsletter/<date>-<slug>.md  (frontmatter + cover +
//      # title + dek + optional co-author byline + body from the source md,
//      with each graphic inserted immediately AFTER its "after" sentence)
//   3. render the companion Capture Corner to
//      premium/briefs/capture-corner-<date>.html (models on the newest prior
//      CC file; renders the CC markdown via marked; swaps header/pills/gate/
//      deep-dive)
//   4. re-point /capture-corner/latest in netlify.toml (pre-staging within 7
//      days is accepted by capture-corner-inventory.js)
//   5. rebuild the content corpus
//
// Date = schedule: a future <date> is HELD by build.js and auto-publishes on
// its date (both the article and the CC). Email goes out automatically:
// premium-brief-send (Fri 10:00 UTC) + newsletter-send (Tue/Fri 23:30 UTC).
//
// Usage:
//   node scripts/stage-newsletter.js --draft YYYY-MM-DD   # prefill a manifest from ~/Downloads
//   node scripts/stage-newsletter.js path/to/issue.manifest.json
//   node scripts/stage-newsletter.js --template   # print a blank manifest
//
// --draft scans ~/Downloads for the newest MMT_* article + CaptureCorner md
// pair and the ChatGPT PNGs (plus any *Timeline*.png) saved the same day,
// and writes <scratch>/<date>.manifest.json with title, dek, teaser, CC
// title/dek and the image list already filled. What is left to write by
// hand is marked TODO: image alt text + which anchor sentence each graphic
// follows, the three gated bullets, and the CC gate/deep-dive copy.
//
// Anchors: `after` may omit the trailing " [n]" citation; the stager
// extends the match so the footnote stays with its sentence instead of
// orphaning as its own paragraph under the image.
// `extra_images`: [{src, name}] optimized into the issue image dir without
// being inserted into the article (Capture Corner-only assets, e.g. a
// timeline referenced from the CC markdown as /images/newsletter/<date>/<name>).
//
// After it runs: node build.js && node scripts/validate-dist.js && node
// scripts/capture-corner-inventory.js  (then commit + push; the standing
// newsletter authorization in CLAUDE.md covers merge-to-main).
// ============================================================================

const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
const sharp = require("sharp");
const REPO = path.join(__dirname, "..");

const TEMPLATE = {
  date: "YYYY-MM-DD",
  slug: "kebab-slug",
  article_source: "/abs/path/to/article-body.md  (md whose body starts at 'Friends,')",
  cc_source: "/abs/path/to/capture-corner.md",
  byline: "By Sean Donohue, PA-C, PMP, and Mary Womack   (optional; omit for Mary-only)",
  frontmatter: {
    title: "Issue Title",
    description: "The dek — one or two sentences. Also rendered as the italic dek under the title.",
    author: "Mary Womack",
    category: "deep-dive",
    tags: ["Tag One", "Tag Two"],
    agencies: ["Army", "DoD"],
    capture_corner_teaser: "One paragraph teasing the companion Capture Corner.",
    capture_corner: ["Gated bullet 1", "Gated bullet 2", "Gated bullet 3"],
  },
  cover: { src: "/abs/path/cover.png", alt: "Full descriptive alt text for the cover." },
  graphics: [
    { src: "/abs/path/g1.png", name: "descriptive-file-name.png", alt: "Alt text.", after: "The exact sentence to place this graphic immediately after (trailing [n] citation optional)." },
  ],
  extra_images: [
    { src: "/abs/path/timeline.png", name: "cc-only-asset.png" },
  ],
  cc: {
    title: "The Capture Corner Title.",
    dek: "Companion dek (plain text; rendered inside <em>).",
    pills: [{ label: "Capture Corner", cls: "pill-gold" }, { label: "Topic", cls: "" }, { label: "Risk", cls: "pill-red" }],
    gate: "Free-preview paragraph shown to non-premium members.",
    deep_dive: "Deep-dive card body: what the brief covers and where it stops short (custom by request).",
    deep_dive_examples: 'Deep Dive — example one · Deep Dive — example two',
  },
};

function die(msg) { console.error("stage-newsletter: " + msg); process.exit(1); }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
// Escape $ for use inside a String.replace replacement string, so dynamic
// content containing "$199", "$55 billion", etc. is inserted literally instead
// of being read as a $1/$&/$$ backreference (which mangled the gate on the
// 2026-07-07 issue). Group refs like $1/$2 in the templates below stay literal.
function rd(s) { return String(s).replace(/\$/g, "$$$$"); }

async function optimizeImage(src, destAbs) {
  if (!fs.existsSync(src)) die("image not found: " + src);
  const meta = await sharp(src).metadata();
  await sharp(src).resize({ width: Math.min(meta.width, 1600), withoutEnlargement: true })
    .png({ quality: 82, compressionLevel: 9, palette: true }).toFile(destAbs);
  return { w: meta.width, kb: Math.round(fs.statSync(destAbs).size / 1024) };
}

function newestPriorCC(date) {
  const dir = path.join(REPO, "premium", "briefs");
  const files = fs.readdirSync(dir)
    .filter((f) => /^capture-corner-\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .filter((f) => f.match(/(\d{4}-\d{2}-\d{2})/)[1] < date)
    .sort().reverse();
  if (!files.length) die("no prior capture-corner html to model on");
  return path.join(dir, files[0]);
}

// The anchor as written may or may not carry the sentence's trailing
// citation. Return the exact substring of `body` to insert after: the
// sentence plus " [n]" when the body has one right after it.
function resolveAnchor(body, after) {
  if (!after) return null;
  const i = body.indexOf(after);
  if (i < 0) return null;
  const tail = body.slice(i + after.length).match(/^(\s\[\d+\])+/);
  return tail ? after + tail[0] : after;
}

function draftManifest(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) die("--draft needs YYYY-MM-DD");
  const dl = path.join(require("os").homedir(), "Downloads");
  const recent = (re) => fs.readdirSync(dl).filter((f) => re.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(dl, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  const mds = recent(/^MMT_.*\.md$/);
  const cc = mds.find((x) => /CaptureCorner/i.test(x.f));
  const art = mds.find((x) => !/CaptureCorner/i.test(x.f) && !/FactCheck|Fact-Check/i.test(x.f));
  if (!art || !cc) die("could not find an MMT_*.md article + CaptureCorner pair in ~/Downloads");
  const sameDay = (t) => new Date(t).toDateString() === new Date(art.t).toDateString();
  const pngs = recent(/^ChatGPT Image .*\.png$/).filter((x) => sameDay(x.t)).sort((a, b) => a.t - b.t);
  const timelines = recent(/Timeline.*\.png$/i).filter((x) => sameDay(x.t));
  const artSrc = fs.readFileSync(path.join(dl, art.f), "utf8");
  const ccSrc = fs.readFileSync(path.join(dl, cc.f), "utf8");
  const first = (src, re) => (src.match(re) || [, ""])[1].trim();
  const title = first(artSrc, /^#\s+(.+)$/m);
  const dek = first(artSrc, /^\*([^*\n][^\n]*)\*\s*$/m);
  const premium = first(artSrc, /## MMT Premium\s+([\s\S]+?)\n\n/);
  const ccTitle = first(ccSrc, /^#\s+Capture Corner:\s*(.+)$/m) || first(ccSrc, /^#\s+(.+)$/m);
  const ccHeader = first(ccSrc, /^###\s+Intelligence Brief\s*\|\s*([\s\S]+?)\s*\|\s*Analysis date/m) || first(ccSrc, /^###\s+Intelligence Brief\s*\|\s*(.+)$/m);
  const slug = title.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const scratch = process.env.CLAUDE_SCRATCHPAD || require("os").tmpdir();
  const artCopy = path.join(scratch, `${date}-article-source.md`);
  const ccCopy = path.join(scratch, `${date}-capture-corner-source.md`);
  fs.copyFileSync(path.join(dl, art.f), artCopy);
  fs.copyFileSync(path.join(dl, cc.f), ccCopy);
  const manifest = {
    date, slug,
    article_source: artCopy,
    cc_source: ccCopy,
    frontmatter: {
      title, description: dek, author: "Mary Womack", category: "deep-dive",
      tags: ["TODO"], agencies: ["TODO"],
      capture_corner_teaser: premium ? premium + " It lives behind the paywall at missionmeetstech.com/pricing." : "TODO",
      capture_corner: ["TODO gated bullet 1 (from the CC's what-to-do section)", "TODO 2", "TODO 3"],
    },
    cover: { src: pngs.length ? path.join(dl, pngs[0].f) : "TODO", alt: "TODO" },
    graphics: pngs.slice(1).map((x, i) => ({ src: path.join(dl, x.f), name: `TODO-graphic-${i + 1}.png`, alt: "TODO", after: "TODO exact anchor sentence" })),
    extra_images: timelines.map((x) => ({ src: path.join(dl, x.f), name: "TODO-timeline.png" })),
    cc: {
      title: ccTitle, dek: ccHeader || "TODO",
      pills: [{ label: "Capture Corner", cls: "pill-gold" }, { label: "TODO topic", cls: "" }, { label: "Risk: TODO", cls: "pill-red" }],
      gate: "TODO free-preview paragraph (from the CC intro, Mary's words)",
      deep_dive: "TODO 'This brief maps ... It stops short of your position: ... A custom deep-dive picks it up there.'",
      deep_dive_examples: "Deep Dive &mdash; TODO &middot; Deep Dive &mdash; TODO",
    },
    _sources: { article: art.f, capture_corner: cc.f, pngs: pngs.map((x) => x.f), timelines: timelines.map((x) => x.f) },
  };
  const out = path.join(scratch, `${date}.manifest.json`);
  if (fs.existsSync(out) && !process.argv.includes("--force")) die(`${out} already exists (a filled manifest?); pass --force to overwrite it`);
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
  console.log(`draft manifest: ${out}`);
  console.log(`  article: ${art.f}\n  cc:      ${cc.f}\n  pngs (oldest first; first = cover): ${pngs.map((x) => x.f).join(" | ") || "none"}\n  timeline: ${timelines.map((x) => x.f).join(" | ") || "none"}`);
  console.log(`  fill every TODO (alt text needs a look at each PNG; anchors come from Mary's placement note), then:\n  node scripts/stage-newsletter.js ${out}`);
  return out;
}

async function main() {
  if (process.argv.includes("--draft")) { draftManifest(process.argv[process.argv.indexOf("--draft") + 1]); return; }
  if (process.argv.includes("--template")) { console.log(JSON.stringify(TEMPLATE, null, 2)); return; }
  const manifestPath = process.argv[2];
  if (!manifestPath) die("usage: node scripts/stage-newsletter.js <manifest.json>  (or --template)");
  const rawManifest = fs.readFileSync(manifestPath, "utf8");
  const m = JSON.parse(rawManifest);
  delete m._sources;
  if (/\bTODO\b/.test(JSON.stringify(m))) die("manifest still contains TODO fields; fill them before staging");
  const { date, slug } = m;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) die("manifest.date must be YYYY-MM-DD");
  if (!slug) die("manifest.slug required");
  const imgWeb = `/images/newsletter/${date}`;
  const imgDir = path.join(REPO, "static", "images", "newsletter", date);
  fs.mkdirSync(imgDir, { recursive: true });

  // 1. Images -------------------------------------------------------------
  const coverName = m.cover.name || `cover-${slug}.png`;
  let r = await optimizeImage(m.cover.src, path.join(imgDir, coverName));
  console.log(`  image ${coverName} (${r.kb}KB)`);
  for (const g of m.graphics || []) {
    r = await optimizeImage(g.src, path.join(imgDir, g.name));
    console.log(`  image ${g.name} (${r.kb}KB)`);
  }
  for (const x of m.extra_images || []) {
    r = await optimizeImage(x.src, path.join(imgDir, x.name));
    console.log(`  image ${x.name} (${r.kb}KB, not inserted in article)`);
  }

  // 2. Article markdown ---------------------------------------------------
  let src = fs.readFileSync(m.article_source, "utf8");
  const fi = src.indexOf("Friends,");
  if (fi < 0) die("article_source has no 'Friends,' — body must start there");
  let body = src.slice(fi);
  for (const g of m.graphics || []) {
    const anchor = resolveAnchor(body, g.after);
    if (!anchor) die(`graphic placement sentence not found in body: "${g.after.slice(0, 60)}..."`);
    if (/TODO/i.test(g.alt || "")) die(`graphic ${g.name} still has TODO alt text`);
    body = body.replace(anchor, `${anchor}\n\n![${g.alt}](${imgWeb}/${g.name})\n\n`);
  }
  const fm = m.frontmatter;
  const y = (a) => a.map((x) => `  - ${JSON.stringify(x)}`).join("\n");
  const front =
`---
title: ${JSON.stringify(fm.title)}
date: ${date}
slug: ${slug}
description: ${JSON.stringify(fm.description)}
author: ${JSON.stringify(fm.author || "Mary Womack")}
category: ${fm.category || "deep-dive"}
visibility: public
tags:
${y(fm.tags || [])}
agencies:
${y(fm.agencies || [])}
canonical_url: "https://missionmeetstech.com/newsletter/${slug}/"
source: claude_newsletter_project
capture_corner_teaser: ${JSON.stringify(fm.capture_corner_teaser || "")}
capture_corner:
${y(fm.capture_corner || [])}
---

![${m.cover.alt}](${imgWeb}/${coverName})

# ${fm.title}

*${fm.description}*
${m.byline ? "\n" + m.byline + "\n" : ""}
${body}`;
  const artPath = path.join(REPO, "content", "newsletter", `${date}-${slug}.md`);
  fs.writeFileSync(artPath, front);
  console.log(`  article ${path.relative(REPO, artPath)} (${(front.length / 1024 | 0)}KB, ${(m.graphics || []).length} graphics + cover)`);

  // 3. Capture Corner HTML -------------------------------------------------
  if (m.cc && m.cc_source) {
    let html = fs.readFileSync(newestPriorCC(date), "utf8");
    const ccmd = fs.readFileSync(m.cc_source, "utf8");
    const s0 = ccmd.search(/\*[A-Z]/); // first line starting with *Capital (the intro em para)
    const ccHtml = marked.parse(ccmd.slice(s0 < 0 ? 0 : s0).trim());
    const open = 'class="brief-body">';
    const close = '<div class="deep-dive-card">';
    const oi = html.indexOf(open) + open.length;
    const ci = html.indexOf(close);
    html = html.slice(0, oi) + "\n\n" + ccHtml + "\n\n    " + html.slice(ci);
    const niceDate = new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    // header swaps (regex on the model's known shapes)
    html = html.replace(/<title>Capture Corner:[^<]*<\/title>/, `<title>Capture Corner: ${rd(esc(m.cc.title.replace(/\.$/, "")))} &middot; MMT Premium</title>`);
    html = html.replace(/<meta name="description" content=".*">/, `<meta name="description" content="${rd(esc(niceDate))}. ${rd(esc(m.cc.dek))}">`);
    html = html.replace(/(MMT Premium &middot; Capture Corner &middot; )[^<]*/, `$1${rd(esc(niceDate))}`);
    html = html.replace(/(letter-spacing:-0\.03em;margin-bottom:10px;">)[^<]*(<\/h1>)/, `$1${rd(esc(m.cc.title))}$2`);
    html = html.replace(/(<p style="font-size:15px;color:var\(--mmt-text-secondary\);margin-bottom:20px;"><em>)[\s\S]*?(<\/em><\/p>)/, `$1${rd(m.cc.dek)}$2`);
    html = html.replace(/<div class="pills">[\s\S]*?<\/div>/, rd(`<div class="pills">\n${(m.cc.pills || []).map((p) => `      <span class="pill ${p.cls}">${esc(p.label)}</span>`).join("\n")}\n    </div>`));
    html = html.replace(/(<div class="gate-notice">\s*<h3>[^<]*<\/h3>\s*<p>)[\s\S]*?(<\/p>)/, `$1${rd(esc(m.cc.gate))}$2`);
    if (m.cc.deep_dive) html = html.replace(/(<h3>Want a custom deep-dive on any line in this brief\?<\/h3>\s*<p>)[\s\S]*?(<\/p>)/, `$1${rd(m.cc.deep_dive)}$2`);
    if (m.cc.deep_dive_examples) html = html.replace(/(<p class="deep-dive-examples">Examples: <em>)[\s\S]*?(<\/em><\/p>)/, `$1${rd(m.cc.deep_dive_examples)}$2`);
    const ccPath = path.join(REPO, "premium", "briefs", `capture-corner-${date}.html`);
    fs.writeFileSync(ccPath, html);
    console.log(`  capture corner ${path.relative(REPO, ccPath)}`);

    // 4. Redirect -----------------------------------------------------------
    const tomlPath = path.join(REPO, "netlify.toml");
    let toml = fs.readFileSync(tomlPath, "utf8");
    toml = toml.replace(/(from = "\/capture-corner\/latest"\s*\n\s*to = ")[^"]*(")/, `$1/premium/briefs/capture-corner-${date}.html$2`);
    fs.writeFileSync(tomlPath, toml);
    console.log(`  redirect /capture-corner/latest -> capture-corner-${date}.html`);
  }

  // 5. Corpus -------------------------------------------------------------
  try { require("child_process").execSync("node scripts/build-content-corpus.js", { cwd: REPO, stdio: "ignore" }); console.log("  corpus rebuilt"); }
  catch (e) { console.warn("  corpus rebuild failed (run scripts/build-content-corpus.js manually):", e.message); }

  console.log(`\nStaged ${date} "${fm.title}". Next:`);
  console.log("  node scripts/verify-issue.js " + date + "   (build + validators + unit tests, compact output)");
  console.log("  commit the staged files, push, open the PR, merge when checks are green (date-gated; both pieces release after midnight ET on " + date + "; emails follow at 13:00 UTC and 23:30 UTC)");
}

main().catch((e) => die(e.stack || e.message));
