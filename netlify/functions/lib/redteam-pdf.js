// ============================================================
// redteam-pdf.js — PDFKit PDF for Red Team Review
//
// Same pattern as tactical-brief-pdf.js: bufferPages + drawFooter
// with margin zero trick to prevent ghost pages.
// ============================================================

const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const CYAN = "#00E5FA";
const NAVY = "#00050F";
const MUTED = "#B0B8C4";

const GRADE_COLORS = {
  A: "#16a34a", "B+": "#22c55e", B: "#84cc16", "B-": "#eab308",
  "C+": "#f97316", C: "#ef4444", D: "#dc2626", F: "#991b1b",
};

function gradeColor(g) { return GRADE_COLORS[g] || "#6b7280"; }
function safe(v) { return (v || "").toString().trim(); }

function loadLogo() {
  try {
    const p = path.resolve(__dirname, "..", "..", "..", "mmt-logo.png");
    if (fs.existsSync(p)) return fs.readFileSync(p);
  } catch { /* skip */ }
  return null;
}

function drawFooter(doc, pageNum, totalPages) {
  const saved = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font("Helvetica").fontSize(7).fillColor("#999999")
    .text("Red Team Review by Mission Meets Tech. AI-assisted analysis — verify all findings independently.", 60, doc.page.height - 45, { width: doc.page.width - 120, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(7).fillColor("#bbbbbb")
    .text(`Page ${pageNum} of ${totalPages}  |  Mission Meets Tech  |  missionmeetstech.com  |  Confidential`, 60, doc.page.height - 30, { width: doc.page.width - 120, align: "center", lineBreak: false });
  doc.page.margins.bottom = saved;
}

function checkBreak(doc, y, needed = 80) {
  if (y > doc.page.height - needed) { doc.addPage(); return 60; }
  return y;
}

/**
 * Generate a Red Team Review PDF.
 * @param {Object} data
 * @returns {Promise<Buffer>}
 */
async function generateRedTeamPdf(data) {
  const { scorecard, overallGrade, documentLabel, fileName,
    sections, executiveSummary, prioritizedSteps, nextSteps,
    pwinEstimate, pwinJustification, pwinFactors, competitivePositioning } = data;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "letter", bufferPages: true,
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: { Title: "Red Team Review", Author: "Mission Meets Tech" },
    });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const logo = loadLogo();
    const scores = (scorecard && scorecard.scores) || [];
    const verdict = (scorecard && scorecard.verdict) || "N/A";
    const mergedSections = sections || [];

    // === PAGE 1: COVER ===
    doc.rect(0, 0, doc.page.width, 180).fill(NAVY);
    if (logo) { try { doc.image(logo, 60, 30, { width: 36, height: 36 }); } catch { /* skip */ } }
    doc.font("Helvetica-Bold").fontSize(28).fillColor(CYAN)
      .text("RED TEAM REVIEW", logo ? 105 : 60, 35, { width: doc.page.width - 170 });
    doc.font("Helvetica").fontSize(11).fillColor(MUTED)
      .text("Federal Proposal Enhancement Report", logo ? 105 : 60, 70, { width: doc.page.width - 170 });
    doc.moveTo(60, 150).lineTo(doc.page.width - 60, 150).strokeColor(CYAN).lineWidth(2).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#94a3b8")
      .text("CONFIDENTIAL", 60, 162, { width: doc.page.width - 120, align: "center" });

    let y = 210;
    const meta = [
      ["DOCUMENT", safe(fileName)],
      ["TYPE", safe(documentLabel)],
      ["DATE", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
    ];
    for (const [label, value] of meta) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#666666").text(`${label}: `, 60, y, { continued: true });
      doc.font("Helvetica").text(value);
      y = doc.y + 6;
    }

    // === PAGE 2: EXECUTIVE SUMMARY ===
    doc.addPage();
    y = 60;
    doc.font("Helvetica-Bold").fontSize(14).fillColor(NAVY).text("EXECUTIVE SUMMARY", 60, y);
    doc.moveTo(60, doc.y + 4).lineTo(220, doc.y + 4).strokeColor(CYAN).lineWidth(1.5).stroke();
    y = doc.y + 16;

    // Summary boxes
    const bW = (doc.page.width - 160) / 3;
    const boxes = [
      { label: "VERDICT", value: verdict, color: verdict === "PASS" ? "#16a34a" : verdict === "CONDITIONAL" ? "#eab308" : "#dc2626" },
      { label: "GRADE", value: overallGrade || "N/A", color: gradeColor(overallGrade) },
      { label: "SECTIONS", value: String(mergedSections.length), color: "#0369a1" },
    ];
    for (let i = 0; i < boxes.length; i++) {
      const bx = 60 + i * (bW + 20);
      doc.roundedRect(bx, y, bW, 50, 6).fill("#f9fafb").strokeColor("#e5e7eb").stroke();
      doc.font("Helvetica").fontSize(8).fillColor("#6b7280").text(boxes[i].label, bx, y + 6, { width: bW, align: "center" });
      doc.font("Helvetica-Bold").fontSize(18).fillColor(boxes[i].color).text(boxes[i].value, bx, y + 22, { width: bW, align: "center" });
    }
    y += 70;

    // Executive summary bullets
    const execBullets = executiveSummary || [];
    if (execBullets.length > 0) {
      doc.rect(60, y, 4, execBullets.length * 16 + 16).fill(CYAN);
      doc.rect(60, y, doc.page.width - 120, execBullets.length * 16 + 16).fillAndStroke("#f0f9ff", "#bae6fd");
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#0369a1").text("CHANGE SUMMARY", 72, y + 6);
      let by = y + 20;
      for (const b of execBullets) {
        doc.font("Helvetica").fontSize(8).fillColor("#374151").text("• " + safe(b), 76, by, { width: doc.page.width - 160 });
        by = doc.y + 2;
      }
      y = by + 10;
    }

    // Criteria summary table
    y = checkBreak(doc, y, 40);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("CRITERIA SUMMARY", 60, y);
    y = doc.y + 8;
    const tW = doc.page.width - 120;
    doc.rect(60, y, tW, 18).fill("#f1f5f9");
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#6b7280");
    doc.text("CRITERIA", 64, y + 4, { width: tW * 0.45, lineBreak: false });
    doc.text("GRADE", 64 + tW * 0.45, y + 4, { width: tW * 0.15, align: "center", lineBreak: false });
    doc.text("STATUS", 64 + tW * 0.6, y + 4, { width: tW * 0.2, align: "center", lineBreak: false });
    doc.text("CONF.", 64 + tW * 0.8, y + 4, { width: tW * 0.2, align: "center", lineBreak: false });
    y += 18;

    for (const s of mergedSections) {
      y = checkBreak(doc, y, 18);
      doc.moveTo(60, y + 17).lineTo(60 + tW, y + 17).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(8).fillColor("#374151").text(safe(s.criterion_title), 64, y + 3, { width: tW * 0.45 - 8, lineBreak: false });
      const gc = gradeColor(s.original_grade);
      doc.roundedRect(64 + tW * 0.45 + 8, y + 1, 26, 13, 3).fill(gc);
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#fff").text(safe(s.original_grade), 64 + tW * 0.45, y + 3, { width: tW * 0.15, align: "center", lineBreak: false });
      const statusColors = { polished: "#16a34a", rewritten: "#f97316", skeleton: "#dc2626" };
      const statusLabel = s.status === "skeleton" ? "Architecture" : s.status === "rewritten" ? "Rewritten" : "Polished";
      doc.font("Helvetica").fontSize(7).fillColor(statusColors[s.status] || "#6b7280").text(statusLabel, 64 + tW * 0.6, y + 3, { width: tW * 0.2, align: "center", lineBreak: false });
      if (s.confidence_pct != null) {
        const confColor = s.confidence_pct >= 70 ? "#16a34a" : s.confidence_pct >= 50 ? "#eab308" : "#ef4444";
        doc.font("Helvetica-Bold").fontSize(7).fillColor(confColor).text(`${s.confidence_pct}%`, 64 + tW * 0.8, y + 3, { width: tW * 0.2, align: "center", lineBreak: false });
      }
      y += 18;
    }
    y += 12;

    // === PAGES 3+: SECTION-BY-SECTION REVIEW ===
    for (const s of mergedSections) {
      y = checkBreak(doc, y, 180);
      if (y <= 80) { /* fresh page */ } else if (y > doc.page.height - 200) { doc.addPage(); y = 60; }

      // Section header bar
      const gc = gradeColor(s.original_grade);
      doc.rect(60, y, doc.page.width - 120, 24).fill("#f9fafb").strokeColor("#e5e7eb").stroke();
      doc.rect(60, y, 4, 24).fill(gc);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(safe(s.criterion_title), 72, y + 5, { width: 250, lineBreak: false });
      doc.roundedRect(330, y + 4, 28, 15, 3).fill(gc);
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#fff").text(safe(s.original_grade), 330, y + 7, { width: 28, align: "center", lineBreak: false });
      const statusColors = { polished: "#16a34a", rewritten: "#f97316", skeleton: "#dc2626" };
      const sl = s.status === "skeleton" ? "Architecture" : s.status === "rewritten" ? "Rewritten" : "Polished";
      doc.font("Helvetica-Bold").fontSize(7).fillColor(statusColors[s.status] || "#6b7280").text(sl, 370, y + 8, { lineBreak: false });
      if (s.confidence_pct != null) {
        doc.font("Helvetica").fontSize(7).fillColor("#6b7280").text(`${s.confidence_pct}%`, doc.page.width - 100, y + 8, { width: 40, align: "right", lineBreak: false });
      }
      y += 32;

      // Original box
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#9ca3af").text("ORIGINAL", 60, y);
      y = doc.y + 4;
      y = checkBreak(doc, y, 40);
      doc.rect(60, y, doc.page.width - 120, 2).fill("#e5e7eb");
      doc.font("Helvetica-Oblique").fontSize(8).fillColor("#6b7280")
        .text(safe(s.original_excerpt), 68, y + 6, { width: doc.page.width - 140, lineGap: 2 });
      y = doc.y + 10;

      // Strengthened box
      y = checkBreak(doc, y, 40);
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#0369a1").text("STRENGTHENED", 60, y);
      y = doc.y + 4;
      doc.rect(60, y, doc.page.width - 120, 2).fill(CYAN);
      doc.font("Helvetica").fontSize(8).fillColor("#111827")
        .text(safe(s.strengthened_text), 68, y + 6, { width: doc.page.width - 140, lineGap: 2 });
      y = doc.y + 8;

      // What changed
      if (s.changes_made) {
        y = checkBreak(doc, y, 20);
        doc.font("Helvetica-Oblique").fontSize(8).fillColor("#475569")
          .text("What changed: " + safe(s.changes_made), 68, y, { width: doc.page.width - 140 });
        y = doc.y + 4;
      }

      // Triple-check
      if (s.accuracy_ok != null) {
        y = checkBreak(doc, y, 14);
        const chk = (ok, lbl) => `${ok ? "\u2713" : "\u2717"} ${lbl}`;
        doc.font("Helvetica").fontSize(7).fillColor("#6b7280")
          .text(`${chk(s.accuracy_ok, "Accuracy")}    ${chk(s.consistency_ok, "Consistency")}    ${chk(s.improvement_ok, "Improvement")}`, 68, y);
        y = doc.y + 4;
      }

      // Reviewer notes
      if (s.review_notes) {
        doc.font("Helvetica-Oblique").fontSize(7).fillColor("#9ca3af")
          .text(safe(s.review_notes), 68, y, { width: doc.page.width - 140 });
        y = doc.y + 4;
      }

      y += 12;
    }

    // === LAST SECTION: Next Steps + pWin ===
    y = checkBreak(doc, y, 100);
    const steps = prioritizedSteps || nextSteps || [];
    if (steps.length > 0) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text("PRIORITIZED NEXT STEPS", 60, y);
      y = doc.y + 10;
      for (let i = 0; i < steps.length; i++) {
        y = checkBreak(doc, y, 16);
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(`${i + 1}.`, 68, y, { continued: true });
        doc.font("Helvetica").fontSize(9).fillColor("#374151").text(" " + safe(steps[i]), { width: doc.page.width - 150 });
        y = doc.y + 4;
      }
      y += 12;
    }

    // pWin
    if (pwinEstimate) {
      y = checkBreak(doc, y, 30);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0369a1")
        .text(`Estimated pWin: ${safe(pwinEstimate)}`, 60, y, { width: doc.page.width - 120, align: "center" });
      y = doc.y + 4;
      if (pwinJustification) {
        doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
          .text(safe(pwinJustification), 60, y, { width: doc.page.width - 120, align: "center" });
      }
    }

    // === POST-PROCESS: footers ===
    const range = doc.bufferedPageRange();
    const total = range.start + range.count;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawFooter(doc, i + 1, total);
    }
    doc.flushPages();
    doc.end();
  });
}

module.exports = { generateRedTeamPdf };
