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
      if (diff < 0) return '<span class="text-xs" style="color:var(--mmt-white-dim);">Closed</span>';
      var color = diff <= 7 ? '#F87171' : diff <= 30 ? '#FBBF24' : 'var(--mmt-white-dim)';
      var label = diff === 0 ? 'Due today' : diff === 1 ? '1 day left' : diff + ' days left';
      return '<span class="text-xs font-semibold" style="color:' + color + ';">' + label + '</span>';
    }

    function setAsideBadge(type) {
      if (!type) return '';
      var colors = {
        '8(a)': { fg: '#A78BFA', bg: 'rgba(167,139,250,0.1)' },
        'SDVOSB': { fg: 'var(--mmt-green)', bg: 'rgba(0,255,133,0.1)' },
        'VOSB': { fg: 'var(--mmt-green)', bg: 'rgba(0,255,133,0.1)' },
        'WOSB': { fg: '#F472B6', bg: 'rgba(244,114,182,0.1)' },
        'HUBZone': { fg: '#FBBF24', bg: 'rgba(251,191,36,0.1)' },
        'SDB': { fg: '#60A5FA', bg: 'rgba(96,165,250,0.1)' },
        'Full & Open': { fg: 'var(--mmt-cyan)', bg: 'rgba(0,229,250,0.1)' }
      };
      var c = colors[type] || { fg: 'var(--mmt-cyan)', bg: 'rgba(0,229,250,0.1)' };
      return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:' + c.fg + ';background:' + c.bg + ';">' + esc(type) + '</span>';
    }

    function renderOpportunities(opps) {
      if (!opps || opps.length === 0) {
        return '<div class="card rounded-xl p-8 text-center"><p class="text-base" style="color:var(--mmt-white-dim);">No opportunities match the current filter.</p></div>';
      }
      var html = '<div class="grid md:grid-cols-2 gap-4">';
      opps.forEach(function(o) {
        html += '<div class="card rounded-xl p-5 transition-all duration-200">';
        // Header with type badge and deadline
        html += '<div class="flex items-start justify-between gap-2 mb-2">';
        html += '<div class="flex flex-wrap gap-2">';
        if (o.opportunity_type) {
          html += '<span class="text-xs px-2 py-0.5 rounded" style="background:rgba(0,229,250,0.1);color:var(--mmt-cyan);">' + esc(o.opportunity_type) + '</span>';
        }
        html += setAsideBadge(o.set_aside_type);
        html += '</div>';
        html += deadlineCountdown(o.response_deadline);
        html += '</div>';
        // Title
        html += '<h3 class="text-sm font-bold mb-1" style="color:var(--mmt-white);">' + esc(o.title) + '</h3>';
        // Agency
        html += '<p class="text-xs mb-2" style="color:var(--mmt-cyan);">' + esc(o.agency) + '</p>';
        // Description
        if (o.ai_summary) {
          html += '<p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-white-muted);">' + esc(o.ai_summary) + '</p>';
        } else if (o.description) {
          html += '<p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-white-muted);">' + esc(o.description) + '</p>';
        }
        // Meta row
        html += '<div class="flex flex-wrap gap-3 items-center text-xs" style="color:var(--mmt-white-dim);">';
        if (o.value_estimate) html += '<span><strong style="color:var(--mmt-white-muted);">Value:</strong> ' + esc(o.value_estimate) + '</span>';
        if (o.solicitation_number) html += '<span><strong style="color:var(--mmt-white-muted);">Sol#:</strong> ' + esc(o.solicitation_number) + '</span>';
        if (o.naics_codes && o.naics_codes.length) html += '<span><strong style="color:var(--mmt-white-muted);">NAICS:</strong> ' + esc(o.naics_codes.join(', ')) + '</span>';
        html += '</div>';
        // Deadline date + source link
        html += '<div class="flex items-center justify-between mt-3 pt-3" style="border-top:1px solid rgba(0,229,250,0.1);">';
        if (o.response_deadline) {
          var dl = new Date(o.response_deadline);
          html += '<span class="text-xs" style="color:var(--mmt-white-dim);">Due: ' + dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>';
        } else {
          html += '<span></span>';
        }
        if (o.source_url) {
          html += '<a href="' + esc(o.source_url) + '" target="_blank" rel="noopener" class="text-xs font-semibold no-underline hover:opacity-80" style="color:var(--mmt-cyan);">View Source &rarr;</a>';
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
              'all': { bg: 'rgba(0,229,250,0.1)', fg: 'var(--mmt-cyan)', border: 'rgba(0,229,250,0.2)' },
              'small_business': { bg: 'rgba(0,255,133,0.1)', fg: 'var(--mmt-green)', border: 'rgba(0,255,133,0.2)' },
              '8(a)': { bg: 'rgba(167,139,250,0.1)', fg: '#A78BFA', border: 'rgba(167,139,250,0.2)' },
              'SDVOSB': { bg: 'rgba(0,255,133,0.1)', fg: 'var(--mmt-green)', border: 'rgba(0,255,133,0.2)' },
              'WOSB': { bg: 'rgba(244,114,182,0.1)', fg: '#F472B6', border: 'rgba(244,114,182,0.2)' }
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
        document.getElementById('radar-container').innerHTML = '<div class="card rounded-xl p-8 text-center"><p class="text-base mb-2" style="color:var(--mmt-white-dim);">Opportunity Radar is initializing.</p><p class="text-sm" style="color:var(--mmt-white-dim);">New opportunities are scanned daily at 7 AM ET. Check back soon.</p></div>';
      });
  })();

(function() {
    var vehicleData = null;
    var activeVehicle = 'all';

    var vehicleColors = {
      'OASIS+': { fg: '#60A5FA', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)' },
      'CIO-SP4': { fg: '#22D3EE', bg: 'rgba(34,211,238,0.1)', border: 'rgba(34,211,238,0.2)' },
      'OMNIBUS IV': { fg: '#FB923C', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.2)' },
      'DIU': { fg: '#FBBF24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.2)' },
      'DARPA': { fg: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
      'SBIR/STTR': { fg: '#818CF8', bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.2)' },
      'VA SDVOSB': { fg: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.2)' },
      '8(a)': { fg: '#A78BFA', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' }
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
      if (diff < 0) return '<span class="text-xs" style="color:var(--mmt-white-dim);">Closed</span>';
      var color = diff <= 7 ? '#F87171' : diff <= 30 ? '#FBBF24' : 'var(--mmt-white-dim)';
      var label = diff === 0 ? 'Due today' : diff === 1 ? '1 day left' : diff + ' days left';
      return '<span class="text-xs font-semibold" style="color:' + color + ';">' + label + '</span>';
    }

    function vehicleBadge(vehicle) {
      if (!vehicle) return '';
      var c = vehicleColors[vehicle] || { fg: 'var(--mmt-cyan)', bg: 'rgba(0,229,250,0.1)' };
      return '<span class="text-xs font-bold px-2 py-0.5 rounded" style="color:' + c.fg + ';background:' + c.bg + ';">' + esc(vehicle) + '</span>';
    }

    function setAsideBadge(type) {
      if (!type) return '';
      var colors = {
        '8(a)': { fg: '#A78BFA', bg: 'rgba(167,139,250,0.1)' },
        'SDVOSB': { fg: 'var(--mmt-green)', bg: 'rgba(0,255,133,0.1)' },
        'VOSB': { fg: 'var(--mmt-green)', bg: 'rgba(0,255,133,0.1)' },
        'WOSB': { fg: '#F472B6', bg: 'rgba(244,114,182,0.1)' },
        'HUBZone': { fg: '#FBBF24', bg: 'rgba(251,191,36,0.1)' },
        'SDB': { fg: '#60A5FA', bg: 'rgba(96,165,250,0.1)' },
        'Full & Open': { fg: 'var(--mmt-cyan)', bg: 'rgba(0,229,250,0.1)' }
      };
      var c = colors[type] || { fg: 'var(--mmt-cyan)', bg: 'rgba(0,229,250,0.1)' };
      return '<span class="text-xs font-semibold px-2 py-0.5 rounded" style="color:' + c.fg + ';background:' + c.bg + ';">' + esc(type) + '</span>';
    }

    function renderVehicleOpps(opps, isFiltered) {
      if (!opps || opps.length === 0) {
        if (isFiltered) {
          return '<div class="card rounded-xl p-8 text-center"><p class="text-base" style="color:var(--mmt-white-dim);">No opportunities found for this vehicle. Try "All Vehicles" or check back after the next scan.</p></div>';
        }
        return '<div class="card rounded-xl p-8 text-center"><p class="text-base mb-2" style="color:var(--mmt-white-dim);">Small Business Vehicle Scanner is initializing.</p><p class="text-sm" style="color:var(--mmt-white-dim);">Vehicle-specific opportunities are scanned daily at 8 AM ET. Check back soon.</p></div>';
      }
      var html = '<div class="grid md:grid-cols-2 gap-4">';
      opps.forEach(function(o) {
        html += '<div class="card rounded-xl p-5 transition-all duration-200">';
        html += '<div class="flex items-start justify-between gap-2 mb-2">';
        html += '<div class="flex flex-wrap gap-2">';
        html += vehicleBadge(o.contract_vehicle);
        if (o.opportunity_type) {
          html += '<span class="text-xs px-2 py-0.5 rounded" style="background:rgba(0,229,250,0.1);color:var(--mmt-cyan);">' + esc(o.opportunity_type) + '</span>';
        }
        html += setAsideBadge(o.set_aside_type);
        html += '</div>';
        html += deadlineCountdown(o.response_deadline);
        html += '</div>';
        html += '<h3 class="text-sm font-bold mb-1" style="color:var(--mmt-white);">' + esc(o.title) + '</h3>';
        html += '<p class="text-xs mb-2" style="color:var(--mmt-cyan);">' + esc(o.agency) + '</p>';
        if (o.ai_summary) {
          html += '<p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-white-muted);">' + esc(o.ai_summary) + '</p>';
        } else if (o.description) {
          html += '<p class="text-sm leading-relaxed mb-3" style="color:var(--mmt-white-muted);">' + esc(o.description) + '</p>';
        }
        html += '<div class="flex flex-wrap gap-3 items-center text-xs" style="color:var(--mmt-white-dim);">';
        if (o.value_estimate) html += '<span><strong style="color:var(--mmt-white-muted);">Value:</strong> ' + esc(o.value_estimate) + '</span>';
        if (o.solicitation_number) html += '<span><strong style="color:var(--mmt-white-muted);">Sol#:</strong> ' + esc(o.solicitation_number) + '</span>';
        if (o.naics_codes && o.naics_codes.length) html += '<span><strong style="color:var(--mmt-white-muted);">NAICS:</strong> ' + esc(o.naics_codes.join(', ')) + '</span>';
        html += '</div>';
        html += '<div class="flex items-center justify-between mt-3 pt-3" style="border-top:1px solid rgba(0,229,250,0.1);">';
        if (o.response_deadline) {
          var dl = new Date(o.response_deadline);
          html += '<span class="text-xs" style="color:var(--mmt-white-dim);">Due: ' + dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</span>';
        } else {
          html += '<span></span>';
        }
        if (o.source_url) {
          html += '<a href="' + esc(o.source_url) + '" target="_blank" rel="noopener" class="text-xs font-semibold no-underline hover:opacity-80" style="color:var(--mmt-cyan);">View Source &rarr;</a>';
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
        filtered = opps;
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
            var c = vehicleColors[v] || { bg: 'rgba(0,255,133,0.1)', fg: 'var(--mmt-green)', border: 'rgba(0,255,133,0.2)' };
            b.style.background = c.bg;
            b.style.color = c.fg;
            b.style.border = '1px solid ' + c.border;
          }
        });
        applyVehicleFilter();
      });
    });

    fetch('/.netlify/functions/opportunity-feed?has_vehicle=true&days=14&limit=30')
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
        document.getElementById('vehicle-container').innerHTML = '<div class="card rounded-xl p-8 text-center"><p class="text-base mb-2" style="color:var(--mmt-white-dim);">Small Business Vehicle Scanner is initializing.</p><p class="text-sm" style="color:var(--mmt-white-dim);">Vehicle-specific opportunities are scanned daily at 8 AM ET. Check back soon.</p></div>';
      });
  })();
