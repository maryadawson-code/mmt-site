// ============================================================
// vehicle-status.js — derive an ordering-period status from one
// data/idiq-vehicles.json row, without rewriting the row.
//
// The dataset's `status` is the research agent's own wording ("Active /
// final ordering year", "Sunsetting: last new order Oct 29 2026"). A
// consumer building a buying route needs one machine-readable answer to
// "can a new order still be placed here", plus the dataset date it was
// derived from. This module answers that and nothing else. Pure; the
// caller supplies `today` so tests pin the clock (CLAUDE.md: date-pinned
// fixtures, not clock-derived).
//
// Values, in the order they are checked:
//   cancelled     status says cancelled / canceled
//   closed        the ordering end (a "last new order" date in the status
//                 text, else pop_end) is before today, or status says
//                 expired, legacy, winding down, or an undated sunset
//   pre_award     status says solicitation, upcoming, market research,
//                 evaluation, pending award, source selection, TBD
//   closing_soon  the ordering end is within CLOSING_SOON_DAYS of today, or
//                 status says "final ordering year" / "nearing recompete"
//   open          status says active, awarded, ordering, on-ramping,
//                 sustainment, pilot, tapering, recompete watch
//   unknown       anything else
// ============================================================

const CLOSING_SOON_DAYS = 180;

const CANCELLED_RE = /cancel+ed/i;
const CLOSED_RE = /expired|legacy|winding down/i;
const SUNSET_RE = /sunset/i;
const PRE_AWARD_RE = /solicitation|upcoming|market research|in evaluation|pending award|source selection|^tbd$/i;
const CLOSING_RE = /final ordering year|nearing recompete/i;
const OPEN_RE = /active|awarded|ordering|on-?ramping|sustainment|pilot|tapering|recompete watch/i;
// "Sunsetting: last new order Oct 29 2026" carries its own ordering-period
// end; that date, not pop_end (task orders can run years past it), decides
// whether a new order can still be placed.
const LAST_ORDER_RE = /last new order\s+([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

function parseLastOrderDate(statusText) {
  const m = LAST_ORDER_RE.exec(String(statusText || ""));
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  const t = Date.UTC(Number(m[3]), mon, Number(m[2]));
  return Number.isNaN(t) ? null : t;
}

/** The date after which no new order can be placed: the status text's own
 *  "last new order" date when it has one, else pop_end. ISO string or null. */
function orderingEndDate(row) {
  const fromStatus = parseLastOrderDate(row && row.status);
  if (fromStatus != null) return new Date(fromStatus).toISOString().slice(0, 10);
  return parseDate(row && row.pop_end) != null ? String(row.pop_end).slice(0, 10) : null;
}

function daysBetween(fromIso, toIso) {
  const a = parseDate(fromIso);
  const b = parseDate(toIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}

/** Whole days from today to pop_end; negative when past; null when unknown. */
function daysToPopEnd(row, today) {
  return daysBetween(today, row && row.pop_end);
}

/**
 * @param {object} row  one data/idiq-vehicles.json vehicle
 * @param {string} today YYYY-MM-DD
 * @returns {{ordering_status:string, ordering_end:string|null, days_to_ordering_end:number|null, days_to_pop_end:number|null, status_text:string}}
 */
function orderingStatus(row, today) {
  const text = String((row && row.status) || "").trim();
  const orderingEnd = orderingEndDate(row);
  const daysToEnd = daysBetween(today, orderingEnd);
  const days = daysToPopEnd(row, today);
  let s = "unknown";
  if (CANCELLED_RE.test(text)) s = "cancelled";
  else if (daysToEnd != null && daysToEnd < 0) s = "closed";
  else if (CLOSED_RE.test(text) || (SUNSET_RE.test(text) && daysToEnd == null)) s = "closed";
  else if (PRE_AWARD_RE.test(text)) s = "pre_award";
  else if (CLOSING_RE.test(text) || (daysToEnd != null && daysToEnd <= CLOSING_SOON_DAYS)) s = "closing_soon";
  else if (OPEN_RE.test(text)) s = "open";
  return { ordering_status: s, ordering_end: orderingEnd, days_to_ordering_end: daysToEnd, days_to_pop_end: days, status_text: text };
}

/** The row plus the derived fields and the dataset stamp, for the API. */
function decorateVehicle(row, { today, asOf }) {
  const derived = orderingStatus(row, today);
  return {
    ...row,
    ordering_status: derived.ordering_status,
    ordering_end: derived.ordering_end,
    days_to_ordering_end: derived.days_to_ordering_end,
    days_to_pop_end: derived.days_to_pop_end,
    as_of: asOf || null,
    source_url: row.primary_source_url || null,
  };
}

const ORDERING_STATUSES = Object.freeze(["open", "closing_soon", "pre_award", "closed", "cancelled", "unknown"]);

module.exports = { orderingStatus, orderingEndDate, daysToPopEnd, decorateVehicle, ORDERING_STATUSES, CLOSING_SOON_DAYS };
