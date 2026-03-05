// site.js — Shared functionality for all pages
// Mobile menu toggle, search overlay, subscribe dropdown

// Mobile menu toggle
(function() {
  var toggle = document.getElementById('menuToggle');
  var menu = document.getElementById('mobileMenu');
  if (toggle && menu) toggle.addEventListener('click', function() {
    menu.classList.toggle('hidden');
    document.getElementById('menuOpen').classList.toggle('hidden');
    document.getElementById('menuClose').classList.toggle('hidden');
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

// ============================================================
// Mission Meets Tech — main.js
// Handles: nav, newsletter loader with captures/tags, filtering
// ============================================================

// --- Mobile Navigation ---
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
  });
}

// Close nav on link click
document.querySelectorAll('.nav-menu a').forEach(link => {
  link.addEventListener('click', () => {
    navMenu.classList.remove('active');
    navToggle.classList.remove('active');
  });
});

// --- Smooth Scroll ---
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// --- Scroll Animations ---
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, observerOptions);

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// ============================================================
// NEWSLETTER LOADER WITH CAPTURES & FILTERING
// ============================================================

let allNewsletters = [];
let activeFilter = null;

/**
 * Build a tag chip element.
 * @param {string} label - Display text
 * @param {'program'|'source'} type - Chip type
 * @param {string|null} anchor - resources.html anchor for source chips
 */
function buildTagChip(label, type, anchor = null) {
  const chip = document.createElement('span');
  chip.className = `tag-chip tag-chip--${type}`;
  chip.textContent = label;
  chip.setAttribute('data-tag', label);
  chip.setAttribute('data-type', type);
  if (anchor) chip.setAttribute('data-anchor', anchor);

  chip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (type === 'program') {
      // Filter the feed
      handleProgramTagClick(label, chip);
    } else if (type === 'source') {
      // Open resources page at the right anchor
      const dest = anchor
        ? `/resources.html#${anchor}`
        : '/resources.html';
      window.location.href = dest;
    }
  });

  return chip;
}

/**
 * Filter the newsfeed by program tag.
 * If already active, clicking again clears the filter.
 */
function handleProgramTagClick(label, clickedChip) {
  if (activeFilter === label) {
    // Clear filter
    activeFilter = null;
    renderNewsletters(allNewsletters);
    clearFilterBanner();
    document.querySelectorAll('.tag-chip--program').forEach(c => c.classList.remove('active'));
  } else {
    activeFilter = label;
    const filtered = allNewsletters.filter(item =>
      item.captures?.programs?.includes(label) ||
      item.tags?.includes(label)
    );
    renderNewsletters(filtered);
    showFilterBanner(label);
    // Highlight matching chips across all cards
    document.querySelectorAll('.tag-chip--program').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-tag') === label);
    });
  }
}

/**
 * Show a filter banner above the grid.
 */
function showFilterBanner(label) {
  let banner = document.getElementById('filter-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'filter-banner';
    banner.className = 'filter-banner';
    const grid = document.getElementById('recent-issues');
    if (grid) grid.parentNode.insertBefore(banner, grid);
  }
  banner.innerHTML = `
    <span>Filtered: <strong>${label}</strong></span>
    <button class="filter-clear" onclick="clearAllFilters()">Clear ✕</button>
  `;
  banner.style.display = 'flex';
}

function clearFilterBanner() {
  const banner = document.getElementById('filter-banner');
  if (banner) banner.style.display = 'none';
}

// Exposed globally for inline onclick in banner
window.clearAllFilters = function () {
  activeFilter = null;
  renderNewsletters(allNewsletters);
  clearFilterBanner();
  document.querySelectorAll('.tag-chip--program').forEach(c => c.classList.remove('active'));
};

/**
 * Render newsletter cards into #recent-issues.
 */
function renderNewsletters(items) {
  const container = document.getElementById('recent-issues');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        <p>No issues found for that topic.</p>
        <button class="btn btn-secondary" onclick="clearAllFilters()">Show all issues</button>
      </div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    // Build program tag chips HTML
    const programTags = (item.captures?.programs || item.tags || [])
      .map(tag => `<span class="tag-chip tag-chip--program" data-tag="${tag}" data-type="program">${tag}</span>`)
      .join('');

    // Build source link chips HTML
    const sourceTags = (item.captures?.sources || [])
      .map(src => `<a class="tag-chip tag-chip--source" href="/resources.html#${src.anchor || ''}" data-tag="${src.label}" data-type="source">${src.label} ↗</a>`)
      .join('');

    const resourceAnchor = item.captures?.sources?.[0]?.anchor || '';

    return `
      <article class="glass-card issue-card fade-in">
        <div class="issue-card__meta">
          <time class="issue-date">${item.date}</time>
        </div>
        <h3 class="issue-title">
          <a href="${item.url}" target="_blank" rel="noopener">${item.title}</a>
        </h3>
        <p class="issue-description">${item.description}</p>

        ${programTags ? `<div class="tag-row tag-row--programs" aria-label="Topics">${programTags}</div>` : ''}

        ${sourceTags ? `
        <div class="tag-row tag-row--sources" aria-label="Source documents">
          <span class="tag-row__label">Sources:</span>
          ${sourceTags}
        </div>` : ''}

        <div class="issue-card__footer">
          <a href="${item.url}" target="_blank" rel="noopener" class="btn btn-text">Read →</a>
          ${resourceAnchor ? `<a href="/resources.html#${resourceAnchor}" class="btn btn-text btn-text--muted">Related Resources →</a>` : ''}
        </div>
      </article>
    `;
  }).join('');

  // Attach program tag click handlers (replaces inline event listeners)
  container.querySelectorAll('.tag-chip--program').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleProgramTagClick(chip.getAttribute('data-tag'), chip);
    });
  });
}

/**
 * Load newsletters from JSON and initialize.
 */
async function loadNewsletters() {
  const container = document.getElementById('recent-issues');
  if (!container) return;

  // Check for pre-filtered tag from URL param (e.g. ?filter=DHA)
  const params = new URLSearchParams(window.location.search);
  const urlFilter = params.get('filter');

  try {
    const response = await fetch('/newsletters.json');
    if (!response.ok) throw new Error('Failed to load newsletters');
    allNewsletters = await response.json();

    if (urlFilter) {
      activeFilter = urlFilter;
      const filtered = allNewsletters.filter(item =>
        item.captures?.programs?.includes(urlFilter) ||
        item.tags?.includes(urlFilter)
      );
      renderNewsletters(filtered);
      showFilterBanner(urlFilter);
    } else {
      renderNewsletters(allNewsletters);
    }
  } catch (error) {
    console.error('Newsletter load error:', error);
    container.innerHTML = `
      <div class="load-error">
        <p>Couldn't load recent issues. <a href="https://www.linkedin.com/newsletters/mission-meets-tech-7307800960485969920/">Read on LinkedIn →</a></p>
      </div>`;
  }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadNewsletters();
});
