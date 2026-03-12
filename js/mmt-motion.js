// mmt-motion.js — Apple-inspired motion layer (S2-01)
(function() {
  'use strict';

  // --- Scroll Progress Bar ---
  var bar = document.createElement('div');
  bar.id = 'mmt-scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  bar.style.cssText = 'position:fixed;top:0;left:0;width:0%;height:2px;background:linear-gradient(90deg,#00E5FA 0%,#00FF85 100%);z-index:9999;pointer-events:none;transition:none;';
  document.body.appendChild(bar);

  // --- Scroll handler ---
  function onScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = pct + '%';
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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

    // Auto-apply fade-up to main sections that don't already have it
    document.querySelectorAll('main > section').forEach(function(s) {
      if (!s.classList.contains('fade-up')) {
        s.classList.add('fade-up');
        observer.observe(s);
      }
    });

    // Stagger grid children
    document.querySelectorAll('main .grid').forEach(function(grid) {
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
