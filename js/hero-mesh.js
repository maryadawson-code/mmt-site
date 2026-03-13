// S8-05: Animated data mesh background for hero
(function() {
  'use strict';
  var canvas = document.getElementById('hero-mesh');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var points = [];
  var numPoints = 40;
  var maxDist = 150;
  var w, h;

  function resize() {
    w = canvas.width = canvas.offsetWidth;
    h = canvas.height = canvas.offsetHeight;
  }

  function init() {
    resize();
    points = [];
    for (var i = 0; i < numPoints; i++) {
      points.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 1
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    // Draw connections
    for (var i = 0; i < points.length; i++) {
      for (var j = i + 1; j < points.length; j++) {
        var dx = points[i].x - points[j].x;
        var dy = points[i].y - points[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          var alpha = (1 - dist / maxDist) * 0.15;
          ctx.strokeStyle = 'rgba(0, 229, 250, ' + alpha + ')';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }
    }
    // Draw points
    for (var k = 0; k < points.length; k++) {
      var p = points[k];
      ctx.fillStyle = 'rgba(0, 229, 250, 0.3)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      // Move
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', function() { resize(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { init(); draw(); });
  } else {
    init(); draw();
  }
})();
