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

// Pursuit lifecycle stages — separated from generic events. Subscribers
// asked for these distinct types: RFI, Industry Day, Draft RFP, Q&A,
// Final RFP, Proposal Due, Recompete, Award, plus generic Intel and
// public Event. The category enum on pursuit_calendar maps directly to
// these keys.
const CATEGORY_LABEL = {
  rfi:           "RFI",
  industry_day:  "Industry Day",
  draft_rfp:     "Draft RFP",
  qa:            "Q&A",
  final_rfp:     "Final RFP",
  proposal_due:  "Proposal Due",
  recompete:     "Recompete",
  award:         "Award",
  intel_release: "Intel",
  deadline:      "Deadline",
  event:         "Public Event",
};

const CATEGORY_COLOR = {
  rfi:           "#457B9D",
  industry_day:  "#92710A",
  draft_rfp:     "#0F766E",
  qa:            "#92710A",
  final_rfp:     "#15803D",
  proposal_due:  "#E63946",
  recompete:     "#15803D",
  award:         "#0F766E",
  intel_release: "#457B9D",
  deadline:      "#92710A",
  event:         "#6B7280",
};

// Pursuit-deadline categories — distinct from public conference events.
// The UI groups them under "Pursuit deadlines" vs "Public events".
const PURSUIT_CATEGORIES = new Set(["rfi", "industry_day", "draft_rfp", "qa", "final_rfp", "proposal_due", "recompete", "award", "deadline"]);

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
function renderPursuitCalendarHtml(rows, opts = {}) {
  const sorted = [...(rows || [])].sort((a, b) => {
    const da = a.event_date || "";
    const db = b.event_date || "";
    return da.localeCompare(db);
  });

  // Split pursuit deadlines from public events so the UI can show
  // them as separate sections per Mary's brief.
  const pursuits = sorted.filter((r) => PURSUIT_CATEGORIES.has(r.category));
  const events = sorted.filter((r) => !PURSUIT_CATEGORIES.has(r.category));

  // 90-day window emphasis: the page leads with anything in the next
  // 90 days. The Pursuit Calendar product surface is a 90-Day Deadline
  // Tracker.
  const now = new Date();
  const ninetyDaysOut = new Date(now.getTime() + 90 * 24 * 3600 * 1000);
  const inWindow = (r) => {
    if (!r.event_date) return false;
    const d = new Date(r.event_date + "T12:00:00Z");
    return d >= now && d <= ninetyDaysOut;
  };
  const next90 = pursuits.filter(inWindow);
  const beyond = pursuits.filter((r) => !inWindow(r));

  // Last refreshed banner. Caller passes lastRefreshedAt (ISO) when
  // hydrating from Supabase. Without it, we don't fabricate a date —
  // we say "refresh status unknown."
  const lastRefreshedAt = opts.lastRefreshedAt || null;
  let freshnessLine = "Refresh status unknown — confirm at /api/pursuit-calendar/health.";
  let freshnessClass = "pc-stale";
  if (lastRefreshedAt) {
    const ageHours = Math.max(0, (Date.now() - new Date(lastRefreshedAt).getTime()) / 3600000);
    const ageRound = Math.round(ageHours);
    if (ageHours <= 24) { freshnessLine = `Last refreshed ${ageRound}h ago.`; freshnessClass = "pc-fresh"; }
    else if (ageHours <= 48) { freshnessLine = `Last refreshed ${ageRound}h ago — refresh window passing.`; freshnessClass = "pc-stale"; }
    else { freshnessLine = `Last refreshed ${ageRound}h ago — STALE.`; freshnessClass = "pc-very-stale"; }
  }

  const renderSection = (label, items, emptyMsg) => {
    if (!items.length) return `<section class="pc-month"><h2 class="pc-month-title">${escapeHtml(label)}</h2><div class="pc-empty"><p>${escapeHtml(emptyMsg)}</p></div></section>`;
    return groupByMonth(items)
      .map(([month, monthItems]) =>
        `<section class="pc-month"><h2 class="pc-month-title">${escapeHtml(label)} \u2014 ${escapeHtml(month)}</h2><div class="pc-grid">${monthItems.map(renderRow).join("\n        ")}</div></section>`
      )
      .join("\n      ");
  };

  const body = sorted.length === 0
    ? `<div class="pc-empty" data-testid="pc-empty"><p>No tracked pursuits or events yet. The refresh worker (pursuit-calendar-refresh) sweeps SAM.gov + agency feeds every 6 hours; new pursuits appear automatically.</p></div>`
    : `
        ${next90.length || beyond.length ? `<h2 class="pc-section-title" id="pursuit-deadlines">Pursuit deadlines</h2>` : ""}
        ${renderSection("Next 90 days", next90, "No pursuit deadlines in the next 90 days. Capture-research window is open — set a Pursuit Score for any new solicitation that drops.")}
        ${beyond.length ? renderSection("Beyond 90 days", beyond, "") : ""}
        ${events.length ? `<h2 class="pc-section-title" id="public-events">Public events</h2>${renderSection("Public events", events, "")}` : ""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Pursuit Calendar — 90-Day Deadline Tracker — MMT Premium</title>
<meta name="description" content="Federal pursuit calendar — RFIs, Industry Days, Draft RFPs, Q&A, Final RFPs, proposal-due dates, recompete milestones, and awards for defense health IT. 90-day window.">
<style>
  body { margin:0; padding:0; font-family:Inter,-apple-system,sans-serif; color:#0A192F; background:#FFFFFF; line-height:1.6; }
  .pc-wrap { max-width:920px; margin:0 auto; padding:48px 24px; }
  .pc-kicker { font-size:12px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#457B9D; margin-bottom:8px; }
  h1.pc-h1 { font-size:32px; font-weight:800; line-height:1.2; margin:0 0 4px 0; }
  .pc-h1-sub { font-size:14px; font-weight:700; color:#457B9D; letter-spacing:0.04em; margin-bottom:12px; }
  .pc-sub { font-size:15px; color:#4b5563; margin:0 0 16px 0; }
  .pc-freshness { font-size:13px; padding:8px 12px; border-radius:8px; margin-bottom:24px; display:inline-block; }
  .pc-fresh { background:rgba(21,128,61,0.06); color:#15803D; border:1px solid rgba(21,128,61,0.2); }
  .pc-stale { background:rgba(146,113,10,0.06); color:#92710A; border:1px solid rgba(146,113,10,0.25); }
  .pc-very-stale { background:rgba(230,57,70,0.06); color:#B91C1C; border:1px solid rgba(230,57,70,0.25); }
  .pc-legend { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 24px 0; }
  .pc-legend-chip { font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px; letter-spacing:0.05em; text-transform:uppercase; }
  .pc-section-title { font-size:14px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#0A192F; margin:24px 0 12px 0; }
  .pc-month { margin-bottom:24px; }
  .pc-month-title { font-size:16px; font-weight:700; color:#0A192F; margin:0 0 12px 0; padding-bottom:6px; border-bottom:1px solid #e5e7eb; }
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
  .pc-empty { padding:24px; text-align:center; background:#F3F4F6; border:1px solid #D8E0E8; border-radius:12px; color:#4b5563; font-size:13px; }
</style>
</head>
<body data-access="premium" data-testid="pursuit-calendar">
  <div class="pc-wrap">
    <div class="pc-kicker">MMT Premium</div>
    <h1 class="pc-h1">Pursuit Calendar</h1>
    <div class="pc-h1-sub">90-Day Deadline Tracker</div>
    <p class="pc-sub">RFI · Industry Day · Draft RFP · Q&amp;A · Final RFP · Proposal Due · Recompete milestones · Award notices for defense health IT. Pursuit deadlines are separated from public events. Refreshed every 6 hours from SAM.gov + agency feeds.</p>
    <div class="pc-freshness ${freshnessClass}" data-testid="pc-freshness">${escapeHtml(freshnessLine)}</div>
    <div class="pc-legend" aria-label="Category legend">
      ${Object.entries(CATEGORY_LABEL).map(([k, v]) => `<span class="pc-legend-chip" style="background:${CATEGORY_COLOR[k]}1A;color:${CATEGORY_COLOR[k]};">${escapeHtml(v)}</span>`).join("")}
    </div>
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
