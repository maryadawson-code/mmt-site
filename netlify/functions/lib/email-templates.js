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
 * Build branded HTML email for ProposalPulse score receipt.
 * @param {Object} data
 * @param {Object} data.scorecard - Full scorecard from Claude (scores, verdict, red_flags, top_fix)
 * @param {string} data.documentType - Document type key (e.g. "pitch_deck")
 * @param {string} data.documentLabel - Human-readable label (e.g. "Pitch Deck")
 * @param {string} data.overallGrade - Computed overall grade (A, B+, etc.)
 * @param {number} data.usesRemaining - Free uses remaining after this assessment
 * @param {string} data.fileName - Original file name
 * @param {string} [data.scoringId] - Scoring record ID for feedback links
 * @returns {string} HTML email body
 */
function buildScoreReceiptHtml(data) {
  const { scorecard, documentLabel, overallGrade, usesRemaining, fileName, scoringId, consensus, hasSow } = data;
  const verdict = scorecard.verdict || "N/A";
  const vColor = verdictColor(verdict);
  const gColor = gradeColor(overallGrade);

  // Build scorecard rows (N/A sections render with muted styling)
  const scoreRows = (scorecard.scores || [])
    .map(
      (s) => `
      <tr${s.grade === "N/A" ? ' style="opacity:0.6;"' : ""}>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(s.title)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
          <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-weight:700;font-size:14px;color:${s.grade === "N/A" ? "#6b7280" : "#fff"};background-color:${s.grade === "N/A" ? "#e5e7eb" : gradeColor(s.grade)};">${escapeHtml(s.grade)}</span>
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
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">ProposalPulse</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px 0;">Your ProposalPulse Results</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
        ${escapeHtml(documentLabel)} &mdash; ${escapeHtml(fileName || "uploaded document")}
      </p>

      <!-- No-SOW Compliance Disclaimer (prominent, top of results) -->
      ${!hasSow ? `
      <div style="border:2px solid #d97706;background-color:#fffbeb;padding:16px;margin-bottom:24px;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#92400e;">&#9888;&#65039; No Solicitation Document Provided</p>
        <p style="margin:0 0 8px;font-size:14px;color:#854d0e;line-height:1.5;">This evaluation scores against standard federal proposal criteria only. Compliance matrix verification against Section L/M evaluation instructions was NOT performed. Do not use these scores for go/no-go decisions without solicitation-specific review.</p>
        <p style="margin:0;font-size:13px;color:#92400e;font-style:italic;">Upload your RFP/SOW for full compliance mapping.</p>
      </div>` : ""}

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

      <!-- Consensus Badge -->
      ${consensus ? `
      <div style="margin-top:16px;padding:12px 16px;background-color:${consensus.confidence === "high" ? "#f0fdf4" : consensus.confidence === "moderate" ? "#fffbeb" : "#fef2f2"};border-radius:8px;border:1px solid ${consensus.confidence === "high" ? "#bbf7d0" : consensus.confidence === "moderate" ? "#fde68a" : "#fecaca"};">
        <p style="margin:0;font-size:13px;color:#374151;">
          <strong>Scoring Confidence: ${consensus.confidence.toUpperCase()}</strong> — ${consensus.confidence === "high" ? `Both AI reviewers agreed on all criteria.` : `AI reviewers agreed on ${consensus.agreement_rate} criteria.${consensus.divergent_sections.length > 0 ? ` ${consensus.divergent_sections.length} section${consensus.divergent_sections.length > 1 ? "s" : ""} diverged — review carefully.` : ""}`}
        </p>
      </div>` : `
      <p style="margin-top:16px;font-size:12px;color:#9ca3af;">Scoring method: Single-model evaluation</p>`}

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

      <!-- Tiered Next Steps Summary Counts -->
      ${scorecard.next_steps ? (() => {
        const stopCount = (scorecard.next_steps.stop_ship || []).length;
        const highCount = (scorecard.next_steps.high || []).length;
        const polishCount = (scorecard.next_steps.polish || []).length;
        if (stopCount + highCount + polishCount > 0) {
          return `<div style="margin-top:24px;padding:12px 16px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;text-align:center;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#374151;">
              ${stopCount > 0 ? `<span style="color:#991b1b;">&#128308; ${stopCount} STOP-SHIP</span>` : ""}
              ${stopCount > 0 && highCount > 0 ? " &nbsp;|&nbsp; " : ""}
              ${highCount > 0 ? `<span style="color:#92400e;">&#128993; ${highCount} HIGH</span>` : ""}
              ${(stopCount > 0 || highCount > 0) && polishCount > 0 ? " &nbsp;|&nbsp; " : ""}
              ${polishCount > 0 ? `<span style="color:#475569;">&#128994; ${polishCount} POLISH</span>` : ""}
            </p>
          </div>`;
        }
        return "";
      })() : ""}

      <!-- Tiered Next Steps Detail -->
      ${scorecard.next_steps ? (() => {
        const tierConfig = [
          { key: "stop_ship", label: "STOP-SHIP", bg: "#fef2f2", border: "#fecaca", labelColor: "#991b1b" },
          { key: "high", label: "HIGH", bg: "#fffbeb", border: "#fde68a", labelColor: "#92400e" },
          { key: "polish", label: "POLISH", bg: "#f0f4f8", border: "#cbd5e1", labelColor: "#475569" },
        ];
        return tierConfig.map(({ key, label, bg, border, labelColor }) => {
          const items = scorecard.next_steps[key];
          if (!items || items.length === 0) return "";
          const listItems = items.map((item) => `<li style="margin-bottom:4px;font-size:14px;color:#374151;">${escapeHtml(item)}</li>`).join("");
          return `
      <div style="margin-top:16px;padding:12px 16px;background-color:${bg};border:1px solid ${border};border-radius:8px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${labelColor};">${label}</p>
        <ul style="margin:0;padding-left:20px;">${listItems}</ul>
      </div>`;
        }).join("");
      })() : ""}

      <!-- Kill Conditions (shown prominently above pWin) -->
      ${scorecard._pwin_details && scorecard._pwin_details.kill_conditions && scorecard._pwin_details.kill_conditions.length > 0 ? `
      <div style="margin-top:24px;padding:16px 20px;background-color:#fef2f2;border:2px solid #fecaca;border-radius:8px;">
        ${scorecard._pwin_details.kill_conditions.map((kc) => `
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#991b1b;">&bull; ${escapeHtml(kc)}</p>`).join("")}
      </div>` : ""}

      <!-- pWin Factors -->
      ${scorecard.pWin_factors && scorecard.pWin_factors.length > 0 ? `
      <div style="margin-top:24px;">
        <h3 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 8px 0;">pWin Breakdown</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Factor</th>
            <th style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Score</th>
          </tr>
          ${scorecard.pWin_factors.map((f) => {
            const score = typeof f.value === "number" ? f.value : parseInt(String(f.value)) || 0;
            const scoreColor = score >= 70 ? "#16a34a" : score >= 50 ? "#eab308" : "#ef4444";
            return `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(f.factor)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:14px;font-weight:600;color:${scoreColor};">${escapeHtml(String(f.value))}</td>
          </tr>`;
          }).join("")}
        </table>
        ${scorecard._pwin_details && scorecard._pwin_details.penalties && scorecard._pwin_details.penalties.length > 0 ? `
        <div style="margin-top:8px;padding:8px 12px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:6px;">
          <p style="margin:0;font-size:12px;font-weight:600;color:#92400e;">Interdependency Penalties Applied:</p>
          ${scorecard._pwin_details.penalties.map((p) => `<p style="margin:2px 0 0;font-size:12px;color:#92400e;">&bull; ${escapeHtml(p.description)}</p>`).join("")}
        </div>` : ""}
        ${scorecard.pwin_estimate ? `<p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#0369a1;text-align:center;">Estimated pWin: ${escapeHtml(scorecard.pwin_estimate)}</p>` : ""}
      </div>` : ""}

      <!-- Competitive Positioning -->
      ${scorecard.competitive_positioning ? (() => {
        const cp = scorecard.competitive_positioning;
        const diffColors = { strong: "#16a34a", moderate: "#eab308", weak: "#f97316", absent: "#ef4444" };
        const diffColor = diffColors[cp.differentiation] || "#6b7280";
        return `
      <div style="margin-top:24px;padding:16px 20px;border-left:4px solid ${diffColor};background-color:#f9fafb;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Competitive Positioning</p>
        <p style="margin:0 0 4px;font-size:18px;font-weight:800;color:${diffColor};">${escapeHtml((cp.differentiation || "").toUpperCase())}</p>
        ${cp.reasoning ? `<p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(cp.reasoning)}</p>` : ""}
      </div>`;
      })() : ""}

      <!-- Discriminator Assessment -->
      ${scorecard.discriminator_assessment ? (() => {
        const da = scorecard.discriminator_assessment;
        const qualColors = { strong: "#16a34a", moderate: "#eab308", weak: "#f97316", absent: "#ef4444" };
        return `
      <div style="margin-top:24px;padding:16px 20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369a1;">Discriminator Analysis</p>
        ${da.discriminators && da.discriminators.length > 0 ? `
        <ul style="margin:0 0 8px;padding-left:20px;font-size:14px;color:#0A192F;line-height:1.6;">
          ${da.discriminators.map((d) => '<li>' + escapeHtml(d) + '</li>').join("")}
        </ul>` : '<p style="margin:0 0 8px;font-size:14px;color:#ef4444;font-weight:600;">No discriminators identified. This proposal does not stand out from competitors.</p>'}
        <p style="margin:0 0 4px;font-size:13px;color:#5C6B7A;">Win Theme Coherence: <strong style="color:${qualColors[da.win_theme_coherence] || "#6b7280"};">${escapeHtml((da.win_theme_coherence || "absent").toUpperCase())}</strong></p>
        ${da.evaluator_takeaway ? '<p style="margin:4px 0 0;font-size:13px;color:#374151;font-style:italic;">' + escapeHtml(da.evaluator_takeaway) + '</p>' : ""}
      </div>`;
      })() : ""}

      <!-- Bid Recommendation -->
      ${scorecard.recommendation ? (() => {
        const rec = scorecard.recommendation;
        const recColors = { SUBMIT_AS_IS: "#16a34a", SUBMIT_WITH_REVISIONS: "#eab308", MAJOR_REWRITE: "#f97316", CONSIDER_NO_BID: "#ef4444" };
        const recLabels = { SUBMIT_AS_IS: "SUBMIT AS-IS", SUBMIT_WITH_REVISIONS: "SUBMIT WITH REVISIONS", MAJOR_REWRITE: "MAJOR REWRITE REQUIRED", CONSIDER_NO_BID: "CONSIDER NO-BID" };
        const recColor = recColors[rec] || "#6b7280";
        return `
      <div style="margin-top:16px;padding:16px 20px;border-left:4px solid ${recColor};background-color:#f9fafb;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Strategic Recommendation</p>
        <p style="margin:0 0 8px;font-size:20px;font-weight:800;color:${recColor};">${recLabels[rec] || rec}</p>
        ${scorecard.recommendation_rationale ? '<p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">' + escapeHtml(scorecard.recommendation_rationale) + '</p>' : ""}
      </div>`;
      })() : ""}

      <!-- Compliance Matrix -->
      ${scorecard.compliance_matrix && scorecard.compliance_matrix.length > 0 ? `
      <div style="margin-top:24px;">
        <h3 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 8px 0;">Compliance Matrix</h3>
        ${scorecard._compliance_summary ? `
        <div style="text-align:center;margin-bottom:12px;">
          <span style="font-size:24px;font-weight:800;color:${scorecard._compliance_summary.score >= 80 ? "#16a34a" : scorecard._compliance_summary.score >= 60 ? "#eab308" : "#dc2626"};">${scorecard._compliance_summary.score}%</span>
          <span style="font-size:14px;color:#6b7280;"> Compliant</span>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${scorecard._compliance_summary.compliant} compliant, ${scorecard._compliance_summary.partial} partial, ${scorecard._compliance_summary.missing} missing</p>
        </div>` : ""}
        ${scorecard._compliance_flags && scorecard._compliance_flags.length > 0 ? scorecard._compliance_flags.map((f) => `
        <div style="margin-bottom:8px;padding:10px 16px;background-color:#fef2f2;border:2px solid #fecaca;border-radius:8px;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b;">${escapeHtml(f)}</p>
        </div>`).join("") : ""}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Requirement</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Status</th>
          </tr>
          ${scorecard.compliance_matrix.map((c) => {
            const statusColor = c.status === "RESPONSIVE" ? "#16a34a" : c.status === "PARTIALLY RESPONSIVE" ? "#eab308" : "#ef4444";
            return `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${escapeHtml(c.requirement)}${c.note ? `<br><span style="font-size:12px;color:#6b7280;">${escapeHtml(c.note)}</span>` : ""}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;font-weight:700;color:${statusColor};">${escapeHtml(c.status)}</td>
          </tr>`;
          }).join("")}
        </table>
      </div>` : ""}

      <!-- Compliance note moved to top of email as prominent banner (FIX 3a) -->

      <!-- Uses remaining -->
      <p style="margin:32px 0 0;font-size:13px;color:#9ca3af;text-align:center;">
        ${usesRemaining > 0 ? `You have ${usesRemaining} free assessment${usesRemaining === 1 ? "" : "s"} remaining.` : "You've used your free assessment. Upgrade to score another proposal."}
      </p>

      <!-- CTA -->
      <div style="margin-top:24px;text-align:center;">
        <a href="https://missionmeetstech.com/about.html#contact" style="display:inline-block;padding:12px 28px;background-color:#00050f;color:#00E5FA;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Need a Full Review? Contact Us</a>
      </div>

    </div>

    ${scoringId ? `<!-- Feedback Section -->
    <div style="padding:24px 32px;background-color:#fafafa;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">Was this scoring helpful?</p>
      <a href="https://missionmeetstech.com/.netlify/functions/feedback-click?product=proposalpulse&id=${escapeHtml(scoringId)}&rating=5"
         style="display:inline-block;padding:8px 20px;margin:0 6px;background:#0f766e;color:white;border-radius:6px;text-decoration:none;font-size:13px;">Very Helpful</a>
      <a href="https://missionmeetstech.com/.netlify/functions/feedback-click?product=proposalpulse&id=${escapeHtml(scoringId)}&rating=3"
         style="display:inline-block;padding:8px 20px;margin:0 6px;background:#334155;color:white;border-radius:6px;text-decoration:none;font-size:13px;">Somewhat</a>
      <a href="https://missionmeetstech.com/.netlify/functions/feedback-click?product=proposalpulse&id=${escapeHtml(scoringId)}&rating=1"
         style="display:inline-block;padding:8px 20px;margin:0 6px;background:#7f1d1d;color:white;border-radius:6px;text-decoration:none;font-size:13px;">Not Helpful</a>
    </div>` : ""}

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
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">Weekly ProposalPulse Report</p>
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
// RED TEAM REVIEW EMAIL
// ============================================================

/**
 * Build branded HTML email for Red Team Review.
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
    tieredNextSteps,
    pwinFactors,
    competitivePositioning,
    complianceMatrix,
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

  // pWin badge — handles both numeric (legacy) and range string (e.g. "40-50%")
  let pwinHtml = "";
  if (pwinEstimate !== null) {
    // Extract numeric value for color coding
    let pwinNum = typeof pwinEstimate === "number" ? pwinEstimate : parseInt(String(pwinEstimate).replace(/[^0-9]/g, "")) || 0;
    // For ranges like "40-50%", use the midpoint
    const rangeMatch = String(pwinEstimate).match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) pwinNum = Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2);
    const pColor = pwinColor(pwinNum);
    const displayValue = typeof pwinEstimate === "number" ? `${pwinEstimate}%` : escapeHtml(String(pwinEstimate));
    pwinHtml = `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;padding:16px 32px;border-radius:12px;border:2px solid ${pColor};background-color:rgba(0,0,0,0.02);">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Estimated pWin</p>
          <p style="margin:0;font-size:36px;font-weight:800;color:${pColor};">${displayValue}</p>
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
      const statusLabel = status === "skeleton" ? "Architecture" : status === "rewritten" ? "Rewritten" : "Polished";
      const statusColor = status === "skeleton" ? "#dc2626" : status === "rewritten" ? "#f97316" : "#16a34a";
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

      // Rewrite confidence badge (FIX 5)
      const rewriteConfBadge = s.rewrite_confidence != null
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;background-color:${s.rewrite_confidence >= 70 ? "#16a34a" : s.rewrite_confidence >= 50 ? "#eab308" : "#ef4444"};margin-left:8px;">${s.rewrite_confidence}% source fidelity</span>`
        : "";

      // Entity warning banner (FIX 1)
      const entityWarningHtml = s._entity_warning
        ? `<div style="padding:8px 12px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:8px;">
            <p style="margin:0;font-size:12px;color:#991b1b;font-weight:700;">&#9888;&#65039; Entity name was auto-corrected in this section. Verify your organization name is correct.</p>
          </div>`
        : "";

      const statusBadge = s.status === "skeleton"
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background-color:#dc2626;margin-left:8px;">Section Architecture</span>`
        : s.status === "rewritten"
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
          ${rewriteConfBadge}
        </div>

        <div style="padding:16px;">
          ${entityWarningHtml}
          ${s.rewrite_confidence != null && s.rewrite_confidence < 50 ? `<div style="padding:8px 12px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:8px;">
            <p style="margin:0;font-size:12px;color:#991b1b;font-weight:700;">&#128308; Low source fidelity (${s.rewrite_confidence}%): This rewrite includes significant assumptions. Review carefully before submission.</p>
          </div>` : s.rewrite_confidence != null && s.rewrite_confidence < 70 ? `<div style="padding:8px 12px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:6px;margin-bottom:8px;">
            <p style="margin:0;font-size:12px;color:#92400e;">&#9888;&#65039; This rewrite includes inferred claims not verified against source documents. Review before submission.</p>
          </div>` : ""}
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">Original</p>
          <div style="padding:12px 16px;background-color:#f3f4f6;border-radius:6px;margin-bottom:16px;">
            <p style="margin:0;font-size:14px;color:#6b7280;font-style:italic;line-height:1.6;">${escapeHtml(s.original_excerpt)}</p>
          </div>

          <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369a1;">Strengthened</p>
          ${s.status === "skeleton" ? `<div style="padding:8px 12px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:8px;">
            <p style="margin:0;font-size:12px;color:#991b1b;font-weight:700;">&#9888;&#65039; SECTION ARCHITECTURE — This section requires significant original content from the author. The structure below provides the framework; bracketed items [INSERT: ...] must be completed with your organization's specific data.</p>
          </div>` : ""}
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
      <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">Red Team Review</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">

      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 8px 0;">Your Red Team Review</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px 0;">
        ${escapeHtml(documentLabel)} &mdash; ${escapeHtml(fileName || "uploaded document")}
      </p>

      <!-- No-SOW Compliance Disclaimer (prominent, top of review) -->
      ${!complianceMatrix || complianceMatrix.length === 0 ? `
      <div style="border:2px solid #d97706;background-color:#fffbeb;padding:16px;margin-bottom:24px;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#92400e;">&#9888;&#65039; No Solicitation Document Provided</p>
        <p style="margin:0 0 8px;font-size:14px;color:#854d0e;line-height:1.5;">This evaluation scores against standard federal proposal criteria only. Compliance matrix verification against Section L/M evaluation instructions was NOT performed. Do not use these scores for go/no-go decisions without solicitation-specific review.</p>
        <p style="margin:0;font-size:13px;color:#92400e;font-style:italic;">Upload your RFP/SOW for full compliance mapping.</p>
      </div>` : ""}

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

      <!-- Next Steps (flat list from reviewer) -->
      ${nextStepsHtml}

      <!-- Tiered Next Steps (from scoring) -->
      ${tieredNextSteps ? (() => {
        const tierConfig = [
          { key: "stop_ship", label: "STOP-SHIP", bg: "#fef2f2", border: "#fecaca", labelColor: "#991b1b" },
          { key: "high", label: "HIGH", bg: "#fffbeb", border: "#fde68a", labelColor: "#92400e" },
          { key: "polish", label: "POLISH", bg: "#f0f4f8", border: "#cbd5e1", labelColor: "#475569" },
        ];
        return `<div style="margin-top:24px;">
        <h3 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 12px;">Prioritized Fixes by Risk Tier</h3>` +
        tierConfig.map(({ key, label, bg, border, labelColor }) => {
          const items = tieredNextSteps[key];
          if (!items || items.length === 0) return "";
          const listItems = items.map((item) => `<li style="margin-bottom:4px;font-size:14px;color:#374151;">${escapeHtml(item)}</li>`).join("");
          return `
        <div style="margin-bottom:12px;padding:12px 16px;background-color:${bg};border:1px solid ${border};border-radius:8px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${labelColor};">${label}</p>
          <ul style="margin:0;padding-left:20px;">${listItems}</ul>
        </div>`;
        }).join("") + `</div>`;
      })() : ""}

      <!-- pWin Factors Table -->
      ${pwinFactors && pwinFactors.length > 0 ? `
      <div style="margin-top:24px;">
        <h3 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 8px 0;">pWin Scoring Inputs</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Factor</th>
            <th style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Impact</th>
          </tr>
          ${pwinFactors.map((f) => `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${escapeHtml(f.factor)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:14px;font-weight:600;color:${String(f.value).includes("-") ? "#ef4444" : "#16a34a"};">${escapeHtml(f.value)}</td>
          </tr>`).join("")}
        </table>
      </div>` : ""}

      <!-- Competitive Positioning -->
      ${competitivePositioning ? (() => {
        const cp = competitivePositioning;
        const diffColors = { strong: "#16a34a", moderate: "#eab308", weak: "#f97316", absent: "#ef4444" };
        const diffColor = diffColors[cp.differentiation] || "#6b7280";
        return `
      <div style="margin-top:24px;padding:16px 20px;border-left:4px solid ${diffColor};background-color:#f9fafb;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Competitive Positioning</p>
        <p style="margin:0 0 4px;font-size:18px;font-weight:800;color:${diffColor};">${escapeHtml((cp.differentiation || "").toUpperCase())}</p>
        ${cp.reasoning ? `<p style="margin:0;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(cp.reasoning)}</p>` : ""}
      </div>`;
      })() : ""}

      <!-- Compliance Matrix -->
      ${complianceMatrix && complianceMatrix.length > 0 ? `
      <div style="margin-top:24px;">
        <h3 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 8px 0;">Compliance Matrix</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr style="background-color:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Requirement</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Status</th>
          </tr>
          ${complianceMatrix.map((c) => {
            const statusColor = c.status === "RESPONSIVE" ? "#16a34a" : c.status === "PARTIALLY RESPONSIVE" ? "#eab308" : "#ef4444";
            return `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${escapeHtml(c.requirement)}${c.note ? `<br><span style="font-size:12px;color:#6b7280;">${escapeHtml(c.note)}</span>` : ""}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px;font-weight:700;color:${statusColor};">${escapeHtml(c.status)}</td>
          </tr>`;
          }).join("")}
        </table>
      </div>` : ""}

      <!-- Disclaimer -->
      <div style="margin-top:24px;padding:16px;background-color:#fefce8;border:1px solid #fde68a;border-radius:8px;">
        <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.5;">
          <strong>Important:</strong> This is an AI-generated starting point. Review all strengthened text before submission. Any <code style="background:#fef3c7;padding:1px 4px;border-radius:3px;font-size:12px;">[INSERT: ...]</code> placeholders require your specific data. Facts and figures should be verified against your actual records.
        </p>
      </div>

      ${reviewerNotes ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;font-style:italic;">${escapeHtml(reviewerNotes)}</p>` : ""}

      <!-- CTA -->
      <div style="margin-top:28px;text-align:center;">
        <a href="https://missionmeetstech.com/about.html#contact" style="display:inline-block;padding:12px 28px;background-color:#00050f;color:#00E5FA;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;margin-right:8px;">Need Expert Help?</a>
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
