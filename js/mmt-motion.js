/**
 * MMT Motion Layer v1
 * Apple-principle motion: purposeful, physics-based, never decorative.
 */
(function () {
  'use strict';

  // 1. SCROLL PROGRESS BAR
  const bar = document.createElement('div');
  bar.id = 'mmt-progress';
  bar.style.cssText = 'position:fixed;top:0;left:0;height:2px;width:0%;background:linear-gradient(90deg,#00E5FA 0%,#00FF85 100%);z-index:9999;pointer-events:none;transition:width 0.1s linear;will-change:width';
  document.body.appendChild(bar);

  // 2. NAV SCROLL
  const nav = document.querySelector('nav');
  function updateNav() {
    if (!nav) return;
    if (window.scrollY > 48) {
      nav.style.background = 'rgba(0,5,15,0.94)';
      nav.style.backdropFilter = 'blur(28px) saturate(200%)';
      nav.style.webkitBackdropFilter = 'blur(28px) saturate(200%)';
      nav.style.borderBottomColor = 'rgba(255,255,255,0.1)';
    } else {
      nav.style.background = 'rgba(0,5,15,0.72)';
      nav.style.backdropFilter = 'blur(20px) saturate(180%)';
      nav.style.webkitBackdropFilter = 'blur(20px) saturate(180%)';
      nav.style.borderBottomColor = 'rgba(255,255,255,0.07)';
    }
  }

  // 3. PARALLAX
  const parallaxEls = document.querySelectorAll('[data-parallax]');
  function tickParallax(scrollY) {
    parallaxEls.forEach(el => {
      const speed = parseFloat(el.getAttribute('data-parallax')) || 0.15;
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      if (center > -window.innerHeight && center < window.innerHeight * 2) {
        el.style.transform = 'translateY(' + (scrollY * speed) + 'px)';
        el.style.willChange = 'transform';
      }
    });
  }

  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const total = document.body.scrollHeight - window.innerHeight;
    bar.style.width = total > 0 ? (scrolled / total * 100) + '%' : '0%';
    updateNav();
    tickParallax(scrolled);
  }, { passive: true });
  updateNav();

  // 4. REVEAL + STAGGER CSS
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    .mmt-reveal{opacity:0;transform:translateY(28px);transition:opacity 0.75s cubic-bezier(0.22,1,0.36,1),transform 0.75s cubic-bezier(0.22,1,0.36,1)}
    .mmt-reveal.mmt-visible{opacity:1;transform:none}
    .mmt-stagger>*{opacity:0;transform:translateY(20px);transition:opacity 0.6s cubic-bezier(0.22,1,0.36,1),transform 0.6s cubic-bezier(0.22,1,0.36,1)}
    .mmt-stagger.mmt-visible>*:nth-child(1){opacity:1;transform:none;transition-delay:0s}
    .mmt-stagger.mmt-visible>*:nth-child(2){opacity:1;transform:none;transition-delay:0.07s}
    .mmt-stagger.mmt-visible>*:nth-child(3){opacity:1;transform:none;transition-delay:0.14s}
    .mmt-stagger.mmt-visible>*:nth-child(4){opacity:1;transform:none;transition-delay:0.21s}
    .mmt-stagger.mmt-visible>*:nth-child(5){opacity:1;transform:none;transition-delay:0.28s}
    .mmt-stagger.mmt-visible>*:nth-child(6){opacity:1;transform:none;transition-delay:0.35s}
    .mmt-card{transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.35s cubic-bezier(0.22,1,0.36,1)}
    .mmt-card:hover{transform:translateY(-5px);box-shadow:0 20px 48px rgba(0,0,0,0.35),0 0 0 1px rgba(0,229,250,0.12)}
    .mmt-card:active{transform:translateY(-2px) scale(0.99)}
    .mmt-btn-primary,.mmt-btn-secondary{transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.3s cubic-bezier(0.22,1,0.36,1),opacity 0.2s}
    .mmt-btn-primary:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 12px 32px rgba(0,229,250,0.28);opacity:0.92}
    .mmt-btn-primary:active{transform:scale(0.97)}
    .mmt-btn-secondary:hover{transform:translateY(-3px);border-color:rgba(0,229,250,0.5)}
    .mmt-btn-secondary:active{transform:scale(0.97)}
    @keyframes mmtLogoGlow{from{filter:drop-shadow(0 0 8px rgba(0,229,250,0.45))}to{filter:drop-shadow(0 0 22px rgba(0,229,250,0.85)) drop-shadow(0 0 44px rgba(0,255,133,0.3))}}
    .mmt-logo-glow{animation:mmtLogoGlow 3s ease-in-out infinite alternate}
    @keyframes mmtPulse{0%{box-shadow:0 0 0 0 rgba(0,229,250,0.55)}70%{box-shadow:0 0 0 8px rgba(0,229,250,0)}100%{box-shadow:0 0 0 0 rgba(0,229,250,0)}}
    .mmt-pulse{animation:mmtPulse 2.5s ease-out infinite}
  `;
  document.head.appendChild(styleTag);

  // 5. INTERSECTION OBSERVER
  const revealObserver = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('mmt-visible'); revealObserver.unobserve(e.target); }
    }),
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.mmt-reveal, .mmt-stagger').forEach(el => revealObserver.observe(el));

  // 6. MOBILE DRAWER
  const hamburger = document.querySelector('[data-nav-toggle]');
  const mobileNav = document.querySelector('[data-nav-mobile]');
  if (hamburger && mobileNav) {
    const drawerStyle = document.createElement('style');
    drawerStyle.textContent = `
      [data-nav-mobile]{position:fixed;top:0;right:0;width:min(320px,85vw);height:100%;background:rgba(0,5,15,0.97);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-left:1px solid rgba(255,255,255,0.08);transform:translateX(100%);transition:transform 0.4s cubic-bezier(0.22,1,0.36,1);z-index:200;padding:5rem 2rem 2rem;display:flex;flex-direction:column;gap:0.25rem}
      [data-nav-mobile].open{transform:translateX(0)}
      .mmt-nav-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:199;opacity:0;pointer-events:none;transition:opacity 0.3s}
      .mmt-nav-overlay.open{opacity:1;pointer-events:all}
    `;
    document.head.appendChild(drawerStyle);
    const overlay = document.createElement('div');
    overlay.className = 'mmt-nav-overlay';
    document.body.appendChild(overlay);
    const close = () => { mobileNav.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; };
    const open  = () => { mobileNav.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; };
    hamburger.addEventListener('click', () => mobileNav.classList.contains('open') ? close() : open());
    overlay.addEventListener('click', close);
  }

})();
