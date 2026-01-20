// ============================================
// Mission Meets Tech - Main JavaScript
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Mobile Navigation Toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navToggle.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking a link
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navToggle.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

    // Load Recent Issues
    const issuesContainer = document.getElementById('recent-issues');
    if (issuesContainer) {
        loadNewsletters(issuesContainer);
    }

    // Scroll CTA (appears after 70% scroll)
    const scrollCTA = document.querySelector('.scroll-cta');
    if (scrollCTA) {
        window.addEventListener('scroll', function() {
            const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
            if (scrollPercent > 70) {
                scrollCTA.classList.add('visible');
            } else {
                scrollCTA.classList.remove('visible');
            }
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// Load newsletters from JSON
async function loadNewsletters(container) {
    try {
        const response = await fetch('newsletters.json');
        if (!response.ok) throw new Error('Failed to load newsletters');
        
        const newsletters = await response.json();
        
        if (newsletters.length === 0) {
            container.innerHTML = '<p class="loading">No newsletters available yet.</p>';
            return;
        }

        // Display up to 6 most recent
        const recentIssues = newsletters.slice(0, 6);
        
        container.innerHTML = recentIssues.map(issue => `
            <article class="issue-card">
                <h3>${escapeHtml(issue.title)}</h3>
                <p class="date">${escapeHtml(issue.date)}</p>
                <p>${escapeHtml(issue.description)}</p>
                ${issue.tags ? `
                    <div class="tags">
                        ${issue.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
                <a href="${escapeHtml(issue.url)}" target="_blank" rel="noopener" class="btn btn-text">
                    Read More →
                </a>
            </article>
        `).join('');
    } catch (error) {
        console.error('Error loading newsletters:', error);
        container.innerHTML = '<p class="loading">Unable to load newsletters. Please refresh the page.</p>';
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Form submission handling (for Netlify forms)
document.querySelectorAll('form[data-netlify="true"]').forEach(form => {
    form.addEventListener('submit', function(e) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
        }
    });
});
