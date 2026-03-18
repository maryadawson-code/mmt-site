// tactical-brief.js — Client-side form handler for MarketPulse
// First report: submits directly to gateway (free)
// Subsequent reports: redirects to Stripe checkout ($50)

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var form = document.getElementById('tactical-brief-form');
    var submitBtn = document.getElementById('tb-submit-btn');
    var errorDiv = document.getElementById('tb-error');
    var loadingDiv = document.getElementById('tb-loading');

    if (!form || !submitBtn) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      var name = document.getElementById('tb-name').value.trim();
      var email = document.getElementById('tb-email').value.trim();
      var company = document.getElementById('tb-company').value.trim();
      var topic = document.getElementById('tb-topic').value.trim();
      var audience = document.getElementById('tb-audience').value.trim();

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
          audience: audience
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
          // Free report — redirect to confirmation
          window.location.href = '/tactical-brief-confirmed.html?free=true';
        } else if (data.url) {
          window.location.href = data.url;
        }
      })
      .catch(function(err) {
        showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Get Your Free MarketPulse Report';
        loadingDiv.style.display = 'none';
      });
    });

    function showError(msg) {
      errorDiv.textContent = msg;
      errorDiv.style.display = 'block';
    }

    function hideError() {
      errorDiv.style.display = 'none';
    }
  });
})();
