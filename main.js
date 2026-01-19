/**
 * Mission Meets Tech - Main JavaScript
 * Handles navigation, newsletter loading, and form interactions
 */

(function() {
    'use strict';

    // DOM ready handler
    document.addEventListener('DOMContentLoaded', function() {
        initNavigation();
        initNewsletterIssues();
        initForms();
        initScrollAnimations();
    });

    /**
     * Initialize mobile navigation toggle
     */
    function initNavigation() {
        const navToggle = document.querySelector('.nav-toggle');
        const navMenu = document.querySelector('.nav-menu');

        if (!navToggle || !navMenu) return;

        navToggle.addEventListener('click', function() {
            const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', !isExpanded);
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking a link
        navMenu.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            if (!event.target.closest('.nav-container') && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    /**
     * Load and display newsletter issues from JSON
     */
    function initNewsletterIssues() {
        const issuesGrid = document.getElementById('issues-grid');
        if (!issuesGrid) return;

        fetch('newsletters.json')
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to load newsletters');
                }
                return response.json();
            })
            .then(function(issues) {
                if (!Array.isArray(issues) || issues.length === 0) {
                    issuesGrid.innerHTML = '<p class="text-center" style="color: var(--color-gray);">No issues available yet.</p>';
                    return;
                }

                issuesGrid.innerHTML = issues.map(function(issue) {
                    return createIssueCard(issue);
                }).join('');
            })
            .catch(function(error) {
                console.error('Error loading newsletters:', error);
                issuesGrid.innerHTML = '<p class="text-center" style="color: var(--color-gray);">Unable to load newsletter issues. Please try again later.</p>';
            });
    }

    /**
     * Create HTML for a single newsletter issue card
     * @param {Object} issue - Newsletter issue data
     * @returns {string} HTML string
     */
    function createIssueCard(issue) {
        var tagsHtml = '';
        if (issue.tags && Array.isArray(issue.tags)) {
            tagsHtml = '<div class="tags">' + 
                issue.tags.map(function(tag) {
                    return '<span class="tag">' + escapeHtml(tag) + '</span>';
                }).join('') + 
                '</div>';
        }

        return '<article class="glass-card issue-card">' +
            '<h3>' + escapeHtml(issue.title || 'Untitled') + '</h3>' +
            '<p class="date">' + escapeHtml(issue.date || '') + '</p>' +
            '<p class="description">' + escapeHtml(issue.description || '') + '</p>' +
            tagsHtml +
            '<a href="' + escapeHtml(issue.url || '#') + '" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Read on LinkedIn</a>' +
            '</article>';
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Initialize form handling
     */
    function initForms() {
        var forms = document.querySelectorAll('form[data-netlify="true"]');
        
        forms.forEach(function(form) {
            form.addEventListener('submit', function(event) {
                var submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.textContent = 'Sending...';
                    submitBtn.disabled = true;
                }
            });
        });
    }

    /**
     * Initialize scroll-based animations
     */
    function initScrollAnimations() {
        // Check if IntersectionObserver is supported
        if (!('IntersectionObserver' in window)) return;

        var animatedElements = document.querySelectorAll('.glass-card, .feature-card, .issue-card');
        
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        animatedElements.forEach(function(element) {
            element.style.opacity = '0';
            element.style.transform = 'translateY(20px)';
            observer.observe(element);
        });
    }

})();
