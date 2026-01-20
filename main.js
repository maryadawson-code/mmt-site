/* Mission Meets Tech - Production JavaScript v2.0 */

document.addEventListener('DOMContentLoaded', function() {
    initNavigation();
    initNewsletterLoader();
});

function initNavigation() {
    var navToggle = document.querySelector('.nav-toggle');
    var navMenu = document.querySelector('.nav-menu');
    if (!navToggle || !navMenu) return;
    
    navToggle.addEventListener('click', function() {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
    
    var links = navMenu.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
        links[i].addEventListener('click', function() {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        });
    }
}

function initNewsletterLoader() {
    var container = document.getElementById('recent-issues');
    if (!container) return;
    
    fetch('newsletters.json')
        .then(function(response) {
            if (!response.ok) throw new Error('Failed to load');
            return response.json();
        })
        .then(function(data) {
            if (!data || data.length === 0) {
                container.innerHTML = '<p class="loading">No newsletters available.</p>';
                return;
            }
            renderNewsletters(container, data.slice(0, 6));
        })
        .catch(function() {
            container.innerHTML = '<p class="loading">Unable to load newsletters.</p>';
        });
}

function renderNewsletters(container, items) {
    var html = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var tagsHtml = '';
        if (item.tags && item.tags.length > 0) {
            tagsHtml = '<div class="tags">';
            for (var j = 0; j < item.tags.length; j++) {
                tagsHtml += '<span class="tag">' + escapeHtml(item.tags[j]) + '</span>';
            }
            tagsHtml += '</div>';
        }
        html += '<article class="issue-card">' +
            '<h3>' + escapeHtml(item.title) + '</h3>' +
            '<p class="date">' + escapeHtml(item.date) + '</p>' +
            '<p>' + escapeHtml(item.description) + '</p>' +
            tagsHtml +
            '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener" class="btn btn-text">Read on LinkedIn →</a>' +
            '</article>';
    }
    container.innerHTML = html;
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
