// premium-chat-widget.js — Premium subscriber research chat
//
// Floating widget that appears on all paywall pages for premium users.
// Calls /.netlify/functions/premium-chat, which runs the federal-data
// enrichment stack + MMT content corpus + Claude.
//
// Activates only when mmtIsPremium() returns true (from mmt-paywall.js).
// Gracefully hides itself for non-premium users.
(function () {
  'use strict';

  if (window.__mmtPremiumChatMounted) return;
  window.__mmtPremiumChatMounted = true;

  var STORAGE_KEY = 'mmt_premium_chat_history';
  var EMAIL_KEY = 'mmt_premium_email';
  var MAX_LOCAL_TURNS = 30;

  function getPremiumEmail() {
    // Try multiple places — mmt-paywall writes different keys across history.
    try {
      return (
        localStorage.getItem(EMAIL_KEY) ||
        localStorage.getItem('mmt_subscriber_email') ||
        localStorage.getItem('mmt_email') ||
        (window.mmtCurrentUser && window.mmtCurrentUser.email) ||
        ''
      );
    } catch (_) {
      return '';
    }
  }

  function isPremiumUser() {
    try {
      if (typeof window.mmtIsPremium === 'function') return !!window.mmtIsPremium();
      if (localStorage.getItem('mmt_premium') === 'true') return true;
    } catch (_) { /* noop */ }
    return false;
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      var trimmed = history.slice(-MAX_LOCAL_TURNS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (_) { /* quota/full */ }
  }

  // Minimal inline markdown → HTML for chat bubbles.
  function mdToHtml(md) {
    var s = String(md || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    s = s
      .replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 4px;font-size:13px;color:#0A192F;">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 6px;font-size:14px;color:#0A192F;">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:#457B9D;">$1</a>')
      .replace(/^- (.+)$/gm, '<li style="margin:2px 0;">$1</li>');
    s = s.replace(/(<li[^>]*>.+<\/li>\n?)+/g, function (list) {
      return '<ul style="margin:6px 0 8px;padding-left:18px;">' + list + '</ul>';
    });
    s = s.replace(/\n{2,}/g, '</p><p style="margin:0 0 8px;">');
    return '<p style="margin:0 0 8px;">' + s + '</p>';
  }

  function createWidget() {
    var hasDashNav = !!document.querySelector('.dash-nav') && window.matchMedia('(max-width:768px)').matches;
    // Sit above the support widget if both are present.
    var fabBottom = hasDashNav ? '192px' : '92px';

    var btn = document.createElement('button');
    btn.id = 'mmt-premium-chat-fab';
    btn.setAttribute('aria-label', 'Ask MMT — premium research chat');
    btn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.5.25-.9.6-1 1.2v1"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>';
    btn.style.cssText =
      'position:fixed;bottom:' + fabBottom + ';right:24px;width:52px;height:52px;border-radius:50%;' +
      'background:#0A192F;color:#FFFFFF;border:2px solid #457B9D;cursor:pointer;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:9998;display:flex;align-items:center;justify-content:center;' +
      'transition:transform 0.2s;';
    btn.addEventListener('mouseenter', function () { btn.style.transform = 'scale(1.08)'; });
    btn.addEventListener('mouseleave', function () { btn.style.transform = 'scale(1)'; });

    // Badge
    var badge = document.createElement('span');
    badge.textContent = '★';
    badge.style.cssText =
      'position:absolute;top:-4px;right:-4px;background:#457B9D;color:#fff;width:18px;height:18px;' +
      'border-radius:50%;font-size:11px;display:flex;align-items:center;justify-content:center;';
    btn.appendChild(badge);

    // Panel
    var panel = document.createElement('div');
    panel.id = 'mmt-premium-chat-panel';
    var panelBottom = hasDashNav ? '260px' : '160px';
    panel.style.cssText =
      'position:fixed;bottom:' + panelBottom + ';right:24px;width:420px;max-width:calc(100vw - 40px);' +
      'height:560px;max-height:calc(100vh - 200px);background:#FFFFFF;border-radius:16px;' +
      'box-shadow:0 12px 40px rgba(0,0,0,0.15);z-index:9998;display:none;flex-direction:column;' +
      'overflow:hidden;font-family:Inter,-apple-system,sans-serif;';

    // Header
    var header = document.createElement('div');
    header.style.cssText =
      'padding:16px 20px;background:#0A192F;color:#FFFFFF;display:flex;align-items:center;justify-content:space-between;';
    header.innerHTML =
      '<div>' +
      '<div style="font-size:15px;font-weight:700;">Ask MMT <span style="color:#457B9D;">★</span></div>' +
      '<div style="font-size:12px;opacity:0.75;">Federal health IT research, grounded in live data + Mary\'s articles</div>' +
      '</div>';
    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:0 4px;line-height:1;';
    header.appendChild(closeBtn);

    // Messages
    var msgArea = document.createElement('div');
    msgArea.id = 'mmt-premium-chat-messages';
    msgArea.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;background:#F9FAFB;';

    // Input
    var inputArea = document.createElement('div');
    inputArea.style.cssText =
      'padding:12px 16px;border-top:1px solid #D8E0E8;display:flex;gap:8px;align-items:flex-end;background:#FFFFFF;';
    var textarea = document.createElement('textarea');
    textarea.id = 'mmt-premium-chat-input';
    textarea.rows = 2;
    textarea.placeholder = 'Ask about a contract, vehicle, agency, or trend...';
    textarea.style.cssText =
      'flex:1;padding:10px 12px;border:1px solid #D8E0E8;border-radius:8px;font-size:14px;' +
      'font-family:inherit;resize:none;outline:none;line-height:1.4;color:#0A192F;';
    var sendBtn = document.createElement('button');
    sendBtn.textContent = 'Ask';
    sendBtn.style.cssText =
      'padding:10px 16px;background:#457B9D;color:#FFFFFF;border:none;border-radius:8px;' +
      'font-weight:600;cursor:pointer;font-size:14px;white-space:nowrap;';
    inputArea.appendChild(textarea);
    inputArea.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(msgArea);
    panel.appendChild(inputArea);

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    function togglePanel() {
      var open = panel.style.display === 'flex';
      panel.style.display = open ? 'none' : 'flex';
      if (!open) {
        renderHistory();
        setTimeout(function () { textarea.focus(); }, 50);
      }
    }
    btn.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', togglePanel);

    function addBubble(role, content, meta) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin:0 0 14px;display:flex;' + (role === 'user' ? 'justify-content:flex-end;' : '');
      var bubble = document.createElement('div');
      bubble.style.cssText =
        'max-width:85%;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.5;' +
        (role === 'user'
          ? 'background:#0A192F;color:#FFFFFF;'
          : 'background:#FFFFFF;color:#0A192F;border:1px solid #D8E0E8;');
      if (role === 'assistant') {
        bubble.innerHTML = mdToHtml(content);
        if (meta && meta.agency) {
          var tag = document.createElement('div');
          tag.style.cssText =
            'margin-top:8px;font-size:11px;color:#5C6B7A;letter-spacing:0.04em;text-transform:uppercase;';
          tag.textContent = 'Scope: ' + meta.agency + (meta.hasData === false ? ' · limited API data' : '');
          bubble.appendChild(tag);
        }
      } else {
        bubble.textContent = content;
      }
      wrap.appendChild(bubble);
      msgArea.appendChild(wrap);
      msgArea.scrollTop = msgArea.scrollHeight;
      return wrap;
    }

    function renderHistory() {
      msgArea.innerHTML = '';
      var history = loadHistory();
      if (history.length === 0) {
        addBubble('assistant',
          "Hi — I'm the MMT premium research assistant. I answer grounded in Mary's articles, SAM.gov, USASpending, Congress.gov, PubMed, and a dozen other federal sources. Try:\n" +
          "- *What's the status of CCN Next Gen?*\n" +
          "- *Who are the incumbents on T4NG2?*\n" +
          "- *What's moving in DHA's FY2027 IT budget?*");
        return;
      }
      history.forEach(function (turn) {
        addBubble('user', turn.question);
        addBubble('assistant', turn.answer, turn.meta);
      });
    }

    function send() {
      var question = textarea.value.trim();
      if (!question) return;
      var email = getPremiumEmail();
      if (!email) {
        addBubble('assistant',
          "I need your subscriber email to start the chat. Sign in at [missionmeetstech.com/dashboard](/dashboard.html) and try again.");
        return;
      }
      textarea.value = '';
      sendBtn.disabled = true;
      sendBtn.textContent = '...';
      addBubble('user', question);
      var thinkingBubble = addBubble('assistant', "_Researching..._");

      fetch('/.netlify/functions/premium-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, question: question }),
      })
        .then(function (res) {
          return res.json().then(function (data) { return { status: res.status, data: data }; });
        })
        .then(function (wrap) {
          msgArea.removeChild(thinkingBubble);
          if (wrap.status !== 200) {
            addBubble('assistant', wrap.data.error || 'Something went wrong. Try again.');
            return;
          }
          addBubble('assistant', wrap.data.answer, { agency: wrap.data.agency, hasData: wrap.data.hasData });
          var history = loadHistory();
          history.push({
            question: question,
            answer: wrap.data.answer,
            meta: { agency: wrap.data.agency, hasData: wrap.data.hasData },
            ts: Date.now(),
          });
          saveHistory(history);
        })
        .catch(function (err) {
          msgArea.removeChild(thinkingBubble);
          addBubble('assistant', 'Network error: ' + err.message);
        })
        .then(function () {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Ask';
        });
    }

    sendBtn.addEventListener('click', send);
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        send();
      }
    });
  }

  function attemptMount(attempt) {
    if (isPremiumUser()) {
      createWidget();
      return;
    }
    // Paywall may not have finished reading auth state on first tick —
    // retry a few times before giving up.
    if (attempt < 6) {
      setTimeout(function () { attemptMount(attempt + 1); }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { attemptMount(0); });
  } else {
    attemptMount(0);
  }
})();
