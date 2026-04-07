#!/usr/bin/env node
/**
 * Generate LinkedIn teaser images for Capture Intelligence.
 * Shows 3 preview rows with Window column blurred/redacted.
 * Outputs: dist/og/capture-intel-teaser-1600x900.png
 *          dist/og/capture-intel-teaser-1200x1200.png
 *          dist/og/capture-intelligence.png (OG image 1200x630)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const DIST_OG = path.join(__dirname, '..', 'dist', 'og');

// Colors
const NAVY = '#0A192F';
const TEAL = '#457B9D';
const GOLD = '#92710A';
const GOLD_BG = '#FEF9E7';
const SOFT = '#F3F4F6';
const WHITE = '#FFFFFF';
const TEXT = '#102033';
const TEXT_SEC = '#5C6B7A';
const BORDER = '#D8E0E8';
const GREEN = '#15803D';
const GREEN_BG = '#F0FDF4';

const ROWS = [
  { agency: 'VA', program: 'CCN Next Gen (36C10G26R0003)', signal: '$56.2B community care (+17%); VBP models and utilization management enter new contract', confidence: 'Verified', window: 'Proposals due April 17' },
  { agency: 'VA', program: 'EHRM: EHR Contract', signal: '$2.768B; Oracle Health sustainment of 19 live sites plus 26 new FY2027 go-lives', confidence: 'Verified', window: 'Michigan go-live this month' },
  { agency: 'DHA', program: 'Consulting contract terminations', signal: '$1.8B in DHA consulting cuts; Booz Allen ($345M), Deloitte ($264M), Accenture ($66M)', confidence: 'Verified', window: 'GS-15 PMs expect disruption' },
];

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSvg(width, height) {
  // Layout proportions
  const pad = Math.round(width * 0.04);
  const tableTop = Math.round(height * 0.32);
  const tableWidth = width - pad * 2;
  const headerH = 36;
  const rowH = Math.round((height - tableTop - pad - 60) / 3); // 3 rows
  const colWidths = [0.07, 0.20, 0.38, 0.12, 0.23].map(p => Math.round(tableWidth * p));

  // Font sizes scale with width
  const titleSize = Math.round(width * 0.028);
  const subtitleSize = Math.round(width * 0.014);
  const headerFontSize = Math.round(width * 0.0085);
  const cellFontSize = Math.round(width * 0.0105);
  const eyebrowSize = Math.round(width * 0.009);
  const ctaSize = Math.round(width * 0.012);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap');
      text { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    </style>
    <linearGradient id="windowBlur" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${SOFT}" stop-opacity="0"/>
      <stop offset="30%" stop-color="${SOFT}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${SOFT}" stop-opacity="1"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${WHITE}"/>

  <!-- Top gold accent bar -->
  <rect x="0" y="0" width="${width}" height="4" fill="${GOLD}"/>

  <!-- Eyebrow -->
  <text x="${pad}" y="${Math.round(height * 0.09)}" fill="${GOLD}" font-size="${eyebrowSize}" font-weight="700" letter-spacing="3">${escapeXml('CAPTURE INTELLIGENCE')}</text>

  <!-- Title -->
  <text x="${pad}" y="${Math.round(height * 0.18)}" fill="${NAVY}" font-size="${titleSize}" font-weight="700">${escapeXml('The contract signals that matter')}</text>
  <text x="${pad}" y="${Math.round(height * 0.18) + titleSize + 6}" fill="${NAVY}" font-size="${titleSize}" font-weight="700">${escapeXml('are moving faster than the headlines.')}</text>

  <!-- Subtitle -->
  <text x="${pad}" y="${tableTop - 14}" fill="${TEXT_SEC}" font-size="${subtitleSize}" font-weight="400">${escapeXml('FY2027 signals across VA, DHA, HHS/ONC, ARPA-H, and compliance  |  14 programs tracked')}</text>

  <!-- Table border -->
  <rect x="${pad}" y="${tableTop}" width="${tableWidth}" height="${headerH + rowH * 3}" rx="8" fill="none" stroke="${BORDER}" stroke-width="1"/>

  <!-- Table header bg -->
  <rect x="${pad}" y="${tableTop}" width="${tableWidth}" height="${headerH}" rx="8" fill="${SOFT}"/>
  <rect x="${pad}" y="${tableTop + headerH - 8}" width="${tableWidth}" height="8" fill="${SOFT}"/>
  <line x1="${pad}" y1="${tableTop + headerH}" x2="${pad + tableWidth}" y2="${tableTop + headerH}" stroke="${BORDER}" stroke-width="1"/>`;

  // Header labels
  const headers = ['Agency', 'Program', 'FY2027 Signal', 'Confidence', 'Window'];
  let colX = pad + 12;
  headers.forEach((h, i) => {
    svg += `\n  <text x="${colX}" y="${tableTop + headerH / 2 + headerFontSize / 3}" fill="${TEXT_SEC}" font-size="${headerFontSize}" font-weight="700" letter-spacing="1.5">${escapeXml(h.toUpperCase())}</text>`;
    colX += colWidths[i];
  });

  // Data rows
  ROWS.forEach((row, ri) => {
    const rowY = tableTop + headerH + ri * rowH;
    const rowBg = ri % 2 === 1 ? SOFT : WHITE;

    // Row background
    if (ri === 2) {
      // Last row: round bottom corners
      svg += `\n  <rect x="${pad}" y="${rowY}" width="${tableWidth}" height="${rowH}" fill="${rowBg}"/>`;
      svg += `\n  <rect x="${pad}" y="${rowY + rowH - 8}" width="${tableWidth}" height="8" rx="8" fill="${rowBg}"/>`;
    } else {
      svg += `\n  <rect x="${pad}" y="${rowY}" width="${tableWidth}" height="${rowH}" fill="${rowBg}"/>`;
    }

    // Row separator
    if (ri < 2) {
      svg += `\n  <line x1="${pad}" y1="${rowY + rowH}" x2="${pad + tableWidth}" y2="${rowY + rowH}" stroke="${BORDER}" stroke-width="0.5"/>`;
    }

    const cellY = rowY + rowH / 2 + cellFontSize / 3;
    let cx = pad + 12;

    // Agency
    svg += `\n  <text x="${cx}" y="${cellY}" fill="${NAVY}" font-size="${cellFontSize}" font-weight="600">${escapeXml(row.agency)}</text>`;
    cx += colWidths[0];

    // Program
    svg += `\n  <text x="${cx}" y="${cellY}" fill="${TEXT}" font-size="${cellFontSize}" font-weight="500">${escapeXml(row.program.length > 28 ? row.program.slice(0, 28) + '...' : row.program)}</text>`;
    cx += colWidths[1];

    // Signal (may need truncation)
    const sigMax = Math.floor(colWidths[2] / (cellFontSize * 0.52));
    const sigText = row.signal.length > sigMax ? row.signal.slice(0, sigMax) + '...' : row.signal;
    svg += `\n  <text x="${cx}" y="${cellY}" fill="${TEXT_SEC}" font-size="${cellFontSize}" font-weight="400">${escapeXml(sigText)}</text>`;
    cx += colWidths[2];

    // Confidence badge
    const badgeW = Math.round(cellFontSize * 5.5);
    const badgeH = Math.round(cellFontSize * 1.8);
    svg += `\n  <rect x="${cx}" y="${cellY - badgeH + 5}" width="${badgeW}" height="${badgeH}" rx="${badgeH / 2}" fill="${GREEN_BG}"/>`;
    svg += `\n  <text x="${cx + badgeW / 2}" y="${cellY}" fill="${GREEN}" font-size="${Math.round(cellFontSize * 0.85)}" font-weight="600" text-anchor="middle">${escapeXml(row.confidence)}</text>`;
    cx += colWidths[3];

    // Window - REDACTED with blur overlay
    const windowX = cx;
    const windowW = colWidths[4] - 12;
    svg += `\n  <text x="${windowX}" y="${cellY}" fill="${TEXT_SEC}" font-size="${cellFontSize}" font-weight="400" opacity="0.25">${escapeXml(row.window)}</text>`;
    svg += `\n  <rect x="${windowX - 4}" y="${rowY + 4}" width="${windowW + 8}" height="${rowH - 8}" fill="url(#windowBlur)"/>`;
    // Redacted label
    svg += `\n  <rect x="${windowX + windowW / 2 - 50}" y="${cellY - 12}" width="100" height="20" rx="4" fill="${GOLD_BG}" stroke="${GOLD}" stroke-width="0.5" opacity="0.9"/>`;
    svg += `\n  <text x="${windowX + windowW / 2}" y="${cellY + 2}" fill="${GOLD}" font-size="${Math.round(cellFontSize * 0.75)}" font-weight="600" text-anchor="middle">${escapeXml('FULL SHEET \u2192')}</text>`;
  });

  // Bottom CTA bar
  const ctaY = height - Math.round(height * 0.085);
  svg += `
  <rect x="0" y="${ctaY - 20}" width="${width}" height="${height - ctaY + 20}" fill="${NAVY}"/>
  <text x="${pad}" y="${ctaY + ctaSize + 2}" fill="${WHITE}" font-size="${ctaSize}" font-weight="600">${escapeXml('Get the full capture sheet with all 14 programs, timing windows, and action cues')}</text>
  <text x="${width - pad}" y="${ctaY + ctaSize + 2}" fill="${TEAL}" font-size="${ctaSize}" font-weight="600" text-anchor="end">${escapeXml('missionmeetstech.com/intel')}</text>`;

  // MMT brand mark bottom-left
  svg += `
  <text x="${pad}" y="${height - 10}" fill="${TEXT_SEC}" font-size="${Math.round(ctaSize * 0.7)}" font-weight="500" opacity="0.5">${escapeXml('Mission Meets Tech')}</text>`;

  svg += '\n</svg>';
  return svg;
}

async function generate() {
  if (!fs.existsSync(DIST_OG)) {
    fs.mkdirSync(DIST_OG, { recursive: true });
  }

  // 1600x900 (LinkedIn article image)
  const svg1600 = buildSvg(1600, 900);
  await sharp(Buffer.from(svg1600))
    .png({ quality: 95 })
    .toFile(path.join(DIST_OG, 'capture-intel-teaser-1600x900.png'));
  console.log('Generated capture-intel-teaser-1600x900.png');

  // 1200x1200 (LinkedIn square)
  const svg1200 = buildSvg(1200, 1200);
  await sharp(Buffer.from(svg1200))
    .png({ quality: 95 })
    .toFile(path.join(DIST_OG, 'capture-intel-teaser-1200x1200.png'));
  console.log('Generated capture-intel-teaser-1200x1200.png');

  // 1200x630 (OG image for the landing page)
  const svgOg = buildSvg(1200, 630);
  await sharp(Buffer.from(svgOg))
    .png({ quality: 95 })
    .toFile(path.join(DIST_OG, 'capture-intelligence.png'));
  console.log('Generated capture-intelligence.png (OG image)');
}

generate().catch(err => { console.error(err); process.exit(1); });
