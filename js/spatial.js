// spatial.js — Immersive spatial animation layer (Sprint 3)
// Requires GSAP 3.13+ and ScrollTrigger plugin
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  // Wait for GSAP to be available
  if (typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  var isDesktop = window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;

  document.addEventListener('DOMContentLoaded', function () {
    initScrollReveal();
    initParallaxDepth();
    initSectionTransitions();
    initTypographicMotion();
    initSmoothScroll();
    initScrollProgress();

    if (isDesktop) {
      initCursorAwareness();
    }

    // Podcast-specific
    initPodcastAnimations();
    // Card cascade
    initCardCascade();

    ScrollTrigger.refresh();
  });

  // --- S3-02: Scroll Reveal System ---
  function initScrollReveal() {
    // Handle both .reveal and legacy .fade-up elements
    gsap.utils.toArray('.reveal, .fade-up').forEach(function (el) {
      // Disable CSS transition so GSAP takes over
      el.style.transition = 'none';
      el.style.opacity = '';
      el.style.transform = '';
      el.classList.add('visible'); // prevent CSS fade-up from also running

      gsap.from(el, {
        y: 40,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });

    gsap.utils.toArray('.reveal-group').forEach(function (group) {
      var items = group.querySelectorAll('.reveal-item');
      if (!items.length) return;
      gsap.from(items, {
        y: 60,
        opacity: 0,
        duration: 0.7,
        stagger: 0.12,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: group,
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      });
    });

    gsap.utils.toArray('.reveal-left').forEach(function (el) {
      gsap.from(el, {
        x: -60,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });
  }

  // --- S3-03: Homepage Cinematic Hero ---
  function initHeroAnimation() {
    var hero = document.getElementById('hero');
    var heroContent = document.getElementById('hero-content');
    if (!hero || !heroContent) return;

    gsap.to(heroContent, {
      opacity: 0,
      y: -80,
      scale: 0.95,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.5
      }
    });

    gsap.utils.toArray('.depth-orb').forEach(function (orb, i) {
      gsap.to(orb, {
        y: -(100 + i * 50),
        x: i % 2 === 0 ? 50 : -30,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: 1 + i * 0.5
        }
      });
    });
  }

  // --- S3-04: Parallax Depth ---
  function initParallaxDepth() {
    // Also init hero if present
    initHeroAnimation();

    var factor = isDesktop ? 1 : 0.5;

    gsap.utils.toArray('.parallax-section').forEach(function (section) {
      var bg = section.querySelector('.parallax-bg');
      if (!bg) return;
      gsap.to(bg, {
        y: -50 * factor,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });

    // Eyebrow text subtle slide-in
    gsap.utils.toArray('.text-eyebrow').forEach(function (el) {
      // Skip if inside the hero (handled by typographic motion)
      if (el.closest('#hero')) return;
      gsap.from(el, {
        y: 15,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 90%',
          toggleActions: 'play none none none'
        }
      });
    });
  }

  // --- S3-05: Cursor-Aware Micro-Interactions ---
  function initCursorAwareness() {
    // 3D tilt on cards
    document.querySelectorAll('.card').forEach(function (card) {
      card.style.transformStyle = 'preserve-3d';

      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var centerX = rect.width / 2;
        var centerY = rect.height / 2;
        var tiltX = ((y - centerY) / centerY) * -3;
        var tiltY = ((x - centerX) / centerX) * 3;

        gsap.to(card, {
          rotateX: tiltX,
          rotateY: tiltY,
          duration: 0.4,
          ease: 'power2.out',
          transformPerspective: 1000,
          transformOrigin: 'center center'
        });
      });

      card.addEventListener('mouseleave', function () {
        gsap.to(card, {
          rotateX: 0,
          rotateY: 0,
          duration: 0.6,
          ease: 'power2.out'
        });
      });
    });

    // Magnetic buttons
    document.querySelectorAll('.btn-primary, .btn-secondary').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var rect = btn.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        gsap.to(btn, { x: x * 0.15, y: y * 0.15, duration: 0.3, ease: 'power2.out' });
      });

      btn.addEventListener('mouseleave', function () {
        gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
      });
    });
  }

  // --- S3-06: Cinematic Section Transitions ---
  function initSectionTransitions() {
    gsap.utils.toArray('.spatial-section').forEach(function (section) {
      gsap.from(section, {
        scale: 0.97,
        opacity: 0.8,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 90%',
          end: 'top 40%',
          scrub: 1
        }
      });
    });

    gsap.utils.toArray('.section-divider').forEach(function (divider) {
      gsap.from(divider, {
        scaleX: 0,
        duration: 0.8,
        ease: 'power2.inOut',
        scrollTrigger: {
          trigger: divider,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });
  }

  // --- S3-07: Typographic Motion ---
  function initTypographicMotion() {
    var headline = document.getElementById('hero-headline');
    if (!headline) return;

    var text = headline.textContent.trim();
    var words = text.split(/\s+/);
    headline.innerHTML = words.map(function (word) {
      return '<span class="hero-word" style="display:inline-block;overflow:hidden;"><span style="display:inline-block;">' + word + '</span></span>';
    }).join(' ');

    var wordSpans = headline.querySelectorAll('.hero-word > span');
    gsap.from(wordSpans, {
      y: '100%',
      opacity: 0,
      duration: 0.7,
      stagger: 0.06,
      ease: 'power3.out',
      delay: 0.3
    });

    var section = headline.closest('section');
    if (!section) return;

    var eyebrow = section.querySelector('.text-eyebrow');
    var subline = section.querySelector('.text-body');
    var ctas = section.querySelector('.flex');

    if (eyebrow) gsap.from(eyebrow, { opacity: 0, y: 20, duration: 0.6, delay: 0.1, ease: 'power2.out' });
    if (subline) gsap.from(subline, { opacity: 0, y: 20, duration: 0.6, delay: 0.8, ease: 'power2.out' });
    if (ctas) gsap.from(ctas, { opacity: 0, y: 20, duration: 0.6, delay: 1.0, ease: 'power2.out' });
  }

  // --- S3-08: Smooth Scroll ---
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var href = this.getAttribute('href');
        if (href === '#') return;
        var target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          gsap.to(window, {
            duration: 1,
            scrollTo: { y: target, offsetY: 80 },
            ease: 'power2.inOut'
          });
        }
      });
    });
  }

  // --- S3-08: Scroll Progress ---
  function initScrollProgress() {
    var bar = document.getElementById('scroll-progress');
    if (!bar) return;
    gsap.to(bar, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.3
      }
    });
  }

  // --- S3-09: Podcast Animations ---
  function initPodcastAnimations() {
    var episodes = document.querySelectorAll('.episode-card');
    if (!episodes.length) return;

    episodes.forEach(function (ep, i) {
      gsap.from(ep, {
        x: i % 2 === 0 ? -30 : 30,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: ep,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });

    var platformBtns = document.querySelectorAll('.platform-btn');
    if (platformBtns.length) {
      gsap.from(platformBtns, {
        scale: 0.8,
        opacity: 0,
        stagger: 0.1,
        duration: 0.5,
        ease: 'back.out(1.7)',
        scrollTrigger: {
          trigger: platformBtns[0].closest('.card') || platformBtns[0],
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      });
    }
  }

  // --- S3-10: Card Cascade ---
  function initCardCascade() {
    gsap.utils.toArray('.persona-card').forEach(function (card, i) {
      gsap.from(card, {
        y: 80,
        opacity: 0,
        rotation: i % 2 === 0 ? -2 : 2,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });

    gsap.utils.toArray('.article-card').forEach(function (card) {
      gsap.from(card, {
        scale: 0.92,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });
  }

  // --- Cleanup ---
  window.addEventListener('beforeunload', function () {
    ScrollTrigger.getAll().forEach(function (st) { st.kill(); });
  });
})();
