(function () {
  'use strict';

  /* ── Nav scroll state + reading progress ──
     One rAF-throttled listener drives both. The progress fill is scaleX on a
     pre-painted bar, so scrolling never triggers layout. */
  var nav      = document.getElementById('nav');
  var progress = document.getElementById('scroll-progress-fill');
  var ticking  = false;

  function paintScroll() {
    ticking = false;
    var y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 20);

    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      progress.style.transform = 'scaleX(' + pct + ')';
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(paintScroll);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  paintScroll();

  /* ── Hamburger ── */
  var hamburger   = document.getElementById('hamburger');
  var mobileMenu  = document.getElementById('mobile-menu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      var open = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', open);
    });

    /* Close mobile menu on link click */
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', false);
      });
    });
  }

  /* ── Reveal on scroll ──
     Injected from JS so that with JS off, or with reduced motion on, nothing is
     ever left at opacity 0. Members of a group reveal in sequence: the delay is
     baked in as a custom property at setup time, not recomputed while scrolling. */
  if (document.documentElement.classList.contains('has-motion')) {
    var style = document.createElement('style');
    style.textContent =
      '.has-motion .reveal { opacity: 0; transform: translateY(var(--reveal-dist, 24px));' +
      ' transition: opacity var(--reveal-dur) var(--ease-out), transform var(--reveal-dur) var(--ease-out);' +
      ' transition-delay: var(--reveal-delay, 0ms); }' +
      '.has-motion .reveal.visible { opacity: 1; transform: none; }';
    document.head.appendChild(style);

    /* Each entry: [selector, per-item stagger in ms, travel distance]. Order
       within a group follows document order. */
    var GROUPS = [
      ['.hero-kicker, .hero-headline .hero-line, .hero-sub, .hero-actions, .hero-notice', 120, '16px'],
      ['.eco-card', 120, '24px'],
      ['.mind-hero-label, .mind-hero-title, .mind-hero-sub', 120, '20px'],
      ['.journal-copy, .journal-visual', 150, '24px'],
      ['.duo-card', 150, '24px'],
      ['.philosophy-title, .philosophy-body, .beliefs', 140, '24px'],
      ['.vision-item', 120, '24px'],
      ['.app-blurb', 90, '24px'],
      ['.app-phone-wrap', 0, '24px'],
      ['.mirror-item', 100, '26px'],
      ['.phase-card', 90, '26px'],
      ['.contact-block', 90, '24px']
    ];

    GROUPS.forEach(function (group) {
      document.querySelectorAll(group[0]).forEach(function (el, i) {
        el.classList.add('reveal');
        el.style.setProperty('--reveal-delay', i * group[1] + 'ms');
        el.style.setProperty('--reveal-dist', group[2]);
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('.reveal').forEach(function (el) {
      io.observe(el);
    });
  }

  /* ── The Mind sub-nav: mark the section in view ──
     Pure enhancement. Without IntersectionObserver the links still jump to the
     right place; they just never highlight. */
  var subLinks = document.querySelectorAll('.mind-subnav-links a');
  if (subLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    subLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        subLinks.forEach(function (a) {
          a.classList.remove('is-active');
          a.removeAttribute('aria-current');
        });
        var link = byId[e.target.id];
        if (link) {
          link.classList.add('is-active');
          link.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-35% 0px -60% 0px' });

    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }
})();

/* ── Waitlist ──
   Shared by the English and Arabic homepages. Copy for the busy and error
   states comes from data attributes so each page keeps its own language. */
(function () {
  'use strict';
  var form = document.getElementById('waitlist-form');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = document.getElementById('waitlist-submit');
    var label = btn.textContent;
    var errorMsg = form.dataset.error || 'Something went wrong. Please email us at hello@whitemirrorlabs.com';
    btn.textContent = form.dataset.busy || 'Submitting…';
    btn.disabled = true;

    var body = {
      name:  document.getElementById('wl-name').value.trim(),
      email: document.getElementById('wl-email').value.trim(),
      phone: document.getElementById('wl-phone').value.trim(),
      lang:  document.documentElement.lang === 'ar' ? 'ar' : 'en',
      source: window.location.pathname,
      company: (document.getElementById('wl-company') || {}).value || ''
    };

    try {
      var res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        if (window.va) window.va('event', { name: 'waitlist_signup', data: { lang: body.lang, page: body.source } });
        form.classList.add('hidden');
        document.getElementById('waitlist-success').classList.remove('hidden');
        return;
      }
    } catch (err) { /* fall through to the error state */ }

    btn.textContent = label;
    btn.disabled = false;
    alert(errorMsg);
  });
})();
