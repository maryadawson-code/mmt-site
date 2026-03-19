// ============================================================
// proposalpulse-pdf.js — PDFKit PDF for ProposalPulse Score Report
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
const VERDICT_COLORS = { PASS: "#16a34a", CONDITIONAL: "#eab308", FAIL: "#dc2626" };

function gradeColor(g) { return GRADE_COLORS[g] || "#6b7280"; }
function verdictColor(v) { return VERDICT_COLORS[v] || "#dc2626"; }
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
    .text("ProposalPulse by Mission Meets Tech. AI-assisted assessment — verify all findings independently.", 60, doc.page.height - 45, { width: doc.page.width - 120, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(7).fillColor("#bbbbbb")
    .text(`Page ${pageNum} of ${totalPages}  |  Mission Meets Tech  |  missionmeetstech.com  |  Confidential`, 60, doc.page.height - 30, { width: doc.page.width - 120, align: "center", lineBreak: false });
  doc.page.margins.bottom = saved;
}

function checkBreak(doc, y, needed = 80) {
  if (y > doc.page.height - needed) { doc.addPage(); return 60; }
  return y;
}

/**
 * Generate a ProposalPulse Score Report PDF.
 * @param {Object} data
 * @returns {Promise<Buffer>}
 */
async function generateScoreReportPdf(data) {
  const { scorecard, overallGrade, documentLabel, fileName, nextSteps,
    competitivePositioning, pwinFactors, complianceNote, scoringId } = data;

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "letter", bufferPages: true,
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: { Title: `ProposalPulse Score Report`, Author: "Mission Meets Tech" },
    });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const logo = loadLogo();
    const scores = scorecard.scores || [];
    const verdict = scorecard.verdict || "N/A";

    // === PAGE 1: COVER ===
    doc.rect(0, 0, doc.page.width, 180).fill(NAVY);
    if (logo) { try { doc.image(logo, 60, 30, { width: 36, height: 36 }); } catch { /* skip */ } }
    doc.font("Helvetica-Bold").fontSize(28).fillColor(CYAN)
      .text("PROPOSALPULSE", logo ? 105 : 60, 35, { width: doc.page.width - 170 });
    doc.font("Helvetica").fontSize(11).fillColor(MUTED)
      .text("Federal Proposal Assessment Report", logo ? 105 : 60, 70, { width: doc.page.width - 170 });
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
    y += 16;
    doc.moveTo(60, y).lineTo(doc.page.width - 60, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();

    // === PAGE 2: EXECUTIVE SUMMARY ===
    doc.addPage();
    y = 60;

    // No-SOW Compliance Disclaimer (FIX 3a — top of Executive Summary, before scores)
    if (complianceNote) {
      doc.rect(60, y, doc.page.width - 120, 56).fillAndStroke("#fffbeb", "#d97706");
      doc.rect(60, y, doc.page.width - 120, 4).fill("#d97706");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#92400e")
        .text("⚠ No Solicitation Document Provided", 72, y + 10, { width: doc.page.width - 152 });
      doc.font("Helvetica").fontSize(8).fillColor("#854d0e")
        .text("This evaluation scores against standard federal proposal criteria only. Compliance matrix verification against Section L/M was NOT performed. Do not use these scores for go/no-go decisions without solicitation-specific review.", 72, y + 24, { width: doc.page.width - 152 });
      y += 64;
    }

    doc.font("Helvetica-Bold").fontSize(16).fillColor(NAVY).text("EXECUTIVE SUMMARY", 60, y);
    y = doc.y + 16;

    // Verdict + Grade boxes
    const boxW = (doc.page.width - 140) / 2;
    doc.roundedRect(60, y, boxW, 60, 6).fill("#f9fafb").strokeColor("#e5e7eb").stroke();
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("VERDICT", 60, y + 8, { width: boxW, align: "center" });
    doc.font("Helvetica-Bold").fontSize(22).fillColor(verdictColor(verdict)).text(verdict, 60, y + 24, { width: boxW, align: "center" });

    doc.roundedRect(60 + boxW + 20, y, boxW, 60, 6).fill("#f9fafb").strokeColor("#e5e7eb").stroke();
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("OVERALL GRADE", 60 + boxW + 20, y + 8, { width: boxW, align: "center" });
    doc.font("Helvetica-Bold").fontSize(22).fillColor(gradeColor(overallGrade)).text(overallGrade, 60 + boxW + 20, y + 24, { width: boxW, align: "center" });
    y += 80;

    // Verdict summary
    if (scorecard.verdict_summary) {
      doc.font("Helvetica").fontSize(10).fillColor("#374151")
        .text(scorecard.verdict_summary, 60, y, { width: doc.page.width - 120, lineGap: 3 });
      y = doc.y + 16;
    }

    // 9-criteria table
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text("SCORING BREAKDOWN", 60, y);
    y = doc.y + 10;
    const tW = doc.page.width - 120;
    const col1W = tW * 0.45, col2W = tW * 0.12, col3W = tW * 0.43;
    // Header
    doc.rect(60, y, tW, 20).fill("#f1f5f9");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#6b7280");
    doc.text("CRITERIA", 64, y + 5, { width: col1W, lineBreak: false });
    doc.text("GRADE", 64 + col1W, y + 5, { width: col2W, align: "center", lineBreak: false });
    doc.text("ASSESSMENT", 64 + col1W + col2W, y + 5, { width: col3W, lineBreak: false });
    y += 20;

    for (const s of scores) {
      y = checkBreak(doc, y, 30);
      const rowH = 22;
      doc.moveTo(60, y + rowH).lineTo(60 + tW, y + rowH).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
      const isNA = s.grade === "N/A";
      doc.font("Helvetica").fontSize(8).fillColor(isNA ? "#9ca3af" : "#374151").text(safe(s.title), 64, y + 5, { width: col1W - 8, lineBreak: false });
      // Grade badge
      const gc = isNA ? "#d1d5db" : gradeColor(s.grade);
      doc.roundedRect(64 + col1W + (col2W - 28) / 2, y + 3, 28, 14, 3).fill(gc);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(isNA ? "#6b7280" : "#ffffff").text(safe(s.grade), 64 + col1W, y + 5, { width: col2W, align: "center", lineBreak: false });
      // Assessment (truncated)
      const assess = safe(s.assessment).substring(0, 80) + (safe(s.assessment).length > 80 ? "..." : "");
      doc.font("Helvetica").fontSize(7).fillColor("#6b7280").text(assess, 64 + col1W + col2W, y + 5, { width: col3W - 8, lineBreak: false });
      y += rowH;
    }
    y += 12;

    // === COMPLIANCE MATRIX (if SOW was provided — shown before assessments) ===
    const compMatrix = scorecard.compliance_matrix || [];
    if (compMatrix.length > 0) {
      doc.addPage();
      y = 60;
      doc.font("Helvetica-Bold").fontSize(14).fillColor(NAVY).text("COMPLIANCE MATRIX", 60, y);
      doc.moveTo(60, doc.y + 4).lineTo(210, doc.y + 4).strokeColor(CYAN).lineWidth(1.5).stroke();
      y = doc.y + 12;

      // Compliance score summary
      const compSummary = scorecard._compliance_summary;
      if (compSummary) {
        const csColor = compSummary.score >= 80 ? "#16a34a" : compSummary.score >= 60 ? "#eab308" : "#dc2626";
        doc.font("Helvetica-Bold").fontSize(18).fillColor(csColor)
          .text(`${compSummary.score}% Compliant`, 60, y, { width: doc.page.width - 120, align: "center" });
        y = doc.y + 4;
        doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
          .text(`${compSummary.compliant} compliant, ${compSummary.partial} partial, ${compSummary.missing} missing, ${compSummary.na} N/A`, 60, y, { width: doc.page.width - 120, align: "center" });
        y = doc.y + 12;
      }

      // Compliance flags
      const compFlags = scorecard._compliance_flags || [];
      for (const flag of compFlags) {
        doc.rect(60, y, doc.page.width - 120, 18).fillAndStroke("#fef2f2", "#fecaca");
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#991b1b")
          .text(safe(flag), 68, y + 4, { width: doc.page.width - 140, lineBreak: false });
        y += 22;
      }

      // Matrix table
      const tW = doc.page.width - 120;
      doc.rect(60, y, tW, 18).fill("#f1f5f9");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#6b7280");
      doc.text("REQUIREMENT", 64, y + 4, { width: tW * 0.45, lineBreak: false });
      doc.text("REF", 64 + tW * 0.45, y + 4, { width: tW * 0.15, lineBreak: false });
      doc.text("STATUS", 64 + tW * 0.6, y + 4, { width: tW * 0.15, align: "center", lineBreak: false });
      doc.text("LOCATION", 64 + tW * 0.75, y + 4, { width: tW * 0.25, lineBreak: false });
      y += 18;

      const statusColors = { COMPLIANT: "#16a34a", PARTIAL: "#eab308", MISSING: "#dc2626", "N/A": "#6b7280" };
      for (const c of compMatrix) {
        y = checkBreak(doc, y, 18);
        doc.moveTo(60, y + 17).lineTo(60 + tW, y + 17).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
        const req = safe(c.requirement).substring(0, 50) + (safe(c.requirement).length > 50 ? "..." : "");
        doc.font("Helvetica").fontSize(7).fillColor("#374151").text(req, 64, y + 3, { width: tW * 0.45 - 4, lineBreak: false });
        doc.font("Helvetica").fontSize(7).fillColor("#6b7280").text(safe(c.lm_reference || ""), 64 + tW * 0.45, y + 3, { width: tW * 0.15 - 4, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(7).fillColor(statusColors[c.status] || "#6b7280")
          .text(safe(c.status), 64 + tW * 0.6, y + 3, { width: tW * 0.15, align: "center", lineBreak: false });
        const loc = safe(c.proposal_section || "").substring(0, 30) + (safe(c.proposal_section || "").length > 30 ? "..." : "");
        doc.font("Helvetica").fontSize(6).fillColor("#6b7280").text(loc, 64 + tW * 0.75, y + 3, { width: tW * 0.25 - 4, lineBreak: false });
        y += 18;
      }
      y += 12;
    }

    // === PAGE 3+: DETAILED ASSESSMENTS ===
    doc.addPage();
    y = 60;
    doc.font("Helvetica-Bold").fontSize(14).fillColor(NAVY).text("DETAILED ASSESSMENTS", 60, y);
    doc.moveTo(60, doc.y + 4).lineTo(200, doc.y + 4).strokeColor(CYAN).lineWidth(1.5).stroke();
    y = doc.y + 16;

    for (const s of scores) {
      const cardH = 60;
      y = checkBreak(doc, y, cardH + 20);
      const gc = gradeColor(s.grade);
      doc.rect(60, y, doc.page.width - 120, cardH).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.rect(60, y, 4, cardH).fill(gc);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b").text(safe(s.title), 72, y + 8, { width: 200 });
      doc.roundedRect(280, y + 6, 32, 16, 3).fill(gc);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff").text(safe(s.grade), 280, y + 9, { width: 32, align: "center", lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#475569")
        .text(safe(s.assessment), 72, y + 26, { width: doc.page.width - 152, lineGap: 2 });
      y += Math.max(cardH, doc.y - y + 10) + 8;
    }

    // === PAGE 4: PRIORITIZED NEXT STEPS ===
    y = checkBreak(doc, y, 120);
    if (y < 80) { /* already on new page */ } else { doc.addPage(); y = 60; }
    doc.font("Helvetica-Bold").fontSize(14).fillColor(NAVY).text("PRIORITIZED NEXT STEPS", 60, y);
    doc.moveTo(60, doc.y + 4).lineTo(240, doc.y + 4).strokeColor(CYAN).lineWidth(1.5).stroke();
    y = doc.y + 16;

    // Top fix
    if (scorecard.top_fix) {
      doc.rect(60, y, doc.page.width - 120, 4).fill(CYAN);
      doc.rect(60, y, doc.page.width - 120, 40).fillAndStroke("#f0f9ff", "#bae6fd");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#0369a1").text("TOP FIX", 72, y + 6);
      doc.font("Helvetica").fontSize(9).fillColor("#1e3a5f").text(safe(scorecard.top_fix), 72, y + 18, { width: doc.page.width - 152 });
      y = doc.y + 12;
    }

    const tiers = [
      { key: "stop_ship", label: "STOP-SHIP", color: "#dc2626", bg: "#fef2f2" },
      { key: "high", label: "HIGH PRIORITY", color: "#f97316", bg: "#fffbeb" },
      { key: "polish", label: "POLISH", color: "#475569", bg: "#f0f4f8" },
    ];
    const ns = nextSteps || scorecard.next_steps || {};
    for (const { key, label, color, bg } of tiers) {
      const items = ns[key] || ns[key.replace("_", "")] || [];
      if (items.length === 0) continue;
      y = checkBreak(doc, y, 40);
      doc.rect(60, y, 4, items.length * 16 + 20).fill(color);
      doc.rect(60, y, doc.page.width - 120, items.length * 16 + 20).fillAndStroke(bg, "#e2e8f0");
      doc.font("Helvetica-Bold").fontSize(9).fillColor(color).text(label, 72, y + 6);
      let iy = y + 20;
      for (const item of items) {
        doc.font("Helvetica").fontSize(8).fillColor("#374151").text("• " + safe(item), 76, iy, { width: doc.page.width - 160 });
        iy = doc.y + 2;
      }
      y = iy + 10;
    }

    // === PAGE 5: pWin + COMPETITIVE ===
    y = checkBreak(doc, y, 160);
    if (y < 80) { /* on new page */ } else { doc.addPage(); y = 60; }
    doc.font("Helvetica-Bold").fontSize(14).fillColor(NAVY).text("pWin ANALYSIS", 60, y);
    doc.moveTo(60, doc.y + 4).lineTo(180, doc.y + 4).strokeColor(CYAN).lineWidth(1.5).stroke();
    y = doc.y + 16;

    // Kill conditions (shown prominently above pWin)
    const killConds = (scorecard._pwin_details && scorecard._pwin_details.kill_conditions) || [];
    if (killConds.length > 0) {
      for (const kc of killConds) {
        y = checkBreak(doc, y, 20);
        doc.rect(60, y, doc.page.width - 120, 18).fillAndStroke("#fef2f2", "#fecaca");
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#991b1b")
          .text(safe(kc), 68, y + 4, { width: doc.page.width - 140, lineBreak: false });
        y += 22;
      }
      y += 4;
    }

    // pWin factors table with scores
    const pwf = pwinFactors || scorecard.pWin_factors || [];
    if (pwf.length > 0) {
      const tW = doc.page.width - 120;
      // Header
      doc.rect(60, y, tW, 18).fill("#f1f5f9");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#6b7280");
      doc.text("FACTOR", 64, y + 4, { width: tW * 0.55, lineBreak: false });
      doc.text("SCORE", 64 + tW * 0.55, y + 4, { width: tW * 0.45, align: "right", lineBreak: false });
      y += 18;
      for (const f of pwf) {
        y = checkBreak(doc, y, 16);
        doc.moveTo(60, y + 15).lineTo(60 + tW, y + 15).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
        doc.font("Helvetica").fontSize(8).fillColor("#374151").text(safe(f.factor), 64, y + 3, { width: tW * 0.55, lineBreak: false });
        const scoreVal = typeof f.value === "number" ? f.value : parseInt(String(f.value)) || 0;
        const scoreColor = scoreVal >= 70 ? "#16a34a" : scoreVal >= 50 ? "#eab308" : "#ef4444";
        doc.font("Helvetica-Bold").fontSize(8).fillColor(scoreColor)
          .text(safe(String(f.value)), 64 + tW * 0.55, y + 3, { width: tW * 0.45 - 4, align: "right", lineBreak: false });
        y += 16;
      }
      y += 8;
    }

    // Penalties
    const penalties = (scorecard._pwin_details && scorecard._pwin_details.penalties) || [];
    if (penalties.length > 0) {
      doc.rect(60, y, doc.page.width - 120, penalties.length * 14 + 16).fillAndStroke("#fffbeb", "#fde68a");
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#92400e").text("INTERDEPENDENCY PENALTIES", 68, y + 4);
      let py = y + 16;
      for (const p of penalties) {
        doc.font("Helvetica").fontSize(7).fillColor("#92400e").text("• " + safe(p.description), 72, py, { width: doc.page.width - 160 });
        py = doc.y + 2;
      }
      y = py + 8;
    }

    if (scorecard.pwin_estimate) {
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#0369a1")
        .text(`Estimated pWin: ${scorecard.pwin_estimate}`, 60, y, { width: doc.page.width - 120, align: "center" });
      y = doc.y + 4;
      // Show confidence band and excluded factors
      const pwinDet = scorecard._pwin_details || {};
      if (pwinDet.confidence_band) {
        doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
          .text(`Confidence: ${pwinDet.confidence_band}${pwinDet.excluded_factors && pwinDet.excluded_factors.length > 0 ? ` — ${pwinDet.excluded_factors.length} factor${pwinDet.excluded_factors.length > 1 ? "s" : ""} excluded (${pwinDet.excluded_factors.join(", ")})` : ""}`, 60, y, { width: doc.page.width - 120, align: "center" });
        y = doc.y + 4;
      }
      y += 12;
    }

    // Competitive positioning
    const cp = competitivePositioning || scorecard.competitive_positioning;
    if (cp) {
      y = checkBreak(doc, y, 60);
      const diffColors = { strong: "#16a34a", moderate: "#eab308", weak: "#f97316", absent: "#ef4444" };
      const dc = diffColors[cp.differentiation || cp.rating] || "#6b7280";
      doc.rect(60, y, 4, 50).fill(dc);
      doc.rect(60, y, doc.page.width - 120, 50).fillAndStroke("#f9fafb", "#e2e8f0");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#6b7280").text("COMPETITIVE POSITIONING", 72, y + 6);
      doc.font("Helvetica-Bold").fontSize(14).fillColor(dc)
        .text(safe(cp.differentiation || cp.rating).toUpperCase(), 72, y + 18);
      if (cp.reasoning || cp.analysis) {
        doc.font("Helvetica").fontSize(8).fillColor("#374151")
          .text(safe(cp.reasoning || cp.analysis), 72, y + 34, { width: doc.page.width - 160 });
      }
      y = doc.y + 12;
    }

    // Compliance note moved to top of Executive Summary page (FIX 3a)

    // Red flags
    const rf = scorecard.red_flags || [];
    if (rf.length > 0) {
      y = checkBreak(doc, y, 40);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#991b1b").text("RED FLAGS", 60, y);
      y = doc.y + 8;
      for (const flag of rf) {
        y = checkBreak(doc, y, 16);
        doc.font("Helvetica").fontSize(9).fillColor("#dc2626").text("• " + safe(flag), 68, y, { width: doc.page.width - 140 });
        y = doc.y + 4;
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

module.exports = { generateScoreReportPdf };
