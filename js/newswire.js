// newswire.js — News filter pills
(function() {
  var pills = document.querySelectorAll('[data-filter]');
  var cards = document.querySelectorAll('.news-card');
  pills.forEach(function(pill) {
    pill.addEventListener('click', function() {
      pills.forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      var filter = pill.getAttribute('data-filter');
      cards.forEach(function(card) {
        if (filter === 'all' || card.getAttribute('data-category') === filter) {
          card.setAttribute('data-hidden', 'false');
          card.style.display = '';
        } else {
          card.setAttribute('data-hidden', 'true');
          card.style.display = 'none';
        }
      });
      // Update group headers visibility
      document.querySelectorAll('.news-date-group').forEach(function(group) {
        var visibleCards = group.querySelectorAll('.news-card:not([data-hidden="true"])');
        group.style.display = visibleCards.length > 0 ? '' : 'none';
      });
    });
  });
})();
