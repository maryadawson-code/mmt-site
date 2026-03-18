// newsletter.js — Topic filter (progressive enhancement)
(function() {
  document.querySelectorAll('[data-filter-topic]').forEach(function(chip) {
    chip.addEventListener('click', function() {
      var topic = chip.getAttribute('data-filter-topic');
      var isActive = chip.classList.contains('active');
      // Reset all chips
      document.querySelectorAll('[data-filter-topic]').forEach(function(c) {
        c.classList.remove('active');
        c.style.background = 'rgba(0,229,250,0.1)';
        c.style.color = 'var(--mmt-cyan)';
      });
      // Show all or filter
      var entries = document.querySelectorAll('[data-topics]');
      if (isActive) {
        entries.forEach(function(e) { e.style.display = ''; });
      } else {
        chip.classList.add('active');
        chip.style.background = 'var(--mmt-cyan)';
        chip.style.color = '#fff';
        entries.forEach(function(e) {
          var topics = (e.getAttribute('data-topics') || '').split(',');
          e.style.display = topics.includes(topic) ? '' : 'none';
        });
      }
    });
  });
})();
