// lib/vehicle-status.js: the one derived answer to "can a new order still be
// placed on this vehicle", computed from a dataset row and a pinned date.
// The dataset's own status text is never rewritten; the derived fields sit
// beside it (docs/market-entry-coverage-spec.md section 4.7).

import { describe, it, expect } from "vitest";
import { orderingStatus, orderingEndDate, decorateVehicle, ORDERING_STATUSES } from "../../netlify/functions/lib/vehicle-status.js";

const TODAY = "2026-09-20";

describe("orderingStatus", () => {
  it("cancelled beats everything", () => {
    expect(orderingStatus({ status: "Canceled", pop_end: "2030-01-01" }, TODAY).ordering_status).toBe("cancelled");
    expect(orderingStatus({ status: "Cancelled" }, TODAY).ordering_status).toBe("cancelled");
  });
  it("a past ordering end is closed even when the text says Active", () => {
    const r = orderingStatus({ status: "Active", pop_end: "2026-07-01" }, TODAY);
    expect(r.ordering_status).toBe("closed");
    expect(r.days_to_pop_end).toBe(-81);
    expect(r.status_text).toBe("Active");
  });
  it("expired, legacy and winding down read closed; an undated sunset too", () => {
    expect(orderingStatus({ status: "Legacy / Expired or Expiring", pop_end: "2026-02-19" }, TODAY).ordering_status).toBe("closed");
    expect(orderingStatus({ status: "Winding Down", pop_end: "2025-10-31" }, TODAY).ordering_status).toBe("closed");
    expect(orderingStatus({ status: "Sunsetting" }, TODAY).ordering_status).toBe("closed");
  });
  it("a 'last new order <date>' in the status text is the ordering end, not pop_end", () => {
    const row = { status: "Sunsetting: last new order Oct 29 2026", pop_end: "2028-12-31" };
    expect(orderingEndDate(row)).toBe("2026-10-29");
    const before = orderingStatus(row, TODAY);
    expect(before.ordering_status).toBe("closing_soon");
    expect(before.ordering_end).toBe("2026-10-29");
    expect(before.days_to_ordering_end).toBe(39);
    expect(before.days_to_pop_end).toBe(833);
    expect(orderingStatus(row, "2026-10-30").ordering_status).toBe("closed");
  });
  it("pre-award wording wins over an open period", () => {
    expect(orderingStatus({ status: "Solicitation-stage / upcoming", pop_end: "2031-05-31" }, TODAY).ordering_status).toBe("pre_award");
    expect(orderingStatus({ status: "In Market Research" }, TODAY).ordering_status).toBe("pre_award");
    expect(orderingStatus({ status: "In Evaluation" }, TODAY).ordering_status).toBe("pre_award");
    expect(orderingStatus({ status: "Active Solicitation" }, TODAY).ordering_status).toBe("pre_award");
  });
  it("closing soon within 180 days of the ordering end, or on 'final ordering year' wording", () => {
    expect(orderingStatus({ status: "Active: ordering period ends Feb 20 2027; no successor planned", pop_end: "2027-02-20" }, TODAY).ordering_status).toBe("closing_soon");
    expect(orderingStatus({ status: "Active / final ordering year", pop_end: "2027-01-26" }, TODAY).ordering_status).toBe("closing_soon");
    expect(orderingStatus({ status: "Active", pop_end: "2027-03-19" }, TODAY).ordering_status).toBe("closing_soon");
    expect(orderingStatus({ status: "Active", pop_end: "2027-03-20" }, TODAY).ordering_status).toBe("open");
  });
  it("open when active with a future or unknown end; unknown for wording it does not know", () => {
    expect(orderingStatus({ status: "Active / Awarded", pop_end: "2036-03-01" }, TODAY).ordering_status).toBe("open");
    expect(orderingStatus({ status: "Sustainment / Optimization" }, TODAY).ordering_status).toBe("open");
    expect(orderingStatus({ status: "Tapering" }, TODAY).ordering_status).toBe("open");
    expect(orderingStatus({ status: "Something else entirely" }, TODAY).ordering_status).toBe("unknown");
    expect(orderingStatus({}, TODAY).ordering_status).toBe("unknown");
  });
  it("every derived value is in ORDERING_STATUSES", () => {
    for (const st of ["Canceled", "Active", "In Evaluation", "Active / final ordering year", "Winding Down", "weird"]) {
      expect(ORDERING_STATUSES).toContain(orderingStatus({ status: st }, TODAY).ordering_status);
    }
  });
});

describe("decorateVehicle", () => {
  it("adds the derived fields and the dataset stamp without rewriting the row", () => {
    const row = { vehicle_id: "x", status: "Active", pop_end: "2030-01-01", primary_source_url: "https://sam.gov/opp/abc/view" };
    const d = decorateVehicle(row, { today: TODAY, asOf: "2026-09-20" });
    expect(d.status).toBe("Active");
    expect(d.ordering_status).toBe("open");
    expect(d.ordering_end).toBe("2030-01-01");
    expect(d.as_of).toBe("2026-09-20");
    expect(d.source_url).toBe("https://sam.gov/opp/abc/view");
    expect(row.ordering_status).toBeUndefined();
  });
});
