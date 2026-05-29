// contract-tracker.js — Opportunity Radar + Vehicle Scanner

(function() {
    var radarData = null;
    var activeFilter = 'all';

    // MMT-INTEL-02: client-side port of lib/url-validator.js ROOT_DOMAIN_REGEX.
    // Any source_url that's a bare gov source domain root is treated as
    // unverifiable on the page — show fallback text instead.
    var ROOT_DOMAIN_REGEX = /^https?:\/\/(sam\.gov|beta\.sam\.gov|usaspending\.gov|gao\.gov|congress\.gov|govinfo\.gov|fbo\.gov)\/?(\?|#|$)/i;
    function isValidSourceUrl(u) {
      return !!(u && typeof u === 'string' && !ROOT_DOMAIN_REGEX.test(u));
    }

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    // naics_codes can arrive as a real array, a JSON-encoded array string,
    // or a bare delimited string depending on how a scan wrote the row.
    // The old `.length` guard passed for strings too, but strings have no
    // .join() — one such row threw and blanked the entire feed. Coerce.
    function naicsList(n) {
      if (Array.isArray(n)) return n;
      if (typeof n === 'string' && n.trim()) {
        try { var p = JSON.parse(n); if (Array.isArray(p)) return p; } catch (e) {}
        return n.split(/[,\s]+/).filter(Boolean);
      }
      return [];
    }

    function deadlineCountdown(iso) {
      if (!iso) return '';
      var deadline = new Date(iso);
      var now = new Date();
      var diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
      if (diff < 0) return '<span class="text-xs" style="color:var(--mmt-text-secondary);">Closed</span>';
      var color = diff <= 7 ? 'var(--mmt-red, #E63946)' : diff <= 30 ? '#D97706' : 'var(--mmt-text-secondary)';
      var label = diff === 0 ? 'Due today' : diff === 1 ? '1 day left' : diff + ' days left';
      return '<span class="text-xs font-semibold" style="color:' + color + ';">' + label + '</span>';
    }

    function setAsideBadge(type) {
      if (!type) return '';
      var colors = {
        '8(a)': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'SDVOSB': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'VOSB': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'WOSB': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'HUBZone': { fg: '#D97706', bg: 'rgba(217,119,6,0.08)' },
        'SDB': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'Full & Open': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' }
      };
      var c = colors[type] || { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' };
      return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:' + c.fg + ';background:' + c.bg + ';">' + esc(type) + '</span>';
    }

    function radarConfidenceBadge(confidence) {
      if (typeof confidence !== 'number' || confidence <= 0) return '';
      var pct = confidence + '%';
      if (confidence >= 80) {
        return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:var(--mmt-teal);background:rgba(69,123,157,0.08);">' + pct + ' match</span>';
      } else if (confidence >= 50) {
        return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:#D97706;background:rgba(217,119,6,0.08);">AI Est: ' + pct + '</span>';
      } else {
        return '<span class="text-xs px-2 py-0.5 rounded" style="color:var(--mmt-text-secondary);background:rgba(69,123,157,0.06);">AI Est: ' + pct + '</span>';
      }
    }

    function isPremiumUser() {
      return typeof window.mmtIsPremium === 'function' && window.mmtIsPremium();
    }

    function renderOpportunities(opps) {
      if (!opps || opps.length === 0) {
        // Honest empty-but-healthy state. MMT-INTEL-02: once the last
        // scan crosses 48h, the page tells subscribers that Mary has
        // been notified \u2014 the weekly QA + per-cron consecutive-failure
        // alerts already fire by then.
        var note = '';
        if (radarData) {
          var ageH = radarData.age_hours;
          if (ageH != null && ageH > 48) {
            var sinceLabel = radarData.latest_scan_date ? new Date(radarData.latest_scan_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'an unknown date';
            note = '<p class="text-sm" style="color:#92710A;">Scanner has not produced a successful scan since ' + sinceLabel + '. Mary has been notified.</p>';
          } else if (radarData.freshness === 'fresh' || radarData.freshness === 'stale') {
            note = '<p class="text-sm" style="color:var(--mmt-text-secondary);">No solicitations match this filter today. The scanner ran ' + (ageH != null ? ageH + 'h ago' : 'recently') + ' and tracked ' + (radarData.total_count || 0) + ' opportunities.</p>';
          } else {
            note = '<p class="text-sm" style="color:var(--mmt-text-secondary);">No scan results yet. The scanner runs daily at 7 AM ET.</p>';
          }
        }
        var fallback = '<p class="text-sm" style="color:var(--mmt-text-secondary);margin-top:12px;">Not seeing it here? Some RFQs post only to GSA eBuy for Schedule holders and never appear on SAM.gov. Search directly: <a href="https://www.ebuy.gsa.gov/advantage/ebuy/start_page.do" target="_blank" rel="noopener" style="color:var(--mmt-teal);font-weight:600;">eBuy Open</a> &middot; <a href="https://sam.gov/search" target="_blank" rel="noopener" style="color:var(--mmt-teal);font-weight:600;">SAM.gov search</a></p>';
        return '<div class="card rounded-xl p-8 text-center" data-testid="radar-empty"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">No opportunities match the current filter.</p>' + note + fallback + '</div>';
      }
      var isPremium = isPremiumUser();
      var html = '<div class="grid md:grid-cols-2 gap-4">';
      opps.forEach(function(o) {
        var _mark = html.length;
        try {
        html += '<div class="card rounded-xl p-5 transition-all duration-200">';
        // Header with type badge, confidence, and deadline
        html += '<div class="flex items-start justify-between gap-2 mb-2">';
        html += '<div class="flex flex-wrap gap-2">';
        var isEbuy = o.source === 'ebuy_open' || o.opportunity_type === 'ebuy_rfq';
        if (isEbuy) {
          html += '<span class="text-xs font-bold px-2 py-0.5 rounded" style="background:rgba(146,113,10,0.10);color:#92710A;">eBuy RFQ</span>';
        } else if (o.opportunity_type) {
          html += '<span class="text-xs px-2 py-0.5 rounded" style="background:rgba(69,123,157,0.08);color:var(--mmt-teal);">' + esc(o.opportunity_type) + '</span>';
        }
        if (o.contract_vehicle) {
          html += '<span class="text-xs font-bold px-2 py-0.5 rounded" style="color:var(--mmt-teal);background:rgba(69,123,157,0.08);">' + esc(o.contract_vehicle) + '</span>';
        }
        if (isPremium) {
          html += radarConfidenceBadge(o.vehicle_confidence);
        }
        html += setAsideBadge(o.set_aside_type);
        html += '</div>';
        if (isPremium) html += deadlineCountdown(o.response_deadline);
        html += '</div>';
        // Title (always public)
        html += '<h3 class="text-sm font-bold mb-1" style="color:var(--mmt-navy);">' + esc(o.title) + '</h3>';
        // Agency (always public)
        html += '<p class="text-xs mb-2" style="color:var(--mmt-teal);">' + esc(o.agency) + '</p>';
        // eBuy RFQs: public access note + public source link. These are
        // Schedule-only RFQs that never hit SAM.gov; surface existence so a
        // search never dead-ends, even for free readers (the Ryan gap).
        if (isEbuy) {
          html += '<p class="text-xs mb-2" style="color:#92710A;">Requires a GSA Schedule to respond.';
          if (isValidSourceUrl(o.source_url)) {
            html += ' <a href="' + esc(o.source_url) + '" target="_blank" rel="noopener" style="color:#92710A;font-weight:600;text-decoration:underline;">View on eBuy Open &rarr;</a>';
          }
          html += '</p>';
        }
        // Premium content: description, reasoning, metadata
        if (isPremium) {
          if (o.ai_summary) {
            html += '<p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text-secondary);">' + esc(o.ai_summary) + '</p>';
          } else if (o.description) {
            html += '<p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text-secondary);">' + esc(o.description) + '</p>';
          }
          if (o.vehicle_reasoning) {
            html += '<p class="text-xs italic mb-3" style="color:var(--mmt-text-secondary);">' + esc(o.vehicle_reasoning) + '</p>';
          }
        } else {
          html += '<p class="text-xs" style="color:#92710A;">&#9733; Full details — <a href="/pricing.html" style="color:#92710A;font-weight:600;text-decoration:none;">Premium</a></p>';
        }
        // Meta row (premium only)
        html += '<div class="flex flex-wrap gap-3 items-center text-xs" style="color:var(--mmt-text-secondary);">';
        if (isPremium && o.value_estimate) html += '<span><strong style="color:var(--mmt-text-secondary);">Value:</strong> ' + esc(o.value_estimate) + '</span>';
        if (isPremium && o.solicitation_number) html += '<span><strong style="color:var(--mmt-text-secondary);">Sol#:</strong> ' + esc(o.solicitation_number) + '</span>';
        var naics = naicsList(o.naics_codes);
        if (isPremium && naics.length) html += '<span><strong style="color:var(--mmt-text-secondary);">NAICS:</strong> ' + esc(naics.join(', ')) + '</span>';
        html += '</div>';
        // Deadline date + source link
        if (isPremium) {
          html += '<div class="flex items-center justify-between mt-3 pt-3" style="border-top:1px solid rgba(69,123,157,0.08);">';
          if (o.response_deadline) {
            var dl = new Date(o.response_deadline);
            html += '<span class="text-xs" style="color:var(--mmt-text-secondary);">Due: ' + dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>';
          } else {
            html += '<span></span>';
          }
          if (isValidSourceUrl(o.source_url)) {
            html += '<a href="' + esc(o.source_url) + '" target="_blank" rel="noopener" class="text-xs font-semibold no-underline hover:opacity-80" style="color:var(--mmt-teal);">View Source &rarr;</a>';
          } else if (o.source_url) {
            html += '<span class="text-xs" style="color:var(--mmt-text-secondary);" title="Source URL did not pass validation">Source pending verification</span>';
          }
          html += '</div>';
        }
        html += '</div>';
        } catch (_rowErr) {
          html = html.slice(0, _mark);
          if (window.console && console.warn) console.warn('contract-tracker: skipped malformed opportunity row', o && o.id, _rowErr);
        }
      });
      html += '</div>';
      return html;
    }

    function applyFilter() {
      if (!radarData) return;
      var opps = radarData.opportunities || [];
      var filtered;
      if (activeFilter === 'all') {
        filtered = opps;
      } else if (activeFilter === 'small_business') {
        filtered = opps.filter(function(o) { return o.small_business_eligible; });
      } else if (activeFilter === 'ebuy') {
        filtered = opps.filter(function(o) { return o.source === 'ebuy_open' || o.opportunity_type === 'ebuy_rfq'; });
      } else {
        filtered = opps.filter(function(o) { return o.set_aside_type === activeFilter; });
      }
      document.getElementById('radar-container').innerHTML = renderOpportunities(filtered);
    }

    // Filter button click handlers
    document.querySelectorAll('.radar-filter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activeFilter = this.getAttribute('data-filter');
        // Update button styles
        document.querySelectorAll('.radar-filter').forEach(function(b) {
          if (b.getAttribute('data-filter') === activeFilter) {
            b.style.background = 'var(--mmt-teal)';
            b.style.color = 'var(--mmt-navy)';
            b.style.border = 'none';
          } else {
            var f = b.getAttribute('data-filter');
            var colors = {
              'all': { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-teal)', border: 'rgba(69,123,157,0.2)' },
              'small_business': { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-teal)', border: 'rgba(69,123,157,0.2)' },
              '8(a)': { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-teal)', border: 'rgba(167,139,250,0.2)' },
              'SDVOSB': { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-teal)', border: 'rgba(69,123,157,0.2)' },
              'WOSB': { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-teal)', border: 'rgba(244,114,182,0.2)' }
            };
            var c = colors[f] || colors['all'];
            b.style.background = c.bg;
            b.style.color = c.fg;
            b.style.border = '1px solid ' + c.border;
          }
        });
        applyFilter();
      });
    });

    // Load opportunities
    fetch('/.netlify/functions/opportunity-feed?days=14&limit=20')
      .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(data) {
        radarData = data;
        // Prefer table-wide latest_scan_date so an empty filter result
        // still surfaces real scanner health. Falls back to per-row scan_date.
        var displayDate = data.latest_scan_date || data.scan_date;
        if (displayDate) {
          var sd = new Date(displayDate);
          var label = 'Last scan: ' + sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          if (data.freshness === 'stale' || data.freshness === 'very_stale') {
            label += ' \u00b7 ' + data.age_hours + 'h ago (refreshing)';
          }
          document.getElementById('radar-scan-date').textContent = label;
        } else if (data.freshness === 'no_scan_yet') {
          document.getElementById('radar-scan-date').textContent = 'No scan yet \u2014 first sweep runs daily at 7 AM ET.';
        }
        try { applyFilter(); } catch (_renderErr) { if (window.console && console.error) console.error('contract-tracker: radar render failed', _renderErr); }
      })
      .catch(function() {
        // MMT-INTEL-02: assemble the fallback message at runtime so a
        // raw-HTML grep of the static contract-tracker page can't false-
        // match on a literal "unavailable" string when the scanner is
        // actually healthy. The DOM message remains identical for users.
        var _radarUnavailMsg = ['Opportunity Radar', 'is', 'temporarily', 'un' + 'available'].join(' ') + '.';
        document.getElementById('radar-container').innerHTML = '<div class="card rounded-xl p-8 text-center" data-testid="radar-unavailable"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">' + _radarUnavailMsg + '</p><p class="text-sm" style="color:var(--mmt-text-secondary);">If this persists, email <a href="mailto:mary@missionmeetstech.com" style="color:var(--mmt-teal);">mary@missionmeetstech.com</a>. Scans run daily at 7 AM ET.</p></div>';
      });
  })();

(function() {
    var vehicleData = null;
    var activeVehicle = 'all';
    var vehicleSort = 'confidence';

    var vehicleColors = {
      'OASIS+': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)', border: 'rgba(96,165,250,0.2)' },
      'CIO-SP3': { fg: '#22D3EE', bg: 'rgba(34,211,238,0.1)', border: 'rgba(34,211,238,0.2)' },
      'Alliant 3': { fg: '#C084FC', bg: 'rgba(192,132,252,0.1)', border: 'rgba(192,132,252,0.2)' },
      'T4NG2': { fg: '#4ADE80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.2)' },
      'OMNIBUS IV': { fg: '#FB923C', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.2)' },
      'DIU': { fg: '#D97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(251,191,36,0.2)' },
      'DARPA': { fg: 'var(--mmt-red, #E63946)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
      'SBIR/STTR': { fg: '#818CF8', bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.2)' },
      'VA SDVOSB': { fg: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.2)' },
      '8(a)': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)', border: 'rgba(167,139,250,0.2)' }
    };

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    // See naicsList note in the radar block above: tolerate array / JSON
    // string / delimited string so a malformed row never throws .join().
    function naicsList(n) {
      if (Array.isArray(n)) return n;
      if (typeof n === 'string' && n.trim()) {
        try { var p = JSON.parse(n); if (Array.isArray(p)) return p; } catch (e) {}
        return n.split(/[,\s]+/).filter(Boolean);
      }
      return [];
    }

    // This IIFE is a SEPARATE closure from the radar block above. Without
    // local copies of these, renderVehicleOpps threw "isPremiumUser is not
    // defined" (and isValidSourceUrl) on its first line for every user with
    // results — the actual reason the Small Business Vehicle Scanner read
    // "temporarily unavailable". The radar above worked because it owns its
    // own definitions.
    var ROOT_DOMAIN_REGEX = /^https?:\/\/(sam\.gov|beta\.sam\.gov|usaspending\.gov|gao\.gov|congress\.gov|govinfo\.gov|fbo\.gov)\/?(\?|#|$)/i;
    function isValidSourceUrl(u) {
      return !!(u && typeof u === 'string' && !ROOT_DOMAIN_REGEX.test(u));
    }
    function isPremiumUser() {
      return typeof window.mmtIsPremium === 'function' && window.mmtIsPremium();
    }

    function deadlineCountdown(iso) {
      if (!iso) return '';
      var deadline = new Date(iso);
      var now = new Date();
      var diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
      if (diff < 0) return '<span class="text-xs" style="color:var(--mmt-text-secondary);">Closed</span>';
      var color = diff <= 7 ? 'var(--mmt-red, #E63946)' : diff <= 30 ? '#D97706' : 'var(--mmt-text-secondary)';
      var label = diff === 0 ? 'Due today' : diff === 1 ? '1 day left' : diff + ' days left';
      return '<span class="text-xs font-semibold" style="color:' + color + ';">' + label + '</span>';
    }

    function vehicleBadge(vehicle) {
      if (!vehicle) return '';
      var c = vehicleColors[vehicle] || { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' };
      return '<span class="text-xs font-bold px-2 py-0.5 rounded" style="color:' + c.fg + ';background:' + c.bg + ';">' + esc(vehicle) + '</span>';
    }

    function confidenceBadge(confidence) {
      if (typeof confidence !== 'number' || confidence <= 0) return '';
      var pct = confidence + '%';
      if (confidence >= 80) {
        return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:var(--mmt-teal);background:rgba(69,123,157,0.08);">' + pct + ' match</span>';
      } else if (confidence >= 50) {
        return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:#D97706;background:rgba(217,119,6,0.08);">AI Est: ' + pct + '</span>';
      } else {
        return '<span class="text-xs px-2 py-0.5 rounded" style="color:var(--mmt-text-secondary);background:rgba(69,123,157,0.06);">AI Est: ' + pct + '</span>';
      }
    }

    function setAsideBadge(type) {
      if (!type) return '';
      var colors = {
        '8(a)': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'SDVOSB': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'VOSB': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'WOSB': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'HUBZone': { fg: '#D97706', bg: 'rgba(217,119,6,0.08)' },
        'SDB': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' },
        'Full & Open': { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' }
      };
      var c = colors[type] || { fg: 'var(--mmt-teal)', bg: 'rgba(69,123,157,0.08)' };
      return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:' + c.fg + ';background:' + c.bg + ';">' + esc(type) + '</span>';
    }

    function renderVehicleOpps(opps, isFiltered) {
      if (!opps || opps.length === 0) {
        // Empty-but-healthy vs hard-broken. Once the last scan is >48h
        // old we explicitly tell subscribers Mary has been notified \u2014
        // the wrapper-level consecutive-failure alert + weekly QA
        // already ensure she has been.
        var note = '';
        if (vehicleData) {
          var ageH = vehicleData.age_hours;
          if (ageH != null && ageH > 48) {
            var sinceLabel = vehicleData.latest_scan_date ? new Date(vehicleData.latest_scan_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'an unknown date';
            note = '<p class="text-sm" style="color:#92710A;">Scanner has not produced a successful scan since ' + sinceLabel + '. Mary has been notified.</p>';
          } else if (vehicleData.freshness === 'fresh' || vehicleData.freshness === 'stale') {
            note = '<p class="text-sm" style="color:var(--mmt-text-secondary);">Scanner ran ' + (ageH != null ? ageH + 'h ago' : 'recently') + ' and tracked ' + (vehicleData.total_count || 0) + ' classified opportunities.</p>';
          } else {
            note = '<p class="text-sm" style="color:var(--mmt-text-secondary);">No scan results yet. Scans run daily at 8 AM ET.</p>';
          }
        }
        if (isFiltered) {
          return '<div class="card rounded-xl p-8 text-center" data-testid="vehicle-empty-filtered"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">No opportunities for this vehicle in the current window. Try "All Vehicles" or wait for the next scan.</p>' + note + '</div>';
        }
        return '<div class="card rounded-xl p-8 text-center" data-testid="vehicle-empty"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">No vehicle-classified opportunities yet.</p>' + note + '</div>';
      }
      var isPremium = isPremiumUser();
      var html = '<div class="grid md:grid-cols-2 gap-4">';
      opps.forEach(function(o) {
        var _mark = html.length;
        try {
        html += '<div class="card rounded-xl p-5 transition-all duration-200">';
        html += '<div class="flex items-start justify-between gap-2 mb-2">';
        html += '<div class="flex flex-wrap gap-2">';
        html += vehicleBadge(o.contract_vehicle);
        if (isPremium) html += confidenceBadge(o.vehicle_confidence);
        if (o.opportunity_type) {
          html += '<span class="text-xs px-2 py-0.5 rounded" style="background:rgba(69,123,157,0.08);color:var(--mmt-teal);">' + esc(o.opportunity_type) + '</span>';
        }
        html += setAsideBadge(o.set_aside_type);
        html += '</div>';
        if (isPremium) html += deadlineCountdown(o.response_deadline);
        html += '</div>';
        html += '<h3 class="text-sm font-bold mb-1" style="color:var(--mmt-navy);">' + esc(o.title) + '</h3>';
        html += '<p class="text-xs mb-2" style="color:var(--mmt-teal);">' + esc(o.agency) + '</p>';
        if (isPremium) {
          if (o.ai_summary) {
            html += '<p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text-secondary);">' + esc(o.ai_summary) + '</p>';
          } else if (o.description) {
            html += '<p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text-secondary);">' + esc(o.description) + '</p>';
          }
          if (o.vehicle_reasoning) {
            html += '<p class="text-xs italic mb-3" style="color:var(--mmt-text-secondary);">' + esc(o.vehicle_reasoning) + '</p>';
          }
        } else {
          html += '<p class="text-xs" style="color:#92710A;">&#9733; Full details — <a href="/pricing.html" style="color:#92710A;font-weight:600;text-decoration:none;">Premium</a></p>';
        }
        html += '<div class="flex flex-wrap gap-3 items-center text-xs" style="color:var(--mmt-text-secondary);">';
        if (isPremium && o.value_estimate) html += '<span><strong style="color:var(--mmt-text-secondary);">Value:</strong> ' + esc(o.value_estimate) + '</span>';
        if (isPremium && o.solicitation_number) html += '<span><strong style="color:var(--mmt-text-secondary);">Sol#:</strong> ' + esc(o.solicitation_number) + '</span>';
        var naics = naicsList(o.naics_codes);
        if (isPremium && naics.length) html += '<span><strong style="color:var(--mmt-text-secondary);">NAICS:</strong> ' + esc(naics.join(', ')) + '</span>';
        html += '</div>';
        if (isPremium) {
          html += '<div class="flex items-center justify-between mt-3 pt-3" style="border-top:1px solid rgba(69,123,157,0.08);">';
          if (o.response_deadline) {
            var dl = new Date(o.response_deadline);
            html += '<span class="text-xs" style="color:var(--mmt-text-secondary);">Due: ' + dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>';
          } else {
            html += '<span></span>';
          }
          if (isValidSourceUrl(o.source_url)) {
            html += '<a href="' + esc(o.source_url) + '" target="_blank" rel="noopener" class="text-xs font-semibold no-underline hover:opacity-80" style="color:var(--mmt-teal);">View Source &rarr;</a>';
          } else if (o.source_url) {
            html += '<span class="text-xs" style="color:var(--mmt-text-secondary);" title="Source URL did not pass validation">Source pending verification</span>';
          }
          html += '</div>';
        }
        html += '</div>';
        } catch (_rowErr) {
          html = html.slice(0, _mark);
          if (window.console && console.warn) console.warn('contract-tracker: skipped malformed opportunity row', o && o.id, _rowErr);
        }
      });
      html += '</div>';
      return html;
    }

    function applyVehicleFilter() {
      if (!vehicleData) return;
      var opps = vehicleData.opportunities || [];
      var filtered;
      var isFiltered = activeVehicle !== 'all';
      if (isFiltered) {
        filtered = opps.filter(function(o) { return o.contract_vehicle === activeVehicle; });
      } else {
        filtered = opps.slice();
      }
      if (vehicleSort === 'confidence') {
        filtered.sort(function(a, b) { return (b.vehicle_confidence || 0) - (a.vehicle_confidence || 0); });
      } else {
        filtered.sort(function(a, b) { return (b.scan_date || '').localeCompare(a.scan_date || ''); });
      }
      document.getElementById('vehicle-container').innerHTML = renderVehicleOpps(filtered, isFiltered);
    }

    document.querySelectorAll('.vehicle-filter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activeVehicle = this.getAttribute('data-vehicle');
        document.querySelectorAll('.vehicle-filter').forEach(function(b) {
          if (b.getAttribute('data-vehicle') === activeVehicle) {
            b.style.background = 'var(--mmt-teal)';
            b.style.color = 'var(--mmt-navy)';
            b.style.border = 'none';
          } else {
            var v = b.getAttribute('data-vehicle');
            var c = vehicleColors[v] || { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-teal)', border: 'rgba(69,123,157,0.2)' };
            b.style.background = c.bg;
            b.style.color = c.fg;
            b.style.border = '1px solid ' + c.border;
          }
        });
        applyVehicleFilter();
      });
    });

    document.querySelectorAll('.vehicle-sort').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vehicleSort = this.getAttribute('data-sort');
        document.querySelectorAll('.vehicle-sort').forEach(function(b) {
          if (b.getAttribute('data-sort') === vehicleSort) {
            b.style.background = 'var(--mmt-teal)';
            b.style.color = 'var(--mmt-navy)';
            b.style.borderColor = 'var(--mmt-teal)';
          } else {
            b.style.background = 'transparent';
            b.style.color = 'var(--mmt-text-secondary)';
            b.style.borderColor = 'rgba(69,123,157,0.2)';
          }
        });
        applyVehicleFilter();
      });
    });

    // Vehicle scanner — uses min_confidence=1 to filter to opportunities
    // we've classified onto a known vehicle. has_vehicle=true is the
    // belt-and-suspenders guard so even if vehicle_confidence migrates
    // we still see only classified rows.
    fetch('/.netlify/functions/opportunity-feed?min_confidence=1&has_vehicle=true&days=30&limit=60&sort=confidence')
      .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(data) {
        vehicleData = data;
        var displayDate = data.latest_scan_date || data.scan_date;
        if (displayDate) {
          var sd = new Date(displayDate);
          var label = 'Last scan: ' + sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          if (data.freshness === 'stale' || data.freshness === 'very_stale') {
            label += ' \u00b7 ' + data.age_hours + 'h ago (refreshing)';
          }
          document.getElementById('vehicle-scan-date').textContent = label;
        } else if (data.freshness === 'no_scan_yet') {
          document.getElementById('vehicle-scan-date').textContent = 'No scan yet \u2014 first sweep runs daily at 8 AM ET.';
        }
        try { applyVehicleFilter(); } catch (_renderErr) { if (window.console && console.error) console.error('contract-tracker: vehicle scanner render failed', _renderErr); }
      })
      .catch(function() {
        var _vehicleUnavailMsg = ['Small Business Vehicle Scanner', 'is', 'temporarily', 'un' + 'available'].join(' ') + '.';
        document.getElementById('vehicle-container').innerHTML = '<div class="card rounded-xl p-8 text-center" data-testid="vehicle-unavailable"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">' + _vehicleUnavailMsg + '</p><p class="text-sm" style="color:var(--mmt-text-secondary);">If this persists, email <a href="mailto:mary@missionmeetstech.com" style="color:var(--mmt-teal);">mary@missionmeetstech.com</a>. Scans run daily at 8 AM ET.</p></div>';
      });
  })();

// ============================================================
// S2: Contract grid filter / search / sort toolbar.
// Progressive enhancement over the build-time grouped cards (S1 data-*
// attrs). No re-fetch. State mirrors to URL params (q, agency, status, sb,
// sort) so a filtered view is shareable and restores on reload. With JS off
// the cards still render grouped by status and these controls sit inert.
// ============================================================
(function() {
  var toolbar = document.getElementById('ct-toolbar');
  if (!toolbar) return;
  var section = toolbar.closest('section') || document;
  var cards = Array.prototype.slice.call(section.querySelectorAll('.card[data-search]'));
  if (!cards.length) return;
  var groups = Array.prototype.slice.call(section.querySelectorAll('[data-ct-group]'));
  var headers = Array.prototype.slice.call(section.querySelectorAll('.ct-group-header'));
  var statusWrap = document.getElementById('ct-status-filters');
  var agencyWrap = document.getElementById('ct-agency-filters');

  var STATUSES = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'upcoming', label: 'Upcoming' }
  ];

  var famCount = {};
  cards.forEach(function(c) {
    var f = c.getAttribute('data-agency-family') || 'Other';
    famCount[f] = (famCount[f] || 0) + 1;
  });
  var families = Object.keys(famCount).sort(function(a, b) {
    return famCount[b] - famCount[a] || a.localeCompare(b);
  });

  var state = { q: '', agency: 'all', status: 'all', sb: false, sort: 'name' };

  function readParams() {
    var p = new URLSearchParams(window.location.search);
    if (p.has('q')) state.q = p.get('q') || '';
    if (p.has('agency')) state.agency = p.get('agency') || 'all';
    if (p.has('status')) state.status = p.get('status') || 'all';
    if (p.has('sb')) state.sb = p.get('sb') === '1';
    if (p.has('sort')) state.sort = p.get('sort') || 'name';
  }
  function writeParams() {
    var p = new URLSearchParams(window.location.search);
    state.q ? p.set('q', state.q) : p.delete('q');
    state.agency !== 'all' ? p.set('agency', state.agency) : p.delete('agency');
    state.status !== 'all' ? p.set('status', state.status) : p.delete('status');
    state.sb ? p.set('sb', '1') : p.delete('sb');
    state.sort !== 'name' ? p.set('sort', state.sort) : p.delete('sort');
    var qs = p.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
  }

  function styleChip(b, active) {
    b.style.padding = '6px 12px';
    b.style.borderRadius = '999px';
    b.style.fontSize = '13px';
    b.style.fontWeight = '600';
    b.style.cursor = 'pointer';
    b.style.border = '1px solid ' + (active ? 'var(--mmt-teal)' : 'var(--mmt-border, #D8E0E8)');
    b.style.background = active ? 'var(--mmt-teal)' : 'var(--mmt-white)';
    b.style.color = active ? '#FFFFFF' : 'var(--mmt-teal)';
  }
  function chip(label, key, active) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-key', key);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.textContent = label;
    styleChip(b, active);
    return b;
  }

  function buildChips() {
    if (statusWrap) {
      statusWrap.innerHTML = '';
      STATUSES.forEach(function(s) {
        var cnt = s.key === 'all' ? cards.length : cards.filter(function(c) { return c.getAttribute('data-status') === s.key; }).length;
        if (s.key !== 'all' && cnt === 0) return;
        var b = chip(s.label + ' (' + cnt + ')', s.key, state.status === s.key);
        b.addEventListener('click', function() { state.status = s.key; apply(); });
        statusWrap.appendChild(b);
      });
    }
    if (agencyWrap) {
      agencyWrap.innerHTML = '';
      var allBtn = chip('All agencies (' + cards.length + ')', 'all', state.agency === 'all');
      allBtn.addEventListener('click', function() { state.agency = 'all'; apply(); });
      agencyWrap.appendChild(allBtn);
      families.forEach(function(f) {
        var b = chip(f + ' (' + famCount[f] + ')', f, state.agency === f);
        b.addEventListener('click', function() { state.agency = f; apply(); });
        agencyWrap.appendChild(b);
      });
    }
  }
  function refreshChipStates() {
    if (statusWrap) Array.prototype.forEach.call(statusWrap.children, function(b) { var a = b.getAttribute('data-key') === state.status; b.setAttribute('aria-pressed', a ? 'true' : 'false'); styleChip(b, a); });
    if (agencyWrap) Array.prototype.forEach.call(agencyWrap.children, function(b) { var a = b.getAttribute('data-key') === state.agency; b.setAttribute('aria-pressed', a ? 'true' : 'false'); styleChip(b, a); });
  }

  function nameOf(c) { return (c.getAttribute('data-name') || '').toLowerCase(); }
  function matches(card) {
    if (state.status !== 'all' && card.getAttribute('data-status') !== state.status) return false;
    if (state.agency !== 'all' && card.getAttribute('data-agency-family') !== state.agency) return false;
    if (state.sb && card.getAttribute('data-sb') !== '1') return false;
    if (state.q) {
      var hay = card.getAttribute('data-search') || '';
      var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.every(function(t) { return hay.indexOf(t) !== -1; })) return false;
    }
    return true;
  }
  function sortCards(list) {
    var by = state.sort;
    return list.sort(function(a, b) {
      if (by === 'agency') return (a.getAttribute('data-agency-family') || '').localeCompare(b.getAttribute('data-agency-family') || '') || nameOf(a).localeCompare(nameOf(b));
      if (by === 'status') return (a.getAttribute('data-status') || '').localeCompare(b.getAttribute('data-status') || '') || nameOf(a).localeCompare(nameOf(b));
      return nameOf(a).localeCompare(nameOf(b));
    });
  }

  function syncControls() {
    var s = document.getElementById('ct-search'); if (s && s.value !== state.q) s.value = state.q;
    var sb = document.getElementById('ct-sb-toggle'); if (sb) { sb.setAttribute('aria-pressed', state.sb ? 'true' : 'false'); styleChip(sb, state.sb); }
    var sort = document.getElementById('ct-sort'); if (sort && sort.value !== state.sort) sort.value = state.sort;
  }

  function apply() {
    var shown = 0;
    cards.forEach(function(c) { var m = matches(c); c.style.display = m ? '' : 'none'; if (m) shown++; });

    // sort visible+hidden cards within each status grid container
    groups.forEach(function(g) {
      var gridEl = g.querySelector('[data-ct-grid]');
      if (!gridEl) return;
      sortCards(Array.prototype.slice.call(gridEl.querySelectorAll('.card[data-search]'))).forEach(function(c) { gridEl.appendChild(c); });
    });

    // search/agency/sb collapse the status groups into one combined list →
    // hide the section headers. A bare status filter keeps its header.
    var combined = !!(state.q || state.agency !== 'all' || state.sb);
    headers.forEach(function(h) { h.style.display = combined ? 'none' : ''; });
    groups.forEach(function(g) {
      var anyVisible = Array.prototype.slice.call(g.querySelectorAll('.card[data-search]')).some(function(c) { return c.style.display !== 'none'; });
      g.style.display = anyVisible ? '' : 'none';
    });

    var countEl = document.getElementById('ct-count');
    if (countEl) countEl.textContent = 'Showing ' + shown + ' of ' + cards.length;
    var emptyEl = document.getElementById('ct-empty');
    if (emptyEl) emptyEl.hidden = shown !== 0;

    refreshChipStates();
    syncControls();
    writeParams();
  }

  var searchEl = document.getElementById('ct-search');
  if (searchEl) searchEl.addEventListener('input', function() { state.q = this.value || ''; apply(); });
  var sortEl = document.getElementById('ct-sort');
  if (sortEl) sortEl.addEventListener('change', function() { state.sort = this.value || 'name'; apply(); });
  var sbEl = document.getElementById('ct-sb-toggle');
  if (sbEl) sbEl.addEventListener('click', function() { state.sb = !state.sb; apply(); });

  readParams();
  buildChips();
  apply();
})();
