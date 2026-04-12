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

  // --- Cookie helpers ---
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // --- Tier detection ---
  function getSubscriberStatus() {
    // Cookie-based detection (primary for launch)
    if (getCookie('mmt_premium') === 'true') return 'premium';
    if (getCookie('mmt_subscriber') === 'true') return 'free';

    // localStorage fallback (from API-based flow)
    try {
      var cached = localStorage.getItem('mmt_tier_cache');
      if (cached) {
        var data = JSON.parse(cached);
        if (Date.now() - data.ts < 5 * 60 * 1000) {
          if (data.tier === 'premium') return 'premium';
          if (data.tier === 'subscriber') return 'free';
        }
      }
    } catch (e) {}

    return 'public';
  }

  // --- Gate logic ---
  function applyPaywallVisibility() {
    var status = getSubscriberStatus();

    // Set data attribute on body for CSS-based gating
    document.body.setAttribute("data-mmt-tier", status);

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

    // Gate contractor notes in glossary — 12-word teaser free, remainder gated
    var gatedNotes = document.querySelectorAll('.contractor-note-gated');
    if (gatedNotes.length > 0 && status !== 'premium') {
      for (var g = 0; g < gatedNotes.length; g++) {
        var note = gatedNotes[g];
        var fullText = note.textContent;
        var words = fullText.split(/\s+/);
        if (words.length <= 12) continue; // short notes stay fully visible
        var teaser = words.slice(0, 12).join(' ');
        var remainder = words.slice(12).join(' ');
        note.innerHTML = '<span style="color:var(--mmt-teal);font-weight:700;">★ Contractor note:</span> ' +
          teaser + '... ' +
          '<a href="/pricing.html" style="font-size:11px;font-weight:700;color:var(--mmt-teal);text-decoration:none;white-space:nowrap;">Unlock full note — Premium &rarr;</a>';
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
    return getSubscriberStatus() === "premium";
  };

  // --- Plausible gate view tracking ---
  function trackGateViews(status) {
    if (typeof plausible === 'undefined') return;
    if (status === 'premium') return; // No gates visible

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

  // --- Init ---
  function init() {
    var status = getSubscriberStatus();
    applyPaywallVisibility();
    applyCIDelayedAccess(status);
    trackGateViews(status);
    initStickyBar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
