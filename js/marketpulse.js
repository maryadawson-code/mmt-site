// tactical-brief.js — Client-side form handler for MarketPulse
// First report: submits directly to gateway (free)
// Subsequent reports: redirects to Stripe checkout ($50)

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var form = document.getElementById('tactical-brief-form');
    var submitBtn = document.getElementById('tb-submit-btn');
    var errorDiv = document.getElementById('tb-error');
    var errorText = document.getElementById('tb-error-text');
    var loadingDiv = document.getElementById('tb-loading');
    var successDiv = document.getElementById('tb-success');

    if (!form || !submitBtn) return;

    // Blur validation for required fields
    function validateField(id, message) {
      var input = document.getElementById(id);
      var errEl = document.getElementById(id + '-error');
      if (!input || !errEl) return;
      input.addEventListener('blur', function() {
        var val = input.value.trim();
        if (!val) {
          errEl.textContent = message;
          errEl.style.display = 'block';
          input.setAttribute('aria-describedby', id + '-error');
        } else if (id === 'tb-email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          errEl.textContent = 'Please enter a valid email address';
          errEl.style.display = 'block';
          input.setAttribute('aria-describedby', id + '-error');
        } else {
          errEl.textContent = '';
          errEl.style.display = 'none';
          input.removeAttribute('aria-describedby');
        }
      });
    }
    validateField('tb-name', 'Name is required');
    validateField('tb-email', 'Email is required');
    validateField('tb-topic', 'Research topic is required');

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var name = document.getElementById('tb-name').value.trim();
      var email = document.getElementById('tb-email').value.trim();
      var company = document.getElementById('tb-company').value.trim();
      var topic = document.getElementById('tb-topic').value.trim();
      var audience = document.getElementById('tb-audience').value.trim();
      var certEl = document.getElementById('tb-certifications');
      var naicsEl = document.getElementById('tb-naics');
      var vehiclesEl = document.getElementById('tb-vehicles');
      var certifications = certEl ? certEl.value.trim() : '';
      var naics_codes = naicsEl ? naicsEl.value.trim() : '';
      var existing_vehicles = vehiclesEl ? vehiclesEl.value.trim() : '';

      if (!name || !email || !topic) {
        showError('Please fill in all required fields (name, email, and research topic).');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('Please enter a valid email address.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      hideError();
      loadingDiv.style.display = 'block';

      // POST to gateway — it decides free vs paid
      fetch('/.netlify/functions/marketpulse-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,
          company: company,
          topic: topic,
          audience: audience,
          certifications: certifications || undefined,
          naics_codes: naics_codes || undefined,
          existing_vehicles: existing_vehicles || undefined
        })
      })
      .then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) throw new Error(data.error || 'Something went wrong.');
          return data;
        });
      })
      .then(function(data) {
        if (data.action === 'checkout') {
          // Paid report — redirect to Stripe
          submitBtn.textContent = 'Redirecting to checkout...';
          window.location.href = data.url;
        } else if (data.action === 'free') {
          // Free report — show inline confirmation
          showSuccess(topic, email);
        } else if (data.url) {
          window.location.href = data.url;
        }
      })
      .catch(function(err) {
        showError(err.message || 'Something went wrong submitting your request. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Get Your Free MarketPulse Report';
        loadingDiv.style.display = 'none';
      });
    });

    function showError(msg) {
      if (errorText) {
        errorText.textContent = msg;
      } else {
        errorDiv.textContent = msg;
      }
      errorDiv.style.display = 'block';
    }

    function hideError() {
      errorDiv.style.display = 'none';
    }

    function showSuccess(topic, email) {
      loadingDiv.style.display = 'none';
      form.style.display = 'none';
      if (successDiv) {
        var topicEl = document.getElementById('tb-confirm-topic');
        var emailEl = document.getElementById('tb-confirm-email');
        if (topicEl) topicEl.textContent = topic;
        if (emailEl) emailEl.textContent = email;
        successDiv.style.display = 'block';

        // Inject post-free upgrade prompt
        var upgradePrompt = document.getElementById('mp-upgrade-prompt');
        if (!upgradePrompt) {
          upgradePrompt = document.createElement('div');
          upgradePrompt.id = 'mp-upgrade-prompt';
          upgradePrompt.style.cssText = 'margin-top:24px;padding:22px 24px;background:var(--mmt-soft, #F3F4F6);border:1px solid var(--mmt-border, #D8E0E8);border-radius:12px;';
          var isPremium = typeof mmtIsPremium === 'function' && mmtIsPremium();
          var priceLabel = isPremium ? '$35' : '$50';
          upgradePrompt.innerHTML = '<p style="font-size:15px;font-weight:700;color:var(--mmt-navy, #0A192F);margin-bottom:8px;">Additional briefs: ' + priceLabel + ' each, delivered in 24 hours.</p>' +
            (isPremium
              ? '<p style="font-size:13px;color:#92710A;font-weight:600;">Premium member discount applied.</p>'
              : '<p style="font-size:13px;color:var(--mmt-text-secondary, #5C6B7A);">Premium subscribers pay $35 per brief. <a href="/pricing.html" style="color:var(--mmt-teal, #457B9D);font-weight:600;">See Premium</a></p>');
          successDiv.appendChild(upgradePrompt);
          if (typeof plausible !== 'undefined') plausible('MarketPulse Upgrade Prompt View');
        }
      } else {
        window.location.href = '/tactical-brief-confirmed.html?free=true';
      }
    }
  });
})();
