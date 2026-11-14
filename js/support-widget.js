// support-widget.js: the site help widget.
// Spec: docs/support-widget-spec.md.
//
// A floating button on every page. A reader asks where something is or what a
// page covers, and /.netlify/functions/support-agent answers from what the
// site has published, with links to the pages. The server attaches the links;
// nothing it returns is parsed as HTML here.
//
// - Signed-in members send their sign-in token so the answer can read member
//   pages. The server decides the caller class from the token, never from an
//   email.
// - "Email a person" is a separate step the reader chooses. The widget says
//   "sent" only when the server says the message was accepted.
// - The conversation lives in sessionStorage so following a link in an answer
//   does not lose the answer.
//
// Colors come from the site tokens (styles/tokens.css) with the canonical
// light-theme fallbacks.
(function () {
  'use strict';

  if (window.__mmtSupportMounted) return;
  window.__mmtSupportMounted = true;

  var ENDPOINT = '/.netlify/functions/support-agent';
  var SUPPORT_EMAIL = 'support@missionmeetstech.com';
  var STORE_KEY = 'mmt_support_chat';
  var TOKEN_KEY = 'mmt_subscriber_token';
  var EMAIL_KEY = 'mmt_email';
  var MAX_STORED = 20;
  var HISTORY_TURNS = 2;
  var QUESTION_MIN = 3;
  var QUESTION_MAX = 500;
  var REQUEST_TIMEOUT_MS = 15000;
  var WELCOME = 'Ask where something is or what a page covers. Answers come from what MMT has published, with links to the pages.';
  var FAILED = 'That did not go through. Try again, or write to ' + SUPPORT_EMAIL + '.';
  var STARTERS = ['Where is the DHA org chart?', 'What does Premium include?', 'How do I sign in?'];

  var C = {
    navy: 'var(--mmt-navy, #0A192F)',
    teal: 'var(--mmt-teal, #457B9D)',
    soft: 'var(--mmt-soft, #F3F4F6)',
    white: 'var(--mmt-white, #FFFFFF)',
    text2: 'var(--mmt-text-secondary, #5C6B7A)',
    border: 'var(--mmt-border, #D8E0E8)'
  };
  var ICON_CHAT = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_SEND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  var state = { open: false, messages: [], sessionId: newSessionId(), pending: false };
  var ui = {};

  function newSessionId() {
    return 'sw-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Storage can throw, and so can merely reading window.sessionStorage
  // (blocked site data, a sandboxed frame). The widget works without it; it
  // only forgets the conversation on the next page.
  function readStore(storageName, key) {
    try { return window[storageName].getItem(key); } catch (e) { return null; }
  }

  function restore() {
    var raw = readStore('sessionStorage', STORE_KEY);
    if (!raw) return;
    try {
      var saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.messages)) return;
      state.messages = saved.messages.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'agent') && typeof m.text === 'string';
      }).slice(-MAX_STORED);
      state.open = saved.open === true;
      if (typeof saved.sessionId === 'string') state.sessionId = saved.sessionId.slice(0, 40);
    } catch (e) { /* a corrupt entry is ignored: the widget starts clean */ }
  }

  function persist() {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({
        open: state.open,
        sessionId: state.sessionId,
        messages: state.messages.slice(-MAX_STORED)
      }));
    } catch (e) { /* storage unavailable: nothing to save to */ }
  }

  function el(tag, css, text) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text) node.textContent = text;
    return node;
  }

  // A link is rendered only when it stays on this site.
  function isSitePath(url) {
    return typeof url === 'string' && url.charAt(0) === '/' && url.charAt(1) !== '/' && url.indexOf('\\') === -1;
  }

  function addStyles() {
    if (document.getElementById('support-widget-style')) return;
    var style = document.createElement('style');
    style.id = 'support-widget-style';
    style.textContent =
      '#support-fab:focus-visible,#support-panel button:focus-visible,#support-panel a:focus-visible,#support-panel input:focus-visible{outline:3px solid ' + C.teal + ';outline-offset:2px;}' +
      '#support-fab{transition:transform .2s;}#support-fab:hover{transform:scale(1.06);}' +
      '#support-panel a{color:' + C.navy + ';}' +
      '@media (prefers-reduced-motion: reduce){#support-fab{transition:none;}#support-fab:hover{transform:none;}}' +
      '@media (max-width:480px){#support-panel{left:12px !important;right:12px !important;width:auto !important;max-width:none !important;}}';
    document.head.appendChild(style);
  }

  function build() {
    addStyles();
    var hasDashNav = !!document.querySelector('.dash-nav') && window.matchMedia('(max-width:768px)').matches;
    // On /ask the embedded Ask MMT panel owns the right edge; mount left so
    // the help button never covers its Ask button.
    var side = document.getElementById('mmt-ask-embed') ? 'left:24px;' : 'right:24px;';

    var fab = el('button', 'position:fixed;bottom:' + (hasDashNav ? '124px' : '24px') + ';' + side +
      'width:56px;height:56px;border-radius:50%;background:' + C.teal + ';color:#FFFFFF;border:none;cursor:pointer;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:9999;display:flex;align-items:center;justify-content:center;');
    fab.id = 'support-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Site help');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'support-panel');
    fab.innerHTML = ICON_CHAT;
    fab.addEventListener('click', function () { setOpen(!state.open, true); });

    var panel = el('div', 'position:fixed;bottom:' + (hasDashNav ? '192px' : '92px') + ';' + side +
      'width:380px;max-width:calc(100vw - 24px);max-height:min(560px, calc(100vh - 120px));background:' + C.white +
      ';border:1px solid ' + C.border + ';border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.12);z-index:9999;display:none;' +
      'flex-direction:column;overflow:hidden;font-family:Inter,-apple-system,sans-serif;color:' + C.navy + ';');
    panel.id = 'support-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Site help');
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false, true); }
    });

    var header = el('div', 'padding:14px 16px 14px 20px;background:' + C.navy + ';color:#FFFFFF;display:flex;align-items:center;justify-content:space-between;gap:12px;');
    var heading = el('div');
    heading.appendChild(el('div', 'font-size:15px;font-weight:700;', 'Site help'));
    heading.appendChild(el('div', 'font-size:12px;color:#D8E0E8;', 'Answers from MMT’s published pages'));
    var close = el('button', 'background:none;border:none;color:#FFFFFF;cursor:pointer;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:8px;flex-shrink:0;');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close help');
    close.innerHTML = ICON_CLOSE;
    close.addEventListener('click', function () { setOpen(false, true); });
    header.appendChild(heading);
    header.appendChild(close);

    var log = el('div', 'flex:1;overflow-y:auto;padding:16px 16px 4px;min-height:140px;');
    log.id = 'support-messages';
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-label', 'Conversation');

    var starters = el('div', 'display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 12px;');
    starters.id = 'support-starters';
    STARTERS.forEach(function (q) {
      var chip = el('button', 'background:' + C.white + ';border:1px solid ' + C.border + ';border-radius:999px;padding:10px 14px;min-height:44px;font-size:13px;font-family:inherit;color:' + C.navy + ';cursor:pointer;', q);
      chip.type = 'button';
      chip.addEventListener('click', function () { ask(q); });
      starters.appendChild(chip);
    });

    var form = el('form', 'padding:12px 16px;border-top:1px solid ' + C.border + ';display:flex;gap:8px;margin:0;');
    form.setAttribute('novalidate', 'novalidate');
    var input = el('input', 'flex:1;min-width:0;padding:10px 14px;height:44px;box-sizing:border-box;border:1px solid ' + C.border + ';border-radius:8px;font-size:16px;font-family:inherit;color:' + C.navy + ';background:' + C.white + ';');
    input.id = 'support-input';
    input.type = 'text';
    input.maxLength = QUESTION_MAX;
    input.autocomplete = 'off';
    input.placeholder = 'Ask about the site';
    input.setAttribute('aria-label', 'Your question');
    var send = el('button', 'width:44px;height:44px;border-radius:8px;background:' + C.teal + ';color:#FFFFFF;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;');
    send.id = 'support-send';
    send.type = 'submit';
    send.setAttribute('aria-label', 'Send question');
    send.innerHTML = ICON_SEND;
    form.appendChild(input);
    form.appendChild(send);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (q.length < QUESTION_MIN) return;
      input.value = '';
      ask(q);
    });

    var foot = el('div', 'padding:0 16px 12px;display:flex;justify-content:flex-end;');
    var person = el('button', 'background:none;border:none;padding:8px 4px;min-height:44px;font-size:13px;font-family:inherit;color:' + C.navy + ';text-decoration:underline;cursor:pointer;', 'Email a person instead');
    person.id = 'support-person';
    person.type = 'button';
    person.addEventListener('click', showEscalation);
    foot.appendChild(person);

    panel.appendChild(header);
    panel.appendChild(log);
    panel.appendChild(starters);
    panel.appendChild(form);
    panel.appendChild(foot);
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    ui = { fab: fab, panel: panel, log: log, starters: starters, input: input, send: send };
  }

  function setOpen(open, moveFocus) {
    state.open = open;
    ui.panel.style.display = open ? 'flex' : 'none';
    ui.fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    ui.fab.setAttribute('aria-label', open ? 'Close site help' : 'Site help');
    ui.fab.innerHTML = open ? ICON_CLOSE : ICON_CHAT;
    persist();
    if (!moveFocus) return;
    if (open) ui.input.focus();
    else ui.fab.focus();
  }

  function scrollToEnd() {
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function renderLinks(links) {
    var safe = (links || []).filter(function (l) { return l && isSitePath(l.url) && typeof l.title === 'string' && l.title; });
    if (!safe.length) return null;
    var list = el('ul', 'list-style:none;margin:8px 0 0;padding:0;');
    safe.forEach(function (link) {
      var item = el('li', 'margin:0 0 6px;');
      var a = el('a', 'font-size:14px;font-weight:600;text-decoration:underline;display:inline-block;padding:4px 0;', link.title);
      a.href = link.url;
      item.appendChild(a);
      if (link.access === 'premium') {
        item.appendChild(el('span', 'margin-left:8px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:' + C.navy + ';background:' + C.white + ';border:1px solid ' + C.border + ';border-radius:4px;padding:2px 6px;white-space:nowrap;', '★ Premium'));
      }
      list.appendChild(item);
    });
    return list;
  }

  function renderMessage(message) {
    var mine = message.role === 'user';
    var bubble = el('div', mine
      ? 'background:' + C.teal + ';color:#FFFFFF;padding:10px 14px;border-radius:12px 12px 4px 12px;margin:0 0 10px auto;font-size:14px;line-height:1.5;max-width:85%;width:fit-content;overflow-wrap:anywhere;'
      : 'background:' + C.soft + ';color:' + C.navy + ';padding:10px 14px;border-radius:12px 12px 12px 4px;margin:0 0 10px;font-size:14px;line-height:1.5;max-width:92%;overflow-wrap:anywhere;');
    bubble.setAttribute('data-role', message.role);
    bubble.appendChild(el('div', '', message.text));
    if (!mine) {
      var links = renderLinks(message.links);
      if (links) bubble.appendChild(links);
      if (message.answered === false) {
        var offer = el('button', 'margin-top:8px;background:' + C.white + ';border:1px solid ' + C.border + ';border-radius:8px;padding:8px 12px;min-height:44px;font-size:13px;font-weight:600;font-family:inherit;color:' + C.navy + ';cursor:pointer;', 'Email this to a person');
        offer.type = 'button';
        offer.setAttribute('data-action', 'escalate');
        offer.addEventListener('click', showEscalation);
        bubble.appendChild(offer);
      }
    }
    ui.log.appendChild(bubble);
    scrollToEnd();
  }

  function addMessage(message) {
    state.messages.push(message);
    if (state.messages.length > MAX_STORED) state.messages = state.messages.slice(-MAX_STORED);
    persist();
    renderMessage(message);
    ui.starters.style.display = 'none';
  }

  function setPending(pending) {
    state.pending = pending;
    ui.send.disabled = pending;
    ui.send.style.opacity = pending ? '0.6' : '1';
    var old = document.getElementById('support-typing');
    if (old) old.remove();
    if (!pending) return;
    var typing = el('div', 'background:' + C.soft + ';color:' + C.text2 + ';padding:10px 14px;border-radius:12px 12px 12px 4px;margin-bottom:10px;font-size:13px;width:fit-content;', 'Looking through the site');
    typing.id = 'support-typing';
    ui.log.appendChild(typing);
    scrollToEnd();
  }

  // The last two answered exchanges, so "and for VA?" has its question.
  function history() {
    var turns = [];
    for (var i = 0; i < state.messages.length - 1; i += 1) {
      var q = state.messages[i];
      var a = state.messages[i + 1];
      if (q.role === 'user' && a.role === 'agent') turns.push({ question: q.text, answer: a.text });
    }
    return turns.slice(-HISTORY_TURNS);
  }

  function post(payload) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var token = readStore('localStorage', TOKEN_KEY);
    if (token) payload.token = token;
    payload.sessionId = state.sessionId;
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      // A 4xx or 5xx still carries a JSON body with the message to show.
      return res.json().then(function (data) { return { status: res.status, data: data || {} }; });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function ask(question) {
    if (state.pending) return;
    var prior = history();
    addMessage({ role: 'user', text: question });
    setPending(true);
    post({ question: question, history: prior }).then(function (res) {
      var data = res.data;
      setPending(false);
      if (typeof data.answer !== 'string' || !data.answer) {
        addMessage({ role: 'agent', text: typeof data.error === 'string' && data.error ? data.error : FAILED });
        return;
      }
      addMessage({ role: 'agent', text: data.answer, links: Array.isArray(data.links) ? data.links : [], answered: data.answered !== false });
    }).catch(function () {
      setPending(false);
      addMessage({ role: 'agent', text: FAILED });
    });
  }

  function lastOf(role) {
    for (var i = state.messages.length - 1; i >= 0; i -= 1) if (state.messages[i].role === role) return state.messages[i];
    return null;
  }

  function showEscalation() {
    if (document.getElementById('support-escalate')) {
      document.getElementById('support-escalate-email').focus();
      return;
    }
    var question = lastOf('user');
    if (!question) {
      addMessage({ role: 'agent', text: 'Type your question first, then you can send it to a person.' });
      ui.input.focus();
      return;
    }
    var answer = lastOf('agent');
    var form = el('form', 'background:' + C.white + ';border:1px solid ' + C.border + ';border-radius:12px;padding:12px;margin:0 0 10px;');
    form.id = 'support-escalate';
    form.setAttribute('novalidate', 'novalidate');
    var label = el('label', 'display:block;font-size:13px;font-weight:600;margin-bottom:6px;', 'Your email, so a person can reply');
    label.setAttribute('for', 'support-escalate-email');
    var email = el('input', 'width:100%;box-sizing:border-box;height:44px;padding:10px 12px;border:1px solid ' + C.border + ';border-radius:8px;font-size:16px;font-family:inherit;color:' + C.navy + ';');
    email.id = 'support-escalate-email';
    email.type = 'email';
    email.autocomplete = 'email';
    email.maxLength = 254;
    email.value = readStore('localStorage', EMAIL_KEY) || '';
    var note = el('p', 'font-size:12px;color:' + C.text2 + ';margin:8px 0;', 'This sends your last question and the answer you got to MMT support.');
    var status = el('p', 'font-size:13px;margin:0 0 8px;display:none;');
    status.setAttribute('role', 'status');
    var submit = el('button', 'background:' + C.navy + ';color:#FFFFFF;border:none;border-radius:8px;padding:10px 16px;min-height:44px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;', 'Send to a person');
    submit.type = 'submit';
    form.appendChild(label);
    form.appendChild(email);
    form.appendChild(note);
    form.appendChild(status);
    form.appendChild(submit);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var address = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        status.textContent = 'Enter an email address a person can reply to.';
        status.style.display = 'block';
        status.style.fontWeight = '600';
        email.setAttribute('aria-invalid', 'true');
        email.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Sending';
      post({ action: 'escalate', question: question.text, answer: answer ? answer.text : '', email: address }).then(function (res) {
        form.remove();
        addMessage({
          role: 'agent',
          text: res.data.sent === true
            ? 'Sent to MMT support, with ' + address + ' as the address to reply to.'
            : (typeof res.data.error === 'string' && res.data.error ? res.data.error : FAILED)
        });
      }).catch(function () {
        form.remove();
        addMessage({ role: 'agent', text: FAILED });
      });
    });
    ui.log.appendChild(form);
    scrollToEnd();
    email.focus();
  }

  function init() {
    restore();
    build();
    if (state.messages.length) {
      state.messages.forEach(renderMessage);
      ui.starters.style.display = 'none';
    } else {
      renderMessage({ role: 'agent', text: WELCOME });
    }
    if (state.open) setOpen(true, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
