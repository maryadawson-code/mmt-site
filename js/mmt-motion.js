// mmt-motion.js — Lightweight scroll reveal
// Only animates elements that are BELOW the fold on page load.
// Elements already visible in the viewport are never hidden.
(function() {
  'use strict';

  // Skip if GSAP is handling animations
  if (typeof gsap !== 'undefined') return;

  if (!('IntersectionObserver' in window)) return;

  // Opt in to the hidden pre-animation state ONLY now that this script is
  // running. The CSS keeps .fade-up fully visible until <html> has `js-anim`,
  // so if this script is ever blocked or errors (e.g. an embedded mobile
  // webview / corporate proxy), the page stays visible instead of going solid
  // white. This must be the same code path that reveals — see revealAll().
  document.documentElement.classList.add('js-anim');

  // Failsafe: nothing may stay hidden. If the observer never fires (mobile
  // webview quirks, bfcache restore, etc.), force-reveal everything.
  var revealed = false;
  function revealAll() {
    if (revealed) return;
    revealed = true;
    document.querySelectorAll('.fade-up').forEach(function(el) {
      el.classList.add('visible');
    });
  }
  // Belt-and-suspenders: reveal on load and after a hard timeout.
  window.addEventListener('load', function() { setTimeout(revealAll, 1200); });
  setTimeout(revealAll, 3000);

  // Immediately check if an element is in the viewport
  function isInViewport(el) {
    var rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });

  // Only add fade-up to elements that are NOT already in the viewport
  function safeAddFadeUp(el) {
    if (isInViewport(el)) {
      // Already visible — mark as visible immediately, never hide
      el.classList.add('fade-up', 'visible');
    } else {
      // Below fold — animate on scroll
      el.classList.add('fade-up');
      observer.observe(el);
    }
  }

  // Existing .fade-up elements
  document.querySelectorAll('.fade-up').forEach(function(el) {
    if (isInViewport(el)) {
      el.classList.add('visible');
    } else {
      observer.observe(el);
    }
  });

  // Auto-apply to main sections (skip first — hero)
  var mainSections = document.querySelectorAll('main > section');
  mainSections.forEach(function(s, i) {
    if (i === 0) return;
    if (!s.classList.contains('fade-up')) {
      safeAddFadeUp(s);
    }
  });

  // Stagger grid children — but ONLY below the fold
  document.querySelectorAll('main .grid').forEach(function(grid) {
    // If the grid itself is in viewport, don't animate children
    if (isInViewport(grid)) {
      return; // Skip — content should be visible immediately
    }
    var children = grid.children;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (!child.classList.contains('fade-up')) {
        child.classList.add('fade-up');
        child.style.transitionDelay = Math.min(i * 0.08, 0.4) + 's';
        observer.observe(child);
      }
    }
  });
})();
