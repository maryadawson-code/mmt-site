/**
 * Mission Meets Tech - Main JavaScript
 * Navigation, scroll animations, form handling, and newsletter loading
 * @version 2.0.0
 * @author Mission Meets Tech
 */

'use strict';

/**
 * Initialize all site functionality when DOM is ready
 */
document.addEventListener('DOMContentLoaded', function() {
    initNavigation();
    initScrollAnimations();
    initNavbarScroll();
    loadRecentIssues();
});

/**
 * Initialize mobile navigation toggle functionality
 * Handles hamburger menu open/close and click-outside dismissal
 */
function initNavigation() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (!navToggle || !navMenu) {
        return;
    }
    
    navToggle.addEventListener('click', function() {
        navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
        
        // Update ARIA attribute for accessibility
        const isExpanded = navMenu.classList.contains('active');
        navToggle.setAttribute('aria-expanded', isExpanded);
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        }
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function() {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
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

/**
 * Initialize scroll-triggered fade-in animations using Intersection Observer
 * Elements with .fade-in, .glass-card, or .feature-card classes will animate
 */
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    // Observe elements with animation classes
    const animatedElements = document.querySelectorAll('.fade-in, .glass-card, .feature-card');
    animatedElements.forEach(function(el) {
        observer.observe(el);
    });
}

/**
 * Add/remove navbar background transparency based on scroll position
 * Navbar becomes more opaque when user scrolls down
 */
function initNavbarScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) {
        return;
    }

    // Throttle scroll events for better performance
    let ticking = false;
    
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                if (window.pageYOffset > 50) {
                    nav.classList.add('scrolled');
                } else {
                    nav.classList.remove('scrolled');
                }
                ticking = false;
            });
            ticking = true;
        }
    });
}

/**
 * Load and display recent newsletter issues from JSON data file
 * Renders issue cards dynamically into the #issues-grid container
 * @async
 */
async function loadRecentIssues() {
    const issuesGrid = document.getElementById('issues-grid');
    if (!issuesGrid) {
        return;
    }

    try {
        const response = await fetch('newsletters.json');
        
        if (!response.ok) {
            throw new Error('Failed to load newsletters: ' + response.status);
        }
        
        const newsletters = await response.json();
        
        // Display up to 6 recent issues
        const recentIssues = newsletters.slice(0, 6);
        
        if (recentIssues.length === 0) {
            issuesGrid.innerHTML = createEmptyStateHTML();
            return;
        }
        
        issuesGrid.innerHTML = recentIssues.map(function(issue) {
            return createIssueCardHTML(issue);
        }).join('');

    } catch (error) {
        // Log error for debugging but show user-friendly message
        if (typeof console !== 'undefined' && console.error) {
            console.error('Error loading newsletters:', error);
        }
        issuesGrid.innerHTML = createErrorStateHTML();
    }
}

/**
 * Generate HTML for a single newsletter issue card
 * @param {Object} issue - Newsletter issue data
 * @param {string} issue.date - Publication date
 * @param {string} issue.title - Issue title
 * @param {string} issue.description - Issue description/summary
 * @param {string[]} issue.tags - Array of topic tags
 * @param {string} issue.url - Link to full article
 * @returns {string} HTML string for the issue card
 */
function createIssueCardHTML(issue) {
    const tagsHTML = issue.tags.map(function(tag) {
        return '<span class="tag">' + escapeHTML(tag) + '</span>';
    }).join('');
    
    return '<article class="glass-card issue-card">' +
        '<div class="issue-date">' + escapeHTML(issue.date) + '</div>' +
        '<h3 class="issue-title">' + escapeHTML(issue.title) + '</h3>' +
        '<p class="issue-description">' + escapeHTML(issue.description) + '</p>' +
        '<div class="issue-tags">' + tagsHTML + '</div>' +
        '<a href="' + escapeHTML(issue.url) + '" target="_blank" rel="noopener noreferrer" class="btn btn-text">' +
            'Read on LinkedIn →' +
        '</a>' +
    '</article>';
}

/**
 * Generate HTML for empty state when no newsletters are available
 * @returns {string} HTML string for empty state message
 */
function createEmptyStateHTML() {
    return '<div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">' +
        '<p style="color: var(--color-text-muted);">No recent issues available. Check back soon!</p>' +
    '</div>';
}

/**
 * Generate HTML for error state when newsletters fail to load
 * @returns {string} HTML string for error state message
 */
function createErrorStateHTML() {
    return '<div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">' +
        '<p style="color: var(--color-text-muted);">Unable to load recent issues. Visit my ' +
        '<a href="https://www.linkedin.com/in/marydwomack-digitalhealth/" target="_blank" rel="noopener noreferrer">LinkedIn</a> ' +
        'for the latest content.</p>' +
    '</div>';
}

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - Raw text to escape
 * @returns {string} HTML-safe escaped string
 */
function escapeHTML(text) {
    if (typeof text !== 'string') {
        return '';
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
