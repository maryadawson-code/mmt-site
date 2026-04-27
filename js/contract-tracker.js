// contract-tracker.js — Opportunity Radar + Vehicle Scanner

(function() {
    var radarData = null;
    var activeFilter = 'all';

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
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
        // Honest empty-but-healthy state. If radarData reports the
        // scanner has run recently we say so; if not we say so.
        var note = '';
        if (radarData) {
          if (radarData.freshness === 'fresh' || radarData.freshness === 'stale') {
            note = '<p class="text-sm" style="color:var(--mmt-text-secondary);">No solicitations match this filter today. The scanner ran ' + (radarData.age_hours != null ? radarData.age_hours + 'h ago' : 'recently') + ' and tracked ' + (radarData.total_count || 0) + ' opportunities.</p>';
          } else if (radarData.freshness === 'very_stale') {
            note = '<p class="text-sm" style="color:#92710A;">Last scan ' + (radarData.age_hours || '?') + 'h ago \u2014 may be stale. Scans normally run daily at 7 AM ET.</p>';
          } else {
            note = '<p class="text-sm" style="color:var(--mmt-text-secondary);">No scan results yet. The scanner runs daily at 7 AM ET.</p>';
          }
        }
        return '<div class="card rounded-xl p-8 text-center" data-testid="radar-empty"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">No opportunities match the current filter.</p>' + note + '</div>';
      }
      var isPremium = isPremiumUser();
      var html = '<div class="grid md:grid-cols-2 gap-4">';
      opps.forEach(function(o) {
        html += '<div class="card rounded-xl p-5 transition-all duration-200">';
        // Header with type badge, confidence, and deadline
        html += '<div class="flex items-start justify-between gap-2 mb-2">';
        html += '<div class="flex flex-wrap gap-2">';
        if (o.opportunity_type) {
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
        if (isPremium && o.naics_codes && o.naics_codes.length) html += '<span><strong style="color:var(--mmt-text-secondary);">NAICS:</strong> ' + esc(o.naics_codes.join(', ')) + '</span>';
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
          if (o.source_url) {
            html += '<a href="' + esc(o.source_url) + '" target="_blank" rel="noopener" class="text-xs font-semibold no-underline hover:opacity-80" style="color:var(--mmt-teal);">View Source &rarr;</a>';
          }
          html += '</div>';
        }
        html += '</div>';
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
        applyFilter();
      })
      .catch(function() {
        document.getElementById('radar-container').innerHTML = '<div class="card rounded-xl p-8 text-center" data-testid="radar-unavailable"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">Opportunity Radar is temporarily unavailable.</p><p class="text-sm" style="color:var(--mmt-text-secondary);">If this persists, email <a href="mailto:mary@missionmeetstech.com" style="color:var(--mmt-teal);">mary@missionmeetstech.com</a>. Scans run daily at 7 AM ET.</p></div>';
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
        // Empty-but-healthy: scanner has run, but no rows match. The
        // 2026-04-27 incident: scanner looked "stuck initializing" because
        // we couldn't tell those two states apart on the client.
        var note = '';
        if (vehicleData) {
          if (vehicleData.freshness === 'fresh' || vehicleData.freshness === 'stale') {
            note = '<p class="text-sm" style="color:var(--mmt-text-secondary);">Scanner ran ' + (vehicleData.age_hours != null ? vehicleData.age_hours + 'h ago' : 'recently') + ' and tracked ' + (vehicleData.total_count || 0) + ' classified opportunities.</p>';
          } else if (vehicleData.freshness === 'very_stale') {
            note = '<p class="text-sm" style="color:#92710A;">Last scan ' + (vehicleData.age_hours || '?') + 'h ago \u2014 may be stale. Scans normally run daily at 8 AM ET.</p>';
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
        if (isPremium && o.naics_codes && o.naics_codes.length) html += '<span><strong style="color:var(--mmt-text-secondary);">NAICS:</strong> ' + esc(o.naics_codes.join(', ')) + '</span>';
        html += '</div>';
        if (isPremium) {
          html += '<div class="flex items-center justify-between mt-3 pt-3" style="border-top:1px solid rgba(69,123,157,0.08);">';
          if (o.response_deadline) {
            var dl = new Date(o.response_deadline);
            html += '<span class="text-xs" style="color:var(--mmt-text-secondary);">Due: ' + dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>';
          } else {
            html += '<span></span>';
          }
          if (o.source_url) {
            html += '<a href="' + esc(o.source_url) + '" target="_blank" rel="noopener" class="text-xs font-semibold no-underline hover:opacity-80" style="color:var(--mmt-teal);">View Source &rarr;</a>';
          }
          html += '</div>';
        }
        html += '</div>';
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
        applyVehicleFilter();
      })
      .catch(function() {
        document.getElementById('vehicle-container').innerHTML = '<div class="card rounded-xl p-8 text-center" data-testid="vehicle-unavailable"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">Small Business Vehicle Scanner is temporarily unavailable.</p><p class="text-sm" style="color:var(--mmt-text-secondary);">If this persists, email <a href="mailto:mary@missionmeetstech.com" style="color:var(--mmt-teal);">mary@missionmeetstech.com</a>. Scans run daily at 8 AM ET.</p></div>';
      });
  })();
