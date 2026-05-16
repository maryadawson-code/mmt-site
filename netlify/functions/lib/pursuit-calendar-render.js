// ============================================================
// pursuit-calendar-render.js — pure render function.
//
// Takes a list of pursuit_calendar rows (status='active'),
// returns the dist/premium/calendar/index.html string.
//
// Group-by-month, category badge, agency, vehicle, notes.
// Status column with enum (Upcoming / Due Soon / Closed / Protest /
// Protest Due / Watch / Needs Source). Closed is computed dynamically
// from event_date < today (America/New_York).
//
// Empty state has TWO modes:
//   - mode='login_required' (default): renders a clear gate explaining
//     that the calendar requires premium auth, NOT a fake "no data" view.
//   - mode='no_active_pursuits': only when caller has confirmed the
//     authenticated subscriber simply has zero rows.
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
// Final RFP, Proposal Due, Recompete, Award, plus Protest, Intel, and
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
  protest:       "Protest",
  protest_due:   "Protest Due",
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
  protest:       "#B91C1C",
  protest_due:   "#B91C1C",
  intel_release: "#457B9D",
  deadline:      "#92710A",
  event:         "#6B7280",
};

// Pursuit-deadline categories — distinct from public conference events.
// The UI groups them under "Pursuit deadlines" vs "Public events".
const PURSUIT_CATEGORIES = new Set(["rfi", "industry_day", "draft_rfp", "qa", "final_rfp", "proposal_due", "recompete", "award", "protest", "protest_due", "deadline"]);

// Status enum — what the caller / subscriber sees in the Status column.
// Closed is computed from date; the others are explicit overrides
// (Protest, Protest Due, Watch, Needs Source) or computed from proximity
// (Upcoming, Due Soon).
const STATUS_LABEL = {
  upcoming:      "Upcoming",
  due_soon:      "Due Soon",
  closed:        "Closed",
  protest:       "Protest",
  protest_due:   "Protest Due",
  watch:         "Watch",
  needs_source:  "Needs Source",
};

const STATUS_COLOR = {
  upcoming:      { bg: "rgba(69,123,157,0.10)",  fg: "#1F4D6E" },
  due_soon:      { bg: "rgba(217,119,6,0.10)",   fg: "#92710A" },
  closed:        { bg: "rgba(107,114,128,0.10)", fg: "#4B5563" },
  protest:       { bg: "rgba(185,28,28,0.10)",   fg: "#B91C1C" },
  protest_due:   { bg: "rgba(185,28,28,0.10)",   fg: "#B91C1C" },
  watch:         { bg: "rgba(15,118,110,0.10)",  fg: "#0F766E" },
  needs_source:  { bg: "rgba(146,113,10,0.10)",  fg: "#92710A" },
};

// Map free-form override strings (from seed JSON / Supabase) to the
// canonical status keys above.
function normalizeStatusOverride(raw) {
  if (!raw) return null;
  const k = String(raw).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (k === "protest") return "protest";
  if (k === "protest_due" || k === "protest_decision_due") return "protest_due";
  if (k === "watch") return "watch";
  if (k === "needs_source" || k === "unverified") return "needs_source";
  if (k === "closed" || k === "expired" || k === "past") return "closed";
  if (k === "upcoming" || k === "active") return "upcoming";
  if (k === "due_soon") return "due_soon";
  return null;
}

// Today in America/New_York (ET) — used for Closed computation. We
// compute the ET calendar date so a deadline at 4 PM ET on April 21
// is NOT marked Closed at 11 PM Pacific on April 21.
function todayET() {
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => nowParts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Compute the status for a row given today's ET date. Order of
// precedence: explicit override (Protest/Watch/Needs Source/etc) →
// Closed if past → Due Soon if <= 14 days → Upcoming.
function computeStatus(row, todayStr) {
  const override = normalizeStatusOverride(row.status_override);
  if (override === "protest" || override === "protest_due" || override === "watch" || override === "needs_source") {
    return override;
  }
  // For protest categories, the category itself implies the status.
  if (row.category === "protest") return "protest";
  if (row.category === "protest_due") return "protest_due";

  if (!row.event_date) return override || "needs_source";
  const today = todayStr || todayET();
  if (row.event_date < today) return "closed";
  // Due-soon window: 14 calendar days.
  const dToday = new Date(today + "T00:00:00Z");
  const dEvent = new Date(row.event_date + "T00:00:00Z");
  const diffDays = Math.round((dEvent - dToday) / 86400000);
  if (diffDays <= 14) return "due_soon";
  return override || "upcoming";
}

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

function formatTimeET(timeStr) {
  if (!timeStr) return "";
  // Accept "HH:MM" (24h) and render as "h:MM AM/PM ET".
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2];
  const am = h < 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${min} ${am ? "AM" : "PM"} ET`;
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

function renderRow(r, todayStr) {
  const cat = CATEGORY_LABEL[r.category] || r.category;
  const color = CATEGORY_COLOR[r.category] || "#457B9D";
  const status = computeStatus(r, todayStr);
  const statusLabel = STATUS_LABEL[status] || "Upcoming";
  const statusColors = STATUS_COLOR[status] || STATUS_COLOR.upcoming;

  const dateRange = r.end_date && r.end_date !== r.event_date
    ? `${formatDate(r.event_date)} – ${formatDate(r.end_date)}`
    : formatDate(r.event_date);
  const timeStr = formatTimeET(r.event_time_et);
  const dateLine = timeStr ? `${dateRange} · ${timeStr}` : dateRange;

  const agencyParts = [r.agency, r.vehicle].filter(Boolean);
  if (r.ref) agencyParts.push(r.ref);
  const agencyLine = agencyParts.join(" · ");

  const notes = r.notes ? `<p class="pc-notes">${escapeHtml(r.notes)}</p>` : "";
  const link = r.source_url
    ? `<a href="${escapeHtml(r.source_url)}" class="pc-link" rel="noopener" target="_blank">Source &rarr;</a>`
    : "";

  return `<article class="pc-card" data-category="${escapeHtml(r.category)}" data-status="${escapeHtml(status)}" data-ref="${escapeHtml(r.ref || "")}">
    <div class="pc-card-head">
      <span class="pc-badge" style="background:${color}1A;color:${color};">${escapeHtml(cat)}</span>
      <span class="pc-status" style="background:${statusColors.bg};color:${statusColors.fg};">${escapeHtml(statusLabel)}</span>
      <span class="pc-date">${escapeHtml(dateLine)}</span>
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
 * @param {Object} opts
 *   - lastRefreshedAt (ISO string)
 *   - emptyMode: 'login_required' | 'no_active_pursuits'
 * @returns {string}    HTML
 */
function renderPursuitCalendarHtml(rows, opts = {}) {
  // `opts.today` accepts a YYYY-MM-DD override so unit tests can pin
  // time deterministically. Without this, the "groups rows by month
  // and orders ascending by event_date" test was brittle — fixture
  // rows used hard-coded 2026-05/06 dates that flipped from
  // "upcoming" to "Recently closed" the moment real time passed
  // 2026-05-01, reordering the rendered HTML and breaking the test.
  const todayStr = opts.today || todayET();

  const sorted = [...(rows || [])].sort((a, b) => {
    const da = a.event_date || "";
    const db = b.event_date || "";
    return da.localeCompare(db);
  });

  // Split pursuit deadlines from public events so the UI can show
  // them as separate sections per Mary's brief.
  const pursuits = sorted.filter((r) => PURSUIT_CATEGORIES.has(r.category));
  const events = sorted.filter((r) => !PURSUIT_CATEGORIES.has(r.category));

  // Closed / past split. Past deadlines collapse into a separate
  // "Recently closed" group so subscribers see what just shipped without
  // confusing it with live pursuits.
  const upcoming = pursuits.filter((r) => computeStatus(r, todayStr) !== "closed");
  const closed = pursuits.filter((r) => computeStatus(r, todayStr) === "closed");

  // 90-day window emphasis: the page leads with anything in the next
  // 90 days. The Pursuit Calendar product surface is a 90-Day Deadline
  // Tracker.
  const now = new Date(todayStr + "T00:00:00Z");
  const ninetyDaysOut = new Date(now.getTime() + 90 * 24 * 3600 * 1000);
  const inWindow = (r) => {
    if (!r.event_date) return false;
    const d = new Date(r.event_date + "T00:00:00Z");
    return d >= now && d <= ninetyDaysOut;
  };
  const next90 = upcoming.filter(inWindow);
  const beyond = upcoming.filter((r) => !inWindow(r));

  // Last refreshed banner.
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
        `<section class="pc-month"><h2 class="pc-month-title">${escapeHtml(label)} — ${escapeHtml(month)}</h2><div class="pc-grid">${monthItems.map((r) => renderRow(r, todayStr)).join("\n        ")}</div></section>`
      )
      .join("\n      ");
  };

  // Empty state. Default mode is login_required — the page MUST NOT
  // look like a broken "no data" view to unauthenticated visitors.
  // Authenticated callers with zero rows pass mode='no_active_pursuits'.
  const emptyMode = opts.emptyMode || "login_required";
  const emptyHtml = emptyMode === "no_active_pursuits"
    ? `<div class="pc-empty" data-testid="pc-empty"><p><strong>No active pursuits in the calendar right now.</strong> The refresh worker (pursuit-calendar-refresh) sweeps SAM.gov + agency feeds every 6 hours; new pursuits appear here automatically. Cross-check the <a href="/contract-tracker.html">Contract Tracker</a> and <a href="/idiq-tracker.html">IDIQ Tracker</a> for opportunity intel that may not yet have a published deadline.</p></div>`
    : `<div class="pc-empty" data-testid="pc-login-required"><p><strong>Sign in to load your Pursuit Calendar.</strong> Live pursuit deadlines (RFI, Industry Day, Draft RFP, Q&amp;A, Final RFP, Proposal Due, Recompete, Award, Protest) load after your premium session is verified. <a href="/dashboard.html">Sign in &rarr;</a></p></div>`;

  const body = sorted.length === 0
    ? emptyHtml
    : `
        ${next90.length || beyond.length ? `<h2 class="pc-section-title" id="pursuit-deadlines">Pursuit deadlines</h2>` : ""}
        ${renderSection("Next 90 days", next90, "No pursuit deadlines in the next 90 days. Capture-research window is open — set a Pursuit Score for any new solicitation that drops.")}
        ${beyond.length ? renderSection("Beyond 90 days", beyond, "") : ""}
        ${closed.length ? `<h2 class="pc-section-title" id="recently-closed">Recently closed</h2>${renderSection("Recently closed", closed, "")}` : ""}
        ${events.length ? `<h2 class="pc-section-title" id="public-events">Public events</h2>${renderSection("Public events", events, "")}` : ""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Pursuit Calendar — 90-Day Deadline Tracker — MMT Premium</title>
<meta name="description" content="Federal pursuit calendar — RFIs, Industry Days, Draft RFPs, Q&A, Final RFPs, proposal-due dates, recompete milestones, awards, and GAO protest deadlines for defense health IT. 90-day window. Times in ET.">
<style>
  body { margin:0; padding:0; font-family:Inter,-apple-system,sans-serif; color:#0A192F; background:#FFFFFF; line-height:1.6; }
  .pc-wrap { max-width:920px; margin:0 auto; padding:48px 24px; }
  .pc-kicker { font-size:12px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#457B9D; margin-bottom:8px; }
  h1.pc-h1 { font-size:32px; font-weight:800; line-height:1.2; margin:0 0 4px 0; }
  .pc-h1-sub { font-size:14px; font-weight:700; color:#457B9D; letter-spacing:0.04em; margin-bottom:12px; }
  .pc-sub { font-size:15px; color:#4b5563; margin:0 0 16px 0; }
  .pc-tz-note { font-size:12px; color:#6b7280; margin:0 0 16px 0; }
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
  .pc-card-head { display:flex; flex-wrap:wrap; align-items:center; margin-bottom:8px; gap:6px; }
  .pc-badge { font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; padding:3px 8px; border-radius:4px; }
  .pc-status { font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; padding:3px 8px; border-radius:4px; }
  .pc-date { font-size:13px; color:#6b7280; margin-left:auto; }
  .pc-title { font-size:16px; font-weight:700; color:#0A192F; margin:0 0 6px 0; }
  .pc-agency { font-size:13px; color:#4b5563; margin:0 0 6px 0; }
  .pc-notes { font-size:13px; color:#4b5563; margin:6px 0; }
  .pc-link { font-size:13px; font-weight:600; color:#457B9D; text-decoration:none; }
  .pc-empty { padding:24px; text-align:center; background:#F3F4F6; border:1px solid #D8E0E8; border-radius:12px; color:#4b5563; font-size:14px; }
  .pc-empty a { color:#457B9D; font-weight:600; text-decoration:none; }
</style>
</head>
<body data-access="premium" data-testid="pursuit-calendar">
  <div class="pc-wrap">
    <div class="pc-kicker">MMT Premium</div>
    <h1 class="pc-h1">Pursuit Calendar</h1>
    <div class="pc-h1-sub">90-Day Deadline Tracker</div>
    <p class="pc-sub">RFI · Industry Day · Draft RFP · Q&amp;A · Final RFP · Proposal Due · Recompete · Award · Protest milestones for defense health IT. Pursuit deadlines are separated from public events. Refreshed every 6 hours from SAM.gov + agency feeds; cross-linked with the <a href="/contract-tracker.html" style="color:#457B9D;">Contract Tracker</a> and <a href="/idiq-tracker.html" style="color:#457B9D;">IDIQ Tracker</a>.</p>
    <p class="pc-tz-note">All times shown in <strong>America/New_York (ET)</strong>. Past deadlines are marked <em>Closed</em> automatically.</p>
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
  STATUS_LABEL,
  STATUS_COLOR,
  computeStatus,
  normalizeStatusOverride,
  todayET,
  groupByMonth,
};
