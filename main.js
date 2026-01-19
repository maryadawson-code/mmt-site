// Mission Meets Tech - Main JavaScript
// Mobile Navigation, Newsletter Loader, Scroll Animations

document.addEventListener('DOMContentLoaded', function() {
    
    // =====================
    // Mobile Navigation Toggle
    // =====================
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
    
    // =====================
    // Newsletter Loader
    // =====================
    const issuesContainer = document.getElementById('recent-issues');
    
    if (issuesContainer) {
        loadNewsletters();
    }
    
    async function loadNewsletters() {
        try {
            const response = await fetch('newsletters.json');
            if (!response.ok) throw new Error('Failed to load newsletters');
            
            const newsletters = await response.json();
            renderNewsletters(newsletters);
        } catch (error) {
            console.error('Error loading newsletters:', error);
            issuesContainer.innerHTML = '<p class="error-message">Unable to load recent issues. Please check back later.</p>';
        }
    }
    
    function renderNewsletters(newsletters) {
        // Limit to 6 most recent for homepage, all for newsletter page
        const isHomepage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
        const displayCount = isHomepage ? 6 : newsletters.length;
        const displayNewsletters = newsletters.slice(0, displayCount);
        
        const html = displayNewsletters.map(newsletter => `
            <article class="issue-card glass-card">
                <div class="issue-content">
                    <span class="issue-date">${newsletter.date}</span>
                    <h3 class="issue-title">${newsletter.title}</h3>
                    <p class="issue-description">${newsletter.description}</p>
                    <div class="issue-tags">
                        ${newsletter.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    <a href="${newsletter.url}" class="btn btn-text" target="_blank" rel="noopener noreferrer">
                        Read on LinkedIn →
                    </a>
                </div>
            </article>
        `).join('');
        
        issuesContainer.innerHTML = html;
        
        // Animate cards in
        const cards = issuesContainer.querySelectorAll('.issue-card');
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }
    
    // =====================
    // Smooth Scroll for Anchor Links
    // =====================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // =====================
    // Scroll Animations (Intersection Observer)
    // =====================
    const animateOnScroll = document.querySelectorAll('.animate-on-scroll, .glass-card, .feature-card');
    
    if (animateOnScroll.length > 0 && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animated');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });
        
        animateOnScroll.forEach(el => {
            el.classList.add('pre-animate');
            observer.observe(el);
        });
    }
    
    // =====================
    // Form Handling (Netlify)
    // =====================
    const forms = document.querySelectorAll('form[data-netlify="true"]');
    
    forms.forEach(form => {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            
            try {
                const formData = new FormData(form);
                const response = await fetch('/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(formData).toString()
                });
                
                if (response.ok) {
                    form.innerHTML = '<div class="success-message"><h3>Thank you!</h3><p>Your message has been sent successfully.</p></div>';
                } else {
                    throw new Error('Form submission failed');
                }
            } catch (error) {
                console.error('Form error:', error);
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                alert('There was an error sending your message. Please try again.');
            }
        });
    });
    
    // =====================
    // Active Nav Link Highlighting
    // =====================
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-menu a').forEach(link => {
        const linkPath = link.getAttribute('href');
        if (currentPath.includes(linkPath) && linkPath !== '/') {
            link.classList.add('active');
        } else if (linkPath === '/' && (currentPath === '/' || currentPath.endsWith('index.html'))) {
            link.classList.add('active');
        }
    });
    
});

// =====================
// Utility: Add CSS for pre-animate state
// =====================
const style = document.createElement('style');
style.textContent = `
    .pre-animate {
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.6s ease, transform 0.6s ease;
    }
    .pre-animate.animated {
        opacity: 1;
        transform: translateY(0);
    }
    .success-message {
        text-align: center;
        padding: 2rem;
    }
    .success-message h3 {
        color: var(--mint-accent, #00D29F);
        margin-bottom: 0.5rem;
    }
    .error-message {
        text-align: center;
        color: var(--text-secondary, rgba(255,255,255,0.7));
        padding: 2rem;
    }
`;
document.head.appendChild(style);
