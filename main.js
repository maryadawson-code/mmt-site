// Mission Meets Tech - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Mobile Navigation Toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function() {
      navMenu.classList.toggle('active');
      const icon = navToggle.querySelector('span');
      if (icon) {
        icon.textContent = navMenu.classList.contains('active') ? '✕' : '☰';
      }
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        const icon = navToggle.querySelector('span');
        if (icon) icon.textContent = '☰';
      });
    });
  }

  // Scroll Animations
  const fadeElements = document.querySelectorAll('.fade-in');
  
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  fadeElements.forEach(el => fadeObserver.observe(el));

  // Load Newsletter Issues
  loadNewsletterIssues();

  // Form Submission Handling
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', handleFormSubmit);
  });
});

// Load Newsletter Issues from JSON
async function loadNewsletterIssues() {
  const issuesContainer = document.getElementById('recent-issues');
  if (!issuesContainer) return;

  try {
    const response = await fetch('/newsletters.json');
    if (!response.ok) throw new Error('Failed to load newsletters');
    
    const newsletters = await response.json();
    
    // Display first 6 for recent issues
    const recentIssues = newsletters.slice(0, 6);
    
    issuesContainer.innerHTML = recentIssues.map(issue => `
      <article class="glass-card issue-card fade-in visible">
        <p class="date">${issue.date}</p>
        <h3><a href="${issue.url}" target="_blank" rel="noopener">${issue.title}</a></h3>
        <p>${issue.description}</p>
        <div class="issue-tags">
          ${issue.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      </article>
    `).join('');

  } catch (error) {
    console.error('Error loading newsletters:', error);
    issuesContainer.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
        <p>Newsletter archive loading... <a href="https://www.linkedin.com/newsletters/mission-meets-tech-7307800960485969920/" target="_blank">View on LinkedIn</a></p>
      </div>
    `;
  }
}

// Load All Newsletter Issues (for archive page)
async function loadAllNewsletterIssues() {
  const archiveContainer = document.getElementById('newsletter-archive');
  if (!archiveContainer) return;

  try {
    const response = await fetch('/newsletters.json');
    if (!response.ok) throw new Error('Failed to load newsletters');
    
    const newsletters = await response.json();
    
    archiveContainer.innerHTML = newsletters.map(issue => `
      <article class="glass-card issue-card fade-in visible">
        <p class="date">${issue.date}</p>
        <h3><a href="${issue.url}" target="_blank" rel="noopener">${issue.title}</a></h3>
        <p>${issue.description}</p>
        <div class="issue-tags">
          ${issue.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      </article>
    `).join('');

  } catch (error) {
    console.error('Error loading archive:', error);
    archiveContainer.innerHTML = `
      <div class="glass-card" style="text-align: center; padding: 3rem;">
        <p>Unable to load archive. <a href="https://www.linkedin.com/newsletters/mission-meets-tech-7307800960485969920/" target="_blank">View on LinkedIn</a></p>
      </div>
    `;
  }
}

// Form Submission Handler
function handleFormSubmit(e) {
  // Let Netlify handle the submission
  // This just provides visual feedback
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;

    // Re-enable after submission (Netlify will handle redirect)
    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }, 3000);
  }
}

// Smooth Scroll for Anchor Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// Initialize archive page if on that page
if (document.getElementById('newsletter-archive')) {
  loadAllNewsletterIssues();
}
