(function() {
    var contractName = document.getElementById('intel-container').getAttribute('data-contract');

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    function fmtDate(iso) {
      if (!iso) return '';
      var d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function confBadge(pct) {
      if (typeof pct !== 'number' && typeof pct !== 'string') return '';
      var n = parseInt(pct);
      if (isNaN(n)) return '';
      var color = n >= 80 ? 'var(--mmt-teal)' : n >= 60 ? '#D97706' : 'var(--mmt-red, #E63946)';
      var bg = n >= 80 ? 'rgba(69,123,157,0.08)' : n >= 60 ? 'rgba(217,119,6,0.08)' : 'rgba(230,57,70,0.08)';
      return '<span class="text-sm font-semibold px-2.5 py-1 rounded ml-2 inline-flex items-center gap-1" style="color:' + color + ';background:' + bg + ';" title="Confidence rating"><span class="w-1.5 h-1.5 rounded-full inline-block" style="background:' + color + ';"></span>' + n + '%</span>';
    }

    function overallConfBadge(pct, verified) {
      if (typeof pct !== 'number' && typeof pct !== 'string') return '';
      var n = parseInt(pct);
      if (isNaN(n)) return '';
      var color = n >= 80 ? 'var(--mmt-teal)' : n >= 60 ? '#D97706' : 'var(--mmt-red, #E63946)';
      var bg = n >= 80 ? 'rgba(69,123,157,0.12)' : n >= 60 ? 'rgba(217,119,6,0.1)' : 'rgba(248,113,113,0.15)';
      var label = n >= 80 ? 'High Confidence' : n >= 60 ? 'Medium Confidence' : 'Low Confidence';
      var vIcon = verified ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="display:inline;vertical-align:middle;margin-right:3px;"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>' : '';
      return '<span class="text-sm font-semibold px-3 py-1.5 rounded-full inline-flex items-center gap-1" style="color:' + color + ';background:' + bg + ';border:1px solid ' + color + ';">' + vIcon + label + ': ' + n + '%' + (verified ? ' (verified)' : '') + '</span>';
    }

    function renderIntel(intel) {
      var html = '';
      if (intel.summary) {
        html += '<p class="text-base leading-relaxed mb-6" style="color:var(--mmt-text-secondary);">' + esc(intel.summary) + '</p>';
      }
      if (intel.key_developments && intel.key_developments.length) {
        html += '<h3 class="text-lg font-bold mb-4" style="color:var(--mmt-teal);">Key Developments</h3>';
        html += '<div class="space-y-4 mb-8">' + intel.key_developments.map(function(d) {
          return '<div class="card rounded-lg p-4"><div class="flex items-center gap-2 mb-2"><span class="text-xs font-mono px-2 py-0.5 rounded" style="background:rgba(69,123,157,0.08);color:var(--mmt-text-secondary);">' + esc(d.date) + '</span>' + confBadge(d.confidence) + '</div><p class="text-base font-semibold mb-1" style="color:var(--mmt-navy);">' + esc(d.headline) + '</p><p class="text-sm leading-relaxed" style="color:var(--mmt-text-secondary);">' + esc(d.detail) + '</p></div>';
        }).join('') + '</div>';
      }
      if (intel.competitors && intel.competitors.length) {
        html += '<h3 class="text-lg font-bold mb-4" style="color:var(--mmt-teal);">Competitors</h3>';
        html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">' + intel.competitors.map(function(c) {
          return '<div class="card rounded-lg p-4"><div class="flex items-center justify-between mb-2"><p class="text-base font-semibold" style="color:var(--mmt-navy);">' + esc(c.name) + '</p><span class="text-xs px-2 py-0.5 rounded" style="background:rgba(69,123,157,0.08);color:var(--mmt-teal);">' + esc(c.role) + '</span></div><p class="text-sm leading-relaxed" style="color:var(--mmt-text-secondary);">' + esc(c.position) + '</p>' + confBadge(c.confidence) + '</div>';
        }).join('') + '</div>';
      }
      if (intel.timeline && intel.timeline.length) {
        html += '<h3 class="text-lg font-bold mb-4" style="color:var(--mmt-teal);">Timeline</h3>';
        html += '<div class="space-y-3 mb-8">' + intel.timeline.map(function(t) {
          return '<div class="flex gap-4 items-start"><span class="text-xs font-mono px-2 py-0.5 rounded flex-shrink-0 mt-1" style="background:rgba(69,123,157,0.08);color:var(--mmt-text-secondary);">' + esc(t.date) + '</span><div><p class="text-base font-semibold mb-1" style="color:var(--mmt-navy);">' + esc(t.event) + '</p><p class="text-sm" style="color:var(--mmt-text-secondary);">' + esc(t.significance) + '</p>' + confBadge(t.confidence) + '</div></div>';
        }).join('') + '</div>';
      }
      if (intel.financials) {
        html += '<h3 class="text-lg font-bold mb-3" style="color:var(--mmt-teal);">Financials' + confBadge(intel.financials_confidence) + '</h3>';
        html += '<p class="text-base leading-relaxed mb-8" style="color:var(--mmt-text-secondary);">' + esc(intel.financials) + '</p>';
      }
      if ((intel.risks && intel.risks.length) || (intel.opportunities && intel.opportunities.length)) {
        html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">';
        if (intel.risks && intel.risks.length) {
          html += '<div class="card rounded-xl p-6" style="border-color:rgba(248,113,113,0.2);"><h3 class="text-lg font-bold mb-4" style="color:var(--mmt-red, #E63946);">Risks</h3>';
          html += '<ul class="list-none p-0 m-0 space-y-3">' + intel.risks.map(function(r) { return '<li class="text-sm leading-relaxed pl-4" style="color:var(--mmt-text-secondary);border-left:2px solid rgba(248,113,113,0.3);">' + esc(r) + '</li>'; }).join('') + '</ul></div>';
        }
        if (intel.opportunities && intel.opportunities.length) {
          html += '<div class="card rounded-xl p-6" style="border-color:rgba(0,255,133,0.2);"><h3 class="text-lg font-bold mb-4" style="color:var(--mmt-teal);">Opportunities</h3>';
          html += '<ul class="list-none p-0 m-0 space-y-3">' + intel.opportunities.map(function(o) { return '<li class="text-sm leading-relaxed pl-4" style="color:var(--mmt-text-secondary);border-left:2px solid rgba(0,255,133,0.3);">' + esc(o) + '</li>'; }).join('') + '</ul></div>';
        }
        html += '</div>';
      }
      if (intel.verification_notes && intel.verification_notes.length) {
        html += '<div class="p-5 rounded-xl" style="background:rgba(251,191,36,0.05);border:1px solid rgba(217,119,6,0.1);">';
        html += '<h3 class="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style="color:#D97706;"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>Verification Notes</h3>';
        html += intel.verification_notes.map(function(n) {
          var isContradiction = n.indexOf('CONTRADICTED:') === 0;
          var noteColor = isContradiction ? 'var(--mmt-red, #E63946)' : 'var(--mmt-text-secondary)';
          return '<p class="text-sm mb-2 leading-relaxed" style="color:' + noteColor + ';">' + esc(n) + '</p>';
        }).join('');
        html += '</div>';
      }
      return html;
    }

    function renderSmallBiz(sb) {
      if (!sb) return '';
      var html = '<div class="rounded-xl p-6 md:p-8" style="background:rgba(0,255,133,0.04);border:1px solid rgba(0,255,133,0.2);">';
      html += '<h2 class="text-xl md:text-2xl font-bold mb-6 flex items-center gap-3" style="color:var(--mmt-teal);"><svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2A1.5 1.5 0 000 3.5v2A1.5 1.5 0 001.5 7h1v5.5A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5V7h1A1.5 1.5 0 0016 5.5v-2A1.5 1.5 0 0014.5 2h-13zM4 7h8v5.5H4V7z"/></svg>Small Business Opportunities</h2>';
      if (sb.set_aside_types && sb.set_aside_types.length) {
        html += '<div class="flex flex-wrap gap-2 mb-4">';
        var saColors = { '8(a)': 'var(--mmt-teal)', 'SDVOSB': 'var(--mmt-teal)', 'VOSB': 'var(--mmt-teal)', 'WOSB': 'var(--mmt-teal)', 'HUBZone': '#D97706', 'SDB': 'var(--mmt-teal)' };
        sb.set_aside_types.forEach(function(t) {
          var c = saColors[t] || 'var(--mmt-teal)';
          html += '<span class="text-xs font-semibold px-2.5 py-1 rounded" style="color:' + c + ';background:rgba(69,123,157,0.06);border:1px solid ' + c + ';">' + esc(t) + '</span>';
        });
        html += '</div>';
      }
      if (sb.opportunities && sb.opportunities.length) {
        html += '<div class="space-y-3 mb-6">';
        sb.opportunities.forEach(function(o) {
          html += '<div class="card rounded-lg p-4" style="border-color:rgba(69,123,157,0.12);"><p class="text-base leading-relaxed" style="color:var(--mmt-text-secondary);">' + esc(typeof o === 'string' ? o : o.description || o.detail || JSON.stringify(o)) + '</p></div>';
        });
        html += '</div>';
      }
      if (sb.subcontracting_note) {
        html += '<div class="p-4 rounded-lg" style="background:rgba(0,255,133,0.06);border:1px solid rgba(69,123,157,0.08);"><p class="text-sm font-semibold mb-1" style="color:var(--mmt-teal);">Subcontracting</p><p class="text-sm leading-relaxed" style="color:var(--mmt-text-secondary);">' + esc(sb.subcontracting_note) + '</p></div>';
      }
      html += '</div>';
      return html;
    }

    function renderBlackHat(bh) {
      var html = '<div class="rounded-xl p-6 md:p-8" style="background:rgba(248,113,113,0.04);border:1px solid rgba(248,113,113,0.2);">';
      html += '<div class="flex items-center justify-between mb-6 flex-wrap gap-3">';
      html += '<h2 class="text-xl md:text-2xl font-bold flex items-center gap-3" style="color:var(--mmt-red, #E63946);"><svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/></svg>BLACK HAT: Competitive Intelligence</h2>';
      if (typeof bh.confidence_score === 'number') html += overallConfBadge(bh.confidence_score, bh.verified);
      html += '</div>';
      if (bh.summary) {
        html += '<p class="text-base leading-relaxed mb-6" style="color:var(--mmt-text-secondary);">' + esc(bh.summary) + '</p>';
      }
      if (bh.incumbent_vulnerabilities && bh.incumbent_vulnerabilities.length) {
        html += '<h3 class="text-lg font-bold mb-4" style="color:#D97706;">Incumbent Vulnerabilities</h3>';
        html += '<div class="space-y-4 mb-6">' + bh.incumbent_vulnerabilities.map(function(v) {
          return '<div class="card rounded-lg p-4" style="border-color:rgba(248,113,113,0.15);"><p class="text-base font-semibold mb-2" style="color:var(--mmt-navy);">' + esc(v.issue) + confBadge(v.confidence) + '</p><p class="text-sm mb-1" style="color:var(--mmt-text-secondary);">Evidence: ' + esc(v.evidence) + '</p><p class="text-sm" style="color:#D97706;">Exploit angle: ' + esc(v.exploit_angle) + '</p></div>';
        }).join('') + '</div>';
      }
      if (bh.protest_risks && bh.protest_risks.length) {
        html += '<h3 class="text-lg font-bold mb-4" style="color:#D97706;">Protest Risks</h3>';
        html += '<div class="space-y-4 mb-6">' + bh.protest_risks.map(function(p) {
          var lColor = p.likelihood === 'high' ? 'var(--mmt-red, #E63946)' : p.likelihood === 'medium' ? '#D97706' : 'var(--mmt-text-secondary)';
          return '<div class="card rounded-lg p-4" style="border-color:rgba(248,113,113,0.15);"><div class="flex items-center gap-2 mb-2"><p class="text-base font-semibold" style="color:var(--mmt-navy);">' + esc(p.scenario) + '</p><span class="text-xs px-2 py-0.5 rounded font-semibold" style="color:' + lColor + ';background:rgba(0,0,0,0.3);">' + esc(p.likelihood) + '</span>' + confBadge(p.confidence) + '</div><p class="text-sm" style="color:var(--mmt-text-secondary);">' + esc(p.basis) + '</p></div>';
        }).join('') + '</div>';
      }
      if (bh.recompete_threats && bh.recompete_threats.length) {
        html += '<h3 class="text-lg font-bold mb-4" style="color:#D97706;">Recompete Threats</h3>';
        html += '<div class="space-y-4 mb-6">' + bh.recompete_threats.map(function(t) {
          return '<div class="card rounded-lg p-4" style="border-color:rgba(248,113,113,0.15);"><p class="text-base font-semibold mb-2" style="color:var(--mmt-navy);">' + esc(t.threat) + confBadge(t.confidence) + '</p><p class="text-xs mb-1" style="color:var(--mmt-text-secondary);">Timeline: ' + esc(t.timeline) + '</p><p class="text-sm" style="color:var(--mmt-text-secondary);">' + esc(t.impact) + '</p></div>';
        }).join('') + '</div>';
      }
      if (bh.competitive_moves && bh.competitive_moves.length) {
        html += '<h3 class="text-lg font-bold mb-4" style="color:#D97706;">Competitive Moves</h3>';
        html += '<div class="space-y-4 mb-6">' + bh.competitive_moves.map(function(m) {
          return '<div class="card rounded-lg p-4" style="border-color:rgba(248,113,113,0.15);"><p class="text-base font-semibold mb-1" style="color:var(--mmt-navy);">' + esc(m.competitor) + '</p><p class="text-sm mb-1" style="color:var(--mmt-text-secondary);">' + esc(m.action) + confBadge(m.confidence) + '</p><p class="text-sm" style="color:var(--mmt-text-secondary);">' + esc(m.implication) + '</p></div>';
        }).join('') + '</div>';
      }
      if (bh.hidden_risks && bh.hidden_risks.length) {
        html += '<h3 class="text-lg font-bold mb-4" style="color:#D97706;">Hidden Risks</h3>';
        html += '<div class="space-y-3 mb-6">' + bh.hidden_risks.map(function(r) {
          return '<div class="card rounded-lg p-4" style="border-color:rgba(248,113,113,0.15);"><p class="text-base font-semibold mb-1" style="color:var(--mmt-navy);">' + esc(r.risk) + confBadge(r.confidence) + '</p><p class="text-sm" style="color:var(--mmt-text-secondary);">' + esc(r.detail) + '</p></div>';
        }).join('') + '</div>';
      }
      if (bh.bottom_line) {
        html += '<div class="mt-6 pt-6" style="border-top:1px solid rgba(248,113,113,0.2);"><p class="text-lg font-bold" style="color:var(--mmt-red, #E63946);">Bottom Line</p><p class="text-base leading-relaxed mt-2" style="color:var(--mmt-navy);">' + esc(bh.bottom_line) + '</p></div>';
      }
      html += '</div>';
      return html;
    }

    function renderSources(sources) {
      if (!sources || !sources.length) return '';
      var html = '<h2 class="text-xl font-bold mb-4" style="color:var(--mmt-navy);">Sources (' + sources.length + ')</h2>';
      html += '<div class="flex flex-wrap gap-2">';
      html += sources.map(function(url) {
        var domain;
        try { domain = new URL(url).hostname.replace('www.', ''); } catch(e) { domain = url; }
        return '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="text-sm no-underline px-3 py-1.5 rounded-lg hover:opacity-80 transition-all" style="background:rgba(69,123,157,0.08);color:var(--mmt-teal);">' + esc(domain) + '</a>';
      }).join('');
      html += '</div>';
      return html;
    }

    async function loadIntel() {
      try {
        var resp = await fetch('/.netlify/functions/contract-intel?contract=' + encodeURIComponent(contractName));
        if (!resp.ok) {
          if (resp.status === 404) {
            document.getElementById('intel-container').innerHTML = '<div class="card rounded-xl p-8 text-center"><p class="text-base mb-2" style="color:var(--mmt-text-secondary);">Intelligence data is being gathered for this contract.</p><p class="text-sm" style="color:var(--mmt-text-secondary);">Data refreshes daily at 6 AM ET. Check back soon.</p></div>';
          } else {
            document.getElementById('intel-container').innerHTML = '<p class="text-base" style="color:var(--mmt-red, #E63946);">Failed to load intelligence data.</p>';
          }
          return;
        }
        var data = await resp.json();

        // Confidence: metadata badge + progress bar
        if (data.intel && typeof data.intel.confidence_score === 'number') {
          var cs = parseInt(data.intel.confidence_score);
          var cColor = cs >= 80 ? 'var(--mmt-teal)' : cs >= 60 ? '#D97706' : 'var(--mmt-red, #E63946)';
          var cBg = cs >= 80 ? 'rgba(69,123,157,0.08)' : cs >= 60 ? 'rgba(217,119,6,0.08)' : 'rgba(230,57,70,0.08)';
          var cLabel = cs >= 80 ? 'High' : cs >= 60 ? 'Medium' : 'Low';
          // Metadata card badge
          var metaBadge = document.getElementById('confidence-meta-badge');
          if (metaBadge) {
            metaBadge.innerHTML = '<span class="inline-flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1 rounded" style="color:' + cColor + ';background:' + cBg + ';"><span class="w-2 h-2 rounded-full" style="background:' + cColor + ';"></span>' + cs + '%</span>';
          }
          // Progress bar
          var barEl = document.getElementById('confidence-bar');
          if (barEl) {
            barEl.classList.remove('hidden');
            document.getElementById('confidence-bar-fill').style.width = cs + '%';
            document.getElementById('confidence-bar-fill').style.background = cs >= 80 ? 'linear-gradient(90deg, var(--mmt-teal), var(--mmt-teal))' : cs >= 60 ? 'linear-gradient(90deg, #D97706, #D97706)' : 'linear-gradient(90deg, var(--mmt-red, #E63946), var(--mmt-red, #E63946))';
            document.getElementById('confidence-bar-pct').textContent = cs + '%';
            document.getElementById('confidence-bar-pct').style.color = cColor;
            var labelEl = document.getElementById('confidence-bar-label');
            labelEl.textContent = (data.intel.verified ? 'Verified' : cLabel);
            labelEl.style.color = cColor;
            labelEl.style.background = cBg;
          }
        }

        // Last updated
        if (data.last_updated) {
          document.getElementById('last-updated').textContent = 'Updated ' + fmtDate(data.last_updated);
        }

        // Intel
        if (data.intel) {
          document.getElementById('intel-container').innerHTML = renderIntel(data.intel);
        } else {
          document.getElementById('intel-container').innerHTML = '<div class="card rounded-xl p-8 text-center"><p class="text-base" style="color:var(--mmt-text-secondary);">No intelligence data available yet.</p></div>';
        }

        // Small Business
        if (data.intel && data.intel.small_business) {
          var sb = data.intel.small_business;
          if ((sb.opportunities && sb.opportunities.length) || (sb.set_aside_types && sb.set_aside_types.length) || sb.subcontracting_note) {
            document.getElementById('smallbiz-section').classList.remove('hidden');
            document.getElementById('smallbiz-container').innerHTML = renderSmallBiz(sb);
          }
        }

        // BLACK HAT
        if (data.black_hat) {
          document.getElementById('blackhat-section').classList.remove('hidden');
          document.getElementById('blackhat-container').innerHTML = renderBlackHat(data.black_hat);
        }

        // Sources
        if (data.sources && data.sources.length) {
          document.getElementById('sources-section').classList.remove('hidden');
          document.getElementById('sources-container').innerHTML = renderSources(data.sources);
        }
      } catch(err) {
        document.getElementById('intel-container').innerHTML = '<p class="text-base" style="color:var(--mmt-red, #E63946);">Failed to load intelligence data. Please try again later.</p>';
      }
    }

    loadIntel();
  })();
