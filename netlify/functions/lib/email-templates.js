// email-templates.js — HTML email templates for Mission Meets Tech
//
// Templates use inline CSS only (email clients strip <style> blocks).
// Dark-on-light layout for email readability (inverted from site dark theme).

// --- Grade color mapping (matches proposal-pulse.html) ---
function gradeColor(grade) {
  const colors = {
    A: "#16a34a",
    "B+": "#22c55e",
    B: "#84cc16",
    "B-": "#eab308",
    "C+": "#f97316",
    C: "#ef4444",
    D: "#dc2626",
    F: "#991b1b",
  };
  return colors[grade] || "#6b7280";
}

function verdictColor(verdict) {
  if (verdict === "PASS") return "#16a34a";
  if (verdict === "CONDITIONAL") return "#eab308";
  return "#dc2626";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// SCORE RECEIPT EMAIL
// ============================================================

/**
 * Build branded HTML email for Proposal Pulse score receipt.
 * @param {Object} data
 * @param {Object} data.scorecard - Full scorecard from Claude (scores, verdict, red_flags, top_fix)
 * @param {string} data.documentType - Document type key (e.g. "pitch_deck")
 * @param {string} data.documentLabel - Human-readable label (e.g. "Pitch Deck")
 * @param {string} data.overallGrade - Computed overall grade (A, B+, etc.)
 * @param {number} data.usesRemaining - Free uses remaining after this assessment
 * @param {string} data.fileName - Original file name
 * @returns {string} HTML email body
 */
function buildScoreReceiptHtml(data) {
  const { scorecard, documentLabel, overallGrade, usesRemaining, fileName } = data;
  const verdict = scorecard.verdict || "N/A";
  const vColor = verdictColor(verdict);
  const gColor = gradeColor(overallGrade);

  // Build scorecard rows
  const scoreRows = (scorecard.scores || [])
    .map(
      (s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(s.title)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
          <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-weight:700;font-size:14px;color:#fff;background-color:${gradeColor(s.grade)};">${escapeHtml(s.grade)}</span>
        </td>
      </tr>`
    )
    .join("");

  // Build red flags list
  let redFlagsHtml = "";
  if (scorecard.red_flags && scorecard.red_flags.length > 0) {
    const items = scorecard.red_flags
      .map((rf) => `<li style="margin-bottom:4px;color:#dc2626;font-size:14px;">${escapeHtml(rf)}</li>`)
      .join("");
    redFlagsHtml = `
      <div style="margin-top:24px;">
        <h3 style="font-size:16px;font-weight:700;color:#991b1b;margin:0 0 8px 0;">Red Flags</h3>
        <ul style="margin:0;padding-left:20px;">${items}</ul>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div style="background-color:#00050f;padding:24px 32px;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#00E5FA;letter-spacing:0.5px;">MISSION MEETS TECH</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">Proposal Pulse</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px 0;">Your Proposal Pulse Results</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
        ${escapeHtml(documentLabel)} &mdash; ${escapeHtml(fileName || "uploaded document")}
      </p>

      <!-- Verdict + Grade -->
      <div style="display:flex;margin-bottom:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:16px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;text-align:center;" width="50%">
            <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Verdict</p>
            <p style="margin:0;font-size:24px;font-weight:800;color:${vColor};">${escapeHtml(verdict)}</p>
          </td>
          <td width="16"></td>
          <td style="padding:16px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;text-align:center;" width="50%">
            <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Overall Grade</p>
            <p style="margin:0;font-size:24px;font-weight:800;color:${gColor};">${escapeHtml(overallGrade)}</p>
          </td>
        </tr></table>
      </div>

      ${scorecard.verdict_summary ? `<p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px 0;">${escapeHtml(scorecard.verdict_summary)}</p>` : ""}

      <!-- Scorecard Table -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr style="background-color:#f9fafb;">
          <th style="padding:10px 12px;text-align:left;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Criteria</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Grade</th>
        </tr>
        ${scoreRows}
      </table>

      <!-- Top Fix -->
      ${
        scorecard.top_fix
          ? `
      <div style="margin-top:24px;padding:16px 20px;border-left:4px solid #00E5FA;background-color:#f0f9ff;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369a1;">Top Fix</p>
        <p style="margin:0;font-size:15px;color:#1e3a5f;line-height:1.5;">${escapeHtml(scorecard.top_fix)}</p>
      </div>`
          : ""
      }

      ${redFlagsHtml}

      <!-- Uses remaining -->
      <p style="margin:32px 0 0;font-size:13px;color:#9ca3af;text-align:center;">
        ${usesRemaining > 0 ? `You have ${usesRemaining} free assessment${usesRemaining === 1 ? "" : "s"} remaining.` : "You've used all 3 free assessments."}
      </p>

      <!-- CTA -->
      <div style="margin-top:24px;text-align:center;">
        <a href="https://missionmeetstech.com/contact.html" style="display:inline-block;padding:12px 28px;background-color:#00050f;color:#00E5FA;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Need a Full Review? Contact Us</a>
      </div>

    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">
        <a href="https://missionmeetstech.com" style="color:#0369a1;text-decoration:none;">Mission Meets Tech</a> &mdash; Federal Health IT Intelligence
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        Views expressed are those of the authors and do not represent any employer or government agency.
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ============================================================
// WEEKLY REPORT EMAIL
// ============================================================

/**
 * Build branded HTML email for weekly usage digest.
 * @param {Object} stats
 * @param {number} stats.newUsers - New users this week
 * @param {number} stats.totalAssessments - Assessments this week
 * @param {Object} stats.byDocType - { pitch_deck: 5, white_paper: 2, ... }
 * @param {Object} stats.byVerdict - { PASS: 3, CONDITIONAL: 5, FAIL: 2 }
 * @param {number|null} stats.avgScore - Average score this week
 * @param {number} stats.limitHits - Users who hit the free limit this week
 * @param {number} stats.allTimeUsers - Total users
 * @param {number} stats.allTimeAssessments - Total assessments
 * @param {string} stats.weekStart - ISO date string for week start
 * @param {string} stats.weekEnd - ISO date string for week end
 * @returns {string} HTML email body
 */
function buildWeeklyReportHtml(stats) {
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Doc type rows
  const docTypeRows = Object.entries(stats.byDocType || {})
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([type, count]) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(type.replace(/_/g, " "))}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:14px;font-weight:600;color:#111827;">${count}</td>
      </tr>`
    )
    .join("");

  // Verdict rows
  const verdictRows = ["PASS", "CONDITIONAL", "FAIL"]
    .filter((v) => (stats.byVerdict || {})[v])
    .map(
      (v) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">
          <span style="color:${verdictColor(v)};font-weight:600;">${v}</span>
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:14px;font-weight:600;color:#111827;">${stats.byVerdict[v]}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div style="background-color:#00050f;padding:24px 32px;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#00E5FA;letter-spacing:0.5px;">MISSION MEETS TECH</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">Weekly Proposal Pulse Report</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">Weekly Usage Digest</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">${fmtDate(stats.weekStart)} &ndash; ${fmtDate(stats.weekEnd)}</p>

      <!-- Key Metrics -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
        <td style="padding:16px;background-color:#f0f9ff;border-radius:8px;text-align:center;border:1px solid #bae6fd;" width="33%">
          <p style="margin:0;font-size:28px;font-weight:800;color:#0369a1;">${stats.newUsers}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">New Users</p>
        </td>
        <td width="12"></td>
        <td style="padding:16px;background-color:#f0fdf4;border-radius:8px;text-align:center;border:1px solid #bbf7d0;" width="33%">
          <p style="margin:0;font-size:28px;font-weight:800;color:#16a34a;">${stats.totalAssessments}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Assessments</p>
        </td>
        <td width="12"></td>
        <td style="padding:16px;background-color:#fefce8;border-radius:8px;text-align:center;border:1px solid #fde68a;" width="33%">
          <p style="margin:0;font-size:28px;font-weight:800;color:#ca8a04;">${stats.avgScore !== null ? stats.avgScore.toFixed(1) : "—"}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Avg Score</p>
        </td>
      </tr></table>

      <!-- By Document Type -->
      ${
        docTypeRows
          ? `
      <h3 style="font-size:15px;font-weight:600;color:#374151;margin:0 0 8px;">By Document Type</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        ${docTypeRows}
      </table>`
          : ""
      }

      <!-- By Verdict -->
      ${
        verdictRows
          ? `
      <h3 style="font-size:15px;font-weight:600;color:#374151;margin:0 0 8px;">By Verdict</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        ${verdictRows}
      </table>`
          : ""
      }

      <!-- Limit Hits -->
      ${
        stats.limitHits > 0
          ? `
      <div style="padding:12px 16px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:20px;">
        <p style="margin:0;font-size:14px;color:#991b1b;"><strong>${stats.limitHits}</strong> user${stats.limitHits === 1 ? "" : "s"} hit the free limit this week.</p>
      </div>`
          : ""
      }

      <!-- All-Time -->
      <div style="margin-top:24px;padding:16px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <h3 style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">All-Time Totals</h3>
        <p style="margin:0;font-size:14px;color:#374151;"><strong>${stats.allTimeUsers}</strong> users &middot; <strong>${stats.allTimeAssessments}</strong> assessments</p>
      </div>

    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">
        <a href="https://missionmeetstech.com" style="color:#0369a1;text-decoration:none;">Mission Meets Tech</a> &mdash; Internal Report
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        This is an automated report. Do not reply to this email.
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ============================================================
// GOLD TEAM REVIEW EMAIL
// ============================================================

/**
 * Build branded HTML email for Gold Team Review.
 * Full document rewrite (all 9 sections) + pWin + executive summary + next steps.
 * @param {Object} data
 * @param {string} data.documentLabel - Human-readable label (e.g. "Pitch Deck")
 * @param {string} data.fileName - Original file name
 * @param {string} data.verdict - PASS | CONDITIONAL | FAIL
 * @param {string} data.overallGrade - Computed overall grade
 * @param {Array} data.scores - Full scorecard scores array
 * @param {Array} data.strengthenedSections - Merged rewrite + review sections (all 9)
 * @param {number|null} data.pwinEstimate - Probability of win (0-100)
 * @param {string|null} data.pwinJustification - pWin justification text
 * @param {number|null} data.overallConfidence - Overall confidence percentage from reviewer
 * @param {string|null} data.reviewerNotes - Reviewer summary notes
 * @param {Array|null} data.executiveSummary - 3-5 bullet points
 * @param {Array|null} data.nextSteps - 3-5 prioritized actions
 * @returns {string} HTML email body
 */
function buildGoldTeamReviewHtml(data) {
  const {
    documentLabel,
    fileName,
    verdict,
    overallGrade,
    scores,
    strengthenedSections,
    pwinEstimate,
    pwinJustification,
    overallConfidence,
    reviewerNotes,
    executiveSummary,
    nextSteps,
  } = data;

  const vColor = verdictColor(verdict);
  const gColor = gradeColor(overallGrade);
  const sectionCount = strengthenedSections.length;
  const confText = overallConfidence !== null ? `${overallConfidence}% overall confidence` : "";

  // pWin color coding
  function pwinColor(pwin) {
    if (pwin >= 60) return "#16a34a";
    if (pwin >= 40) return "#eab308";
    if (pwin >= 20) return "#f97316";
    return "#ef4444";
  }

  // pWin badge
  let pwinHtml = "";
  if (pwinEstimate !== null) {
    const pColor = pwinColor(pwinEstimate);
    pwinHtml = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;padding:16px 32px;border-radius:12px;border:2px solid ${pColor};background-color:rgba(0,0,0,0.02);">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Estimated pWin</p>
          <p style="margin:0;font-size:36px;font-weight:800;color:${pColor};">${pwinEstimate}%</p>
        </div>
        ${pwinJustification ? `<p style="margin:12px auto 0;font-size:13px;color:#6b7280;max-width:450px;line-height:1.5;">${escapeHtml(pwinJustification)}</p>` : ""}
      </div>`;
  }

  // Executive summary bullets
  let execSummaryHtml = "";
  if (executiveSummary && executiveSummary.length > 0) {
    const bullets = executiveSummary
      .map((b) => `<li style="margin-bottom:6px;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(b)}</li>`)
      .join("");
    execSummaryHtml = `
      <div style="margin-bottom:24px;padding:16px 20px;border-left:4px solid #00E5FA;background-color:#f0f9ff;border-radius:0 8px 8px 0;">
        <h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.5px;">Executive Change Summary</h3>
        <ul style="margin:0;padding-left:20px;">${bullets}</ul>
      </div>`;
  }

  // Compact scorecard summary
  const summaryRows = (scores || [])
    .map((s) => {
      const section = strengthenedSections.find((ss) => ss.criterion_id === s.id);
      const status = section ? section.status : "polished";
      const statusLabel = status === "rewritten" ? "Rewritten" : "Polished";
      const statusColor = status === "rewritten" ? "#f97316" : "#16a34a";
      return `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${escapeHtml(s.title)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;color:#fff;background-color:${gradeColor(s.grade)};">${escapeHtml(s.grade)}</span>
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;font-weight:600;color:${statusColor};">${statusLabel}</td>
      </tr>`;
    })
    .join("");

  // Section detail blocks (all 9)
  const sectionBlocks = strengthenedSections
    .map((s) => {
      const confBadge =
        s.confidence_pct !== null
          ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;background-color:${s.confidence_pct >= 70 ? "#16a34a" : s.confidence_pct >= 50 ? "#eab308" : "#ef4444"};margin-left:8px;">${s.confidence_pct}% confidence</span>`
          : "";

      const statusBadge = s.status === "rewritten"
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background-color:#f97316;margin-left:8px;">Rewritten</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background-color:#16a34a;margin-left:8px;">Polished</span>`;

      // Triple-check indicators
      let tripleCheck = "";
      if (s.accuracy_ok !== null) {
        const check = (ok, label) =>
          `<span style="display:inline-block;margin-right:12px;font-size:12px;color:${ok ? "#16a34a" : "#ef4444"};">${ok ? "\u2713" : "\u2717"} ${label}</span>`;
        tripleCheck = `
        <div style="margin-top:8px;">
          ${check(s.accuracy_ok, "Accuracy")}
          ${check(s.consistency_ok, "Consistency")}
          ${check(s.improvement_ok, "Improvement")}
        </div>`;
      }

      const reviewNotes =
        s.review_notes && s.review_notes.length > 0
          ? `<p style="margin:8px 0 0;font-size:12px;color:#6b7280;font-style:italic;">${escapeHtml(s.review_notes)}</p>`
          : "";

      return `
      <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="padding:12px 16px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:15px;font-weight:700;color:#111827;">${escapeHtml(s.criterion_title)}</span>
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:12px;color:#fff;background-color:${gradeColor(s.original_grade)};margin-left:8px;">${escapeHtml(s.original_grade)}</span>
          ${statusBadge}
          ${confBadge}
        </div>

        <div style="padding:16px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">Original</p>
          <div style="padding:12px 16px;background-color:#f3f4f6;border-radius:6px;margin-bottom:16px;">
            <p style="margin:0;font-size:14px;color:#6b7280;font-style:italic;line-height:1.6;">${escapeHtml(s.original_excerpt)}</p>
          </div>

          <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369a1;">Strengthened</p>
          <div style="padding:12px 16px;background-color:#ffffff;border:1px solid #bae6fd;border-radius:6px;margin-bottom:12px;">
            <p style="margin:0;font-size:14px;color:#111827;line-height:1.6;">${escapeHtml(s.strengthened_text)}</p>
          </div>

          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;"><strong style="color:#374151;">What changed:</strong> ${escapeHtml(s.changes_made)}</p>

          ${tripleCheck}
          ${reviewNotes}
        </div>
      </div>`;
    })
    .join("");

  // Next steps
  let nextStepsHtml = "";
  if (nextSteps && nextSteps.length > 0) {
    const items = nextSteps
      .map((step, i) => `<li style="margin-bottom:8px;font-size:14px;color:#374151;line-height:1.5;"><strong style="color:#111827;">${i + 1}.</strong> ${escapeHtml(step)}</li>`)
      .join("");
    nextStepsHtml = `
      <div style="margin-top:24px;margin-bottom:24px;">
        <h3 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;">Prioritized Next Steps</h3>
        <ol style="margin:0;padding-left:0;list-style:none;">${items}</ol>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div style="background-color:#00050f;padding:24px 32px;text-align:center;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#00E5FA;letter-spacing:0.5px;">MISSION MEETS TECH</h1>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">Gold Team Review</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px 0;">Your Gold Team Review</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px 0;">
        ${escapeHtml(documentLabel)} &mdash; ${escapeHtml(fileName || "uploaded document")}
      </p>

      <!-- pWin Badge -->
      ${pwinHtml}

      <!-- Summary bar -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
        <td style="padding:12px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;text-align:center;" width="33%">
          <p style="margin:0;font-size:20px;font-weight:800;color:${vColor};">${escapeHtml(verdict || "N/A")}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;">Verdict</p>
        </td>
        <td width="8"></td>
        <td style="padding:12px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;text-align:center;" width="33%">
          <p style="margin:0;font-size:20px;font-weight:800;color:${gColor};">${escapeHtml(overallGrade)}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;">Grade</p>
        </td>
        <td width="8"></td>
        <td style="padding:12px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;text-align:center;" width="33%">
          <p style="margin:0;font-size:20px;font-weight:800;color:#0369a1;">${sectionCount}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;">Sections</p>
        </td>
      </tr></table>

      ${confText ? `<p style="font-size:13px;color:#6b7280;margin:0 0 20px;text-align:center;">${sectionCount} section${sectionCount !== 1 ? "s" : ""} reviewed &middot; ${confText}</p>` : ""}

      <!-- Executive Change Summary -->
      ${execSummaryHtml}

      <!-- Compact scorecard -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
        <tr style="background-color:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Criteria</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Grade</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Status</th>
        </tr>
        ${summaryRows}
      </table>

      <!-- All section detail blocks -->
      <h3 style="font-size:17px;font-weight:700;color:#111827;margin:0 0 16px;">Section-by-Section Review</h3>
      ${sectionBlocks}

      <!-- Next Steps -->
      ${nextStepsHtml}

      <!-- Disclaimer -->
      <div style="margin-top:24px;padding:16px;background-color:#fefce8;border:1px solid #fde68a;border-radius:8px;">
        <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.5;">
          <strong>Important:</strong> This is an AI-generated starting point. Review all strengthened text before submission. Any <code style="background:#fef3c7;padding:1px 4px;border-radius:3px;font-size:12px;">[INSERT: ...]</code> placeholders require your specific data. Facts and figures should be verified against your actual records.
        </p>
      </div>

      ${reviewerNotes ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;font-style:italic;">${escapeHtml(reviewerNotes)}</p>` : ""}

      <!-- CTA -->
      <div style="margin-top:28px;text-align:center;">
        <a href="https://missionmeetstech.com/contact.html" style="display:inline-block;padding:12px 28px;background-color:#00050f;color:#00E5FA;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;margin-right:8px;">Need Expert Help?</a>
        <a href="https://missionmeetstech.com/proposal-pulse.html" style="display:inline-block;padding:12px 28px;background-color:#ffffff;color:#00050f;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;border:1px solid #d1d5db;">Score Another Document</a>
      </div>

    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">
        <a href="https://missionmeetstech.com" style="color:#0369a1;text-decoration:none;">Mission Meets Tech</a> &mdash; Federal Health IT Intelligence
      </p>
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        Views expressed are those of the authors and do not represent any employer or government agency.
      </p>
    </div>

  </div>
</body>
</html>`;
}

module.exports = { buildScoreReceiptHtml, buildWeeklyReportHtml, buildGoldTeamReviewHtml };
