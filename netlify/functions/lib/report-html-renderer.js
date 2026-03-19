// ============================================================
// report-html-renderer.js — Self-contained HTML report generator
//
// Produces complete HTML documents that open in any browser,
// print cleanly, and attach to emails. Replaces PDFKit.
// ============================================================

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function gradeColor(g) {
  const c = { A: "#16a34a", "B+": "#22c55e", B: "#84cc16", "B-": "#eab308", "C+": "#f97316", C: "#ef4444", D: "#dc2626", F: "#991b1b" };
  return c[g] || "#6b7280";
}

function verdictColor(v) {
  if (v === "PASS") return "#16a34a";
  if (v === "CONDITIONAL") return "#eab308";
  return "#dc2626";
}

function scoreColor(s) {
  if (s >= 70) return "#16a34a";
  if (s >= 50) return "#eab308";
  return "#ef4444";
}

const LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="6" fill="#0a0e17"/><path d="M8 22V10l4 6 4-6v12" stroke="#00e5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 10h4a2 2 0 0 1 0 4h-4v8" stroke="#00e5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; background: #fff; }
  .header { background: #0a0e17; color: #f8fafc; padding: 32px 40px; }
  .header-title { font-size: 24px; font-weight: 700; color: #00e5fa; letter-spacing: 0.5px; }
  .header-sub { font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 4px; }
  .content { padding: 32px 40px; }
  h2 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #00e5fa; }
  h3 { font-size: 15px; font-weight: 600; color: #334155; margin: 20px 0 8px; }
  p { margin: 0 0 12px; font-size: 14px; }
  ul, ol { margin: 0 0 12px; padding-left: 24px; font-size: 14px; }
  li { margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-weight: 700; font-size: 13px; color: #fff; }
  .badge-sm { font-size: 11px; padding: 1px 8px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; margin: 12px 0; overflow: hidden; }
  .card-header { padding: 10px 16px; background: #f9fafb; border-bottom: 1px solid #e2e8f0; }
  .card-body { padding: 16px; }
  .alert { padding: 12px 16px; border-radius: 8px; margin: 12px 0; font-size: 14px; font-weight: 600; }
  .alert-red { background: #fef2f2; border: 2px solid #fecaca; color: #991b1b; }
  .alert-amber { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
  .alert-blue { background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; }
  .alert-gray { background: #f9fafb; border: 1px solid #e5e7eb; color: #475569; }
  .big-number { font-size: 36px; font-weight: 800; text-align: center; margin: 8px 0; }
  .meta { font-size: 12px; color: #6b7280; }
  .footer { padding: 20px 40px; background: #f9fafb; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #9ca3af; }
  .tier-stop { border-left: 4px solid #dc2626; background: #fef2f2; padding: 12px 16px; margin: 8px 0; border-radius: 0 8px 8px 0; }
  .tier-high { border-left: 4px solid #f97316; background: #fffbeb; padding: 12px 16px; margin: 8px 0; border-radius: 0 8px 8px 0; }
  .tier-polish { border-left: 4px solid #3b82f6; background: #f0f4f8; padding: 12px 16px; margin: 8px 0; border-radius: 0 8px 8px 0; }
  .tier-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .pipeline-card { border-left: 4px solid #00e5fa; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #00e5fa; border-radius: 0 8px 8px 0; padding: 12px 16px; margin: 10px 0; }
  .pipeline-label { font-size: 11px; font-weight: 700; color: #475569; }
  .pipeline-value { font-size: 13px; color: #1e293b; }
  a { color: #0369a1; }
  .original-box { background: #f3f4f6; padding: 12px 16px; border-radius: 6px; margin: 8px 0; font-style: italic; color: #6b7280; font-size: 13px; }
  .strengthened-box { background: #f0f9ff; border: 1px solid #bae6fd; padding: 12px 16px; border-radius: 6px; margin: 8px 0; font-size: 13px; }
  @media print {
    body { background: #fff; }
    .container { max-width: 100%; box-shadow: none; }
    .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .badge, .alert, .tier-stop, .tier-high, .tier-polish, .pipeline-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2 { page-break-after: avoid; }
    table, .card { page-break-inside: avoid; }
    .footer { page-break-before: always; }
  }
`;

function htmlShell(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
<div class="container">
${bodyContent}
</div>
</body>
</html>`;
}

// ============================================================
// PROPOSALPULSE SCORE REPORT
// ============================================================

function renderProposalPulseHTML(data) {
  const { scorecard, overallGrade, documentLabel, fileName, nextSteps,
    competitivePositioning, complianceNote, hasSow,
    redTeamSections, redTeamExecutiveSummary, redTeamNextSteps,
    pwinEstimate, pwinJustification } = data || {};

  const sc = scorecard || {};
  const scores = sc.scores || [];
  const verdict = sc.verdict || "N/A";
  const pwinDetails = sc._pwin_details || {};
  const killConds = pwinDetails.kill_conditions || [];
  const penalties = pwinDetails.penalties || [];
  const compSummary = sc._compliance_summary || null;
  const compFlags = sc._compliance_flags || [];
  const compMatrix = sc.compliance_matrix || [];

  let body = "";

  // Header
  body += `<div class="header">
    <div style="display:flex;align-items:center;gap:12px;">${LOGO_SVG}<div>
      <div class="header-title">PROPOSALPULSE</div>
      <div class="header-sub">Federal Proposal Assessment Report</div>
    </div></div>
  </div>`;

  body += `<div class="content">`;

  // Meta
  body += `<p class="meta">${esc(documentLabel || "")} — ${esc(fileName || "uploaded document")} — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>`;

  // Verdict + Grade
  body += `<div style="display:flex;gap:24px;justify-content:center;margin:24px 0;">
    <div style="text-align:center;"><p class="meta">VERDICT</p><div class="big-number" style="color:${verdictColor(verdict)}">${esc(verdict)}</div></div>
    <div style="text-align:center;"><p class="meta">OVERALL GRADE</p><div class="big-number" style="color:${gradeColor(overallGrade)}">${esc(overallGrade || "N/A")}</div></div>
  </div>`;

  if (sc.verdict_summary) body += `<p>${esc(sc.verdict_summary)}</p>`;

  // Scorecard table
  body += `<h2>Scoring Breakdown</h2><table><tr><th>Criteria</th><th>Grade</th><th>Assessment</th></tr>`;
  for (const s of scores) {
    body += `<tr><td>${esc(s.title)}</td><td><span class="badge" style="background:${gradeColor(s.grade)}">${esc(s.grade)}</span></td><td>${esc(s.assessment)}</td></tr>`;
  }
  body += `</table>`;

  // Kill conditions (ABOVE pWin)
  if (killConds.length > 0) {
    body += `<div style="margin:20px 0;">`;
    for (const kc of killConds) body += `<div class="alert alert-red">${esc(kc)}</div>`;
    body += `</div>`;
  }

  // pWin
  const pwf = sc.pWin_factors || [];
  if (pwf.length > 0) {
    body += `<h2>pWin Analysis</h2>`;
    body += `<table><tr><th>Factor</th><th style="text-align:right">Score</th><th>Note</th></tr>`;
    for (const f of pwf) {
      const sv = typeof f.value === "number" ? f.value : parseInt(String(f.value)) || 0;
      body += `<tr><td>${esc(f.factor)}</td><td style="text-align:right;font-weight:700;color:${scoreColor(sv)}">${esc(String(f.value))}</td><td class="meta">${esc(f.note || "")}</td></tr>`;
    }
    body += `</table>`;
    if (penalties.length > 0) {
      body += `<div class="alert alert-amber"><strong>Interdependency Penalties:</strong><ul>`;
      for (const p of penalties) body += `<li>${esc(p.description)}</li>`;
      body += `</ul></div>`;
    }
    const pe = sc.pwin_estimate || pwinEstimate;
    if (pe) body += `<div class="big-number" style="color:#0369a1;margin:16px 0;">Estimated pWin: ${esc(pe)}</div>`;
  }

  // Tiered next steps
  const ns = nextSteps || sc.next_steps || {};
  const tiers = [
    { key: "stop_ship", cls: "tier-stop", label: "STOP-SHIP", color: "#991b1b" },
    { key: "high", cls: "tier-high", label: "HIGH PRIORITY", color: "#92400e" },
    { key: "polish", cls: "tier-polish", label: "POLISH", color: "#475569" },
  ];
  const hasTiers = tiers.some(({ key }) => (ns[key] || []).length > 0);
  if (hasTiers) {
    body += `<h2>Prioritized Next Steps</h2>`;
    if (sc.top_fix) body += `<div class="alert alert-blue"><strong>Top Fix:</strong> ${esc(sc.top_fix)}</div>`;
    for (const { key, cls, label, color } of tiers) {
      const items = ns[key] || [];
      if (items.length === 0) continue;
      body += `<div class="${cls}"><div class="tier-label" style="color:${color}">${label}</div><ul>`;
      for (const item of items) body += `<li>${esc(item)}</li>`;
      body += `</ul></div>`;
    }
  }

  // Red flags
  if (sc.red_flags && sc.red_flags.length > 0) {
    body += `<h2>Red Flags</h2>`;
    for (const rf of sc.red_flags) body += `<div class="alert alert-red">${esc(rf)}</div>`;
  }

  // Compliance matrix
  if (compMatrix.length > 0) {
    body += `<h2>Compliance Matrix</h2>`;
    if (compSummary) {
      const csColor = compSummary.score >= 80 ? "#16a34a" : compSummary.score >= 60 ? "#eab308" : "#dc2626";
      body += `<div class="big-number" style="color:${csColor};font-size:28px;">${compSummary.score}% Compliant</div>`;
      body += `<p class="meta" style="text-align:center;">${compSummary.compliant} compliant, ${compSummary.partial} partial, ${compSummary.missing} missing</p>`;
    }
    for (const flag of compFlags) body += `<div class="alert alert-red">${esc(flag)}</div>`;
    body += `<table><tr><th>Requirement</th><th>Reference</th><th>Status</th><th>Proposal Location</th></tr>`;
    const statusColors = { COMPLIANT: "#16a34a", PARTIAL: "#eab308", MISSING: "#dc2626", "N/A": "#6b7280" };
    for (const c of compMatrix) {
      body += `<tr><td>${esc(c.requirement)}${c.notes ? `<br><span class="meta">${esc(c.notes)}</span>` : ""}</td><td class="meta">${esc(c.lm_reference || "")}</td><td><span class="badge badge-sm" style="background:${statusColors[c.status] || "#6b7280"}">${esc(c.status)}</span></td><td class="meta">${esc(c.proposal_section || "")}</td></tr>`;
    }
    body += `</table>`;
  } else if (complianceNote) {
    body += `<div class="alert alert-amber">${esc(complianceNote)}</div>`;
  }

  // Competitive positioning
  const cp = competitivePositioning || sc.competitive_positioning;
  if (cp) {
    body += `<h2>Competitive Positioning</h2>`;
    const dc = { strong: "#16a34a", moderate: "#eab308", weak: "#f97316", absent: "#ef4444" };
    body += `<div style="font-size:20px;font-weight:800;color:${dc[cp.differentiation] || "#6b7280"}">${esc((cp.differentiation || "").toUpperCase())}</div>`;
    if (cp.reasoning) body += `<p>${esc(cp.reasoning)}</p>`;
  }

  // Red Team sections (if included)
  if (redTeamSections && redTeamSections.length > 0) {
    body += `<h2>Red Team Review — Section-by-Section</h2>`;
    if (redTeamExecutiveSummary && redTeamExecutiveSummary.length > 0) {
      body += `<div class="alert alert-blue"><strong>Executive Change Summary:</strong><ul>`;
      for (const b of redTeamExecutiveSummary) body += `<li>${esc(b)}</li>`;
      body += `</ul></div>`;
    }
    for (const s of redTeamSections) {
      body += `<div class="card"><div class="card-header"><strong>${esc(s.criterion_title)}</strong> <span class="badge badge-sm" style="background:${gradeColor(s.original_grade)}">${esc(s.original_grade)}</span>`;
      const statusBg = s.status === "rewritten" ? "#f97316" : s.status === "skeleton" ? "#dc2626" : "#16a34a";
      body += ` <span class="badge badge-sm" style="background:${statusBg}">${esc(s.status === "skeleton" ? "Architecture" : s.status === "rewritten" ? "Rewritten" : "Polished")}</span>`;
      if (s.confidence_pct != null) body += ` <span class="meta">${s.confidence_pct}% confidence</span>`;
      body += `</div><div class="card-body">`;
      body += `<p class="meta" style="margin-bottom:4px;">ORIGINAL</p><div class="original-box">${esc(s.original_excerpt)}</div>`;
      body += `<p class="meta" style="margin-bottom:4px;">STRENGTHENED</p><div class="strengthened-box">${esc(s.strengthened_text)}</div>`;
      if (s.changes_made) body += `<p><em style="color:#475569;">What changed: ${esc(s.changes_made)}</em></p>`;
      if (s.accuracy_ok != null) {
        const chk = (ok, l) => `<span style="color:${ok ? "#16a34a" : "#ef4444"}">${ok ? "✓" : "✗"} ${l}</span>`;
        body += `<p class="meta">${chk(s.accuracy_ok, "Accuracy")} &nbsp; ${chk(s.consistency_ok, "Consistency")} &nbsp; ${chk(s.improvement_ok, "Improvement")}</p>`;
      }
      body += `</div></div>`;
    }
    if (redTeamNextSteps && redTeamNextSteps.length > 0) {
      body += `<h3>Prioritized Next Steps</h3><ol>`;
      for (const step of redTeamNextSteps) body += `<li>${esc(step)}</li>`;
      body += `</ol>`;
    }
  }

  body += `</div>`; // end content

  // Footer
  body += `<div class="footer">Generated by Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com">missionmeetstech.com</a> &middot; ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}<br>AI-assisted assessment — verify all findings independently.</div>`;

  return htmlShell(`ProposalPulse Score Report — ${documentLabel || "Assessment"}`, body);
}

// ============================================================
// MARKETPULSE TACTICAL BRIEF
// ============================================================

function renderMarketPulseHTML(data) {
  const { synthesis, citations, name, company, topic, audience, generatedAt } = data || {};

  let body = "";

  // Header
  body += `<div class="header">
    <div style="display:flex;align-items:center;gap:12px;">${LOGO_SVG}<div>
      <div class="header-title">MARKETPULSE</div>
      <div class="header-sub">Federal Health IT Market Intelligence</div>
    </div></div>
  </div>`;

  body += `<div class="content">`;

  // Cover info
  const prepFor = company ? `${esc(name)}, ${esc(company)}` : esc(name);
  body += `<p style="text-align:center;font-weight:700;color:#94a3b8;font-size:12px;letter-spacing:1px;">CONFIDENTIAL — Prepared for ${prepFor}</p>`;
  body += `<h2 style="border-bottom:none;">Research Topic</h2><p style="font-size:16px;">${esc(topic)}</p>`;
  body += `<p class="meta">Date: ${new Date(generatedAt || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}${audience ? ` &middot; Audience: ${esc(audience)}` : ""}</p>`;
  body += `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">`;

  // Render synthesis markdown-ish content
  const lines = (synthesis || "").split("\n");
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) { body += "<br>"; continue; }

    // Skip internal debug
    if (/^Classification:/i.test(trimmed)) continue;
    if (/^METHODOLOGY APPENDIX \(Auto-Generated\)/i.test(trimmed)) continue;

    // Tables
    if (/^\|.*\|$/.test(trimmed)) {
      if (!inTable) { inTable = true; tableRows = []; }
      tableRows.push(trimmed);
      // Check if next line is not a table
      if (i + 1 >= lines.length || !/^\|.*\|$/.test(lines[i + 1].trim())) {
        body += renderMarkdownTable(tableRows);
        inTable = false;
        tableRows = [];
      }
      continue;
    }

    // Pipeline entries
    if (trimmed.startsWith("CONTRACT/OPPORTUNITY:")) {
      const entry = [trimmed];
      while (i + 1 < lines.length && /^(Agency|Contract\s*#|NAICS|Set-Aside|Estimated Value|Incumbent|Status|Timeline|Source|SDVOSB Relevance):/.test(lines[i + 1].trim())) {
        entry.push(lines[++i].trim());
      }
      body += renderPipelineEntry(entry);
      continue;
    }

    // Section headers
    if (/^#{1,3}\s/.test(trimmed)) {
      const text = trimmed.replace(/^#+\s*/, "");
      body += `<h2>${esc(text)}</h2>`;
      continue;
    }
    if (/^[A-Z][A-Z &\/\-]+$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 80) {
      body += `<h2>${esc(trimmed)}</h2>`;
      continue;
    }

    // Subheaders
    if (/^###?\s/.test(trimmed)) {
      body += `<h3>${esc(trimmed.replace(/^#+\s*/, ""))}</h3>`;
      continue;
    }

    // Lists
    if (/^\d+\.\s/.test(trimmed) || /^[-•]\s/.test(trimmed)) {
      const text = trimmed.replace(/^[-•]\s*/, "").replace(/^\d+\.\s*/, "");
      body += `<ul><li>${renderInlineBold(text)}</li></ul>`;
      continue;
    }

    // Paragraphs
    body += `<p>${renderInlineBold(trimmed)}</p>`;
  }

  // Citations
  if (citations && citations.length > 0) {
    body += `<h2>Sources</h2><ol style="font-size:12px;">`;
    for (const url of citations.slice(0, 20)) {
      const u = esc(url);
      body += `<li><a href="${u}">${u}</a></li>`;
    }
    if (citations.length > 20) body += `<li class="meta">... and ${citations.length - 20} additional sources</li>`;
    body += `</ol>`;
  }

  body += `</div>`; // end content

  // Footer
  body += `<div class="footer">Generated by Mission Meets Tech LLC &middot; <a href="https://missionmeetstech.com">missionmeetstech.com</a> &middot; ${new Date(generatedAt || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}<br>AI-assisted research — verify all claims independently.</div>`;

  return htmlShell(`MarketPulse Report — ${(topic || "").substring(0, 60)}`, body);
}

// --- Helpers ---

function renderMarkdownTable(rows) {
  const parsed = rows.map((r) => r.split("|").filter((c) => c.trim()).map((c) => c.trim()));
  const data = parsed.filter((r) => !r[0].match(/^[-:]+$/));
  if (data.length < 2) return "";
  const [header, ...body] = data;
  let html = `<table><tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
  for (const row of body) {
    html += `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
  }
  return html + `</table>`;
}

function renderPipelineEntry(lines) {
  let html = `<div class="pipeline-card">`;
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const label = line.substring(0, idx).trim();
    let value = line.substring(idx + 1).trim();
    // Make Source URLs clickable
    if (label === "Source" && /^https?:\/\//.test(value)) {
      value = `<a href="${esc(value)}">${esc(value)}</a>`;
    } else {
      value = esc(value);
    }
    html += `<div><span class="pipeline-label">${esc(label)}:</span> <span class="pipeline-value">${value}</span></div>`;
  }
  return html + `</div>`;
}

function renderInlineBold(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

module.exports = { renderProposalPulseHTML, renderMarketPulseHTML };
