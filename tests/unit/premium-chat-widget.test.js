// @vitest-environment jsdom
//
// Ask MMT widget (js/premium-chat-widget.js), mounted in the /ask embed
// against a scripted fetch queue. These assert the subscriber-facing
// behaviors that broke or were missing on 2026-09-14: the unlock replaced
// the answer, Enter twice spent two questions, a garbled or paused reply was
// an uncaught error, tables rendered as pipes, and nothing could be copied.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_SRC = fs.readFileSync(path.join(here, "../../js/premium-chat-widget.js"), "utf8");

// Pinned: the "same month" meter fixture is stamped relative to a fixed
// instant, and the stale one is a different year, so the drop check has
// teeth no matter when the suite runs.
const STALE_TS = Date.UTC(2020, 0, 15);

let queue;
let calls;

// Node 22+ ships its own experimental localStorage global (a stub with no
// methods unless --localstorage-file points somewhere), and vitest's jsdom
// window inherits it. The widget reads the bare global, so install a small
// in-memory Storage for the run.
function memoryStorage() {
  let data = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    clear() { data = {}; },
    key(i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; },
  };
}
Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true, writable: true });

function jsonResponse(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, text: async () => text, json: async () => JSON.parse(text) };
}

function scriptedFetch(url, init) {
  calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null, signal: init && init.signal });
  const next = queue.shift();
  if (!next) return Promise.reject(new Error("fetch queue empty"));
  if (next instanceof Error) return Promise.reject(next);
  return Promise.resolve(next);
}

function mount() {
  document.body.innerHTML = '<div id="ask" data-cap-free="3" data-cap-premium="100"><div id="mmt-ask-embed"></div></div>';
  delete window.__mmtPremiumChatMounted;
  delete window.mmtAskMMT;
  // Evaluated in the global scope, as a <script> tag would be.
  new Function(WIDGET_SRC)();
  return {
    panel: document.getElementById("mmt-premium-chat-panel"),
    msgs: document.getElementById("mmt-premium-chat-messages"),
    input: document.getElementById("mmt-premium-chat-input"),
    meter: document.getElementById("mmt-ask-meter"),
  };
}

async function flush(n = 6) {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
}

function pressEnter(input) {
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function assistantBubbles(msgs) {
  return Array.from(msgs.querySelectorAll("div[style*='max-width:88%']")).filter((b) => !b.getAttribute("role") && !b.hasAttribute("data-retry") && b.style.background !== "var(--mmt-navy, #0A192F)");
}

const ANSWER = {
  answer: "CCN Next Gen proposals were received in April. Award TBD.",
  agency: "VA",
  agencyName: "Department of Veterans Affairs",
  hasData: true,
  sources: [
    { id: "mmt_archive", kind: "article", name: "Mission Meets Tech", title: "CCN Next Gen update", date: "2026-09-13", url: "https://missionmeetstech.com/newsletter/ccn/" },
    { id: "usaspending", kind: "system", name: "USASpending.gov", url: "https://www.usaspending.gov", mode: "live", links: [{ url: "https://www.usaspending.gov/award/abc", label: "HT001524F0063" }, "https://www.usaspending.gov/award/def"] },
  ],
  unavailable: [{ id: "sam_gov", name: "SAM.gov Opportunities", reason: "daily quota exhausted" }],
  remaining: 2,
  cap: 3,
  mode: "free",
  turn_id: "turn-1",
};

beforeEach(() => {
  queue = [];
  calls = [];
  localStorage.clear();
  window.fetch = scriptedFetch;
  globalThis.fetch = scriptedFetch;
  window.plausible = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mount and greeting", () => {
  it("renders the greeting, sample chips and an empty meter, with no hardcoded cap", () => {
    const { msgs, meter } = mount();
    const text = msgs.textContent;
    expect(text).toMatch(/I'm the MMT research assistant/);
    expect(text).not.toMatch(/\b3 free\b/);
    expect(msgs.querySelectorAll("button[data-sample]").length).toBe(3);
    expect(meter.textContent).toBe("");
    expect(typeof window.mmtAskMMT).toBe("function");
  });

  it("repaints a meter persisted this month and drops one from another month", () => {
    localStorage.setItem("mmt_ask_meter", JSON.stringify({ remaining: 1, cap: 3, mode: "free", ts: Date.now() }));
    let ui = mount();
    expect(ui.meter.textContent).toBe("1 of 3 left this month");
    expect(ui.msgs.textContent).toMatch(/1 of 3 free questions left/);

    document.body.innerHTML = "";
    localStorage.setItem("mmt_ask_meter", JSON.stringify({ remaining: 1, cap: 3, mode: "free", ts: STALE_TS }));
    ui = mount();
    expect(ui.meter.textContent).toBe("");
    expect(localStorage.getItem("mmt_ask_meter")).toBeNull();
  });
});

describe("gated answer and unlock", () => {
  it("shows a blurred block with no anchors, then unlock keeps the answer and reveals the sources", async () => {
    const { msgs, input } = mount();
    queue.push(jsonResponse(200, { ...ANSWER, sources: [], sources_count: 2, gated: true, unlock_id: "u-1", remaining: 2, cap: 3, mode: "anonymous", turn_id: null }));
    input.value = "What's the status of CCN Next Gen?";
    pressEnter(input);
    await flush();

    const bubble = msgs.querySelector("[data-sources-slot]").parentNode;
    expect(bubble.textContent).toMatch(/proposals were received in April/);
    expect(bubble.querySelector("[data-blurred]")).not.toBeNull();
    expect(bubble.querySelectorAll("[data-sources] a").length).toBe(0);
    expect(bubble.querySelector("[data-notchecked]").textContent).toMatch(/Could not check this turn/);
    expect(bubble.querySelector("[data-notchecked]").textContent).toMatch(/SAM.gov Opportunities: daily quota exhausted/);

    const form = msgs.querySelector("form");
    expect(form).not.toBeNull();
    const card = form.parentNode;
    form.querySelector("input").value = "reader@example.com";
    queue.push(jsonResponse(200, { ok: true, sources: ANSWER.sources, remaining: 2, cap: 3 }));
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    expect(calls[1].body).toEqual({ action: "unlock", turn_id: "u-1", email: "reader@example.com" });
    // The answer text is still in the bubble; the status went into the card.
    expect(bubble.textContent).toMatch(/proposals were received in April/);
    expect(card.textContent).toMatch(/Sources unlocked. You have 2 free questions left/);
    expect(bubble.querySelector("[data-blurred]")).toBeNull();
    const links = Array.from(bubble.querySelectorAll("[data-sources] a")).map((a) => a.textContent);
    expect(links).toContain("CCN Next Gen update");
    expect(links).toContain("HT001524F0063");
    expect(links).toContain("record 2");
    expect(bubble.querySelector("[data-sources]").textContent).toMatch(/Sep 13, 2026/);
    expect(card.querySelector("form")).toBeNull(); // the card was rewritten with the status line
    expect(localStorage.getItem("mmt_ask_free_email")).toBe("reader@example.com");
    const history = JSON.parse(localStorage.getItem("mmt_premium_chat_history"));
    expect(history[0].meta.sources.length).toBe(2);
  });
});

describe("in-flight guard", () => {
  it("Enter twice within 100 ms produces one fetch, and the box is read-only while waiting", async () => {
    const { input, msgs } = mount();
    const sendBtn = input.nextSibling;
    let release;
    queue.push(new Promise((r) => { release = r; }));
    input.value = "Who are the incumbents on T4NG2?";
    pressEnter(input);
    input.value = "Who are the incumbents on T4NG2?";
    pressEnter(input);
    await flush(2);
    expect(calls.length).toBe(1);
    expect(input.readOnly).toBe(true);
    expect(sendBtn.getAttribute("aria-busy")).toBe("true");
    expect(msgs.querySelector("[role=status]").textContent).toBe("Reading the MMT archive");
    expect(calls[0].signal).toBeTruthy();
    // Sample chips are ignored while a request is out.
    const chip = msgs.querySelector("button[data-sample]");
    if (chip) chip.click();
    expect(calls.length).toBe(1);

    release(jsonResponse(200, ANSWER));
    await flush();
    expect(input.readOnly).toBe(false);
    expect(sendBtn.getAttribute("aria-busy")).toBe("false");
    expect(msgs.querySelector("[role=status]")).toBeNull();
  });
});

describe("errors", () => {
  it("renders a PAUSED 503 as the paused card and puts the question back", async () => {
    const { msgs, input } = mount();
    queue.push(jsonResponse(503, { error: "paused", reason_code: "PAUSED" }));
    input.value = "What's moving in DHA's FY2027 IT budget?";
    pressEnter(input);
    await flush();
    const card = msgs.querySelector("[data-paused]");
    expect(card).not.toBeNull();
    expect(card.textContent).toMatch(/Ask MMT is paused for maintenance/);
    expect(card.textContent).not.toMatch(/!/);
    expect(input.value).toBe("What's moving in DHA's FY2027 IT budget?");
    expect(msgs.querySelector("[data-retry]")).toBeNull();
  });

  it("maps a non-JSON body and a 5xx to a Retry bubble that re-posts the same question", async () => {
    const { msgs, input } = mount();
    queue.push(jsonResponse(502, "<html>Bad gateway</html>"));
    input.value = "What did the FY2027 NDAA change?";
    pressEnter(input);
    await flush();
    let retry = msgs.querySelector("[data-retry]");
    expect(retry).not.toBeNull();
    expect(retry.textContent).toMatch(/garbled/);

    queue.push(jsonResponse(500, { error: "boom" }));
    retry.querySelector("button").click();
    await flush();
    expect(calls.length).toBe(2);
    expect(calls[1].body.question).toBe("What did the FY2027 NDAA change?");
    retry = msgs.querySelector("[data-retry]");
    expect(retry.textContent).toMatch(/returned an error/);
    expect(msgs.textContent).not.toMatch(/!/);
  });

  it("drops a stale token on a token_* hint", async () => {
    localStorage.setItem("mmt_subscriber_token", "stale");
    localStorage.setItem("mmt_premium", "true");
    const { msgs, input } = mount();
    queue.push(jsonResponse(200, { ...ANSWER, hint: "token_expired", mode: "free" }));
    input.value = "Who are the incumbents on T4NG2?";
    pressEnter(input);
    await flush();
    expect(calls[0].body.token).toBe("stale");
    expect(localStorage.getItem("mmt_subscriber_token")).toBeNull();
    expect(msgs.textContent).toMatch(/Sign in again/);
  });

  it("a member with an expired token before the free tier opens gets Sign in again, not the closed-tier card, and the token is dropped", async () => {
    // Pinned to the soft-launch week: the server answers FREE_TIER_CLOSED
    // with hint token_expired for a lapsed member (2026-09-14 review finding).
    localStorage.setItem("mmt_subscriber_token", "stale");
    localStorage.setItem("mmt_premium", "true");
    localStorage.setItem("mmt_premium_ts", String(Date.UTC(2026, 7, 1)));
    localStorage.setItem("mmt_email", "member@example.com");
    const { msgs, input } = mount();
    queue.push(jsonResponse(403, {
      error: "Ask MMT opens to everyone on 2026-09-21. Premium members can sign in and use it now.",
      reason_code: "FREE_TIER_CLOSED",
      opens: "2026-09-21",
      hint: "token_expired",
      mode: "free",
    }));
    input.value = "What did the FY2027 NDAA change?";
    pressEnter(input);
    await flush();
    expect(calls[0].body.token).toBe("stale");
    expect(localStorage.getItem("mmt_subscriber_token")).toBeNull();
    expect(msgs.textContent).toMatch(/Your sign-in has expired/);
    expect(msgs.textContent).toMatch(/Sign in again/);
    expect(msgs.textContent).not.toMatch(/opens to everyone/);
    const signIn = Array.from(msgs.querySelectorAll("a")).find((a) => /Sign in again/.test(a.textContent));
    expect(signIn.getAttribute("href")).toBe("/dashboard.html");
    expect(msgs.querySelector("a[href*='/pricing']")).toBeNull();
  });

  it("never sends the token when the paywall does not report a premium session", async () => {
    localStorage.setItem("mmt_subscriber_token", "leftover");
    const { input } = mount();
    queue.push(jsonResponse(200, ANSWER));
    input.value = "Who are the incumbents on T4NG2?";
    pressEnter(input);
    await flush();
    expect(calls[0].body.token).toBeUndefined();
  });
});

describe("rendering", () => {
  it("renders a pipe table inside a scroll wrapper, numbered lists as <ol>, bare URLs as links, and no raw underscores", async () => {
    const { msgs, input } = mount();
    const md = "Awards so far:\n\n| Vendor | Amount |\n|---|---|\n| New Tech Solutions | $286,673 |\n| Immuta | $12,000 |\n\n1. First\n2. Second\n\nSee https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700_-NONE-_-NONE- for _the record_.";
    queue.push(jsonResponse(200, { ...ANSWER, answer: md }));
    input.value = "Show me a table";
    pressEnter(input);
    await flush();
    const bubble = msgs.querySelector("[data-sources-slot]").parentNode;
    const wrapper = bubble.querySelector("[data-table-scroll]");
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.overflowX).toBe("auto");
    expect(wrapper.style.maxWidth).toBe("100%");
    const table = wrapper.querySelector("table");
    expect(table).not.toBeNull();
    expect(table.querySelectorAll("th").length).toBe(2);
    expect(table.querySelectorAll("tbody tr").length).toBe(2);
    expect(table.textContent).toMatch(/New Tech Solutions/);
    const ol = bubble.querySelector("ol");
    expect(ol).not.toBeNull();
    expect(ol.style.listStyle).toMatch(/decimal/);
    expect(ol.querySelectorAll("li").length).toBe(2);
    const auto = Array.from(bubble.querySelectorAll("p a")).find((a) => a.href.includes("usaspending.gov/award/CONT_AWD"));
    expect(auto).toBeTruthy();
    expect(auto.getAttribute("href")).toBe("https://www.usaspending.gov/award/CONT_AWD_HT001524F0063_9700_-NONE-_-NONE-");
    expect(bubble.querySelector("em").textContent).toBe("the record");
    expect(bubble.textContent).not.toMatch(/\|/);
    expect(bubble.querySelector("p").textContent).not.toMatch(/_the record_/);
  });
});

describe("copy and feedback", () => {
  it("Copy writes the question, answer, sources and the not-checked line to the clipboard", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    const { msgs, input } = mount();
    queue.push(jsonResponse(200, ANSWER));
    input.value = "What's the status of CCN Next Gen?";
    pressEnter(input);
    await flush();
    const copy = msgs.querySelector("button[data-copy]");
    expect(copy).not.toBeNull();
    copy.click();
    await flush(2);
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text).toMatch(/Question: What's the status of CCN Next Gen\?/);
    expect(text).toMatch(/CCN Next Gen proposals were received in April/);
    expect(text).toMatch(/Mission Meets Tech: CCN Next Gen update \(Sep 13, 2026\) https:\/\/missionmeetstech.com\/newsletter\/ccn\//);
    expect(text).toMatch(/USASpending.gov https:\/\/www.usaspending.gov/);
    expect(text).toMatch(/Could not check this turn: SAM.gov Opportunities \(daily quota exhausted\)/);
    expect(copy.textContent).toBe("Copied");
    expect(window.plausible).toHaveBeenCalledWith("ask_copy", undefined);
  });

  it("thumbs up posts the feedback action with the turn_id and shows Thanks", async () => {
    const { msgs, input } = mount();
    queue.push(jsonResponse(200, ANSWER));
    input.value = "What's the status of CCN Next Gen?";
    pressEnter(input);
    await flush();
    const up = msgs.querySelector("button[data-vote=up]");
    expect(up).not.toBeNull();
    queue.push(jsonResponse(200, { ok: true }));
    up.click();
    await flush();
    expect(calls[1].body).toEqual({ action: "feedback", turn_id: "turn-1", verdict: "up", note: "" });
    expect(msgs.querySelector("[data-feedback]").textContent).toBe("Thanks");
    expect(window.plausible).toHaveBeenCalledWith("ask_feedback_up", { props: { verdict: "up" } });
    const history = JSON.parse(localStorage.getItem("mmt_premium_chat_history"));
    expect(history[0].meta.feedback).toBe("up");
  });

  it("thumbs down opens a one-line note and posts down or wrong", async () => {
    const { msgs, input } = mount();
    queue.push(jsonResponse(200, ANSWER));
    input.value = "What's the status of CCN Next Gen?";
    pressEnter(input);
    await flush();
    msgs.querySelector("button[data-vote=down]").click();
    const form = msgs.querySelector("form[data-fb-note]");
    expect(form).not.toBeNull();
    form.querySelector("input[type=text]").value = "It expanded FOC wrong";
    form.querySelector("[data-wrong]").checked = true;
    queue.push(jsonResponse(200, { ok: true }));
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(calls[1].body).toEqual({ action: "feedback", turn_id: "turn-1", verdict: "wrong", note: "It expanded FOC wrong" });
    expect(window.plausible).toHaveBeenCalledWith("ask_feedback_down", { props: { verdict: "wrong" } });
    expect(msgs.querySelector("[data-feedback]").textContent).toBe("Thanks");
  });
});

describe("chips and clear", () => {
  it("a sample chip submits its question, and Clear resets the conversation", async () => {
    const { msgs, input } = mount();
    queue.push(jsonResponse(200, ANSWER));
    msgs.querySelector("button[data-sample]").click();
    await flush();
    expect(calls[0].body.question).toBe("What's the status of CCN Next Gen?");
    expect(msgs.querySelector("[data-chips]")).toBeNull();
    const clear = document.querySelector("#mmt-premium-chat-panel button[aria-label='Clear the conversation']");
    clear.click();
    expect(localStorage.getItem("mmt_premium_chat_history")).toBeNull();
    expect(msgs.querySelectorAll("button[data-sample]").length).toBe(3);
    expect(input.value).toBe("");
  });

  it("a data-q card fills and focuses the box without submitting for a visitor", async () => {
    document.body.innerHTML = "";
    const { input } = mount();
    const a = document.createElement("a");
    a.href = "#ask";
    a.setAttribute("data-q", "How much has VA obligated to Oracle since FY2024?");
    document.body.appendChild(a);
    a.click();
    await flush(2);
    expect(input.value).toBe("How much has VA obligated to Oracle since FY2024?");
    expect(calls.length).toBe(0);
  });
});

describe("voice", () => {
  it("carries no em dashes, exclamation points or banned words in user-facing strings", () => {
    // Regex literals carry quotes and bangs of their own; blank them first,
    // then take every single-line quoted string.
    const noRegex = WIDGET_SRC.replace(/([(,=:]\s*)\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, "$1REGEX");
    const strings = noRegex.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || [];
    expect(strings.length).toBeGreaterThan(100);
    const banned = /\b(pivotal|comprehensive|robust|transformative|delve|leverage|synergy|paradigm|holistic|streamline|actionable|ecosystem)\b/i;
    for (const s of strings) {
      expect(s, s).not.toMatch(/—/);
      expect(s, s).not.toMatch(/!/);
      expect(s, s).not.toMatch(banned);
    }
  });
});
