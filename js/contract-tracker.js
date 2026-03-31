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
      var color = diff <= 7 ? '#F87171' : diff <= 30 ? '#FBBF24' : 'var(--mmt-white-dim)';
      var label = diff === 0 ? 'Due today' : diff === 1 ? '1 day left' : diff + ' days left';
      return '<span class="text-xs font-semibold" style="color:' + color + ';">' + label + '</span>';
    }

    function setAsideBadge(type) {
      if (!type) return '';
      var colors = {
        '8(a)': { fg: '#A78BFA', bg: 'rgba(69,123,157,0.08)' },
        'SDVOSB': { fg: 'var(--mmt-green)', bg: 'rgba(69,123,157,0.08)' },
        'VOSB': { fg: 'var(--mmt-green)', bg: 'rgba(69,123,157,0.08)' },
        'WOSB': { fg: '#F472B6', bg: 'rgba(69,123,157,0.08)' },
        'HUBZone': { fg: '#FBBF24', bg: 'rgba(217,119,6,0.08)' },
        'SDB': { fg: '#60A5FA', bg: 'rgba(69,123,157,0.08)' },
        'Full & Open': { fg: 'var(--mmt-cyan)', bg: 'rgba(69,123,157,0.08)' }
      };
      var c = colors[type] || { fg: 'var(--mmt-cyan)', bg: 'rgba(69,123,157,0.08)' };
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

    function renderOpportunities(opps) {
      if (!opps || opps.length === 0) {
        return '<div class="card rounded-xl p-8 text-center"><p class="text-base" style="color:var(--mmt-text-secondary);">No opportunities match the current filter.</p></div>';
      }
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
        html += radarConfidenceBadge(o.vehicle_confidence);
        html += setAsideBadge(o.set_aside_type);
        html += '</div>';
        html += deadlineCountdown(o.response_deadline);
        html += '</div>';
        // Title
        html += '<h3 class="text-sm font-bold mb-1" style="color:var(--mmt-navy);">' + esc(o.title) + '</h3>';
        // Agency
        html += '<p class="text-xs mb-2" style="color:var(--mmt-teal);">' + esc(o.agency) + '</p>';
        // Description
        if (o.ai_summary) {
          html += '<p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text-secondary);">' + esc(o.ai_summary) + '</p>';
        } else if (o.description) {
          html += '<p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text-secondary);">' + esc(o.description) + '</p>';
        }
        if (o.vehicle_reasoning) {
          html += '<p class="text-xs italic mb-3" style="color:var(--mmt-text-secondary);">' + esc(o.vehicle_reasoning) + '</p>';
        }
        // Meta row
        html += '<div class="flex flex-wrap gap-3 items-center text-xs" style="color:var(--mmt-text-secondary);">';
        if (o.value_estimate) html += '<span><strong style="color:var(--mmt-text-secondary);">Value:</strong> ' + esc(o.value_estimate) + '</span>';
        if (o.solicitation_number) html += '<span><strong style="color:var(--mmt-text-secondary);">Sol#:</strong> ' + esc(o.solicitation_number) + '</span>';
        if (o.naics_codes && o.naics_codes.length) html += '<span><strong style="color:var(--mmt-text-secondary);">NAICS:</strong> ' + esc(o.naics_codes.join(', ')) + '</span>';
        html += '</div>';
        // Deadline date + source link
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
            b.style.background = 'var(--mmt-cyan)';
            b.style.color = 'var(--mmt-navy)';
            b.style.border = 'none';
          } else {
            var f = b.getAttribute('data-filter');
            var colors = {
              'all': { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-cyan)', border: 'rgba(0,229,250,0.2)' },
              'small_business': { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-green)', border: 'rgba(0,255,133,0.2)' },
              '8(a)': { bg: 'rgba(69,123,157,0.08)', fg: '#A78BFA', border: 'rgba(167,139,250,0.2)' },
              'SDVOSB': { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-green)', border: 'rgba(0,255,133,0.2)' },
              'WOSB': { bg: 'rgba(69,123,157,0.08)', fg: '#F472B6', border: 'rgba(244,114,182,0.2)' }
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
        if (data.scan_date) {
          var sd = new Date(data.scan_date);
          document.getElementById('radar-scan-date').textContent = 'Last scan: ' + sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        applyFilter();
      })
      .catch(function() {
        document.getElementById('radar-container').innerHTML = '<div class="card rounded-xl p-8 text-center"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">Opportunity Radar is initializing.</p><p class="text-sm" style="color:var(--mmt-text-secondary);">New opportunities are scanned daily at 7 AM ET. Check back soon.</p></div>';
      });
  })();

(function() {
    var vehicleData = null;
    var activeVehicle = 'all';
    var vehicleSort = 'confidence';

    var vehicleColors = {
      'OASIS+': { fg: '#60A5FA', bg: 'rgba(69,123,157,0.08)', border: 'rgba(96,165,250,0.2)' },
      'CIO-SP3': { fg: '#22D3EE', bg: 'rgba(34,211,238,0.1)', border: 'rgba(34,211,238,0.2)' },
      'Alliant 3': { fg: '#C084FC', bg: 'rgba(192,132,252,0.1)', border: 'rgba(192,132,252,0.2)' },
      'T4NG2': { fg: '#4ADE80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.2)' },
      'OMNIBUS IV': { fg: '#FB923C', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.2)' },
      'DIU': { fg: '#FBBF24', bg: 'rgba(217,119,6,0.08)', border: 'rgba(251,191,36,0.2)' },
      'DARPA': { fg: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
      'SBIR/STTR': { fg: '#818CF8', bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.2)' },
      'VA SDVOSB': { fg: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.2)' },
      '8(a)': { fg: '#A78BFA', bg: 'rgba(69,123,157,0.08)', border: 'rgba(167,139,250,0.2)' }
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
      var color = diff <= 7 ? '#F87171' : diff <= 30 ? '#FBBF24' : 'var(--mmt-white-dim)';
      var label = diff === 0 ? 'Due today' : diff === 1 ? '1 day left' : diff + ' days left';
      return '<span class="text-xs font-semibold" style="color:' + color + ';">' + label + '</span>';
    }

    function vehicleBadge(vehicle) {
      if (!vehicle) return '';
      var c = vehicleColors[vehicle] || { fg: 'var(--mmt-cyan)', bg: 'rgba(69,123,157,0.08)' };
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
        '8(a)': { fg: '#A78BFA', bg: 'rgba(69,123,157,0.08)' },
        'SDVOSB': { fg: 'var(--mmt-green)', bg: 'rgba(69,123,157,0.08)' },
        'VOSB': { fg: 'var(--mmt-green)', bg: 'rgba(69,123,157,0.08)' },
        'WOSB': { fg: '#F472B6', bg: 'rgba(69,123,157,0.08)' },
        'HUBZone': { fg: '#FBBF24', bg: 'rgba(217,119,6,0.08)' },
        'SDB': { fg: '#60A5FA', bg: 'rgba(69,123,157,0.08)' },
        'Full & Open': { fg: 'var(--mmt-cyan)', bg: 'rgba(69,123,157,0.08)' }
      };
      var c = colors[type] || { fg: 'var(--mmt-cyan)', bg: 'rgba(69,123,157,0.08)' };
      return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:' + c.fg + ';background:' + c.bg + ';">' + esc(type) + '</span>';
    }

    function renderVehicleOpps(opps, isFiltered) {
      if (!opps || opps.length === 0) {
        if (isFiltered) {
          return '<div class="card rounded-xl p-8 text-center"><p class="text-base" style="color:var(--mmt-text-secondary);">No opportunities found for this vehicle. Try "All Vehicles" or check back after the next scan.</p></div>';
        }
        return '<div class="card rounded-xl p-8 text-center"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">Small Business Vehicle Scanner is initializing.</p><p class="text-sm" style="color:var(--mmt-text-secondary);">Vehicle-specific opportunities are scanned daily at 8 AM ET. Check back soon.</p></div>';
      }
      var html = '<div class="grid md:grid-cols-2 gap-4">';
      opps.forEach(function(o) {
        html += '<div class="card rounded-xl p-5 transition-all duration-200">';
        html += '<div class="flex items-start justify-between gap-2 mb-2">';
        html += '<div class="flex flex-wrap gap-2">';
        html += vehicleBadge(o.contract_vehicle);
        html += confidenceBadge(o.vehicle_confidence);
        if (o.opportunity_type) {
          html += '<span class="text-xs px-2 py-0.5 rounded" style="background:rgba(69,123,157,0.08);color:var(--mmt-teal);">' + esc(o.opportunity_type) + '</span>';
        }
        html += setAsideBadge(o.set_aside_type);
        html += '</div>';
        html += deadlineCountdown(o.response_deadline);
        html += '</div>';
        html += '<h3 class="text-sm font-bold mb-1" style="color:var(--mmt-navy);">' + esc(o.title) + '</h3>';
        html += '<p class="text-xs mb-2" style="color:var(--mmt-teal);">' + esc(o.agency) + '</p>';
        if (o.ai_summary) {
          html += '<p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text-secondary);">' + esc(o.ai_summary) + '</p>';
        } else if (o.description) {
          html += '<p class="text-sm leading-relaxed mb-2" style="color:var(--mmt-text-secondary);">' + esc(o.description) + '</p>';
        }
        if (o.vehicle_reasoning) {
          html += '<p class="text-xs italic mb-3" style="color:var(--mmt-text-secondary);">' + esc(o.vehicle_reasoning) + '</p>';
        }
        html += '<div class="flex flex-wrap gap-3 items-center text-xs" style="color:var(--mmt-text-secondary);">';
        if (o.value_estimate) html += '<span><strong style="color:var(--mmt-text-secondary);">Value:</strong> ' + esc(o.value_estimate) + '</span>';
        if (o.solicitation_number) html += '<span><strong style="color:var(--mmt-text-secondary);">Sol#:</strong> ' + esc(o.solicitation_number) + '</span>';
        if (o.naics_codes && o.naics_codes.length) html += '<span><strong style="color:var(--mmt-text-secondary);">NAICS:</strong> ' + esc(o.naics_codes.join(', ')) + '</span>';
        html += '</div>';
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
            b.style.background = 'var(--mmt-green)';
            b.style.color = 'var(--mmt-navy)';
            b.style.border = 'none';
          } else {
            var v = b.getAttribute('data-vehicle');
            var c = vehicleColors[v] || { bg: 'rgba(69,123,157,0.08)', fg: 'var(--mmt-green)', border: 'rgba(0,255,133,0.2)' };
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
            b.style.background = 'var(--mmt-cyan)';
            b.style.color = 'var(--mmt-navy)';
            b.style.borderColor = 'var(--mmt-cyan)';
          } else {
            b.style.background = 'transparent';
            b.style.color = 'var(--mmt-white-dim)';
            b.style.borderColor = 'rgba(0,229,250,0.2)';
          }
        });
        applyVehicleFilter();
      });
    });

    fetch('/.netlify/functions/opportunity-feed?min_confidence=1&days=30&limit=60&sort=confidence')
      .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(data) {
        vehicleData = data;
        if (data.scan_date) {
          var sd = new Date(data.scan_date);
          document.getElementById('vehicle-scan-date').textContent = 'Last scan: ' + sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        applyVehicleFilter();
      })
      .catch(function() {
        document.getElementById('vehicle-container').innerHTML = '<div class="card rounded-xl p-8 text-center"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">Small Business Vehicle Scanner is initializing.</p><p class="text-sm" style="color:var(--mmt-text-secondary);">Vehicle-specific opportunities are scanned daily at 8 AM ET. Check back soon.</p></div>';
      });
  })();
