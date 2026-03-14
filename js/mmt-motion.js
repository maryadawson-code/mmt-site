// mmt-motion.js — Lightweight motion fallback (Sprint 2)
// GSAP spatial.js handles animations when available; this provides
// IntersectionObserver fallback for fade-up reveals.
(function() {
  'use strict';

  // Skip if GSAP spatial.js will handle animations
  if (typeof gsap !== 'undefined') return;

  // --- Fade-up reveal on scroll ---
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.fade-up').forEach(function(el) {
      observer.observe(el);
    });

    // Auto-apply fade-up to main sections
    document.querySelectorAll('main > section').forEach(function(s) {
      if (!s.classList.contains('fade-up')) {
        s.classList.add('fade-up');
        observer.observe(s);
      }
    });

    // Stagger grid children (skip cascade-3d-group — handled by spatial.js S6-07)
    document.querySelectorAll('main .grid').forEach(function(grid) {
      if (grid.classList.contains('cascade-3d-group')) return;
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
  }
})();
