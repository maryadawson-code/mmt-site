// spatial.js — Immersive Spatial Engine v2 (Sprint 5)
// GSAP 3.13+ with ScrollTrigger + ScrollToPlugin
(function () {
  'use strict';

  // Bail early for reduced motion or missing GSAP
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  var mm = gsap.matchMedia();

  document.addEventListener('DOMContentLoaded', function () {

    // ========================
    // GLOBAL: Scroll Progress Bar
    // ========================
    var progressBar = document.getElementById('scroll-progress');
    if (progressBar) {
      gsap.to(progressBar, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: document.documentElement,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.3
        }
      });
    }

    // ========================
    // GLOBAL: Smooth anchor scrolling
    // ========================
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var href = this.getAttribute('href');
        if (href === '#') return;
        var target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          gsap.to(window, {
            duration: 1.2,
            scrollTo: { y: target, offsetY: 80 },
            ease: 'power3.inOut'
          });
        }
      });
    });

    // ========================
    // DESKTOP ONLY EFFECTS
    // ========================
    mm.add('(min-width: 768px) and (pointer: fine)', function () {

      // --- Pinned Hero with Parallax Dissolve ---
      var hero = document.getElementById('hero');
      var heroContent = document.getElementById('hero-content');
      if (hero && heroContent) {
        gsap.timeline({
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: '+=25vh',
            scrub: 0.5,
            pin: true,
            pinSpacing: true
          }
        })
        .to(heroContent, {
          opacity: 0,
          y: -80,
          scale: 0.95,
          ease: 'none'
        });

        // Depth orbs parallax
        gsap.utils.toArray('.depth-orb').forEach(function (orb, i) {
          gsap.to(orb, {
            y: -(100 + i * 50),
            x: i % 2 === 0 ? 40 : -30,
            scale: 1.15 + i * 0.08,
            ease: 'none',
            scrollTrigger: {
              trigger: hero,
              start: 'top top',
              end: '+=25vh',
              scrub: 1 + i * 0.3
            }
          });
        });
      }

      // --- 3D Card Tilt on Hover ---
      document.querySelectorAll('.card:not(.persona-card), .card-spatial').forEach(function (card) {
        card.style.transformStyle = 'preserve-3d';

        card.addEventListener('mousemove', function (e) {
          var rect = card.getBoundingClientRect();
          var x = (e.clientX - rect.left) / rect.width;
          var y = (e.clientY - rect.top) / rect.height;
          var tiltX = (y - 0.5) * -6;
          var tiltY = (x - 0.5) * 6;

          gsap.to(card, {
            rotateX: tiltX,
            rotateY: tiltY,
            duration: 0.4,
            ease: 'power2.out',
            transformPerspective: 1200
          });
        });

        card.addEventListener('mouseleave', function () {
          gsap.to(card, {
            rotateX: 0,
            rotateY: 0,
            duration: 0.7,
            ease: 'elastic.out(1, 0.4)'
          });
        });
      });

      // --- Magnetic Buttons ---
      document.querySelectorAll('.btn-primary, .btn-secondary').forEach(function (btn) {
        btn.addEventListener('mousemove', function (e) {
          var rect = btn.getBoundingClientRect();
          var x = e.clientX - rect.left - rect.width / 2;
          var y = e.clientY - rect.top - rect.height / 2;
          gsap.to(btn, { x: x * 0.2, y: y * 0.2, duration: 0.3, ease: 'power2.out' });
        });

        btn.addEventListener('mouseleave', function () {
          gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
        });
      });

    }); // end desktop mm

    // ========================
    // ALL DEVICES: Scroll Reveals
    // ========================

    // --- Typographic Hero Entrance (on page load, NOT scroll) ---
    var headline = document.getElementById('hero-headline');
    if (headline) {
      var text = headline.textContent.trim();
      var words = text.split(/\s+/);
      headline.innerHTML = words.map(function (word) {
        return '<span class="hero-word" style="display:inline-block;overflow:hidden;"><span style="display:inline-block;">' + word + '</span></span>';
      }).join(' ');

      var wordSpans = headline.querySelectorAll('.hero-word > span');
      gsap.from(wordSpans, {
        y: '110%',
        opacity: 0,
        duration: 0.8,
        stagger: 0.05,
        ease: 'power4.out',
        delay: 0.2
      });

      // Hero supporting elements entrance
      var section = headline.closest('section');
      if (section) {
        var eyebrow = section.querySelector('.text-eyebrow');
        var subline = section.querySelector('.text-body');
        var ctas = section.querySelector('.flex');
        if (eyebrow) gsap.from(eyebrow, { opacity: 0, y: 20, duration: 0.7, delay: 0.1, ease: 'power2.out' });
        if (subline) gsap.from(subline, { opacity: 0, y: 20, duration: 0.7, delay: 0.7, ease: 'power2.out' });
        if (ctas) gsap.from(ctas, { opacity: 0, y: 20, duration: 0.7, delay: 0.9, ease: 'power2.out' });
      }
    }

    // --- Scroll Reveal System ---
    gsap.utils.toArray('.reveal, .fade-up').forEach(function (el) {
      if (el.closest('#hero')) return;
      if (el.classList.contains('persona-card')) return;
      // Skip elements inside cascade-3d-group — handled by S6-07 cascade animation
      if (el.closest('.cascade-3d-group')) return;

      el.style.transition = 'none';
      el.classList.add('visible');

      gsap.from(el, {
        y: 50,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none'
        }
      });
    });

    // Staggered group reveals
    gsap.utils.toArray('.reveal-group').forEach(function (group) {
      var items = group.querySelectorAll('.reveal-item');
      if (!items.length) return;
      gsap.from(items, {
        y: 60,
        opacity: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: group,
          start: 'top 82%',
          toggleActions: 'play none none none'
        }
      });
    });

    // Directional reveals
    gsap.utils.toArray('.reveal-left').forEach(function (el) {
      gsap.from(el, {
        x: -80,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });

    // --- Article/Card Cascade ---
    gsap.utils.toArray('.article-card').forEach(function (card, i) {
      gsap.from(card, {
        y: 60,
        opacity: 0,
        scale: 0.95,
        duration: 0.7,
        delay: i * 0.06,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 88%',
          toggleActions: 'play none none none'
        }
      });
    });

    // Persona cards
    gsap.utils.toArray('.persona-card').forEach(function (card, i) {
      gsap.from(card, {
        y: 80,
        opacity: 0,
        rotation: i % 2 === 0 ? -2 : 2,
        duration: 0.8,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
        scrollTrigger: {
          trigger: card,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });

    // --- Eyebrow text slide-in ---
    gsap.utils.toArray('.text-eyebrow').forEach(function (el) {
      if (el.closest('#hero')) return;
      gsap.from(el, {
        x: -20,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 90%',
          toggleActions: 'play none none none'
        }
      });
    });

    // --- Section divider draw-in ---
    gsap.utils.toArray('.section-divider').forEach(function (divider) {
      gsap.from(divider, {
        scaleX: 0,
        duration: 1,
        ease: 'power2.inOut',
        scrollTrigger: {
          trigger: divider,
          start: 'top 88%',
          toggleActions: 'play none none none'
        }
      });
    });

    // --- Podcast episode cards ---
    var episodes = document.querySelectorAll('.episode-card');
    if (episodes.length) {
      episodes.forEach(function (ep, i) {
        gsap.from(ep, {
          x: i % 2 === 0 ? -40 : 40,
          opacity: 0,
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: ep,
            start: 'top 85%',
            toggleActions: 'play none none none'
          }
        });
      });
    }

    // Platform buttons bounce-in
    var platformBtns = document.querySelectorAll('.platform-btn');
    if (platformBtns.length) {
      gsap.from(platformBtns, {
        scale: 0.6,
        opacity: 0,
        stagger: 0.08,
        duration: 0.5,
        ease: 'back.out(2)',
        scrollTrigger: {
          trigger: platformBtns[0].closest('.card') || platformBtns[0],
          start: 'top 82%',
          toggleActions: 'play none none none'
        }
      });
    }

    // ========================
    // S6-04: Horizontal Scroll Engine
    // ========================
    document.querySelectorAll('[data-hscroll]').forEach(function (container) {
      var track = container.querySelector('.hscroll-track');
      if (!track) return;

      mm.add('(min-width: 768px) and (pointer: fine)', function () {
        // Recalculate after layout settles
        ScrollTrigger.refresh();
        var scrollWidth = track.scrollWidth - container.offsetWidth;
        if (scrollWidth <= 0) return;

        gsap.to(track, {
          x: -scrollWidth,
          ease: 'none',
          scrollTrigger: {
            trigger: container,
            start: 'top top',
            end: function () { return '+=' + (scrollWidth * 1.5); },
            scrub: 0.6,
            pin: true,
            pinSpacing: true,
            anticipatePin: 1,
            onEnter: function () { container.classList.add('scrolling'); },
            onLeave: function () { container.classList.remove('scrolling'); }
          }
        });
      });
    });

    // ========================
    // S6-05: Counter Animations
    // ========================
    gsap.utils.toArray('.stat-counter').forEach(function (counter) {
      var target = parseInt(counter.getAttribute('data-target'), 10);
      if (isNaN(target) || target === 0) return;
      var suffix = counter.getAttribute('data-suffix') || '';
      var prefix = counter.getAttribute('data-prefix') || '';

      // Set initial display to 0
      counter.textContent = prefix + '0' + suffix;

      var obj = { val: 0 };
      var counterSection = counter.closest('section') || counter;
      var isAboveFold = counterSection.getBoundingClientRect().top < window.innerHeight;
      gsap.to(obj, {
        val: target,
        duration: 2.5,
        ease: 'power2.out',
        scrollTrigger: isAboveFold ? undefined : {
          trigger: counterSection,
          start: 'top 80%',
          toggleActions: 'play none none none'
        },
        delay: isAboveFold ? 0.8 : 0,
        onUpdate: function () {
          counter.textContent = prefix + Math.round(obj.val).toLocaleString() + suffix;
        }
      });
    });

    // ========================
    // S6-06: Atmospheric Section Parallax
    // ========================
    gsap.utils.toArray('.atmo-break').forEach(function (section) {
      var text = section.querySelector('.atmo-break-text');
      if (text) {
        gsap.from(text, {
          y: 60,
          opacity: 0,
          scale: 0.95,
          duration: 1.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            toggleActions: 'play none none none'
          }
        });
      }

      // Parallax the atmospheric gradient
      var pseudo = section;
      gsap.to(pseudo, {
        backgroundPositionY: '40%',
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });

    // ========================
    // S6-07: Staggered 3D Card Cascade
    // ========================
    gsap.utils.toArray('.cascade-3d-group').forEach(function (group) {
      var cards = group.querySelectorAll('.card, .card-spatial, .card-glass');
      if (!cards.length) return;

      gsap.from(cards, {
        y: 100,
        opacity: 0,
        rotateX: -15,
        scale: 0.9,
        stagger: 0.1,
        duration: 0.9,
        ease: 'power3.out',
        transformPerspective: 1200,
        scrollTrigger: {
          trigger: group,
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      });
    });

    // --- Parallax background elements ---
    gsap.utils.toArray('.parallax-bg').forEach(function (bg) {
      gsap.to(bg, {
        y: -80,
        ease: 'none',
        scrollTrigger: {
          trigger: bg.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });

    // ========================
    // CLEANUP
    // ========================
    ScrollTrigger.refresh();

    window.addEventListener('beforeunload', function () {
      ScrollTrigger.getAll().forEach(function (st) { st.kill(); });
    });
  });
})();
