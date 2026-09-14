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
// the email alone. Every answer renders its `sources` list, the systems that
// could not be checked, a Copy button and a feedback pair.
//
// Numbers in copy (caps, remaining) come from the server response, never
// from a literal in this file. When no cap is known yet the wording carries
// no number.
//
// Colors come from the site tokens (var(--mmt-navy) etc.) with the canonical
// light-theme fallbacks, so the widget follows tokens.css.
(function () {
  'use strict';

  if (window.__mmtPremiumChatMounted) return;
  window.__mmtPremiumChatMounted = true;

  var STORAGE_KEY = 'mmt_premium_chat_history';
  var METER_KEY = 'mmt_ask_meter';
  var FREE_EMAIL_KEY = 'mmt_ask_free_email';
  var TOKEN_KEY = 'mmt_subscriber_token';
  var MAX_LOCAL_TURNS = 30;
  var HISTORY_TURNS = 2;
  var ENDPOINT = '/.netlify/functions/premium-chat';
  var REQUEST_TIMEOUT_MS = 55000;
  var STATUS_STEPS = [
    [0, 'Reading the MMT archive'],
    [2500, 'Querying USASpending, SAM.gov and the other federal systems'],
    [7000, 'Writing the answer from what came back'],
    [20000, 'Still working. Federal APIs can be slow; this usually finishes within 30 seconds']
  ];

  var C = {
    navy: 'var(--mmt-navy, #0A192F)',
    teal: 'var(--mmt-teal, #457B9D)',
    white: 'var(--mmt-white, #FFFFFF)',
    soft: 'var(--mmt-soft, #F3F4F6)',
    border: 'var(--mmt-border, #E5E7EB)',
    text2: 'var(--mmt-text-secondary, #6B7280)',
    red: 'var(--mmt-red, #E63946)'
  };

  var SAMPLE_QUESTIONS = [
    "What's the status of CCN Next Gen?",
    'Who are the incumbents on T4NG2?',
    "What's moving in DHA's FY2027 IT budget?"
  ];

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function ls(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (_) { /* quota */ } }
  function lsDel(key) { try { localStorage.removeItem(key); } catch (_) { /* noop */ } }

  function track(name, props) {
    try { if (typeof window.plausible === 'function') window.plausible(name, props ? { props: props } : undefined); } catch (_) { /* noop */ }
  }

  function isPremiumUser() {
    try {
      if (typeof window.mmtIsPremium === 'function') return !!window.mmtIsPremium();
      if (localStorage.getItem('mmt_premium') === 'true') return true;
      if (/(?:^|;\s*)mmt_premium=true/.test(document.cookie)) return true;
      if (window.location.pathname.indexOf('/premium/') === 0) return true;
    } catch (_) { /* noop */ }
    return false;
  }

  // The token rides along only when the paywall says this browser holds a
  // Premium session. A leftover token from an expired sign-in is never sent
  // on its own; the server would reject it and the free tier would count.
  function getToken() { return isPremiumUser() ? ls(TOKEN_KEY) : ''; }
  function getMemberEmail() {
    return ls('mmt_email') || ls('mmt_premium_email') || ls('mmt_subscriber_email') || (window.mmtCurrentUser && window.mmtCurrentUser.email) || '';
  }
  function getFreeEmail() { return ls(FREE_EMAIL_KEY); }

  function loadHistory() {
    try { var raw = localStorage.getItem(STORAGE_KEY); var h = raw ? JSON.parse(raw) : []; return Array.isArray(h) ? h : []; } catch (_) { return []; }
  }
  function saveHistory(history) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_LOCAL_TURNS))); } catch (_) { /* quota */ }
  }

  function monthKey(ts) { var d = new Date(ts); return d.getUTCFullYear() + '-' + d.getUTCMonth(); }
  // { remaining, cap, mode, ts }. Dropped when the month rolls over, since the
  // server resets counts on the 1st and a stale meter would say otherwise.
  function loadMeter() {
    try {
      var raw = localStorage.getItem(METER_KEY);
      if (!raw) return null;
      var m = JSON.parse(raw);
      if (!m || typeof m.remaining !== 'number' || typeof m.cap !== 'number' || !m.ts) return null;
      if (monthKey(m.ts) !== monthKey(Date.now())) { lsDel(METER_KEY); return null; }
      return m;
    } catch (_) { return null; }
  }
  function saveMeter(data) {
    if (!data || typeof data.remaining !== 'number' || typeof data.cap !== 'number' || !data.cap) return;
    lsSet(METER_KEY, JSON.stringify({ remaining: data.remaining, cap: data.cap, mode: data.mode || null, ts: Date.now() }));
  }

  // Caps rendered into the page by build.js (from ask-mmt-access.js), so a
  // free visitor can be told the Premium number without it living here.
  function pageCap(name) {
    var host = document.getElementById('ask');
    var v = host && host.getAttribute('data-cap-' + name);
    var n = v ? parseInt(v, 10) : 0;
    return n > 0 ? n : 0;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 2026-09-13 -> Sep 13, 2026. Anything else is returned as written.
  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return String(s || '');
    var mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    if (mo < 1 || mo > 12) return String(s);
    return MONTHS[mo - 1] + ' ' + d + ', ' + m[1];
  }

  var LINK_STYLE = 'color:' + C.teal + ';text-decoration:underline;';

  // Inline markdown on already-escaped text: bold, links, bare URLs, italics.
  function inlineMd(s) {
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="' + LINK_STYLE + '">$1</a>');
    s = s.replace(/(^|[^"'>=\w\/])(https?:\/\/[^\s<]*[^\s<.,;:)\]"'])/g, '$1<a href="$2" target="_blank" rel="noopener" style="' + LINK_STYLE + '">$2</a>');
    // Italics run only outside anchors: a USASpending id like
    // CONT_AWD_..._-NONE-_-NONE- must never lose its underscores to <em>.
    return s.split(/(<a [^>]*>[\s\S]*?<\/a>)/).map(function (part, i) {
      if (i % 2 === 1) return part;
      return part
        .replace(/(^|[^\w*])\*([^*\n]+?)\*(?![\w*])/g, '$1<em>$2</em>')
        .replace(/(^|[^\w_])_([^_\n]+?)_(?![\w_])/g, '$1<em>$2</em>');
    }).join('');
  }

  function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }
  function isTableSep(line) { return /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line); }
  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
  }
  function tableHtml(head, rows) {
    var cell = 'padding:6px 8px;border:1px solid ' + C.border + ';text-align:left;vertical-align:top;overflow-wrap:normal;word-break:normal;';
    var th = head.map(function (c) { return '<th style="' + cell + 'font-weight:700;background:' + C.soft + ';">' + inlineMd(c) + '</th>'; }).join('');
    var body = rows.map(function (r) {
      return '<tr>' + head.map(function (_, i) { return '<td style="' + cell + '">' + inlineMd(r[i] || '') + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div data-table-scroll style="overflow-x:auto;max-width:100%;margin:8px 0;">' +
      '<table style="border-collapse:collapse;font-size:13px;line-height:1.4;min-width:100%;"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  // Markdown to HTML for chat bubbles: headings, pipe tables, bulleted and
  // numbered lists, bold, italics (both markers), links and bare URLs.
  function mdToHtml(md) {
    var s = escapeHtml(md).replace(/\r/g, '');
    var tables = [];
    var lines = s.split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var head = splitRow(line);
        var rows = [];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        i--;
        tables.push(tableHtml(head, rows));
        out.push('\u0001T' + (tables.length - 1) + '\u0001');
        continue;
      }
      out.push(line);
    }
    s = out.join('\n');
    s = s
      .replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 4px;font-size:13px;">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:14px;">$1</h3>')
      .replace(/^# (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:14px;">$1</h3>')
      .replace(/^[ \t]*\d+[.)] (.+)$/gm, '<li data-ol style="margin:2px 0;">$1</li>')
      .replace(/^[ \t]*[-*•] (.+)$/gm, '<li style="margin:2px 0;">$1</li>');
    s = s.replace(/(?:<li data-ol[^>]*>.*<\/li>\n?)+/g, function (list) {
      return '<ol style="list-style:decimal;margin:6px 0 8px;padding-left:22px;">' + list + '</ol>';
    });
    s = s.replace(/(?:<li style[^>]*>.*<\/li>\n?)+/g, function (list) {
      return '<ul style="list-style:disc;margin:6px 0 8px;padding-left:18px;">' + list + '</ul>';
    });
    s = inlineMd(s);
    s = s.replace(/\n{2,}/g, '</p><p style="margin:0 0 8px;">');
    s = '<p style="margin:0 0 8px;">' + s + '</p>';
    s = s.replace(/\u0001T(\d+)\u0001/g, function (_, n) { return '</p>' + tables[parseInt(n, 10)] + '<p style="margin:0 0 8px;">'; });
    // Lists and headings are blocks: close the paragraph around them and
    // reopen one for any text that follows, so nothing nests inside <p>.
    s = s.replace(/([^>\n])\n(?=<(?:ol|ul|h3|h4)\b)/g, '$1</p>');
    s = s.replace(/<p style="margin:0 0 8px;">\s*(?=<(?:ol|ul|h3|h4)\b)/g, '');
    s = s.replace(/(<\/(?:ol|ul|h3|h4)>)\s*<\/p>/g, '$1');
    s = s.replace(/(<\/(?:ol|ul|h3|h4)>)\n+(?=[^<\s])/g, '$1<p style="margin:0 0 8px;">');
    s = s.replace(/<p style="margin:0 0 8px;">\s*<\/p>/g, '');
    return s;
  }

  function linkEntry(l, i) {
    if (l && typeof l === 'object') return { url: l.url || '', label: l.label || ('record ' + (i + 1)) };
    return { url: String(l || ''), label: 'record ' + (i + 1) };
  }

  function sourcesHtml(sources) {
    if (!sources || !sources.length) return '';
    var rows = sources.map(function (src) {
      if (src.kind === 'article') {
        return '<li style="margin:0 0 4px;"><a href="' + escapeHtml(src.url) + '" target="_blank" rel="noopener" style="color:' + C.teal + ';font-weight:600;">' + escapeHtml(src.title || 'MMT article') + '</a>' +
          ' <span style="color:' + C.text2 + ';">(Mission Meets Tech' + (src.date ? ', ' + escapeHtml(fmtDate(src.date)) : '') + ')</span></li>';
      }
      var links = (src.links || []).slice(0, 4).map(function (l, i) {
        var e = linkEntry(l, i);
        if (!e.url) return '';
        return '<a href="' + escapeHtml(e.url) + '" target="_blank" rel="noopener" style="color:' + C.teal + ';">' + escapeHtml(e.label) + '</a>';
      }).filter(Boolean).join(' · ');
      return '<li style="margin:0 0 4px;"><a href="' + escapeHtml(src.url) + '" target="_blank" rel="noopener" style="color:' + C.navy + ';font-weight:600;">' + escapeHtml(src.name) + '</a>' +
        (src.mode === 'live' ? ' <span style="color:' + C.text2 + ';">live query</span>' : '') +
        (src.mode === 'fallback' ? ' <span style="color:#92400E;">web search, verify on the page</span>' : '') +
        (src.queried_at ? ' <span style="color:' + C.text2 + ';">' + escapeHtml(fmtDate(src.queried_at)) + '</span>' : '') +
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
    return '<div data-blurred style="margin-top:10px;padding-top:8px;border-top:1px solid ' + C.border + ';">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:' + C.text2 + ';margin-bottom:6px;">Sources (' + n + ')</div>' +
      '<ul style="list-style:none;margin:0;padding:0;">' + rows + '</ul></div>';
  }

  // Systems queried this turn that did not answer. Navy text; the only red
  // is the glyph, so the block reads as a caveat rather than an error.
  function notCheckedHtml(unavailable) {
    if (!unavailable || !unavailable.length) return '';
    var items = unavailable.map(function (u) {
      return '<li style="margin:2px 0;">' + escapeHtml(u.name || u.id) + (u.reason ? ': ' + escapeHtml(u.reason) : '') + '</li>';
    }).join('');
    return '<div data-notchecked style="margin-top:10px;padding:8px 10px;border-radius:8px;background:' + C.soft + ';color:' + C.navy + ';font-size:12px;line-height:1.45;">' +
      '<div style="font-weight:700;"><span aria-hidden="true" style="color:' + C.red + ';margin-right:4px;">&#9650;</span>Could not check this turn</div>' +
      '<ul style="list-style:disc;margin:4px 0 0;padding-left:18px;">' + items + '</ul>' +
      '<div style="margin-top:4px;color:' + C.text2 + ';">Their silence is not a "no". Check them directly if the answer depends on them.</div>' +
      '</div>';
  }

  function pricingHref(content) {
    return '/pricing?utm_source=askmmt&utm_medium=widget&utm_campaign=ask-mmt-2026&utm_content=' + encodeURIComponent(content || 'widget');
  }

  function copyTextFor(turn) {
    var meta = turn.meta || {};
    var lines = ['Question: ' + turn.question, '', 'Answer:', turn.answer || '', ''];
    var srcs = meta.sources || [];
    if (srcs.length) {
      lines.push('Sources:');
      srcs.forEach(function (s) {
        if (s.kind === 'article') {
          lines.push('- Mission Meets Tech: ' + (s.title || 'MMT article') + (s.date ? ' (' + fmtDate(s.date) + ')' : '') + ' ' + (s.url || ''));
        } else {
          var links = (s.links || []).map(function (l, i) { var e = linkEntry(l, i); return e.url ? e.label + ' ' + e.url : ''; }).filter(Boolean);
          lines.push('- ' + (s.name || s.id) + ' ' + (s.url || '') + (links.length ? '\n  ' + links.join('\n  ') : ''));
        }
      });
    } else if (meta.gated) {
      lines.push('Sources: held until an email is entered.');
    }
    if (meta.unavailable && meta.unavailable.length) {
      lines.push('', 'Could not check this turn: ' + meta.unavailable.map(function (u) { return (u.name || u.id) + (u.reason ? ' (' + u.reason + ')' : ''); }).join('; '));
    }
    lines.push('', 'From Ask MMT, https://missionmeetstech.com/ask');
    return lines.join('\n');
  }

  var SMALL_BTN = 'min-height:32px;padding:4px 10px;background:' + C.white + ';color:' + C.navy + ';border:1px solid ' + C.border + ';border-radius:6px;font-size:12px;font-family:inherit;cursor:pointer;';
  var CARD_LINK = 'color:' + C.navy + ';text-decoration:underline;font-weight:600;';

  function buildPanel(opts) {
    var embed = !!opts.embed;
    var panel = document.createElement('div');
    panel.id = 'mmt-premium-chat-panel';
    panel.style.cssText = embed
      ? 'width:100%;max-width:100%;height:600px;max-height:80vh;background:' + C.white + ';border:1px solid ' + C.border + ';border-radius:16px;display:flex;flex-direction:column;overflow:hidden;font-family:Inter,-apple-system,sans-serif;box-shadow:0 8px 28px rgba(10,25,47,0.08);'
      : 'position:fixed;bottom:' + opts.panelBottom + ';right:24px;width:420px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 200px);background:' + C.white + ';border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.15);z-index:9998;display:none;flex-direction:column;overflow:hidden;font-family:Inter,-apple-system,sans-serif;';
    if (embed) {
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Ask MMT, research assistant');
    } else {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'false');
      panel.setAttribute('aria-labelledby', 'mmt-ask-title');
    }

    var header = document.createElement('div');
    header.style.cssText = 'padding:12px 16px;background:' + C.navy + ';color:#FFFFFF;display:flex;align-items:center;justify-content:space-between;gap:10px;';
    header.innerHTML =
      '<div style="min-width:0;">' +
      '<div id="mmt-ask-title" style="font-size:15px;font-weight:700;">Ask MMT <span style="color:' + C.teal + ';">&#9733;</span></div>' +
      (opts.narrow ? '' : '<div style="font-size:12px;opacity:0.8;">Federal health IT research from live federal data and Mary\'s articles</div>') +
      '</div>';
    var right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';
    var meter = document.createElement('div');
    meter.id = 'mmt-ask-meter';
    meter.style.cssText = 'font-size:12px;opacity:0.85;white-space:nowrap;';
    right.appendChild(meter);
    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.setAttribute('aria-label', 'Clear the conversation');
    clearBtn.style.cssText = 'background:none;border:1px solid rgba(255,255,255,0.4);color:#fff;font-size:12px;font-family:inherit;padding:4px 8px;border-radius:6px;cursor:pointer;min-height:28px;';
    right.appendChild(clearBtn);
    var closeBtn = null;
    if (!embed) {
      closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Close Ask MMT');
      closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:0 4px;line-height:1;';
      right.appendChild(closeBtn);
    }
    header.appendChild(right);

    var msgArea = document.createElement('div');
    msgArea.id = 'mmt-premium-chat-messages';
    msgArea.style.cssText = 'flex:1;min-width:0;overflow-y:auto;overflow-x:hidden;padding:16px 18px;background:#F9FAFB;overflow-wrap:anywhere;word-break:break-word;';

    var inputArea = document.createElement('div');
    inputArea.style.cssText = 'padding:10px 14px 6px;border-top:1px solid ' + C.border + ';display:flex;gap:8px;align-items:flex-end;background:' + C.white + ';';
    var textarea = document.createElement('textarea');
    textarea.id = 'mmt-premium-chat-input';
    textarea.rows = 2;
    textarea.setAttribute('aria-label', 'Your question');
    textarea.placeholder = 'Ask about a contract, vehicle, agency, budget line, or trend. Enter to send.';
    textarea.style.cssText = 'flex:1;min-width:0;padding:10px 12px;border:1px solid ' + C.border + ';border-radius:8px;font-size:14px;font-family:inherit;resize:none;outline:none;line-height:1.4;color:' + C.navy + ';';
    var sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = 'Ask';
    sendBtn.style.cssText = 'min-height:44px;padding:10px 16px;background:' + C.teal + ';color:#FFFFFF;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;font-family:inherit;white-space:nowrap;';
    inputArea.appendChild(textarea);
    inputArea.appendChild(sendBtn);

    var footer = document.createElement('div');
    footer.style.cssText = 'padding:0 14px 10px;font-size:12px;color:' + C.text2 + ';background:' + C.white + ';';
    footer.textContent = 'Sourced research. Verify before you bid.';

    panel.appendChild(header);
    panel.appendChild(msgArea);
    panel.appendChild(inputArea);
    panel.appendChild(footer);

    return { panel: panel, msgArea: msgArea, textarea: textarea, sendBtn: sendBtn, meter: meter, clearBtn: clearBtn, closeBtn: closeBtn };
  }

  function createWidget(opts) {
    var embed = !!opts.embed;
    var narrow = false;
    try { narrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width:768px)').matches; } catch (_) { narrow = false; }
    var hasDashNav = !!document.querySelector('.dash-nav') && narrow;
    var fabBottom = hasDashNav ? '192px' : '92px';
    var panelBottom = hasDashNav ? '260px' : '160px';

    var ui = buildPanel({ embed: embed, panelBottom: panelBottom, narrow: narrow });
    var panel = ui.panel, msgArea = ui.msgArea, textarea = ui.textarea, sendBtn = ui.sendBtn, meter = ui.meter;
    var pendingQuestion = null;
    var inFlight = false;
    var btn = null;

    if (embed) {
      opts.host.innerHTML = '';
      opts.host.appendChild(panel);
    } else {
      btn = document.createElement('button');
      btn.id = 'mmt-premium-chat-fab';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Ask MMT, research assistant');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'mmt-premium-chat-panel');
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
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        if (!open) { renderHistory(); setTimeout(function () { textarea.focus(); }, 50); }
        else { try { btn.focus(); } catch (_) { /* noop */ } }
      };
      btn.addEventListener('click', function () { togglePanel(); });
      ui.closeBtn.addEventListener('click', function () { togglePanel(); });
      panel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panel.style.display === 'flex') { e.preventDefault(); togglePanel(); }
      });
      window.mmtOpenAskMMT = function () { togglePanel(true); };
    }

    function setMeter(data) {
      if (!data || typeof data.remaining !== 'number' || !data.cap) return;
      meter.textContent = data.remaining + ' of ' + data.cap + ' left this month';
      saveMeter(data);
    }
    function paintStoredMeter() {
      var m = loadMeter();
      meter.textContent = m ? m.remaining + ' of ' + m.cap + ' left this month' : '';
    }

    function scrollDown() { msgArea.scrollTop = msgArea.scrollHeight; }

    function bubbleShell(role) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin:0 0 14px;display:flex;min-width:0;' + (role === 'user' ? 'justify-content:flex-end;' : '');
      var bubble = document.createElement('div');
      bubble.style.cssText =
        'max-width:88%;min-width:0;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word;' +
        (role === 'user' ? 'background:' + C.navy + ';color:#FFFFFF;' : 'background:' + C.white + ';color:' + C.navy + ';border:1px solid ' + C.border + ';');
      wrap.appendChild(bubble);
      return { wrap: wrap, bubble: bubble };
    }

    function postJson(body) {
      return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }

    function feedbackRow(turn) {
      var row = document.createElement('div');
      row.setAttribute('data-feedback', '1');
      row.style.cssText = 'display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;';
      var meta = turn.meta || {};
      if (meta.feedback) { row.innerHTML = '<span style="font-size:12px;color:' + C.text2 + ';">Thanks</span>'; return row; }
      var up = document.createElement('button');
      up.type = 'button'; up.setAttribute('aria-label', 'This answer was helpful'); up.setAttribute('data-vote', 'up');
      up.innerHTML = '&#128077;'; up.style.cssText = SMALL_BTN + 'min-width:36px;';
      var down = document.createElement('button');
      down.type = 'button'; down.setAttribute('aria-label', 'This answer was not helpful'); down.setAttribute('data-vote', 'down');
      down.innerHTML = '&#128078;'; down.style.cssText = SMALL_BTN + 'min-width:36px;';
      row.appendChild(up); row.appendChild(down);

      function done(verdict) {
        meta.feedback = verdict;
        var h = loadHistory();
        for (var i = h.length - 1; i >= 0; i--) { if (h[i].meta && h[i].meta.turn_id === meta.turn_id) { h[i].meta.feedback = verdict; break; } }
        saveHistory(h);
        row.innerHTML = '<span style="font-size:12px;color:' + C.text2 + ';">Thanks</span>';
      }
      function submit(verdict, note) {
        track(verdict === 'up' ? 'ask_feedback_up' : 'ask_feedback_down', { verdict: verdict });
        row.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        postJson({ action: 'feedback', turn_id: meta.turn_id, verdict: verdict, note: note || '' })
          .then(function (res) {
            if (res.status >= 200 && res.status < 300) { done(verdict); return; }
            throw new Error('feedback status ' + res.status);
          })
          .catch(function (err) {
            console.warn('Ask MMT feedback not saved', err);
            row.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
            var n = row.querySelector('[data-fb-status]');
            if (n) n.textContent = 'Could not save that. Try again.';
          });
      }
      up.addEventListener('click', function () { submit('up'); });
      down.addEventListener('click', function () {
        if (row.querySelector('[data-fb-note]')) return;
        var form = document.createElement('form');
        form.setAttribute('data-fb-note', '1');
        form.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%;margin-top:4px;';
        form.innerHTML =
          '<input type="text" maxlength="300" placeholder="What was off? Optional" aria-label="What was off" style="flex:1;min-width:140px;padding:6px 8px;border:1px solid ' + C.border + ';border-radius:6px;font-size:12px;font-family:inherit;">' +
          '<label style="font-size:12px;color:' + C.navy + ';display:inline-flex;align-items:center;gap:4px;"><input type="checkbox" data-wrong> It got a fact wrong</label>' +
          '<button type="submit" style="' + SMALL_BTN + 'background:' + C.navy + ';color:#fff;border-color:' + C.navy + ';">Send</button>' +
          '<span data-fb-status style="font-size:12px;color:' + C.text2 + ';"></span>';
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var wrong = form.querySelector('[data-wrong]').checked;
          submit(wrong ? 'wrong' : 'down', form.querySelector('input[type=text]').value.trim());
        });
        row.appendChild(form);
        form.querySelector('input[type=text]').focus();
      });
      return row;
    }

    function actionsRow(turn) {
      var row = document.createElement('div');
      row.setAttribute('data-actions', '1');
      row.style.cssText = 'margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
      var copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy';
      copy.setAttribute('data-copy', '1');
      copy.setAttribute('aria-label', 'Copy the question, answer and sources');
      copy.style.cssText = SMALL_BTN;
      copy.addEventListener('click', function () {
        var text = copyTextFor(turn);
        var p;
        try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard')); }
        catch (err) { p = Promise.reject(err); }
        p.then(function () { track('ask_copy'); copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy'; }, 2000); })
          .catch(function (err) { console.warn('Ask MMT copy failed', err); copy.textContent = 'Copy failed'; setTimeout(function () { copy.textContent = 'Copy'; }, 2000); });
      });
      row.appendChild(copy);
      if (turn.meta && turn.meta.turn_id) row.appendChild(feedbackRow(turn));
      return row;
    }

    // Assistant bubbles carry, in order: the answer, the scope line, the
    // "could not check" block, the sources (or the blurred stand-in), then
    // Copy and feedback. `turn` is the history record the actions read.
    function addBubble(role, content, meta, turn) {
      var shell = bubbleShell(role);
      var bubble = shell.bubble;
      if (role === 'assistant') {
        bubble.innerHTML = mdToHtml(content);
        if (meta && meta.agency) {
          var tag = document.createElement('div');
          tag.style.cssText = 'margin-top:8px;font-size:11px;color:' + C.text2 + ';letter-spacing:0.04em;text-transform:uppercase;';
          tag.textContent = 'Scope: ' + (meta.agencyName || meta.agency) + (meta.hasData === false ? ' · limited API data' : '');
          bubble.appendChild(tag);
        }
        if (meta) {
          var slot = document.createElement('div');
          slot.setAttribute('data-sources-slot', '1');
          var nc = document.createElement('div');
          nc.innerHTML = notCheckedHtml(meta.unavailable);
          slot.appendChild(nc);
          var srcHolder = document.createElement('div');
          srcHolder.setAttribute('data-sources', '1');
          if (meta.sources && meta.sources.length) srcHolder.innerHTML = sourcesHtml(meta.sources);
          else if (meta.gated) srcHolder.innerHTML = blurredSourcesHtml(meta.sources_count);
          slot.appendChild(srcHolder);
          bubble.appendChild(slot);
        }
        if (turn) bubble.appendChild(actionsRow(turn));
      } else {
        bubble.textContent = content;
      }
      msgArea.appendChild(shell.wrap);
      scrollDown();
      return { wrap: shell.wrap, bubble: bubble };
    }

    function addCard(html) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin:0 0 14px;min-width:0;';
      var card = document.createElement('div');
      card.style.cssText = 'padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.5;background:' + C.soft + ';border:1px solid ' + C.border + ';color:' + C.navy + ';min-width:0;overflow-wrap:anywhere;';
      card.innerHTML = html;
      wrap.appendChild(card);
      msgArea.appendChild(wrap);
      scrollDown();
      return card;
    }

    function addStatus() {
      var shell = bubbleShell('assistant');
      var node = shell.bubble;
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      node.setAttribute('data-status', '1');
      node.style.color = C.text2;
      node.style.fontStyle = 'italic';
      node.textContent = STATUS_STEPS[0][1];
      var timers = STATUS_STEPS.slice(1).map(function (step) {
        return setTimeout(function () { node.textContent = step[1]; scrollDown(); }, step[0]);
      });
      msgArea.appendChild(shell.wrap);
      scrollDown();
      return {
        stop: function () {
          timers.forEach(clearTimeout);
          if (shell.wrap.parentNode) shell.wrap.parentNode.removeChild(shell.wrap);
        }
      };
    }

    function isMember() { return !!getToken(); }

    function greeting() {
      var m = loadMeter();
      var member = isMember();
      var text = (member ? "I'm the MMT Premium research assistant." : "I'm the MMT research assistant.") +
        " I answer from SAM.gov, USASpending, Congress.gov, PubMed, and Mary's articles, and I show my sources.";
      if (m) text += ' You have ' + m.remaining + ' of ' + m.cap + (member ? '' : ' free') + ' questions left this month.';
      else if (!member) text += ' A few questions a month are free.';
      return text + ' Try one of these, or ask your own.';
    }

    function addChips() {
      var wrap = document.createElement('div');
      wrap.setAttribute('data-chips', '1');
      wrap.style.cssText = 'margin:0 0 14px;display:flex;flex-direction:column;gap:6px;';
      SAMPLE_QUESTIONS.forEach(function (q) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-sample', '1');
        b.textContent = q;
        b.style.cssText = 'min-height:44px;text-align:left;padding:8px 12px;background:' + C.white + ';color:' + C.navy + ';border:1px solid ' + C.border + ';border-radius:10px;font-size:13px;font-family:inherit;cursor:pointer;line-height:1.35;';
        b.addEventListener('click', function () { if (inFlight) return; textarea.value = q; send(); });
        wrap.appendChild(b);
      });
      msgArea.appendChild(wrap);
      scrollDown();
    }

    function renderHistory() {
      msgArea.innerHTML = '';
      var history = loadHistory();
      if (history.length === 0) { addBubble('assistant', greeting()); addChips(); return; }
      history.forEach(function (turn) {
        addBubble('user', turn.question);
        addBubble('assistant', turn.answer, turn.meta || {}, turn);
      });
    }

    function recentHistory() {
      return loadHistory().slice(-HISTORY_TURNS).map(function (t) { return { question: t.question, answer: t.answer }; });
    }

    function emailForm(labelHtml, buttonText, onSubmit) {
      var card = addCard(labelHtml +
        '<form style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
        '<input type="email" required placeholder="you@company.com" aria-label="Email address" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid ' + C.border + ';border-radius:6px;font-size:13px;font-family:inherit;">' +
        '<button type="submit" style="min-height:36px;padding:8px 12px;background:' + C.navy + ';color:#fff;border:none;border-radius:6px;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;">' + buttonText + '</button>' +
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

    // Anonymous turn -> email -> the server returns the held-back sources.
    // The answer bubble keeps its text; only its sources slot changes, and
    // the status line goes into the email card.
    function unlock(unlockId, email, card, bubble, turn, done) {
      track('ask_email_submit');
      postJson({ action: 'unlock', turn_id: unlockId, email: email })
        .then(function (res) { return res.text().then(function (text) { var data = {}; try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { error: 'The reply came back garbled. Try again.' }; } return { status: res.status, data: data }; }); })
        .then(function (r) {
          if (r.status !== 200) { card.innerHTML = '<span style="color:' + C.red + ';">' + escapeHtml(r.data.error || 'Could not unlock. Try again.') + '</span>'; done(); return; }
          lsSet(FREE_EMAIL_KEY, email);
          var sources = Array.isArray(r.data.sources) ? r.data.sources : [];
          var holder = bubble.querySelector('[data-sources]');
          if (holder) holder.innerHTML = sourcesHtml(sources);
          turn.meta.sources = sources;
          turn.meta.gated = false;
          var history = loadHistory();
          if (history.length) { history[history.length - 1].meta = turn.meta; saveHistory(history); }
          setMeter(r.data);
          var rem = typeof r.data.remaining === 'number' ? r.data.remaining : null;
          card.innerHTML = 'Sources unlocked.' + (rem === null ? '' : ' You have ' + rem + ' free question' + (rem === 1 ? '' : 's') + ' left this month.') + ' They reset on the 1st.';
          done();
        })
        .catch(function (err) { console.warn('Ask MMT unlock failed', err); card.innerHTML = '<span style="color:' + C.red + ';">Could not reach Ask MMT. Check your connection and try again.</span>'; done(); });
    }

    function showLimit(data) {
      track('ask_limit_hit', { mode: data.mode || 'free' });
      var member = data.mode === 'member';
      var cap = typeof data.cap === 'number' && data.cap > 0 ? data.cap : 0;
      var premiumCap = pageCap('premium');
      var used = "You've used " + (cap ? 'your ' + cap : 'your') + (member ? '' : ' free') + ' questions this month. They reset on the 1st. ';
      var premiumLine = member
        ? 'Your Premium allowance is ' + (cap ? cap + ' a month' : 'monthly') + '. Email <a href="mailto:mary@missionmeetstech.com" style="' + CARD_LINK + '">Mary</a> if you need more.'
        : 'Premium members get ' + (premiumCap ? premiumCap + ' a month' : 'a much larger monthly allowance') + ', plus the full capture toolkit.';
      var buttons = member ? '' :
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">' +
        '<a href="' + pricingHref('limit') + '" data-premium-click style="min-height:36px;display:inline-flex;align-items:center;padding:8px 12px;background:' + C.navy + ';color:#fff;border-radius:6px;font-weight:600;font-size:13px;text-decoration:none;">Go Premium</a>' +
        '<button type="button" data-remind style="min-height:36px;padding:8px 12px;background:' + C.white + ';color:' + C.navy + ';border:1px solid ' + C.border + ';border-radius:6px;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;">Remind me on the 1st</button>' +
        '</div>';
      var card = addCard(used + premiumLine + buttons);
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
      var meta = {
        agency: data.agency, agencyName: data.agencyName, hasData: data.hasData,
        sources: Array.isArray(data.sources) ? data.sources : [],
        unavailable: Array.isArray(data.unavailable) ? data.unavailable : [],
        turn_id: data.turn_id || null,
        gated: !!data.gated,
        sources_count: data.sources_count || 0
      };
      var turn = { question: question, answer: data.answer || '', meta: meta, ts: Date.now() };
      var out = addBubble('assistant', turn.answer, meta, turn);
      setMeter(data);
      var history = loadHistory();
      history.push(turn);
      saveHistory(history);

      if (data.gated) {
        track('ask_gated');
        var n = data.sources_count || 0;
        emailForm('That answer came from ' + n + ' source' + (n === 1 ? '' : 's') + '. Enter your email to see them and keep your remaining free questions.', 'Show me the sources',
          function (email, card, done) {
            if (!data.unlock_id) { lsSet(FREE_EMAIL_KEY, email); card.innerHTML = 'Saved. Ask again and the sources will show.'; done(); return; }
            unlock(data.unlock_id, email, card, out.bubble, turn, done);
          });
      }
      if (data.hint && /^token_/.test(data.hint)) {
        lsDel(TOKEN_KEY);
        addCard('Your sign-in has expired, so this counted as a free question. <a href="/dashboard.html" style="' + CARD_LINK + '">Sign in again</a> to use your Premium allowance.');
      }
    }

    function retryBubble(question, message) {
      var shell = bubbleShell('assistant');
      shell.bubble.setAttribute('data-retry', '1');
      var p = document.createElement('div');
      p.textContent = message;
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Retry';
      b.style.cssText = SMALL_BTN + 'margin-top:8px;min-height:36px;font-weight:600;';
      b.addEventListener('click', function () {
        if (inFlight) return;
        if (shell.wrap.parentNode) shell.wrap.parentNode.removeChild(shell.wrap);
        postQuestion(question);
      });
      shell.bubble.appendChild(p);
      shell.bubble.appendChild(b);
      msgArea.appendChild(shell.wrap);
      scrollDown();
    }

    function pausedCard(question) {
      var card = addCard('<strong>Ask MMT is paused for maintenance.</strong> Try again in a little while. Your question is still in the box.');
      card.setAttribute('data-paused', '1');
      textarea.value = question;
    }

    function handleError(question, r) {
      var data = r.data || {};
      var code = data.reason_code || '';
      if (code === 'FREE_LIMIT' || code === 'MEMBER_LIMIT') { showLimit(data); return; }
      if (code === 'EMAIL_REQUIRED') {
        pendingQuestion = question;
        var cap = typeof data.cap === 'number' && data.cap > 0 ? data.cap : 0;
        emailForm('Enter your email to keep asking. ' + (cap ? cap + ' questions a month, free.' : 'Free questions every month.'), 'Ask', function (email, card, done) {
          lsSet(FREE_EMAIL_KEY, email);
          card.innerHTML = 'Thanks. Asking now.';
          var q = pendingQuestion; pendingQuestion = null;
          done();
          if (q) postQuestion(q);
        });
        return;
      }
      if (code === 'FREE_TIER_CLOSED') {
        addCard(escapeHtml(data.error) + ' <a href="' + pricingHref('closed') + '" style="' + CARD_LINK + '">See Premium</a>');
        return;
      }
      if (data.hint && /^token_/.test(data.hint)) lsDel(TOKEN_KEY);
      retryBubble(question, data.error || 'Something went wrong on our side. Try again.');
    }

    // POST, with a 55 second ceiling, and a body that is read as text first
    // so a gateway HTML page or a truncated reply becomes a friendly retry
    // instead of an uncaught JSON error.
    function request(body) {
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS) : null;
      var init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      if (ctrl) init.signal = ctrl.signal;
      return fetch(ENDPOINT, init)
        .then(function (res) {
          return res.text().then(function (text) {
            var data = null, parseError = false;
            try { data = text ? JSON.parse(text) : {}; } catch (e) { parseError = true; console.warn('Ask MMT: reply was not JSON', res.status, e); }
            if (!data || typeof data !== 'object') { data = {}; parseError = true; }
            return { status: res.status, data: data, parseError: parseError };
          });
        })
        .then(function (r) { if (timer) clearTimeout(timer); return r; }, function (err) { if (timer) clearTimeout(timer); throw err; });
    }

    function setBusy(busy) {
      inFlight = busy;
      sendBtn.disabled = busy;
      sendBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
      sendBtn.textContent = busy ? '...' : 'Ask';
      textarea.readOnly = busy;
    }

    function postQuestion(question) {
      if (inFlight) return;
      setBusy(true);
      var status = addStatus();
      var body = { question: question, history: recentHistory() };
      var token = getToken();
      if (token) { body.token = token; body.email = getMemberEmail() || undefined; }
      else if (getFreeEmail()) { body.email = getFreeEmail(); }
      track('ask_started', { mode: token ? 'member' : (body.email ? 'free' : 'anonymous') });

      request(body)
        .then(function (r) {
          status.stop();
          if (r.status === 503 && r.data && r.data.reason_code === 'PAUSED') { pausedCard(question); return; }
          if (r.parseError) { retryBubble(question, 'The reply came back garbled. That is on our side, not yours.'); return; }
          if (r.status >= 500) { retryBubble(question, 'The research service returned an error. That is on our side, not yours.'); return; }
          if (r.status === 200) handleAnswer(question, r); else handleError(question, r);
        })
        .catch(function (err) {
          status.stop();
          console.warn('Ask MMT request failed', err);
          retryBubble(question, err && err.name === 'AbortError'
            ? 'That took longer than 55 seconds, so the request was stopped. The federal APIs may be slow right now.'
            : 'Could not reach Ask MMT. Check your connection and try again.');
        })
        .then(function () { setBusy(false); });
    }

    function send() {
      if (inFlight) return;
      var question = textarea.value.trim();
      if (!question) return;
      textarea.value = '';
      var chips = msgArea.querySelector('[data-chips]');
      if (chips && chips.parentNode) chips.parentNode.removeChild(chips);
      addBubble('user', question);
      postQuestion(question);
    }

    sendBtn.addEventListener('click', send);
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    ui.clearBtn.addEventListener('click', function () {
      if (inFlight) return;
      lsDel(STORAGE_KEY);
      renderHistory();
      textarea.focus();
    });

    // Programmatic ask, used by the /ask example cards and the dashboard.
    window.mmtAskMMT = function (q) {
      if (!q) return;
      textarea.value = String(q).slice(0, 500);
      if (!embed && panel.style.display !== 'flex') window.mmtOpenAskMMT();
      send();
    };

    paintStoredMeter();

    if (embed) {
      renderHistory();
      var params = new URLSearchParams(window.location.search);
      var q = params.get('q');
      if (q) textarea.value = q.slice(0, 500);
      // Example cards on /ask: fill the box and focus it. Members are
      // submitted straight away; a visitor sees the question before it
      // spends one of their free turns.
      document.addEventListener('click', function (e) {
        var t = e.target;
        var el = t && t.closest ? t.closest('[data-q]') : null;
        if (!el) return;
        var text = el.getAttribute('data-q');
        if (!text) return;
        textarea.value = text.slice(0, 500);
        if (isMember() && !inFlight) { e.preventDefault(); send(); return; }
        setTimeout(function () { try { textarea.focus(); } catch (_) { /* noop */ } }, 0);
      });
    }
  }

  function attemptMount(attempt) {
    var host = document.getElementById('mmt-ask-embed');
    if (host) { createWidget({ embed: true, host: host }); return; }
    if (isPremiumUser()) { createWidget({ embed: false }); return; }
    // Paywall may not have finished reading auth state on first tick.
    if (attempt < 6) setTimeout(function () { attemptMount(attempt + 1); }, 500);
    else {
      window.mmtOpenAskMMT = function () { window.location.href = '/ask'; };
      window.mmtAskMMT = function (q) { window.location.href = '/ask?q=' + encodeURIComponent(String(q || '')); };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { attemptMount(0); });
  } else {
    attemptMount(0);
  }
})();
