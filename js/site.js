// site.js — Shared functionality for all pages
// Mobile menu toggle, search overlay, subscribe dropdown

// Mobile menu toggle
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    var toggle = document.getElementById('menuToggle');
    var menu = document.getElementById('mobileMenu');
    var openIcon = document.getElementById('menuOpen');
    var closeIcon = document.getElementById('menuClose');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = !menu.classList.contains('hidden');
      menu.classList.toggle('hidden');
      if (openIcon) openIcon.classList.toggle('hidden');
      if (closeIcon) closeIcon.classList.toggle('hidden');
      toggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });

    // Close menu when clicking a link inside it
    menu.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        menu.classList.add('hidden');
        if (openIcon) openIcon.classList.remove('hidden');
        if (closeIcon) closeIcon.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  });
})();

// Search overlay
(function() {
  var overlay = document.getElementById('searchOverlay');
  var input = document.getElementById('searchInput');
  var results = document.getElementById('searchResults');
  var btn = document.getElementById('searchToggle');
  var idx = null;
  if (!overlay || !btn) return;
  function openSearch() { overlay.classList.remove('hidden'); input.focus(); if (!idx) loadIdx(); }
  function closeSearch() { overlay.classList.add('hidden'); input.value = ''; results.innerHTML = ''; }
  btn.addEventListener('click', openSearch);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeSearch(); });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeSearch(); if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); } });
  function loadIdx() { fetch('/search-index.json').then(function(r){return r.json()}).then(function(d){idx=d}).catch(function(){}); }
  input.addEventListener('input', function() {
    if (!idx) return;
    var q = input.value.toLowerCase().trim();
    if (q.length < 2) { results.innerHTML = ''; return; }
    var matches = idx.filter(function(item) {
      return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || (item.tags||[]).some(function(t){return t.toLowerCase().includes(q)});
    }).slice(0, 8);
    if (matches.length === 0) { results.innerHTML = '<p class="text-sm py-4 text-center" style="color:var(--mmt-white-dim);">No results found.</p>'; return; }
    results.innerHTML = matches.map(function(m) {
      return '<a href="'+m.url+'" class="block p-3 rounded-lg no-underline hover:opacity-80 mb-2" style="background:var(--mmt-navy); border:1px solid rgba(0,229,250,0.1);">'
        + '<p class="text-sm font-bold" style="color:var(--mmt-white);">'+m.title+'</p>'
        + '<p class="text-xs mt-1" style="color:var(--mmt-white-dim);">'+m.date+'</p>'
        + '</a>';
    }).join('');
  });
})();

// Subscribe dropdown toggle
(function() {
  var btn = document.getElementById('subscribeToggle');
  var panel = document.getElementById('subscribePanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var open = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  });
  document.addEventListener('click', function(e) {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== btn) {
      panel.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });
})();

// CTA subscribe button (index.html)
(function() {
  var cta = document.getElementById('btn-cta-subscribe');
  var toggle = document.getElementById('subscribeToggle');
  if (cta && toggle) cta.addEventListener('click', function() { toggle.click(); });
})();

// Plausible custom events — track newsletter subscribe clicks
(function() {
  if (typeof plausible === 'undefined') return;
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (href.indexOf('newsletter-follow') !== -1) {
      plausible('Subscribe: LinkedIn');
    } else if (href.indexOf('buttondown.com') !== -1) {
      plausible('Subscribe: Email');
    }
  });
})();
