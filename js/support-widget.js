// support-widget.js — Floating support chat widget for MMT
// Connects to /.netlify/functions/support-agent for AI-powered answers
// Auto-escalates to support@missionmeetstech.com when AI can't resolve
(function() {
  'use strict';

  var sessionId = 'sw-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  var isOpen = false;
  var messages = [];

  // Build widget DOM
  function createWidget() {
    // Floating button
    var btn = document.createElement('button');
    btn.id = 'support-fab';
    btn.setAttribute('aria-label', 'Get help');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:#457B9D;color:white;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:9999;display:flex;align-items:center;justify-content:center;transition:transform 0.2s;';
    btn.addEventListener('mouseenter', function() { btn.style.transform = 'scale(1.08)'; });
    btn.addEventListener('mouseleave', function() { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', togglePanel);

    // Chat panel
    var panel = document.createElement('div');
    panel.id = 'support-panel';
    panel.style.cssText = 'position:fixed;bottom:92px;right:24px;width:360px;max-height:480px;background:white;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.12);z-index:9999;display:none;flex-direction:column;overflow:hidden;font-family:Inter,-apple-system,sans-serif;';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'padding:16px 20px;background:#0A192F;color:white;display:flex;align-items:center;justify-content:space-between;';
    header.innerHTML = '<div><div style="font-size:15px;font-weight:700;">MMT Support</div><div style="font-size:12px;opacity:0.7;">AI-powered help</div></div>';
    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'background:none;border:none;color:white;font-size:22px;cursor:pointer;padding:0;line-height:1;';
    closeBtn.addEventListener('click', togglePanel);
    header.appendChild(closeBtn);

    // Messages area
    var msgArea = document.createElement('div');
    msgArea.id = 'support-messages';
    msgArea.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;max-height:300px;';

    // Input area
    var inputArea = document.createElement('div');
    inputArea.style.cssText = 'padding:12px 16px;border-top:1px solid #D8E0E8;display:flex;gap:8px;';
    var input = document.createElement('input');
    input.id = 'support-input';
    input.type = 'text';
    input.placeholder = 'Ask a question...';
    input.maxLength = 500;
    input.style.cssText = 'flex:1;padding:10px 14px;border:1px solid #D8E0E8;border-radius:8px;font-size:14px;font-family:inherit;outline:none;';
    input.addEventListener('focus', function() { input.style.borderColor = '#457B9D'; });
    input.addEventListener('blur', function() { input.style.borderColor = '#D8E0E8'; });
    var sendBtn = document.createElement('button');
    sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    sendBtn.style.cssText = 'width:40px;height:40px;border-radius:8px;background:#457B9D;color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;';

    function handleSend() {
      var q = input.value.trim();
      if (!q || q.length < 3) return;
      input.value = '';
      addMessage('user', q);
      askAgent(q);
    }

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
    });

    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(msgArea);
    panel.appendChild(inputArea);

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // Welcome message
    addMessage('agent', 'How can I help? I can answer questions about MMT features, pricing, your subscription, or our tools.');
  }

  function togglePanel() {
    isOpen = !isOpen;
    var panel = document.getElementById('support-panel');
    var fab = document.getElementById('support-fab');
    if (panel) {
      panel.style.display = isOpen ? 'flex' : 'none';
      if (isOpen) {
        var input = document.getElementById('support-input');
        if (input) setTimeout(function() { input.focus(); }, 100);
      }
    }
    if (fab) {
      fab.innerHTML = isOpen
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }
  }

  function addMessage(role, text) {
    messages.push({ role: role, text: text });
    var area = document.getElementById('support-messages');
    if (!area) return;

    var bubble = document.createElement('div');
    bubble.style.cssText = role === 'user'
      ? 'background:#457B9D;color:white;padding:10px 14px;border-radius:12px 12px 4px 12px;margin-bottom:10px;font-size:14px;line-height:1.5;max-width:85%;margin-left:auto;'
      : 'background:#F3F4F6;color:#0A192F;padding:10px 14px;border-radius:12px 12px 12px 4px;margin-bottom:10px;font-size:14px;line-height:1.5;max-width:85%;';
    bubble.textContent = text;
    area.appendChild(bubble);
    area.scrollTop = area.scrollHeight;
  }

  function addTypingIndicator() {
    var area = document.getElementById('support-messages');
    if (!area) return;
    var typing = document.createElement('div');
    typing.id = 'support-typing';
    typing.style.cssText = 'background:#F3F4F6;color:#5C6B7A;padding:10px 14px;border-radius:12px 12px 12px 4px;margin-bottom:10px;font-size:13px;max-width:85%;';
    typing.textContent = 'Thinking...';
    area.appendChild(typing);
    area.scrollTop = area.scrollHeight;
  }

  function removeTypingIndicator() {
    var el = document.getElementById('support-typing');
    if (el) el.remove();
  }

  function askAgent(question) {
    addTypingIndicator();
    var email = (typeof localStorage !== 'undefined' && localStorage.getItem('mmt_email')) || '';

    fetch('/.netlify/functions/support-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question, email: email, sessionId: sessionId }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      removeTypingIndicator();
      addMessage('agent', data.answer || 'Sorry, something went wrong. Please email support@missionmeetstech.com.');
    })
    .catch(function() {
      removeTypingIndicator();
      addMessage('agent', 'Connection issue. Please email support@missionmeetstech.com for help.');
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }

  // Responsive: hide on very small screens
  var mq = window.matchMedia('(max-width:400px)');
  function handleMq(e) {
    var fab = document.getElementById('support-fab');
    var panel = document.getElementById('support-panel');
    if (fab) fab.style.display = e.matches ? 'none' : 'flex';
    if (panel && e.matches) { panel.style.display = 'none'; isOpen = false; }
  }
  mq.addEventListener('change', handleMq);
})();
