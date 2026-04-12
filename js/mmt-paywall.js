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

  // --- Email prompt for gated actions ---
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

  // --- Init ---
  function init() {
    var status = getSubscriberStatus();
    applyPaywallVisibility();
    applyCIDelayedAccess(status);
    trackGateViews(status);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
