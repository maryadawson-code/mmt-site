#!/usr/bin/env node
// ============================================================
// build-fy2027-pdf.js — generate static/lead-magnets/fy2027-forecast.pdf
//
// Concatenates the two FY2027 newsletter parts already in
// content/newsletter/ into a single PDF using pdfkit (already a repo
// dependency — no new packages added per the spec envelope).
//
// The lead-magnet handler attaches this PDF to every form-submission
// confirmation email. Regenerate locally any time the source markdown
// changes:
//
//   npm run build:fy2027-pdf
//
// or:
//
//   node scripts/build-fy2027-pdf.js
//
// The artifact is committed to the repo so deploys don't need to
// regenerate; CI does not need to run this script.
// ============================================================

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const PDFDocument = require("pdfkit");

const REPO = path.resolve(__dirname, "..");
const SOURCES = [
  "content/newsletter/2026-04-07-fy2027-federal-health-budget-part-1.md",
  "content/newsletter/2026-04-10-fy2027-military-health-budget-part-2.md",
];
const OUT_DIR = path.join(REPO, "static", "lead-magnets");
const OUT_PATH = path.join(OUT_DIR, "fy2027-forecast.pdf");

// Strip markdown to a flat readable string while preserving headers,
// bullets, and paragraph breaks. We deliberately don't render every
// markdown feature — the goal is a clean, brandable lead-magnet PDF
// from the same source the website serves.
function markdownToBlocks(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let para = [];

  function flushPara() {
    if (para.length === 0) return;
    blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flushPara();
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      blocks.push({ type: `h${h[1].length}`, text: h[2].trim() });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      blocks.push({ type: "li", text: line.replace(/^[-*]\s+/, "").trim() });
      continue;
    }
    if (/^>\s+/.test(line)) {
      flushPara();
      blocks.push({ type: "quote", text: line.replace(/^>\s+/, "").trim() });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();

  // Collapse markdown link syntax [text](url) → "text (url)"
  for (const b of blocks) {
    b.text = b.text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  }
  return blocks;
}

function loadSource(relPath) {
  const full = path.join(REPO, relPath);
  const raw = fs.readFileSync(full, "utf8");
  const { data, content } = matter(raw);
  return {
    title: data.title || relPath,
    description: data.description || "",
    slug: data.slug || path.basename(relPath, ".md"),
    body: content,
  };
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const sources = SOURCES.map(loadSource);
  const generatedAt = formatDate(new Date());

  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    info: {
      Title: "FY2027 Federal Health IT Contract Forecast",
      Author: "Mary Womack — Mission Meets Tech",
      Subject: "FY2027 federal health budget + military health budget analysis",
      Keywords: "FY2027, federal health, defense health, VA, EHRM, CCN Next Gen, DHA",
    },
  });
  doc.pipe(fs.createWriteStream(OUT_PATH));

  // --- Cover page ---
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#457B9D")
    .text("MISSION MEETS TECH · FREE INTELLIGENCE BRIEF", { characterSpacing: 1.2 });
  doc.moveDown(2);
  doc
    .font("Helvetica-Bold")
    .fontSize(28)
    .fillColor("#0A192F")
    .text("FY2027 Federal Health IT Contract Forecast", { lineGap: 4 });
  doc.moveDown(0.5);
  doc
    .font("Helvetica")
    .fontSize(13)
    .fillColor("#4b5563")
    .text(
      "VA EHRM ($4.24B), DHA pipeline, CCN Next Gen, and 15 upcoming recompetes — sourced from MMT's Capture Intelligence sheet and the FY2027 federal health budget analysis."
    );
  doc.moveDown(2);
  doc
    .font("Helvetica-Oblique")
    .fontSize(11)
    .fillColor("#6b7280")
    .text(`Compiled ${generatedAt} · missionmeetstech.com`);

  // --- Body: render each source as its own section ---
  for (const src of sources) {
    doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#457B9D")
      .text("PART", { characterSpacing: 1.2 });
    doc.moveDown(0.3);
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#0A192F")
      .text(src.title, { lineGap: 2 });
    if (src.description) {
      doc.moveDown(0.6);
      doc
        .font("Helvetica-Oblique")
        .fontSize(12)
        .fillColor("#4b5563")
        .text(src.description);
    }
    doc.moveDown(1.2);

    const blocks = markdownToBlocks(src.body);
    for (const b of blocks) {
      if (b.type === "h1" || b.type === "h2") {
        doc.moveDown(0.6);
        doc
          .font("Helvetica-Bold")
          .fontSize(15)
          .fillColor("#0A192F")
          .text(b.text);
        doc.moveDown(0.4);
      } else if (b.type === "h3" || b.type === "h4") {
        doc.moveDown(0.5);
        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .fillColor("#0A192F")
          .text(b.text);
        doc.moveDown(0.3);
      } else if (b.type === "li") {
        doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#0A192F")
          .text(`•  ${b.text}`, { indent: 12, paragraphGap: 4, lineGap: 1.4 });
      } else if (b.type === "quote") {
        doc
          .font("Helvetica-Oblique")
          .fontSize(11)
          .fillColor("#4b5563")
          .text(b.text, { indent: 18, paragraphGap: 4 });
      } else {
        doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#0A192F")
          .text(b.text, { paragraphGap: 6, lineGap: 2 });
      }
    }
  }

  // --- Final page: how to use + CTA ---
  doc.addPage();
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#0A192F")
    .text("Where to take this next");
  doc.moveDown(0.6);
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#0A192F")
    .text(
      "This forecast is the public-facing slice of MMT's weekly capture intelligence. The Friday Brief, Monthly Brief, Capture Corner releases, and the IDIQ tracker get into the named-vehicle, named-vendor, named-deadline detail you need to actually move on these contracts.",
      { paragraphGap: 8, lineGap: 2 }
    );
  doc.moveDown(0.5);
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#0A192F")
    .text("Free reading: missionmeetstech.com", { paragraphGap: 4 })
    .text("Premium ($199/yr founding): missionmeetstech.com/pricing", { paragraphGap: 4 })
    .text("Reply to mary@missionmeetstech.com with one win you're chasing — I'll point you at the related sources.");
  doc.moveDown(2);
  doc
    .font("Helvetica-Oblique")
    .fontSize(10)
    .fillColor("#6b7280")
    .text(
      "Mission Meets Tech is independent federal health IT intelligence by Mary Womack. No sponsors, no PR pitches — just the analysis.",
      { paragraphGap: 4 }
    );

  doc.end();
  // pdfkit's write stream is synchronous from a caller's POV once we've
  // sent doc.end() and finished the script — Node won't exit until the
  // stream flushes.
  console.log(`Wrote ${OUT_PATH}`);
}

main();
