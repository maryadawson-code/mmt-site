// @vitest-environment jsdom
//
// Site help widget (js/support-widget.js), mounted in jsdom against a
// scripted fetch queue. These assert the reader-facing behavior the
// 2026-11-13 rebuild is for: an answer arrives with links the server
// attached, nothing from the server is parsed as HTML, the conversation
// survives following a link, "sent" appears only when the server says sent,
// and the panel is operable by keyboard and labelled for a screen reader.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_SRC = fs.readFileSync(path.join(here, "../../js/support-widget.js"), "utf8");

let queue;
let calls;

// Node 22+ ships a stub localStorage global that vitest's jsdom window
// inherits; the widget reads window.localStorage / window.sessionStorage, so
// install small in-memory Storages for the run.
function memoryStorage() {
  let data = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    clear() { data = {}; },
  };
}

function jsonResponse(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, json: async () => JSON.parse(text) };
}

function mount(html = "") {
  document.head.innerHTML = "";
  document.body.innerHTML = html;
  delete window.__mmtSupportMounted;
  // Evaluated in the global scope, as a <script> tag would be.
  new Function(WIDGET_SRC)();
}

const $ = (sel) => document.querySelector(sel);
const bubbles = (role) => [...document.querySelectorAll(`#support-messages [data-role="${role}"]`)];
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

async function ask(text) {
  $("#support-input").value = text;
  $("#support-panel form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  await flush();
}

beforeEach(() => {
  queue = [];
  calls = [];
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true, writable: true });
  }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.fetch = vi.fn((url, init) => {
    calls.push({ url, body: JSON.parse(init.body), signal: init.signal });
    const next = queue.shift();
    if (!next) return Promise.reject(new Error("fetch queue empty"));
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("mounting", () => {
  it("adds one labelled launcher and a closed, labelled panel", () => {
    mount();
    mount.call(null); // a second script tag must not mount a second widget
    expect(document.querySelectorAll("#support-fab")).toHaveLength(1);
    const fab = $("#support-fab");
    const panel = $("#support-panel");
    expect(fab.getAttribute("aria-label")).toBe("Site help");
    expect(fab.getAttribute("aria-expanded")).toBe("false");
    expect(fab.getAttribute("aria-controls")).toBe("support-panel");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-label")).toBe("Site help");
    expect(panel.style.display).toBe("none");
    expect($("#support-messages").getAttribute("role")).toBe("log");
    expect($("#support-messages").getAttribute("aria-live")).toBe("polite");
    expect($("#support-input").getAttribute("aria-label")).toBe("Your question");
    expect($("#support-send").getAttribute("aria-label")).toBe("Send question");
  });

  it("opens to the input, closes on Escape, and returns focus to the launcher", () => {
    mount();
    $("#support-fab").click();
    expect($("#support-panel").style.display).toBe("flex");
    expect($("#support-fab").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe($("#support-input"));
    $("#support-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect($("#support-panel").style.display).toBe("none");
    expect(document.activeElement).toBe($("#support-fab"));
  });

  it("stays on screen on a small phone and sits left of the Ask MMT embed", () => {
    mount('<div id="mmt-ask-embed"></div>');
    expect($("#support-fab").style.left).toBe("24px");
    expect($("#support-fab").style.display).toBe("flex");
    expect($("#support-widget-style").textContent).toMatch(/max-width:480px/);
    expect($("#support-widget-style").textContent).toMatch(/prefers-reduced-motion/);
  });
});

describe("asking", () => {
  it("sends the question with the session id, and renders the answer with its links", async () => {
    mount();
    queue.push(jsonResponse(200, {
      answer: "The DHA org chart is a Premium page.",
      answered: true,
      links: [
        { title: "DHA Organizational Structure", url: "/premium/org-charts/dha", access: "premium" },
        { title: "What MMT Premium includes", url: "/pricing", access: "public" },
      ],
    }));
    await ask("Where is the DHA org chart?");

    expect(calls[0].url).toBe("/.netlify/functions/support-agent");
    expect(calls[0].body).toMatchObject({ question: "Where is the DHA org chart?", history: [] });
    expect(calls[0].body.sessionId).toMatch(/^sw-/);
    expect(calls[0].body).not.toHaveProperty("email");
    expect(calls[0].body).not.toHaveProperty("token");

    expect(bubbles("user").map((b) => b.textContent)).toEqual(["Where is the DHA org chart?"]);
    const answer = bubbles("agent").pop();
    expect(answer.textContent).toContain("The DHA org chart is a Premium page.");
    const links = [...answer.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/premium/org-charts/dha", "/pricing"]);
    expect(answer.textContent).toContain("★ Premium");
    expect(answer.querySelector('[data-action="escalate"]')).toBeNull();
    expect($("#support-starters").style.display).toBe("none");
  });

  it("sends the member's sign-in token and the last two exchanges", async () => {
    window.localStorage.setItem("mmt_subscriber_token", "tok-123");
    mount();
    for (let i = 1; i <= 3; i += 1) {
      queue.push(jsonResponse(200, { answer: `a${i}`, answered: true, links: [] }));
      await ask(`question ${i}`);
    }
    expect(calls[2].body.token).toBe("tok-123");
    expect(calls[2].body.history).toEqual([
      { question: "question 1", answer: "a1" },
      { question: "question 2", answer: "a2" },
    ]);
  });

  it("never parses server text as HTML and never links off the site", async () => {
    mount();
    queue.push(jsonResponse(200, {
      answer: '<img src=x onerror="window.__pwned=1"> <a href="https://evil.example">click</a>',
      answered: true,
      links: [
        { title: "Evil", url: "https://evil.example/x", access: "public" },
        { title: "Evil 2", url: "//evil.example/x", access: "public" },
        { title: "Evil 3", url: "javascript:alert(1)", access: "public" },
        { title: "Help", url: "/help", access: "public" },
      ],
    }));
    await ask("anything at all");
    const answer = bubbles("agent").pop();
    expect(answer.querySelector("img")).toBeNull();
    expect(window.__pwned).toBeUndefined();
    expect([...answer.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/help"]);
    expect(answer.textContent).toContain("<img src=x");
  });

  it("ignores a second question while one is pending, and too-short input", async () => {
    mount();
    let release;
    queue.push(new Promise((resolve) => { release = resolve; }));
    globalThis.fetch.mockImplementationOnce((url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return queue.shift(); });
    await ask("first question");
    expect($("#support-send").disabled).toBe(true);
    expect($("#support-typing")).not.toBeNull();
    await ask("second question");
    await ask("hi");
    expect(calls).toHaveLength(1);
    release(jsonResponse(200, { answer: "done", answered: true, links: [] }));
    await flush();
    expect($("#support-send").disabled).toBe(false);
    expect($("#support-typing")).toBeNull();
  });

  it("says plainly when the request fails, with the address to write to", async () => {
    mount();
    queue.push(new Error("network down"));
    await ask("Where is the DHA org chart?");
    expect(bubbles("agent").pop().textContent).toMatch(/did not go through.*support@missionmeetstech\.com/);

    queue.push({ status: 502, ok: false, json: async () => { throw new SyntaxError("<html>"); } });
    await ask("Where is the VA org chart?");
    expect(bubbles("agent").pop().textContent).toMatch(/did not go through/);

    queue.push(jsonResponse(400, { error: "Keep the question under 500 characters." }));
    await ask("Where is the HHS org chart?");
    expect(bubbles("agent").pop().textContent).toBe("Keep the question under 500 characters.");
  });

  it("asks a starter question on click", async () => {
    mount();
    queue.push(jsonResponse(200, { answer: "ok", answered: true, links: [] }));
    $("#support-starters button").click();
    await flush();
    expect(calls[0].body.question).toBe("Where is the DHA org chart?");
  });
});

describe("the conversation survives a page change", () => {
  it("restores messages, links and the open panel from sessionStorage", async () => {
    mount();
    $("#support-fab").click();
    queue.push(jsonResponse(200, { answer: "It is on the pricing page.", answered: true, links: [{ title: "Pricing", url: "/pricing", access: "public" }] }));
    await ask("How much is Premium?");
    const firstSession = calls[0].body.sessionId;

    mount(); // the reader followed the link: a new page, the same tab
    expect($("#support-panel").style.display).toBe("flex");
    expect(bubbles("user").map((b) => b.textContent)).toEqual(["How much is Premium?"]);
    expect(bubbles("agent").pop().querySelector("a").getAttribute("href")).toBe("/pricing");
    queue.push(jsonResponse(200, { answer: "Yes.", answered: true, links: [] }));
    await ask("and monthly?");
    expect(calls[1].body.sessionId).toBe(firstSession);
    expect(calls[1].body.history).toEqual([{ question: "How much is Premium?", answer: "It is on the pricing page." }]);
  });

  it("starts clean on a corrupt or hostile stored conversation, and without storage at all", () => {
    window.sessionStorage.setItem("mmt_support_chat", "{not json");
    mount();
    expect(bubbles("agent")).toHaveLength(1);

    window.sessionStorage.setItem("mmt_support_chat", JSON.stringify({ open: true, messages: [{ role: "agent", text: "<b>x</b>", links: [{ title: "T", url: "https://evil.example" }] }, { role: "system", text: "no" }, null] }));
    mount();
    expect(bubbles("agent")).toHaveLength(1);
    expect($("#support-messages b")).toBeNull();
    expect($("#support-messages a")).toBeNull();

    Object.defineProperty(window, "sessionStorage", { get() { throw new Error("blocked"); }, configurable: true });
    expect(() => mount()).not.toThrow();
    expect($("#support-fab")).not.toBeNull();
  });
});

describe("emailing a person", () => {
  async function unanswered() {
    mount();
    queue.push(jsonResponse(200, { answer: "The site does not have a page on that.", answered: false, links: [{ title: "Help and user guide", url: "/help", access: "public" }] }));
    await ask("My scorecard never arrived");
  }

  it("is offered when the site could not answer, and asks for an address before sending anything", async () => {
    await unanswered();
    const offer = bubbles("agent").pop().querySelector('[data-action="escalate"]');
    expect(offer.textContent).toBe("Email this to a person");
    offer.click();
    expect(calls).toHaveLength(1); // opening the form sends nothing
    expect($("#support-escalate label").getAttribute("for")).toBe("support-escalate-email");
    expect($("#support-escalate").textContent).toContain("This sends your last question and the answer you got to MMT support.");

    $("#support-escalate").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await flush();
    expect(calls).toHaveLength(1);
    expect($("#support-escalate-email").getAttribute("aria-invalid")).toBe("true");
    expect($('#support-escalate [role="status"]').textContent).toMatch(/email address/);
  });

  it("says sent only when the server says sent", async () => {
    await unanswered();
    $("#support-person").click();
    $("#support-escalate-email").value = "reader@example.com";
    queue.push(jsonResponse(200, { sent: true }));
    $("#support-escalate").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await flush();
    expect(calls[1].body).toMatchObject({ action: "escalate", question: "My scorecard never arrived", answer: "The site does not have a page on that.", email: "reader@example.com" });
    expect(bubbles("agent").pop().textContent).toBe("Sent to MMT support, with reader@example.com as the address to reply to.");
    expect($("#support-escalate")).toBeNull();
  });

  it("says it did not send when the server says so or the request dies", async () => {
    for (const reply of [jsonResponse(502, { sent: false, error: "That did not send. Write to support@missionmeetstech.com directly." }), new Error("offline")]) {
      await unanswered();
      $("#support-person").click();
      $("#support-escalate-email").value = "reader@example.com";
      queue.push(reply);
      $("#support-escalate").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      await flush();
      const last = bubbles("agent").pop().textContent;
      expect(last).toMatch(/did not (send|go through)/);
      expect(last).not.toMatch(/^Sent/);
    }
  });

  it("asks for a question first when there is nothing to send", () => {
    mount();
    $("#support-person").click();
    expect($("#support-escalate")).toBeNull();
    expect(bubbles("agent").pop().textContent).toMatch(/Type your question first/);
    expect(calls).toHaveLength(0);
  });
});

describe("copy", () => {
  it("follows the voice rules and the light theme", () => {
    const strings = WIDGET_SRC.match(/'[^'\n]{12,}'/g).join("\n");
    expect(strings).not.toMatch(/—|!'|comprehensive|robust|leverage|seamless|AI-powered/i);
    expect(WIDGET_SRC).not.toMatch(/#00E5FA|#00FF85|#00050F|#0D1117|#0A1628|Space Grotesk/i);
  });
});
