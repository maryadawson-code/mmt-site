/**
 * Mission Meets Tech - Main JavaScript
 * Production Version - January 2026
 */

document.addEventListener('DOMContentLoaded', function() {
  
  // ============================================
  // MOBILE NAVIGATION TOGGLE
  // ============================================
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');
  
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function() {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
      
      // Prevent body scroll when menu is open
      document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });
    
    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', function() {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && navMenu.classList.contains('active')) {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }
  
  // ============================================
  // NEWSLETTER LOADER
  // ============================================
  const recentIssuesContainer = document.getElementById('recent-issues');
  
  if (recentIssuesContainer) {
    loadNewsletters();
  }
  
  async function loadNewsletters() {
    try {
      // Show loading state
      recentIssuesContainer.innerHTML = '<div class="loading"></div>';
      
      const response = await fetch('newsletters.json');
      
      if (!response.ok) {
        throw new Error('Failed to load newsletters');
      }
      
      const newsletters = await response.json();
      
      if (!newsletters || newsletters.length === 0) {
        recentIssuesContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No newsletters available yet. Check back soon!</p>';
        return;
      }
      
      // Render newsletters (show first 6 on homepage, all on newsletter page)
      const isHomepage = window.location.pathname === '/' || window.location.pathname === '/index.html';
      const displayCount = isHomepage ? 6 : newsletters.length;
      const displayNewsletters = newsletters.slice(0, displayCount);
      
      recentIssuesContainer.innerHTML = displayNewsletters.map(newsletter => `
        <article class="issue-card fade-in">
          <span class="issue-date">${newsletter.date}</span>
          <h3>${escapeHtml(newsletter.title)}</h3>
          <p>${escapeHtml(newsletter.description)}</p>
          <div class="issue-tags">
            ${newsletter.tags.map(tag => `<span class="issue-tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
          <a href="${newsletter.url}" target="_blank" rel="noopener" class="issue-link">
            Read on LinkedIn
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M7 17L17 7M17 7H7M17 7V17"/>
            </svg>
          </a>
        </article>
      `).join('');
      
      // Trigger fade-in animations
      setTimeout(() => {
        document.querySelectorAll('.issue-card.fade-in').forEach((card, index) => {
          setTimeout(() => {
            card.classList.add('visible');
          }, index * 100);
        });
      }, 100);
      
    } catch (error) {
      console.error('Error loading newsletters:', error);
      recentIssuesContainer.innerHTML = `
        <p style="text-align: center; color: var(--text-muted);">
          Unable to load recent issues. 
          <a href="https://www.linkedin.com/newsletters/mission-meets-tech-7307800960485969920/" target="_blank" rel="noopener">
            View on LinkedIn →
          </a>
        </p>
      `;
    }
  }
  
  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // ============================================
  // SMOOTH SCROLL
  // ============================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
  
  // ============================================
  // SCROLL ANIMATIONS
  // ============================================
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, observerOptions);
  
  // Observe elements with fade-in class (excluding dynamically loaded ones)
  document.querySelectorAll('.fade-in:not(.issue-card)').forEach(el => {
    observer.observe(el);
  });
  
  // ============================================
  // FORM HANDLING (Netlify)
  // ============================================
  const forms = document.querySelectorAll('form[data-netlify="true"]');
  
  forms.forEach(form => {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const submitButton = form.querySelector('button[type="submit"]');
      const originalText = submitButton ? submitButton.textContent : 'Submit';
      
      if (submitButton) {
        submitButton.textContent = 'Sending...';
        submitButton.disabled = true;
      }
      
      try {
        const formData = new FormData(form);
        
        const response = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(formData).toString()
        });
        
        if (response.ok) {
          // Success
          form.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00D29F" stroke-width="2" style="margin-bottom: 1rem;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22,4 12,14.01 9,11.01"/>
              </svg>
              <h3 style="color: var(--mint-accent); margin-bottom: 0.5rem;">Thank you!</h3>
              <p style="color: var(--text-secondary);">Your message has been received.</p>
            </div>
          `;
        } else {
          throw new Error('Form submission failed');
        }
      } catch (error) {
        console.error('Form error:', error);
        if (submitButton) {
          submitButton.textContent = 'Error - Try Again';
          submitButton.disabled = false;
          setTimeout(() => {
            submitButton.textContent = originalText;
          }, 3000);
        }
      }
    });
  });
  
  // ============================================
  // NAV BACKGROUND ON SCROLL
  // ============================================
  const nav = document.querySelector('.nav');
  
  if (nav) {
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;
      
      if (currentScroll > 50) {
        nav.style.background = 'rgba(0, 5, 15, 0.98)';
      } else {
        nav.style.background = 'rgba(0, 5, 15, 0.95)';
      }
      
      lastScroll = currentScroll;
    }, { passive: true });
  }
  
});
