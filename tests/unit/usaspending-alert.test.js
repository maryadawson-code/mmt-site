// lib/usaspending-alert.js — the hourly check on real subscriber turns
// (2026-09-15: USASpending was lost on 3 of 5 turns and nothing told Mary).

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { fakeSupabase, rowsOf } from "./helpers/fake-supabase.js";

const require = createRequire(import.meta.url);
const alert = require("../../netlify/functions/lib/usaspending-alert.js");

const NOW = new Date("2026-09-15T17:00:00Z");
const turn = (minutesAgo, details, event_type = "premium_chat_turn") => ({
  __table: "ops_events", event_type, created_at: new Date(NOW.getTime() - minutesAgo * 60000).toISOString(), details,
});
const lost = (q, reason = "timeout") => ({ question: q, unavailable: ["usaspending", "sam_opportunities"], unavailable_reasons: [`usaspending: ${reason}`, "sam_opportunities: SAM.gov API 404"] });
const ok = (q) => ({ question: q, unavailable: ["sam_opportunities"], unavailable_reasons: ["sam_opportunities: SAM.gov API 404"] });
const saved = (q) => ({ question: q, unavailable: ["usaspending"], unavailable_reasons: ["usaspending: timeout; answered from results saved 2026-09-14"] });
const sender = () => { const sent = []; return { sent, send: async (m) => { sent.push(m); return { success: true }; } }; };

describe("assessTurns", () => {
  it("the 2026-09-15 afternoon (3 of 5 lost) alerts", () => {
    const v = alert.assessTurns([turn(55, lost("T4NG2")), turn(50, ok("Salesforce")), turn(45, ok("try again")), turn(40, lost("CSOs")), turn(5, lost("TOP 28"))]);
    expect(v).toMatchObject({ total: 5, alert: true });
    expect(v.lost.map((l) => l.question)).toEqual(["T4NG2", "CSOs", "TOP 28"]);
  });

  it("one lost turn is not an outage, and neither is a minority of a busy hour", () => {
    expect(alert.assessTurns([turn(10, lost("a"))]).alert).toBe(false);
    expect(alert.assessTurns([turn(10, lost("a")), turn(9, lost("b")), turn(8, ok("c")), turn(7, ok("d")), turn(6, ok("e"))]).alert).toBe(false);
  });

  it("a turn answered from a saved copy did not lose USASpending", () => {
    expect(alert.assessTurns([turn(10, saved("a")), turn(9, saved("b"))]).alert).toBe(false);
  });

  it("rows from before unavailable_reasons existed still count by id", () => {
    expect(alert.usaspendingReason({ unavailable: ["usaspending"] })).toBe("not reached");
    expect(alert.usaspendingReason({ unavailable: ["sam_opportunities"] })).toBeNull();
    expect(alert.usaspendingReason({})).toBeNull();
  });
});

describe("checkUSASpendingTurns", () => {
  it("emails once with the questions and reasons, reads free and member turns, and ignores turns older than the hour", async () => {
    const store = [turn(90, lost("old one")), turn(30, lost("T4NG2")), turn(20, lost("DHITSC"), "ask_mmt_free_turn"), turn(10, ok("fine"))];
    const sb = fakeSupabase(store, { clock: () => NOW });
    const { sent, send } = sender();
    const out = await alert.checkUSASpendingTurns(sb, { now: NOW, send });
    expect(out).toMatchObject({ checked: true, alerted: true, total: 3, lost: 2 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("mary@missionmeetstech.com");
    expect(sent[0].subject).toBe("[Ask MMT] USASpending not reached on 2 of 3 questions in the last hour");
    expect(sent[0].html).toContain('"T4NG2" (timeout)');
    expect(sent[0].html).toContain('"DHITSC" (timeout)');
    expect(sent[0].html).not.toContain("old one");
    const marker = rowsOf(store, "ops_events", alert.ALERT_EVENT);
    expect(marker).toHaveLength(1);
    expect(marker[0].details.status).toBe("sent");
  });

  it("a double-fired tick and the next hour send nothing more that UTC day", async () => {
    const store = [turn(30, lost("a")), turn(20, lost("b"))];
    const { sent, send } = sender();
    await Promise.all([
      alert.checkUSASpendingTurns(fakeSupabase(store, { clock: () => NOW }), { now: NOW, send }),
      alert.checkUSASpendingTurns(fakeSupabase(store, { clock: () => NOW }), { now: NOW, send }),
    ]);
    const later = new Date(NOW.getTime() + 60 * 60000);
    store.push(turn(-40, lost("c")), turn(-50, lost("d")));
    const out = await alert.checkUSASpendingTurns(fakeSupabase(store, { clock: () => later }), { now: later, send });
    expect(sent).toHaveLength(1);
    expect(out.skipped).toBe("lost_claim_race");
  });

  it("nothing to report sends nothing and writes no marker", async () => {
    const store = [turn(30, ok("a")), turn(20, saved("b"))];
    const { sent, send } = sender();
    const out = await alert.checkUSASpendingTurns(fakeSupabase(store, { clock: () => NOW }), { now: NOW, send });
    expect(out).toMatchObject({ checked: true, alerted: false, total: 2, lost: 0 });
    expect(sent).toHaveLength(0);
    expect(rowsOf(store, "ops_events", alert.ALERT_EVENT)).toHaveLength(0);
  });

  it("a failed send is recorded as send_failed, not sent", async () => {
    const store = [turn(30, lost("a")), turn(20, lost("b"))];
    const out = await alert.checkUSASpendingTurns(fakeSupabase(store, { clock: () => NOW }), { now: NOW, send: async () => ({ success: false, error: "RESEND_API_KEY not configured" }) });
    expect(out.alerted).toBe(false);
    const marker = rowsOf(store, "ops_events", alert.ALERT_EVENT)[0];
    expect(marker.details).toMatchObject({ status: "send_failed", error: "RESEND_API_KEY not configured" });
  });

  it("an unreadable turn table is reported, never treated as a quiet hour", async () => {
    const sb = { from: () => ({ select() { return this; }, in() { return this; }, gte() { return this; }, limit: async () => ({ data: null, error: { message: "timeout" } }) }) };
    const out = await alert.checkUSASpendingTurns(sb, { now: NOW, send: async () => ({ success: true }) });
    expect(out).toEqual({ checked: false, error: "timeout" });
  });
});
