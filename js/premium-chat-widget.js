// premium-chat-widget.js — Ask MMT, the research assistant
//
// Two mounts, one widget:
//   - EMBED: if the page has #mmt-ask-embed (the /ask landing page), the
//     panel renders inline there for anyone. Free visitors get an answer,
//     then an email gate that unlocks the sources. Members get their
//     allowance because the widget sends their sign-in token.
//   - FLOATING: on every other page, a floating button for Premium members
//     (mmtIsPremium() from mmt-paywall.js). Non-members see nothing here;
//     the public door is /ask.
//
// Calls /.netlify/functions/premium-chat. Sends { question, token, email,
// history }. The server decides the caller class from the token, never from
// the email alone. Every answer renders its `sources` list.
//
// Colors come from the site tokens (var(--mmt-navy) etc.) with the canonical
// light-theme fallbacks, so the widget follows tokens.css.
(function () {
  'use strict';

  if (window.__mmtPremiumChatMounted) return;
  window.__mmtPremiumChatMounted = true;

  var STORAGE_KEY = 'mmt_premium_chat_history';
  var FREE_EMAIL_KEY = 'mmt_ask_free_email';
  var TOKEN_KEY = 'mmt_subscriber_token';
  var MAX_LOCAL_TURNS = 30;
  var HISTORY_TURNS = 2;
  var ENDPOINT = '/.netlify/functions/premium-chat';

  var C = {
    navy: 'var(--mmt-navy, #0A192F)',
    teal: 'var(--mmt-teal, #457B9D)',
    white: 'var(--mmt-white, #FFFFFF)',
    soft: 'var(--mmt-soft, #F3F4F6)',
    border: 'var(--mmt-border, #E5E7EB)',
    text2: 'var(--mmt-text-secondary, #6B7280)',
    red: 'var(--mmt-red, #E63946)'
  };

  var SAMPLE_QUESTIONS =
    "- *What's the status of CCN Next Gen?*\n" +
    "- *Who are the incumbents on T4NG2?*\n" +
    "- *What's moving in DHA's FY2027 IT budget?*";

  function ls(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (_) { /* quota */ } }

  function track(name, props) {
    try { if (typeof window.plausible === 'function') window.plausible(name, props ? { props: props } : undefined); } catch (_) { /* noop */ }
  }

  function getToken() { return ls(TOKEN_KEY); }
  function getMemberEmail() {
    return ls('mmt_email') || ls('mmt_premium_email') || ls('mmt_subscriber_email') || (window.mmtCurrentUser && window.mmtCurrentUser.email) || '';
  }
  function getFreeEmail() { return ls(FREE_EMAIL_KEY); }

  function isPremiumUser() {
    try {
      if (typeof window.mmtIsPremium === 'function') return !!window.mmtIsPremium();
      if (localStorage.getItem('mmt_premium') === 'true') return true;
      if (/(?:^|;\s*)mmt_premium=true/.test(document.cookie)) return true;
      if (window.location.pathname.indexOf('/premium/') === 0) return true;
    } catch (_) { /* noop */ }
    return false;
  }

  function loadHistory() {
    try { var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (_) { return []; }
  }
  function saveHistory(history) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_LOCAL_TURNS))); } catch (_) { /* quota */ }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Minimal inline markdown to HTML for chat bubbles.
  function mdToHtml(md) {
    var s = escapeHtml(md);
    s = s
      .replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 4px;font-size:13px;">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:14px;">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:' + C.teal + ';">$1</a>')
      .replace(/^- (.+)$/gm, '<li style="margin:2px 0;">$1</li>');
    s = s.replace(/(<li[^>]*>.+<\/li>\n?)+/g, function (list) {
      return '<ul style="margin:6px 0 8px;padding-left:18px;">' + list + '</ul>';
    });
    s = s.replace(/\n{2,}/g, '</p><p style="margin:0 0 8px;">');
    return '<p style="margin:0 0 8px;">' + s + '</p>';
  }

  function sourcesHtml(sources) {
    if (!sources || !sources.length) return '';
    var rows = sources.map(function (src) {
      if (src.kind === 'article') {
        return '<li style="margin:0 0 4px;"><a href="' + escapeHtml(src.url) + '" target="_blank" rel="noopener" style="color:' + C.teal + ';font-weight:600;">' + escapeHtml(src.title || 'MMT article') + '</a>' +
          (src.date ? ' <span style="color:' + C.text2 + ';">(Mission Meets Tech, ' + escapeHtml(src.date) + ')</span>' : '') + '</li>';
      }
      var links = (src.links || []).slice(0, 4).map(function (u, i) {
        return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener" style="color:' + C.teal + ';">record ' + (i + 1) + '</a>';
      }).join(' · ');
      return '<li style="margin:0 0 4px;"><a href="' + escapeHtml(src.url) + '" target="_blank" rel="noopener" style="color:' + C.navy + ';font-weight:600;">' + escapeHtml(src.name) + '</a>' +
        (src.mode === 'live' ? ' <span style="color:' + C.text2 + ';">live query</span>' : '') +
        (links ? ' <span style="color:' + C.text2 + ';">·</span> ' + links : '') + '</li>';
    }).join('');
    return '<div style="margin-top:10px;padding-top:8px;border-top:1px solid ' + C.border + ';">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:' + C.text2 + ';margin-bottom:4px;">Sources (' + sources.length + ')</div>' +
      '<ul style="list-style:none;margin:0;padding:0;font-size:12px;line-height:1.45;">' + rows + '</ul>' +
      '<div style="margin-top:6px;font-size:11px;"><a href="/ask/sources" style="color:' + C.text2 + ';">What Ask MMT reads &rarr;</a></div>' +
      '</div>';
  }

  function blurredSourcesHtml(count) {
    var n = Math.max(count || 0, 1);
    var rows = '';
    for (var i = 0; i < Math.min(n, 4); i++) {
      rows += '<li style="margin:0 0 6px;height:12px;width:' + (60 + (i * 9) % 30) + '%;background:' + C.border + ';border-radius:4px;filter:blur(2px);"></li>';
    }
    return '<div style="margin-top:10px;padding-top:8px;border-top:1px solid ' + C.border + ';">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:' + C.text2 + ';margin-bottom:6px;">Sources (' + n + ')</div>' +
      '<ul style="list-style:none;margin:0;padding:0;">' + rows + '</ul></div>';
  }

  function pricingHref(content) {
    return '/pricing?utm_source=askmmt&utm_medium=widget&utm_campaign=ask-mmt-2026&utm_content=' + encodeURIComponent(content || 'widget');
  }

  function buildPanel(opts) {
    var embed = !!opts.embed;
    var panel = document.createElement('div');
    panel.id = 'mmt-premium-chat-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Ask MMT, research assistant');
    panel.style.cssText = embed
      ? 'width:100%;height:600px;max-height:80vh;background:' + C.white + ';border:1px solid ' + C.border + ';border-radius:16px;display:flex;flex-direction:column;overflow:hidden;font-family:Inter,-apple-system,sans-serif;box-shadow:0 8px 28px rgba(10,25,47,0.08);'
      : 'position:fixed;bottom:' + opts.panelBottom + ';right:24px;width:420px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 200px);background:' + C.white + ';border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.15);z-index:9998;display:none;flex-direction:column;overflow:hidden;font-family:Inter,-apple-system,sans-serif;';

    var header = document.createElement('div');
    header.style.cssText = 'padding:14px 18px;background:' + C.navy + ';color:#FFFFFF;display:flex;align-items:center;justify-content:space-between;gap:12px;';
    header.innerHTML =
      '<div>' +
      '<div style="font-size:15px;font-weight:700;">Ask MMT <span style="color:' + C.teal + ';">&#9733;</span></div>' +
      '<div style="font-size:12px;opacity:0.8;">Federal health IT research from live federal data and Mary\'s articles</div>' +
      '</div>';
    var meter = document.createElement('div');
    meter.id = 'mmt-ask-meter';
    meter.style.cssText = 'font-size:11px;opacity:0.85;white-space:nowrap;';
    header.appendChild(meter);
    if (!embed) {
      var closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Close Ask MMT');
      closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:0 4px;line-height:1;';
      header.appendChild(closeBtn);
      panel.__closeBtn = closeBtn;
    }

    var msgArea = document.createElement('div');
    msgArea.id = 'mmt-premium-chat-messages';
    msgArea.style.cssText = 'flex:1;overflow-y:auto;padding:16px 18px;background:#F9FAFB;';

    var inputArea = document.createElement('div');
    inputArea.style.cssText = 'padding:10px 14px 6px;border-top:1px solid ' + C.border + ';display:flex;gap:8px;align-items:flex-end;background:' + C.white + ';';
    var textarea = document.createElement('textarea');
    textarea.id = 'mmt-premium-chat-input';
    textarea.rows = 2;
    textarea.setAttribute('aria-label', 'Your question');
    textarea.placeholder = 'Ask about a contract, vehicle, agency, budget line, or trend. Enter to send.';
    textarea.style.cssText = 'flex:1;padding:10px 12px;border:1px solid ' + C.border + ';border-radius:8px;font-size:14px;font-family:inherit;resize:none;outline:none;line-height:1.4;color:' + C.navy + ';';
    var sendBtn = document.createElement('button');
    sendBtn.textContent = 'Ask';
    sendBtn.style.cssText = 'padding:10px 16px;background:' + C.teal + ';color:#FFFFFF;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;white-space:nowrap;';
    inputArea.appendChild(textarea);
    inputArea.appendChild(sendBtn);

    var footer = document.createElement('div');
    footer.style.cssText = 'padding:0 14px 10px;font-size:11px;color:' + C.text2 + ';background:' + C.white + ';';
    footer.textContent = 'Sourced research. Verify before you bid.';

    panel.appendChild(header);
    panel.appendChild(msgArea);
    panel.appendChild(inputArea);
    panel.appendChild(footer);

    return { panel: panel, msgArea: msgArea, textarea: textarea, sendBtn: sendBtn, meter: meter };
  }

  function createWidget(opts) {
    var embed = !!opts.embed;
    var hasDashNav = !!document.querySelector('.dash-nav') && window.matchMedia('(max-width:768px)').matches;
    var fabBottom = hasDashNav ? '192px' : '92px';
    var panelBottom = hasDashNav ? '260px' : '160px';

    var ui = buildPanel({ embed: embed, panelBottom: panelBottom });
    var panel = ui.panel, msgArea = ui.msgArea, textarea = ui.textarea, sendBtn = ui.sendBtn, meter = ui.meter;
    var pendingQuestion = null;

    if (embed) {
      opts.host.innerHTML = '';
      opts.host.appendChild(panel);
    } else {
      var btn = document.createElement('button');
      btn.id = 'mmt-premium-chat-fab';
      btn.setAttribute('aria-label', 'Ask MMT, research assistant');
      btn.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.5.25-.9.6-1 1.2v1"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>';
      btn.style.cssText =
        'position:fixed;bottom:' + fabBottom + ';right:24px;width:52px;height:52px;border-radius:50%;' +
        'background:' + C.navy + ';color:#FFFFFF;border:2px solid ' + C.teal + ';cursor:pointer;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:9998;display:flex;align-items:center;justify-content:center;transition:transform 0.2s;';
      btn.addEventListener('mouseenter', function () { btn.style.transform = 'scale(1.08)'; });
      btn.addEventListener('mouseleave', function () { btn.style.transform = 'scale(1)'; });
      var badge = document.createElement('span');
      badge.textContent = '★';
      badge.setAttribute('aria-hidden', 'true');
      badge.style.cssText = 'position:absolute;top:-4px;right:-4px;background:' + C.teal + ';color:#fff;width:18px;height:18px;border-radius:50%;font-size:11px;display:flex;align-items:center;justify-content:center;';
      btn.appendChild(badge);
      document.body.appendChild(btn);
      document.body.appendChild(panel);

      var togglePanel = function (forceOpen) {
        var open = panel.style.display === 'flex';
        if (forceOpen === true && open) return;
        panel.style.display = open ? 'none' : 'flex';
        if (!open) { renderHistory(); setTimeout(function () { textarea.focus(); }, 50); }
      };
      btn.addEventListener('click', function () { togglePanel(); });
      panel.__closeBtn.addEventListener('click', function () { togglePanel(); });
      window.mmtOpenAskMMT = function () { togglePanel(true); };
    }

    function setMeter(data) {
      if (!data || typeof data.remaining !== 'number' || !data.cap) { meter.textContent = ''; return; }
      meter.textContent = data.remaining + ' of ' + data.cap + ' left this month';
    }

    function addBubble(role, content, meta) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin:0 0 14px;display:flex;' + (role === 'user' ? 'justify-content:flex-end;' : '');
      var bubble = document.createElement('div');
      bubble.style.cssText =
        'max-width:88%;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.5;' +
        (role === 'user' ? 'background:' + C.navy + ';color:#FFFFFF;' : 'background:' + C.white + ';color:' + C.navy + ';border:1px solid ' + C.border + ';');
      if (role === 'assistant') {
        bubble.innerHTML = mdToHtml(content);
        if (meta && meta.agency) {
          var tag = document.createElement('div');
          tag.style.cssText = 'margin-top:8px;font-size:11px;color:' + C.text2 + ';letter-spacing:0.04em;text-transform:uppercase;';
          tag.textContent = 'Scope: ' + meta.agency + (meta.hasData === false ? ' · limited API data' : '');
          bubble.appendChild(tag);
        }
        if (meta && meta.sources && meta.sources.length) {
          var src = document.createElement('div');
          src.innerHTML = sourcesHtml(meta.sources);
          bubble.appendChild(src);
        }
      } else {
        bubble.textContent = content;
      }
      wrap.appendChild(bubble);
      msgArea.appendChild(wrap);
      msgArea.scrollTop = msgArea.scrollHeight;
      return { wrap: wrap, bubble: bubble };
    }

    function addCard(html) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin:0 0 14px;';
      var card = document.createElement('div');
      card.style.cssText = 'padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.5;background:' + C.soft + ';border:1px solid ' + C.border + ';color:' + C.navy + ';';
      card.innerHTML = html;
      wrap.appendChild(card);
      msgArea.appendChild(wrap);
      msgArea.scrollTop = msgArea.scrollHeight;
      return card;
    }

    function greeting() {
      if (getToken() && isPremiumUser()) {
        return "I'm the MMT Premium research assistant. I answer from SAM.gov, USASpending, Congress.gov, PubMed, and Mary's articles, and I show my sources. Try:\n" + SAMPLE_QUESTIONS;
      }
      return "I'm the MMT research assistant. I answer from SAM.gov, USASpending, Congress.gov, PubMed, and Mary's articles, and I show my sources. You have 3 free questions this month. Try:\n" + SAMPLE_QUESTIONS;
    }

    function renderHistory() {
      msgArea.innerHTML = '';
      var history = loadHistory();
      if (history.length === 0) { addBubble('assistant', greeting()); return; }
      history.forEach(function (turn) {
        addBubble('user', turn.question);
        addBubble('assistant', turn.answer, turn.meta);
      });
    }

    function recentHistory() {
      return loadHistory().slice(-HISTORY_TURNS).map(function (t) { return { question: t.question, answer: t.answer }; });
    }

    function emailForm(labelHtml, buttonText, onSubmit) {
      var card = addCard(labelHtml +
        '<form style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
        '<input type="email" required placeholder="you@company.com" aria-label="Email address" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid ' + C.border + ';border-radius:6px;font-size:13px;font-family:inherit;">' +
        '<button type="submit" style="padding:8px 12px;background:' + C.navy + ';color:#fff;border:none;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;">' + buttonText + '</button>' +
        '</form>' +
        '<div style="margin-top:6px;font-size:11px;color:' + C.text2 + ';">Also puts you on the Tuesday and Friday list. No sponsors. Unsubscribe anytime.</div>');
      var form = card.querySelector('form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = form.querySelector('input').value.trim().toLowerCase();
        if (!email) return;
        var b = form.querySelector('button');
        b.disabled = true; b.textContent = '...';
        onSubmit(email, card, function () { b.disabled = false; b.textContent = buttonText; });
      });
      return card;
    }

    function unlock(unlockId, email, card, bubble, done) {
      track('ask_email_submit');
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlock', turn_id: unlockId, email: email })
      })
        .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
        .then(function (r) {
          if (r.status !== 200) { card.innerHTML = '<span style="color:' + C.red + ';">' + escapeHtml(r.data.error || 'Could not unlock. Try again.') + '</span>'; done(); return; }
          lsSet(FREE_EMAIL_KEY, email);
          var blurred = bubble.querySelector('[data-blurred]');
          if (blurred) blurred.innerHTML = sourcesHtml(r.data.sources);
          var history = loadHistory();
          if (history.length) { history[history.length - 1].meta.sources = r.data.sources; saveHistory(history); }
          setMeter(r.data);
          card.innerHTML = 'Sources unlocked. You have ' + r.data.remaining + ' free question' + (r.data.remaining === 1 ? '' : 's') + ' left this month. They reset on the 1st.';
        })
        .catch(function (err) { card.innerHTML = '<span style="color:' + C.red + ';">Network error: ' + escapeHtml(err.message) + '</span>'; done(); });
    }

    function showLimit(data) {
      track('ask_limit_hit', { mode: data.mode || 'free' });
      var cap = data.cap || 3;
      var premiumLine = data.mode === 'member'
        ? 'Your Premium allowance is ' + cap + ' a month. Email <a href="mailto:mary@missionmeetstech.com" style="color:' + C.teal + ';">Mary</a> if you need more.'
        : 'Premium members get 100 a month, plus the full capture toolkit.';
      var buttons = data.mode === 'member' ? '' :
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">' +
        '<a href="' + pricingHref('limit') + '" data-premium-click style="padding:8px 12px;background:' + C.navy + ';color:#fff;border-radius:6px;font-weight:600;font-size:13px;text-decoration:none;">Go Premium</a>' +
        '<button type="button" data-remind style="padding:8px 12px;background:' + C.white + ';color:' + C.navy + ';border:1px solid ' + C.border + ';border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;">Remind me on the 1st</button>' +
        '</div>';
      var card = addCard("You've used your " + cap + ' ' + (data.mode === 'member' ? '' : 'free ') + 'questions this month. They reset on the 1st. ' + premiumLine + buttons);
      var remind = card.querySelector('[data-remind]');
      if (remind) remind.addEventListener('click', function () {
        remind.disabled = true;
        remind.textContent = getFreeEmail() ? 'Done. The reset note lands on the 1st.' : 'Enter your email above and the reset note will find you.';
      });
      var pc = card.querySelector('[data-premium-click]');
      if (pc) pc.addEventListener('click', function () { track('ask_premium_click', { from: 'limit' }); });
    }

    function handleAnswer(question, r) {
      var data = r.data;
      var meta = { agency: data.agency, hasData: data.hasData, sources: data.sources || [] };
      var out = addBubble('assistant', data.answer, meta);
      setMeter(data);
      var history = loadHistory();
      history.push({ question: question, answer: data.answer, meta: meta, ts: Date.now() });
      saveHistory(history);

      if (data.gated) {
        track('ask_gated');
        var holder = document.createElement('div');
        holder.setAttribute('data-blurred', '1');
        holder.innerHTML = blurredSourcesHtml(data.sources_count);
        out.bubble.appendChild(holder);
        var n = data.sources_count || 0;
        emailForm('That answer came from ' + n + ' source' + (n === 1 ? '' : 's') + '. Enter your email to see them and keep your remaining free questions.', 'Show me the sources',
          function (email, card, done) {
            if (!data.unlock_id) { lsSet(FREE_EMAIL_KEY, email); card.innerHTML = 'Saved. Ask again and the sources will show.'; done(); return; }
            unlock(data.unlock_id, email, out.bubble, card, done);
          });
      }
      if (data.hint && /^token_/.test(data.hint) && isPremiumUser()) {
        addCard('Your sign-in has expired, so this counted as a free question. <a href="/dashboard.html" style="color:' + C.teal + ';font-weight:600;">Sign in again</a> to use your Premium allowance.');
      }
    }

    function handleError(question, r) {
      var data = r.data || {};
      var code = data.reason_code || '';
      if (code === 'FREE_LIMIT' || code === 'MEMBER_LIMIT') { showLimit(data); return; }
      if (code === 'EMAIL_REQUIRED') {
        pendingQuestion = question;
        emailForm('Enter your email to keep asking. Three questions a month, free.', 'Ask', function (email, card, done) {
          lsSet(FREE_EMAIL_KEY, email);
          card.innerHTML = 'Thanks. Asking now.';
          var q = pendingQuestion; pendingQuestion = null;
          if (q) postQuestion(q);
          done();
        });
        return;
      }
      if (code === 'FREE_TIER_CLOSED') {
        addCard(escapeHtml(data.error) + ' <a href="' + pricingHref('closed') + '" style="color:' + C.teal + ';font-weight:600;">See Premium</a>');
        return;
      }
      addBubble('assistant', data.error || 'Something went wrong. Try again.');
    }

    function postQuestion(question) {
      sendBtn.disabled = true;
      sendBtn.textContent = '...';
      var thinking = addBubble('assistant', '_Reading the sources..._');
      var body = { question: question, history: recentHistory() };
      var token = getToken();
      if (token) { body.token = token; body.email = getMemberEmail() || undefined; }
      else if (getFreeEmail()) { body.email = getFreeEmail(); }
      track('ask_started', { mode: token ? 'member' : (body.email ? 'free' : 'anonymous') });

      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
        .then(function (r) {
          msgArea.removeChild(thinking.wrap);
          if (r.status === 200) handleAnswer(question, r); else handleError(question, r);
        })
        .catch(function (err) {
          if (thinking.wrap.parentNode) msgArea.removeChild(thinking.wrap);
          addBubble('assistant', 'Network error: ' + err.message);
        })
        .then(function () { sendBtn.disabled = false; sendBtn.textContent = 'Ask'; });
    }

    function send() {
      var question = textarea.value.trim();
      if (!question) return;
      textarea.value = '';
      addBubble('user', question);
      postQuestion(question);
    }

    sendBtn.addEventListener('click', send);
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    if (embed) {
      renderHistory();
      var params = new URLSearchParams(window.location.search);
      var q = params.get('q');
      if (q) textarea.value = q.slice(0, 500);
    }
  }

  function attemptMount(attempt) {
    var host = document.getElementById('mmt-ask-embed');
    if (host) { createWidget({ embed: true, host: host }); return; }
    if (isPremiumUser()) { createWidget({ embed: false }); return; }
    // Paywall may not have finished reading auth state on first tick.
    if (attempt < 6) setTimeout(function () { attemptMount(attempt + 1); }, 500);
    else window.mmtOpenAskMMT = function () { window.location.href = '/ask'; };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { attemptMount(0); });
  } else {
    attemptMount(0);
  }
})();
