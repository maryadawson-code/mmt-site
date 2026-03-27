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
        link.style.color = 'var(--mmt-teal, #457B9D)';
        link.classList.remove('font-medium');
        link.classList.add('font-semibold');
        // Add subtle active indicator
        if (selector.includes('md\\:flex')) {
          link.style.position = 'relative';
          var dot = document.createElement('span');
          dot.style.cssText = 'position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--mmt-teal, #457B9D);';
          dot.setAttribute('aria-hidden', 'true');
          link.appendChild(dot);
        }
      } else {
        link.style.color = 'var(--mmt-text-secondary, #5C6B7A)';
        link.classList.remove('font-semibold');
        link.classList.add('font-medium');
      }
    });
  }

  // Desktop nav links
  highlightNav('nav .hidden.md\\:flex > a[href]');
  // Mobile nav links
  highlightNav('#mobileMenu a[href]');

  // Dynamic copyright year
  var year = new Date().getFullYear();
  document.querySelectorAll('footer p').forEach(function (p) {
    if (p.textContent.indexOf('Mission Meets Tech. All rights reserved') > -1) {
      p.innerHTML = p.innerHTML.replace(/\u00a9\s*\d{4}/, '\u00a9 ' + year);
    }
  });
})();
