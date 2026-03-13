// nav-active.js — Highlight current page in nav
(function () {
  'use strict';
  // Normalize path: get just the filename
  var path = window.location.pathname.split('/').pop() || 'index.html';
  if (!path || path === '') path = 'index.html';

  // Map child pages to their parent nav link
  var parentMap = {
    'about-team.html': 'about.html',
    'about-press.html': 'about.html',
    'tactical-brief-confirmed.html': 'tactical-brief.html',
    'contract-tracker.html': 'resources.html',
    'agency-sources.html': 'resources.html',
    'glossary.html': 'resources.html',
    'contracting.html': 'resources.html',
    'newswire.html': 'latest.html',
    'topics.html': 'latest.html',
    'newsletter.html': 'latest.html',
    'events.html': 'about.html',
    'privacy.html': 'about.html'
  };

  var target = parentMap[path] || path;

  function highlightNav(selector) {
    document.querySelectorAll(selector).forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      href = href.split('/').pop() || 'index.html';
      if (href === target) {
        link.style.color = 'var(--mmt-cyan)';
        link.classList.remove('font-medium');
        link.classList.add('font-semibold');
      } else {
        link.style.color = 'var(--mmt-white-muted)';
        link.classList.remove('font-semibold');
        link.classList.add('font-medium');
      }
    });
  }

  // Desktop nav links
  highlightNav('nav .hidden.md\\:flex > a[href]');
  // Mobile nav links
  highlightNav('#mobileMenu a[href]');
})();
