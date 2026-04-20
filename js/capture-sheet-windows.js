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

  function hidePastRows() {
    // After rewriteLabel stamps elements with .capture-window-closed,
    // move the whole enclosing <tr> (or accordion) into a collapsed
    // "Past signals" section with a show/hide toggle. Signals don't
    // vanish — they're still available for reference — but they stop
    // competing for attention with live action windows.
    var closedEls = document.querySelectorAll('.capture-window-closed');
    if (closedEls.length === 0) return;

    // --- Table rows ---
    var pastRows = [];
    closedEls.forEach(function (el) {
      var tr = el.closest && el.closest('tr');
      if (tr && pastRows.indexOf(tr) === -1) pastRows.push(tr);
    });
    pastRows.forEach(function (tr) {
      tr.classList.add('capture-row-past');
      tr.style.display = 'none';
    });

    var anyTable = pastRows[0] && pastRows[0].closest('table');
    if (pastRows.length > 0 && anyTable && !document.getElementById('capture-past-toggle')) {
      var tfootRow = document.createElement('tr');
      tfootRow.id = 'capture-past-toggle';
      tfootRow.innerHTML = '<td colspan="5" style="text-align:center;padding:12px;background:#F9FAFB;font-size:13px;">' +
        '<button type="button" onclick="(function(){var rows=document.querySelectorAll(\'.capture-row-past\');var btn=document.getElementById(\'capture-past-toggle-btn\');var open=btn.getAttribute(\'data-open\')===\'true\';rows.forEach(function(r){r.style.display=open?\'none\':\'\';});btn.setAttribute(\'data-open\',open?\'false\':\'true\');btn.textContent=(open?\'Show \':\'Hide \')+' + pastRows.length + '+\' past signal' + (pastRows.length === 1 ? '' : 's') + '\';})();" id="capture-past-toggle-btn" data-open="false" style="background:transparent;border:0;color:#457B9D;font-weight:600;cursor:pointer;font-size:13px;">Show ' + pastRows.length + ' past signal' + (pastRows.length === 1 ? '' : 's') + '</button>' +
        '</td>';
      anyTable.querySelector('tbody').appendChild(tfootRow);
    }

    // --- Deep dive accordions ---
    var accordions = document.querySelectorAll('.acc-item, details.acc-item, .ci-deep-dive .acc-item');
    var pastAccordions = [];
    accordions.forEach(function (acc) {
      var closed = acc.querySelector('.capture-window-closed');
      if (closed) {
        acc.classList.add('capture-row-past');
        acc.style.display = 'none';
        pastAccordions.push(acc);
      }
    });
    if (pastAccordions.length > 0 && !document.getElementById('capture-deep-past-toggle')) {
      var dd = document.querySelector('.ci-deep-dive .wrap');
      if (dd) {
        var box = document.createElement('div');
        box.id = 'capture-deep-past-toggle';
        box.style.cssText = 'margin:24px 0;padding:14px 20px;background:#F9FAFB;border:1px dashed #D1D5DB;border-radius:10px;text-align:center;font-size:13px;';
        box.innerHTML = '<button type="button" onclick="(function(){var accs=document.querySelectorAll(\'.capture-row-past\');var btn=document.getElementById(\'capture-deep-past-btn\');var open=btn.getAttribute(\'data-open\')===\'true\';accs.forEach(function(a){if(a.classList.contains(\'acc-item\')||a.matches(\'details.acc-item\')){a.style.display=open?\'none\':\'\';}});btn.setAttribute(\'data-open\',open?\'false\':\'true\');btn.textContent=(open?\'Show \':\'Hide \')+' + pastAccordions.length + '+\' closed deep-dive signal' + (pastAccordions.length === 1 ? '' : 's') + '\';})();" id="capture-deep-past-btn" data-open="false" style="background:transparent;border:0;color:#457B9D;font-weight:600;cursor:pointer;font-size:13px;">Show ' + pastAccordions.length + ' closed deep-dive signal' + (pastAccordions.length === 1 ? '' : 's') + '</button>';
        dd.appendChild(box);
      }
    }

    // Update signal count banner
    var countEl = document.querySelector('.ci-table-count');
    if (countEl && !countEl.getAttribute('data-live-updated')) {
      var m = countEl.textContent.match(/(\d+)\s+signals/);
      if (m) {
        var total = parseInt(m[1], 10);
        var live = total - pastRows.length;
        countEl.textContent = countEl.textContent.replace(/(\d+)\s+signals/, live + ' live signals (' + pastRows.length + ' closed)');
        countEl.setAttribute('data-live-updated', 'true');
      }
    }
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
    hidePastRows();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  // Re-run hourly so a page left open through midnight updates itself
  setInterval(run, 60 * 60 * 1000);
})();
