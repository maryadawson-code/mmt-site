// ============================================================
// tactical-brief-pdf.js — MarketPulse PDF Generator (v2)
//
// Professional intelligence brief matching MMT report standard.
// Cover page + TOC + numbered sections + formatted tables.
// Returns a Buffer containing the PDF bytes.
// ============================================================

const PDFDocument = require("pdfkit");

// Brand colors
const NAVY     = "#00050F";
const SLATE    = "#0A1628";
const CYAN     = "#00E5FA";
const WHITE    = "#FFFFFF";
const MUTED    = "#8899AA";
const BODY     = "#1A2332";
const TEXT     = "#1a1a1a";
const TEXT_MED = "#333333";
const TEXT_DIM = "#666666";
const RULE     = "#D0D8E4";

const L = 60;   // left margin
const R_MARGIN = 60;
const PAGE_W = 612;
const PAGE_H = 792;
const CONTENT_W = PAGE_W - L - R_MARGIN;
const L_MARGIN_TOP = 56;

// ── Typography helpers ────────────────────────────────────────

function cleanText(text) {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\[[\d,\s]+\]/g, "")  // remove [1][2] citation brackets
    .replace(/\|[^\n]+\|/g, "")    // remove pipe table rows
    .replace(/[-]{3,}/g, "")       // remove markdown dividers
    .replace(/#{1,3}\s/g, "")      // remove markdown headers
    .trim();
}

function checkPage(doc, y, needed = 60) {
  if (y > PAGE_H - needed) {
    doc.addPage();
    return L_MARGIN_TOP;
  }
  return y;
}

// ── Parse synthesis into sections ────────────────────────────

function parseSections(synthesis) {
  const SECTION_NAMES = [
    "EXECUTIVE SUMMARY",
    "SITUATION OVERVIEW",
    "KEY FINDINGS",
    "COMPETITIVE LANDSCAPE",
    "RISKS AND WATCH ITEMS",
    "OPPORTUNITIES AND RECOMMENDATIONS",
    "TIMELINE AND MILESTONES",
    "METHODOLOGY",
    // fallback headers from old prompt
    "RISKS & WATCH ITEMS",
    "OPPORTUNITIES & RECOMMENDATIONS",
    "TIMELINE & MILESTONES",
    "SOURCES & METHODOLOGY",
  ];

  const sections = {};
  let currentSection = "INTRODUCTION";
  let currentLines = [];

  const lines = synthesis.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    const upperTrimmed = trimmed.toUpperCase();

    const matchedSection = SECTION_NAMES.find(s =>
      upperTrimmed === s ||
      upperTrimmed.startsWith(s + ":") ||
      (upperTrimmed.length < 60 && upperTrimmed.includes(s))
    );

    if (matchedSection && trimmed.length < 80) {
      if (currentLines.length > 0) {
        sections[currentSection] = currentLines.join("\n").trim();
      }
      // Normalize section names
      currentSection = matchedSection
        .replace("RISKS & WATCH ITEMS", "RISKS AND WATCH ITEMS")
        .replace("OPPORTUNITIES & RECOMMENDATIONS", "OPPORTUNITIES AND RECOMMENDATIONS")
        .replace("TIMELINE & MILESTONES", "TIMELINE AND MILESTONES")
        .replace("SOURCES & METHODOLOGY", "METHODOLOGY");
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections[currentSection] = currentLines.join("\n").trim();
  }

  return sections;
}

// ── Main export ───────────────────────────────────────────────

async function generateTacticalBriefPdf({
  name, email, company, topic, audience,
  synthesis, citations, generatedAt,
}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: "letter",
      bufferPages: true,
      margins: { top: L_MARGIN_TOP, bottom: 56, left: L, right: R_MARGIN },
      info: {
        Title: `MarketPulse: ${topic.slice(0, 80)}`,
        Author: "Mission Meets Tech",
        Subject: "Federal Health IT Market Intelligence",
        Creator: "Mission Meets Tech — missionmeetstech.com",
      },
    });

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const dateStr = new Date(generatedAt).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    const sections = parseSections(synthesis);

    // ── PAGE 1: COVER ─────────────────────────────────────────

    // Full dark background
    doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);

    // Top accent bar
    doc.rect(0, 0, PAGE_W, 5).fill(CYAN);

    // Logo placeholder area
    doc.rect(L, 52, 34, 34).fill(SLATE);
    doc.rect(L, 52, 34, 34).strokeColor(CYAN).lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(CYAN)
       .text("MMT", L + 8, 64);

    // "INTELLIGENCE BRIEF" label
    doc.font("Helvetica").fontSize(9).fillColor(CYAN)
       .text("INTELLIGENCE BRIEF", L + 44, 57);

    // Thin cyan rule under label
    doc.moveTo(L + 44, 70).lineTo(L + 160, 70)
       .strokeColor(CYAN).lineWidth(0.5).stroke();

    // Main title
    const titleY = 105;
    doc.font("Helvetica-Bold").fontSize(28).fillColor(WHITE)
       .text(topic, L, titleY, { width: CONTENT_W, lineGap: 4 });

    let coverY = doc.y + 20;

    // Subtitle
    doc.font("Helvetica").fontSize(12).fillColor(MUTED)
       .text("Federal Health IT Market Intelligence", L, coverY);
    coverY = doc.y + 8;

    if (audience) {
      doc.font("Helvetica").fontSize(10).fillColor(MUTED)
         .text(audience, L, coverY);
      coverY = doc.y + 8;
    }

    // Horizontal rule
    coverY += 20;
    doc.moveTo(L, coverY).lineTo(PAGE_W - R_MARGIN, coverY)
       .strokeColor("#1A3040").lineWidth(0.75).stroke();
    coverY += 24;

    // Date
    doc.font("Helvetica").fontSize(9).fillColor(MUTED)
       .text(dateStr, L, coverY);
    coverY = doc.y + 4;

    const coverageEnd = new Date(generatedAt);
    const coverageStart = new Date(coverageEnd);
    coverageStart.setFullYear(coverageStart.getFullYear() - 1);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED)
       .text(`Coverage Period: ${coverageStart.toLocaleDateString("en-US", {month:"long",year:"numeric"})} – ${coverageEnd.toLocaleDateString("en-US", {month:"long",year:"numeric"})}`, L, coverY);
    coverY = doc.y + 24;

    // Prepared for / by blocks
    doc.font("Helvetica-Bold").fontSize(8).fillColor(CYAN)
       .text("PREPARED FOR", L, coverY);
    coverY = doc.y + 4;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(WHITE)
       .text(name, L, coverY);
    coverY = doc.y + 2;
    if (company) {
      doc.font("Helvetica").fontSize(10).fillColor(MUTED)
         .text(company, L, coverY);
      coverY = doc.y + 2;
    }
    coverY += 20;

    doc.font("Helvetica-Bold").fontSize(8).fillColor(CYAN)
       .text("PREPARED BY", L, coverY);
    coverY = doc.y + 4;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(WHITE)
       .text("Mary Womack", L, coverY);
    coverY = doc.y + 2;
    doc.font("Helvetica").fontSize(10).fillColor(MUTED)
       .text("Founder, Mission Meets Tech", L, coverY);
    coverY = doc.y + 2;
    doc.font("Helvetica").fontSize(10).fillColor(MUTED)
       .text("Federal Health IT Intelligence", L, coverY);

    // Bottom tagline
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
       .text("Federal health IT intelligence. Mission first.", L, PAGE_H - 50, { width: CONTENT_W });
    doc.moveTo(L, PAGE_H - 36).lineTo(L + 80, PAGE_H - 36)
       .strokeColor(CYAN).lineWidth(1).stroke();

    // ── PAGE 2: TABLE OF CONTENTS ─────────────────────────────

    doc.addPage();
    doc.rect(0, 0, PAGE_W, PAGE_H).fill("#F8FAFC");

    // Header band
    doc.rect(0, 0, PAGE_W, 64).fill(NAVY);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(WHITE)
       .text("Contents", L, 22);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED)
       .text("MarketPulse — Mission Meets Tech", PAGE_W - R_MARGIN - 160, 22, { width: 160, align: "right" });

    const tocItems = [
      { num: "1", title: "Executive Summary",               sub: "Key findings and strategic overview" },
      { num: "2", title: "Situation Overview",              sub: "Current state and context" },
      { num: "3", title: "Key Findings",                    sub: "Numbered findings with confidence ratings" },
      { num: "4", title: "Competitive Landscape",           sub: "Key players and positioning" },
      { num: "5", title: "Risks and Watch Items",           sub: "Potential obstacles and flags" },
      { num: "6", title: "Opportunities and Recommendations", sub: "Actionable intelligence" },
      { num: "7", title: "Timeline and Milestones",         sub: "Upcoming decision points" },
      { num: "8", title: "Methodology",                     sub: "Sources and research approach" },
    ];

    let tocY = 90;
    for (const item of tocItems) {
      if (tocY > PAGE_H - 80) break;
      // Number circle
      doc.circle(L + 10, tocY + 10, 10).fill(SLATE);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(CYAN)
         .text(item.num, L + 5, tocY + 5, { width: 12, align: "center" });

      doc.font("Helvetica-Bold").fontSize(11).fillColor(BODY)
         .text(item.title, L + 28, tocY, { width: CONTENT_W - 28 });
      tocY = doc.y + 1;
      doc.font("Helvetica").fontSize(9).fillColor(TEXT_DIM)
         .text(item.sub, L + 28, tocY, { width: CONTENT_W - 28 });
      tocY = doc.y + 12;

      // Thin rule
      if (tocY < PAGE_H - 80) {
        doc.moveTo(L + 28, tocY).lineTo(PAGE_W - R_MARGIN, tocY)
           .strokeColor(RULE).lineWidth(0.3).stroke();
        tocY += 6;
      }
    }

    // About this report box
    const boxY = PAGE_H - 130;
    doc.rect(L, boxY, CONTENT_W, 90).fill("#EEF2F7");
    doc.rect(L, boxY, 3, 90).fill(CYAN);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BODY)
       .text("ABOUT THIS REPORT", L + 14, boxY + 12);
    doc.font("Helvetica").fontSize(8.5).fillColor(TEXT_MED)
       .text(
         "This MarketPulse brief was produced using a 3-pass live research pipeline sourcing current data from federal procurement records, policy documents, contract databases, and verified news reporting. All findings include confidence ratings based on source recency and alignment.",
         L + 14, boxY + 26, { width: CONTENT_W - 28, lineGap: 2 }
       );

    // ── PAGES 3+: CONTENT SECTIONS ────────────────────────────

    const orderedSections = [
      { key: "EXECUTIVE SUMMARY",                 num: 1, title: "Executive Summary" },
      { key: "SITUATION OVERVIEW",                num: 2, title: "Situation Overview" },
      { key: "KEY FINDINGS",                      num: 3, title: "Key Findings" },
      { key: "COMPETITIVE LANDSCAPE",             num: 4, title: "Competitive Landscape" },
      { key: "RISKS AND WATCH ITEMS",             num: 5, title: "Risks and Watch Items" },
      { key: "OPPORTUNITIES AND RECOMMENDATIONS", num: 6, title: "Opportunities and Recommendations" },
      { key: "TIMELINE AND MILESTONES",           num: 7, title: "Timeline and Milestones" },
      { key: "METHODOLOGY",                       num: 8, title: "Methodology" },
    ];

    for (const section of orderedSections) {
      const rawContent = sections[section.key] || sections[section.key.replace(" AND ", " & ")] || "";
      if (!rawContent && section.key !== "EXECUTIVE SUMMARY") continue;

      doc.addPage();
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(WHITE);

      // Section header band
      doc.rect(0, 0, PAGE_W, 56).fill(NAVY);

      // Section number badge
      doc.circle(L + 13, 28, 13).fill(CYAN);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY)
         .text(String(section.num), L + 8, 22, { width: 14, align: "center" });

      // Section title
      doc.font("Helvetica-Bold").fontSize(16).fillColor(WHITE)
         .text(section.title, L + 34, 18, { width: CONTENT_W - 34 });

      // Topic breadcrumb
      const topicShort = topic.length > 55 ? topic.slice(0, 52) + "..." : topic;
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
         .text(topicShort, PAGE_W - R_MARGIN - 200, 42, { width: 200, align: "right" });

      let y = 76;
      const lines = rawContent.split("\n");
      let paraBuffer = [];

      const flushPara = () => {
        if (paraBuffer.length === 0) return;
        const text = cleanText(paraBuffer.join(" ")).trim();
        if (!text) { paraBuffer = []; return; }
        y = checkPage(doc, y, 40);
        doc.font("Helvetica").fontSize(9.5).fillColor(TEXT)
           .text(text, L, y, { width: CONTENT_W, lineGap: 2.5 });
        y = doc.y + 10;
        paraBuffer = [];
      };

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) { flushPara(); y += 4; continue; }

        const clean = cleanText(line);
        if (!clean) continue;

        // Numbered finding or bullet point
        if (/^\d+\.\s/.test(line) || /^[-•]\s/.test(line)) {
          flushPara();
          y = checkPage(doc, y, 36);
          const isNumbered = /^\d+\./.test(line);
          const bulletChar = isNumbered ? line.match(/^(\d+\.)/)[1] : "•";
          const bulletText = clean.replace(/^\d+\.\s*/, "").replace(/^[-•]\s*/, "");

          if (isNumbered) {
            doc.rect(L, y, 20, 16).fill(SLATE);
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(CYAN)
               .text(bulletChar, L, y + 3, { width: 20, align: "center" });
            doc.font("Helvetica").fontSize(9.5).fillColor(TEXT)
               .text(bulletText, L + 26, y, { width: CONTENT_W - 26, lineGap: 2 });
          } else {
            doc.font("Helvetica-Bold").fontSize(10).fillColor(CYAN)
               .text("•", L + 4, y);
            doc.font("Helvetica").fontSize(9.5).fillColor(TEXT)
               .text(bulletText, L + 18, y, { width: CONTENT_W - 18, lineGap: 2 });
          }
          y = doc.y + 7;
          continue;
        }

        // ALL CAPS sub-header (like competitor names, finding titles)
        if (/^[A-Z][A-Z\s,()&\/\-:]+$/.test(line) && line.length > 3 && line.length < 80) {
          flushPara();
          y = checkPage(doc, y, 30);
          y += 4;
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor(BODY)
             .text(clean, L, y, { width: CONTENT_W });
          y = doc.y + 3;
          doc.moveTo(L, y).lineTo(L + 30, y).strokeColor(CYAN).lineWidth(1).stroke();
          y += 8;
          continue;
        }

        // Date-format timeline entry
        if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Q[1-4]|20\d\d)/i.test(line)) {
          flushPara();
          y = checkPage(doc, y, 24);
          const dashIdx = clean.indexOf("—");
          const colonIdx = clean.indexOf(":");
          const splitAt = dashIdx > 0 ? dashIdx : colonIdx > 0 ? colonIdx : -1;
          if (splitAt > 0) {
            const datePart = clean.slice(0, splitAt).trim();
            const eventPart = clean.slice(splitAt + 1).trim();
            doc.rect(L, y, 90, 16).fill("#F0F4F8");
            doc.font("Helvetica-Bold").fontSize(8.5).fillColor(SLATE)
               .text(datePart, L + 4, y + 2, { width: 82 });
            doc.font("Helvetica").fontSize(9.5).fillColor(TEXT)
               .text(eventPart, L + 98, y, { width: CONTENT_W - 98, lineGap: 2 });
            y = doc.y + 6;
          } else {
            paraBuffer.push(line);
          }
          continue;
        }

        // Confidence rating line
        if (/\(Confidence:\s*(High|Medium|Low)\)/i.test(line)) {
          flushPara();
          y = checkPage(doc, y, 24);
          const confMatch = line.match(/\(Confidence:\s*(High|Medium|Low)\)/i);
          const confLevel = confMatch[1];
          const confColor = confLevel === "High" ? "#00AA44" : confLevel === "Medium" ? "#CC8800" : "#CC4400";
          const textPart = cleanText(line.replace(/\(Confidence:.*?\)/gi, "")).trim();
          doc.font("Helvetica").fontSize(9.5).fillColor(TEXT)
             .text(textPart, L, y, { width: CONTENT_W - 80, lineGap: 2 });
          const textRight = L + CONTENT_W - 72;
          doc.rect(textRight, y, 68, 14).fill(confColor + "22").strokeColor(confColor).stroke();
          doc.font("Helvetica-Bold").fontSize(7).fillColor(confColor)
             .text(`CONFIDENCE: ${confLevel.toUpperCase()}`, textRight + 4, y + 3, { width: 60 });
          y = doc.y + 8;
          continue;
        }

        // Regular prose line — buffer for paragraph
        paraBuffer.push(line);
      }

      flushPara();
    }

    // ── SOURCES PAGE ─────────────────────────────────────────

    if (citations && citations.length > 0) {
      doc.addPage();
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(WHITE);
      doc.rect(0, 0, PAGE_W, 56).fill(NAVY);
      doc.font("Helvetica-Bold").fontSize(16).fillColor(WHITE)
         .text("Sources", L, 20);
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
         .text("All claims sourced to publicly available records", L, 40);

      let sy = 72;
      for (let i = 0; i < citations.length; i++) {
        sy = checkPage(doc, sy, 20);
        doc.font("Helvetica-Bold").fontSize(8).fillColor(SLATE)
           .text(`${i + 1}.`, L, sy, { width: 18 });
        doc.font("Helvetica").fontSize(8).fillColor("#3366CC")
           .text(citations[i], L + 22, sy, {
             width: CONTENT_W - 22, lineGap: 1,
             link: citations[i],
           });
        sy = doc.y + 5;
      }

      // Disclaimer
      sy = Math.max(sy + 20, PAGE_H - 90);
      doc.moveTo(L, sy).lineTo(PAGE_W - R_MARGIN, sy)
         .strokeColor(RULE).lineWidth(0.5).stroke();
      sy += 10;
      doc.font("Helvetica").fontSize(7.5).fillColor(TEXT_DIM)
         .text(
           "This report was prepared by Mission Meets Tech for informational purposes. All claims are sourced to publicly available records. For questions or follow-up: missionmeetstech.com",
           L, sy, { width: CONTENT_W, lineGap: 2 }
         );
    }

    // ── FOOTER ON ALL PAGES ───────────────────────────────────

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const pageNum = i + 1;

      // Skip footer on cover page
      if (pageNum === 1) continue;

      // Override bottom margin to prevent PDFKit from adding blank pages
      const origBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.moveTo(L, PAGE_H - 36).lineTo(PAGE_W - R_MARGIN, PAGE_H - 36)
         .strokeColor(RULE).lineWidth(0.3).stroke();

      doc.font("Helvetica").fontSize(7).fillColor(MUTED)
         .text("Mission Meets Tech  |  missionmeetstech.com  |  Confidential",
               L, PAGE_H - 26, { width: CONTENT_W - 40, lineBreak: false });

      doc.font("Helvetica-Bold").fontSize(7).fillColor(MUTED)
         .text(`${pageNum}`, PAGE_W - R_MARGIN - 20, PAGE_H - 26, { width: 20, align: "right", lineBreak: false });

      doc.page.margins.bottom = origBottom;
    }

    doc.end();
  });
}

module.exports = { generateTacticalBriefPdf };
