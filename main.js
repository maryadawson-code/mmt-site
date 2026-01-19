// Mission Meets Tech - Main JavaScript
// Navigation, scroll animations, form handling, and newsletter loading

document.addEventListener('DOMContentLoaded', function() {
    initNavigation();
    initScrollAnimations();
    initNavbarScroll();
    loadRecentIssues();
});

// Mobile Navigation Toggle
function initNavigation() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (!navToggle || !navMenu) return;
    
    navToggle.addEventListener('click', function() {
        navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
        }
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
        });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
}

// Scroll animations - fade in elements as they come into view
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    // Observe elements with fade-in class
    document.querySelectorAll('.fade-in, .glass-card, .feature-card').forEach(el => {
        observer.observe(el);
    });
}

// Add/remove navbar background on scroll
function initNavbarScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });
}

// Load and display recent newsletter issues
async function loadRecentIssues() {
    const issuesGrid = document.getElementById('issues-grid');
    if (!issuesGrid) return;

    try {
        const response = await fetch('newsletters.json');
        if (!response.ok) throw new Error('Failed to load newsletters');
        
        const newsletters = await response.json();
        
        // Display up to 6 recent issues
        const recentIssues = newsletters.slice(0, 6);
        
        issuesGrid.innerHTML = recentIssues.map(issue => `
            <article class="glass-card issue-card">
                <div class="issue-date">${issue.date}</div>
                <h3 class="issue-title">${issue.title}</h3>
                <p class="issue-description">${issue.description}</p>
                <div class="issue-tags">
                    ${issue.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                <a href="${issue.url}" target="_blank" rel="noopener noreferrer" class="btn btn-text">
                    Read on LinkedIn →
                </a>
            </article>
        `).join('');

    } catch (error) {
        console.error('Error loading newsletters:', error);
        issuesGrid.innerHTML = `
            <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <p style="color: var(--color-text-muted);">Unable to load recent issues. Visit my <a href="https://www.linkedin.com/in/marydwomack-digitalhealth/" target="_blank" rel="noopener">LinkedIn</a> for the latest content.</p>
            </div>
        `;
    }
}
