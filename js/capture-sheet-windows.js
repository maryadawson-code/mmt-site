// capture-sheet-windows.js — Keep Capture Intelligence window labels live
//
// The Capture Intelligence sheet carries deadline labels like
// "Proposals due April 17" or "Closes 05/15/2026" that were authored
// weeks ago. As time passes they should downgrade themselves:
//
//   > 14 days out  → "Due April 17 (in 32 days)"       — normal
//   8–14 days      → "Due April 17 (in 10 days) ⏱"     — watchlist
//   1–7 days       → "DUE April 17 — 3 days left ⚠"    — urgent
//   today          → "DUE TODAY"                        — red
//   past           → "CLOSED April 17"                  — muted
//
// The script also rewrites the "Updated Month YYYY" stamp if the
// stamp is more than one month old.
(function () {
  'use strict';

  var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var MONTH_LOOKUP = {};
  MONTH_NAMES.forEach(function (name, i) { MONTH_LOOKUP[name.toLowerCase()] = i; });

  function todayUTC() {
    var d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  // Parse a label like "Proposals due April 17" or "Closes 05/15/2026"
  // Returns { deadline: Date, label: string } or null.
  function parseDeadline(text) {
    if (!text) return null;
    var now = new Date();
    var currentYear = now.getUTCFullYear();

    // Numeric: MM/DD/YYYY or MM/DD
    var numMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
    if (numMatch) {
      var mo = parseInt(numMatch[1], 10) - 1;
      var day = parseInt(numMatch[2], 10);
      var year = numMatch[3] ? parseInt(numMatch[3], 10) : currentYear;
      if (mo >= 0 && mo < 12 && day >= 1 && day <= 31) {
        return { deadline: Date.UTC(year, mo, day), label: text.trim() };
      }
    }

    // "Month Day, YYYY" or "Month Day"
    var nameMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i);
    if (nameMatch) {
      var mo2 = MONTH_LOOKUP[nameMatch[1].toLowerCase()];
      var day2 = parseInt(nameMatch[2], 10);
      var year2 = nameMatch[3] ? parseInt(nameMatch[3], 10) : currentYear;
      // If the inferred date is more than 6 months in the past with no
      // explicit year, assume next year.
      var d = Date.UTC(year2, mo2, day2);
      if (!nameMatch[3] && d < todayUTC() - 180 * 86400000) {
        year2 = currentYear + 1;
        d = Date.UTC(year2, mo2, day2);
      }
      return { deadline: d, label: text.trim() };
    }
    return null;
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function rewriteLabel(el) {
    // Skip if we already processed this element (avoid double-rewrite on re-run)
    if (el.getAttribute('data-window-processed') === 'true') return;

    var text = el.textContent;
    var parsed = parseDeadline(text);
    if (!parsed) return;

    var today = todayUTC();
    var diff = daysBetween(today, parsed.deadline);

    // Extract the leading verb ("Proposals due", "Closes", etc.) if present
    var verbMatch = text.match(/^(Proposals due|Closes|Due|Responses due|Questions due|Response due)\s+/i);
    var verb = verbMatch ? verbMatch[1] : 'Due';
    var datePart = text.replace(/^(Proposals due|Closes|Due|Responses due|Questions due|Response due)\s+/i, '').trim();

    var newLabel = '';
    var cls = '';

    if (diff > 14) {
      newLabel = verb + ' ' + datePart + ' (in ' + diff + ' days)';
      cls = 'capture-window-future';
    } else if (diff >= 8) {
      newLabel = verb + ' ' + datePart + ' (in ' + diff + ' days) ⏱';
      cls = 'capture-window-watch';
    } else if (diff >= 1) {
      newLabel = 'DUE ' + datePart + ' — ' + diff + ' day' + (diff === 1 ? '' : 's') + ' left ⚠';
      cls = 'capture-window-urgent';
    } else if (diff === 0) {
      newLabel = 'DUE TODAY — ' + datePart;
      cls = 'capture-window-today';
    } else {
      newLabel = 'CLOSED ' + datePart;
      cls = 'capture-window-closed';
    }

    el.textContent = newLabel;
    el.classList.add(cls);
    el.setAttribute('data-window-processed', 'true');
    el.setAttribute('data-deadline-iso', new Date(parsed.deadline).toISOString().slice(0, 10));
  }

  function rewriteUpdatedStamp() {
    var candidates = document.querySelectorAll('.ci-table-count, [data-capture-updated]');
    var today = new Date();
    var currentStamp = MONTH_NAMES[today.getUTCMonth()] + ' ' + today.getUTCFullYear();
    candidates.forEach(function (el) {
      if (/Updated\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/.test(el.textContent)) {
        el.textContent = el.textContent.replace(
          /Updated\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/,
          'Updated ' + currentStamp
        );
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('capture-window-styles')) return;
    var s = document.createElement('style');
    s.id = 'capture-window-styles';
    s.textContent = [
      '.capture-window-future { color:#5C6B7A; }',
      '.capture-window-watch  { color:#92710A; font-weight:600; }',
      '.capture-window-urgent { color:#E63946; font-weight:700; }',
      '.capture-window-today  { color:#FFFFFF; background:#E63946; font-weight:700; padding:2px 8px; border-radius:4px; display:inline-block; }',
      '.capture-window-closed { color:#9CA3AF; text-decoration:line-through; }',
    ].join('\n');
    document.head.appendChild(s);
  }

  function run() {
    injectStyles();
    // Target: the .window column in the capture sheet table + any element
    // marked data-capture-window
    var selectors = [
      '.ci-table td.window span',
      '.ci-table td.window',
      'td.window .urgent',
      'td.window .muted',
      '[data-capture-window]',
    ];
    var seen = new Set();
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (seen.has(el)) return;
        seen.add(el);
        // Only rewrite the inner leaf — if the element has block children,
        // skip it and let the nested query catch the leaf.
        if (el.children && el.children.length > 0) {
          for (var i = 0; i < el.children.length; i++) {
            if (!seen.has(el.children[i])) {
              rewriteLabel(el.children[i]);
              seen.add(el.children[i]);
            }
          }
        } else {
          rewriteLabel(el);
        }
      });
    });
    rewriteUpdatedStamp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  // Re-run hourly so a page left open through midnight updates itself
  setInterval(run, 60 * 60 * 1000);
})();
