// Mission Meets Tech - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Mobile Navigation Toggle
  initMobileNav();
  
  // Newsletter Loader
  initNewsletterLoader();
  
  // Smooth Scroll
  initSmoothScroll();
  
  // Scroll Animations
  initScrollAnimations();
  
  // Form Handling
  initFormHandling();
});

// Mobile Navigation
function initMobileNav() {
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');
  
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function() {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
    });
    
    // Close menu when clicking a link
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', function() {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
      if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
      }
    });
  }
}

// Newsletter Loader
function initNewsletterLoader() {
  const container = document.getElementById('recent-issues');
  
  if (!container) return;
  
  // Show loading state
  container.innerHTML = '<div class="loading">Loading recent issues...</div>';
  
  fetch('newsletters.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to load newsletters');
      }
      return response.json();
    })
    .then(newsletters => {
      if (!newsletters || newsletters.length === 0) {
        container.innerHTML = '<p class="text-center">No newsletters available yet. Check back soon!</p>';
        return;
      }
      
      // Take the most recent 6 newsletters
      const recentNewsletters = newsletters.slice(0, 6);
      
      let html = '<div class="issues-grid">';
      
      recentNewsletters.forEach(newsletter => {
        const tags = newsletter.tags ? newsletter.tags.map(tag => 
          `<span class="tag">${tag}</span>`
        ).join('') : '';
        
        html += `
          <a href="${newsletter.url}" target="_blank" rel="noopener" class="issue-card">
            <div class="issue-date">${newsletter.date}</div>
            <h3 class="issue-title">${newsletter.title}</h3>
            <p class="issue-description">${newsletter.description}</p>
            <div class="issue-tags">${tags}</div>
          </a>
        `;
      });
      
      html += '</div>';
      container.innerHTML = html;
    })
    .catch(error => {
      console.error('Error loading newsletters:', error);
      container.innerHTML = `
        <p class="text-center">
          Unable to load newsletters. 
          <a href="https://www.linkedin.com/newsletters/mission-meets-tech-7307800960485969920/" target="_blank">
            View on LinkedIn →
          </a>
        </p>
      `;
    });
}

// Smooth Scroll
function initSmoothScroll() {
  const links = document.querySelectorAll('a[href^="#"]');
  
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      if (href === '#') return;
      
      const target = document.querySelector(href);
      
      if (target) {
        e.preventDefault();
        const offsetTop = target.offsetTop - 80; // Account for fixed nav
        
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
      }
    });
  });
}

// Scroll Animations
function initScrollAnimations() {
  const fadeElements = document.querySelectorAll('.fade-in');
  
  if (fadeElements.length === 0) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });
  
  fadeElements.forEach(el => observer.observe(el));
}

// Form Handling
function initFormHandling() {
  const forms = document.querySelectorAll('form[data-netlify="true"]');
  
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const submitBtn = form.querySelector('button[type="submit"]');
      
      if (submitBtn) {
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
      }
    });
  });
}

// Utility: Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
