// ============================================================
// tactical-brief-pdf.js — PDFKit PDF generator for Tactical Brief
//
// Generates a branded PDF from the synthesized research output.
// Returns a Buffer containing the PDF bytes.
// ============================================================

const PDFDocument = require("pdfkit");

// Brand colors
const CYAN = "#00E5FA";
const NAVY = "#00050F";
const SLATE = "#0A1628";
const WHITE = "#FFFFFF";
const MUTED = "#B0B8C4";
const GREEN = "#00FF85";

/**
 * Generate a Tactical Brief PDF.
 * @param {Object} opts
 * @param {string} opts.name - Customer name
 * @param {string} opts.email - Customer email
 * @param {string} opts.company - Company name
 * @param {string} opts.topic - Research topic
 * @param {string} opts.audience - Target audience
 * @param {string} opts.synthesis - Final synthesized research (markdown-ish text)
 * @param {string[]} opts.citations - Source URLs
 * @param {string} opts.generatedAt - ISO timestamp
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generateTacticalBriefPdf({
  name,
  email,
  company,
  topic,
  audience,
  synthesis,
  citations,
  generatedAt,
}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "letter",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: {
        Title: `Tactical Brief: ${topic.slice(0, 80)}`,
        Author: "Mission Meets Tech",
        Subject: "Federal Health IT Market Intelligence",
        Creator: "Mission Meets Tech — missionmeetstech.com",
      },
    });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // --- Cover / Header ---
    doc
      .rect(0, 0, doc.page.width, 140)
      .fill(NAVY);

    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor(CYAN)
      .text("TACTICAL BRIEF", 60, 40, { width: doc.page.width - 120 });

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED)
      .text("Mission Meets Tech — Federal Health IT Intelligence", 60, 75, {
        width: doc.page.width - 120,
      });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        `Generated ${new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} | missionmeetstech.com`,
        60,
        95,
        { width: doc.page.width - 120 }
      );

    // Accent line
    doc
      .moveTo(60, 120)
      .lineTo(doc.page.width - 60, 120)
      .strokeColor(CYAN)
      .lineWidth(2)
      .stroke();

    // --- Topic block ---
    let y = 155;

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#333333")
      .text("RESEARCH TOPIC", 60, y);
    y += 22;

    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#1a1a1a")
      .text(topic, 60, y, { width: doc.page.width - 120 });
    y = doc.y + 12;

    if (audience) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#666666")
        .text("AUDIENCE: ", 60, y, { continued: true })
        .font("Helvetica")
        .text(audience);
      y = doc.y + 8;
    }

    if (company) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#666666")
        .text("PREPARED FOR: ", 60, y, { continued: true })
        .font("Helvetica")
        .text(`${name}, ${company}`);
      y = doc.y + 8;
    } else {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#666666")
        .text("PREPARED FOR: ", 60, y, { continued: true })
        .font("Helvetica")
        .text(name);
      y = doc.y + 8;
    }

    // Divider
    y += 8;
    doc
      .moveTo(60, y)
      .lineTo(doc.page.width - 60, y)
      .strokeColor("#e0e0e0")
      .lineWidth(0.5)
      .stroke();
    y += 16;

    // --- Main content: parse synthesis sections ---
    const lines = synthesis.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      // Check if we need a new page
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 60;
      }

      if (!trimmed) {
        y += 8;
        continue;
      }

      // Section headers (lines in ALL CAPS or starting with ##)
      if (/^#{1,3}\s/.test(trimmed)) {
        const headerText = trimmed.replace(/^#+\s*/, "");
        y += 6;
        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .fillColor(NAVY)
          .text(headerText.toUpperCase(), 60, y, { width: doc.page.width - 120 });
        y = doc.y + 8;

        // Accent underline
        doc
          .moveTo(60, y)
          .lineTo(180, y)
          .strokeColor(CYAN)
          .lineWidth(1.5)
          .stroke();
        y += 12;
      } else if (/^[A-Z][A-Z &\/\-]+$/.test(trimmed) && trimmed.length > 3) {
        // ALL CAPS section header
        y += 6;
        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .fillColor(NAVY)
          .text(trimmed, 60, y, { width: doc.page.width - 120 });
        y = doc.y + 8;

        doc
          .moveTo(60, y)
          .lineTo(180, y)
          .strokeColor(CYAN)
          .lineWidth(1.5)
          .stroke();
        y += 12;
      } else if (/^\d+\.\s/.test(trimmed) || /^[-•]\s/.test(trimmed)) {
        // Numbered or bulleted list item
        const bulletText = trimmed.replace(/^[-•]\s*/, "").replace(/^\d+\.\s*/, "");
        const bullet = /^\d+\./.test(trimmed) ? trimmed.match(/^\d+\./)[0] : "•";

        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#333333")
          .text(bullet, 68, y, { width: 20 });

        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#1a1a1a")
          .text(bulletText, 90, y, { width: doc.page.width - 150 });
        y = doc.y + 6;
      } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
        // Bold line
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#1a1a1a")
          .text(trimmed.replace(/\*\*/g, ""), 60, y, { width: doc.page.width - 120 });
        y = doc.y + 6;
      } else {
        // Regular paragraph
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#1a1a1a")
          .text(trimmed.replace(/\*\*/g, ""), 60, y, { width: doc.page.width - 120, lineGap: 3 });
        y = doc.y + 8;
      }
    }

    // --- Sources section ---
    if (citations && citations.length > 0) {
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = 60;
      }

      y += 16;
      doc
        .moveTo(60, y)
        .lineTo(doc.page.width - 60, y)
        .strokeColor("#e0e0e0")
        .lineWidth(0.5)
        .stroke();
      y += 16;

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(NAVY)
        .text("SOURCES", 60, y);
      y = doc.y + 10;

      for (let i = 0; i < citations.length; i++) {
        if (y > doc.page.height - 40) {
          doc.addPage();
          y = 60;
        }
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#4a90d9")
          .text(`[${i + 1}] ${citations[i]}`, 60, y, {
            width: doc.page.width - 120,
            link: citations[i],
          });
        y = doc.y + 3;
      }
    }

    // --- Footer on each page ---
    const pageCount = doc.bufferedPageRange();
    for (let i = 0; i < pageCount.count; i++) {
      doc.switchToPage(i);
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#999999")
        .text(
          "Mission Meets Tech | missionmeetstech.com | Confidential",
          60,
          doc.page.height - 40,
          { width: doc.page.width - 120, align: "center" }
        );
    }

    doc.end();
  });
}

module.exports = { generateTacticalBriefPdf };
