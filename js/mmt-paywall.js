// ============================================================
// mmt-paywall.js — Client-side tier detection and content gating
//
// Detects user tier (public / free / premium) and shows/hides
// gated content sections accordingly.
//
// Tier detection (launch): cookie-based
//   mmt_premium=true  → premium subscriber
//   mmt_subscriber=true → free subscriber
//   neither → public (anonymous)
//
// Tier detection (future): falls back to API check if email stored
//
// Usage in HTML:
//   data-gate="subscriber"       — visible to subscribers + premium
//   data-gate="premium"          — visible to premium only
//   data-gate-overlay="premium"  — shows upgrade overlay (hidden for premium)
//   data-visible-to="premium"    — visible only to premium
//   data-visible-to="public,free" — visible to public + free only
//   data-requires="premium"      — marks container as gated
//   class="premium-blur"         — blurred until premium confirmed
// ============================================================

(function () {
  "use strict";

  var EMAIL_KEY = "mmt_email";
  var PREMIUM_KEY = "mmt_premium";

  // --- Cookie helpers ---
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // --- Tier detection ---
  // Returns: 'institutional' | 'premium' | 'free' | 'public'
  function getSubscriberStatus() {
    // Institutional check first (highest tier)
    try {
      if (localStorage.getItem('mmt_institutional') === 'true') return 'institutional';
    } catch (e) {}
    if (getCookie('mmt_institutional') === 'true') return 'institutional';

    // Premium check
    if (getCookie('mmt_premium') === 'true') return 'premium';
    if (getCookie('mmt_subscriber') === 'true') return 'free';

    // localStorage direct check (set by mmtSignIn and dashboard auth)
    try {
      if (localStorage.getItem(PREMIUM_KEY) === 'true') return 'premium';
    } catch (e) {}

    // localStorage tier cache fallback (from API-based flow)
    try {
      var cached = localStorage.getItem('mmt_tier_cache');
      if (cached) {
        var data = JSON.parse(cached);
        if (Date.now() - data.ts < 5 * 60 * 1000) {
          if (data.tier === 'institutional') return 'institutional';
          if (data.tier === 'premium') return 'premium';
          if (data.tier === 'subscriber') return 'free';
        }
      }
    } catch (e) {}

    return 'public';
  }

  // Helper: is at least premium (includes institutional)
  function isAtLeastPremium(status) {
    return status === 'premium' || status === 'institutional';
  }

  // Helper: HTML-escape so contact-name strings (e.g. "O'Brien")
  // don't break attribute parsing or surface as XSS via decoded
  // base64. Used by the agency-intel renderer for keyContacts.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Gate logic ---
  function applyPaywallVisibility() {
    var status = getSubscriberStatus();

    // Set data attribute on body for CSS-based gating
    document.body.setAttribute("data-mmt-tier", status);
    // Add js-ready class (enables collapse buttons, etc.)
    document.body.classList.add('js-ready');

    // CSS-first paywall: reveal data-access="premium" elements for premium users
    if (isAtLeastPremium(status)) {
      var premiumContent = document.querySelectorAll('[data-access="premium"]');
      for (var p = 0; p < premiumContent.length; p++) {
        var el = premiumContent[p];
        var computedDisplay = window.getComputedStyle(el).display;
        // Use appropriate access-granted variant based on context
        if (el.style.display === 'flex' || el.classList.contains('flex')) {
          el.classList.add('access-granted-flex');
        } else if (el.style.display === 'inline-flex' || el.classList.contains('inline-flex')) {
          el.classList.add('access-granted-inline');
        } else {
          el.classList.add('access-granted');
        }
      }
    }

    // Decode contract detail page premium fields for authenticated users
    if (isAtLeastPremium(status)) {
      var contractMain = document.querySelector('[data-contract-premium]');
      if (contractMain) {
        try {
          var cData = JSON.parse(atob(contractMain.getAttribute('data-contract-premium')));
          var premFields = document.querySelectorAll('.contract-premium-field');
          for (var cf = 0; cf < premFields.length; cf++) {
            var field = premFields[cf].getAttribute('data-field');
            if (field && cData[field]) premFields[cf].textContent = cData[field];
          }
          // Hide the gate card for premium users
          var contractGate = document.getElementById('contract-gate');
          if (contractGate) contractGate.style.display = 'none';
        } catch (e) {}
      }
    }

    // Decode contract tracker card premium fields for authenticated users
    if (isAtLeastPremium(status)) {
      var encodedFields = document.querySelectorAll('[data-premium-fields]');
      for (var f = 0; f < encodedFields.length; f++) {
        try {
          var raw = atob(encodedFields[f].getAttribute('data-premium-fields'));
          var data = JSON.parse(raw);
          var placeholder = encodedFields[f].querySelector('.premium-fields-placeholder');
          if (placeholder && data) {
            var html = '';
            if (data.v) html += '<span><strong style="color:var(--mmt-text);">Vendor:</strong> ' + data.v + '</span>';
            if (data.val) html += '<span><strong style="color:var(--mmt-text);">Value:</strong> ' + data.val + '</span>';
            if (data.n) html += '<span><strong style="color:var(--mmt-text);">NAICS:</strong> ' + data.n + '</span>';
            placeholder.innerHTML = html;
            if (data.ver) {
              var d = new Date(data.ver);
              var days = Math.floor((Date.now() - d.getTime()) / 86400000);
              var verColor = days < 7 ? '#22C55E' : days < 30 ? '#FBBF24' : days < 90 ? '#FB923C' : '#F87171';
              var icon = days < 7 ? '\u2713' : '\u26A0';
              var fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              placeholder.insertAdjacentHTML('afterend', '<span class="text-xs block mt-2" style="color:' + verColor + ';">' + icon + ' Verified ' + fmt + '</span>');
            }
          }
        } catch (e) {}
      }
    }

    // Decode and inject agency intelligence for authenticated users
    if (isAtLeastPremium(status)) {
      var agencyEl = document.querySelector('[data-agency-intel]');
      if (agencyEl) {
        try {
          var agencyData = JSON.parse(atob(agencyEl.getAttribute('data-agency-intel')));
          var container = document.getElementById('agency-premium-content');
          if (container && agencyData) {
            var h = '';
            h += '<div class="profile-section"><div class="profile-label">MMT\'s Current Read</div>';
            h += '<div style="background:rgba(69,123,157,0.04);border-left:3px solid var(--mmt-teal);border-radius:0 10px 10px 0;padding:16px 20px;">';
            h += '<p style="font-size:15px;line-height:1.7;color:var(--mmt-text);">' + agencyData.current_read + '</p>';
            h += '<p style="font-size:12px;color:var(--mmt-text-secondary);margin-top:8px;">Updated: April 2026</p></div></div>';
            h += '<div class="profile-section"><div class="profile-label">Budget Posture</div>';
            h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';
            h += '<div><span style="font-size:12px;color:var(--mmt-text-secondary);">FY2026 Enacted</span><div style="font-size:18px;font-weight:700;">' + agencyData.fy2026 + '</div></div>';
            h += '<div><span style="font-size:12px;color:var(--mmt-text-secondary);">FY2027 Request</span><div style="font-size:18px;font-weight:700;">' + agencyData.fy2027 + '</div></div></div>';
            if (agencyData.programs && agencyData.programs.length) {
              h += '<div style="font-size:13px;font-weight:600;margin-bottom:6px;">Key Funded Programs</div><ul style="list-style:none;padding:0;margin:0 0 12px;font-size:14px;color:var(--mmt-text-secondary);">';
              agencyData.programs.forEach(function(p) { h += '<li style="margin-bottom:4px;">' + p + '</li>'; });
              h += '</ul>';
            }
            if (agencyData.vehicles && agencyData.vehicles.length) {
              h += '</div><div class="profile-section"><div class="profile-label">Key Vehicles</div><div style="display:flex;gap:8px;flex-wrap:wrap;">';
              agencyData.vehicles.forEach(function(v) { h += '<span class="tag" style="font-size:12px;">' + v + '</span>'; });
              h += '</div></div>';
            }
            if (agencyData.signals && agencyData.signals.length) {
              h += '<div class="profile-section"><div class="profile-label">Upcoming Procurement Signals</div><ul style="list-style:none;padding:0;margin:0;color:var(--mmt-text-secondary);">';
              agencyData.signals.forEach(function(s) { h += '<li style="margin-bottom:6px;font-size:14px;">\u2022 ' + s + '</li>'; });
              h += '</ul></div>';
            }
            if (agencyData.offices && agencyData.offices.length) {
              h += '<div class="profile-section"><div class="profile-label">Key Program Offices</div><ul style="list-style:none;padding:0;margin:0;color:var(--mmt-text-secondary);">';
              agencyData.offices.forEach(function(o) { h += '<li style="margin-bottom:6px;font-size:14px;">' + o + '</li>'; });
              h += '</ul></div>';
            }
            // Key Contacts section — operator-curated named individuals.
            // Grouped by Category for skim-ability (43 VA contacts is too
            // long to read flat). Each contact shows name, title, org,
            // a mailto, and the background notes when present.
            if (agencyData.contacts && agencyData.contacts.length) {
              var groups = {};
              agencyData.contacts.forEach(function(c) {
                var key = c.category || 'Other';
                (groups[key] = groups[key] || []).push(c);
              });
              h += '<div class="profile-section"><div class="profile-label">Key Contacts (' + agencyData.contacts.length + ')</div>';
              h += '<p style="font-size:12px;color:var(--mmt-text-secondary);margin:-8px 0 14px;">Operator-curated. Use these for cold-outreach research and capture-call prep — do NOT mass-email.</p>';
              Object.keys(groups).sort().forEach(function(cat) {
                h += '<details style="margin-bottom:10px;border:1px solid var(--mmt-border);border-radius:8px;padding:10px 14px;">';
                h += '<summary style="cursor:pointer;font-weight:600;font-size:14px;color:var(--mmt-navy);">' + esc(cat) + ' <span style="color:var(--mmt-text-secondary);font-weight:400;">(' + groups[cat].length + ')</span></summary>';
                h += '<ul style="list-style:none;padding:0;margin:12px 0 0;">';
                groups[cat].forEach(function(c) {
                  h += '<li style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px dashed var(--mmt-border);">';
                  h += '<div style="font-size:14px;font-weight:600;color:var(--mmt-navy);">' + esc(c.name || '') + '</div>';
                  if (c.title) h += '<div style="font-size:13px;color:var(--mmt-text);margin-top:2px;">' + esc(c.title) + '</div>';
                  if (c.org) h += '<div style="font-size:12px;color:var(--mmt-text-secondary);margin-top:2px;">' + esc(c.org) + '</div>';
                  if (c.email) h += '<div style="font-size:12px;margin-top:4px;"><a href="mailto:' + esc(c.email) + '" style="color:var(--mmt-teal);text-decoration:none;border-bottom:1px solid rgba(69,123,157,0.3);">' + esc(c.email) + '</a></div>';
                  if (c.notes) h += '<div style="font-size:12px;color:var(--mmt-text-secondary);margin-top:6px;line-height:1.5;">' + esc(c.notes) + '</div>';
                  h += '</li>';
                });
                h += '</ul></details>';
              });
              h += '</div>';
            }
            container.innerHTML = h;
          }
        } catch (e) {}
      }
    }

    // Decode and inject premium text content for authenticated users
    if (isAtLeastPremium(status)) {
      var encodedText = document.querySelectorAll('[data-premium-text]');
      for (var t = 0; t < encodedText.length; t++) {
        try {
          var decoded = atob(encodedText[t].getAttribute('data-premium-text'));
          var textEl = encodedText[t].querySelector('.premium-text-placeholder');
          if (textEl) textEl.innerHTML = decoded;
        } catch (e) {}
      }
    }

    // data-gate elements (show based on minimum tier)
    var gated = document.querySelectorAll("[data-gate]");
    for (var i = 0; i < gated.length; i++) {
      var el = gated[i];
      var requiredTier = el.getAttribute("data-gate");
      var visible = false;

      if (requiredTier === "subscriber") {
        visible = status === "free" || status === "premium";
      } else if (requiredTier === "premium") {
        visible = status === "premium";
      } else if (requiredTier === "anonymous" || requiredTier === "public") {
        visible = true;
      }

      el.style.display = visible ? "" : "none";
    }

    // data-gate-overlay elements (upgrade overlays — hidden when tier met)
    var overlays = document.querySelectorAll("[data-gate-overlay]");
    for (var j = 0; j < overlays.length; j++) {
      var overlay = overlays[j];
      var requiredForOverlay = overlay.getAttribute("data-gate-overlay");
      var shouldHide = false;

      if (requiredForOverlay === "premium") {
        shouldHide = status === "premium";
      } else if (requiredForOverlay === "subscriber") {
        shouldHide = status === "free" || status === "premium";
      }

      overlay.style.display = shouldHide ? "none" : "";
    }

    // data-visible-to elements (comma-separated list of allowed tiers)
    var visibleTo = document.querySelectorAll("[data-visible-to]");
    for (var k = 0; k < visibleTo.length; k++) {
      var vtEl = visibleTo[k];
      var allowedStatuses = vtEl.getAttribute("data-visible-to").split(",");
      vtEl.style.display = allowedStatuses.indexOf(status) !== -1 ? "" : "none";
    }

    // data-requires elements (add gated class if tier not met)
    var requires = document.querySelectorAll("[data-requires]");
    for (var m = 0; m < requires.length; m++) {
      var reqEl = requires[m];
      var required = reqEl.getAttribute("data-requires");
      if (required === "premium" && status !== "premium") {
        reqEl.classList.add("mmt-gated");
      } else {
        reqEl.classList.remove("mmt-gated");
      }
    }

    // Remove blur from premium content if user is premium
    if (status === "premium") {
      var blurred = document.querySelectorAll(".premium-blur");
      for (var n = 0; n < blurred.length; n++) {
        blurred[n].classList.remove("premium-blur");
      }
    }

    // Hide premium CTAs for premium users
    if (status === "premium") {
      var premiumCtaEls = document.querySelectorAll("[data-premium-cta]");
      for (var p = 0; p < premiumCtaEls.length; p++) {
        premiumCtaEls[p].style.display = "none";
      }
    }

    // Gate contractor notes in glossary
    var gatedNotes = document.querySelectorAll('.contractor-note-gated');
    if (gatedNotes.length > 0) {
      for (var g = 0; g < gatedNotes.length; g++) {
        var note = gatedNotes[g];
        if (isAtLeastPremium(status)) {
          // Decode full note from data attribute for premium users
          var fullNote = note.getAttribute('data-full-note');
          if (fullNote) {
            try { note.textContent = atob(fullNote); } catch (e) {}
          }
        } else {
          // Non-premium: show teaser with upgrade link
          var currentText = note.textContent.trim();
          note.innerHTML = '<span style="color:var(--mmt-teal);font-weight:700;">★ Contractor note:</span> ' +
            currentText + ' ' +
            '<a href="/pricing.html" style="font-size:11px;font-weight:700;color:var(--mmt-teal);text-decoration:none;white-space:nowrap;">Unlock full note — Premium &rarr;</a>';
        }
      }
    }
  }

  // --- Capture Intelligence 72-hour auto-unlock ---
  function applyCIDelayedAccess(status) {
    if (status !== "free") return;

    var ciElements = document.querySelectorAll("[data-ci-publish-date]");
    var now = Date.now();
    var DELAY_MS = 72 * 60 * 60 * 1000;

    for (var i = 0; i < ciElements.length; i++) {
      var el = ciElements[i];
      var publishDate = new Date(el.getAttribute("data-ci-publish-date")).getTime();
      if (now - publishDate >= DELAY_MS) {
        el.style.display = "";
        el.classList.remove("premium-blur");
      }
    }
  }

  // --- Sign In function — checks Stripe subscription via serverless function ---
  window.mmtSignIn = function () {
    var email = prompt("Enter your Premium subscriber email:");
    if (!email) return;
    email = email.toLowerCase().trim();

    fetch("/.netlify/functions/member-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.authenticated) {
          localStorage.setItem(PREMIUM_KEY, "true");
          localStorage.setItem("mmt_premium_ts", Date.now().toString());
          localStorage.setItem(EMAIL_KEY, email);
          if (data.token) localStorage.setItem("mmt_subscriber_token", data.token);
          alert("Welcome back! Refreshing to unlock Premium content.");
          location.reload();
        } else {
          alert(data.message || "No active subscription found. Subscribe at /pricing.html");
        }
      })
      .catch(function () {
        alert("Could not verify subscription. Please try again or email mary@missionmeetstech.com");
      });
  };

  // --- Legacy email prompt (kept for backward compat) ---
  window.mmtRequireEmail = function (callback) {
    var email = localStorage.getItem(EMAIL_KEY);
    if (email) {
      callback(email);
      return;
    }
    email = prompt("Enter your email to continue:");
    if (!email) return;
    email = email.toLowerCase().trim();
    localStorage.setItem(EMAIL_KEY, email);
    callback(email);
  };

  // --- Expose tier for other scripts ---
  window.mmtGetTier = function () {
    return getSubscriberStatus();
  };

  window.mmtIsPremium = function () {
    var s = getSubscriberStatus();
    return s === "premium" || s === "institutional";
  };

  window.mmtIsInstitutional = function () {
    return getSubscriberStatus() === "institutional";
  };

  // --- Plausible gate view tracking ---
  function trackGateViews(status) {
    if (typeof plausible === 'undefined') return;
    if (isAtLeastPremium(status)) return; // No gates visible

    var gates = document.querySelectorAll('[data-gate-overlay]');
    for (var i = 0; i < gates.length; i++) {
      if (gates[i].style.display !== 'none') {
        plausible('Capture Gate View', { props: { article: document.title } });
        return; // One event per page load
      }
    }
  }

  // --- Go Premium Sticky Bar ---
  function initStickyBar() {
    // Don't show on legal/privacy pages
    var skipPages = ['/security', '/privacy', '/terms', '/editorial-standards'];
    var path = window.location.pathname;
    for (var i = 0; i < skipPages.length; i++) {
      if (path.indexOf(skipPages[i]) === 0) return;
    }
    // Don't show if premium
    if (getSubscriberStatus() === 'premium') return;
    // Don't show if dismissed
    if (localStorage.getItem('mmt_sticky_dismissed')) return;
    // Don't show if visited pricing this session
    if (sessionStorage.getItem('mmt_visited_pricing')) return;
    if (path.indexOf('/pricing') === 0) {
      sessionStorage.setItem('mmt_visited_pricing', '1');
      return;
    }

    var shown = false;
    window.addEventListener('scroll', function onScroll() {
      if (shown) return;
      var scrollPct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrollPct < 0.3) return;
      shown = true;

      var bar = document.createElement('div');
      bar.id = 'mmt-sticky-bar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#0A192F;color:#fff;padding:10px 24px;display:flex;align-items:center;justify-content:center;gap:16px;font-size:14px;font-family:Inter,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
      bar.innerHTML = '<span>&#9733; Founding Member pricing &#8212; 100 seats, first-come. $199/yr locked in for life.</span>' +
        '<a href="/pricing.html#founding-member" style="background:#457B9D;color:#fff;padding:6px 16px;border-radius:6px;font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap;">Claim your seat &rarr;</a>' +
        '<button onclick="document.getElementById(\'mmt-sticky-bar\').remove();localStorage.setItem(\'mmt_sticky_dismissed\',\'1\');" style="background:none;border:none;color:#999;cursor:pointer;font-size:18px;padding:0 4px;" aria-label="Dismiss">&times;</button>';
      document.body.prepend(bar);
      if (typeof plausible !== 'undefined') plausible('Sticky Bar View');
    });
  }

  // --- Article body gating (2-paragraph reveal + CSS fade) ---
  function applyArticleGate() {
    var articleEl = document.querySelector('article[data-age-days]');
    if (!articleEl) return;

    var status = getSubscriberStatus();
    var ageDays = parseInt(articleEl.getAttribute('data-age-days') || '999');
    var accessTier = articleEl.getAttribute('data-access') || 'free';

    // Premium users see everything (including 48-hour early access)
    if (isAtLeastPremium(status)) return;

    // 48-hour early access: completely gate article for free users
    var isEarlyAccess = articleEl.getAttribute('data-early-access') === 'true';
    if (isEarlyAccess) {
      var body = document.getElementById('article-body');
      var gate = document.getElementById('article-gate');
      if (body) { body.style.display = 'none'; }
      if (gate) {
        gate.innerHTML = '<div style="text-align:center;padding:40px 24px;background:var(--mmt-soft,#F3F4F6);border-radius:14px;">' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#92710A;margin-bottom:8px;">48-Hour Early Access</div>' +
          '<p style="font-size:18px;font-weight:700;color:var(--mmt-navy,#0A192F);margin:0 0 8px;">Premium members are reading this now</p>' +
          '<p style="font-size:15px;color:var(--mmt-text-secondary,#5C6B7A);margin:0 0 20px;max-width:44ch;margin-left:auto;margin-right:auto;">This analysis is available to free readers in ' + (ageDays <= 0 ? '2 days' : '1 day') + '. Premium members get every article 48 hours early.</p>' +
          '<a href="/pricing.html" class="btn-primary no-underline" style="font-size:14px;padding:12px 24px;">Get early access</a>' +
          '</div>';
        gate.style.display = 'block';
      }
      return;
    }

    // Archive articles (> 90 days): only email-gate (not implemented yet — skip for now)
    if (accessTier === 'email') return;

    // Recent articles (< 90 days): gate at 2 paragraphs for non-premium
    var body = document.getElementById('article-body');
    var gate = document.getElementById('article-gate');
    if (!body || !gate) return;

    // Find first 2 paragraphs — show them, hide rest via CSS fade
    var paragraphs = body.querySelectorAll('p, h2, h3, ul, ol, blockquote, table, .wtm-box');
    var visibleCount = 0;
    var cutoffReached = false;
    for (var i = 0; i < paragraphs.length; i++) {
      if (cutoffReached) {
        paragraphs[i].style.visibility = 'hidden';
        paragraphs[i].style.height = '0';
        paragraphs[i].style.overflow = 'hidden';
        paragraphs[i].style.margin = '0';
        paragraphs[i].style.padding = '0';
      } else if (paragraphs[i].tagName === 'P') {
        visibleCount++;
        if (visibleCount >= 2) cutoffReached = true;
      }
    }

    // Apply fade overlay on body
    body.style.position = 'relative';
    body.style.maxHeight = '420px';
    body.style.overflow = 'hidden';

    var fadeOverlay = document.createElement('div');
    fadeOverlay.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:200px;background:linear-gradient(to bottom,transparent 0%,#FFFFFF 75%);pointer-events:none;';
    body.appendChild(fadeOverlay);

    // Show gate card
    gate.style.display = 'block';

    // Track gate impression
    if (typeof plausible !== 'undefined') {
      plausible('Article Gate View', { props: { article: document.title, age: ageDays } });
    }
  }

  // --- Nav premium state toggle ---
  function applyNavPremiumState() {
    var status = getSubscriberStatus();
    if (!isAtLeastPremium(status)) return;

    // Desktop nav: show member chip, hide sign-in
    var loggedOut = document.getElementById('nav-logged-out');
    var loggedIn = document.getElementById('nav-logged-in');
    if (loggedOut) loggedOut.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'inline-flex';

    // Set initials in member chip
    var email = localStorage.getItem(EMAIL_KEY) || '';
    var chipBtn = loggedIn ? loggedIn.querySelector('.member-chip') : null;
    if (chipBtn && email) {
      var initial = email.charAt(0).toUpperCase();
      chipBtn.textContent = initial + ' \u25BE';
    }

    // Mobile nav: show dashboard links, hide sign-in
    var mobileOut = document.querySelectorAll('.mobile-logged-out');
    var mobileIn = document.querySelectorAll('.mobile-logged-in');
    for (var i = 0; i < mobileOut.length; i++) mobileOut[i].style.display = 'none';
    for (var j = 0; j < mobileIn.length; j++) mobileIn[j].style.display = 'block';

    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
      var dropdown = document.getElementById('member-dropdown');
      if (dropdown && !e.target.closest('.member-chip') && !e.target.closest('#member-dropdown')) {
        dropdown.classList.remove('open');
      }
    });
  }

  // --- AUT-05: Watchlist API helpers ---
  window.mmtWatchlistAdd = function(entryId, title, url) {
    var email = localStorage.getItem(EMAIL_KEY);
    if (!email) return;
    fetch('/.netlify/functions/member-watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, action: 'add', entry_id: entryId, entry_title: title, entry_url: url }),
    }).catch(function() {});
  };

  window.mmtWatchlistRemove = function(entryId) {
    var email = localStorage.getItem(EMAIL_KEY);
    if (!email) return;
    fetch('/.netlify/functions/member-watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, action: 'remove', entry_id: entryId }),
    }).catch(function() {});
  };

  // --- AUT-08: Read state API helper ---
  window.mmtMarkRead = function(entryId) {
    var email = localStorage.getItem(EMAIL_KEY);
    if (!email) return;
    fetch('/.netlify/functions/member-read-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, entry_id: entryId }),
    }).catch(function() {});
  };

  // --- Init ---
  // --- Floating "Back to Dashboard" button for premium users on public pages ---
  function initDashboardButton() {
    // Only show on public pages (not premium dashboard pages)
    if (window.location.pathname.startsWith('/premium/')) return;
    if (!isAtLeastPremium(getSubscriberStatus())) return;

    var btn = document.createElement('a');
    btn.href = '/premium/dashboard.html';
    btn.textContent = '★ Dashboard';
    btn.style.cssText = 'position:fixed;top:80px;left:24px;z-index:9998;background:#0A192F;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;font-family:Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity 0.2s;';
    btn.onmouseenter = function() { btn.style.opacity = '0.85'; };
    btn.onmouseleave = function() { btn.style.opacity = '1'; };
    document.body.appendChild(btn);
  }

  function init() {
    var status = getSubscriberStatus();
    applyPaywallVisibility();
    applyArticleGate();
    applyNavPremiumState();
    applyCIDelayedAccess(status);
    trackGateViews(status);
    initStickyBar();
    initDashboardButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
