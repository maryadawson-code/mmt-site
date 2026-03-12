// mmt-motion.js — Apple-inspired motion layer
// Scroll progress, nav blur deepening, reveal animations, card/button hover

(function() {
  'use strict';

  // --- Scroll Progress Bar ---
  var bar = document.createElement('div');
  bar.id = 'mmt-scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  bar.style.cssText = 'position:fixed;top:0;left:0;width:0%;height:2px;background:linear-gradient(90deg,#00E5FA 0%,#00FF85 100%);z-index:9999;pointer-events:none;transition:none;';
  document.body.appendChild(bar);

  // --- Nav blur deepening on scroll ---
  var nav = document.querySelector('.nav-glass');
  var scrolled = false;

  function onScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = pct + '%';

    if (nav) {
      var isScrolled = scrollTop > 40;
      if (isScrolled !== scrolled) {
        scrolled = isScrolled;
        nav.style.backdropFilter = isScrolled ? 'blur(16px)' : 'blur(8px)';
        nav.style.webkitBackdropFilter = isScrolled ? 'blur(16px)' : 'blur(8px)';
      }
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Reveal on scroll (.mmt-reveal) ---
  if ('IntersectionObserver' in window) {
    var revealStyle = document.createElement('style');
    revealStyle.textContent = [
      '.mmt-reveal{opacity:0;transform:translateY(24px);transition:opacity 0.6s ease-out,transform 0.6s ease-out;}',
      '.mmt-reveal.mmt-visible{opacity:1;transform:translateY(0);}',
      '.mmt-card{transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.25s ease;}',
      '.mmt-card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,229,250,0.12);}',
      '.mmt-btn-primary,.mmt-btn-secondary{transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);}',
      '.mmt-btn-primary:hover,.mmt-btn-secondary:hover{transform:translateY(-2px);}'
    ].join('\n');
    document.head.appendChild(revealStyle);

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('mmt-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    // Apply .mmt-reveal to sections in main
    var sections = document.querySelectorAll('main > section');
    sections.forEach(function(s) { s.classList.add('mmt-reveal'); observer.observe(s); });

    // Apply stagger to card grids
    var grids = document.querySelectorAll('.grid');
    grids.forEach(function(grid) {
      var children = grid.children;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        child.classList.add('mmt-reveal');
        child.style.transitionDelay = Math.min(i * 0.1, 0.5) + 's';
        observer.observe(child);
      }
    });

    // Apply .mmt-card to .card elements
    var cards = document.querySelectorAll('.card');
    cards.forEach(function(c) { c.classList.add('mmt-card'); });

    // Apply hover classes to buttons
    var primaryBtns = document.querySelectorAll('.btn-primary');
    primaryBtns.forEach(function(b) { b.classList.add('mmt-btn-primary'); });
    var secondaryBtns = document.querySelectorAll('.btn-secondary');
    secondaryBtns.forEach(function(b) { b.classList.add('mmt-btn-secondary'); });
  }
})();
