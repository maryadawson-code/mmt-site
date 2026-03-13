// tactical-brief.js — Client-side form handler for Tactical Brief intake
// Posts form data to create-tactical-brief-checkout endpoint, redirects to Stripe

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

      // Gather form values
      var name = document.getElementById('tb-name').value.trim();
      var email = document.getElementById('tb-email').value.trim();
      var company = document.getElementById('tb-company').value.trim();
      var topic = document.getElementById('tb-topic').value.trim();
      var audience = document.getElementById('tb-audience').value.trim();

      // Validate required fields
      if (!name || !email || !topic) {
        showError('Please fill in all required fields (name, email, and research topic).');
        return;
      }

      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('Please enter a valid email address.');
        return;
      }

      // Disable form and show loading
      submitBtn.disabled = true;
      submitBtn.textContent = 'Redirecting to checkout...';
      hideError();
      loadingDiv.style.display = 'block';

      // POST to checkout endpoint
      fetch('/.netlify/functions/create-tactical-brief-checkout', {
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
        if (!res.ok) {
          return res.json().then(function(data) {
            throw new Error(data.error || 'Something went wrong. Please try again.');
          });
        }
        return res.json();
      })
      .then(function(data) {
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL returned. Please try again.');
        }
      })
      .catch(function(err) {
        showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Get Your Tactical Brief — $50';
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
