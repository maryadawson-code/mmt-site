// ============================================================
// pursuit-calendar-render.js — pure render function.
//
// Takes a list of pursuit_calendar rows (status='active'),
// returns the dist/premium/calendar/index.html string.
//
// Group-by-month, category badge, agency, vehicle, notes.
// Empty state when zero rows.
//
// Pure: no I/O, no DB. Caller fetches and passes in.
// ============================================================

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CATEGORY_LABEL = {
  proposal_due: "Proposal Due",
  intel_release: "Intel",
  event: "Event",
  industry_day: "Industry Day",
  award: "Award",
  deadline: "Deadline",
};

const CATEGORY_COLOR = {
  proposal_due: "#E63946",
  intel_release: "#457B9D",
  event: "#0A192F",
  industry_day: "#92710A",
  award: "#0F766E",
  deadline: "#92710A",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function monthKey(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function groupByMonth(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = monthKey(r.event_date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return Array.from(groups.entries());
}

function renderRow(r) {
  const cat = CATEGORY_LABEL[r.category] || r.category;
  const color = CATEGORY_COLOR[r.category] || "#457B9D";
  const dateRange = r.end_date && r.end_date !== r.event_date
    ? `${formatDate(r.event_date)} – ${formatDate(r.end_date)}`
    : formatDate(r.event_date);
  const agencyLine = [r.agency, r.vehicle].filter(Boolean).join(" · ");
  const notes = r.notes ? `<p class="pc-notes">${escapeHtml(r.notes)}</p>` : "";
  const link = r.source_url
    ? `<a href="${escapeHtml(r.source_url)}" class="pc-link" rel="noopener" target="_blank">Source &rarr;</a>`
    : "";
  return `<article class="pc-card" data-category="${escapeHtml(r.category)}">
    <div class="pc-card-head">
      <span class="pc-badge" style="background:${color}1A;color:${color};">${escapeHtml(cat)}</span>
      <span class="pc-date">${escapeHtml(dateRange)}</span>
    </div>
    <h3 class="pc-title">${escapeHtml(r.title)}</h3>
    ${agencyLine ? `<p class="pc-agency">${escapeHtml(agencyLine)}</p>` : ""}
    ${notes}
    ${link}
  </article>`;
}

/**
 * Render the full /premium/calendar/index.html page body.
 * @param {Array} rows  pursuit_calendar rows where status='active'
 * @returns {string}    HTML
 */
function renderPursuitCalendarHtml(rows) {
  const sorted = [...(rows || [])].sort((a, b) => {
    const da = a.event_date || "";
    const db = b.event_date || "";
    return da.localeCompare(db);
  });

  const body =
    sorted.length === 0
      ? `<div class="pc-empty"><p>No active pursuits — the radar will pick new ones up within 6 hours.</p></div>`
      : groupByMonth(sorted)
          .map(
            ([month, items]) =>
              `<section class="pc-month"><h2 class="pc-month-title">${escapeHtml(month)}</h2><div class="pc-grid">${items.map(renderRow).join("\n        ")}</div></section>`
          )
          .join("\n      ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Pursuit Calendar — Mission Meets Tech</title>
<meta name="description" content="Federal pursuit calendar — proposal deadlines, industry days, and intel releases for defense health IT.">
<style>
  body { margin:0; padding:0; font-family:Inter,-apple-system,sans-serif; color:#0A192F; background:#FFFFFF; line-height:1.6; }
  .pc-wrap { max-width:920px; margin:0 auto; padding:48px 24px; }
  .pc-kicker { font-size:12px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#457B9D; margin-bottom:8px; }
  h1.pc-h1 { font-size:32px; font-weight:800; line-height:1.2; margin:0 0 12px 0; }
  .pc-sub { font-size:15px; color:#4b5563; margin:0 0 32px 0; }
  .pc-month { margin-bottom:32px; }
  .pc-month-title { font-size:18px; font-weight:700; color:#0A192F; margin:0 0 12px 0; padding-bottom:6px; border-bottom:1px solid #e5e7eb; }
  .pc-grid { display:grid; grid-template-columns:1fr; gap:12px; }
  @media (min-width:720px) { .pc-grid { grid-template-columns:1fr 1fr; } }
  .pc-card { background:#F3F4F6; border:1px solid #D8E0E8; border-radius:12px; padding:16px 18px; }
  .pc-card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; }
  .pc-badge { font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; padding:3px 8px; border-radius:4px; }
  .pc-date { font-size:13px; color:#6b7280; }
  .pc-title { font-size:16px; font-weight:700; color:#0A192F; margin:0 0 6px 0; }
  .pc-agency { font-size:13px; color:#4b5563; margin:0 0 6px 0; }
  .pc-notes { font-size:13px; color:#4b5563; margin:6px 0; }
  .pc-link { font-size:13px; font-weight:600; color:#457B9D; text-decoration:none; }
  .pc-empty { padding:32px; text-align:center; background:#F3F4F6; border:1px solid #D8E0E8; border-radius:12px; color:#4b5563; }
</style>
</head>
<body data-access="premium">
  <div class="pc-wrap">
    <div class="pc-kicker">MMT Premium</div>
    <h1 class="pc-h1">Pursuit Calendar</h1>
    <p class="pc-sub">Proposal deadlines, industry days, and intel releases for defense health IT. Refreshed every 6 hours from SAM.gov + agency feeds.</p>
    ${body}
  </div>
</body>
</html>`;
}

module.exports = {
  renderPursuitCalendarHtml,
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  groupByMonth,
};
